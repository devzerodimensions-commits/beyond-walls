-- A trash for the media library.
--
-- Deleting was immediate and permanent, which is a hard thing to offer next to
-- a grid of thumbnails. A file now goes to the trash first; the row and the
-- file both survive until the trash is emptied.
ALTER TABLE "MediaAsset" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "MediaAsset_deletedAt_idx" ON "MediaAsset"("deletedAt");
