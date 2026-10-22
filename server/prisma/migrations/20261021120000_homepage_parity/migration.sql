-- Give the homepage its sections on any database that is missing them.
--
-- Moving to the studio's own server meant a second database, and it came up
-- with the full catalogue, the same settings, the same thirteen nav links --
-- and a homepage with two sections instead of eight. The opening, the strip of
-- three reasons, the featured products, the custom-order call and the
-- questions were all absent, so the page rendered correctly and had almost
-- nothing on it.
--
-- The cause is ordering: these sections are created by the seed, and the
-- guards that stop a seed overwriting real content also stop it filling a
-- homepage that already had a section or two put there by a migration.
--
-- Every insert below is guarded on that section type being absent from the
-- home page, so this is a no-op on a database that already has them and
-- cannot duplicate anything. The wording is the studio's own, copied from the
-- site they have been reviewing, not written here.

-- 1. The opening ------------------------------------------------------------
INSERT INTO "PageSection" ("id","pageId","type","title","subtitle","ctaLabel","ctaLink","config","sortOrder","status","createdAt","updatedAt")
SELECT 'sec_home_hero', p.id, 'HERO',
       'A design-led brand for your spaces',
       'Beyond Walls is a contemporary home & lifestyle brand creating thoughtfully designed objects for spaces that feel like yours.',
       'Browse the shop', '/shop',
       '{"image":"https://res.cloudinary.com/halrwecf/image/upload/v1790930601/banners/chatgpt-image-sep-30-2026-01-02-37-pm-ipy-noe8fl-fol7lS4BFX.webp"}'::jsonb,
       0, 'PUBLISHED', NOW(), NOW()
FROM "Page" p
WHERE p.slug = 'home'
  AND NOT EXISTS (SELECT 1 FROM "PageSection" s WHERE s."pageId" = p.id AND s.type = 'HERO');

-- 2. Three reasons, in the studio's words ------------------------------------
INSERT INTO "PageSection" ("id","pageId","type","config","sortOrder","status","createdAt","updatedAt")
SELECT 'sec_home_usp', p.id, 'USP_STRIP',
       '{"items":[
         {"title":"Personalised","text":"Names, numbers, logos and artwork set on the plate before it is made."},
         {"title":"Made to order","text":"Every piece is produced for the specification you send us."},
         {"title":"Studio in Ahmedabad","text":"Prime Center Mall, Mirzapur — open Monday to Saturday."}
       ]}'::jsonb,
       1, 'PUBLISHED', NOW(), NOW()
FROM "Page" p
WHERE p.slug = 'home'
  AND NOT EXISTS (SELECT 1 FROM "PageSection" s WHERE s."pageId" = p.id AND s.type = 'USP_STRIP');

-- 3. The catalogue -----------------------------------------------------------
INSERT INTO "PageSection" ("id","pageId","type","title","subtitle","ctaLabel","ctaLink","config","sortOrder","status","createdAt","updatedAt")
SELECT 'sec_home_featured', p.id, 'FEATURED_PRODUCTS',
       'Featured', 'A selection from the catalogue.',
       'View all products', '/shop',
       '{"limit":8}'::jsonb,
       4, 'PUBLISHED', NOW(), NOW()
FROM "Page" p
WHERE p.slug = 'home'
  AND NOT EXISTS (SELECT 1 FROM "PageSection" s WHERE s."pageId" = p.id AND s.type = 'FEATURED_PRODUCTS');

-- 4. The way to ask for something that is not in it --------------------------
INSERT INTO "PageSection" ("id","pageId","type","title","ctaLabel","ctaLink","config","sortOrder","status","createdAt","updatedAt")
SELECT 'sec_home_custom', p.id, 'CUSTOM_ORDER_CTA',
       'Need something made to your own specification?',
       'Start a custom order', '/custom-order',
       '{}'::jsonb,
       5, 'PUBLISHED', NOW(), NOW()
FROM "Page" p
WHERE p.slug = 'home'
  AND NOT EXISTS (SELECT 1 FROM "PageSection" s WHERE s."pageId" = p.id AND s.type = 'CUSTOM_ORDER_CTA');

-- 5. The questions -----------------------------------------------------------
INSERT INTO "PageSection" ("id","pageId","type","title","config","sortOrder","status","createdAt","updatedAt")
SELECT 'sec_home_faq', p.id, 'FAQ',
       'Frequently asked questions',
       '{"group":"General","limit":6}'::jsonb,
       8, 'PUBLISHED', NOW(), NOW()
FROM "Page" p
WHERE p.slug = 'home'
  AND NOT EXISTS (SELECT 1 FROM "PageSection" s WHERE s."pageId" = p.id AND s.type = 'FAQ');

-- 6. "Where is it going?" came out with no routes -----------------------------
--
-- It is built from the categories, and on a fresh database the categories did
-- not exist yet when it was created. Filled from them now, exactly as it was
-- meant to be, and only while it is still empty -- so routes the studio has
-- since edited are left alone.
UPDATE "PageSection" s
SET config = jsonb_set(s.config, '{items}', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'title', c.name,
                 'text',  c.description,
                 'href',  '/shop/' || c.slug,
                 'image', c.image
               ) ORDER BY c."sortOrder", c.name
             )
      FROM "Category" c
      WHERE c."parentId" IS NULL AND c.status = 'PUBLISHED' AND c."showInMenu" = true
    ), '[]'::jsonb))
WHERE s.type = 'GUIDED_FINDER'
  AND s."pageId" IN (SELECT id FROM "Page" WHERE slug = 'home')
  AND COALESCE(jsonb_array_length(s.config -> 'items'), 0) = 0;
