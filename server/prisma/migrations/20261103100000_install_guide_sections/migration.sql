-- "How to install?" becomes a guide with pictures.
--
-- The page shipped as one block of markdown, which was the right first move
-- and the wrong finished thing: somebody standing at a wall with a plate in
-- one hand does not want eight paragraphs, they want to see the step they are
-- on. So it is rebuilt out of the ordinary page-builder sections, which means
-- the studio can reorder it, rewrite any paragraph and swap any picture for a
-- photograph of their own in Admin -> Design Pages, exactly as with every
-- other content page. None of it is hard-coded into a React page.
--
-- ON THE PICTURES
-- Fourteen of them are drawings that ship with the site, in /guide. They were
-- drawn for this rather than found: there are no photographs of anybody in
-- this studio cleaning a wall or tapping in a wall plug, and the alternative,
-- stock photography of somebody else's hands, is the thing the studio
-- explicitly ruled out for the About page. A drawing of the actual action is
-- honest; a photograph of a stranger pretending to do it is not. The two real
-- photographs used here are the studio's own, each in a frame of its own shape.
--
-- The drawings pick out the thing you actually do in brand.color (#0E7A57 as
-- set today), so the accent matches the step numbers beside them. An <img> is
-- a separate document and cannot read the page's CSS variables, so that value
-- is baked in: change the brand colour in Settings and these fourteen files
-- need the same change. It is a deliberate trade for keeping them swappable
-- from the media library like any other picture.
--
-- ON THE INSTRUCTIONS
-- Only two fixings are described, because the catalogue only offers two:
-- "Adhesive backing" and "Screw mount", which are the Mounting options on the
-- products themselves. The earlier draft also mentioned standoffs, which
-- nothing in this shop actually sells. Nothing below claims what is in the
-- box, promises a service area, or names a tool or material the studio has
-- not published -- where that mattered the copy says "check what came with
-- your piece" instead.
--
-- Every insert is guarded on its own id, so this is safe to re-run and cannot
-- overwrite a section the studio has edited since.


INSERT INTO "PageSection" (id, "pageId", type, title, subtitle, "bodyText", "ctaLabel", "ctaLink", config, "sortOrder", status, "createdAt", "updatedAt")
SELECT 'pg_hti_s0', p.id, 'PAGE_HERO'::"SectionType",
  $t$How to install?$t$,
  $t$Guide$t$,
  $t$Every piece leaves our facility finished and ready to go up. Fitting one is the short last step, and it is mostly about getting the position right before anything is stuck or drilled.$t$,
  NULL, NULL,
  -- bw-photo-10 is landscape, so this band crops it gently and the sign stays
  -- whole. A portrait photograph would lose two thirds of its height here.
  $j${"image": "/uploads/photos/bw-photo-10.webp", "height": "medium"}$j$::jsonb,
  0, 'PUBLISHED'::"ContentStatus", NOW(), NOW()
FROM "Page" p WHERE p.slug = 'how-to-install'
  AND NOT EXISTS (SELECT 1 FROM "PageSection" WHERE id = 'pg_hti_s0');

INSERT INTO "PageSection" (id, "pageId", type, title, subtitle, "bodyText", "ctaLabel", "ctaLink", config, "sortOrder", status, "createdAt", "updatedAt")
SELECT 'pg_hti_s1', p.id, 'RICH_TEXT'::"SectionType",
  $t$Before you start$t$, NULL,
  $t$Unpack the piece and check it against your order — the spelling, the finish, and that nothing has moved in transit. It is far easier to tell us now than once it is on the wall.

Then turn it over. How your piece is fixed decides everything that follows, and there are two kinds.$t$,
  NULL, NULL, '{}'::jsonb,
  1, 'PUBLISHED'::"ContentStatus", NOW(), NOW()
FROM "Page" p WHERE p.slug = 'how-to-install'
  AND NOT EXISTS (SELECT 1 FROM "PageSection" WHERE id = 'pg_hti_s1');

