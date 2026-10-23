-- Apply the studio's cash-on-delivery rule where it never took.
--
-- "Cash on delivery will be available for generic products but we won't be
-- having cash on delivery on custom Products like name plates." That was done
-- in 20261009090000, which marks a product made-to-order when one of its
-- personalisation fields is bound to a preview slot.
--
-- On a database created after that migration, it ran against an empty table:
-- migrations go first, the catalogue is seeded afterwards, so there were no
-- products to mark and the rule quietly applied to nothing. The studio's own
-- server came up that way -- the name plate, which is cut to a customer's
-- name, was being offered cash on delivery on the live site.
--
-- Guarded on the rule never having been applied at all: if any product is
-- already marked, somebody has been managing this by hand and their decisions
-- are left alone.
UPDATE "Product" p
SET "codAvailable" = false
WHERE p."codAvailable" = true
  AND EXISTS (
    SELECT 1 FROM "PersonalizationField" f
    WHERE f."productId" = p.id AND f."previewSlot" IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Product" q WHERE q."codAvailable" = false
  );
