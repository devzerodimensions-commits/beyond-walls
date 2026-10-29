# Deploying Beyond Walls

The site runs on the studio's own server under Docker Compose. Two containers,
one published port, Traefik in front terminating TLS.

This file used to describe a Render deployment. That is no longer how it is
hosted, and a deploy guide pointing at the wrong platform is worse than none —
so it has been replaced rather than amended.

---

## Where it runs

| | |
| --- | --- |
| Host | `157.66.191.36` |
| SSH user | `t_adf81f9d` — **not** `root`. Connecting as root fails with `Permission denied (publickey)`, which does not mean the key is wrong. |
| Key | `~/.ssh/beyondwalls_t_adf81f9d_ed25519` (not a default filename, so `-i` is required) |
| App directory | `~/app` → `/srv/tenants/t_adf81f9d/app` |
| Containers | `app-app-1` (site + admin + API), `app-db-1` (postgres:16-alpine) |
| Domain | `https://thebeyondwalls.com` |

### Why one container serves everything

It would be conventional to put the storefront on a static host and the API
somewhere else. Don't. The refresh token is an HttpOnly, `SameSite=Strict`
cookie, which a browser will not send across origins — so the site and the API
have to be the same origin or nobody stays signed in. Serving both from one
process also means no CORS configuration to get wrong.

---

## The deploy

`~/app` is **not a git checkout**, so `git pull` there does nothing. Deployment
is a tarball of `main` unpacked over the directory.

Push first, or the tarball will not contain your change.

```powershell
cd "C:\Users\Admin\ZERO DIMENSIONS PRIVATE LIMITED\Development - Documents\Beyond Walls"; git push origin main
```

```powershell
ssh -i $env:USERPROFILE\.ssh\beyondwalls_t_adf81f9d_ed25519 t_adf81f9d@157.66.191.36 'cd ~; tar czf app-backup-$(date +%F-%H%M).tar.gz app; curl -sL https://github.com/devzerodimensions-commits/beyond-walls/archive/refs/heads/main.tar.gz -o latest.tar.gz; tar xzf latest.tar.gz --strip-components=1 -C app; cd app; docker compose up -d --build 2>&1 | tail -10'
```

It backs up the whole app directory first, fetches the code, rebuilds and
restarts. Wait for `Container app-app-1 Started`.

`prisma migrate deploy` runs inside the build (see the server package's
`build:deploy` script), so data migrations apply on their own.

PowerShell has no `&&` and no heredocs, which is why remote work is given as a
single-line `ssh … '<remote command>'`.

---

## Configuration, and the trap in it

Two files, and **both** are needed for a new setting to reach the application.

### `~/app/.env`

Holds the secrets. **Not** in git, so a deploy never overwrites it.

### `~/app/compose.yml`

Also **not** in git — the repository's `docker-compose.yml` is only the
local-development database, and Compose prefers `compose.yml` over it. That is
why a deploy cannot clobber the real configuration.

> **`.env` alone does nothing.** It only feeds `${...}` substitution inside
> `compose.yml`; it does not become the container's environment. A variable the
> server reads must also be listed under `services.app.environment`, normally as
> `${NAME:?missing from .env}`. Add it to `.env` only and it is silently absent,
> and the server falls back to its development defaults.

To add a setting:

```bash
# 1. the value
cd ~/app && read -p "Value: " V && printf "\nMY_SETTING='%s'\n" "$V" >> .env && unset V

# 2. make the container see it — indentation is read from the file itself,
#    because YAML rejects a guess
cd ~/app && cp compose.yml compose.yml.bak-$(date +%F-%H%M%S) \
  && IND=$(sed -n 's/^\( *\)NODE_ENV.*/\1/p' compose.yml | head -1) \
  && printf '%s\n' "${IND}MY_SETTING: \${MY_SETTING:?missing from .env}" > /tmp/add.yml \
  && sed -i '/NODE_ENV/r /tmp/add.yml' compose.yml \
  && docker compose config >/dev/null && echo YAML_OK && docker compose up -d
```

Never restart without `docker compose config` passing first.

---

## What is configured

Every variable is documented in [`server/.env.example`](server/.env.example).
In production these are set:

