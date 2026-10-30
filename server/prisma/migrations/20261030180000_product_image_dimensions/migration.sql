-- Pixel size of a product image, so the storefront can reserve the right
-- shape before the image itself arrives instead of reflowing once it has.
--
-- Nullable, and left null for every row that already exists: the sizes are in
-- the files rather than in the database, and the shop falls back to the
-- configured frame shape when it does not know. New uploads record it, and so
-- does linking an image whose media-library row was measured.
ALTER TABLE "ProductImage" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "ProductImage" ADD COLUMN IF NOT EXISTS "height" INTEGER;
