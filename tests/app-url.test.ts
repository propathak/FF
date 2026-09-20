import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The site address must resolve without anyone setting it by hand — Vercel's
 * UI discourages adding NEXT_PUBLIC_ variables, so requiring one turns a
 * deployment into an argument with a warning dialog.
 */
describe('site address resolution', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function resolve() {
    vi.resetModules();
    const { appUrl } = await import('@/lib/app-url');
    return appUrl();
  }

  function clearAll() {
    for (const key of [
      'NEXT_PUBLIC_APP_URL', 'VERCEL_PROJECT_PRODUCTION_URL',
      'NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL', 'NEXT_PUBLIC_VERCEL_URL',
    ]) vi.stubEnv(key, '');
  }

  it('prefers an explicit override', async () => {
    clearAll();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://custom.example');
    expect(await resolve()).toBe('https://custom.example');
  });

  it("falls back to Vercel's production domain, adding the missing scheme", async () => {
    clearAll();
    // Vercel's variables carry no protocol.
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'indexjoy.com');
    expect(await resolve()).toBe('https://indexjoy.com');
  });

  it('prefers the production domain over a preview deployment URL', async () => {
    clearAll();
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'indexjoy.com');
    vi.stubEnv('VERCEL_URL', 'ff-git-branch-xyz.vercel.app');
    // Preview URLs can sit behind deployment protection, which would make any
    // link built from them unreachable.
    expect(await resolve()).toBe('https://indexjoy.com');
  });

  it('uses the deployment URL when no production domain is known', async () => {
    clearAll();
    vi.stubEnv('VERCEL_URL', 'ff-git-branch-xyz.vercel.app');
    expect(await resolve()).toBe('https://ff-git-branch-xyz.vercel.app');
  });

  it('falls back to the real domain in production with nothing set', async () => {
    clearAll();
    vi.stubEnv('NODE_ENV', 'production');
    expect(await resolve()).toBe('https://indexjoy.com');
  });

  it('uses localhost in development', async () => {
    clearAll();
    vi.stubEnv('NODE_ENV', 'development');
    expect(await resolve()).toBe('http://localhost:3000');
  });

  it('strips a trailing slash so links never double up', async () => {
    clearAll();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://indexjoy.com/');
    expect(await resolve()).toBe('https://indexjoy.com');
  });
});
