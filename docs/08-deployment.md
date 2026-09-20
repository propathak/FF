# 08 — Deploying Index Joy to indexjoy.com

Target: **Vercel** for the app, **Supabase** for the database, **GoDaddy** for DNS only.

Total time about 45 minutes, most of it waiting for DNS. Fixed cost at launch is
**~$45/month** (Supabase Pro $25 + Resend Pro $20); Vercel's Hobby tier is enough until
traffic justifies Pro.

---

## Before you start

| You need | Where | Note |
|---|---|---|
| The GitHub repo | `propathak/FF`, branch `claude/ai-seo-visibility-audit-dx9j2v` | Already pushed |
| A Vercel account | [vercel.com/signup](https://vercel.com/signup) | Sign in with GitHub |
| A Supabase account | [supabase.com](https://supabase.com) | Free to create; go Pro before launch — see §2 |
| GoDaddy access | Your domain portfolio | DNS editing only; you are **not** moving the registrar |

---

## Step 1 — Merge the branch (optional but tidy)

Vercel can deploy any branch, but production usually tracks the default branch. Either open a
pull request and merge `claude/ai-seo-visibility-audit-dx9j2v` into `main`, or skip this and
point Vercel at the branch directly in Step 3.

---

## Step 2 — Choose a database

The app talks **plain Postgres**. `supabase/migrations/0001_init.sql` is standard SQL — it has
been verified to apply unchanged to a vanilla PostgreSQL 16 server — so you are not tied to any
one provider.

Set **`DATABASE_URL`** and the app uses the portable SQL driver. Set `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` instead and it uses Supabase's REST API. `DATABASE_URL` wins if both
are present.

### The options

| Provider | Free tier | Paid entry | Idle behaviour | Verdict |
|---|---|---|---|---|
| **Neon** | 0.5 GB, 100 compute-hours/month, no card | No monthly minimum since Dec 2025; ~$0.106/CU-hour + $0.35/GB-month | Suspends after 5 min, **~500 ms cold start**, resumes automatically | **Recommended.** The only one whose free tier survives an idle week. |
| **Supabase** | 0.5 GB, 1 GB storage | $25/month Pro | **Project pauses after a week idle** and needs manual restore | Fine, but the free tier is a trap for a lead-gen site between campaigns |
| **Railway** | None (a $5 credit, not a free tier) | $5/month Hobby + usage | Always on | Good if you already use Railway |
| **Render** | 1 GB, but **expires 30 days** after creation, then deleted after a 14-day grace period | ~$7/month | Always on | Avoid — the free database deletes itself |
| **Self-hosted** (Hetzner, DigitalOcean) | — | ~$5/month VPS | Always on | Cheapest at scale, but you own backups, patching and a connection pooler |

### Why Neon for this app specifically

The thing that makes Supabase Free unusable here — the week-long idle pause — is exactly the
pattern a lead-generation site has between campaigns. Neon suspends instead of pausing: the first
request after idle pays about half a second, then it is warm. For a product whose audits already
take 40 seconds, that is invisible.

It is also a real cost difference at low volume. Supabase's answer to "don't pause" is $25/month.
Neon has had no monthly minimum since December 2025, so a quiet month genuinely costs a few
dollars.

### Set up Neon — the short way

You do not need a Neon account. Create the database **from inside Vercel**, which sets
`DATABASE_URL` for you:

1. In your Vercel project → **Storage** → **Create Database** → **Neon** (Serverless Postgres)
   → pick a region → **Create**.
2. Vercel provisions it and injects `DATABASE_URL` (pooled) plus a legacy `POSTGRES_URL`. The
   app reads either, so there is nothing to copy.
3. Create the tables. Three ways, in order of least effort:

   | | How |
   |---|---|
   | **No terminal** | Deploy first, then open `/admin` and click **Create the tables**. The button appears automatically whenever a database is connected but empty. |
   | **Vercel dashboard** | Storage → your database → the **Query** tab (not "Browse data", which is the read-only Data tab) → paste [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) → Run. |
   | **Terminal** | `npx vercel env pull .env.local` then `npm run db:migrate`. |

That is the whole step. The migration is idempotent and create-only — it adds tables, indexes and
enums and never drops or alters data — so running it twice is a no-op. Useful when you are not
certain the last attempt finished.

> The `/admin` button is gated on a Google session whose email is in `ADMIN_EMAILS`. Anonymous
> and non-admin requests get a 401.

### Set up Neon — the direct way

If you would rather own the Neon account:

1. Create a project at [neon.com](https://neon.com). Pick the region closest to your customers.
2. **Connection Details** → copy the **pooled** connection string. It has `-pooler` in the
   hostname and ends in `?sslmode=require`:

   ```
   DATABASE_URL=postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require
   ```
3. Apply the schema:

   ```bash
   npm run db:migrate -- "postgresql://…"
   ```

   No SQL editor, no copy-paste. If you prefer the editor, pasting
   [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) into Neon's
   **SQL Editor** and pressing Run does exactly the same thing.

> **Always use the pooled connection string on Vercel.** Every serverless invocation is its own
> process. Without pooling, a traffic spike opens hundreds of connections and the server starts
> refusing them. The app already pins one pool per instance, but the provider's pooler is what
> makes that safe at scale. The same rule applies to Supabase (use the pooler port) and to a
> self-hosted server (put PgBouncer in front of it).

### If you prefer Supabase

### Setting it up

1. Create a new Supabase project. Pick the region closest to your customers
   (`ap-south-1` Mumbai for India, `us-east-1` for the US).
2. **Upgrade the project to Pro ($25/month) before launch.** Free projects pause after a week of
   inactivity — which is exactly what happens to a new lead-gen site between campaigns, and a
   paused database means every audit fails.
3. Open **SQL Editor → New query**, paste the entire contents of
   [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql), and run it.
4. Go to **Project Settings → API** and copy:
   - the **Project URL** → `SUPABASE_URL`
   - the **`service_role`** key → `SUPABASE_SERVICE_ROLE_KEY`

> The `service_role` key bypasses row-level security. It is only ever read server-side in this
> app and must never appear in a `NEXT_PUBLIC_*` variable.

> One behavioural difference worth knowing: the Supabase driver's rate limiter is read-then-write,
> so a simultaneous burst can over-admit by one. The `DATABASE_URL` driver increments atomically
> in a single statement. Neither is a security control — both are spend controls with wide
> margins — but it is a second reason to prefer `DATABASE_URL`.

### Whichever you pick, a database is not optional

Each Vercel serverless invocation is a separate instance, so without a shared database the `POST`
that creates an audit and the `GET` that polls it can land on different machines — the browser
would get a 404 for an audit that ran perfectly. The app detects this and returns an explicit 503
rather than failing that way silently.

---

## Step 3 — Deploy to Vercel

1. [vercel.com/new](https://vercel.com/new) → **Import** `propathak/FF`.
2. Framework preset: **Next.js** (detected automatically). Leave build and output settings alone.
3. If you skipped Step 1, open **Settings → Git** after the first deploy and set the production
   branch to `claude/ai-seo-visibility-audit-dx9j2v`.
4. **Settings → Environment Variables**: add everything from
   [`.env.production.example`](../.env.production.example), scoped to **Production**. At minimum
   you need `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `ADMIN_PASSWORD`.
5. **Settings → Functions → enable Fluid compute.** The audit route declares
   `maxDuration = 300`. Without Fluid, Hobby caps functions at 60 seconds and a slow site's
   audit will be cut off mid-crawl. With Fluid you get 300s on Hobby and 800s on Pro.
6. **Redeploy** after adding the environment variables — Vercel does not apply them to an
   existing build.

Verify on the `*.vercel.app` URL before touching DNS. Run an audit end to end and confirm the
report renders.

---

## Step 4 — Add the domain in Vercel

**Settings → Domains → Add**, then enter `indexjoy.com`. Add `www.indexjoy.com` too and let
Vercel redirect one to the other (apex as primary is the usual choice).

Vercel will now show you the **exact DNS records to create**. Read them from that screen rather
than copying values from any guide, including this one: Vercel issues **project-specific DNS
values** now, and the older shared values (`76.76.21.21`, `cname.vercel-dns.com`) are legacy —
they still work, but the dashboard's values are the ones Vercel will verify against.

---

## Step 5 — Point GoDaddy at Vercel

Use the **A + CNAME** method. It keeps GoDaddy as your DNS host, so any existing email or
subdomain records keep working — changing nameservers hands all of that to Vercel and is the
usual cause of "our email stopped working" after a launch.

1. GoDaddy → **My Products → Domains → indexjoy.com → DNS → Manage Zones** (or **Edit DNS**).
2. **Delete or edit** any existing `A` record on `@` and any `CNAME` on `www`. GoDaddy ships a
   parking A record and a `www` CNAME by default, and a leftover one will keep the domain
   pointing at the parked page.
3. Add the records exactly as Vercel's Domains screen lists them. They will look like this:

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | A | `@` | *(the IP Vercel shows you)* | 1 hour |
   | CNAME | `www` | *(the hostname Vercel shows you)* | 1 hour |

4. Leave GoDaddy's **Forwarding** feature off. Domain forwarding injects its own records and
   conflicts with the A record.
5. Back in Vercel → **Domains → Refresh**. You are waiting for **"Valid configuration"**.

Propagation is usually minutes on GoDaddy, occasionally up to an hour. Vercel issues the TLS
certificate automatically once it can verify the records — you do not buy a certificate from
GoDaddy.

**If it stays invalid:** check for a stray `CAA` record. If your zone has any CAA record, it must
permit `letsencrypt.org`, or certificate issuance silently fails.

---

## Step 6 — Set up the crawler's contact address

`IndexJoyBot` identifies itself as `crawler@indexjoy.com` and points at `https://indexjoy.com/bot`.
The `/bot` page ships with the app. The mailbox does not — and it needs to exist, because
Wikimedia and several other hosts bucket agents with non-contactable details into a restrictive
rate-limit tier, which would degrade the entity lookups the GEO pillar depends on.

Cheapest options: GoDaddy's own email, Google Workspace, or a free Cloudflare Email Routing
forward to an inbox you already read. Any of them is fine; it just has to deliver.

---

## Step 7 — Post-launch checklist

Once `https://indexjoy.com` loads:

- [ ] `https://indexjoy.com/robots.txt` lists the sitemap and your real host
- [ ] `https://indexjoy.com/sitemap.xml` returns three URLs on the real domain
- [ ] `https://indexjoy.com/bot` loads (your own crawler's contact page)
- [ ] `https://indexjoy.com/admin` prompts for a password and rejects a wrong one
- [ ] Run one real audit end to end, on a client site you know well — the scores should match
      what you would say about that site by hand. This is the only test that matters.
- [ ] Paste the URL into Slack or WhatsApp and confirm the social card renders
- [ ] Add `indexjoy.com` to [Google Search Console](https://search.google.com/search-console)
      and submit the sitemap
- [ ] Add `indexjoy.com` to [Bing Webmaster Tools](https://www.bing.com/webmasters) — it feeds
      ChatGPT's search surface, so it is not optional for a product in this category

---

## Step 8 — Turn on paid signals, in this order

Do not enable everything on day one. Each step below buys more than the one after it per rupee:

1. **`PAGESPEED_API_KEY`** — free, and prevents 429s the moment you have real traffic.
2. **`OPEN_PAGERANK_API_KEY`** — free, 30k domains/month, fills the authority column.
3. **`ANTHROPIC_API_KEY`** — ~$0.05/audit. Turns templated prose into copy that sounds like you
   wrote it.
4. **`SERPER_API_KEY` + `SERP_PROVIDER=serper`** — ~$0.024 per *qualified* lead, and it converts
   the citation and AI Overview sections from "not measured" into real data. Enable once the
   lead form is actually producing leads.
5. **AI answer sampling** — ~$0.22/audit. Reserve for named prospects and Phase 3 monitoring.

At 2,000 audits/month with a 30% capture rate, the fully loaded cost lands around **$0.11 per
audit**. Working in [`docs/04-api-research.md`](04-api-research.md).

---

## What is still open

| Item | Why it matters |
|---|---|
| **Run it against real client sites first** | Every score is engine-verified against fixtures, but the sandbox this was built in could not reach live external sites. Audit three or four sites you know well and sanity-check the output before a prospect sees it. |
| **PDF export is `window.print()`** | Good enough to demo, not good enough to email. Server-side PDF is Phase 2. |
| **`/admin` uses a shared password** | Fine for one or two people. Replace with Supabase Auth in Phase 4 before anyone outside the core team gets access. |
| **Rate limits are per-domain and per-IP** | Defaults are 3 audits/domain/day and 10/IP/hour. Raise them deliberately, not reactively — they are cost controls, not spam controls. |

---

## Sources

- [Vercel: setting up a custom domain](https://vercel.com/docs/domains/set-up-custom-domain) ·
  [adding and configuring a domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain) ·
  [A records and CAA](https://vercel.com/kb/guide/a-record-and-caa-with-vercel) ·
  [troubleshooting domains](https://vercel.com/docs/domains/troubleshooting)
- [Vercel function limits](https://vercel.com/docs/functions/limitations) ·
  [configuring max duration](https://vercel.com/docs/functions/configuring-functions/duration)
- [Connecting a GoDaddy domain to Vercel](https://dev.to/hat52/connecting-your-vercel-app-to-a-godaddy-domain-a-step-by-step-guide-11lc)
- [Neon pricing](https://neon.com/pricing) · [Neon serverless driver and connection pooling](https://neon.com/docs/serverless/serverless-driver) · [Neon free-tier limits 2026](https://agentdeals.dev/vendor/neon)
- [Supabase pricing and free-tier pausing](https://uibakery.io/blog/supabase-pricing)
- [Railway pricing plans](https://docs.railway.com/pricing/plans)
- [Render: free Postgres now expires after 30 days](https://render.com/changelog/free-postgresql-instances-now-expire-after-30-days-previously-90) · [Render free tier docs](https://render.com/docs/free)
- [Resend account quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits)
