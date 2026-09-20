import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { normaliseInputUrl } from '@/engine/util/url';
import { getRepository, isEphemeralInProduction } from '@/lib/repository';
import { createAuditRecord, executeAudit, hashIp, newAuditId } from '@/lib/audit-runner';

export const runtime = 'nodejs';
// A full audit can exceed the default ceiling on slow origins. Stage
// checkpointing means an overrun is resumable rather than fatal.
export const maxDuration = 300;

const RequestSchema = z.object({
  url: z.string().min(3).max(2048),
  email: z.string().email().max(320).optional().or(z.literal('')),
  market: z.enum(['global', 'us', 'in', 'uk', 'ae', 'au', 'ca', 'sg']).default('global'),
  competitorUrls: z.array(z.string().max(2048)).max(3).default([]),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please provide a valid website address and email.', details: parsed.error.issues.map((i) => i.message) },
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
  const perDomain = Number(process.env['AUDITS_PER_DOMAIN_PER_DAY'] ?? 3);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const ipKey = await hashIp(ip);

  const [domainOk, ipOk] = await Promise.all([
    repo.consumeRateLimit('audit:domain', host, perDomain, 24 * 60 * 60 * 1000),
    repo.consumeRateLimit('audit:ip', ipKey, 10, 60 * 60 * 1000),
  ]);
  if (!domainOk) {
    return NextResponse.json(
      { error: `${host} has already been audited ${perDomain} times today. Please try again tomorrow.` },
      { status: 429 },
    );
  }
  if (!ipOk) {
    return NextResponse.json({ error: 'Too many audits from this connection. Please try again later.' }, { status: 429 });
  }

  const auditId = newAuditId();
  const input = {
    url: normalised,
    email: parsed.data.email || undefined,
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
