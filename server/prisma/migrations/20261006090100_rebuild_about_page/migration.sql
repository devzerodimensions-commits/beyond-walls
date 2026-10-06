-- Clears the About page so it is written again with the designed layout.
--
-- The first version was a column of paragraphs. The replacement opens with a
-- photograph, alternates image and text down the page, and sets the process out
-- as numbered steps. Both versions are the studio's own words -- only the
-- arrangement changes -- so nothing they wrote is lost.
--
-- Scoped to About alone. The policy pages are documents and are left as they
-- are. Runs once per environment, like any migration; afterwards the content
-- step leaves the page alone because it has blocks again.
DELETE FROM "PageSection"
WHERE "pageId" IN (SELECT id FROM "Page" WHERE slug = 'about');
