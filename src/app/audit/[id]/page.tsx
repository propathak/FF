import type { Metadata } from 'next';
import { ReportView } from '@/components/report/report-view';

export const metadata: Metadata = {
  title: 'Your visibility report',
  // Individual reports are unguessable but public; keep them out of the index.
  robots: { index: false, follow: false },
};

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReportView auditId={id} />;
}
