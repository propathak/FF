/**
 * Applies the database schema.
 *
 *   npm run db:migrate                      # uses DATABASE_URL from the environment
 *   DATABASE_URL="postgresql://…" npm run db:migrate
 *
 * The migration is idempotent, so running it twice is safe — which matters
 * because the most common time to run it is when you are not sure whether the
 * last attempt finished.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function connectionString(): string {
  const url =
    process.argv.find((a) => a.startsWith('postgres://') || a.startsWith('postgresql://')) ||
    // Vercel's Neon integration sets DATABASE_URL; some integrations set only
    // the legacy POSTGRES_URL. Accept either.
    process.env['DATABASE_URL'] ||
    process.env['POSTGRES_URL'];
  if (url) return url;

  console.error(`
No database connection string found.

  Pass it directly:
    npm run db:migrate -- "postgresql://user:pass@host/db?sslmode=require"

  Or set it first:
    export DATABASE_URL="postgresql://…"
    npm run db:migrate

Use your provider's POOLED connection string — on Neon it has "-pooler" in
the hostname. See docs/08-deployment.md §2.
`);
  process.exit(1);
}

async function main() {
  const url = connectionString();
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return 'the database';
    }
  })();

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.error(`No .sql files found in ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const client = new Client({
    connectionString: url,
    // Managed providers terminate TLS with their own CA.
    ssl: /\blocalhost\b|\b127\.0\.0\.1\b/.test(url) ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  });

  console.log(`\nConnecting to ${host}…`);
  try {
    await client.connect();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nCould not connect: ${message}`);
    if (/password|auth/i.test(message)) console.error('Check the username and password in the connection string.');
    if (/ENOTFOUND|EAI_AGAIN/i.test(message)) console.error('The hostname did not resolve — check for a typo or a missing region.');
    if (/timeout/i.test(message)) console.error('The connection timed out. Some networks block outbound port 5432.');
    process.exit(1);
  }

  try {
    for (const file of files) {
      process.stdout.write(`Applying ${file}… `);
      // One transaction per file: a failure leaves nothing half-applied.
      await client.query('begin');
      try {
        await client.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
        await client.query('commit');
        console.log('done');
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
    }

    const { rows } = await client.query<{ count: string }>(
      `select count(*)::text as count from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    console.log(`\nSchema is ready — ${rows[0]?.count ?? '0'} tables.\n`);
    console.log('Next: set DATABASE_URL to this same string in your Vercel project, then redeploy.\n');
  } catch (err) {
    console.error(`\nMigration failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
