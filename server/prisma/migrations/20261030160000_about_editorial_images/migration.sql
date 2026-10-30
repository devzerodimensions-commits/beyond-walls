-- Give the About page's two picture blocks a shape.
--
-- They were rendering at whatever height their photograph happened to be --
-- 887px for one, 424px for the other, for two blocks doing the same job. The
-- component now takes a stated ratio and an editorial layout; this asks the
-- About page for both.
--
-- `editorial` is the asymmetric split: the picture takes seven columns of
-- twelve and drops below the text's top edge on wide screens, which is what
-- separates a spread from a slide. The sides already alternate, so the offset
-- alternates with them and the page zig-zags down rather than marching.
--
-- `landscape` is the ratio. These are documentary photographs -- a shopfront,
-- a workshop -- and a portrait crop would cut the sides off the subject.
--
-- Guarded on the flags being absent, so a studio that has since chosen its own
-- layout in the admin keeps it.
UPDATE "PageSection"
SET config = config || '{"variant":"editorial","ratio":"landscape"}'::jsonb,
    "updatedAt" = NOW()
WHERE "pageId" IN (SELECT id FROM "Page" WHERE slug = 'about')
  AND type = 'IMAGE_TEXT'
  AND config->>'variant' IS DISTINCT FROM 'editorial';
