-- The About page, without the two personal profiles.
--
-- The studio asked for the founder and co-founder sections to come off. They
-- were two of the page's five body blocks, so removing them alone would leave
-- the origin story, the process, and a gap where the middle used to be --
-- which is why this also rebuilds the sequence.
--
-- Every word that stays is the studio's own, already published on that page.
-- The strip restates sentences the page already makes in the company's voice
-- ("In 2004 we started as Patel Corporation", "production begins at our
-- in-house facility", "Our design experience helps us create with intention").
-- The facts that existed only inside the two profiles -- the 500 projects, the
-- twenty years, the named materials -- are deliberately NOT carried over:
-- reattributing one person's record to the company is a claim the studio has
-- to make, not us.
--
-- Positions are worked out from the sections themselves rather than from
-- assumed numbers. The seeded page is numbered 0..6, an admin that has
-- reordered it could be numbered anything, and a migration that assumes either
-- puts the new blocks in the wrong place.

-- 1. Remove the two profiles. Matched on the subtitle that names each one on
--    the page, not on position -- positions move.
DELETE FROM "PageSection"
WHERE "pageId" IN (SELECT id FROM "Page" WHERE slug = 'about')
  AND type = 'IMAGE_TEXT'
  AND (subtitle ILIKE 'Founder —%' OR subtitle ILIKE 'Co-founder —%');

-- 2. Spread what remains to 0, 10, 20… so there is room to insert between.
WITH ordered AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY "sortOrder", "createdAt") - 1) * 10 AS position
  FROM "PageSection"
  WHERE "pageId" IN (SELECT id FROM "Page" WHERE slug = 'about')
)
UPDATE "PageSection" s
SET "sortOrder" = o.position, "updatedAt" = NOW()
FROM ordered o
WHERE s.id = o.id AND s."sortOrder" <> o.position;

-- 3. Three facts directly after the origin story, so the page has a beat there
--    instead of a gap. Only if no strip is on the page already.
INSERT INTO "PageSection" (id, "pageId", type, subtitle, title, config, "sortOrder", status, "createdAt", "updatedAt")
SELECT
  'about-usp-strip',
  p.id,
  'USP_STRIP',
  'Beyond Walls',
  'Two decades of making, now making for homes',
  '{"items":[
      {"title":"Since 2004","text":"Started as Patel Corporation, an offline signage manufacturing business."},
      {"title":"Made in-house","text":"Production happens at our own facility, from choosing the material to finishing."},
      {"title":"Design and making","text":"Our design experience creates with intention. Our manufacturing experience makes it work."}
    ]}'::jsonb,
  COALESCE(
    (SELECT s."sortOrder" + 5 FROM "PageSection" s
      WHERE s."pageId" = p.id AND s.subtitle = 'Two decades' LIMIT 1),
    15
  ),
  'PUBLISHED',
  NOW(),
  NOW()
FROM "Page" p
WHERE p.slug = 'about'
  AND NOT EXISTS (
    SELECT 1 FROM "PageSection" s WHERE s."pageId" = p.id AND s.type = 'USP_STRIP'
  );

-- 4. The work itself, after the process. A page that describes craft and shows
--    none of it is asking to be taken on trust; the gallery already holds
--    photographs of finished pieces.
INSERT INTO "PageSection" (id, "pageId", type, subtitle, title, config, "sortOrder", status, "createdAt", "updatedAt")
SELECT
  'about-gallery',
  p.id,
  'GALLERY',
  'Our work',
  'Pieces we have made',
  '{"limit":8}'::jsonb,
  COALESCE(
    (SELECT s."sortOrder" + 5 FROM "PageSection" s
      WHERE s."pageId" = p.id AND s.type = 'STEPS' LIMIT 1),
    35
  ),
  'PUBLISHED',
  NOW(),
  NOW()
FROM "Page" p
WHERE p.slug = 'about'
  AND NOT EXISTS (
    SELECT 1 FROM "PageSection" s WHERE s."pageId" = p.id AND s.type = 'GALLERY'
  );

-- 5. Close the gaps, leaving the admin's drag-to-reorder room to work.
WITH ordered AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY "sortOrder", "createdAt") - 1) * 10 AS position
  FROM "PageSection"
  WHERE "pageId" IN (SELECT id FROM "Page" WHERE slug = 'about')
)
UPDATE "PageSection" s
SET "sortOrder" = o.position, "updatedAt" = NOW()
FROM ordered o
WHERE s.id = o.id AND s."sortOrder" <> o.position;
