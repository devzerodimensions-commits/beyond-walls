-- The personalisation changes the studio asked for, applied everywhere.
--
-- Two of their review notes were done once and never travelled: "remove this
-- optional logo section" from the product page, and "client want to add your
-- self font style and color also". A product's personalisation inputs are rows,
-- not code, so a deploy carried neither. The live product page still offers a
-- logo upload they asked us to take away, and three fonts where the preview can
-- draw six.
--
-- Scoped by key, and the option lists are merged rather than replaced: a choice
-- someone added in the admin stays, and re-running changes nothing.

-- 1. The logo upload, which they asked to remove from the product page.
--    Orders keep a JSON snapshot of what was personalised, so nothing already
--    placed loses its record by this.
DELETE FROM "PersonalizationField" WHERE key = 'logoUpload';

-- 2. Every face the preview can actually draw. The renderer has had all six
--    since the font catalogue was unified; the product offered three.
UPDATE "PersonalizationField" f
SET options = f.options || (
  SELECT COALESCE(jsonb_agg(want.opt), '[]'::jsonb)
  FROM jsonb_array_elements('[
    {"label":"Grotesque","value":"grotesque","priceDelta":0},
    {"label":"Display","value":"display","priceDelta":0},
    {"label":"Serif","value":"serif","priceDelta":0},
    {"label":"Condensed","value":"condensed","priceDelta":0},
    {"label":"Technical","value":"mono","priceDelta":0},
    {"label":"Script","value":"script","priceDelta":0}
  ]'::jsonb) AS want(opt)
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(f.options) AS have(opt)
    WHERE have.opt->>'value' = want.opt->>'value'
  )
)
WHERE f.key = 'font' AND f.type = 'FONT';

-- 3. Plate and text colours, each carrying the hex it really is so the preview
--    paints what the customer picked.
UPDATE "PersonalizationField" f
SET options = f.options || (
  SELECT COALESCE(jsonb_agg(want.opt), '[]'::jsonb)
  FROM jsonb_array_elements('[
    {"hex":"#111111","label":"Black","value":"black","priceDelta":0},
    {"hex":"#F5F3EE","label":"White","value":"white","priceDelta":0},
    {"hex":"#C8A961","label":"Brass","value":"brass","priceDelta":0},
    {"hex":"#C9CCD1","label":"Steel","value":"steel","priceDelta":0}
  ]'::jsonb) AS want(opt)
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(f.options) AS have(opt)
    WHERE have.opt->>'value' = want.opt->>'value'
  )
)
WHERE f.key = 'plateColour' AND f.type = 'COLOR';

UPDATE "PersonalizationField" f
SET options = f.options || (
  SELECT COALESCE(jsonb_agg(want.opt), '[]'::jsonb)
  FROM jsonb_array_elements('[
    {"hex":"#F5F3EE","label":"White","value":"white","priceDelta":0},
    {"hex":"#111111","label":"Black","value":"black","priceDelta":0},
    {"hex":"#C8A961","label":"Brass","value":"brass","priceDelta":0},
    {"hex":"#3157FF","label":"Blue","value":"blue","priceDelta":0}
  ]'::jsonb) AS want(opt)
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(f.options) AS have(opt)
    WHERE have.opt->>'value' = want.opt->>'value'
  )
)
WHERE f.key = 'textColour' AND f.type = 'COLOR';
