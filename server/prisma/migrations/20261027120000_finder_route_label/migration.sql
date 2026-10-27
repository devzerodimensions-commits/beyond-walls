-- The finder card that still said "For Offices".
--
-- "Where is it going?" does not read the categories; each route keeps its own
-- copy of the title and the blurb, written when the route was made. So the
-- rename reached the menu and the category page and stopped there, and the
-- homepage went on offering a collection by a name nothing else used.
--
-- Matched on the link as well as the label, so a route pointing somewhere else
-- that happens to carry those words is left alone. The blurb is deliberately
-- untouched: it describes offices, clinics and retail spaces, which is still
-- exactly what that collection is.
UPDATE "PageSection" s
SET config = jsonb_set(
      s.config,
      '{items}',
      (
        SELECT jsonb_agg(
                 CASE WHEN item->>'href' = '/shop/for-offices'
                       AND item->>'title' = 'For Offices'
                      THEN jsonb_set(item, '{title}', '"For Business"')
                      ELSE item END
                 ORDER BY ord
               )
        FROM jsonb_array_elements(s.config->'items') WITH ORDINALITY AS t(item, ord)
      )
    ),
    "updatedAt" = NOW()
WHERE s.config->'items' @> '[{"href":"/shop/for-offices","title":"For Offices"}]'::jsonb;
