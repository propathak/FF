import { afterEach, describe, expect, it, vi } from 'vitest';

describe('admin allowlist', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function load() {
    vi.resetModules();
    return import('@/lib/admin');
  }

  it('admits an allowlisted email, case-insensitively', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'Boss@Agency.com, analyst@agency.com');
    const { isAdminEmail } = await load();
    expect(isAdminEmail('boss@agency.com')).toBe(true);
    expect(isAdminEmail('ANALYST@AGENCY.COM')).toBe(true);
  });

  it('rejects anyone not on the list', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'boss@agency.com');
    const { isAdminEmail } = await load();
    expect(isAdminEmail('someone@else.com')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it('locks everyone out when the list is empty, rather than letting everyone in', async () => {
    vi.stubEnv('ADMIN_EMAILS', '');
    const { isAdminEmail } = await load();
    // Fail closed: an unset variable must never mean "no restriction".
    expect(isAdminEmail('anyone@anywhere.com')).toBe(false);
  });
});

describe('google sheets configuration', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function load() {
    vi.resetModules();
    return import('@/lib/sheets');
  }

  function configure(key: string) {
    vi.stubEnv('GOOGLE_SHEETS_ID', 'sheet-123');
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', 'bot@project.iam.gserviceaccount.com');
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', key);
  }

  it('reports itself unconfigured when any variable is missing', async () => {
    vi.stubEnv('GOOGLE_SHEETS_ID', 'sheet-123');
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', '');
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', '');
    const { isSheetsConfigured, readSheetsConfig } = await load();
    expect(isSheetsConfigured()).toBe(false);
    expect(readSheetsConfig()).toBeNull();
  });

  it('restores newlines in a private key stored as an env var', async () => {
    // Env vars cannot hold real newlines, so the key arrives with literal \n.
    configure('-----BEGIN PRIVATE KEY-----\\nabc\\ndef\\n-----END PRIVATE KEY-----\\n');
    const { readSheetsConfig } = await load();
    const key = readSheetsConfig()?.privateKey ?? '';
    expect(key).toContain('\n');
    expect(key).not.toContain('\\n');
    expect(key.startsWith('-----BEGIN PRIVATE KEY-----')).toBe(true);
  });

  it('strips the quotes people keep when pasting out of the JSON key file', async () => {
    configure('"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n"');
    const { readSheetsConfig } = await load();
    const key = readSheetsConfig()?.privateKey ?? '';
    expect(key.startsWith('"')).toBe(false);
    expect(key.endsWith('"')).toBe(false);
  });

  it('never throws when the sheet is not configured — logging must not block', async () => {
    vi.stubEnv('GOOGLE_SHEETS_ID', '');
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', '');
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', '');
    const { recordSignIn, recordAudit } = await load();
    await expect(recordSignIn({ email: 'a@b.com', name: 'A' })).resolves.toBe(false);
    await expect(
      recordAudit({
        email: 'a@b.com', website: 'example.com', market: 'in',
        overall: 70, seo: 70, aeo: 70, geo: 70, googleVisibility: 70, aiVisibility: 70,
        pagesCrawled: 10, criticalCount: 1, leadGrade: 'B', reportUrl: 'https://x/y',
      }),
    ).resolves.toBe(false);
  });

  it('swallows an authorisation failure instead of propagating it', async () => {
    configure('not-a-real-key');
    // A bad key makes the JWT client throw; the audit must still complete.
    const { recordSignIn } = await load();
    await expect(recordSignIn({ email: 'a@b.com', name: 'A' })).resolves.toBe(false);
  });

  it('exposes the column headers the sheet is created with', async () => {
    const { SHEET_HEADERS } = await load();
    expect(SHEET_HEADERS.users).toContain('Email');
    // The two things the sheet exists to capture.
    expect(SHEET_HEADERS.audits).toContain('Email');
    expect(SHEET_HEADERS.audits).toContain('Website audited');
  });
});
