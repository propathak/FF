import { Button, Card, SectionHeading } from '@/components/ui/primitives';

/**
 * The single call to action at the end of every report.
 *
 * There is deliberately no gate in front of it. Identity is captured at
 * sign-in, so blurring the roadmap afterwards would ask the same person for
 * the same thing twice — friction that buys nothing. The report earns the
 * call by being complete and verifiable, not by withholding half of itself.
 */
export function BookingCta({ bookingUrl }: { bookingUrl: string | null }) {
  return (
    <section className="no-print">
      <Card className="text-center">
        <SectionHeading title="Book a free 30-minute visibility strategy session" />
        <p
          className="mx-auto -mt-2 max-w-xl text-sm leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          We will walk through this report, show you what the competitor gap actually costs in
          pipeline, and give you the sequenced plan — whether or not you work with us.
        </p>
        {bookingUrl ? (
          <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-block">
            <Button size="lg">Choose a time</Button>
          </a>
        ) : (
          <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            Set <code>NEXT_PUBLIC_BOOKING_URL</code> to embed your Cal.com or Calendly link here.
          </p>
        )}
      </Card>
    </section>
  );
}
