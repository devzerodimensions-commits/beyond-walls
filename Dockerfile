# Beyond Walls — storefront + admin panel + API in one image.
#
# bookworm-slim (glibc), NOT alpine: sharp ships prebuilt binaries for glibc
# only, and on musl `npm ci` compiles from source.
#
# devDependencies are kept in the final image on purpose. `npm run seed` is
# `tsx prisma/seed.ts`, and tsx is a devDependency — pruning them would make the
# documented first-run seed impossible to execute inside the container.
FROM node:22-bookworm-slim
WORKDIR /app

# bookworm-slim carries no openssl, so Prisma cannot detect a libssl version and
# falls back to guessing "openssl-1.1.x" for its query engine. It happened to
# connect, but a guessed engine binary is not something to leave under a
# checkout. Installing openssl lets Prisma pick the right engine deliberately.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# One vCPU behind rootless Docker's userspace network stack: at npm's defaults
# the registry requests time out. Playwright is a root devDependency and only
# the test runner is wanted here, never its browser downloads.
ENV npm_config_maxsockets=4 \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Workspace manifests first so the install layer caches independently of source.
# server's postinstall runs `prisma generate`, which reads schema.prisma, so the
# schema has to be present before `npm ci` — not after it with the rest of the
# source.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
COPY server/prisma server/prisma
RUN npm ci --include=dev

COPY . .

# `build:image`, not `build`.
#
# This image is built inside a 1 GiB memory budget shared with the running
# shop and its database, which leaves a build about 600 MB. Type-checking the
# server needs a 384 MB heap — about 480 MB of real memory — and Node cannot see
# the budget, only the host's 24 GB, so it grew lazily until the kernel killed
# it (exit 137). The previous image kept serving and nothing said so.
#
# `build:image` still lints, then compiles the server file by file with
# TypeScript's own emitter (byte-identical to a full build; `isolatedModules`
# keeps it that way) and bundles the client. Full type-checking is not skipped:
# `npm run build` and `npm run typecheck` run it before every commit.
#
# The heap is capped so the garbage collector works within the budget rather
# than leaving it to the kernel. Measured needs: lint 192 MB, client bundle
# 256 MB, server compile 128 MB.
#
# Not `build:deploy` either: that begins with `prisma migrate deploy`, which
# needs a database, and there is none during an image build. Migrations, the
# upload registration and the content pages all run at container start.
RUN NODE_OPTIONS=--max-old-space-size=384 npm run build:image

EXPOSE 3000
# Order matters: migrate before anything reads the schema, register-uploads
# before the admin panel can reference the committed photography. All three are
# idempotent, so a restart or redeploy repeats them harmlessly.
CMD ["sh", "-c", "npm run prisma:deploy -w server && npm run register:uploads -w server && npm run seed:pages -w server && npm start"]
