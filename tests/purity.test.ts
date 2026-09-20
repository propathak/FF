import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Structural guarantee for the claim in docs/03: the scoring engine derives
 * scores from measured signals and never calls a model or the network.
 *
 * Asserting this in a test rather than a comment is the difference between a
 * design principle and a design intention.
 */
/**
 * Server components cannot call functions exported from a `'use client'`
 * module — the call throws at request time, not at build time, so only a
 * page rendered with real data surfaces it. This keeps that class of bug out.
 */
describe('server/client module boundary', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  const SERVER_PAGES = [
    'src/app/admin/page.tsx',
    'src/app/page.tsx',
    'src/app/layout.tsx',
    'src/app/signin/page.tsx',
    'src/app/methodology/page.tsx',
    'src/app/bot/page.tsx',
    'src/app/audit/[id]/page.tsx',
  ];

  it('no server component imports a plain function from a client module', () => {
    // Importing a client *component* into a server component is normal React.
    // The bug is importing a client *function* and calling it, so only
    // non-PascalCase named imports are flagged.
    for (const page of SERVER_PAGES) {
      const source = read(page);
      expect(source.startsWith("'use client'"), `${page} should be a server component`).toBe(false);

      const imports = [...source.matchAll(/import\s+(?!type\s)\{([^}]+)\}\s+from\s+['"](@\/[^'"]+)['"]/g)];
      for (const [, names, specifier] of imports) {
        const rel = `src/${(specifier ?? '').replace(/^@\//, '')}`;
        const target = [`${rel}.ts`, `${rel}.tsx`]
          .map((candidate) => {
            try {
              return { candidate, source: read(candidate) };
            } catch {
              return null;
            }
          })
          .find(Boolean);
        if (!target || !target.source.startsWith("'use client'")) continue;

        for (const raw of (names ?? '').split(',')) {
          const name = (raw.split(/\sas\s/)[0] ?? '').trim();
          if (!name || /^[A-Z]/.test(name)) continue; // components are fine
          throw new Error(
            `${page} imports the function "${name}" from the client module ${target.candidate}. ` +
              'A server component cannot call it — move it to a module without the client directive.',
          );
        }
      }
    }
  });

  it('keeps the shared tone helper free of the client directive', () => {
    expect(read('src/lib/tone.ts').startsWith("'use client'")).toBe(false);
  });
});

describe('scoring engine purity', () => {
  const scoringDir = join(process.cwd(), 'src/engine/scoring');

  it('imports no model client, no network module and no provider', () => {
    for (const file of readdirSync(scoringDir).filter((f) => f.endsWith('.ts'))) {
      const source = readFileSync(join(scoringDir, file), 'utf8');
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');

      for (const specifier of imports) {
        expect(specifier, `${file} must not import a provider`).not.toMatch(/providers?\//);
        expect(specifier, `${file} must not import an SDK`).not.toMatch(/@anthropic-ai|openai|node-fetch|undici/);
        expect(specifier, `${file} must not import the fetcher`).not.toMatch(/util\/http/);
      }
      expect(source, `${file} must not call fetch()`).not.toMatch(/\bfetch\s*\(/);
    }
  });

  it('keeps the whole engine free of framework imports so it can run in a worker', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(join(dir, entry.name))
          : entry.name.endsWith('.ts')
            ? [join(dir, entry.name)]
            : [],
      );

    for (const file of walk(join(process.cwd(), 'src/engine'))) {
      const source = readFileSync(file, 'utf8');
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
      for (const specifier of imports) {
        expect(specifier, `${file} must not depend on Next.js or React`).not.toMatch(/^(next|react)(\/|$)/);
      }
    }
  });
});