| | |
| --- | --- |
| Database | `PGPASSWORD`, assembled into `DATABASE_URL` in `compose.yml` |
| Auth | `JWT_SECRET`, `JWT_REFRESH_SECRET` |
| Admin seed | `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` — no defaults, the seed refuses without them |
| Email | `SMTP_*` — the studio's own mail host, `srv1.zerodimensions.in` |
| Payments | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| Courier | `SHIPROCKET_*`, including the webhook token |
| Proxy | `TRUST_PROXY=true` — without it the server sees every request as coming from Traefik, rate limiting counts all customers as one visitor, and secure cookies are refused |
| Uploads | `STORAGE_DRIVER=database` |

### Uploads live in Postgres

Product images, logos and video are rows, not files. One backup covers the
database and the media together, with no second store that can drift out of
step with it. `/uploads/...` URLs are served from the database by a handler in
`server/src/app.ts`, which answers Range requests so video can be seeked.

---

## Webhooks

Both are public, both authenticate, and neither is rate limited.

| Who | URL |
| --- | --- |
| Razorpay | `https://thebeyondwalls.com/api/webhooks/razorpay` |
| Shiprocket | `https://thebeyondwalls.com/api/webhooks/parcel-tracking` |

Razorpay's is verified by HMAC over the raw body, which is why it is mounted
before the JSON parser. Shiprocket's is verified by a shared secret in
`x-api-key`.

> Shiprocket refuses a callback URL containing `shiprocket`, `kartrocket`, `sr`
> or `kr`. That is why the route is called `parcel-tracking` — the obvious name
> is the one name it cannot have.

---

## Data

PostgreSQL 16 in `app-db-1`, on a **named** Docker volume, not a bind mount.
Under rootless Docker the container's postgres uid (70) maps to a subuid, while
a bind-mounted host directory belongs to the tenant uid and arrives as uid 0
inside — `initdb` then cannot write to its own data directory.

The volume lives under the tenant home (`.local/share/docker/volumes`), which
restic backs up.

```bash
# size of the database, media included
ssh -i $env:USERPROFILE\.ssh\beyondwalls_t_adf81f9d_ed25519 t_adf81f9d@157.66.191.36 \
  'cd ~/app && docker compose exec -T db psql -U beyondwalls -d beyondwalls -c "SELECT pg_size_pretty(pg_database_size(current_database()));"'
```

**A backup nobody has restored is not a backup.** Restoring into a scratch
database and checking the catalogue is intact is worth doing before it is ever
needed in anger.

---

## Checking a deploy

```bash
# integrations, from the startup banner
ssh -i $env:USERPROFILE\.ssh\beyondwalls_t_adf81f9d_ed25519 t_adf81f9d@157.66.191.36 \
  'cd ~/app && docker compose logs app --tail 40 | grep -iE "razorpay|email|storage"'
```

Expect `razorpay configured` and `email SMTP configured`.

From anywhere, needing no credentials:

```bash
curl -s https://thebeyondwalls.com/api/health
curl -s https://thebeyondwalls.com/api/checkout/config
```

The courier is checked from the admin panel — open any order, Shipping, **Test
courier connection**. It cannot be checked by opening a URL, because the admin
API authenticates on a bearer token the app holds in memory, not a cookie.

---

## Rolling back

Every deploy writes `~/app-backup-<date>-<time>.tar.gz` first.

```bash
ssh -i $env:USERPROFILE\.ssh\beyondwalls_t_adf81f9d_ed25519 t_adf81f9d@157.66.191.36 \
  'cd ~ && ls -1t app-backup-*.tar.gz | head -5'
```

```bash
# replace <file>, then rebuild
ssh -i $env:USERPROFILE\.ssh\beyondwalls_t_adf81f9d_ed25519 t_adf81f9d@157.66.191.36 \
  'cd ~ && tar xzf <file> && cd app && docker compose up -d --build 2>&1 | tail -5'
```

This restores code and configuration. **It does not undo a data migration** —
migrations here are written to be idempotent and guarded on the symptom they
repair, so re-running one is safe, but reversing a schema change means writing
the migration that reverses it.
