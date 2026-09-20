/**
 * CLI runner — audits a live site without the web app.
 *
 *   npx tsx scripts/run-audit.ts https://example.com --market=in --pages=15
 *   npx tsx scripts/run-audit.ts https://example.com --json > report.json
 */
import { runAudit } from '../src/engine/pipeline';

function arg(name: string, fallback?: string): string | undefined {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  return match ? match.split('=').slice(1).join('=') : fallback;
}

async function main() {
  const url = process.argv[2];
  if (!url || url.startsWith('--')) {
    console.error('Usage: tsx scripts/run-audit.ts <url> [--market=in] [--pages=25] [--competitors=a.com,b.com] [--json]');
    process.exit(1);
  }
  const asJson = process.argv.includes('--json');

  const result = await runAudit(
    {
      auditId: `cli-${Date.now()}`,
      url,
      market: arg('market', 'global'),
      maxPages: Number(arg('pages', '25')),
      competitorUrls: (arg('competitors', '') ?? '').split(',').filter(Boolean),
      enablePaidEnrichment: process.argv.includes('--paid'),
    },
    {
      onStage: (event) => {
        if (asJson) return;
        const icon = event.status === 'done' ? '✓' : event.status === 'failed' ? '✗' : '·';
        process.stderr.write(`${icon} ${event.label}${event.detail ? ` — ${event.detail}` : ''}\n`);
      },
    },
  );

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const line = '─'.repeat(68);
  console.log(`\n${line}`);
  console.log(`  ${result.brand.name} — ${result.target.host}`);
  console.log(`  Overall ${result.overall.score}/100 · ${result.overall.band.label} · Mode ${result.mode}`);
  console.log(`  Google visibility ${result.overall.googleVisibility} · AI visibility ${result.overall.aiVisibility}`);
  console.log(line);
  for (const pillar of result.pillars) {
    const score = pillar.score === null ? 'insufficient data' : `${pillar.score}/100`;
    console.log(`  ${pillar.label.padEnd(14)} ${String(score).padStart(16)}   coverage ${Math.round(pillar.coverage * 100)}%`);
  }
  console.log(line);
  console.log(`  ${result.narrative.verdict}`);
  console.log(`${line}\n`);

  console.log(`  Crawled ${result.stats.pagesCrawled} of ${result.stats.urlsDiscovered} URLs in ${(result.durationMs / 1000).toFixed(1)}s`);
  console.log(`  ${result.stats.criticalCount} critical · ${result.stats.warningCount} warnings · ${result.stats.opportunityCount} opportunities · ${result.stats.passCount} passing\n`);

  console.log('  MONEY LEFT ON THE TABLE');
  for (const t of result.translations) {
    console.log(`   • ${t.headline}`);
    console.log(`     ${t.business}`);
  }

  console.log('\n  FIX IMMEDIATELY');
  for (const r of result.recommendations.filter((x) => x.horizon === 'now')) {
    console.log(`   • [${r.impact} impact / ${r.effort} effort] ${r.title}`);
  }

  const unanswered = result.questionGaps.filter((g) => !g.answered);
  console.log(`\n  UNANSWERED CUSTOMER QUESTIONS (${unanswered.length})`);
  for (const g of unanswered.slice(0, 8)) console.log(`   • ${g.question}`);

  console.log('\n  NOT MEASURED');
  for (const n of result.notMeasured) console.log(`   • ${n.label}: ${n.reason}`);
  console.log('');
}

main().catch((err) => {
  console.error(`\nAudit failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
