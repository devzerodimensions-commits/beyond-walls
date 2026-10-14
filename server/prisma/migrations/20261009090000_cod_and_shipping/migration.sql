-- Cash on delivery per product, and the studio's shipping rule.
--
-- Their words: "Cash on delivery will be available for generic products but we
-- won't be having cash on delivery on custom Products like name plates." The
-- site had one switch for the whole shop, so this gives every product its own.
--
-- The reason is sound: a plate cut with somebody else's name on it cannot be
-- resold if the order is refused at the door. A stock item can.

-- Default true, because most of the catalogue is stock.
ALTER TABLE "Product" ADD COLUMN "codAvailable" BOOLEAN NOT NULL DEFAULT true;

-- Their rule applied to what exists today. A product is made to order when a
-- personalisation field is bound to a preview slot: that is the input which
-- changes what is physically produced -- the name on the plate, its face, its
-- colour. Having personalisation at all is not the test. The No Smoking Sign
-- offers a mounting type and a notes box and is still a stock item off a shelf;
-- it keeps cash on delivery.
--
-- Every product can be changed afterwards from the admin panel, and this runs
-- once.
UPDATE "Product" p
SET "codAvailable" = false
WHERE EXISTS (
  SELECT 1 FROM "PersonalizationField" f
  WHERE f."productId" = p.id AND f."previewSlot" IS NOT NULL
);

-- --------------------------------------------------------------------------
-- Shipping: "free for any orders above 1000/-, there will be a flat rate
-- delivery charge for orders below 1000/-".
--
-- The threshold is theirs and is set here. The flat rate itself is NOT set:
-- they have not given the amount yet, and a delivery charge is not ours to
-- invent. Until it is filled in from Settings -> Shipping, delivery is free on
-- every order -- which undercharges rather than overcharges while we wait.
-- --------------------------------------------------------------------------
INSERT INTO "Setting" ("key", "group", "label", "value", "updatedAt")
VALUES ('shipping.freeAbove', 'shipping',
        'Free shipping above (INR, 0 = always free)', '1000'::jsonb, NOW())
ON CONFLICT ("key") DO UPDATE SET "value" = '1000'::jsonb, "updatedAt" = NOW();

-- --------------------------------------------------------------------------
-- The GST invoice box at checkout.
--
-- "Currently we are not planning to register for GST" -- and a GST invoice can
-- only be raised by a registered business, so asking the customer for a GSTIN
-- promises something that cannot be issued. Hidden rather than removed: the
-- feature stays built and is one switch away in Settings -> Tax on the day
-- they do register.
-- --------------------------------------------------------------------------
INSERT INTO "Setting" ("key", "group", "label", "value", "updatedAt")
VALUES ('tax.gstInvoiceEnabled', 'tax',
        'Offer a GST invoice at checkout', 'false'::jsonb, NOW())
ON CONFLICT ("key") DO NOTHING;

-- --------------------------------------------------------------------------
-- Cash on delivery, switched on.
--
-- "Yes Cash on delivery will be available for generic products." It has been
-- off site-wide until now, which is why checkout has been telling customers
-- that no payment method is enabled and taking no orders at all. Turning it on
-- is safe only because of the per-product rule above: made-to-order pieces
-- refuse it on their own, including inside a mixed basket.
-- --------------------------------------------------------------------------
INSERT INTO "Setting" ("key", "group", "label", "value", "updatedAt")
VALUES ('payment.codEnabled', 'payment', 'Enable Cash on Delivery', 'true'::jsonb, NOW())
ON CONFLICT ("key") DO UPDATE SET "value" = 'true'::jsonb, "updatedAt" = NOW();
