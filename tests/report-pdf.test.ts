import zlib from 'node:zlib';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { runAudit } from '@/engine/pipeline';
import { renderReportPdf } from '@/lib/report-pdf';
import { goodSite, poorSite, startFixtureServer, type FixtureServer } from './fixtures/site';

/**
 * Rendered from a real audit rather than a hand-built fixture: the PDF reads
 * almost every field of AuditResult, so a stub would pass while the real thing
 * threw on the one shape the stub got wrong.
 */

/**
 * The text of each page, in order.
 *
 * pdfkit writes hex-encoded WinAnsi strings inside Flate-compressed content
 * streams, so there is no way to assert on the rendered output without
 * decoding them. Worth the twenty lines: the defects this caught -- a clipped
 * cover verdict and two blank pages appended by the footer -- were both
 * invisible to a byte-length or page-count check.
 */
function pageText(pdf: Buffer): string[] {
  const raw = pdf.toString('latin1');
  const pages: string[] = [];
  const streams = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streams.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    let content: string;
    try {
      content = zlib.inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    if (!/\bTJ\b|\bTj\b/.test(content)) continue;
    const runs = [...content.matchAll(/\[((?:<[0-9a-fA-F]*>|[-\d.\s])*)\]\s*TJ/g)].map((m) =>
      [...(m[1] ?? '').matchAll(/<([0-9a-fA-F]*)>/g)]
        .map((h) => Buffer.from(h[1] ?? '', 'hex').toString('latin1'))
        .join(''),
    );
    pages.push(runs.join('\n'));
  }
  return pages;
}

describe('PDF report', () => {
  let good: FixtureServer;
  let poor: FixtureServer;

  beforeAll(async () => {
    good = await startFixtureServer(goodSite());
    poor = await startFixtureServer(poorSite());
  });
  afterAll(async () => {
    await good.close();
    await poor.close();
  });

  const options = { agencyName: 'Index Joy', appUrl: 'https://indexjoy.com' };

  it('renders a healthy site to a valid, multi-page PDF', async () => {
    const result = await runAudit(
      { auditId: 'pdf-good', url: good.origin, maxPages: 12 },
      { env: { AUDIT_ALLOW_LOCAL: '1' } },
    );
    const pdf = await renderReportPdf(result, options);

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.subarray(-6).toString('latin1')).toContain('%%EOF');
    // Enough content to be worth forwarding, small enough to email.
    expect(pdf.byteLength).toBeGreaterThan(8_000);
    expect(pdf.byteLength).toBeLessThan(4_000_000);

    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
  });

  it('renders a failing site, where far more findings and recommendations exist', async () => {
    const result = await runAudit(
      { auditId: 'pdf-poor', url: poor.origin, maxPages: 12 },
      { env: { AUDIT_ALLOW_LOCAL: '1' } },
    );
    const pdf = await renderReportPdf(result, options);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(8_000);
  });


  it('stamps a footer on every page and appends none', async () => {
    const result = await runAudit(
      { auditId: 'pdf-pages', url: poor.origin, maxPages: 12 },
      { env: { AUDIT_ALLOW_LOCAL: '1' } },
    );
    const pages = pageText(await renderReportPdf(result, options));

    // Writing a footer below the bottom margin made pdfkit start a new page,
    // so the document grew a blank page for each footer as it was stamped.
    expect(pages.length).toBeGreaterThan(4);
    pages.forEach((page, i) => {
      expect(page).toContain(`${i + 1} / ${pages.length}`);
      expect(page).toContain(options.agencyName);
    });

    // A page carrying nothing but its own footer is an appended blank.
    const last = pages[pages.length - 1] ?? '';
    expect(last.replace(`${pages.length} / ${pages.length}`, '').replace(options.agencyName, '').trim())
      .not.toBe('');
  });

  it('prints the cover verdict in full rather than clipping it', async () => {
    const result = await runAudit(
      { auditId: 'pdf-verdict', url: poor.origin, maxPages: 12 },
      { env: { AUDIT_ALLOW_LOCAL: '1' } },
    );
    const cover = pageText(await renderReportPdf(result, options))[0] ?? '';

    // Line wrapping breaks the sentence across runs, so compare on words: the
    // last few of the verdict have to survive to the page.
    const tail = result.narrative.verdict.split(/\s+/).slice(-4).join(' ');
    const flat = cover.replace(/\s+/g, ' ');
    expect(flat).toContain(tail.replace(/[\u2018\u2019]/g, "'").replace(/\u2014/g, '--'));
  });

  it('survives characters the bundled Helvetica cannot encode', async () => {
    const result = await runAudit(
      { auditId: 'pdf-unicode', url: good.origin, maxPages: 6 },
      { env: { AUDIT_ALLOW_LOCAL: '1' } },
    );
    // Rupees, smart quotes, an em dash and Devanagari all reach the page via
    // brand names and evidence strings on real Indian sites.
    result.brand.name = '“Acme” — ₹5,000 शुरू';
    result.narrative.verdict = `${result.narrative.verdict} — ₹1.2 कроr`;
    const pdf = await renderReportPdf(result, options);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
