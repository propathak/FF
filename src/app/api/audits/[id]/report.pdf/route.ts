import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/admin';
import { appUrl } from '@/lib/app-url';
import { getRepository } from '@/lib/repository';
import { renderReportPdf } from '@/lib/report-pdf';

/**
 * The report as a downloadable PDF.
 *
 * Generated on request rather than stored: a report is a pure function of the
 * audit result, so caching a file would only create a second copy to keep in
 * step with the scoring version. Rendering takes well under a second because
 * it lays out text directly instead of driving a browser.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return new Response('Please sign in.', { status: 401 });
  }

  const repo = getRepository();
  const audit = await repo.getAudit(id);

  // Same ownership rule as the JSON route, and the same 404 for a report that
  // exists but is not yours: a report names a real company's weaknesses, and a
  // 403 would confirm the id is real.
  const owns = audit?.requester_email?.toLowerCase() === email.toLowerCase();
  if (!audit || (!owns && !isAdminEmail(email))) {
    return new Response('Audit not found.', { status: 404 });
  }
  if (audit.status !== 'complete' || !audit.result) {
    return new Response('This audit has not finished yet.', { status: 409 });
  }

  const pdf = await renderReportPdf(audit.result, {
    agencyName: process.env['NEXT_PUBLIC_AGENCY_NAME'] ?? 'Index Joy',
    appUrl: appUrl(),
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(pdf.byteLength),
      // A filename the recipient can recognise a week later in a downloads
      // folder full of report.pdf.
      'content-disposition': `attachment; filename="${filename(audit.host, audit.created_at)}"`,
      'cache-control': 'no-store',
    },
  });
}

function filename(host: string, createdAt: string | Date): string {
  const date = new Date(createdAt);
  const day = Number.isNaN(date.getTime()) ? '' : `-${date.toISOString().slice(0, 10)}`;
  const safe = host.replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '-');
  return `${safe}${day}-visibility-report.pdf`;
}
