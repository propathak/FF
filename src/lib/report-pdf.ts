import PDFDocument from 'pdfkit';
import type { AuditResult, CheckResult } from '@/engine/types';

/**
 * Renders a report as a real PDF.
 *
 * Laid out programmatically rather than by screenshotting the page: the output
 * is text (selectable, searchable, a few hundred KB) instead of a bitmap, and
 * it needs no headless browser — which keeps it inside a normal serverless
 * function. This file is the artefact a prospect forwards to their boss, so it
 * carries the evidence, not just the scores.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const CONTENT_WIDTH = A4.width - MARGIN * 2;

const INK = '#141413';
const INK_2 = '#55534d';
const INK_3 = '#8b8981';
const RULE = '#e3e3df';
const ACCENT = '#2a78d6';

const TONE = {
  good: '#0ca30c',
  warning: '#d99400',
  serious: '#d4713f',
  critical: '#c62f2f',
  neutral: '#8b8981',
};

/**
 * The bundled Helvetica is WinAnsi-encoded, so characters outside Latin-1
 * render as garbage rather than failing loudly. Everything written to the
 * document goes through here.
 */
function text(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/₹/g, 'Rs ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—/g, '--')
    .replace(/–/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    // Anything still outside Latin-1 would render as noise.
    .replace(/[^\x09\x0a\x0d\x20-\xff]/g, '');
}

function toneForScore(score: number): keyof typeof TONE {
  if (score >= 70) return 'good';
  if (score >= 55) return 'warning';
  if (score >= 35) return 'serious';
  return 'critical';
}

type Doc = PDFKit.PDFDocument;

export interface PdfOptions {
  agencyName: string;
  appUrl: string;
}

export function renderReportPdf(result: AuditResult, options: PdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN + 24, left: MARGIN, right: MARGIN },
      info: {
        Title: `${text(result.brand.name)} - Search & AI Visibility Report`,
        Author: options.agencyName,
        Subject: 'SEO, AEO and GEO visibility audit',
        CreationDate: new Date(result.createdAt),
      },
      autoFirstPage: true,
      // Footers are stamped after the body is laid out, so every page has to
      // stay addressable until the end. Without this, bufferedPageRange()
      // reports only the page currently being written.
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      cover(doc, result, options);
      translations(doc, result);
      recommendations(doc, result);
      questions(doc, result);
      findings(doc, result);
      notMeasured(doc, result, options);
      paginate(doc, options);
      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

// ---------------------------------------------------------------------------

function heading(doc: Doc, eyebrow: string | null, title: string) {
  if (doc.y > A4.height - 200) doc.addPage();
  if (eyebrow) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(INK_3)
      .text(text(eyebrow.toUpperCase()), { characterSpacing: 0.8 });
    doc.moveDown(0.3);
  }
  doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(text(title));
  doc.moveDown(0.6);
}

function rule(doc: Doc) {
  doc.moveTo(MARGIN, doc.y).lineTo(A4.width - MARGIN, doc.y).lineWidth(0.7).strokeColor(RULE).stroke();
  doc.moveDown(0.8);
}

function body(doc: Doc, value: string, size = 10) {
  doc.font('Helvetica').fontSize(size).fillColor(INK_2).text(text(value), { lineGap: 2.5 });
}

/** Keeps a block together by starting a new page when it would be orphaned. */
function reserve(doc: Doc, height: number) {
  if (doc.y + height > A4.height - MARGIN - 30) doc.addPage();
}

// ---------------------------------------------------------------------------