INSERT INTO "PageSection" (id, "pageId", type, title, subtitle, "bodyText", "ctaLabel", "ctaLink", config, "sortOrder", status, "createdAt", "updatedAt")
SELECT 'pg_hti_s2', p.id, 'STEPS'::"SectionType",
  $t$Which one do you have?$t$, NULL,
  $t$Look at the back of the piece before you pick up a tool. One of these two is what you are holding, and the rest of this page is written twice — once for each.$t$,
  NULL, NULL,
  $j${"items": [
    {
      "title": "Pads on the back",
      "text": "Foam adhesive pads, already applied, with a liner over them. Nothing to drill — but the surface has to be clean, flat and dry, and the position is final the moment it touches the wall.",
      "image": "/guide/fixing-adhesive.svg",
      "alt": "The back of a plate with four foam adhesive pads, one liner lifting off"
    },
    {
      "title": "Holes at the corners",
      "text": "Holes drilled through the piece for screws. More work, and more forgiving: it holds on a textured or uneven wall, it carries more weight, and it can be taken down and put back up.",
      "image": "/guide/fixing-screw.svg",
      "alt": "A plate with a hole at each corner, and the screw that passes through one"
    }
  ]}$j$::jsonb,
  2, 'PUBLISHED'::"ContentStatus", NOW(), NOW()
FROM "Page" p WHERE p.slug = 'how-to-install'
  AND NOT EXISTS (SELECT 1 FROM "PageSection" WHERE id = 'pg_hti_s2');

INSERT INTO "PageSection" (id, "pageId", type, title, subtitle, "bodyText", "ctaLabel", "ctaLink", config, "sortOrder", status, "createdAt", "updatedAt")
SELECT 'pg_hti_s3', p.id, 'STEPS'::"SectionType",
  $t$If it has pads on the back$t$,
  $t$Option one — adhesive$t$,
  $t$Adhesive holds well on a smooth, sound surface and badly on anything dusty, damp, powdery or textured. Nearly every failure is the surface, not the tape.$t$,
  NULL, NULL,
  $j${"items": [
    {
      "title": "Clean the wall",
      "text": "Wipe the area with a slightly damp cloth and let it dry completely. Dust, grease and fresh paint all stop it sticking — and so does a wall that is still damp from being cleaned.",
      "image": "/guide/adh-1-clean.svg",
      "alt": "A cloth wiping the patch of wall where the plate will go"
    },
    {
      "title": "Level it, then mark",
      "text": "Hold the piece where you want it, lay a spirit level across the top, and mark just outside the top two corners in pencil. Use the level rather than the door frame or the tile lines: frames are rarely as level as they look, and a plate lined up with a crooked frame reads as a crooked plate.",
      "image": "/guide/adh-2-level.svg",
      "alt": "A spirit level across the top of the plate, with a pencil mark outside each top corner"
    },
    {
      "title": "Peel the liner",
      "text": "Take the liner off the pads. From here on, keep the back off the wall until the piece is exactly where you want it — it grabs on contact, and it comes off again badly.",
      "image": "/guide/adh-3-peel.svg",
      "alt": "The liner being pulled away from the adhesive pads on the back of the plate"
    },
    {
      "title": "Press the whole back",
      "text": "Line up with your pencil marks and press firmly across the whole piece, not just the corners. The bond comes from contact, and the middle is where it tends to be missing.",
      "image": "/guide/adh-4-press.svg",
      "alt": "A flat palm pressing across the middle of the plate, not only its corners"
    },
    {
      "title": "Leave it alone",
      "text": "Adhesive keeps gaining strength for about a day. Do not hang anything from it, test it, or try to straighten it until then.",
      "image": "/guide/adh-5-wait.svg",
      "alt": "The plate on the wall beside a clock, marked 24 hours"
    }
  ]}$j$::jsonb,
  3, 'PUBLISHED'::"ContentStatus", NOW(), NOW()
FROM "Page" p WHERE p.slug = 'how-to-install'
  AND NOT EXISTS (SELECT 1 FROM "PageSection" WHERE id = 'pg_hti_s3');

