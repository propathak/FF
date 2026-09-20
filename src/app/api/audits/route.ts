import { NextResponse, after } from 'next/server';
import { auth } from '@/auth';
import { z } from 'zod';
import { normaliseInputUrl } from '@/engine/util/url';
import { envNumber } from '@/engine/util/env';
import { getRepository, isEphemeralInProduction } from '@/lib/repository';
import { createAuditRecord, executeAudit, hashIp, newAuditId } from '@/lib/audit-runner';

export const runtime = 'nodejs';
// A full audit can exceed the default ceiling on slow origins. Stage
// checkpointing means an overrun is resumable rather than fatal.
export const maxDuration = 300;

const RequestSchema = z.object({
  url: z.string().min(3).max(2048),
  market: z.enum(['global', 'us', 'in', 'uk', 'ae', 'au', 'ca', 'sg']).default('global'),
  competitorUrls: z.array(z.string().max(2048)).max(3).default([]),
});

/**
 * Every failure has to come back as JSON.
 *
 * An uncaught throw makes Next answer with an HTML error page, and the
 * browser then fails to parse it -- which the form reported as "Network
 * problem", sending people to check their wifi over a missing database
 * table. The wrapper keeps the contract: a body with an `error` string,
 * always.
 */
export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/audits] unhandled failure', err);

    // The one failure an operator can act on themselves, and the most likely
    // one on a fresh deployment: the database is connected but empty.
    if (/relation .* does not exist|no schema has been selected/i.test(message)) {
      return NextResponse.json(
        {
          error:
            'The database is connected but has no tables yet. Open /admin and run the one-click schema setup, then try again.',
          code: 'schema_missing',
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: `Could not start the audit: ${message}`, code: 'server_error' },
      { status: 500 },
    );
  }
}

async function handlePost(request: Request) {
  // Identity comes from the session, never from the request body — a
  // self-reported email would make the audit log worthless.
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json(
      { error: 'Please sign in to run an audit.', code: 'unauthenticated' },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please provide a valid website address.', details: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const allowLocal = process.env['AUDIT_ALLOW_LOCAL'] === '1';
  const normalised = normaliseInputUrl(parsed.data.url, { allowLocal });
  if (!normalised) {
    return NextResponse.json(
      { error: `"${parsed.data.url}" does not look like a public website address.` },
      { status: 400 },
    );
  }

  // Refuse rather than accept an audit we know we will lose. See
  // isEphemeralInProduction() — without a database, the poll can hit a
  // different instance than the write and 404 on a perfectly good audit.
  if (isEphemeralInProduction()) {
    return NextResponse.json(
      {
        error:
          'This deployment has no database configured, so audits cannot be stored reliably. Set DATABASE_URL (any Postgres provider) or SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY in the project environment variables, then redeploy.',
      },
      { status: 503 },
    );
  }

  const repo = getRepository();
  const host = new URL(normalised).hostname;

  // Two limits: per-domain stops audit-farming a competitor, per-IP stops a
  // single client burning the API budget. Both are cost controls first.
  // envNumber, not Number(... ?? 3): a key that exists but is blank -- which
  // is what importing a .env.example into Vercel produces -- parsed to 0 and
  // refused every audit with "already been audited 0 times today".
  const perDomain = envNumber(process.env, 'AUDITS_PER_DOMAIN_PER_DAY', 3);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const ipKey = await hashIp(ip);

  const [domainOk, ipOk, userOk] = await Promise.all([
    repo.consumeRateLimit('audit:domain', host, perDomain, 24 * 60 * 60 * 1000),
    repo.consumeRateLimit('audit:ip', ipKey, 10, 60 * 60 * 1000),
    // Signed-in identity is the most reliable key we have, so it carries the
    // real quota; the IP and domain limits are now just backstops.
    repo.consumeRateLimit('audit:user', email.toLowerCase(), 20, 24 * 60 * 60 * 1000),
  ]);
  if (!domainOk) {
    return NextResponse.json(
      { error: `${host} has already been audited ${perDomain} times today. Please try again tomorrow.` },
      { status: 429 },
    );
  }
  if (!userOk) {
    return NextResponse.json(
      { error: 'You have reached the daily audit limit for this account. It resets in 24 hours.' },
      { status: 429 },
    );
  }
  if (!ipOk) {
    return NextResponse.json({ error: 'Too many audits from this connection. Please try again later.' }, { status: 429 });
  }

  const auditId = newAuditId();
  const input = {
    url: normalised,
    email,
    market: parsed.data.market,
    competitorUrls: parsed.data.competitorUrls.filter(Boolean),
    // Free tier by default; paid enrichment is unlocked by the lead form.
    enablePaidEnrichment: false,
  };

  try {
    await createAuditRecord(input, auditId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not start the audit.' },
      { status: 400 },
    );
  }

  // Continue after the response flushes so the browser can start polling
  // immediately and render stage progress instead of a blank spinner.
  after(async () => {
    await executeAudit(auditId, input);
  });

  return NextResponse.json({ id: auditId, host, status: 'queued' }, { status: 202 });
}
