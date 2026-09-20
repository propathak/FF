import type { AuditResult, StageEvent } from '@/engine/types';
import type { LeadScoreResult } from './lead-score';

/**
 * Persistence.
 *
 * Two drivers behind one interface:
 *   - `memory`   (default) so the app runs end to end with zero configuration
 *   - `supabase` via PostgREST over fetch, no extra SDK dependency
 *
 * The audit row stores both the normalised score columns (for SQL analytics and
 * the trend chart) and the full immutable `result` snapshot (so an old report
 * renders exactly as it did the day it ran).
 */

export type AuditRowStatus = 'queued' | 'running' | 'complete' | 'failed';

export interface AuditRow {
  id: string;
  input_url: string;
  host: string;
  market: string;
  status: AuditRowStatus;
  scoring_version: string;
  mode: string | null;
  overall_score: number | null;
  seo_score: number | null;
  aeo_score: number | null;
  geo_score: number | null;
  ai_presence_score: number | null;
  google_visibility: number | null;
  ai_visibility: number | null;
  pages_crawled: number;
  urls_discovered: number;
  paid_enrichment: boolean;
  duration_ms: number | null;
  error: string | null;
  result: AuditResult | null;
  requester_email: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface LeadRow {
  id: string;
  audit_id: string | null;
  name: string | null;
  company: string | null;
  designation: string | null;
  email: string;
  phone: string | null;
  budget_band: string | null;
  is_free_email: boolean;
  email_matches_domain: boolean;
  lead_score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  status: 'new_lead' | 'contacted' | 'meeting_booked' | 'proposal_sent' | 'client' | 'lost';
  source: string;
  created_at: string;
  /** Denormalised for the admin table so it renders in one query. */
  host: string | null;
  overall_score: number | null;
}

export interface Repository {
  driver: 'memory' | 'supabase';
  createAudit(row: Omit<AuditRow, 'created_at' | 'completed_at'>): Promise<AuditRow>;
  updateAudit(id: string, patch: Partial<AuditRow>): Promise<void>;
  getAudit(id: string): Promise<AuditRow | null>;
  listAuditsForHost(host: string, limit?: number): Promise<AuditRow[]>;
  recordStage(auditId: string, event: StageEvent): Promise<void>;
  getStages(auditId: string): Promise<StageEvent[]>;
  createLead(row: Omit<LeadRow, 'id' | 'created_at'>): Promise<LeadRow>;
  listLeads(limit?: number): Promise<LeadRow[]>;
  updateLeadStatus(id: string, status: LeadRow['status']): Promise<void>;
  /** Returns true when the action is permitted. */
  consumeRateLimit(scope: string, key: string, limit: number, windowMs: number): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// In-memory driver
// ---------------------------------------------------------------------------

/**
 * The in-memory store is parked on `globalThis`, not in module scope.
 *
 * Next.js gives each route handler its own module instance (separate bundles in
 * dev, separate lambdas in production), so plain module-level state is NOT
 * shared between `POST /api/audits` and `GET /api/audits/[id]` — the audit
 * would be written by one route and invisible to the other. Pinning it to the
 * process globals makes the zero-config path genuinely work in dev and under
 * `next start`.
 *
 * It is still per-process: a multi-instance serverless deployment needs a real
 * database. The API reports the active driver and the report UI says so, so
 * this is never a silent surprise.
 */
interface MemoryStore {
  audits: Map<string, AuditRow>;
  stages: Map<string, StageEvent[]>;
  leads: Map<string, LeadRow>;
  rateBuckets: Map<string, { count: number; resetAt: number }>;
}

const STORE_KEY = Symbol.for('indexjoy.memory-store');

function memoryStore(): MemoryStore {
  const globals = globalThis as unknown as Record<symbol, MemoryStore | undefined>;
  const existing = globals[STORE_KEY];
  if (existing) return existing;
  const created: MemoryStore = {
    audits: new Map(),
    stages: new Map(),
    leads: new Map(),
    rateBuckets: new Map(),
  };
  globals[STORE_KEY] = created;
  return created;
}

function memoryRepository(): Repository {
  return {
    driver: 'memory',
    async createAudit(row) {
      const full: AuditRow = { ...row, created_at: new Date().toISOString(), completed_at: null };
      memoryStore().audits.set(full.id, full);
      return full;
    },
    async updateAudit(id, patch) {
      const store = memoryStore();
      const existing = store.audits.get(id);
      if (existing) store.audits.set(id, { ...existing, ...patch });
    },
    async getAudit(id) {
      return memoryStore().audits.get(id) ?? null;
    },
    async listAuditsForHost(host, limit = 20) {
      return [...memoryStore().audits.values()]
        .filter((a) => a.host === host && a.status === 'complete')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);
    },
    async recordStage(auditId, event) {
      const store = memoryStore();
      const list = store.stages.get(auditId) ?? [];
      const index = list.findIndex((s) => s.stage === event.stage);
      if (index >= 0) list[index] = event;
      else list.push(event);
      store.stages.set(auditId, list);
    },
    async getStages(auditId) {
      return memoryStore().stages.get(auditId) ?? [];
    },
    async createLead(row) {
      const full: LeadRow = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() };
      memoryStore().leads.set(full.id, full);
      return full;
    },
    async listLeads(limit = 200) {
      return [...memoryStore().leads.values()]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);
    },
    async updateLeadStatus(id, status) {
      const store = memoryStore();
      const existing = store.leads.get(id);
      if (existing) store.leads.set(id, { ...existing, status });
    },
    async consumeRateLimit(scope, key, limit, windowMs) {
      const store = memoryStore();
      const bucketKey = `${scope}:${key}`;
      const now = Date.now();
      const bucket = store.rateBuckets.get(bucketKey);
      if (!bucket || bucket.resetAt <= now) {
        store.rateBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (bucket.count >= limit) return false;
      bucket.count += 1;
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase driver (PostgREST over fetch — no SDK dependency)
// ---------------------------------------------------------------------------

function supabaseRepository(url: string, serviceKey: string): Repository {
  const base = `${url.replace(/\/$/, '')}/rest/v1`;
  const headers = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    'content-type': 'application/json',
  };

  async function request<T>(
    path: string,
    init: RequestInit & { prefer?: string } = {},
  ): Promise<T | null> {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers, ...(init.prefer ? { prefer: init.prefer } : {}), ...(init.headers ?? {}) },
    });
    if (!response.ok) {
      throw new Error(`Supabase ${init.method ?? 'GET'} ${path} failed: ${response.status} ${await response.text()}`);
    }
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : null;
  }

  return {
    driver: 'supabase',
    async createAudit(row) {
      const [created] = (await request<AuditRow[]>('/audits', {
        method: 'POST',
        prefer: 'return=representation',
        body: JSON.stringify(row),
      })) ?? [];
      if (!created) throw new Error('Supabase did not return the created audit row');
      return created;
    },
    async updateAudit(id, patch) {
      await request(`/audits?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    },
    async getAudit(id) {
      const rows = await request<AuditRow[]>(`/audits?id=eq.${id}&select=*&limit=1`);
      return rows?.[0] ?? null;
    },
    async listAuditsForHost(host, limit = 20) {
      return (
        (await request<AuditRow[]>(
          `/audits?host=eq.${encodeURIComponent(host)}&status=eq.complete&select=*&order=created_at.desc&limit=${limit}`,
        )) ?? []
      );
    },
    async recordStage(auditId, event) {
      await request('/audit_stages', {
        method: 'POST',
        // Upsert so a resumed pipeline updates its checkpoint in place.
        prefer: 'resolution=merge-duplicates',
        body: JSON.stringify({
          audit_id: auditId,
          stage: event.stage,
          status: event.status === 'running' ? 'running' : event.status,
          label: event.label,
          detail: event.detail ?? null,
          finished_at: event.status === 'done' ? event.at : null,
        }),
      });
    },
    async getStages(auditId) {
      const rows = await request<{ stage: string; status: string; label: string; detail: string | null; finished_at: string | null }[]>(
        `/audit_stages?audit_id=eq.${auditId}&select=*`,
      );
      return (rows ?? []).map((r) => ({
        stage: r.stage as StageEvent['stage'],
        status: r.status as StageEvent['status'],
        label: r.label,
        detail: r.detail ?? undefined,
        at: r.finished_at ?? new Date().toISOString(),
      }));
    },
    async createLead(row) {
      const [created] = (await request<LeadRow[]>('/leads', {
        method: 'POST',
        prefer: 'return=representation',
        body: JSON.stringify({
          audit_id: row.audit_id, name: row.name, company: row.company,
          designation: row.designation, email: row.email, phone: row.phone,
          budget_band: row.budget_band, is_free_email: row.is_free_email,
          email_matches_domain: row.email_matches_domain, lead_score: row.lead_score,
          grade: row.grade, status: row.status, source: row.source,
        }),
      })) ?? [];
      if (!created) throw new Error('Supabase did not return the created lead row');
      return { ...created, host: row.host, overall_score: row.overall_score };
    },
    async listLeads(limit = 200) {
      return (
        (await request<LeadRow[]>(`/lead_dashboard?select=*&order=created_at.desc&limit=${limit}`)) ?? []
      );
    },
    async updateLeadStatus(id, status) {
      await request(`/leads?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    },
    async consumeRateLimit(scope, key, limit, windowMs) {
      const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();
      const rows = await request<{ count: number }[]>(
        `/rate_limits?scope=eq.${scope}&key=eq.${encodeURIComponent(key)}&window_start=eq.${windowStart}&select=count`,
      );
      const current = rows?.[0]?.count ?? 0;
      if (current >= limit) return false;
      await request('/rate_limits', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates',
        body: JSON.stringify({ scope, key, window_start: windowStart, count: current + 1 }),
      });
      return true;
    },
  };
}

let cached: Repository | null = null;

/**
 * True when the app is running without a durable store on a platform where
 * each request may land on a different instance.
 *
 * This combination is silently broken rather than obviously broken: the POST
 * that creates an audit and the GET that polls it can hit different lambdas, so
 * the browser gets a 404 for an audit that was created successfully. The API
 * checks this and returns an actionable error instead.
 */
export function isEphemeralInProduction(): boolean {
  return getRepository().driver === 'memory' && process.env.NODE_ENV === 'production';
}

export function getRepository(): Repository {
  if (cached) return cached;
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  cached = url && key ? supabaseRepository(url, key) : memoryRepository();
  return cached;
}

/** Test-only reset so suites do not leak state between cases. */
export function __resetMemoryStore(): void {
  const globals = globalThis as unknown as Record<symbol, unknown>;
  delete globals[STORE_KEY];
  cached = null;
}
