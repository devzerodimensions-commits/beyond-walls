# Deploying Beyond Walls to Render

Everything in this repository is ready to deploy. What follows is the whole
process, in order, with the reasoning where a choice matters.

---

## What gets created

Two things, described by [`render.yaml`](render.yaml):

| Resource | What it is |
| --- | --- |
| `beyondwalls` | One Node web service: the storefront, the admin panel and the API |
| `beyondwalls-db` | One PostgreSQL database |

### Why one service and not two

It would be conventional to put the site on a static host and the API on a web
service. Don't. The refresh token is an **HttpOnly, `SameSite=Strict` cookie**,
and a browser will not send that cookie to a different origin. Split them and
every customer is silently signed out fifteen minutes after logging in, with no
error to explain it.

Serving both from one origin also means there is no CORS to misconfigure, and
uploaded images come from the same host as the pages that embed them.

---

## Step 1 — Put the code on GitHub

The repository is already initialised and committed locally. Nothing secret is
in it: `.env` files are excluded, and only the `.env.example` templates are
tracked.

1. Go to **github.com/new**
2. Name it `beyond-walls`
3. Choose **Private** — this is commercial work with business details in it
4. Do **not** tick "Add a README", "Add .gitignore" or "Choose a license"; the
   repository already has them and an extra commit would refuse the push
5. Create the repository, then run the two commands GitHub shows you, which
   will look like this:

```bash
git remote add origin https://github.com/YOUR-USERNAME/beyond-walls.git
git push -u origin main
```

---

## Step 2 — Create the services on Render

1. Sign in at **dashboard.render.com**
2. **New → Blueprint**
3. Connect the GitHub repository
4. Render reads `render.yaml` and shows you what it will create. Approve it.

Render then asks for the values the blueprint deliberately leaves blank. You can
skip any of them now and add them later under **Environment**; the site runs
without them and tells you in the log what is missing.

| Variable | Needed for | If you leave it blank |
| --- | --- | --- |
| `SEED_ADMIN_PASSWORD` | Your admin login | **Set this now.** See step 3. |
| `CLOUDINARY_*` | Images surviving a deploy | Uploads are lost on the next deploy |
| `SMTP_*` | Order and password-reset emails | Emails are written to the log, not sent |
| `RAZORPAY_*` | Online payment | Cash on delivery only; the site makes no payment claims |

The first build takes about five minutes. It installs dependencies, generates
the Prisma client, applies the database migrations, then compiles the server and
the site.

---

## Step 3 — Create the admin account

The database starts empty. Once the first deploy is green, open
**Render → your service → Shell** and run:

```bash
npm run seed
```

That creates the admin account, the 4 categories, the attribute groups, the
homepage sections, the pages, the FAQs, and the 2 catalogue products.

It signs you in with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from the
environment. **Set a real password before running this.** The one in the README
is a public default and anyone reading this repository knows it.

Seeding is safe to run again: it updates what exists rather than duplicating it,
and it never overwrites a price you have confirmed.

---

## Step 4 — Fix the URL

Render may not give you `beyondwalls.onrender.com` — if the name is taken it
appends a suffix. Once you know the real URL, set both of these under
**Environment**:

- `PUBLIC_SITE_URL`
- `API_BASE_URL`

Include `https://`. These are concatenated into password-reset links and order
emails, so a bare hostname produces a link that does not work. (The server
corrects a missing scheme and logs a warning, but set it properly.)

Then set the same URL in **Admin → Settings → SEO → Canonical site URL** and
tick *"This is the correct live domain"*. That value drives every canonical tag,
the sitemap and every share link.

---

## Step 5 — Your own domain

1. **Render → Settings → Custom Domains → Add**
2. Add the CNAME record Render gives you at your domain registrar
3. Wait for the certificate — Render issues it automatically
4. Update `PUBLIC_SITE_URL`, `API_BASE_URL` and the admin SEO setting to the new
   domain

---

## Images: why Cloudinary

**Render rebuilds the filesystem on every deploy.** Anything uploaded through
the admin panel — product photography, gallery images, customer artwork — is
gone the next time you push a change. This is not a bug in Render; it is how
containerised hosting works.

The seeded product images survive because they are committed to the repository.
Nothing uploaded afterwards is.

Cloudinary's free tier (25 GB) solves this and serves images over a CDN. The
driver is already written; you only supply credentials:

