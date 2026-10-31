-- Non-destructive image editing in the media library.
--
-- An edit overwrites the file under its existing key, because the URL is
-- referenced by products, pages, settings and gallery rows and changing it
-- would break every one of them. The bytes from before the first edit are
-- copied to a second key instead, named here, so the edit can always be undone.
ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "originalKey" TEXT;
ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);

-- Uploads are content-addressed, so a key never changes and may be cached
-- forever. Editing in place breaks that promise for the keys it touches: this
-- counter is how the upload handler knows which ones can no longer be served
-- as immutable.
ALTER TABLE "MediaBlob" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