function cover(doc: Doc, result: AuditResult, options: PdfOptions) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(ACCENT)
    .text(text(options.agencyName.toUpperCase()), { characterSpacing: 1 });
  doc.moveDown(2.2);

  doc.font('Helvetica-Bold').fontSize(27).fillColor(INK)
    .text(text(result.brand.name), { lineGap: 2 });
  doc.font('Helvetica').fontSize(12).fillColor(INK_2).text(text(result.target.host));
  doc.moveDown(0.4);
  doc.fontSize(9).fillColor(INK_3).text(
    text(
      `${new Date(result.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` +
        `  |  ${result.stats.pagesCrawled} of ${result.stats.urlsDiscovered} URLs sampled` +
        `  |  scoring v${result.scoringVersion}`,
    ),
  );

  doc.moveDown(1.6);

  // Headline score block.
  //
  // The verdict sits below the panel rather than beside the score, and the
  // panel is sized to the text instead of the other way round. An earlier
  // version clipped it to a fixed 48pt box with `ellipsis: true`, which cut
  // the one sentence the reader forwards to their boss off mid-word -- and
  // pdfkit's ellipsis character is itself outside WinAnsi, so it did not even
  // leave a visible mark that anything had been removed.
  const top = doc.y;
  const tone = TONE[toneForScore(result.overall.score)];
  const verdict = text(result.narrative.verdict);

  const verdictWidth = CONTENT_WIDTH - 44;
  doc.font('Helvetica').fontSize(9.5);
  const verdictHeight = doc.heightOfString(verdict, { width: verdictWidth, lineGap: 1.5 });
  const panelHeight = 66 + verdictHeight;

  doc.roundedRect(MARGIN, top, CONTENT_WIDTH, panelHeight, 8).fillColor('#faf9f7').fill();

  doc.font('Helvetica-Bold').fontSize(40).fillColor(tone)
    .text(String(result.overall.score), MARGIN + 22, top + 16, { width: 90, lineBreak: false });
  doc.font('Helvetica').fontSize(10).fillColor(INK_3)
    .text('out of 100', MARGIN + 24 + doc.widthOfString(String(result.overall.score)) * 0.98, top + 38, {
      width: 90,
      lineBreak: false,
    });

  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK)
    .text(text(result.overall.band.label), MARGIN + 22, top + 60 - 14, {
      width: CONTENT_WIDTH - 44,
      align: 'right',
    });

  doc.font('Helvetica').fontSize(9.5).fillColor(INK_2)
    .text(verdict, MARGIN + 22, top + 60, { width: verdictWidth, lineGap: 1.5 });

  doc.y = top + panelHeight + 16;
  doc.x = MARGIN;

  // Pillar bars
  const pillars = result.pillars;
  for (const pillar of pillars) {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(text(pillar.label), MARGIN, y, { width: 90 });

    const barX = MARGIN + 96;
    const barW = CONTENT_WIDTH - 96 - 92;
    doc.roundedRect(barX, y + 1.5, barW, 8, 4).fillColor('#ececea').fill();
    if (pillar.score !== null) {
      doc.roundedRect(barX, y + 1.5, Math.max(barW * (pillar.score / 100), 3), 8, 4)
        .fillColor(TONE[toneForScore(pillar.score)]).fill();
    }

    doc.font('Helvetica').fontSize(9.5).fillColor(pillar.score === null ? INK_3 : INK)
      .text(
        pillar.score === null ? 'not measured' : `${pillar.score}`,
        A4.width - MARGIN - 86, y,
        { width: 86, align: 'right' },
      );
    doc.y = y + 17;
    doc.x = MARGIN;
  }

  doc.moveDown(0.6);
  rule(doc);

  // Roll-ups
  const rollY = doc.y;
  const half = CONTENT_WIDTH / 2;
  const aiLabel = result.mode === 'C' ? 'AI citation readiness' : 'AI visibility';
  doc.font('Helvetica').fontSize(8.5).fillColor(INK_3).text('GOOGLE VISIBILITY', MARGIN, rollY, { width: half, characterSpacing: 0.6 });
  doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text(String(result.overall.googleVisibility), MARGIN, rollY + 12);
  doc.font('Helvetica').fontSize(8.5).fillColor(INK_3).text(text(aiLabel.toUpperCase()), MARGIN + half, rollY, { width: half, characterSpacing: 0.6 });
  doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text(String(result.overall.aiVisibility), MARGIN + half, rollY + 12);
  doc.y = rollY + 40;
  doc.x = MARGIN;

  doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(INK_3)
    .text(text(result.overall.compositeNote), { width: CONTENT_WIDTH, lineGap: 1.5 });

  doc.moveDown(0.8);
  const counts = result.stats;
  doc.font('Helvetica').fontSize(9).fillColor(INK_2).text(
    text(
      `${counts.criticalCount} critical  |  ${counts.warningCount} warnings  |  ` +
        `${counts.opportunityCount} opportunities  |  ${counts.passCount} passing`,
    ),
  );
}

// ---------------------------------------------------------------------------

function translations(doc: Doc, result: AuditResult) {
  if (result.translations.length === 0) return;
  doc.addPage();
  heading(doc, 'What this is costing you', 'Money left on the table');

  for (const item of result.translations) {
    reserve(doc, 96);
    const y = doc.y;
    const tone =
      item.severity === 'critical' ? TONE.critical : item.severity === 'warning' ? TONE.warning : ACCENT;
    doc.rect(MARGIN, y, 2.5, 46).fillColor(tone).fill();

    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK)
      .text(text(item.headline), MARGIN + 12, y, { width: CONTENT_WIDTH - 12 });
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(9.5).fillColor(INK_2)
      .text(text(item.business), MARGIN + 12, doc.y, { width: CONTENT_WIDTH - 12, lineGap: 2 });
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(8).fillColor(INK_3)
      .text(text(`${item.technical}  [${item.checkIds.join(', ')}]`), MARGIN + 12, doc.y, {
        width: CONTENT_WIDTH - 12,
        lineGap: 1,
      });
    doc.x = MARGIN;
    doc.moveDown(1.1);
  }
}

