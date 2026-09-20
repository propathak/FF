# Index Joy

**Find out how visible your brand is across Google and AI — and what is stopping customers
from finding you.**

A production-ready audit engine and lead-generation product that scores a brand's visibility
across four pillars — **SEO**, **AEO** (answer engines), **GEO** (generative engines) and
**AI Presence** — and turns the findings into a report a marketing decision-maker will act on.

---

## The one thing that makes this different

**No number in this product is invented.**

Every score derives from deterministic checks over signals observed on the site, each carrying its
own evidence, weight and confidence. The LLM writes the explanations; it never produces a number —
and that constraint is enforced by an automated test, not a comment.

When something cannot be measured, the report says **"not measured"** and removes that signal from
both sides of the scoring fraction, so a missing API key can never lower a customer's score. When a
crawl is blocked, the audit **fails loudly** rather than scoring a site it could not read.

Most notably: **we never report a "ChatGPT ranking."** No API exposes what the ChatGPT application
shows a user, so any such number would be fabricated. What we *do* measure, and why that is
stronger, is in [`docs/06-limitations.md`](docs/06-limitations.md).

---

## Quick start

```bash
npm install
cp .env.example .env.local     # every key is optional
npm run dev                    # → http://localhost:3000
```

It runs a complete audit with **zero paid API keys** and honestly labels everything it could not
measure. Google sign-in is the one thing you do need configured to run an audit through the web
UI — see [`docs/09-signin-and-sheet.md`](docs/09-signin-and-sheet.md), or use the CLI below,
which needs no auth at all.

### Audit a site from the command line

```bash
npm run audit:cli -- https://example.com --pages=25 --market=in
npm run audit:cli -- https://example.com --json > report.json
```

### Run against the bundled fixture sites

```bash
npm run fixture         # a well-optimised site on :8799
npm run fixture:poor    # a poorly-optimised site on :8800

AUDIT_ALLOW_LOCAL=1 npm run dev
# then audit http://127.0.0.1:8799 with http://127.0.0.1:8800 as a competitor
```

### Tests

```bash
npm test         # 82 tests; 89 with a database attached via TEST_DATABASE_URL
npm run build
```

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/01-product-architecture.md`](docs/01-product-architecture.md) | System architecture, MVP feature list, user journey, tech-stack decisions, wireframes, lead-gen strategy, what is deliberately **not** in V1 |
| [`docs/02-audit-methodology.md`](docs/02-audit-methodology.md) | Every check, what it observes, and the AI-crawler taxonomy |
| [`docs/03-scoring-methodology.md`](docs/03-scoring-methodology.md) | The scoring engine, the weights (and why they differ from the obvious ones), lead scoring |
| [`docs/04-api-research.md`](docs/04-api-research.md) | API comparison with cited sources, free vs paid, **cost per audit ≈ $0.05–$0.28** |
| [`docs/05-database.md`](docs/05-database.md) | Schema design and the reasoning behind each decision |
| [`docs/06-limitations.md`](docs/06-limitations.md) | What cannot be measured and why — the product's main credibility asset |
| [`docs/07-roadmap.md`](docs/07-roadmap.md) | Phases 1–4, with the sequencing risk that would make me reorder them |
| [`docs/08-deployment.md`](docs/08-deployment.md) | Deploying to **indexjoy.com** — Vercel, the database and GoDaddy DNS, step by step |
| [`docs/09-signin-and-sheet.md`](docs/09-signin-and-sheet.md) | Google sign-in and the Google Sheet — the two pieces of Google setup |

---

## Architecture

```
URL → discovery → crawl → parse → enrich → analyse → score → interpret → recommend → report
```

- **`src/engine/`** — the audit engine. Imports nothing from Next.js or React, so it lifts into a
  standalone worker in Phase 3 without a rewrite. A test enforces this.
- **`src/engine/scoring/`** — pure functions, no I/O, no model client. A test enforces this too.
- **`src/app/api/`** — route handlers. The audit continues after the response flushes so the
  browser renders live stage progress instead of a spinner.
- **`src/lib/repository.ts`** — persistence behind one interface: an in-memory driver (zero
  config), a portable SQL driver for any Postgres (`DATABASE_URL`), and a Supabase REST driver.
- **`supabase/migrations/`** — the full schema, RLS deny-by-default.

**No raw page HTML ever reaches an LLM.** Each page reduces to a ~2 KB typed signal object, so a
25-page crawl costs 6–10K input tokens at the model boundary instead of 1–2M.

---

## Cost per audit

| Tier | What runs | Cost |
|---|---|---|
| **0 — anonymous visitor** | Crawl, PageSpeed, CrUX, Wikidata, Open PageRank, LLM prose | **≈ $0.05** |
| **1 — after email capture** | + SERP / Google AI Overview enrichment | **+ ≈ $0.024** |
| **2 — full Mode A** | + sampled AI assistant answers | **+ ≈ $0.22** |

Paid enrichment fires only for qualified runs, so cost is incurred on leads rather than on traffic.
Full working in [`docs/04-api-research.md`](docs/04-api-research.md).

---

## Deploying

See [`docs/08-deployment.md`](docs/08-deployment.md) for the full walkthrough. The short version:

1. Create a Postgres database, then apply the schema with one command:

   ```bash
   npm run db:migrate -- "postgresql://…"
   ```

   It is standard SQL and works on any provider — and it is idempotent, so re-running is a
   no-op. The quickest route is Vercel → **Storage → Create Database → Neon**, which provisions
   it and sets `DATABASE_URL` for you. See [`docs/08-deployment.md`](docs/08-deployment.md) §2.
2. Import the repo at [vercel.com/new](https://vercel.com/new), add the variables from
   [`.env.production.example`](.env.production.example), and enable **Fluid compute**.
3. Add `indexjoy.com` in Vercel, then create the A and CNAME records it shows you in GoDaddy.
4. Set up Google sign-in and the Sheet — [`docs/09-signin-and-sheet.md`](docs/09-signin-and-sheet.md).

A database is **required** in production: each serverless invocation is a separate instance, so
without one the audit that gets written by one request would 404 when polled by another. The API
returns an explicit 503 rather than failing that way silently.

## Status

**Phase 1 is complete and running.** Phases 2–4 are specified in
[`docs/07-roadmap.md`](docs/07-roadmap.md).
