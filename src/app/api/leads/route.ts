import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRepository } from '@/lib/repository';
import { scoreLead, signalsFromAudit } from '@/lib/lead-score';

export const runtime = 'nodejs';

const LeadSchema = z.object({
  auditId: z.string().min(1),
  name: z.string().min(1).max(120),
  company: z.string().min(1).max(160),
  designation: z.string().max(120).optional().or(z.literal('')),
  email: z.string().email().max(320),
  phone: z.string().max(40).optional().or(z.literal('')),
  budgetBand: z.string().max(60).optional().or(z.literal('')),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = LeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please complete the required fields.', details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
      { status: 400 },
    );
  }

  const repo = getRepository();
  const audit = await repo.getAudit(parsed.data.auditId);
  if (!audit || audit.status !== 'complete' || !audit.result) {
    return NextResponse.json({ error: 'That audit is not available.' }, { status: 404 });
  }

  const scored = scoreLead(
    signalsFromAudit(audit.result, parsed.data.email, Boolean(parsed.data.budgetBand)),
  );

  const lead = await repo.createLead({
    audit_id: audit.id,
    name: parsed.data.name,
    company: parsed.data.company,
    designation: parsed.data.designation || null,
    email: parsed.data.email,
    phone: parsed.data.phone || null,
    budget_band: parsed.data.budgetBand || null,
    is_free_email: scored.isFreeEmail,
    email_matches_domain: scored.emailMatchesDomain,
    lead_score: scored.score,
    grade: scored.grade,
    status: 'new_lead',
    source: 'report_unlock',
    host: audit.host,
    overall_score: audit.overall_score,
  });

  return NextResponse.json({
    id: lead.id,
    unlocked: true,
    bookingUrl: process.env['NEXT_PUBLIC_BOOKING_URL'] ?? null,
  });
}
