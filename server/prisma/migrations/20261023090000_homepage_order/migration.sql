-- Put the homepage back in order.
--
-- The migration that filled in the missing sections gave each one the position
-- it holds on the database I could see. On the studio's server an earlier
-- renumber had already moved things, so the hero was inserted at 0 where the
-- finder already sat, and the strip at 1 where the gallery already sat. Two
-- sections to a position, and the tie broken by whatever the database felt
-- like returning -- which put "Where is it going?" above the opening
-- photograph.
--
-- Fixed by giving the homepage one position per section, in the order the page
-- is meant to read.
--
-- Guarded on a tie actually existing. A homepage somebody has deliberately
-- arranged has no two sections sharing a position, so this leaves it exactly
-- as they left it; only a page broken in the way described above is touched.
UPDATE "PageSection" s
SET "sortOrder" = v.ord
FROM (VALUES
  ('HERO', 0),
  ('USP_STRIP', 1),
  ('CATEGORY_GRID', 2),
  ('GUIDED_FINDER', 3),
  ('SHOP_BY_ATTRIBUTE', 4),
  ('FEATURED_PRODUCTS', 5),
  ('PERSONALISATION_DEMO', 6),
  ('CUSTOM_ORDER_CTA', 7),
  ('TESTIMONIALS', 8),
  ('GALLERY', 9),
  ('FAQ', 10)
) AS v(type, ord)
WHERE s.type::text = v.type
  AND s."pageId" IN (SELECT id FROM "Page" WHERE slug = 'home')
  AND EXISTS (
    SELECT 1
    FROM "PageSection" d
    WHERE d."pageId" = s."pageId"
    GROUP BY d."sortOrder"
    HAVING count(*) > 1
  );
