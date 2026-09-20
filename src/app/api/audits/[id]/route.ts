import { NextResponse } from 'next/server';
import { getRepository } from '@/lib/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const repo = getRepository();
  const audit = await repo.getAudit(id);

  if (!audit) {
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
      // The full result is only attached once the audit is complete, so a
      // half-finished pipeline can never be mistaken for a finished report.
      result: audit.status === 'complete' ? audit.result : null,
      storage: repo.driver,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
