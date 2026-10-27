-- Four content repairs the studio asked for, each guarded so it only touches
-- the thing it is meant to and does nothing on a database already correct.

-- 1. The hero back to the top ------------------------------------------------
--
-- The three-reason strip was sorting above the opening photograph, and because
-- the header is fixed and overlays whatever is first, the strip was sliding
-- underneath it -- the headings and the navigation printed on top of each
-- other. The earlier fix for this was guarded on two sections sharing a
-- position, which is not the state the studio's database was actually in.
--
-- Guarded instead on the symptom itself: anything at or before the hero. A
-- homepage whose hero is already first is left exactly as it is.
UPDATE "PageSection" s
SET "sortOrder" = v.ord
FROM (VALUES
  ('HERO', 0),
  ('USP_STRIP', 1),
  ('CATEGORY_GRID', 2),
  ('GUIDED_FINDER', 3),
  ('SHOP_BY_ATTRIBUTE', 4),
  ('FEATURED_PRODUCTS', 5),
  ('PRODUCT_RAIL', 6),
  ('PERSONALISATION_DEMO', 7),
  ('CUSTOM_ORDER_CTA', 8),
  ('TESTIMONIALS', 9),
  ('GALLERY', 10),
  ('FAQ', 11)
) AS v(type, ord)
WHERE s.type::text = v.type
  AND s."pageId" IN (SELECT id FROM "Page" WHERE slug = 'home')
  AND EXISTS (
    SELECT 1
    FROM "PageSection" o
    WHERE o."pageId" = s."pageId"
      AND o.type::text <> 'HERO'
      AND o."sortOrder" <= (
        SELECT h."sortOrder"
        FROM "PageSection" h
        WHERE h."pageId" = s."pageId" AND h.type::text = 'HERO'
        LIMIT 1
      )
  );

-- 2. A heading that had been typed over itself -------------------------------
--
-- The first reason read "Made personalPersonalised" -- the studio's own
-- wording with the older wording still stuck to the front of it. Only that
-- exact string is replaced, so the other two headings and any later edit are
-- untouched.
UPDATE "PageSection" s
SET config = jsonb_set(
      s.config,
      '{items}',
      (
        SELECT jsonb_agg(
                 CASE WHEN item->>'title' = 'Made personalPersonalised'
                      THEN jsonb_set(item, '{title}', '"Made personal"')
                      ELSE item END
                 ORDER BY ord
               )
        FROM jsonb_array_elements(s.config->'items') WITH ORDINALITY AS t(item, ord)
      )
    ),
    "updatedAt" = NOW()
WHERE s.type::text = 'USP_STRIP'
  AND s.config->'items' @> '[{"title":"Made personalPersonalised"}]'::jsonb;

-- 3. "For Offices" becomes "For Business" ------------------------------------
--
-- Renamed in the menu and on the category itself, so the link and the page it
-- opens agree. The slug is deliberately left as for-offices: changing it would
-- break every existing link to that page, and nobody reads the slug.
UPDATE "NavLink"
SET label = 'For Business', "updatedAt" = NOW()
WHERE "group" = 'header' AND href = '/shop/for-offices' AND label = 'For Offices';

UPDATE "Category"
SET name = 'For Business', "updatedAt" = NOW()
WHERE slug = 'for-offices' AND name = 'For Offices';

-- 4. Prints, which the menu never carried ------------------------------------
--
-- The category and its three sub-categories have existed since the first seed
-- and the page works; it simply was not linked from the header. Inserted
-- directly after Signs, with everything after it moved down one to make room.
UPDATE "NavLink"
SET "sortOrder" = "sortOrder" + 1, "updatedAt" = NOW()
WHERE "group" = 'header'
  AND "sortOrder" > (
    SELECT "sortOrder" FROM "NavLink"
    WHERE "group" = 'header' AND href = '/shop/informative-signs' LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM "NavLink" WHERE "group" = 'header' AND href = '/shop/prints'
  );

INSERT INTO "NavLink" (id, label, href, "group", "sortOrder", status, "openInNewTab", "createdAt", "updatedAt")
SELECT
  'nav_header_prints',
  'Prints',
  '/shop/prints',
  'header',
  (SELECT "sortOrder" + 1 FROM "NavLink"
   WHERE "group" = 'header' AND href = '/shop/informative-signs' LIMIT 1),
  'PUBLISHED',
  false,
  NOW(),
  NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM "NavLink" WHERE "group" = 'header' AND href = '/shop/prints'
  )
  AND EXISTS (
    SELECT 1 FROM "NavLink" WHERE "group" = 'header' AND href = '/shop/informative-signs'
  );
