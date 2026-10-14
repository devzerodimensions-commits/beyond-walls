-- Two new ways onto the homepage.
--
-- GUIDED_FINDER is for the visitor who does not yet know the word for what
-- they want. A grid of categories answers "which of these?"; this answers
-- "what are you trying to do?", which is the question somebody actually
-- arrives with. It is the one idea worth taking from the reference the studio
-- sent -- the question, not the styling.
--
-- PRODUCT_RAIL is a row of products that scrolls sideways. The existing
-- FEATURED_PRODUCTS grid becomes a very long column on a phone, where most of
-- this traffic is; a rail shows the same pieces in one screen and invites a
-- swipe.
--
-- Postgres cannot add an enum value inside a transaction that then uses it, so
-- these are added here and nothing in this file refers to them.
ALTER TYPE "SectionType" ADD VALUE IF NOT EXISTS 'GUIDED_FINDER';
ALTER TYPE "SectionType" ADD VALUE IF NOT EXISTS 'PRODUCT_RAIL';
