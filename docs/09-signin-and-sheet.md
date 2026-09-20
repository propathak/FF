# 09 — Google sign-in and the Google Sheet

How it works now, and the two pieces of Google setup you need. About 15 minutes, once.

---

## The flow

```
  Visitor lands on indexjoy.com
        │  types their website
        ▼
  Continue with Google  ──►  Google consent  ──►  back to Index Joy
        │                                             │
        │                                             ├─► "Users" tab gets a row
        │                                             │    (first sign-in only)
        ▼                                             │
  Audit runs (their URL was carried through sign-in)  │
        │                                             │
        ▼                                             ▼
  Full report, nothing hidden      "Audits" tab gets a row
                                   (email + website + scores)
```

**What changed from the earlier design:** there is no blurred roadmap and no second
lead form. Identity is captured once, at sign-in. Asking the same person for their
name and company again after that is friction that buys almost nothing, and the
report converts better by being complete and verifiable than by withholding half
of itself.

The lead grade (A–D) survived, because it is computed from the audit itself — site
size, how poor the visibility is, brand equity, and whether the sign-in email
matches the audited domain. No form required.

---

## What lands in the sheet

Both tabs are created automatically on first use, headers and all. You only create
a blank spreadsheet.

**`Users`** — one row per person, written the first time they sign in:

| First signed in | Email | Name |
|---|---|---|

**`Audits`** — one row per audit:

| Date | Email | Website audited | Market | Overall | SEO | AEO | GEO | Google visibility | AI visibility | Pages crawled | Critical issues | Lead grade | Report link |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

Open it in Google Sheets, or **File → Download → Microsoft Excel (.xlsx)** for Excel.

> The sheet is a reporting surface, never a dependency. If the key is revoked or a
> tab is renamed, sign-in and audits carry on working — Postgres stays the source
> of truth, and the sheet can be rebuilt from it.

---

## Part 1 — Google sign-in (OAuth client)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a
   project (or pick an existing one).
2. **APIs & Services → OAuth consent screen**
   - User type: **External**
   - App name: `Index Joy`, support email: yours
   - Authorised domain: `indexjoy.com`
   - Scopes: the defaults (`email`, `profile`, `openid`) are all you need — do not
     add more, because every extra scope is another thing the consent screen asks
     for and another reason to hesitate.
   - **Publish the app.** Left in "Testing", only accounts you list by hand can
     sign in, which looks like a broken site to everyone else.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Type: **Web application**
   - Authorised JavaScript origins — add every address the site answers on:
     - `https://indexjoy.com`
     - your Vercel address, e.g. `https://ff-xxxx.vercel.app`
     - `http://localhost:3000` (for local development)
   - Authorised redirect URIs — the same addresses, each with
     `/api/auth/callback/google` on the end:
     - `https://indexjoy.com/api/auth/callback/google`
     - `https://ff-xxxx.vercel.app/api/auth/callback/google`
     - `http://localhost:3000/api/auth/callback/google`

   > Google matches these strings exactly. A different host, a missing `s` in
   > `https`, or a trailing slash is a different URI and gets rejected. Before the
   > custom domain is connected you are testing on the `.vercel.app` address, so
   > registering only `indexjoy.com` fails every time. **If you are not sure what
   > to paste, open `/signin` on the deployment — while the credentials are
   > missing, that page prints the exact two strings for the address you are on.**
4. Copy the client ID and secret into Vercel:

   ```
   AUTH_GOOGLE_ID=xxxxx.apps.googleusercontent.com
   AUTH_GOOGLE_SECRET=GOCSPX-xxxxx
   AUTH_SECRET=<openssl rand -base64 32>
   ADMIN_EMAILS=you@indexjoy.com
   ```

`AUTH_SECRET` signs the session cookies. Generate it with `openssl rand -base64 32`
and never reuse it across environments — a leaked one lets somebody forge a session.

`ADMIN_EMAILS` is who can open `/admin`. It fails closed: leave it empty and nobody
gets in, including you.

---

## When sign-in does not work

Match the symptom, not the guess. Each of these has one cause.

