# 05 — Database Architecture

Postgres (Supabase). Full DDL lives in `supabase/migrations/0001_init.sql` — this document
explains the shape and the decisions behind it.

## Entity map

```
users ──┐
        ├──< brands ──< domains ──< audits ──┬──< audit_pages
leads ──┘                              │     ├──< findings            (all 4 pillars, one table)
                                       │     ├──< recommendations
                                       │     ├──< competitors ──< competitor_audits ─→ audits
                                       │     ├──< ai_queries ──< ai_mentions
                                       │     └──< reports
                                       └──< audit_stages              (pipeline checkpointing)
leads ──< appointments
api_cache  (standalone, TTL)
```

## Key decisions

**1. One `findings` table, not four.** `seo_findings` / `aeo_findings` / `geo_findings` as
separate tables would triple the query surface and make cross-pillar analytics ("which check most
predicts a booked meeting?") a three-way union. A single table with a `pillar` enum and a JSONB
`evidence` column is strictly better here, and the check `id` gives all the structure needed.

**2. `audits` stores both the normalised scores and a full `result` JSONB snapshot.** The columns
power SQL analytics and the trend chart; the snapshot guarantees an old report renders exactly as
it did the day it ran, even after the engine changes. Reports are a trust artefact — they must be
immutable.

**3. `scoring_version` on every audit.** Non-negotiable for the Phase 4 client-reporting promise
(`47 → 58 → 69 → 82`). Without it, a weights change silently rewrites history and destroys
the credibility of the trend line.

**4. `domains` separate from `brands`.** A brand can own several domains (ccTLDs, microsites,
acquired properties). Getting this wrong now means a painful migration exactly when the agency
lands its first multi-domain client.

**5. `audit_stages` exists so the pipeline is resumable.** Each row is `(audit_id, stage, status,
started_at, finished_at, error, output_ref)`. A function timeout resumes at the next incomplete
stage instead of re-crawling — the difference between a 4% and a 0.4% failure rate on slow sites.

**6. `api_cache` is a first-class table, not Redis.** At V1 volumes Postgres is fast enough, keeps
the stack to one datastore, and makes cache hits auditable when reconciling an API bill.
Key: `sha256(provider || ':' || normalised_query || ':' || market)`.

**7. `leads` is decoupled from `audits` via `audit_id` nullable FK.** Leads arrive from the
unlock form, the booking widget, or manual entry. Forcing every lead to own an audit would break
the "add a lead from a conference" case that appears the week after launch.

**8. `ai_queries` / `ai_mentions` store the full prompt, engine, sample index, raw answer text and
extracted mentions.** This is the audit trail that makes a share-of-voice number defensible, and
in Phase 3 it becomes the prompt-tracking time series with no schema change.

## Table reference (abridged)

| Table | Purpose | Notable columns |
|---|---|---|
| `users` | Agency operators (Phase 4: client logins) | `role` (`admin`/`analyst`/`client`) |
| `brands` | The audited company | `name`, `category`, `wikidata_qid`, `open_page_rank` |
| `domains` | Hostnames belonging to a brand | `host`, `is_primary`, `market` |
| `audits` | One run | `status`, `mode` (`A`/`B`/`C`), `overall_score`, `seo_score`, `aeo_score`, `geo_score`, `ai_presence_score`, `coverage`, `scoring_version`, `result` JSONB, `cost_cents` |
| `audit_stages` | Pipeline checkpoints | `stage`, `status`, `error`, `duration_ms` |
| `audit_pages` | Per-page crawl record | `url`, `status_code`, `depth`, `title`, `word_count`, `signals` JSONB |
| `findings` | Every check result | `check_id`, `pillar`, `group`, `status`, `score`, `weight`, `confidence`, `evidence` JSONB, `affected_urls` |
| `recommendations` | Generated actions | `horizon` (`now`/`30d`/`90d`), `impact`, `effort`, `problem`, `why`, `action`, `gated` |
| `competitors` | Competitor set for an audit | `host`, `source` (`user`/`serp`), `competitor_audit_id` |
| `ai_queries` | Prompts executed | `prompt`, `engine`, `market`, `sample_index`, `answer_text`, `cited_domains` |
| `ai_mentions` | Extracted brand mentions | `brand_name`, `is_target`, `ordinal`, `sentiment`, `cited` |
| `leads` | Captured leads | `name`, `company`, `designation`, `email`, `phone`, `budget_band`, `lead_score`, `grade`, `status`, `is_free_email`, `email_matches_domain` |
| `appointments` | Bookings | `provider`, `external_id`, `scheduled_at`, `status` |
| `reports` | Generated artefacts | `format`, `storage_path`, `share_token`, `downloaded_at` |
| `api_cache` | Response cache | `cache_key`, `provider`, `payload` JSONB, `expires_at` |

## Indexes that matter

```sql
create index on audits (domain_id, created_at desc);        -- trend chart
create index on findings (audit_id, pillar, status);        -- report render
create index on findings (check_id, status);                -- cross-audit analytics
create index on leads (grade, status, created_at desc);     -- admin table default sort
create unique index on api_cache (cache_key);
create index on api_cache (expires_at);                     -- TTL sweep
create index on ai_queries (audit_id, engine);
```

## Row-level security posture

V1 runs all database access through the server with the service role; no client ever holds a
Supabase key. RLS is enabled with deny-by-default policies on every table so that when Phase 4
introduces client logins, the failure mode of a mistake is "no data" rather than "everyone's data".
The `reports.share_token` column is the only public read path, and it is a 128-bit random token
checked server-side, not a policy exemption.
