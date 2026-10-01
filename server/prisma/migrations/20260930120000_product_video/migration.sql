-- An optional video for the product gallery.
--
-- Nullable with no default, so every existing product keeps exactly what it
-- has and nothing needs backfilling.
ALTER TABLE "Product" ADD COLUMN "videoUrl" TEXT;
