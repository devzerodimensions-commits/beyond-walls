-- Give the About page a shape, not just an order.
--
-- The previous migration removed the two profiles and put the right blocks in
-- the right sequence. It did not change how any of them looked, and the result
-- read flat: a full-bleed photograph, then paragraphs of roughly equal weight
-- all the way down, with the three facts set in 12px between hairline rules so
-- they registered as fine print rather than as the argument.
--
-- Two changes, both opt-in flags on sections that already exist. No new section
-- types, nothing else on the site moves.
--
--   1. The facts strip asks for the `feature` treatment: a tinted band,
--      numerals large enough to set a rhythm, type at a size somebody reads.
--   2. The line the page is actually making is lifted out of the middle of a
--      paragraph and set on its own, large, between rules.
--
-- The statement is the studio's own closing sentence, moved rather than
-- written, and removed from the paragraph it came from so the page does not say
-- it twice.

-- 1. The three facts, given room.
UPDATE "PageSection"
SET config = config || '{"variant":"feature"}'::jsonb,
    "updatedAt" = NOW()
WHERE "pageId" IN (SELECT id FROM "Page" WHERE slug = 'about')
  AND type = 'USP_STRIP'
  AND COALESCE(config->>'variant', '') <> 'feature';

-- 2. Take the closing line out of the paragraph it is buried in.
--    Guarded on the sentence still being there, so a studio edit is not undone.
UPDATE "PageSection"
SET "bodyText" = regexp_replace(
      "bodyText",
      E'\n\nGood design starts with an idea\. Good making brings it to life\. We understand both\.\s*$',
      ''
    ),
    "updatedAt" = NOW()
WHERE "pageId" IN (SELECT id FROM "Page" WHERE slug = 'about')
  AND type = 'IMAGE_TEXT'
  AND subtitle = 'What makes us different'
  AND "bodyText" LIKE '%Good design starts with an idea.%';

-- 3. Set it on its own, immediately before the closing call to action, which is
--    where a page should make its point rather than after it.
INSERT INTO "PageSection" (id, "pageId", type, subtitle, title, config, "sortOrder", status, "createdAt", "updatedAt")
SELECT
  'about-statement',
  p.id,
  'SECTION_HEADING',
  NULL,
  'Good design starts with an idea. Good making brings it to life. We understand both.',
  '{"variant":"statement"}'::jsonb,
  COALESCE(
    (SELECT s."sortOrder" - 5 FROM "PageSection" s
      WHERE s."pageId" = p.id AND s.type IN ('CTA', 'CUSTOM_ORDER_CTA')
      ORDER BY s."sortOrder" DESC LIMIT 1),
    999
  ),
  'PUBLISHED',
  NOW(),
  NOW()
FROM "Page" p
WHERE p.slug = 'about'
  AND NOT EXISTS (
    SELECT 1 FROM "PageSection" s WHERE s.id = 'about-statement'
  );

-- 4. Close the gaps, leaving the admin's drag-to-reorder room to work.
WITH ordered AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY "sortOrder", "createdAt") - 1) * 10 AS position
  FROM "PageSection"
  WHERE "pageId" IN (SELECT id FROM "Page" WHERE slug = 'about')
)
UPDATE "PageSection" s
SET "sortOrder" = o.position, "updatedAt" = NOW()
FROM ordered o
WHERE s.id = o.id AND s."sortOrder" <> o.position;
