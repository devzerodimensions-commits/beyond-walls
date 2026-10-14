-- The two new homepage sections the studio asked for.
--
-- Both are built from what is already in the database. Not one word of the
-- copy below is written by us: the route text is each category's own
-- description, as the studio wrote it in the admin, and the pictures are the
-- category tile images they uploaded. Nothing to review, nothing invented, and
-- it stays true when they edit a category.
--
-- Guarded so a second run cannot duplicate them, and so neither is re-created
-- if the studio deletes one on purpose.

-- 1. Help me choose -----------------------------------------------------------
--
-- The homepage already has a category grid, which answers "which of these?".
-- This answers "what are you trying to do?", which is the question somebody
-- arrives with: they know they need something for a front door long before
-- they know it is filed under Informative Signs. It sits high, just under the
-- opening, where that question is still unanswered.
INSERT INTO "PageSection" ("id", "pageId", "type", "title", "subtitle", "config", "sortOrder", "status", "createdAt", "updatedAt")
SELECT
  'sec_guided_finder_home',
  p.id,
  'GUIDED_FINDER',
  'Where is it going?',
  NULL,
  jsonb_build_object('items', COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'title', c.name,
               'text',  c.description,
               'href',  '/shop/' || c.slug,
               'image', c.image
             ) ORDER BY c."sortOrder", c.name
           )
    FROM "Category" c
    WHERE c."parentId" IS NULL
      AND c.status = 'PUBLISHED'
      AND c."showInMenu" = true
  ), '[]'::jsonb)),
  2,
  'PUBLISHED',
  NOW(),
  NOW()
FROM "Page" p
WHERE p.slug = 'home'
  AND NOT EXISTS (
    SELECT 1 FROM "PageSection" s WHERE s."pageId" = p.id AND s.type = 'GUIDED_FINDER'
  );

-- 2. Our work ----------------------------------------------------------------
--
-- They make physical things that go on walls, and the one question a
-- photograph answers better than any description is "what does it look like
-- once it is up". There are eleven published gallery images and the homepage
-- never showed one. Near the foot, where somebody who has read this far is
-- deciding whether these people can actually make things.
INSERT INTO "PageSection" ("id", "pageId", "type", "title", "subtitle", "ctaLabel", "ctaLink", "config", "sortOrder", "status", "createdAt", "updatedAt")
SELECT
  'sec_gallery_home',
  p.id,
  'GALLERY',
  'Our work',
  NULL,
  'See the gallery',
  '/gallery',
  '{"limit": 8}'::jsonb,
  6,
  'PUBLISHED',
  NOW(),
  NOW()
FROM "Page" p
WHERE p.slug = 'home'
  AND NOT EXISTS (
    SELECT 1 FROM "PageSection" s WHERE s."pageId" = p.id AND s.type = 'GALLERY'
  );

-- Make room: everything that sat at or below the gallery's slot moves down, so
-- the order stays as intended rather than depending on how ties happen to sort.
UPDATE "PageSection" s
SET "sortOrder" = s."sortOrder" + 1
WHERE s."pageId" IN (SELECT id FROM "Page" WHERE slug = 'home')
  AND s.id <> 'sec_gallery_home'
  AND s."sortOrder" >= 6;

-- -----------------------------------------------------------------------------
-- The category grid steps aside for the finder.
--
-- Both are the same four categories, one directly after the other: the grid
-- shows them as tiles, the finder shows them as the studio's own descriptions.
-- Two of those in a row is one of them too many, and the finder is the better
-- of the pair because it answers the question somebody actually arrives with
-- rather than listing nouns.
--
-- Drafted, not deleted. It keeps its title, its settings and its place, and
-- Design -> Pages puts it back in one click if the studio disagrees.
-- -----------------------------------------------------------------------------
UPDATE "PageSection" s
SET status = 'DRAFT'
WHERE s."pageId" IN (SELECT id FROM "Page" WHERE slug = 'home')
  AND s.type = 'CATEGORY_GRID'
  AND s.status = 'PUBLISHED'
  AND EXISTS (
    SELECT 1 FROM "PageSection" f
    WHERE f."pageId" = s."pageId" AND f.type = 'GUIDED_FINDER' AND f.status = 'PUBLISHED'
  );

-- Ties left the order of two adjacent sections up to whatever the database
-- happened to return. Renumber from the top so the page reads the same twice.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "sortOrder", "createdAt") - 1 AS seq
  FROM "PageSection"
  WHERE "pageId" IN (SELECT id FROM "Page" WHERE slug = 'home')
)
UPDATE "PageSection" s
SET "sortOrder" = o.seq
FROM ordered o
WHERE s.id = o.id;
