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
