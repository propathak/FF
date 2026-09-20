import { AuditForm } from '@/components/audit-form';
import { Card } from '@/components/ui/primitives';

export default function HomePage() {
  return (
    <>
      <Hero />
      <SignalStrip />
      <WhatWeCheck />
      <Faq />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden" id="audit">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-60"
        style={{
          background:
            'radial-gradient(ellipse 70% 100% at 50% 0%, var(--accent-soft), transparent 70%)',
        }}
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-3xl px-4 pb-16 pt-16 sm:pt-24">
        <p
          className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
          style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)' }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--status-good)' }} />
          SEO · AEO · GEO · AI answer visibility
        </p>
        <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
          Enter your website to see how visible your brand is across Google &amp; AI.
        </h1>
        <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Most brands are optimised for a search engine that is no longer the only one deciding
          whether customers find them. We measure both — and show you the evidence behind every
          number.
        </p>
        <div className="mt-8">
          <AuditForm />
        </div>
      </div>
    </section>
  );
}

function SignalStrip() {
  const items = [
    ['41', 'deterministic checks'],
    ['4', 'visibility pillars'],
    ['25', 'pages crawled per audit'],
    ['0', 'scores invented by an AI'],
  ];
  return (
    <section className="border-y" style={{ background: 'var(--surface-1)' }}>
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 py-8 sm:grid-cols-4">
        {items.map(([value, label]) => (
          <div key={label}>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const PILLARS = [
  {
    key: 'SEO',
    title: 'Can search engines find and rank you?',
    color: 'var(--series-1)',
    points: [
      'Indexability, robots.txt, sitemaps and canonicals',
      'Titles, headings, duplicate and thin content',
      'Core Web Vitals and mobile experience',
      'Structured data and internal linking',
    ],
  },
  {
    key: 'AEO',
    title: 'Can answer engines extract an answer?',
    color: 'var(--series-3)',
    points: [
      'Question-led headings with direct answer blocks',
      'FAQ and HowTo markup, and whether it matches the page',
      'Author attribution, dates and freshness',
      'The customer questions your site never answers',
    ],
  },
  {
    key: 'GEO',
    title: 'Can AI systems understand and trust you?',
    color: 'var(--series-2)',
    points: [
      'Entity strength — who you are, in machine-readable form',
      'Independent corroboration, weighted by source authority',
      'Whether your content is quotable and citable at all',
      'Whether AI retrieval crawlers can even reach you',
    ],
  },
];

function WhatWeCheck() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h2 className="text-2xl font-semibold tracking-tight">What we actually measure</h2>
      <p className="mt-2 max-w-2xl text-sm" style={{ color: 'var(--text-secondary)' }}>
        Every check returns an artefact — a URL, a quoted string, a count — that you can verify
        yourself. Nothing is asserted without one.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {PILLARS.map((pillar) => (
          <Card key={pillar.key}>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: pillar.color }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {pillar.key}
              </span>
            </div>
            <h3 className="mt-2 text-base font-medium leading-snug">{pillar.title}</h3>
            <ul className="mt-3 space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {pillar.points.map((point) => (
                <li key={point} className="flex gap-2">
                  <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>—</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  );
}

const FAQ = [
  {
    q: 'Can you really measure whether ChatGPT mentions my brand?',
    a: 'No — and neither can anyone else. No API reports what the ChatGPT app shows a user, so any tool giving you a "ChatGPT ranking" is inventing it. What we do measure: whether ChatGPT\'s retrieval crawlers can reach your site at all, whether your entity is machine-resolvable, whether your content is structurally citable, and — where you enable it — real sampled answers from engines that do expose an answers-and-citations API, always reported with the prompt set and sample count.',
  },
  {
    q: 'How is the score calculated?',
    a: 'From 41 deterministic checks, each with a weight, a confidence level and its own evidence. The full methodology — every check, its weight and its pass criteria — is published. An AI writes the explanations; it never produces a number.',
  },
  {
    q: 'What happens if you cannot measure something?',
    a: 'The report says "not measured" and explains why, and that signal is removed from both sides of the scoring fraction so it cannot drag your score down. We would rather show you a gap than fill it with a guess.',
  },
  {
    q: 'Do I need to give you access to anything?',
    a: 'No. We only read what is publicly available, we honour your robots.txt, and we identify ourselves with a contactable user agent.',
  },
];

function Faq() {
  return (
    <section className="border-t" style={{ background: 'var(--surface-1)' }}>
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Straight answers</h2>
        <div className="mt-6 divide-y">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-medium">
                {item.q}
                <span
                  className="mt-1 shrink-0 transition-transform group-open:rotate-45"
                  style={{ color: 'var(--text-muted)' }}
                  aria-hidden="true"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14">
                    <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
