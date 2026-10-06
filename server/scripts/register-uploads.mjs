#!/usr/bin/env node
/**
 * Puts the upload files that ship with the repository into the media library.
 *
 * WHY THIS EXISTS
 * Some images are committed rather than uploaded: the seeded product shots, and
 * the client's own photographs under uploads/photos. The files deploy with the
 * code, so the storefront serves them — but nothing ever created a MediaAsset
 * row for them, so they were invisible in Admin → Media and could not be picked
 * for a category or a banner. On this machine that was hidden, because the
 * categories had been pointed at the files directly by a one-off script; on a
 * fresh deploy the same categories came up blank with no way to fix them from
 * the admin panel.
 *
 * It runs on every deploy, after the migrations. It only ever inserts rows for
 * files that exist on disk: nothing is deleted, nothing already in the library
 * is modified, and no image is assigned to anything. Where a picture belongs is
 * a decision for whoever runs the shop, not for a deploy script.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const here = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS = path.resolve(here, '..', 'uploads');

/** Only the folders whose contents are committed; the rest is user data. */
const FOLDERS = ['products', 'photos', 'gallery', 'logo', 'banners'];

const MIME = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

async function main() {
  let added = 0;
  let already = 0;

  for (const folder of FOLDERS) {
    const dir = path.join(UPLOADS, folder);
    if (!fs.existsSync(dir)) continue;

    for (const filename of fs.readdirSync(dir)) {
      const ext = path.extname(filename).toLowerCase();
      const mimeType = MIME[ext];
      if (!mimeType) continue;

      const full = path.join(dir, filename);
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;

      const url = `/uploads/${folder}/${filename}`;
      const existing = await prisma.mediaAsset.findUnique({ where: { url }, select: { id: true } });
      if (existing) {
        already += 1;
        continue;
      }

      await prisma.mediaAsset.create({
        data: { url, filename, mimeType, size: stat.size, folder },
      });
      added += 1;
    }
  }

  console.log(`media library: ${added} added, ${already} already listed`);

  await repointConvertedImages();
}

/**
 * Follows images that have been re-encoded since they were first referenced.
 *
 * The product photographs shipped as PNGs -- 6.6MB of them, for six pictures --
 * and were converted to WebP, which took them to 449KB. The files changed name
 * with the format, and the rows pointing at them did not: a database is not
 * deployed, so every environment still asked for a .png that no longer exists.
 *
 * Only rows whose file has actually gone AND whose .webp replacement is present
 * are moved. A row pointing at a file that still exists is never touched, so
 * this cannot disturb anything the studio uploaded.
 */
async function repointConvertedImages() {
  const moved = [];

  const rename = (url) => url.replace(/\.(png|jpg|jpeg)$/i, '.webp');
  const onDisk = (url) => fs.existsSync(path.join(UPLOADS, url.replace('/uploads/', '')));

  /** Rows worth following: a dead file with a live .webp beside it. */
  const needsMove = (url) =>
    typeof url === 'string' &&
    url.startsWith('/uploads/') &&
    /\.(png|jpg|jpeg)$/i.test(url) &&
    !onDisk(url) &&
    onDisk(rename(url));

  const tables = [
    ['ProductImage', 'url', (where, data) => prisma.productImage.updateMany({ where, data })],
    ['GalleryItem', 'image', (where, data) => prisma.galleryItem.updateMany({ where, data })],
    ['Category', 'image', (where, data) => prisma.category.updateMany({ where, data })],
    ['MediaAsset', 'url', (where, data) => prisma.mediaAsset.updateMany({ where, data })],
    ['Banner', 'image', (where, data) => prisma.banner.updateMany({ where, data })],
  ];

  for (const [label, field, update] of tables) {
    let rows = [];
    try {
      rows = await prisma[label[0].toLowerCase() + label.slice(1)].findMany({
        select: { id: true, [field]: true },
      });
    } catch {
      continue; // a table this build does not have
    }

    for (const row of rows) {
      const url = row[field];
      if (!needsMove(url)) continue;
      // MediaAsset keys on a unique url, so a stale duplicate is dropped rather
      // than collided with.
      try {
        await update({ id: row.id }, { [field]: rename(url) });
        moved.push(label);
      } catch {
        if (label === 'MediaAsset') await prisma.mediaAsset.delete({ where: { id: row.id } }).catch(() => {});
      }
    }
  }

  if (moved.length) {
    const counts = moved.reduce((acc, t) => ({ ...acc, [t]: (acc[t] || 0) + 1 }), {});
    console.log(
      'repointed to webp: ' +
        Object.entries(counts).map(([t, n]) => `${t} ${n}`).join(', '),
    );
  }
}

main()
  .catch((error) => {
    // A deploy must not fail because the media library could not be indexed:
    // the site serves the files either way, they are just harder to find.
    console.error('register-uploads: skipped —', error.message);
  })
  .finally(() => prisma.$disconnect());
