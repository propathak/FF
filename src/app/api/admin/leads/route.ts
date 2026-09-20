import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRepository } from '@/lib/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * V1 uses a shared secret. This is a deliberate, documented shortcut for an
 * internal-only page — Supabase Auth replaces it in Phase 4 along with the
 * client-facing dashboard that actually needs real accounts.
 */
function authorise(request: Request): boolean {
  const expected = process.env['ADMIN_PASSWORD'];
  if (!expected) return false;
  const provided =
    request.headers.get('x-admin-password') ??
    new URL(request.url).searchParams.get('key') ??
    '';
  if (provided.length !== expected.length) return false;
  // Constant-time comparison: a shared secret is still a secret.
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function GET(request: Request) {
  if (!authorise(request)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }
  const leads = await getRepository().listLeads();
  return NextResponse.json({ leads }, { headers: { 'cache-control': 'no-store' } });
}

const PatchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['new_lead', 'contacted', 'meeting_booked', 'proposal_sent', 'client', 'lost']),
});

export async function PATCH(request: Request) {
  if (!authorise(request)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid status update.' }, { status: 400 });
  }
  await getRepository().updateLeadStatus(parsed.data.id, parsed.data.status);
  return NextResponse.json({ ok: true });
}
