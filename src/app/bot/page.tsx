import type { Metadata } from 'next';
import { CRAWL_DEFAULTS } from '@/engine/config';
import { Card, SectionHeading } from '@/components/ui/primitives';

export const metadata: Metadata = {
  title: 'IndexJoyBot',
  description:
    'IndexJoyBot is the crawler behind Index Joy visibility audits. What it fetches, how often, and how to block it.',
};

/**
 * The crawler's user agent points here, so this page has to exist and has to
 * answer the questions a sysadmin actually has when they see us in their logs.
 * A bot whose contact URL 404s is one that gets blocked.
 */
export default function BotPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 pb-24 pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">IndexJoyBot</h1>
      <p className="mt-3 text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        IndexJoyBot fetches publicly available pages so that a site owner can see how visible their
        brand is across search engines and AI answer engines. It runs only when somebody requests an
        audit. It does not crawl continuously, and it does not train any model on what it reads.
      </p>

      <Card className="mt-8">
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          User agent string
        </p>
        <code className="mt-2 block break-all text-sm">{CRAWL_DEFAULTS.userAgent}</code>
      </Card>

      <div className="mt-12 space-y-12">
        <section>
          <SectionHeading title="What it does" />
          <ul className="space-y-2.5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <li>Requests <code>/robots.txt</code> first and obeys it, including any crawl delay.</li>
            <li>
              Fetches at most {CRAWL_DEFAULTS.maxPages} HTML pages per audit, no more than{' '}
              {CRAWL_DEFAULTS.concurrency} at a time, with a {CRAWL_DEFAULTS.pageTimeoutMs / 1000}-second
              timeout and a {CRAWL_DEFAULTS.maxBodyBytes / 1_000_000}MB response cap.
            </li>
            <li>Reads only HTML. It does not fetch images, media, stylesheets or scripts.</li>
            <li>Does not execute JavaScript, submit forms, or follow links behind a login.</li>
            <li>Sends <code>GET</code> and <code>HEAD</code> requests only. It never writes anything.</li>
          </ul>
        </section>

        <section>
          <SectionHeading title="How to block it" />
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Add this to your <code>robots.txt</code>. We honour it on the next request, with no
            appeal and no workaround:
          </p>
          <pre
            className="mt-3 overflow-x-auto rounded-lg border p-4 text-sm"
            style={{ background: 'var(--surface-2)' }}
          >
            <code>{'User-agent: IndexJoyBot\nDisallow: /'}</code>
          </pre>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Blocking IndexJoyBot has no effect on how any search engine or AI assistant sees your
            site. It only means we cannot produce an audit for you.
          </p>
        </section>

        <section>
          <SectionHeading title="Contact" />
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            If IndexJoyBot is causing load or behaving unexpectedly, email{' '}
            <a href="mailto:crawler@indexjoy.com" className="underline underline-offset-2">
              crawler@indexjoy.com
            </a>{' '}
            with the timestamps and we will investigate. Include your domain and we can add it to a
            permanent skip list.
          </p>
        </section>
      </div>
    </article>
  );
}
