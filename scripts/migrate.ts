/**
 * Applies the database schema.
 *
 *   npm run db:migrate                      # uses DATABASE_URL from the environment
 *   npm run db:migrate -- "postgresql://…"  # or pass it directly
 *
 * The migration is idempotent, so running it twice is safe — which matters
 * because the most common time to run it is when you are not sure whether the
 * last attempt finished.
 *
 * No terminal? /admin has a one-click equivalent once the app is deployed.
 */
import { applyMigrations, migrationFiles } from '../src/lib/migrate';

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

  const files = migrationFiles();
  if (files.length === 0) {
    console.error('No .sql files found in supabase/migrations.');
    process.exit(1);
  }

  console.log(`\nConnecting to ${host}…`);
  try {
    const { applied, tableCount } = await applyMigrations(url);
    for (const file of applied) console.log(`Applied ${file}`);
    console.log(`\nSchema is ready — ${tableCount} tables.\n`);
    console.log('Next: make sure DATABASE_URL is set in your Vercel project, then redeploy.\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nMigration failed: ${message}`);
    if (/password|auth|role .* does not exist/i.test(message)) {
      console.error('Check the username and password in the connection string.');
    }
    if (/ENOTFOUND|EAI_AGAIN/i.test(message)) {
      console.error('The hostname did not resolve — check for a typo or a missing region.');
    }
    if (/timeout/i.test(message)) {
      console.error('The connection timed out. Some networks block outbound port 5432.');
    }
    console.error('');
    process.exitCode = 1;
  }
}

main();
