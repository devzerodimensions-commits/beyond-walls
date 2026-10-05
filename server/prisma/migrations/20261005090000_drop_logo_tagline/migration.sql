-- The studio asked for the "SIGNAGE STUDIO" line under the logo to go: the mark
-- stands on its own.
--
-- Changing the default in the settings registry is not enough, because a row
-- already exists in every environment that has been seeded. This clears that
-- row once, wherever it runs. The setting itself stays, so a tagline can be put
-- back from Admin -> Brand at any time; it is only emptied here.
UPDATE "Setting" SET value = '""'::jsonb WHERE key = 'brand.logoTagline';
