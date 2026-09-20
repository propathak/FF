import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/admin';
import { getRepository } from '@/lib/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: 'Please sign in.', code: 'unauthenticated' }, { status: 401 });
  }

  const repo = getRepository();
  const audit = await repo.getAudit(id);
  if (!audit) {
    return NextResponse.json({ error: 'Audit not found.' }, { status: 404 });
  }

  // A report names a real company's weaknesses, so it belongs to whoever ran
  // it. Returning 404 rather than 403 avoids confirming that an id exists.
  const owns = audit.requester_email?.toLowerCase() === email.toLowerCase();
  if (!owns && !isAdminEmail(email)) {
    return NextResponse.json({ error: 'Audit not found.' }, { status: 404 });
  }

  const stages = await repo.getStages(id);

  return NextResponse.json(
    {
      id: audit.id,
      status: audit.status,
      host: audit.host,
      market: audit.market,
      error: audit.error,
      stages,
      // Attached only once complete, so a half-finished pipeline can never be
      // mistaken for a finished report.
      result: audit.status === 'complete' ? audit.result : null,
      storage: repo.driver,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
