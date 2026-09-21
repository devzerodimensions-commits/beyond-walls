-- Plain building blocks the homepage never needed, but an About or a policy
-- page does: a bare heading, an image beside text, and a contact card.
ALTER TYPE "SectionType" ADD VALUE IF NOT EXISTS 'SECTION_HEADING';
ALTER TYPE "SectionType" ADD VALUE IF NOT EXISTS 'IMAGE_TEXT';
ALTER TYPE "SectionType" ADD VALUE IF NOT EXISTS 'CONTACT_BLOCK';
