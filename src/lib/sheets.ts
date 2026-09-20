import { JWT } from 'google-auth-library';

/**
 * Google Sheets logging.
 *
 * Two tabs in one spreadsheet:
 *   Users  — one row per person, the first time they sign in
 *   Audits — one row per audit, with the website they checked and its scores
 *
 * Design rule: the sheet is a reporting surface, never a dependency. Every
 * function here swallows its own errors and returns a boolean. A revoked key
 * or a renamed tab must never stop somebody signing in or running an audit —
 * Postgres remains the source of truth and the sheet can be rebuilt from it.
 */

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export const USERS_TAB = 'Users';
export const AUDITS_TAB = 'Audits';

const USERS_HEADERS = ['First signed in', 'Email', 'Name'] as const;
const AUDITS_HEADERS = [
  'Date', 'Email', 'Website audited', 'Market',
  'Overall', 'SEO', 'AEO', 'GEO', 'Google visibility', 'AI visibility',
  'Pages crawled', 'Critical issues', 'Lead grade', 'Report link',
] as const;

interface SheetsConfig {
  spreadsheetId: string;
  clientEmail: string;
  privateKey: string;
}

export function readSheetsConfig(): SheetsConfig | null {
  const spreadsheetId = process.env['GOOGLE_SHEETS_ID'];
  const clientEmail = process.env['GOOGLE_SERVICE_ACCOUNT_EMAIL'];
  const rawKey = process.env['GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'];
  if (!spreadsheetId || !clientEmail || !rawKey) return null;
  return {
    spreadsheetId,
    clientEmail,
    // Environment variables cannot hold real newlines, so the key is stored
    // with literal \n sequences and restored here. Surrounding quotes are
    // stripped too — pasting the value out of the JSON key file keeps them,
    // and the resulting key fails to parse with a confusing error.
    privateKey: rawKey.replace(/\\n/g, '\n').replace(/^"|"$/g, ''),
  };
}

export function isSheetsConfigured(): boolean {
  return readSheetsConfig() !== null;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function accessToken(config: SheetsConfig): Promise<string | null> {
  // Tokens last an hour; re-minting one per request would add latency and
  // rate-limit pressure for no benefit.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  try {
    const client = new JWT({
      email: config.clientEmail,
      key: config.privateKey,
      scopes: SCOPES,
    });
    const { access_token: token } = await client.authorize();
    if (!token) return null;
    cachedToken = { token, expiresAt: Date.now() + 50 * 60_000 };
    return token;
  } catch (err) {
    console.error('[sheets] could not authorise service account:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function call<T>(
  config: SheetsConfig,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const token = await accessToken(config);
  if (!token) return null;
  try {
    const response = await fetch(`${SHEETS_API}/${config.spreadsheetId}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`[sheets] ${init?.method ?? 'GET'} ${path} → ${response.status}: ${body.slice(0, 300)}`);
      return null;
    }
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  } catch (err) {
    console.error('[sheets] request failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

interface SpreadsheetMeta {
  sheets?: { properties?: { title?: string } }[];
}

/**
 * Creates the tab and writes its header row if it is missing, so setup is
 * "create a blank spreadsheet and share it" rather than a formatting exercise.
 */
async function ensureTab(
  config: SheetsConfig,
  title: string,
  headers: readonly string[],
): Promise<boolean> {
  const meta = await call<SpreadsheetMeta>(config, '?fields=sheets.properties.title');
  if (!meta) return false;
  const exists = (meta.sheets ?? []).some((s) => s.properties?.title === title);
  if (exists) return true;

  const created = await call(config, ':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
  });
  if (!created) return false;

  await call(config, `/values/${encodeURIComponent(`${title}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({ values: [headers] }),
  });
  return true;
}

async function appendRow(
  config: SheetsConfig,
  title: string,
  headers: readonly string[],
  row: (string | number | null)[],
): Promise<boolean> {
  if (!(await ensureTab(config, title, headers))) return false;
  const result = await call(
    config,
    `/values/${encodeURIComponent(`${title}!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: [row.map((v) => v ?? '')] }) },
  );
  return result !== null;
}

interface ValueRange {
  values?: string[][];
}

/** True when this email already has a row in the Users tab. */
async function userExists(config: SheetsConfig, email: string): Promise<boolean> {
  const range = encodeURIComponent(`${USERS_TAB}!B2:B`);
  const result = await call<ValueRange>(config, `/values/${range}`);
  if (!result) return false;
  const needle = email.trim().toLowerCase();
  return (result.values ?? []).some((row) => (row[0] ?? '').trim().toLowerCase() === needle);
}

export async function recordSignIn(user: { email: string; name?: string | null }): Promise<boolean> {
  const config = readSheetsConfig();
  if (!config) return false;
  try {
    if (!(await ensureTab(config, USERS_TAB, USERS_HEADERS))) return false;
    // One row per person, not one per session — the sheet is a list of who
    // has access, and the Audits tab already records activity over time.
    if (await userExists(config, user.email)) return true;
    return await appendRow(config, USERS_TAB, USERS_HEADERS, [
      new Date().toISOString(),
      user.email,
      user.name ?? '',
    ]);
  } catch (err) {
    console.error('[sheets] recordSignIn failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

export interface AuditLogRow {
  email: string;
  website: string;
  market: string;
  overall: number | null;
  seo: number | null;
  aeo: number | null;
  geo: number | null;
  googleVisibility: number | null;
  aiVisibility: number | null;
  pagesCrawled: number;
  criticalCount: number;
  leadGrade: string | null;
  reportUrl: string;
}

export async function recordAudit(row: AuditLogRow): Promise<boolean> {
  const config = readSheetsConfig();
  if (!config) return false;
  try {
    return await appendRow(config, AUDITS_TAB, AUDITS_HEADERS, [
      new Date().toISOString(),
      row.email,
      row.website,
      row.market,
      row.overall,
      row.seo,
      row.aeo,
      row.geo,
      row.googleVisibility,
      row.aiVisibility,
      row.pagesCrawled,
      row.criticalCount,
      row.leadGrade,
      row.reportUrl,
    ]);
  } catch (err) {
    console.error('[sheets] recordAudit failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

export const SHEET_HEADERS = { users: USERS_HEADERS, audits: AUDITS_HEADERS };