INSERT INTO "PageSection" (id, "pageId", type, title, subtitle, "bodyText", "ctaLabel", "ctaLink", config, "sortOrder", status, "createdAt", "updatedAt")
SELECT 'pg_hti_s4', p.id, 'STEPS'::"SectionType",
  $t$If it has holes at the corners$t$,
  $t$Option two — screws$t$,
  $t$Drilling is permanent, so the marking matters more than the drilling. Check what came with your piece before you begin. If the wall is tiled or hollow, or you do not know what is behind it, this is the point to call somebody who fits things for a living.$t$,
  NULL, NULL,
  $j${"items": [
    {
      "title": "Hold it up and level it",
      "text": "Hold the piece against the wall, level across the top, and look at it from where people will actually stand before you commit to the position. Ten millimetres off centre is invisible in your hand and obvious on the wall.",
      "image": "/guide/scr-1-level.svg",
      "alt": "The drilled plate held against the wall with a spirit level across its top edge"
    },
    {
      "title": "Mark through the holes",
      "text": "With the piece still level, mark the wall through each of its holes. Marking through the piece itself is what stops the holes coming out anywhere other than where they belong.",
      "image": "/guide/scr-2-mark.svg",
      "alt": "A pencil marking the wall through one of the holes in the plate"
    },
    {
      "title": "Drill on the marks",
      "text": "Take the piece away and drill at each mark, straight into the wall and no deeper than the plug needs. Masonry wants a masonry bit, and usually a hammer drill.",
      "image": "/guide/scr-3-drill.svg",
      "alt": "A masonry bit drilling into the wall at one of the four pencil marks"
    },
    {
      "title": "Tap the plugs in flush",
      "text": "Push a wall plug into each hole and tap it level with the surface. A plug left standing proud holds the piece off the wall at that corner, and nothing you do afterwards will pull it flat.",
      "image": "/guide/scr-4-plug.svg",
      "alt": "A wall plug going into a drilled hole, and another already sitting flush"
    },
    {
      "title": "One screw, then check",
      "text": "Put the piece up and start one screw, left loose. Check the level again before you tighten anything: one loose screw can still be corrected, four tight ones cannot.",
      "image": "/guide/scr-5-fix.svg",
      "alt": "One screw started loosely in a corner, with the spirit level still on the plate"
    },
    {
      "title": "Tighten, then cap",
      "text": "Tighten the rest evenly — firm, not hard. Overtightening is what cracks acrylic and dimples a thin plate. Press the caps over the heads if your piece came with them.",
      "image": "/guide/scr-6-cap.svg",
      "alt": "The finished plate with a cap pressed over each screw head"
    }
  ]}$j$::jsonb,
  4, 'PUBLISHED'::"ContentStatus", NOW(), NOW()
FROM "Page" p WHERE p.slug = 'how-to-install'
  AND NOT EXISTS (SELECT 1 FROM "PageSection" WHERE id = 'pg_hti_s4');

INSERT INTO "PageSection" (id, "pageId", type, title, subtitle, "bodyText", "ctaLabel", "ctaLink", config, "sortOrder", status, "createdAt", "updatedAt")
SELECT 'pg_hti_s5', p.id, 'IMAGE_TEXT'::"SectionType",
  $t$Where to put it$t$,
  $t$Position$t$,
  $t$Height first. A nameplate or door number usually wants to sit at about eye level for whoever is reading it — roughly 1.5 m off the floor — and far enough clear of the door frame that it does not read as part of the frame.

For a gate or a boundary wall, go and stand where a visitor stands: at the gate, in a car, across the road. Judge it from there rather than from where you are holding it. A sign that looks right at arm's length is often too low once you walk away.$t$,
  NULL, NULL,
  -- The drawing is 4:3, which is what "landscape" is here, so it fills the
  -- frame exactly and nothing is cropped.
  $j${"image": "/guide/placement-height.svg", "imageSide": "left", "ratio": "landscape"}$j$::jsonb,
  5, 'PUBLISHED'::"ContentStatus", NOW(), NOW()
FROM "Page" p WHERE p.slug = 'how-to-install'
  AND NOT EXISTS (SELECT 1 FROM "PageSection" WHERE id = 'pg_hti_s5');

INSERT INTO "PageSection" (id, "pageId", type, title, subtitle, "bodyText", "ctaLabel", "ctaLink", config, "sortOrder", status, "createdAt", "updatedAt")
SELECT 'pg_hti_s6', p.id, 'IMAGE_TEXT'::"SectionType",
  $t$Anything bigger, our team fits it$t$,
  $t$Or let us do it$t$,
  $t$Individual letters, a gate sign, anything lit, anything that means working at height — that is fitted on site by our own team. How a piece sits on the wall is part of the work, and it is not a job to improvise off a borrowed ladder.

If you would rather we fitted yours, say so when you order and we will tell you what is possible where you are.$t$,
  $t$Ask the studio$t$, $t$/contact$t$,
  -- bw-photo-08 is a 4:5 portrait in a 4:5 frame, so it is shown whole. It is
  -- the studio's own team, on the day, at Rasik Vatika.
  $j${"image": "/uploads/photos/bw-photo-08.webp", "imageSide": "right", "ratio": "portrait"}$j$::jsonb,
  6, 'PUBLISHED'::"ContentStatus", NOW(), NOW()
FROM "Page" p WHERE p.slug = 'how-to-install'
  AND NOT EXISTS (SELECT 1 FROM "PageSection" WHERE id = 'pg_hti_s6');

