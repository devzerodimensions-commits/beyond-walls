-- A line under the logo in the footer.
--
-- The footer has always rendered `footer.about` when it is set; it had simply
-- never been written, leaving a column with a logo and nothing else.
--
-- The wording is the studio's own, taken from the About page they supplied:
-- the 2004 start, Ahmedabad, and the breadth they asked for: not nameplates
-- alone, but work for residential and commercial spaces alike.
--
-- Only fills the setting when it is empty, so anything written in Admin ->
-- Settings is left exactly as it is.
UPDATE "Setting"
SET value = to_jsonb(
  'Design-led pieces for homes and workplaces, made to order in Ahmedabad. A signage manufacturer since 2004, now building for residential and commercial spaces alike.'::text
)
WHERE key = 'footer.about'
  AND (value IS NULL OR value::text IN ('""', 'null'));
