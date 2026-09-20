import type { Metadata } from 'next';
import {
  CITATION_TIERS, GROUP_WEIGHTS, MIN_PILLAR_COVERAGE, PARTIAL_PILLAR_COVERAGE,
  PILLAR_WEIGHTS, SCORE_BANDS, SCORING_VERSION, AI_CRAWLERS,
} from '@/engine/config';
import { Card, SectionHeading } from '@/components/ui/primitives';

export const metadata: Metadata = {
  title: 'Methodology',
  description:
    'Exactly how Findable scores search and AI visibility: every weight, every rule, and every limitation — including why nobody can measure a ChatGPT ranking.',
};

/**
 * This page is a trust asset and an SEO/AEO asset at once: it is question-led,
 * answers directly, and publishes the weights it claims to use — pulled from
 * the live config so it cannot drift from the engine.
 */
export default function MethodologyPage() {
  const pillars = [
    { key: 'seo', label: 'SEO', weight: PILLAR_WEIGHTS.seo },
    { key: 'aeo', label: 'AEO', weight: PILLAR_WEIGHTS.aeo },
    { key: 'geo', label: 'GEO', weight: PILLAR_WEIGHTS.geo },
    { key: 'ai', label: 'AI Presence', weight: PILLAR_WEIGHTS.ai },
  ];

  return (
    <article className="mx-auto max-w-3xl px-4 pb-24 pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">How we score visibility</h1>
      <p className="mt-3 text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        Scoring methodology version {SCORING_VERSION}. Every number in a Findable report comes from
        deterministic checks over signals we observed on your site. An AI writes the explanations;
        it never produces a score.
      </p>

      <div className="mt-12 space-y-14">
        <section>
          <SectionHeading title="How is the overall score calculated?" id="overall" />
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            The overall score is a weighted average of four pillars. Each pillar is a weighted
            average of its groups, and each group is a weighted average of its checks.
          </p>
          <Card className="mt-4" padded={false}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3 font-medium">Pillar</th>
                  <th className="p-3 text-right font-medium">Weight</th>
                </tr>
              </thead>
              <tbody>
                {pillars.map((p) => (
                  <tr key={p.key} className="border-b last:border-0">
                    <td className="p-3">{p.label}</td>
                    <td className="p-3 text-right tabular-nums">{Math.round(p.weight * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            When AI Presence cannot be measured, it is <strong>removed from the composite entirely</strong>{' '}
            and the remaining three pillars are renormalised to 100%. An unmeasured pillar is never
            imputed into a headline number — that is the difference between a score you can
            reproduce and one you have to take on faith.
          </p>
        </section>

        <section>
          <SectionHeading title="What are the group weights?" id="groups" />
          <div className="grid gap-4 sm:grid-cols-2">
            {pillars.map((pillar) => {
              const groups = Object.entries(GROUP_WEIGHTS).filter(([id]) => id.startsWith(`${pillar.key}.`));
              if (groups.length === 0) return null;
              return (
                <Card key={pillar.key}>
                  <h3 className="font-medium">{pillar.label}</h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {groups.map(([id, group]) => (
                      <li key={id} className="flex items-baseline justify-between gap-3">
                        <span style={{ color: 'var(--text-secondary)' }}>{group.label}</span>
                        <span className="tabular-nums">{group.weight}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        </section>

        <section>
          <SectionHeading title="What happens when something cannot be measured?" id="coverage" />
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Checks we could not run are marked <code>unavailable</code> and removed from both the
            numerator and the denominator, so a missing API key or a blocked request can never lower
            your score. Checks that do not apply to your site type are marked{' '}
            <code>not_applicable</code> and treated the same way.
          </p>
          <ul className="mt-4 space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <li>
              Below {Math.round(PARTIAL_PILLAR_COVERAGE * 100)}% coverage a pillar is labelled
              &ldquo;partial measurement&rdquo; and lists which groups were not measured.
            </li>
            <li>
              Below {Math.round(MIN_PILLAR_COVERAGE * 100)}% coverage we do not report the pillar
              score at all — it shows &ldquo;insufficient data&rdquo;.
            </li>
            <li>
              Each check also carries a confidence value. Low confidence reduces the check&apos;s
              effective weight rather than its score, so a weak measurement can never swing the
              headline number.
            </li>
          </ul>
        </section>

        <section>
          <SectionHeading title="What do the bands mean?" id="bands" />
          <Card padded={false}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3 font-medium">Range</th>
                  <th className="p-3 font-medium">Band</th>
                  <th className="p-3 font-medium">What it means</th>
                </tr>
              </thead>
              <tbody>
                {SCORE_BANDS.map((band, i) => {
                  const upper = i === 0 ? 100 : (SCORE_BANDS[i - 1]?.min ?? 100) - 1;
                  return (
                    <tr key={band.band} className="border-b last:border-0">
                      <td className="p-3 tabular-nums">{band.min}–{upper}</td>
                      <td className="p-3 font-medium">{band.label}</td>
                      <td className="p-3" style={{ color: 'var(--text-secondary)' }}>{band.tone}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>

        <section>
          <SectionHeading title="How is third-party authority weighted?" id="citations" />
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Not every mention is worth the same. A Wikipedia entry and a directory listing are not
            comparable evidence, and treating them as such is how visibility tools produce
            flattering, useless numbers. Directory-tier sources are capped at 5% of the citation
            subscore no matter how many listings exist.
          </p>
          <Card className="mt-4" padded={false}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3 font-medium">Tier</th>
                  <th className="p-3 font-medium">Sources</th>
                  <th className="p-3 text-right font-medium">Weight</th>
                </tr>
              </thead>
              <tbody>
                {CITATION_TIERS.map((tier) => (
                  <tr key={tier.tier} className="border-b last:border-0">
                    <td className="p-3 tabular-nums">{tier.tier}</td>
                    <td className="p-3" style={{ color: 'var(--text-secondary)' }}>{tier.label}</td>
                    <td className="p-3 text-right tabular-nums">
                      {tier.weight.toFixed(2)}{tier.cap ? ` (capped at ${Math.round(tier.cap * 100)}%)` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        <section>
          <SectionHeading title="Which AI crawlers do you check?" id="crawlers" />
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            The distinction that matters is <strong>retrieval</strong> versus <strong>training</strong>.
            Blocking a retrieval crawler removes you from AI answers. Blocking a training crawler is
            a legitimate business decision and we never score it as a defect. Google-Extended is a
            training control and does not affect Google Search ranking or inclusion.
          </p>
          <Card className="mt-4" padded={false}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3 font-medium">Agent</th>
                  <th className="p-3 font-medium">Operator</th>
                  <th className="p-3 font-medium">Purpose</th>
                </tr>
              </thead>
              <tbody>
                {AI_CRAWLERS.map((crawler) => (
                  <tr key={crawler.agent} className="border-b last:border-0">
                    <td className="p-3"><code>{crawler.agent}</code></td>
                    <td className="p-3" style={{ color: 'var(--text-secondary)' }}>{crawler.operator}</td>
                    <td className="p-3" style={{ color: 'var(--text-secondary)' }}>
                      {crawler.purpose === 'search' ? 'Search / retrieval'
                        : crawler.purpose === 'user_fetch' ? 'User-initiated fetch'
                          : crawler.purpose === 'training' ? 'Model training'
                            : 'Open corpus'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        <section id="limitations">
          <SectionHeading
            eyebrow="The part other tools leave out"
            title="What we cannot measure, and why"
          />
          <div className="space-y-4 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p>
              <strong style={{ color: 'var(--text-primary)' }}>There is no ChatGPT visibility API.</strong>{' '}
              Nothing published by OpenAI or anyone else reports what the ChatGPT application shows a
              given user for a given prompt. Calling the API with web search enabled is a different
              model configuration with a different retrieval stack; scraping the web interface is
              against the terms and returns personalised, geo-skewed results; and asking a model
              whether it knows your brand measures training recall, not answer-surface visibility.
              Those are different things, and conflating them is the most common error in this
              category. We never produce a &ldquo;ChatGPT ranking&rdquo;.
            </p>
            <p>
              <strong style={{ color: 'var(--text-primary)' }}>Answers are non-deterministic and have no denominator.</strong>{' '}
              The same prompt returns materially different answers between runs, so a single sample
              is noise. And because the universe of possible prompts is effectively infinite, any
              &ldquo;share of voice&rdquo; figure is entirely a function of the prompt set someone
              chose. Where we sample answers, we always publish the engines, the prompt set, the
              sample count and the denominator — the four things that make the number checkable.
            </p>
            <p>
              <strong style={{ color: 'var(--text-primary)' }}>What is genuinely measurable.</strong>{' '}
              Whether AI retrieval crawlers can reach you. Whether your entity is machine-resolvable.
              Whether your content is structurally extractable. Whether independent sources
              corroborate you. Whether you appear in Google&apos;s AI Overviews for your category.
              Four of those are free and certain — and they are also the ones you can act on.
            </p>
            <p>
              <strong style={{ color: 'var(--text-primary)' }}>Other limits we state plainly.</strong>{' '}
              We crawl a sample of up to 25 pages, not your whole site, and the report says how many
              of how many. We do not execute JavaScript, so a site that renders client-side is
              flagged rather than guessed at — which is itself a finding, because several AI
              crawlers do not execute JavaScript either. We report a free authority proxy rather
              than a backlink graph, and we label it as a proxy. We do not measure backlinks at all,
              and we say so rather than estimating.
            </p>
          </div>
        </section>

        <section>
          <SectionHeading title="What is the AI allowed to do?" id="llm" />
          <Card padded={false}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3 font-medium">Allowed</th>
                  <th className="p-3 font-medium">Not allowed</th>
                </tr>
              </thead>
              <tbody style={{ color: 'var(--text-secondary)' }}>
                {[
                  ['Rewrite a finding into business language', 'Decide whether the finding is a failure'],
                  ['Generate candidate customer questions', 'Decide whether a question is answered'],
                  ['Summarise a competitor delta in a sentence', 'Compute the delta'],
                  ['Classify the sentiment of a mention', 'Count the mentions'],
                  ['Draft recommendation copy', 'Assign impact or effort labels'],
                ].map(([allowed, not]) => (
                  <tr key={allowed} className="border-b last:border-0">
                    <td className="p-3">{allowed}</td>
                    <td className="p-3">{not}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
            The scoring module holds no model client and performs no network calls. That constraint
            is enforced by an automated test, not by a comment.
          </p>
        </section>
      </div>
    </article>
  );
}
