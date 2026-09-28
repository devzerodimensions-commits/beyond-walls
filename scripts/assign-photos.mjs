/**
 * Puts the client's photography onto the categories and into the gallery.
 *
 *   node scripts/assign-photos.mjs
 *
 * Two categories had no image at all, which is why the mega menu showed a blank
 * panel when you hovered them. Each photo is matched to the category it
 * actually shows, so the panel is a picture of the thing you are about to
 * browse rather than decoration.
 *
 * Safe to run again: it only fills a category that has no image, so anything
 * chosen in the admin panel is left alone.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** What each photo is, so the matching is reviewable rather than arbitrary. */
const PHOTOS = [
  { file: 'bw-photo-01', of: 'Brass GST plate, held, outside a works' },
  { file: 'bw-photo-02', of: 'Rasik Vatika — gold script building sign at night' },
  { file: 'bw-photo-03', of: 'Door number 405 on a teak door' },
  { file: 'bw-photo-04', of: 'Door number 409, black plate on marble' },
  { file: 'bw-photo-05', of: 'Door number 304, black plate on marble' },
  { file: 'bw-photo-06', of: 'Wall of brass company plates in a lobby' },
  { file: 'bw-photo-07', of: 'Rasik Vatika — gold script, wide' },
];

const url = (file) => `/uploads/photos/${file}.webp`;

/** Category slug -> the photo that shows that kind of work. */
const CATEGORY_PHOTOS = {
  'for-home': 'bw-photo-03',
  'for-offices': 'bw-photo-06',
  prints: 'bw-photo-02',
  'informative-signs': 'bw-photo-01',
};

const GALLERY = [
  { file: 'bw-photo-07', title: 'Rasik Vatika', tag: 'Signage' },
  { file: 'bw-photo-06', title: 'Company plates, lobby', tag: 'For Offices' },
  { file: 'bw-photo-03', title: 'Door number, teak', tag: 'For Home' },
  { file: 'bw-photo-01', title: 'Brass GST plate', tag: 'For Offices' },
  { file: 'bw-photo-04', title: 'Door number on marble', tag: 'For Home' },
  { file: 'bw-photo-05', title: 'Door number, brushed edge', tag: 'For Home' },
  { file: 'bw-photo-02', title: 'Building signage at night', tag: 'Signage' },
];

async function main() {
  console.log('\nAssigning client photography\n');

  // --- Categories ---------------------------------------------------------
  for (const [slug, file] of Object.entries(CATEGORY_PHOTOS)) {
    const category = await prisma.category.findUnique({ where: { slug } });
    if (!category) {
      console.log(`  skipped /${slug} — no such category`);
      continue;
    }
    if (category.image) {
      console.log(`  kept    ${category.name.padEnd(20)} already has an image`);
      continue;
    }
    await prisma.category.update({
      where: { id: category.id },
      data: { image: url(file) },
    });
    const photo = PHOTOS.find((p) => p.file === file);
    console.log(`  set     ${category.name.padEnd(20)} ${photo?.of ?? file}`);
  }

  // --- Gallery ------------------------------------------------------------
  const existing = await prisma.galleryItem.findMany({ select: { image: true } });
  const have = new Set(existing.map((g) => g.image));
  let added = 0;

  for (const [index, item] of GALLERY.entries()) {
    if (have.has(url(item.file))) continue;
    await prisma.galleryItem.create({
      data: {
        title: item.title,
        tag: item.tag,
        image: url(item.file),
        sortOrder: 100 + index,
        status: 'PUBLISHED',
      },
    });
    added += 1;
  }
  console.log(`\n  gallery ${added} photo${added === 1 ? '' : 's'} added`);

  const total = await prisma.galleryItem.count({ where: { status: 'PUBLISHED' } });
  console.log(`  gallery now shows ${total} items\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
