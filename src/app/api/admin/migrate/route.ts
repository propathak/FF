import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/admin';
import { databaseUrl } from '@/lib/repository';
import { applyMigrations } from '@/lib/migrate';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * One-click schema setup for operators without a terminal.
 *
 * Safe to expose because the migrations are idempotent and create-only — they
 * add tables, indexes and enums and never drop or alter data — and because it
 * is gated on an admin Google session. Running it twice is a no-op.
 */
export async function POST() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !isAdminEmail(email)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }

  const url = databaseUrl();
  if (!url) {
    return NextResponse.json(
      { error: 'No database is connected. Set DATABASE_URL in the project environment variables.' },
      { status: 400 },
    );
  }

  try {
    const { applied, tableCount } = await applyMigrations(url);
    return NextResponse.json({ ok: true, applied, tableCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: `Could not apply the schema: ${message}`,
        hint: /password|auth/i.test(message)
          ? 'The connection string looks wrong — check DATABASE_URL.'
          : /ENOTFOUND|EAI_AGAIN/i.test(message)
            ? 'The database hostname did not resolve.'
            : undefined,
      },
      { status: 500 },
    );
  }
}
