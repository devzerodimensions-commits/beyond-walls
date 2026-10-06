-- Two blocks a content page needs: a full-bleed opening image with the title
-- over it, and a numbered sequence of steps.
--
-- Adding an enum value and using it have to be separate migrations in
-- PostgreSQL, so nothing here writes a row with either value.
ALTER TYPE "SectionType" ADD VALUE IF NOT EXISTS 'PAGE_HERO';
ALTER TYPE "SectionType" ADD VALUE IF NOT EXISTS 'STEPS';
