import { describe, expect, it } from 'vitest';
import { authConfigStatus, googleRedirectUri } from '@/lib/auth-config';

/**
 * These guard a failure that is invisible by default. With no Google
 * credentials, next-auth 5.0.0-beta.32 does not raise a configuration error —
 * it redirects to Google with `client_id=undefined`, and Google answers
 * "Error 401: invalid_client". Reproduced directly against the running app
 * before this check existed.
 */
describe('google sign-in configuration', () => {
  it('is ready when both credentials are present', () => {
    const status = authConfigStatus({
      NODE_ENV: 'production',
      AUTH_SECRET: 's',
      AUTH_GOOGLE_ID: 'x.apps.googleusercontent.com',
      AUTH_GOOGLE_SECRET: 'GOCSPX-x',
    });
    expect(status).toEqual({ ready: true, missing: [] });
  });

  it('names every missing variable rather than failing generically', () => {
    const status = authConfigStatus({ NODE_ENV: 'production' });
    expect(status.ready).toBe(false);
    expect(status.missing).toEqual(['AUTH_SECRET', 'AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET']);
  });

  it('treats an empty or whitespace value as missing', () => {
    // Vercel stores a variable that was saved blank, so presence of the key
    // says nothing about whether it carries a credential.
    const status = authConfigStatus({
      NODE_ENV: 'production',
      AUTH_SECRET: 's',
      AUTH_GOOGLE_ID: '   ',
      AUTH_GOOGLE_SECRET: '',
    });
    expect(status.missing).toEqual(['AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET']);
  });

  it('accepts NEXTAUTH_SECRET, the older name for the same value', () => {
    const status = authConfigStatus({
      NODE_ENV: 'production',
      NEXTAUTH_SECRET: 's',
      AUTH_GOOGLE_ID: 'x',
      AUTH_GOOGLE_SECRET: 'y',
    });
    expect(status.ready).toBe(true);
  });

  it('does not demand AUTH_SECRET outside production, where one is generated', () => {
    const status = authConfigStatus({
      NODE_ENV: 'development',
      AUTH_GOOGLE_ID: 'x',
      AUTH_GOOGLE_SECRET: 'y',
    });
    expect(status.ready).toBe(true);
  });

  it('builds the redirect URI Google has to match character for character', () => {
    expect(googleRedirectUri('https://indexjoy.com')).toBe(
      'https://indexjoy.com/api/auth/callback/google',
    );
    // A trailing slash on the origin would produce a double slash, which Google
    // treats as a different URI entirely.
    expect(googleRedirectUri('https://ff-abc.vercel.app/')).toBe(
      'https://ff-abc.vercel.app/api/auth/callback/google',
    );
  });
});