1. Sign up at **cloudinary.com**
2. Dashboard → copy **Cloud name**, **API Key**, **API Secret**
3. Paste them into Render → Environment as `CLOUDINARY_CLOUD_NAME`,
   `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

`STORAGE_DRIVER` is already set to `cloudinary`. Until the credentials are
present the server falls back to local disk and says so at startup:

```
storage    local
```

Once configured it reads:

```
storage    cloudinary
```

**Amazon S3 or Cloudflare R2** are also supported — set `STORAGE_DRIVER=s3` and
the `S3_*` variables instead.

---

## Email

Without SMTP credentials the server does not fail; it writes emails to the log
and carries on. That is fine for a first look and wrong for a live shop:

- a customer who forgets their password gets a reset link that is never sent
- nobody receives an order confirmation
- custom-order enquiries — your actual sales leads — arrive only in the admin
  panel, so someone has to go looking for them

Any SMTP provider works. Fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASSWORD`, `SMTP_FROM`, and `ADMIN_NOTIFICATION_EMAIL` for the enquiries.

---

## Razorpay

1. Razorpay Dashboard → **Settings → API Keys** → generate live keys
2. Put them in Render → Environment as `RAZORPAY_KEY_ID` and
   `RAZORPAY_KEY_SECRET`
3. Razorpay Dashboard → **Settings → Webhooks** → add:
   - URL: `https://your-domain/api/webhooks/razorpay`
   - Events: `payment.authorized`, `payment.captured`, `payment.failed`,
     `refund.created`, `refund.processed`
   - Copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET`
4. **Admin → Settings → Payments** → enable online payment

The secret key is only ever read on the server. Only the public key id reaches
the browser, and it is fetched from the API at checkout rather than compiled
into the bundle, so it can be rotated without a rebuild.

Test with Razorpay's own test keys first. The webhook must be reachable from the
internet, so this is the one thing that cannot be rehearsed locally.

---

## Before you sell from it

The blueprint uses Render's **free** plans so nothing is charged without your
say-so. Two things to understand before real customers arrive:

**The free web service sleeps after 15 minutes of no traffic.** The next visitor
waits roughly 50 seconds looking at a blank page. For a shop, that is the
difference between a sale and a bounce.

**The free database is deleted after 30 days** and cannot be backed up. Every
order, customer and product goes with it.

To fix both, in `render.yaml`:

```yaml
databases:
  - name: beyondwalls-db
    plan: basic-256mb        # was: free

services:
  - type: web
    plan: starter            # was: free
```

Push the change and Render applies it. Current pricing is on Render's site; as of
writing this is about $7/month for the service and $7/month for the database.

---

## Deploying an update

```bash
git add -A
git commit -m "What changed"
git push
```

Render rebuilds and redeploys automatically. Migrations run as part of the build,
so a schema change deploys with the code that needs it.

---

## When something is wrong

**Check the startup banner first.** Render → Logs. It states plainly what is and
is not configured:

```
  Beyond Walls API
  ─────────────────────────────────────────
  env        production
  razorpay   NOT configured (add keys to .env)
  email      not configured (emails are logged only)
  storage    local
```

| Symptom | Cause |
| --- | --- |
| Blank page, API works | The client build is missing. Look for `[web] no client build at …` in the log. |
| Signed out after ~15 min | `PUBLIC_SITE_URL` points at a different origin than the site is served from. |
| Password reset link does not work | `PUBLIC_SITE_URL` is missing `https://`, or SMTP is unconfigured. |
| Images vanish after a deploy | Cloudinary is not configured. The log says `storage    local`. |
| Everyone is rate limited at once | `TRUST_PROXY` is not `true`, so every customer looks like one visitor. |
| Payment says unavailable | Razorpay keys are missing, or it is disabled in Admin → Settings → Payments. |

---

## Verifying a deployment

The test suites run against any URL:

```bash
# API behaviour — creates and cleans up its own test data
API_URL=https://your-domain/api node server/scripts/verify.mjs

# The browser journey, desktop and mobile
E2E_BASE_URL=https://your-domain npx playwright test
```

Both make far more requests than a person would, so raise `RATE_LIMIT_MAX` and
`AUTH_RATE_LIMIT_MAX` while they run, then put them back.

`verify.mjs` places a real order. Orders are never hard-deleted, so it leaves one
cancelled test order behind in the admin.
