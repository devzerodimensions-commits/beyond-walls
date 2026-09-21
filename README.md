# Beyond Walls

A production-ready e-commerce platform for **Beyond Walls** — nameplates, office branding, GST
plates, QR stands, desk plates, prints and safety signage.

- **Storefront** — React 18 + TypeScript + Tailwind CSS
- **API** — Node.js + Express + TypeScript
- **Database** — PostgreSQL + Prisma
- **Payments** — Razorpay (UPI, cards, net banking, wallets) + configurable Cash on Delivery
- **Admin panel** — the whole site is editable at `/admin`

Everything the storefront renders comes from the database through the API. No production content is
hard-coded.

---

## Contents

1. [Quick start](#quick-start)
2. [Environment variables](#environment-variables)
3. [About the seed data](#about-the-seed-data)
4. [Project structure](#project-structure)
5. [The admin panel](#the-admin-panel)
6. [Personalisation & live preview](#personalisation--live-preview)
7. [Razorpay integration](#razorpay-integration)
8. [SEO](#seo)
9. [API reference](#api-reference)
10. [Testing](#testing)
11. [Deployment](#deployment)
12. [Packaging for handover](#packaging-for-handover)
13. [Going live checklist](#going-live-checklist)

---

## Quick start

**Requirements:** Node.js 18.18+ and PostgreSQL 14+ (Docker Desktop is the easiest way to get
PostgreSQL; see the alternatives below if you do not use Docker).

```bash
npm install
```

```bash
cp server/.env.example server/.env && cp client/.env.example client/.env
```

Generate real JWT secrets and paste them into `server/.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Start PostgreSQL

**Option A — Docker (recommended):**

```bash
npm run db:up
```

This starts PostgreSQL 16 on `localhost:5432` with the credentials already in `.env.example`.

**Option B — an existing PostgreSQL server:** create a database and point `DATABASE_URL` at it:

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/beyondwalls?schema=public"
```

**Option C — a hosted database** (Neon, Supabase, Railway, RDS): paste the connection string into
`DATABASE_URL`. Append `?sslmode=require` if the provider needs TLS.

> **Note on this machine's current setup.** Docker Desktop could not start here (WSL2 has no Linux
> distribution installed), so development was verified against a **portable PostgreSQL 16.4** running
> from a temporary folder:
>
> ```
> C:\Users\Admin\AppData\Local\Temp\claude\D--Beyond-Walls\<session>\scratchpad\pg\pgsql\bin
> data dir: ...\scratchpad\pgdata      credentials: beyondwalls / beyondwalls
> ```
>
> **That folder is temporary and Windows may clear it.** Before doing real work, move to one of
> options A–C above and update `DATABASE_URL`. To start the portable server again in the meantime:
>
> ```bash
> "<scratchpad>/pg/pgsql/bin/pg_ctl.exe" -D "<scratchpad>/pgdata" -l "<scratchpad>/pg.log" -o "-p 5432 -h 127.0.0.1" start
> ```

### Create the schema and seed it

```bash
npm run prisma:migrate
```

```bash
npm run seed
```

### Run it

```bash
npm run dev
```

### Verify it works

```bash
npm run verify
```

Runs 116 end-to-end checks against the live API — auth and role guards, admin CRUD on every
resource, catalogue filtering and search, personalisation validation, server-side cart pricing,
coupons, checkout, order snapshots and SEO output. It cleans up everything it creates. The API
must be running first.

| What | Where |
| --- | --- |
| Storefront | http://localhost:5173 |
| Admin panel | http://localhost:5173/admin |
| API | http://localhost:4000/api |
| Health check | http://localhost:4000/api/health |

Sign in to the admin panel with the credentials from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
(default `admin@beyondwall.in` / `Admin@12345`). **Change this password immediately.**

### Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the API and the storefront together |
| `npm run dev:server` | API only, on port 4000 |
| `npm run dev:client` | Storefront only, on port 5173 |
| `npm run build` | Type-checks and builds both for production |
| `npm run start` | Runs the built API (also serves the built storefront) |
| `npm run typecheck` | Type-checks both workspaces |
| `npm run seed` | Seeds categories, filters and the catalogue products |
| `npm run seed:demo` | Adds clearly-labelled **test** prices so you can try checkout |
| `npm run prisma:studio` | Opens Prisma Studio to browse the database |
| `npm run db:up` / `db:down` | Starts / stops the PostgreSQL container |

---

## Environment variables

### `server/.env`

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Long random string for access tokens |
| `JWT_REFRESH_SECRET` | yes | A **different** long random string |
| `JWT_EXPIRES_IN` | no | Access token lifetime, default `15m` |
| `JWT_REFRESH_EXPIRES_IN` | no | Refresh token lifetime, default `30d` |
| `PORT` | no | API port, default `4000` |
| `CORS_ORIGINS` | yes in prod | Comma-separated list of allowed origins |
| `RAZORPAY_KEY_ID` | for payments | Public key id — this one does reach the browser |
| `RAZORPAY_KEY_SECRET` | for payments | **Server only.** Never sent to the browser |
| `RAZORPAY_WEBHOOK_SECRET` | for webhooks | Verifies webhook authenticity |
| `UPLOAD_DIR` | no | Where uploads are written, default `server/uploads` |
| `MAX_UPLOAD_MB` | no | Per-file upload limit, default `10` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | no | The first admin account |
| `TRUST_PROXY` | no | Set `true` behind nginx / a PaaS load balancer |

### `client/.env`

| Variable | Notes |
| --- | --- |
| `VITE_API_URL` | API base URL, e.g. `https://api.beyondwall.in/api` |
| `VITE_ASSET_URL` | Where `/uploads` is served from |
| `VITE_SITE_URL` | Canonical public URL, used in SEO tags |

There is deliberately **no Razorpay key in the client env**. The public key id is fetched from
`GET /api/checkout/config` at checkout time, so it can be rotated without rebuilding the frontend.

---

## About the seed data

The seed reflects exactly what was supplied in the brief — and nothing more.

**Seeded:**

- The category tree from *Website Categories.pdf*: For Home, For Offices (Office Branding, GST
  Plates, QR Stands, Desk Plates), Prints, Informative Signs (Prohibition, Way Finding, Mandatory)
  and Custom Signage.
- The filter rails from the same brief: Material, Style, Shape, Profession, Requirement, Occasion.
- Both products from *Product catalogue.pdf* — **No Smoking Sign** and **Minimal Acrylic Name
  Plate** — with their real descriptions, design notes, material notes, care instructions,
  applications, dimensions and the supplied photography.
- The real contact details, address and opening hours.
- Homepage sections, navigation, gallery and a contact page built from those facts.

**Deliberately not seeded**, because it was not supplied and inventing it would be wrong:

| Not seeded | What happens instead |
| --- | --- |
| **Prices** | Both products are seeded with `price: null` and show *"Price on request"*. The product page offers a **Request a price** enquiry instead of Add to Cart. Set a real price in **Admin → Products → Price & stock** and the product becomes purchasable immediately. |
| **Reviews & testimonials** | None. The homepage testimonials section is a **draft**, so it stays hidden until you publish a real one. |
| **Policies** | Shipping, Returns, Privacy and Terms pages exist as **drafts** with a placeholder telling you to write them. Drafts are not reachable on the public site. |
| **Offers / coupons** | None. |
| **Company claims** | The About page is a draft containing only the facts from your brief. |

### Testing checkout before you have prices

```bash
npm run seed:demo
```

This assigns obviously-fake prices and badges both products **TEST PRICE**, plus a `TESTBW10`
coupon, so you can click all the way through cart → checkout → Razorpay. Remove it with:

```bash
npm run seed:demo -- --clear
```

---

## Project structure

```
Beyond Walls/
├── server/
│   ├── prisma/
│   │   ├── schema.prisma          # 25 models — the whole data model
│   │   ├── seed.ts                # Categories, filters, products, pages
│   │   └── seed-demo-pricing.ts   # Optional test pricing
│   └── src/
│       ├── app.ts                 # Express app, middleware, static uploads
│       ├── index.ts               # Server bootstrap
│       ├── config/env.ts          # Typed environment config
│       ├── middleware/            # auth, error handling, uploads
│       ├── services/              # cart, order, razorpay, settings
│       ├── routes/
│       │   ├── public/            # storefront API
│       │   └── admin/             # admin API (all ADMIN-gated)
│       └── utils/                 # crudFactory, auth, http helpers
├── client/
│   └── src/
│       ├── components/
│       │   ├── ui/                # Buttons, inputs, modals, icons
│       │   ├── layout/            # Header, footer, cart drawer
│       │   ├── product/           # Cards, personalisation, live preview
│       │   └── admin/             # Admin table, media picker, field kit
│       ├── context/StoreProvider  # Auth, cart, wishlist, settings, toasts
│       ├── lib/                   # api client, types, SEO, formatting
│       └── pages/
│           ├── shop/ account/     # Storefront
│           └── admin/             # The admin panel
├── assets/                        # Original client-supplied source files
├── docs/                          # The supplied PDFs
└── docker-compose.yml             # PostgreSQL for local development
```

---

## The admin panel

Everything at `/admin`. Every resource supports **Create, Edit, Delete, Draft, Publish** and, where
order matters, **Reorder**.

| Screen | What you control |
| --- | --- |
| **Dashboard** | Revenue, order counts, a 30-day chart, low stock, recent orders and enquiries |
| **Products** | Full editor: details, images, price, stock, variants, personalisation, filters, SEO. Duplicate a product in one click |
| **Categories** | The category tree, subcategories, images, menu visibility, SEO |
| **Materials, styles & shapes** | The filter rails themselves — add a group, add options, reorder |
| **Orders** | Search, filter, status workflow, tracking, internal notes, refunds, CSV export |
| **Customers** | Accounts, order history, lifetime value, admin access, enable/disable |
| **Enquiries** | Contact, custom order and price requests, with attachments and notes |
| **Homepage** | Add, reorder and publish homepage sections |
| **Banners** | Hero and promo banners, with scheduling |
| **Gallery / Testimonials / FAQs** | Content lists with full CRUD |
| **Pages** | About, contact and policy pages with a Markdown editor and live preview |
| **Navigation** | Header and footer menu links |
| **Media** | Every uploaded file, reusable anywhere |
| **Coupons** | Percentage, fixed or free-shipping codes with limits and date windows |
| **Settings** | Logo, contact details, business hours, socials, footer, payments, shipping, tax, SEO |

The panel is `noindex, nofollow`, admin routes are re-checked against the database on every request,
and the last active admin account cannot be demoted, disabled or deleted.

---

## Personalisation & live preview

Products carry an admin-defined list of personalisation fields. Supported types:

`TEXT` · `TEXTAREA` · `NUMBER` · `SELECT` · `RADIO` · `CHECKBOX` · `COLOR` · `FONT` ·
`IMAGE_UPLOAD` · `FILE_UPLOAD` · `URL` · `GSTIN` · `PHONE` · `EMAIL` · `DATE`

This covers everything in the brief — name, family name, house number, office name, degree, GSTIN,
QR URL, message, font, colour, logo upload, artwork upload and instructions. Four presets (Home
nameplate, Office / desk plate, GST plate, QR stand) create a sensible field set in one click.

**Validation runs on the server**, not just in the browser: required fields, min/max length, regex,
a real GSTIN check, URL and email validation, and option values checked against the allowed list.
Price add-ons are recalculated server-side, so a tampered request cannot change the price.

### The customisation chain

```
Product page → Cart → Checkout → Order → Admin
```

Each answer is stored as `{ key, label, type, value, displayValue, priceDelta, previewSlot }` and
snapshotted onto the order line, so it survives later catalogue edits. Uploaded logos and artwork
are stored on the server and linked from the cart, the order confirmation and the admin order
screen, where your team can download them for production.

### Live preview

Turn on **Live preview** for a product, pick a template, then bind each field to a preview slot
(`number`, `line1`, `line2`, `line3`, `fontFamily`, `textColor`, `plateColor`, `logo`). The plate is
rendered as SVG and updates as the customer types. Four templates ship: minimal nameplate (matching
the supplied product), classic nameplate, desk plate and square sign.

#### Per-product configuration

The template is a **starting point, not a straitjacket**. Under the template picker, each product
can override:

| Setting | What it does |
| --- | --- |
| Default plate / text colour | What the preview shows before the customer picks anything |
| Default font | Which of the four font stacks is used |
| Corner radius | 0 for a square plate, higher for rounded |
| Mounting screws | Whether the two screw heads are drawn |
| Placeholder lines | The sample text shown before anything is typed |
| Caption | The line under the preview — a promise to the customer, so keep it accurate |

Overrides are stored per product in `Product.livePreviewConfig` (JSON) and merged over the
template's own values at render time. **Reset to template** clears them. Because it is a free-form
JSON column, new preview options never need a database migration, and a product saved by an older
version keeps rendering: unknown keys are ignored.

---

## Razorpay integration

### How a payment flows

1. The browser posts the cart to `POST /api/orders`.
2. **The server re-prices the entire cart** — variant prices, personalisation add-ons, coupon,
   shipping, COD fee and tax — and creates the order from its own numbers.
3. The server calls Razorpay to create a gateway order and returns **only the public key id**.
4. Razorpay Checkout opens with UPI, cards, net banking and wallets.
5. On success the browser posts the signature to `POST /api/payments/verify`.
6. The server verifies `HMAC_SHA256(order_id + "|" + payment_id, key_secret)` with a
   **timing-safe comparison**, then re-fetches the payment from Razorpay and **checks the captured
   amount matches the order total**. Only then is the order marked paid.
7. A webhook at `POST /api/webhooks/razorpay` reconciles anything the browser missed.

### Security

- `RAZORPAY_KEY_SECRET` is read from the environment, used only on the server, and never appears in
  an API response. The admin panel **rejects** any attempt to set a key ending in `secret`,
  `password` or `apiKey`.
- The webhook route is mounted **before** the JSON body parser so the HMAC is computed over the
  exact bytes Razorpay signed.
- A signature mismatch marks the payment `FAILED`, logs a `SIGNATURE_MISMATCH` event and refuses the
  order. An amount mismatch is rejected the same way.
- Every transition is written to `PaymentEvent`, giving a complete audit trail on the admin order
  screen.

### Failure and retry

A failed or abandoned payment leaves the order saved with `paymentStatus: FAILED`. The customer is
taken to the order page, where **Retry payment** creates a fresh Razorpay order against the same
Beyond Walls order. Guests retry by confirming the email used on the order.

### Cash on delivery

COD is off by default. Enable it in **Admin → Settings → Payments**, where you can also set a
handling fee and minimum/maximum order values. Either method can be switched off independently; the
checkout adapts, and if both are off the checkout says so instead of failing.

### Webhook setup

In the Razorpay dashboard → Settings → Webhooks:

- **URL** `https://your-domain.com/api/webhooks/razorpay`
- **Secret** the same value as `RAZORPAY_WEBHOOK_SECRET`
- **Events** `payment.authorized`, `payment.captured`, `payment.failed`, `refund.created`,
  `refund.processed`

### Testing

Use Razorpay **test mode** keys (`rzp_test_…`). Test card `4111 1111 1111 1111`, any future expiry,
any CVV. Test UPI id `success@razorpay`.

---

## SEO

- **Clean URLs** — `/shop/for-home`, `/product/minimal-acrylic-name-plate`, `/about`
- **Per-page metadata** — title, description, keywords, canonical and Open Graph / Twitter tags,
  each editable in admin with a live Google-result preview
- **JSON-LD schema** — `Product` (with `Offer`), `BreadcrumbList`, `CollectionPage`, `FAQPage`,
  `LocalBusiness` (built from your real address and opening hours) and `WebSite` with search action
- **`/sitemap.xml`** — generated live from published categories, products and pages
- **`/robots.txt`** — generated, and switchable to `noindex` for staging from Settings
- **Filtered and paginated views are `noindex`**, so they do not compete with the canonical category
  page
- **Category copy sits below the product grid**, which is what search engines prefer

A product priced on request publishes availability **without** a price in its schema — no invented
price is ever exposed to Google.

---

## API reference

### Public

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` `\|` `/login` `\|` `/refresh` `\|` `/logout` | Auth with refresh-token rotation |
| `GET` `PATCH` | `/api/auth/me` | Current customer |
| `POST` | `/api/auth/change-password` | Signs out other devices |
| `GET` | `/api/catalog/categories` `\|` `/categories/:slug` | Category tree |
| `GET` | `/api/catalog/filters` | Filter rails, scoped to a category |
| `GET` | `/api/catalog/products` | Search, filter, sort, paginate |
| `GET` | `/api/catalog/products/search-suggest` | Type-ahead |
| `GET` | `/api/catalog/products/:slug` | Product detail + related |
| `GET` `POST` `PATCH` `DELETE` | `/api/cart` `/api/cart/items/:id` | Cart, guest or signed-in |
| `POST` `DELETE` | `/api/cart/coupon` | Apply / remove a coupon |
| `GET` `POST` `DELETE` | `/api/wishlist` | Wishlist |
| `GET` | `/api/checkout/config` `\|` `/checkout/summary` | Payment options and totals |
| `POST` | `/api/orders` | Place an order |
| `POST` | `/api/payments/verify` `\|` `/failed` `\|` `/retry/:id` | Payment lifecycle |
| `GET` | `/api/orders` `\|` `/orders/:idOrNumber` | Order history and tracking |
| `GET` | `/api/settings` `\|` `/home` `\|` `/pages/:slug` `\|` `/faqs` `\|` `/gallery` | Site content |
| `POST` | `/api/enquiries` | Contact / custom order, with attachments |
| `POST` | `/api/webhooks/razorpay` | Signed webhook |

### Admin — every route requires an ADMIN bearer token

`/api/admin/dashboard` · `/products` (+ `/images`, `/variants`, `/personalization`, `/duplicate`,
`/reorder`, `/status`) · `/categories` · `/attribute-groups` · `/attribute-values` · `/orders`
(+ `/refund`, `/orders-export.csv`) · `/customers` · `/enquiries` · `/home-sections` · `/banners` ·
`/gallery` · `/testimonials` · `/faqs` · `/pages` · `/nav-links` · `/coupons` · `/reviews` ·
`/media` · `/settings`

All list endpoints accept `?page`, `?perPage`, `?search`, `?status`, `?orderBy`, `?order`.

Responses use a consistent envelope:

```json
{ "success": true, "data": …, "meta": { "page": 1, "total": 42, "totalPages": 2 } }
```

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ … ] } }
```

---

## Testing

Three suites, each answering a different question.

| Command | What it proves | Needs |
| --- | --- | --- |
| `npm run verify` | The API behaves: auth, pricing, variants, inventory, coupons, GST, uploads, admin CRUD, SEO | API + seeded database |
| `npm run verify:payments` | Razorpay is watertight: success, failure, retry, duplicate webhook, refund | API + sandbox gateway |
| `npm run e2e` | The site works in a real browser, on desktop and on a phone | API + client + database |

### API verification — `npm run verify`

85 assertions over live HTTP. It creates its own products, coupons and customers, places a real
order and cleans up after itself, so it is safe to run repeatedly against a development database.

It deliberately checks the things that are easy to get wrong:

- a product with no price cannot be published, but one priced only through its variants can
- a multi-variant product refuses an unspecified variant
- stock moves on the variant row, never the parent, and never at all when inventory tracking is off
- cancelling twice does not inflate stock
- an SVG, an HTML file, an `application/octet-stream` and a PHP script renamed `.png` are all refused
- deleting a gallery item does not delete a file the product still uses

### Razorpay in test mode — `npm run verify:payments`

Live gateway keys are not needed. A small stub gateway stands in for `api.razorpay.com`, and a
preload hook points the SDK at it:

```bash
# terminal 1 — the stub gateway
npm run sandbox:razorpay -w server

# terminal 2 — the API, wired to it
cd server
RAZORPAY_KEY_ID=rzp_test_sandbox0001 RAZORPAY_KEY_SECRET=sandbox_secret_do_not_use RAZORPAY_WEBHOOK_SECRET=sandbox_webhook_secret RAZORPAY_SANDBOX_URL=http://127.0.0.1:4999 PORT=4001 NODE_OPTIONS="--require ./scripts/razorpay-sandbox.cjs" node dist/index.js

# terminal 3 — the tests
cd server
API_URL=http://localhost:4001/api RAZORPAY_KEY_SECRET=sandbox_secret_do_not_use RAZORPAY_WEBHOOK_SECRET=sandbox_webhook_secret node scripts/verify-payments.mjs
```

**Nothing about the application changes** — real HMAC signatures, the real verification gate, the
real state machine, the real database. Only the gateway's base URL moves, and the hook refuses to
load unless that URL is loopback, so it can never redirect a production server's payment traffic.

55 assertions cover: a valid capture, a replayed callback, a tampered signature, an underpayment, an
uncaptured payment, a payment belonging to another order, an unreachable gateway (which must leave
the payment pending, not paid), webhook settlement, ownership on `/payments/failed`, retry after a
failure, duplicate webhook delivery, a late `payment.failed` on a paid order, partial and full
refunds, a double-clicked refund, replayed refund webhooks, and refund-before-cancel.

### Browser tests — `npm run e2e`

Playwright, run twice: `desktop` (1440×900 Chrome) and `mobile` (Pixel 7). Start the API and the
client first, then:

```bash
npm run e2e            # both projects, headless
npm run e2e:headed     # watch it happen
npm run e2e:mobile     # phone only
```

It walks the real journey — register, personalise, add to cart, apply a coupon, check out with a GST
invoice, pay cash on delivery, then find the order in the account and in the admin — and checks the
things a screenshot would miss: the hero headline actually contrasts with its background, the mega
menu never covers more than three quarters of the viewport, no page scrolls sideways, the page title
contains the brand once rather than twice, and the browser console stays clean.

> **Rate limits.** The suites make far more requests than a person would, so run them with
> `RATE_LIMIT_MAX` and `AUTH_RATE_LIMIT_MAX` raised. The production defaults are deliberately tight.

---

## Deployment

### Build

```bash
npm run build
```

`server/dist` holds the compiled API; `client/dist` holds the static site. In production the API
also serves `client/dist`, so a single process can host the whole thing.

### Run

```bash
NODE_ENV=production npm run start
```

Apply migrations on the production database first:

```bash
npm run prisma:deploy -w server
```

### Production notes

- Put the API behind HTTPS and set `TRUST_PROXY=true`.
- Set `CORS_ORIGINS` to your real domain — do not leave `*`.
- `server/uploads` holds customer artwork. Mount it on a **persistent volume** and back it up.
  On an ephemeral filesystem (Heroku, some container platforms) move uploads to S3 or similar.
- Use different `JWT_SECRET` values in production than in development.
- Switch Razorpay to live keys and point the webhook at the production URL.
- Set **Settings → SEO → Canonical site URL** to your real domain so the sitemap and canonical tags
  are correct.

### Example nginx

```nginx
server {
  listen 443 ssl http2;
  server_name beyondwall.in;

  client_max_body_size 12M;   # must exceed MAX_UPLOAD_MB

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

---

## Packaging for handover

```bash
npm run package
```

Writes `release/beyond-walls-<date>.zip` and a clean tree beside it.

**Never included:** `node_modules`, any `.env`, build output (`dist`, `build`), logs, or customer
uploads. The script re-scans the staged tree before zipping and refuses to package if it finds a
`.env` or a dependency folder, so a secret cannot slip into a deliverable by accident.

**Included:** both `.env.example` files, so whoever deploys knows exactly which variables to supply,
and the seeded product photography under `server/uploads/products`, which the seed data references.

To run what comes out of the box:

```bash
npm install
cp server/.env.example server/.env     # then fill it in
cp client/.env.example client/.env
npm run prisma:deploy && npm run seed
npm run build && npm start
```

---

## Going live checklist

The admin dashboard shows a **Before you go live** panel that tracks the first four of these
automatically and links straight to what needs attention.

**Money and access**

- [ ] Change the seeded admin password
- [ ] Generate fresh `JWT_SECRET` and `JWT_REFRESH_SECRET`
- [ ] **Set real prices on every product and tick "This price has been reviewed and is correct".**
      The seeded prices are placeholders. They are live and sellable — a customer can buy at them
      today — so the dashboard keeps warning until each one is confirmed.
- [ ] Add live Razorpay keys and register the webhook (`payment.authorized`, `payment.captured`,
      `payment.failed`, `refund.created`, `refund.processed`)
- [ ] Decide whether Cash on Delivery is enabled, and on what order values
- [ ] Add SMTP details, or order confirmations and password resets are only written to the log

**Content**

- [ ] Write and publish the Shipping, Returns, Privacy and Terms pages
- [ ] Write and publish the About page
- [ ] Upload the black and white logos in Settings → Brand (replaces the temporary text logo)
- [ ] Add social links, or leave them blank to hide them
- [ ] Review the alt text on every product image (Admin → Products → Images)

**Domain and SEO**

- [ ] **Confirm the canonical site URL** in Settings → SEO. It currently defaults to
      `https://beyondwall.in`, which was inferred from the business email address and has not been
      confirmed. Canonical tags, the sitemap and every share link are built from it. Tick
      *"This is the correct live domain"* once it is right.
- [ ] Check the search-result preview on the same screen: titles under 60 characters, descriptions
      under 160
- [ ] Set shipping rates and the free-shipping threshold
- [ ] Confirm `/robots.txt` says `index, follow` and submit `/sitemap.xml` to Search Console

**Before you announce it**

- [ ] `npm run verify` passes against the production database
- [ ] `npm run verify:payments` passes, then repeat the same scenarios once against Razorpay's own
      test keys
- [ ] `npm run e2e` passes on desktop and mobile
- [ ] Place one real order end to end, refund it, and check both appear in the Razorpay dashboard

---

## Support

Beyond Walls
First Floor, Shop No. 01, Prime Center Mall, Opp. Three Corner Garden, Mirzapur,
Ahmedabad, Gujarat 380001
+91 7600738785 · info@beyondwall.in
Monday–Saturday, 10 AM – 8 PM
