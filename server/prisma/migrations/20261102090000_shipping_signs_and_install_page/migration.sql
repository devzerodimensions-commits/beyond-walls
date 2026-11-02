-- Three things the studio asked for: a delivery charge, one fewer category,
-- and a page about fitting a sign.
--
-- All three are rows rather than code, so they travel in a migration. Each
-- step is guarded on the state it expects to find, so running it twice, or
-- running it after someone has already done the same thing by hand in the
-- admin, changes nothing the second time.


-- 1. Delivery: 150 below 1,000, free at or above it. -------------------------
--
-- The rule itself was already implemented and already configured: the cart
-- charges shipping.flatRate and waives it once the taxable total reaches
-- shipping.freeAbove, and freeAbove was set to 1000 some time ago. The only
-- missing piece was the charge, which has been sitting at 0 — so every order
-- under a thousand rupees has been shipping free by accident rather than by
-- decision.
--
-- Guarded on that 0. If the studio has since set a rate of their own, theirs
-- stands: a migration should not overrule a live pricing decision made after
-- it was written.
UPDATE "Setting"
SET value = '150'::jsonb
WHERE key = 'shipping.flatRate'
  AND value::text IN ('0', '"0"');

-- freeAbove is already 1000 in production. Set it only if it is still at the
-- "always free" default, so a fresh install gets the same rule.
UPDATE "Setting"
SET value = '1000'::jsonb
WHERE key = 'shipping.freeAbove'
  AND value::text IN ('0', '"0"');


-- 2. Informative Signs folded into For Business. -----------------------------
--
-- "For Business" is the category the studio means; its slug is for-offices,
-- which is the kind of detail that makes matching on name rather than slug
-- the safer choice here.
--
-- Order matters. The products and the three sub-categories have to be moved
-- before the parent is deleted, because the schema's onDelete is SetNull:
-- delete first and every sign would quietly become uncategorised rather than
-- failing loudly.

-- 2a. Products filed directly under Informative Signs become For Business.
UPDATE "Product"
SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'for-offices')
WHERE "categoryId" = (SELECT id FROM "Category" WHERE slug = 'informative-signs')
  AND EXISTS (SELECT 1 FROM "Category" WHERE slug = 'for-offices');

-- 2b. The same for anything that had it as a subcategory.
UPDATE "Product"
SET "subcategoryId" = NULL
WHERE "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'informative-signs');

-- 2c. Prohibition Signs, Way Finding and Mandatory Signs move across intact,
--     appended after the four that For Business already has so nothing
--     changes position under the client.
UPDATE "Category" c
SET "parentId" = (SELECT id FROM "Category" WHERE slug = 'for-offices'),
    "sortOrder" = c."sortOrder" + COALESCE(
      (SELECT MAX(x."sortOrder") + 1
         FROM "Category" x
        WHERE x."parentId" = (SELECT id FROM "Category" WHERE slug = 'for-offices')),
      0)
WHERE c."parentId" = (SELECT id FROM "Category" WHERE slug = 'informative-signs')
  AND EXISTS (SELECT 1 FROM "Category" WHERE slug = 'for-offices');

-- 2d. Now it is empty, it can go.
DELETE FROM "Category"
WHERE slug = 'informative-signs'
  AND NOT EXISTS (SELECT 1 FROM "Category" WHERE "parentId" = (SELECT id FROM "Category" WHERE slug = 'informative-signs'))
  AND NOT EXISTS (SELECT 1 FROM "Product" WHERE "categoryId" = (SELECT id FROM "Category" WHERE slug = 'informative-signs'));

-- 2e. And the header link that pointed at it. Left in place it would be a
--     menu item leading to a 404.
DELETE FROM "NavLink" WHERE href = '/shop/informative-signs';


-- 3. "How to install?" --------------------------------------------------------
--
-- Placeholder copy, written here so the page exists and reads sensibly, and
-- marked as such in the first line so nobody mistakes it for the studio's
-- own words. It describes only what the photographs on the About page already
-- show them doing, and names no tool, fixing or material the studio has not
-- published. The client is replacing it with their own instructions.
--
-- Not a system page: isSystem stays false so they can rename, reslug or
-- delete it without touching code.
INSERT INTO "Page" (
  id, slug, title, excerpt, content, status, "showInFooter", "sortOrder",
  "isSystem", "seoTitle", "seoDescription", "createdAt", "updatedAt"
)
SELECT
  'pg_how_to_install',
  'how-to-install',
  'How to install?',
  'A short guide to fitting a Beyond Walls sign or nameplate.',
  E'> **Draft.** This guide is placeholder text written by your developer so the page exists. Replace it with your own instructions in Admin → Design Pages.\n\n'
  || E'Every piece we make is finished before it leaves the facility, so fitting one is the last short step rather than the hard part. Most of our work we install ourselves — if you would rather we did, tell us when you order.\n\n'
  || E'## Before you start\n\n'
  || E'Check the piece against your order: the spelling, the finish, and that nothing has moved in transit. Hold it against the wall and live with the position for a minute before you commit to it. A sign that is ten millimetres off centre is far more obvious once it is up than it is in your hand.\n\n'
  || E'## Mark the position\n\n'
  || E'Decide the height first. For a door number or a nameplate, eye level for the person reading it is usually right. Mark the top edge lightly, step back, and look at it from where people will actually stand.\n\n'
  || E'Use a spirit level rather than the door frame or the tiles — frames and tile lines are rarely as level as they look, and a plate lined up with a crooked frame reads as a crooked plate.\n\n'
  || E'## Fixing it to the wall\n\n'
  || E'Pieces supplied with adhesive backing go onto a clean, dry, flat surface. Wipe the area and let it dry completely; the adhesive will not hold on dust or on a surface still damp from cleaning. Press firmly across the whole back, not just the corners, and leave it undisturbed for twenty-four hours before testing it.\n\n'
  || E'Pieces supplied with standoffs or screws need holes drilled to the positions marked. Drill the first hole, fix it loosely, level the piece, then mark and drill the rest — it is far easier to correct one hole than four.\n\n'
  || E'## Looking after it\n\n'
  || E'Clean with a soft, slightly damp cloth. Avoid scouring pads and solvent cleaners, which will dull a brushed finish and can lift printed graphics.\n\n'
  || E'## If something is not right\n\n'
  || E'If a piece arrives damaged, or does not sit as it should, contact us with your order number and a photograph and we will sort it out.',
  'PUBLISHED'::"ContentStatus",
  true,
  100,
  false,
  'How to install a sign board — Beyond Walls',
  'A short guide to fitting a Beyond Walls sign or nameplate: marking the position, fixing it to the wall, and looking after it.',
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Page" WHERE slug = 'how-to-install');
