import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

/**
 * Schema application, shared by the CLI (`npm run db:migrate`) and the
 * one-click setup in /admin.
 *
 * The migrations are idempotent and create-only — they never drop or alter
 * existing data — which is what makes it safe to expose behind an admin
 * session for people who have no terminal to run the CLI from.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function sslFor(url: string) {
  return /\blocalhost\b|\b127\.0\.0\.1\b/.test(url) ? undefined : { rejectUnauthorized: false };
}

export function migrationFiles(): string[] {
  try {
    return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    return [];
  }
}

export interface MigrationResult {
  applied: string[];
  tableCount: number;
}

export async function applyMigrations(connectionString: string): Promise<MigrationResult> {
  const files = migrationFiles();
  if (files.length === 0) throw new Error('No migration files were found in supabase/migrations.');

  const client = new Client({
    connectionString,
    ssl: sslFor(connectionString),
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();

  const applied: string[] = [];
  try {
    for (const file of files) {
      // One transaction per file: a failure leaves nothing half-applied.
      await client.query('begin');
      try {
        await client.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
        await client.query('commit');
        applied.push(file);
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
    }
    const { rows } = await client.query<{ count: string }>(
      `select count(*)::text as count from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    return { applied, tableCount: Number(rows[0]?.count ?? 0) };
  } finally {
    await client.end();
  }
}

/** How many tables exist, or null when the database cannot be reached. */
export async function countTables(connectionString: string): Promise<number | null> {
  const client = new Client({
    connectionString,
    ssl: sslFor(connectionString),
    connectionTimeoutMillis: 10_000,
  });
  try {
    await client.connect();
    const { rows } = await client.query<{ count: string }>(
      `select count(*)::text as count from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    return Number(rows[0]?.count ?? 0);
  } catch {
    return null;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Tables the app cannot run without. */
const REQUIRED = ['audits', 'audit_stages', 'leads', 'rate_limits'] as const;

export async function schemaIsReady(connectionString: string): Promise<boolean> {
  const client = new Client({
    connectionString,
    ssl: sslFor(connectionString),
    connectionTimeoutMillis: 10_000,
  });
  try {
    await client.connect();
    const { rows } = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name = any($1)`,
      [[...REQUIRED]],
    );
    return rows.length === REQUIRED.length;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}
