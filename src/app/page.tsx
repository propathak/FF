import { auth } from '@/auth';
import { AuditForm } from '@/components/audit-form';
import { Card } from '@/components/ui/primitives';
import { ReportPreview } from '@/components/landing/report-preview';
import { RotatingPrompt } from '@/components/landing/rotating-prompt';
import { Reveal } from '@/components/landing/reveal';
import { SHOWCASE_CHECKS } from '@/components/landing/showcase-checks';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const [{ url }, session] = await Promise.all([searchParams, auth()]);
  const signedIn = Boolean(session?.user?.email);

  return (
    <>
      <Hero signedIn={signedIn} initialUrl={url ?? ''} />
      <MethodStrip />
      <WhatWeCheck />
      <Honesty />
      <HowItWorks />
      <Faq />
    </>
  );
}

// ---------------------------------------------------------------------------

function Hero({ signedIn, initialUrl }: { signedIn: boolean; initialUrl: string }) {
  return (
    <section className="relative overflow-hidden" id="audit">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-70"
        style={{
          background: 'radial-gradient(ellipse 80% 100% at 30% 0%, var(--accent-soft), transparent 68%)',
        }}
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 sm:pt-16">
        <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div>
            <p
              className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
              style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)' }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                  style={{ background: 'var(--status-good)' }}
                />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: 'var(--status-good)' }} />
              </span>
              41 checks across SEO · AEO · GEO
            </p>

            <h1 className="text-balance text-[2rem] font-semibold leading-[1.1] tracking-tight sm:text-[2.7rem]">
              Your customers are asking AI.
              <br />
              Are you in the answer?
            </h1>

            <p className="mt-5 text-pretty text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Right now someone is asking an assistant <RotatingPrompt /> — and it is naming three
              brands. We show you whether yours is one of them, and exactly what is stopping it.
            </p>

            <div className="mt-7">
              <AuditForm signedIn={signedIn} initialUrl={initialUrl} />
            </div>
          </div>

          <Reveal className="lg:pt-10">
            <ReportPreview />
            <p className="mt-3 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              A real report, on an example site. Every score opens to show its evidence.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const METHOD = [
  ['41', 'checks, each with its own evidence'],
  ['25', 'pages crawled and compared'],
  ['4', 'pillars: SEO, AEO, GEO, AI presence'],
  ['0', 'numbers invented by an AI'],
];

function MethodStrip() {
  return (
    <section className="border-y" style={{ background: 'var(--surface-1)' }}>
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 py-9 sm:grid-cols-4">
        {METHOD.map(([value, label], i) => (
          <Reveal key={label} delay={i * 60}>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
            <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
              {label}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const PILLAR_TONE: Record<string, string> = {
  SEO: 'var(--series-1)',
  AEO: 'var(--series-3)',
  GEO: 'var(--series-2)',
};

function WhatWeCheck() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <Reveal>
        <h2 className="max-w-2xl text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          Twelve of the forty-one things we look at
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Named exactly as your report names them. Each one returns an artefact — a URL, a quoted
          string, a count — so you can check our working rather than take our word for it.
        </p>
      </Reveal>

      <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SHOWCASE_CHECKS.map((check, i) => (
          <Reveal key={check.id} delay={(i % 3) * 70}>
            <div
              className="group h-full rounded-xl border p-4 transition-colors"
              style={{ background: 'var(--surface-1)' }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ background: PILLAR_TONE[check.pillar] }}
                  aria-hidden="true"
                />
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {check.pillar}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium leading-snug">{check.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {check.detail}
              </p>
              <code className="mt-2.5 block text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {check.id}
              </code>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Honesty() {
  return (
    <section className="border-y" style={{ background: 'var(--surface-1)' }}>
      <div className="mx-auto max-w-5xl px-4 py-20">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            The part other tools leave out
          </p>
          <h2 className="mt-3 max-w-2xl text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            We will never sell you a &ldquo;ChatGPT ranking&rdquo;
          </h2>
        </Reveal>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <Reveal>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              No API — from OpenAI or anyone else — reports what the ChatGPT app shows a given user
              for a given prompt. So any tool handing you a ChatGPT rank is generating it. Ask them
              which API produced the number; there isn&apos;t one.
            </p>
            <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Answers also change between identical runs, and the universe of prompts is infinite —
              so a share-of-voice percentage means nothing without its prompt set and sample count
              printed beside it. Ours always carries both.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <div className="rounded-xl border p-5" style={{ background: 'var(--surface-0)' }}>
              <p className="text-sm font-medium">What we measure instead</p>
              <ul className="mt-3 space-y-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {[
                  'Whether AI retrieval crawlers can reach you at all',
                  'Whether your brand is machine-resolvable as an entity',
                  'Whether your content is structurally extractable',
                  'Whether independent sources corroborate your claims',
                  'Whether you appear in Google AI Overviews for your category',
                ].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span className="mt-1.5 shrink-0" style={{ color: 'var(--status-good)' }} aria-hidden="true">
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6.5 5 9l4.5-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Four of those five are free and certain — and they are the ones you can act on.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const STEPS = [
  {
    n: '01',
    title: 'Enter your website',
    body: 'Sign in with Google so your reports stay together. No card, no sales call to see results.',
  },
  {
    n: '02',
    title: 'We crawl and check',
    body: 'Up to 25 pages, robots.txt honoured, a contactable crawler. Around 45 seconds, with the findings appearing as they land.',
  },
  {
    n: '03',
    title: 'You get evidence, not adjectives',
    body: 'Every score opens to the artefact behind it. Anything we could not measure says so instead of being estimated.',
  },
];

function HowItWorks() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-20">
      <Reveal>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
      </Reveal>
      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <Reveal key={step.n} delay={i * 80}>
            <p className="text-xs font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
              {step.n}
            </p>
            <p className="mt-2 font-medium">{step.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {step.body}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const FAQ = [
  {
    q: 'How is the score calculated?',
    a: 'From 41 deterministic checks, each with a weight, a confidence level and its own evidence. An AI writes the explanations; it never produces a number. The full methodology — every check, its weight, its pass criteria — is published.',
  },
  {
    q: 'What happens if you cannot measure something?',
    a: 'The report says "not measured" and explains why, and that signal is removed from both sides of the scoring fraction so it cannot drag your score down. We would rather show you a gap than fill it with a guess.',
  },
  {
    q: 'Do I need to give you access to anything?',
    a: 'No. We read only what is publicly available, we honour your robots.txt, and our crawler identifies itself with a contactable address. Signing in with Google gives us your name and email — never your Gmail, Drive or contacts.',
  },
  {
    q: 'What is AEO and GEO?',
    a: 'AEO is answer engine optimisation: whether a machine can lift a clean, attributable answer off your page. GEO is generative engine optimisation: whether AI systems can understand, verify and cite your brand at all. Most sites are built for neither, because neither existed when they were built.',
  },
];

function Faq() {
  return (
    <section className="border-t" style={{ background: 'var(--surface-1)' }}>
      <div className="mx-auto max-w-3xl px-4 py-20">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Straight answers</h2>
        </Reveal>
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
        <Reveal>
          <Card className="mt-10 text-center">
            <p className="font-medium">See your own numbers</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm" style={{ color: 'var(--text-secondary)' }}>
              Takes about a minute. You will know more about your AI visibility than your current
              agency has told you.
            </p>
            <a
              href="#audit"
              className="mt-5 inline-flex h-11 items-center rounded-lg px-6 text-sm font-medium"
              style={{ background: 'var(--text-primary)', color: 'var(--text-inverse)' }}
            >
              Check my visibility
            </a>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}
