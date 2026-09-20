import { describe, expect, it } from 'vitest';
import { envNumber, envString } from '@/engine/util/env';

/**
 * Guards a failure that reached production: Vercel offers to import every key
 * from a repository's .env.example, which creates them all with empty values.
 * `Number(env['AUDITS_PER_DOMAIN_PER_DAY'] ?? 3)` then evaluated to 0, and the
 * site refused every audit with "already been audited 0 times today".
 */
describe('environment values that are present but blank', () => {
  it('treats an empty or whitespace value as unset', () => {
    expect(envString({ A: '' }, 'A')).toBeUndefined();
    expect(envString({ A: '   ' }, 'A')).toBeUndefined();
    expect(envString({}, 'A')).toBeUndefined();
    expect(envString({ A: 'x' }, 'A')).toBe('x');
    expect(envString({ A: '  x  ' }, 'A')).toBe('x');
  });

  it('falls back to the default for a blank number rather than yielding zero', () => {
    expect(envNumber({ N: '' }, 'N', 3)).toBe(3);
    expect(envNumber({}, 'N', 3)).toBe(3);
    expect(envNumber({ N: '  ' }, 'N', 3)).toBe(3);
  });

  it('falls back for values that parse to something unusable', () => {
    // A limit of zero or less means "allow nothing", which is never what an
    // operator intends by leaving a box empty or typing a stray character.
    expect(envNumber({ N: '0' }, 'N', 3)).toBe(3);
    expect(envNumber({ N: '-5' }, 'N', 3)).toBe(3);
    expect(envNumber({ N: 'three' }, 'N', 3)).toBe(3);
    expect(envNumber({ N: 'Infinity' }, 'N', 3)).toBe(3);
  });

  it('uses a real configured value', () => {
    expect(envNumber({ N: '25' }, 'N', 3)).toBe(25);
    expect(envNumber({ N: ' 8 ' }, 'N', 3)).toBe(8);
  });
});