// ---------------------------------------------------------------------------

const HORIZONS = [
  { key: 'now' as const, title: 'Fix immediately', note: 'Actively suppressing you right now.' },
  { key: '30d' as const, title: 'Next 30 days', note: 'Content and structural optimisation.' },
  { key: '90d' as const, title: 'Next 90 days', note: 'Authority building and AI visibility strategy.' },
];

function recommendations(doc: Doc, result: AuditResult) {
  if (result.recommendations.length === 0) return;
  doc.addPage();
  heading(doc, null, 'Your action plan');
  body(doc, 'Ordered by how much visibility each fix actually recovers. Impact and effort are assigned by rule, never by a model.', 9.5);
  doc.moveDown(0.8);

  for (const horizon of HORIZONS) {
    const items = result.recommendations.filter((r) => r.horizon === horizon.key);
    if (items.length === 0) continue;

    reserve(doc, 70);
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor(INK).text(text(horizon.title));
    doc.font('Helvetica').fontSize(8.5).fillColor(INK_3).text(text(horizon.note));
    doc.moveDown(0.5);

    for (const rec of items) {
      reserve(doc, 110);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(text(rec.title), { width: CONTENT_WIDTH - 120 });
      const titleY = doc.y;
      doc.font('Helvetica').fontSize(8).fillColor(INK_3)
        .text(text(`Impact: ${rec.impact}   Effort: ${rec.effort}`), A4.width - MARGIN - 120, titleY - 12, {
          width: 120,
          align: 'right',
        });
      doc.x = MARGIN;
      doc.y = titleY;

      doc.moveDown(0.2);
      for (const [label, value] of [
        ['Problem', rec.problem],
        ['Why it matters', rec.whyItMatters],
        ['Action', rec.action],
      ] as const) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(INK_3).text(text(label.toUpperCase()), { characterSpacing: 0.5 });
        doc.font('Helvetica').fontSize(9).fillColor(INK_2).text(text(value), { width: CONTENT_WIDTH, lineGap: 1.8 });
        doc.moveDown(0.25);
      }
      rule(doc);
    }
    doc.moveDown(0.4);
  }
}

// ---------------------------------------------------------------------------

function questions(doc: Doc, result: AuditResult) {
  const unanswered = result.questionGaps.filter((g) => !g.answered);
  if (unanswered.length === 0) return;
  doc.addPage();
  heading(
    doc,
    'Demand you are not serving',
    unanswered.length === 1
      ? 'One question your customers ask that your site does not answer'
      : `${unanswered.length} questions your customers ask that your site does not answer`,
  );
  body(
    doc,
    `We generated a question set for this category, then searched your crawled pages for each one. Your site answers ${result.questionGaps.length - unanswered.length} of ${result.questionGaps.length}.`,
    9.5,
  );
  doc.moveDown(0.8);

  for (const gap of unanswered) {
    reserve(doc, 26);
    const y = doc.y;
    doc.circle(MARGIN + 2.5, y + 5, 2).fillColor(TONE.warning).fill();
    doc.font('Helvetica').fontSize(10).fillColor(INK)
      .text(text(gap.question), MARGIN + 12, y, { width: CONTENT_WIDTH - 90 });
    doc.font('Helvetica').fontSize(8).fillColor(INK_3)
      .text(text(gap.intent.replace('_', ' ')), A4.width - MARGIN - 78, y + 1, { width: 78, align: 'right' });
    doc.x = MARGIN;
    doc.moveDown(0.55);
  }
}

// ---------------------------------------------------------------------------

const GROUPS = [
  { status: 'fail' as const, title: 'Critical issues', tone: TONE.critical },
  { status: 'warn' as const, title: 'Warnings', tone: TONE.warning },
  { status: 'opportunity' as const, title: 'Opportunities', tone: ACCENT },
  { status: 'pass' as const, title: 'What you are doing well', tone: TONE.good },
];