| What you see | What it means | Fix |
|---|---|---|
| **Error 401: invalid_client — The OAuth client was not found** | `AUTH_GOOGLE_ID` is not set on the deployment. Auth.js sends `client_id=undefined` to Google rather than raising an error, so it looks like a Google fault. | Add `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in Vercel, then **redeploy** — environment variables only reach a build that runs after they are saved. |
| **Error 400: redirect_uri_mismatch** | The address you are on is not registered on the Google client. Usually a `.vercel.app` address when only `indexjoy.com` was added. | Add that exact address to both lists in Part 1, step 3. Google applies the change within a few minutes. |
| **Access blocked: … has not completed the Google verification process** | The consent screen is still in **Testing**. | Publish the app (Part 1, step 2), or add the account under **Test users**. |
| **Bounced back to `/signin` with "not finished being set up"** | The credentials are genuinely absent — the sign-in page checked before redirecting. | The page lists the missing variable names. Set them and redeploy. |
| **`UntrustedHost: Host must be trusted`** in the logs | Auth.js only trusts the incoming host when it can tell it is behind a known proxy. On Vercel the `VERCEL` variable does that automatically, so this only appears when self-hosting or running `next start` locally. | Set `AUTH_TRUST_HOST=true`. |
| **Sign-in completes but nothing reaches the sheet** | The Sheets side (Part 2) is separate and deliberately silent on failure. | Confirm the Sheets API is enabled and the sheet is shared with the service account. Sign-in and audits are unaffected. |

Saving a variable in Vercel does not change the running site. After any change to
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` or `AUTH_SECRET`, go to **Deployments → ⋯ →
Redeploy** on the newest deployment.

---

## Part 2 — The Google Sheet (service account)

A service account is a robot Google identity. You share the sheet with its email
address exactly as you would with a colleague.

1. **Create a blank spreadsheet** at [sheets.new](https://sheets.new). Name it
   something like `Index Joy — signups and audits`. Leave the tabs alone.
2. Copy its ID from the URL — the long string between `/d/` and `/edit`:
   ```
   https://docs.google.com/spreadsheets/d/1AbC...XyZ/edit
                                          ^^^^^^^^^^ this
   ```
3. In Google Cloud Console (same project as Part 1):
   - **APIs & Services → Library** → search **Google Sheets API** → **Enable**.
     Skipping this is the single most common failure, and the error it produces
     does not mention it.
   - **IAM & Admin → Service Accounts → Create service account**
     - Name: `indexjoy-sheets`. No roles needed — its only permission comes from
       you sharing the sheet with it.
   - Open the account → **Keys → Add key → Create new key → JSON**. A file
     downloads. Treat it like a password.
4. **Share the spreadsheet with the service account.** Open the JSON, find
   `client_email` (it looks like
   `indexjoy-sheets@your-project.iam.gserviceaccount.com`), then in Google Sheets
   click **Share**, paste that address, give it **Editor**, and untick "Notify
   people". This step is what actually grants access — without it you get a 403 no
   matter how correct everything else is.
5. Add to Vercel:

   ```
   GOOGLE_SHEETS_ID=1AbC...XyZ
   GOOGLE_SERVICE_ACCOUNT_EMAIL=indexjoy-sheets@your-project.iam.gserviceaccount.com
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n
   ```

   Copy `private_key` from the JSON **exactly as it appears there**, including the
   `\n` sequences — environment variables cannot hold real newlines, and the app
   converts them back. If your shell or the Vercel UI leaves the surrounding
   quotes on, that is fine; they are stripped too.

---

## Verifying it

1. Redeploy (Vercel does not apply new environment variables to an existing build).
2. Open `https://indexjoy.com`, type a website, click **Continue with Google**.
3. You should land back on the site, signed in, with your URL still in the box.
4. Check the sheet: a `Users` tab appears with your row.
5. Run the audit. When it finishes, an `Audits` tab appears with the website and its
   scores.
6. Open `/admin` — the same audit is listed, and the badge reads
   **"Google Sheet connected"**.

### When something does not work

| Symptom | Cause |
|---|---|
| `redirect_uri_mismatch` on sign-in | The redirect URI in Google Cloud does not match exactly. It must be `https://indexjoy.com/api/auth/callback/google` — no trailing slash, and `https` not `http`. |
| Sign-in works, sheet stays empty | Either the Sheets API is not enabled, or the sheet was never shared with the service account. Check the Vercel function logs for a line starting `[sheets]` — it names which. |
| `error:1E08010C:DECODER routines` | The private key lost its `\n` sequences. Re-paste it from the JSON file. |
| "Access blocked: app not verified" | The OAuth consent screen is still in Testing. Publish it. |
| `/admin` says not authorised | Your Google email is not in `ADMIN_EMAILS`, or the variable was added without redeploying. |

---

## What we store, and what we do not

Stored: the email address and name Google gives us, plus every website you audit
and its scores. That is what makes the history and the sheet work.

Not stored: no password (there isn't one), no access to your Gmail, Drive or
contacts. The only scopes requested are `email`, `profile` and `openid`. The
service account's access is limited to the single spreadsheet you shared with it —
it cannot see anything else in your Drive.

---

## Sources

- [Auth.js Google provider](https://authjs.dev/getting-started/providers/google)
- [Google Sheets API: append values](https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets.values/append)
- [Google Cloud: create and manage service account keys](https://cloud.google.com/iam/docs/keys-create-delete)
