import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FixtureRoute {
  path: string;
  status?: number;
  contentType?: string;
  body: string;
}

export interface FixtureServer {
  origin: string;
  close: () => Promise<void>;
}

export async function startFixtureServer(routes: FixtureRoute[]): Promise<FixtureServer> {
  const byPath = new Map(routes.map((r) => [r.path, r]));
  const server = http.createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    const route = byPath.get(path) ?? byPath.get(path.replace(/\/$/, '')) ?? null;
    if (!route) {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<html><body><h1>Not found</h1></body></html>');
      return;
    }
    res.writeHead(route.status ?? 200, { 'content-type': route.contentType ?? 'text/html; charset=utf-8' });
    res.end(route.body);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const FILLER = (topic: string, n: number): string =>
  Array.from({ length: n }, (_, i) =>
    `<p>${topic} teams evaluate ${topic} platforms on reliability, cost and support before they commit to a vendor for the next budget cycle. Independent benchmarks published in 2026 put median deployment time at ${8 + i} working days across ${120 + i * 7} surveyed organisations.</p>`,
  ).join('\n');

/**
 * A well-optimised site: server-rendered content, complete entity markup,
 * question-led headings with direct answers, comparison and research content.
 */
export function goodSite(): FixtureRoute[] {
  const orgSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': 'https://acme.example/#organization',
    name: 'Acme Analytics',
    legalName: 'Acme Analytics Limited',
    url: 'https://acme.example',
    logo: 'https://acme.example/logo.png',
    description: 'Acme Analytics is a product analytics platform for B2B software teams.',
    foundingDate: '2019-03-01',
    founder: { '@type': 'Person', name: 'Rhea Kapoor' },
    numberOfEmployees: 84,
    address: { '@type': 'PostalAddress', addressLocality: 'Bengaluru', addressCountry: 'IN' },
    contactPoint: { '@type': 'ContactPoint', contactType: 'sales', email: 'sales@acme.example' },
    sameAs: [
      'https://www.linkedin.com/company/acme-analytics',
      'https://www.crunchbase.com/organization/acme-analytics',
      'https://github.com/acme-analytics',
      'https://www.youtube.com/@acmeanalytics',
      'https://en.wikipedia.org/wiki/Acme_Analytics',
    ],
  });

  const head = (title: string, description: string, extraSchema = '') => `
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <meta name="description" content="${description}">
      <link rel="canonical" href="/${title === 'Acme Analytics — product analytics for B2B software teams' ? '' : ''}">
      <meta property="og:site_name" content="Acme Analytics">
      <meta property="og:description" content="${description}">
      <script type="application/ld+json">${orgSchema}</script>
      ${extraSchema}
    </head>`;

  const nav = `<nav><a href="/">Home</a> <a href="/pricing">Pricing</a> <a href="/compare/acme-vs-northwind">Acme vs Northwind</a> <a href="/guides/what-is-product-analytics">What is product analytics</a> <a href="/research/2026-benchmark">2026 benchmark</a> <a href="/about">About</a> <a href="/contact">Contact</a></nav>`;

  return [
    {
      path: '/robots.txt',
      contentType: 'text/plain',
      body: [
        'User-agent: *', 'Allow: /', '',
        'User-agent: GPTBot', 'Disallow: /', '',
        'User-agent: OAI-SearchBot', 'Allow: /', '',
        'Sitemap: /sitemap.xml',
      ].join('\n'),
    },
    {
      path: '/sitemap.xml',
      contentType: 'application/xml',
      body: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        ${['/', '/pricing', '/compare/acme-vs-northwind', '/guides/what-is-product-analytics', '/research/2026-benchmark', '/about', '/contact']
          .map((p) => `<url><loc>http://127.0.0.1/${p.replace(/^\//, '')}</loc><lastmod>2026-08-01</lastmod></url>`).join('')}
      </urlset>`,
    },
    { path: '/llms.txt', contentType: 'text/plain', body: '# Acme Analytics\n\n## Docs\n- /guides/what-is-product-analytics\n' },
    {
      path: '/',
      body: `<!doctype html><html lang="en">${head('Acme Analytics — product analytics for B2B software teams', 'Acme Analytics is a product analytics platform for B2B software teams. See feature adoption, retention and revenue impact in one place.')}
      <body><main><h1>Product analytics for B2B software teams</h1>
      ${nav}
      <h2>What does Acme Analytics do?</h2>
      <p>Acme Analytics is a product analytics platform that connects feature usage to revenue for B2B software teams, so product managers can see which features retain paying accounts.</p>
      <h2>Who is Acme Analytics for?</h2>
      <p>Acme Analytics is built for product and growth teams at B2B software companies with between 50 and 5,000 paying accounts who need account-level rather than user-level analytics.</p>
      <h2>How much does Acme Analytics cost?</h2>
      <p>Pricing starts at 499 dollars per month for up to 100,000 tracked events, and scales by event volume rather than seat count so whole teams can use it.</p>
      <ul><li>Account-level retention</li><li>Revenue attribution</li><li>Warehouse sync</li></ul>
      <table><tr><th>Plan</th><th>Events</th></tr><tr><td>Team</td><td>100k</td></tr></table>
      ${FILLER('product analytics', 8)}
      <img src="/a.png" alt="Retention dashboard"><img src="/b.png" alt="Revenue attribution chart">
      <p>See our <a href="https://example.org/benchmark">independent benchmark methodology</a>.</p>
      </main></body></html>`,
    },
    {
      path: '/pricing',
      body: `<!doctype html><html lang="en">${head('Pricing — Acme Analytics', 'Acme Analytics pricing starts at 499 dollars per month and scales by tracked event volume, not by seat.')}
      <body><main><h1>Acme Analytics pricing</h1>${nav}
      <h2>How is Acme Analytics priced?</h2>
      <p>Acme Analytics is priced on tracked event volume rather than seats, starting at 499 dollars per month for 100,000 events and rising in bands from there.</p>
      <h2>Is there a free trial?</h2>
      <p>Yes. Every plan includes a 14 day trial with the full feature set and no card required, and unused trial data is retained for 30 days afterwards.</p>
      ${FILLER('pricing', 6)}
      <a href="/contact">Talk to sales</a></main></body></html>`,
    },
    {
      path: '/compare/acme-vs-northwind',
      body: `<!doctype html><html lang="en">${head('Acme vs Northwind — an honest comparison', 'A detailed comparison of Acme Analytics and Northwind Metrics across pricing, data model, warehouse sync and support.')}
      <body><main><h1>Acme Analytics vs Northwind Metrics</h1>${nav}
      <h2>What is the main difference between Acme and Northwind?</h2>
      <p>Acme models data at the account level while Northwind models it at the individual user level, which makes Acme a better fit for B2B teams and Northwind a better fit for consumer apps.</p>
      <h2>Which is cheaper for a 200-person company?</h2>
      <p>Northwind is typically cheaper below 50,000 monthly events, while Acme becomes cheaper above roughly 250,000 events because it does not charge per seat.</p>
      <table><tr><th>Feature</th><th>Acme</th><th>Northwind</th></tr><tr><td>Account-level</td><td>Yes</td><td>No</td></tr></table>
      ${FILLER('comparison', 7)}</main></body></html>`,
    },
    {
      path: '/guides/what-is-product-analytics',
      body: `<!doctype html><html lang="en">${head('What is product analytics? A 2026 guide', 'Product analytics is the practice of measuring how people use a software product in order to improve retention and revenue.',
        `<script type="application/ld+json">${JSON.stringify({
          '@context': 'https://schema.org', '@type': 'Article',
          '@id': 'https://acme.example/guides/what-is-product-analytics#article',
          headline: 'What is product analytics?',
          datePublished: '2026-06-01', dateModified: '2026-08-15',
          author: { '@type': 'Person', name: 'Rhea Kapoor', sameAs: 'https://www.linkedin.com/in/rheakapoor' },
          publisher: { '@id': 'https://acme.example/#organization' },
        })}</script>
        <script type="application/ld+json">${JSON.stringify({
          '@context': 'https://schema.org', '@type': 'FAQPage',
          mainEntity: [{
            '@type': 'Question', name: 'What is product analytics?',
            acceptedAnswer: { '@type': 'Answer', text: 'Product analytics is the practice of measuring how people use a software product in order to improve retention and revenue.' },
          }],
        })}</script>`)}
      <body><main><article><h1>What is product analytics?</h1>${nav}
      <p>By <span class="author">Rhea Kapoor</span> — <time datetime="2026-08-15">15 August 2026</time></p>
      <h2>What is product analytics?</h2>
      <p>Product analytics is the practice of measuring how people use a software product in order to improve retention and revenue.</p>
      <h2>How is it different from web analytics?</h2>
      <p>Web analytics measures visits to pages, while product analytics measures actions inside a product and ties those actions to accounts and revenue over time.</p>
      <h3>Why does it matter for B2B teams?</h3>
      <p>B2B renewal decisions are made by accounts rather than individuals, so measuring adoption at the account level predicts churn roughly 40 percent earlier than user-level measurement.</p>
      <blockquote>"Account-level adoption is the single best leading indicator of B2B renewal." — Rhea Kapoor</blockquote>
      <ol><li>Instrument key events</li><li>Group by account</li><li>Correlate with renewals</li></ol>
      ${FILLER('product analytics', 10)}
      <p>Source: <a href="https://example.org/study">2026 SaaS retention study</a>.</p>
      </article></main></body></html>`,
    },
    {
      path: '/research/2026-benchmark',
      body: `<!doctype html><html lang="en">${head('2026 B2B product analytics benchmark', 'Original research covering 412 B2B software companies, measuring feature adoption, activation time and renewal rates.')}
      <body><main><article><h1>2026 B2B product analytics benchmark</h1>${nav}
      <p>By <span class="author">Rhea Kapoor</span> — <time datetime="2026-07-10">10 July 2026</time></p>
      <h2>What did the research find?</h2>
      <p>Across 412 surveyed B2B software companies, median activation time was 11 working days and accounts that adopted three or more features renewed at 92 percent.</p>
      ${FILLER('benchmark research', 9)}</article></main></body></html>`,
    },
    {
      path: '/about',
      body: `<!doctype html><html lang="en">${head('About Acme Analytics', 'Acme Analytics was founded in 2019 in Bengaluru and employs 84 people across product, engineering and support.',
        `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Person', name: 'Rhea Kapoor', jobTitle: 'Founder', sameAs: ['https://www.linkedin.com/in/rheakapoor'] })}</script>`)}
      <body><main><h1>About Acme Analytics</h1>${nav}
      <h2>Who founded Acme Analytics?</h2>
      <p>Acme Analytics was founded in 2019 by Rhea Kapoor, previously a product lead at two B2B analytics companies, and is headquartered in Bengaluru.</p>
      ${FILLER('company', 5)}</main></body></html>`,
    },
    {
      path: '/contact',
      body: `<!doctype html><html lang="en">${head('Contact Acme Analytics', 'Contact the Acme Analytics sales and support teams in Bengaluru by email or phone.')}
      <body><main><h1>Contact us</h1>${nav}
      <h2>How do I contact support?</h2>
      <p>Support is available by email at support@acme.example between 9am and 9pm India Standard Time on working days, with a four hour first response target.</p>
      ${FILLER('contact', 4)}</main></body></html>`,
    },
  ];
}

/**
 * A poorly-optimised site: blocks AI retrieval crawlers, no structured data,
 * duplicate titles, no question structure, thin content, no sitemap.
 */
export function poorSite(): FixtureRoute[] {
  const page = (slug: string) => ({
    path: slug,
    body: `<!doctype html><html><head><title>Welcome</title></head>
      <body><div id="root">
      <h2>Solutions</h2><h2>Solutions</h2>
      <p>We are a leading provider of innovative solutions that leverage synergy to deliver value.</p>
      <a href="/one">One</a><a href="/two">Two</a><a href="/three">Three</a>
      <img src="/x.png">
      </div></body></html>`,
  });
  return [
    {
      path: '/robots.txt',
      contentType: 'text/plain',
      // The common "block all AI" mistake: this also removes the site from
      // AI answers entirely, not just from training data.
      body: ['User-agent: GPTBot', 'Disallow: /', '', 'User-agent: OAI-SearchBot', 'Disallow: /', '',
             'User-agent: PerplexityBot', 'Disallow: /', '', 'User-agent: Claude-SearchBot', 'Disallow: /', '',
             'User-agent: ClaudeBot', 'Disallow: /'].join('\n'),
    },
    page('/'), page('/one'), page('/two'), page('/three'),
  ];
}