function findings(doc: Doc, result: AuditResult) {
  doc.addPage();
  heading(doc, null, 'Every finding, with its evidence');
  body(doc, 'Each check states what we observed and the check id behind it, so any score can be verified independently.', 9.5);
  doc.moveDown(0.8);

  for (const group of GROUPS) {
    const items = result.checks.filter((c) => c.status === group.status);
    if (items.length === 0) continue;

    reserve(doc, 56);
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor(group.tone)
      .text(text(`${group.title}  (${items.length})`));
    doc.moveDown(0.45);

    for (const check of items) {
      reserve(doc, 54);
      const y = doc.y;
      doc.rect(MARGIN, y + 3, 2, 10).fillColor(group.tone).fill();
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK)
        .text(text(check.title), MARGIN + 10, y, { width: CONTENT_WIDTH - 10 });
      doc.font('Helvetica').fontSize(9).fillColor(INK_2)
        .text(text(check.summary), MARGIN + 10, doc.y, { width: CONTENT_WIDTH - 10, lineGap: 1.5 });

      const evidence = evidenceLine(check);
      if (evidence) {
        doc.font('Helvetica').fontSize(7.8).fillColor(INK_3)
          .text(text(evidence), MARGIN + 10, doc.y + 1, { width: CONTENT_WIDTH - 10 });
      }
      doc.font('Helvetica').fontSize(7.5).fillColor('#a8a69d')
        .text(text(check.id), MARGIN + 10, doc.y + 1, { width: CONTENT_WIDTH - 10 });
      doc.x = MARGIN;
      doc.moveDown(0.7);
    }
    doc.moveDown(0.3);
  }
}

function evidenceLine(check: CheckResult): string | null {
  const parts: string[] = [];
  for (const item of check.evidence.slice(0, 3)) {
    if (item.kind === 'count') parts.push(`${item.label}: ${item.value}${item.of !== undefined ? ` of ${item.of}` : ''}`);
    else if (item.kind === 'metric') parts.push(`${item.label}: ${item.value}${item.unit ?? ''}`);
    else if (item.kind === 'text') parts.push(`${item.label}: ${item.value}`);
    else if (item.kind === 'url') parts.push(item.url);
    else if (item.kind === 'list' && item.values.length) parts.push(`${item.label}: ${item.values.slice(0, 5).join(', ')}`);
  }
  if (check.affectedUrls.length > 0) {
    parts.push(`${check.affectedUrls.length} affected URL${check.affectedUrls.length === 1 ? '' : 's'}`);
  }
  return parts.length ? parts.join('  |  ') : null;
}

// ---------------------------------------------------------------------------

function notMeasured(doc: Doc, result: AuditResult, options: PdfOptions) {
  doc.addPage();
  heading(doc, null, 'What we could not measure');
  body(
    doc,
    'Listed here rather than estimated. Unmeasured signals are removed from both sides of the scoring fraction, so they can never drag a score down.',
    9.5,
  );
  doc.moveDown(0.8);

  for (const item of result.notMeasured) {
    reserve(doc, 38);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(text(item.label));
    doc.font('Helvetica').fontSize(9).fillColor(INK_2).text(text(item.reason), { width: CONTENT_WIDTH, lineGap: 1.5 });
    doc.moveDown(0.6);
  }

  doc.moveDown(0.6);
  rule(doc);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('How this was scored');
  doc.moveDown(0.3);
  body(
    doc,
    'Every score comes from deterministic checks over signals observed on your site. An AI writes the explanations; it never produces a number. ' +
      'No figure in this report is a "ChatGPT ranking" - no API reports what the ChatGPT application shows a user, so any such number would be invented.',
    9,
  );
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(8.5).fillColor(ACCENT).text(text(`${options.appUrl}/methodology`));
}

// ---------------------------------------------------------------------------

function paginate(doc: Doc, options: PdfOptions) {
  const range = doc.bufferedPageRange();
  const y = A4.height - MARGIN - 4;

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);

    // The footer deliberately sits below the bottom margin. pdfkit reacts to
    // that by starting a new page, which appends a blank page per footer and
    // grows the document as it is stamped. Dropping the margin for the
    // duration of the write is the documented way to place a footer there.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.font('Helvetica').fontSize(7.5).fillColor(INK_3)
      .text(text(options.agencyName), MARGIN, y, { width: CONTENT_WIDTH / 2, lineBreak: false });
    doc.text(`${i - range.start + 1} / ${range.count}`, MARGIN + CONTENT_WIDTH / 2, y, {
      width: CONTENT_WIDTH / 2,
      align: 'right',
      lineBreak: false,
    });

    doc.page.margins.bottom = bottom;
  }

  doc.flushPages();
}
