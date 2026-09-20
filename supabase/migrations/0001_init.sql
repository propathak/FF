-- ---------------------------------------------------------------------------
-- Index Joy — initial schema
-- See docs/05-database.md for the reasoning behind each decision.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- --- enums -----------------------------------------------------------------
create type audit_status   as enum ('queued', 'running', 'complete', 'failed');
create type audit_mode     as enum ('A', 'B', 'C');
create type pillar         as enum ('seo', 'aeo', 'geo', 'ai');
create type finding_status as enum ('pass', 'warn', 'fail', 'opportunity', 'not_applicable', 'unavailable');
create type rec_horizon    as enum ('now', '30d', '90d');
create type level          as enum ('High', 'Medium', 'Low');
create type lead_status    as enum ('new_lead', 'contacted', 'meeting_booked', 'proposal_sent', 'client', 'lost');
create type lead_grade     as enum ('A', 'B', 'C', 'D');
create type user_role      as enum ('admin', 'analyst', 'client');
create type stage_status   as enum ('pending', 'running', 'done', 'failed', 'skipped');

-- --- identity --------------------------------------------------------------
create table users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  name        text,
  role        user_role not null default 'analyst',
  created_at  timestamptz not null default now()
);

create table brands (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  category        text,
  descriptor      text,
  wikidata_qid    text,
  open_page_rank  numeric(4,2),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- A brand can own several domains (ccTLDs, microsites, acquisitions).
create table domains (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references brands(id) on delete cascade,
  host        text not null,
  is_primary  boolean not null default true,
  market      text not null default 'global',
  created_at  timestamptz not null default now(),
  unique (host, market)
);

-- --- audits ----------------------------------------------------------------
create table audits (
  id                 uuid primary key default gen_random_uuid(),
  domain_id          uuid references domains(id) on delete set null,
  brand_id           uuid references brands(id) on delete set null,
  input_url          text not null,
  resolved_url       text,
  host               text not null,
  market             text not null default 'global',
  status             audit_status not null default 'queued',
  mode               audit_mode,
  -- Stamped so a weights change never silently rewrites history.
  scoring_version    text not null,
  overall_score      integer,
  seo_score          integer,
  aeo_score          integer,
  geo_score          integer,
  ai_presence_score  integer,
  google_visibility  integer,
  ai_visibility      integer,
  coverage           numeric(4,3),
  pages_crawled      integer not null default 0,
  urls_discovered    integer not null default 0,
  paid_enrichment    boolean not null default false,
  cost_cents         numeric(8,4) not null default 0,
  duration_ms        integer,
  error              text,
  -- Immutable snapshot: an old report must render exactly as it did on the day.
  result             jsonb,
  requester_email    text,
  requester_ip_hash  text,
  created_at         timestamptz not null default now(),
  completed_at       timestamptz
);

create index audits_domain_created_idx on audits (domain_id, created_at desc);
create index audits_host_created_idx   on audits (host, created_at desc);
create index audits_status_idx         on audits (status) where status in ('queued', 'running');

-- Pipeline checkpoints: a function timeout resumes instead of re-crawling.
create table audit_stages (
  id          uuid primary key default gen_random_uuid(),
  audit_id    uuid not null references audits(id) on delete cascade,
  stage       text not null,
  status      stage_status not null default 'pending',
  label       text,
  detail      text,
  error       text,
  duration_ms integer,
  started_at  timestamptz,
  finished_at timestamptz,
  unique (audit_id, stage)
);

create table audit_pages (
  id          uuid primary key default gen_random_uuid(),
  audit_id    uuid not null references audits(id) on delete cascade,
  url         text not null,
  final_url   text,
  status_code integer not null,
  depth       integer not null default 0,
  title       text,
  word_count  integer not null default 0,
  load_ms     integer,
  signals     jsonb
);

create index audit_pages_audit_idx on audit_pages (audit_id);

-- One findings table across all four pillars — see docs/05 §1.
create table findings (
  id            uuid primary key default gen_random_uuid(),
  audit_id      uuid not null references audits(id) on delete cascade,
  check_id      text not null,
  pillar        pillar not null,
  "group"       text not null,
  title         text not null,
  status        finding_status not null,
  score         numeric(4,3) not null,
  weight        numeric(6,2) not null,
  confidence    numeric(4,3) not null,
  summary       text not null,
  evidence      jsonb not null default '[]'::jsonb,
  affected_urls text[] not null default '{}'
);

create index findings_audit_idx    on findings (audit_id, pillar, status);
create index findings_check_idx    on findings (check_id, status);

create table recommendations (
  id             uuid primary key default gen_random_uuid(),
  audit_id       uuid not null references audits(id) on delete cascade,
  check_id       text not null,
  pillar         pillar not null,
  horizon        rec_horizon not null,
  title          text not null,
  problem        text not null,
  why_it_matters text not null,
  action         text not null,
  impact         level not null,
  effort         level not null,
  gated          boolean not null default false,
  sort_order     integer not null default 0
);

create index recommendations_audit_idx on recommendations (audit_id, horizon, sort_order);

create table competitors (
  id                  uuid primary key default gen_random_uuid(),
  audit_id            uuid not null references audits(id) on delete cascade,
  host                text not null,
  source              text not null default 'user',
  competitor_audit_id uuid references audits(id) on delete set null,
  status              text not null default 'ok',
  seo_score           integer,
  aeo_score           integer,
  geo_score           integer,
  ai_score            integer,
  overall_score       integer,
  pages_crawled       integer not null default 0,
  error               text
);

create index competitors_audit_idx on competitors (audit_id);

-- --- AI measurement audit trail --------------------------------------------
-- Stores the full prompt, engine, sample index and raw answer so any
-- share-of-voice figure can be reproduced or challenged.
create table ai_queries (
  id            uuid primary key default gen_random_uuid(),
  audit_id      uuid not null references audits(id) on delete cascade,
  prompt        text not null,
  engine        text not null,
  market        text not null default 'global',
  sample_index  integer not null default 0,
  answer_text   text,
  cited_domains text[] not null default '{}',
  created_at    timestamptz not null default now()
);

create index ai_queries_audit_idx on ai_queries (audit_id, engine);

create table ai_mentions (
  id           uuid primary key default gen_random_uuid(),
  ai_query_id  uuid not null references ai_queries(id) on delete cascade,
  audit_id     uuid not null references audits(id) on delete cascade,
  brand_name   text not null,
  is_target    boolean not null default false,
  ordinal      integer,
  cited        boolean not null default false,
  sentiment    text
);

create index ai_mentions_audit_idx on ai_mentions (audit_id, is_target);

create table question_gaps (
  id          uuid primary key default gen_random_uuid(),
  audit_id    uuid not null references audits(id) on delete cascade,
  question    text not null,
  intent      text not null,
  answered    boolean not null default false,
  matched_url text,
  value       numeric(3,2) not null default 0.5
);

create index question_gaps_audit_idx on question_gaps (audit_id, answered);

-- --- leads and pipeline ----------------------------------------------------
create table leads (
  id                   uuid primary key default gen_random_uuid(),
  audit_id             uuid references audits(id) on delete set null,
  brand_id             uuid references brands(id) on delete set null,
  name                 text,
  company              text,
  designation          text,
  email                text not null,
  phone                text,
  budget_band          text,
  is_free_email        boolean not null default false,
  -- The strongest single qualification signal: a stakeholder, not a lurker.
  email_matches_domain boolean not null default false,
  lead_score           integer not null default 0,
  grade                lead_grade not null default 'D',
  status               lead_status not null default 'new_lead',
  notes                text,
  source               text not null default 'report_unlock',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index leads_grade_status_idx on leads (grade, status, created_at desc);
create index leads_email_idx        on leads (email);

create table appointments (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references leads(id) on delete cascade,
  provider     text not null default 'cal.com',
  external_id  text,
  scheduled_at timestamptz,
  status       text not null default 'booked',
  created_at   timestamptz not null default now()
);

create table reports (
  id            uuid primary key default gen_random_uuid(),
  audit_id      uuid not null references audits(id) on delete cascade,
  format        text not null default 'pdf',
  storage_path  text,
  share_token   text not null unique,
  downloaded_at timestamptz,
  created_at    timestamptz not null default now()
);

-- --- response cache --------------------------------------------------------
-- Postgres rather than Redis at V1 volumes: one datastore, and cache hits stay
-- auditable when reconciling an API bill.
create table api_cache (
  cache_key  text primary key,
  provider   text not null,
  payload    jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index api_cache_expiry_idx on api_cache (expires_at);

create table rate_limits (
  id         uuid primary key default gen_random_uuid(),
  scope      text not null,
  key        text not null,
  window_start timestamptz not null,
  count      integer not null default 1,
  unique (scope, key, window_start)
);

-- --- row level security ----------------------------------------------------
-- Deny by default everywhere. V1 accesses the database exclusively through the
-- server with the service role, so the failure mode of a future mistake is
-- "no data" rather than "everyone's data".
alter table users            enable row level security;
alter table brands           enable row level security;
alter table domains          enable row level security;
alter table audits           enable row level security;
alter table audit_stages     enable row level security;
alter table audit_pages      enable row level security;
alter table findings         enable row level security;
alter table recommendations  enable row level security;
alter table competitors      enable row level security;
alter table ai_queries       enable row level security;
alter table ai_mentions      enable row level security;
alter table question_gaps    enable row level security;
alter table leads            enable row level security;
alter table appointments     enable row level security;
alter table reports          enable row level security;
alter table api_cache        enable row level security;
alter table rate_limits      enable row level security;

-- --- convenience view for the admin lead table -----------------------------
create view lead_dashboard as
select
  l.id, l.created_at, l.name, l.company, l.designation, l.email, l.phone,
  l.budget_band, l.lead_score, l.grade, l.status,
  l.is_free_email, l.email_matches_domain,
  a.host, a.overall_score, a.seo_score, a.aeo_score, a.geo_score,
  a.ai_presence_score, a.pages_crawled, a.mode,
  exists (select 1 from appointments ap where ap.lead_id = l.id) as has_booking
from leads l
left join audits a on a.id = l.audit_id;