INSERT INTO "PageSection" (id, "pageId", type, title, subtitle, "bodyText", "ctaLabel", "ctaLink", config, "sortOrder", status, "createdAt", "updatedAt")
SELECT 'pg_hti_s7', p.id, 'RICH_TEXT'::"SectionType",
  $t$Looking after it$t$, NULL,
  $t$Clean with a soft, slightly damp cloth and nothing else. Scouring pads dull a brushed finish, and solvent cleaners can lift printed graphics and craze acrylic.

Outside, look over the fixings once a year. A screw that has worked loose is a five-minute job; a sign that has come down is not.$t$,
  NULL, NULL, '{}'::jsonb,
  7, 'PUBLISHED'::"ContentStatus", NOW(), NOW()
FROM "Page" p WHERE p.slug = 'how-to-install'
  AND NOT EXISTS (SELECT 1 FROM "PageSection" WHERE id = 'pg_hti_s7');

INSERT INTO "PageSection" (id, "pageId", type, title, subtitle, "bodyText", "ctaLabel", "ctaLink", config, "sortOrder", status, "createdAt", "updatedAt")
SELECT 'pg_hti_s8', p.id, 'CTA'::"SectionType",
  $t$Something not right?$t$, NULL,
  $t$If a piece has arrived damaged, or will not sit as it should, send us your order number and a photograph and we will sort it out.$t$,
  $t$Contact the studio$t$, $t$/contact$t$, '{}'::jsonb,
  8, 'PUBLISHED'::"ContentStatus", NOW(), NOW()
FROM "Page" p WHERE p.slug = 'how-to-install'
  AND NOT EXISTS (SELECT 1 FROM "PageSection" WHERE id = 'pg_hti_s8');


-- The markdown body is only a fallback now: StaticPage renders the sections
-- whenever a page has any. It is rewritten to match them rather than left as
-- the old draft, so that deleting every section leaves a page which still
-- reads as this guide instead of contradicting it. The "Draft" banner goes --
-- this is not a placeholder any more.
UPDATE "Page" SET
  excerpt = 'Fitting a Beyond Walls sign or nameplate, step by step: adhesive-backed pieces, and screw-mounted ones.',
  content = E'Every piece leaves our facility finished and ready to go up. Fitting one is the short last step, and it is mostly about getting the position right before anything is stuck or drilled.\n\n'
  || E'## Before you start\n\n'
  || E'Check the piece against your order: the spelling, the finish, and that nothing has moved in transit. Then turn it over, because how it is fixed decides everything that follows. Pieces with foam pads on the back are adhesive-mounted; pieces with a hole at each corner take screws.\n\n'
  || E'## Pads on the back\n\n'
  || E'Wipe the area and let it dry completely — adhesive fails on dust, grease, fresh paint or a damp wall far more often than it fails on its own. Hold the piece up, level it, and mark just outside the top two corners. Peel the liner, line up with the marks, and press firmly across the whole back rather than only the corners. Then leave it undisturbed for about a day while the bond gains strength.\n\n'
  || E'## Holes at the corners\n\n'
  || E'Hold the piece against the wall, level it, and look at it from where people will actually stand. Mark the wall through each hole in the piece, take it away, and drill on the marks — masonry needs a masonry bit. Tap a wall plug into each hole until it sits flush. Start one screw loosely, check the level again, then tighten the rest evenly: firm, not hard, since overtightening cracks acrylic. Caps go on last, if your piece came with them.\n\n'
  || E'## Where to put it\n\n'
  || E'A nameplate or door number usually sits at about eye level for whoever is reading it, roughly 1.5 m from the floor, clear of the door frame. For a gate or a boundary wall, go and look at it from where a visitor stands rather than from where you are holding it.\n\n'
  || E'## Looking after it\n\n'
  || E'A soft, slightly damp cloth and nothing else. Scouring pads dull a brushed finish and solvent cleaners can lift printed graphics. Outside, look over the fixings once a year.\n\n'
  || E'## Anything bigger\n\n'
  || E'Individual letters, gate signs, anything lit and anything that means working at height are fitted on site by our own team. Ask when you order.\n\n'
  || E'## If something is not right\n\n'
  || E'Send us your order number and a photograph and we will sort it out.',
  "seoDescription" = 'How to install a Beyond Walls sign or nameplate: marking and levelling, adhesive-backed pieces, screw-mounted pieces, and where on the wall it should go.',
  "updatedAt" = NOW()
WHERE slug = 'how-to-install'
  AND content LIKE '%**Draft.**%';
