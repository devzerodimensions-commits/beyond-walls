-- Somewhere for uploaded files to live that survives a deploy.
--
-- Render rebuilds the server's filesystem every time it deploys, so an image
-- uploaded through the admin panel lasts until the next push and then quietly
-- disappears. The product photos on the site today only survive because they
-- are committed to the repository and re-listed on each build; nothing the
-- studio uploads themselves has that protection.
--
-- The database is the one piece of storage this deployment already has that
-- outlives a deploy, and it costs no new account, no card and no second vendor.
--
-- "key" is the path the local driver would have used -- products/plate.webp --
-- so a file stored here keeps its ordinary /uploads/... URL.
CREATE TABLE "MediaBlob" (
  "key"       TEXT NOT NULL,
  "mimeType"  TEXT NOT NULL,
  "bytes"     BYTEA NOT NULL,
  "size"      INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MediaBlob_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "MediaBlob_createdAt_idx" ON "MediaBlob"("createdAt");
