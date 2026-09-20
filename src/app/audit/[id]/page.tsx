import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { ReportView } from '@/components/report/report-view';

export const metadata: Metadata = {
  title: 'Your visibility report',
  // Reports are per-person; keep them out of the index.
  robots: { index: false, follow: false },
};

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.email) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/audit/${id}`)}`);
  }
  return <ReportView auditId={id} bookingUrl={process.env['NEXT_PUBLIC_BOOKING_URL'] ?? null} />;
}
