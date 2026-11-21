-- The plate a customer approved, kept with their cart line and their order.
--
-- Until now a line carried the words typed and nothing else, so the picture
-- the customer looked at before paying existed only on their screen: the
-- cart, the checkout and the order could not show it, and the studio cut from
-- a list of answers without seeing the plate that was agreed. A snapshot of
-- the design, the words and their sizes is enough to draw it again exactly.
--
-- Additive and nullable: existing lines and orders simply have none.
ALTER TABLE "CartItem" ADD COLUMN IF NOT EXISTS "preview" JSONB;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "preview" JSONB;
