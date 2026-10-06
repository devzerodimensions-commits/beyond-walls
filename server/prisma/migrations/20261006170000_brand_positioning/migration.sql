-- The studio's own words for what Beyond Walls is.
--
-- Their note: "we do not want our website communication like this. We are not
-- only selling Name plates & signages but a lot of different products for
-- residential and commercial spaces." They then supplied the line themselves:
--
--   "Beyond Walls is a contemporary home & lifestyle brand creating
--    thoughtfully designed objects for spaces that feel like yours."
--   "Or A design led brand for your spaces."
--
-- Both are used here: the short one as the headline, the long one underneath.
-- Nothing in this file is written by us; it is their sentence, placed.

-- The homepage opening, but only while it still says what they objected to.
-- Anything edited in Design Pages since is left alone.
UPDATE "PageSection"
SET
  title = 'A design-led brand for your spaces',
  subtitle = 'Beyond Walls is a contemporary home & lifestyle brand creating thoughtfully designed objects for spaces that feel like yours.'
WHERE type = 'HERO'
  AND "pageId" IN (SELECT id FROM "Page" WHERE slug = 'home')
  AND title IN ('Nameplates & signage', 'Designed for homes and workplaces');

-- The line under the footer logo.
UPDATE "Setting"
SET value = to_jsonb(
  'A contemporary home & lifestyle brand creating thoughtfully designed objects for spaces that feel like yours. Made to order in Ahmedabad.'::text
)
WHERE key = 'footer.about';

-- What a search result and a shared link say. These still described the site as
-- nameplates and signage, which is the whole of the complaint.
UPDATE "Setting"
SET value = to_jsonb('Beyond Walls — A design-led brand for your spaces'::text)
WHERE key = 'seo.defaultTitle'
  AND value::text LIKE '%Nameplates%';

UPDATE "Setting"
SET value = to_jsonb(
  'Beyond Walls is a contemporary home & lifestyle brand creating thoughtfully designed objects for spaces that feel like yours. Made to order in Ahmedabad.'::text
)
WHERE key = 'seo.defaultDescription';

UPDATE "Setting"
SET value = to_jsonb(
  'home and lifestyle, design-led objects, nameplates, signage, prints, Ahmedabad'::text
)
WHERE key = 'seo.defaultKeywords';
