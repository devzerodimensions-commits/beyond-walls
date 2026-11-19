/**
 * Pages whose layout is drawn in the code rather than built from blocks.
 *
 * Most pages on this site are assembled from the blocks in the page editor,
 * and editing them there changes the website. A few are not: they are laid out
 * by hand because they carry the brand, and their words and photographs are
 * part of the design rather than content poured into it.
 *
 * The page editor could not tell the difference. It opened the About page's
 * old blocks -- the ones from before it was redrawn -- and showed them as
 * though they were the live page. A studio editing its own About text there
 * would save, look at the website, and find nothing had changed, with nothing
 * anywhere to say why. The blocks are still stored, and still correct for what
 * they are; they simply stopped being what /about renders.
 *
 * Checked against the real pages rather than assumed: Home and Contact both
 * draw their own blocks and are edited normally. About is the only one.
 */
export const FIXED_LAYOUT_PAGES: Record<string, string> = {
  about: 'The About page has its own design, with the words and photographs drawn into it. '
    + 'The blocks below are left over from an earlier version and are not shown on the website — '
    + 'changing them here will not change the page. The page title and the search-engine fields '
    + 'are still read from here.',
};

/** The explanation for a page the editor cannot change, or null if it can. */
export function fixedLayoutNote(slug: string | undefined | null): string | null {
  if (!slug) return null;
  return FIXED_LAYOUT_PAGES[slug] ?? null;
}
