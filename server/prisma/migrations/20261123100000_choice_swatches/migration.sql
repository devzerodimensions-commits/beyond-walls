-- The colour a choice's value actually is.
--
-- A plate offered in Silver and Golden listed two words, and a customer
-- choosing by name is choosing blind. The swatch belongs to the value rather
-- than to any one combination -- "Silver" is the same silver in every size --
-- so it is kept once per product: { "Colour": { "Silver": "#C9CCD1" } }.
--
-- Additive and nullable: a product without one shows its values as words,
-- exactly as before.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "choiceSwatches" JSONB;
