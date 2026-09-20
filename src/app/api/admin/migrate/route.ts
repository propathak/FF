import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { maySetUpSchema } from '@/lib/admin';
import { databaseUrl } from '@/lib/repository';
import { applyMigrations, schemaIsReady } from '@/lib/migrate';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * One-click schema setup for operators without a terminal.
 *
 * Safe to expose because the migrations are idempotent and create-only — they
 * add tables, indexes and enums and never drop or alter data. Gated on an
 * admin Google session once the schema exists, and on any signed-in session
 * before that. Running it twice is a no-op.
 */
export async function POST() {
  const session = await auth();
  const email = session?.user?.email;

  const url = databaseUrl();
  if (!url) {
    return NextResponse.json(
      { error: 'No database is connected. Set DATABASE_URL in the project environment variables.' },
      { status: 400 },
    );
  }

  // Checked before the permission decision, because on an empty database the
  // permission rule is deliberately relaxed. See maySetUpSchema().
  const ready = await schemaIsReady(url);
  if (!maySetUpSchema(email, ready)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
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
