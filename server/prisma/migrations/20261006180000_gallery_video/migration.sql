-- An optional video on a gallery item.
--
-- Nullable, and the image stays required: the picture is the still a visitor
-- sees before pressing play, so a video entry still looks right in the grid and
-- still works for anyone who never presses it.
ALTER TABLE "GalleryItem" ADD COLUMN "videoUrl" TEXT;
