-- Point every stored copy of the business email at the mailbox that now exists.
--
-- The studio's mail is served from their own mail host, on the domain the site
-- actually runs on: info@thebeyondwalls.com. Two older addresses are still in
-- the database. "info@beyondwall.in" was inferred before the domain was known;
-- "info@beyondwalls.in" was a plan that was never set up. Neither has a mailbox
-- behind it, so every enquiry notification and every reply a customer sends to
-- an order email has been bouncing or disappearing.
--
-- Each statement is guarded on the old value rather than on an assumed starting
-- point, so running this twice changes nothing the second time, and an address
-- the studio has since edited by hand in the admin panel is left alone.

-- 1. The contact setting.
--    Every mailto: link on the storefront, the footer of every transactional
--    email, and the address enquiry notifications are delivered to all read
--    from this single row, so this is the change that matters most.
UPDATE "Setting"
SET value = to_jsonb('info@thebeyondwalls.com'::text),
    "updatedAt" = NOW()
WHERE key = 'contact.email'
  AND value #>> '{}' IN ('info@beyondwalls.in', 'info@beyondwall.in');

-- 2. Copy written into content before the domain was settled: the "How do I
--    get in touch?" answer, and the legacy body of the contact page.
UPDATE "Faq"
SET answer = replace(
      replace(answer, 'info@beyondwalls.in', 'info@thebeyondwalls.com'),
      'info@beyondwall.in', 'info@thebeyondwalls.com'),
    "updatedAt" = NOW()
WHERE answer LIKE '%info@beyondwalls.in%'
   OR answer LIKE '%info@beyondwall.in%';

UPDATE "Page"
SET content = replace(
      replace(content, 'info@beyondwalls.in', 'info@thebeyondwalls.com'),
      'info@beyondwall.in', 'info@thebeyondwalls.com'),
    "updatedAt" = NOW()
WHERE content LIKE '%info@beyondwalls.in%'
   OR content LIKE '%info@beyondwall.in%';

-- 3. Body copy held inside a builder section's config. Rewriting the jsonb
--    through its text form is safe for this particular search: an email address
--    contains no quote, backslash or brace, so nothing else in the document can
--    be touched and the result still parses.
UPDATE "PageSection"
SET config = replace(
      replace(config::text, 'info@beyondwalls.in', 'info@thebeyondwalls.com'),
      'info@beyondwall.in', 'info@thebeyondwalls.com')::jsonb,
    "updatedAt" = NOW()
WHERE config::text LIKE '%info@beyondwalls.in%'
   OR config::text LIKE '%info@beyondwall.in%';

-- 4. The canonical URL, which was inferred from the old email address and
--    carried a flag saying so. The site is served on thebeyondwalls.com, so it
--    is now a confirmed fact rather than a guess, and canonical tags, the
--    sitemap and share links can stop pointing at a domain that is not ours.
UPDATE "Setting"
SET value = to_jsonb('https://thebeyondwalls.com'::text),
    "updatedAt" = NOW()
WHERE key = 'seo.siteUrl'
  AND value #>> '{}' IN ('https://beyondwall.in', 'https://beyondwalls.in');

UPDATE "Setting"
SET value = 'true'::jsonb,
    "updatedAt" = NOW()
WHERE key = 'seo.domainConfirmed'
  AND value = 'false'::jsonb;
