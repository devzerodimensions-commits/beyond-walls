/**
 * Prepares client photography for the web.
 *
 *   node scripts/process-photos.mjs
 *
 * The photos come off a phone: 3–4000px JPEGs and HEICs of 1.5–3MB each. Served
 * as they are, a single category tile would cost more than the rest of the page
 * put together, and HEIC does not render in any browser at all.
 *
 * Each one becomes a WebP at a sensible size, plus a JPEG for anything that
 * cannot take WebP. Originals stay in assets/ and are never served.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const SOURCE = path.resolve('assets/client-photos');
const OUT = path.resolve('server/uploads/photos');

/** Long edge in pixels. Beyond this, nothing on the site can show the detail. */
const MAX_EDGE = 1600;

if (!fs.existsSync(SOURCE)) {
  console.error(`No photos at ${SOURCE}`);
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

const files = fs
  .readdirSync(SOURCE)
  .filter((f) => /\.(jpe?g|heic|png)$/i.test(f))
  .sort();

if (!files.length) {
  console.error('Nothing to process.');
  process.exit(1);
}

console.log(`\nProcessing ${files.length} photos\n`);

let totalIn = 0;
let totalOut = 0;
const manifest = [];

for (const [index, file] of files.entries()) {
  const from = path.join(SOURCE, file);
  const inSize = fs.statSync(from).size;
  totalIn += inSize;

  // A stable, readable name beats a camera GUID in an <img src>.
  const name = `bw-photo-${String(index + 1).padStart(2, '0')}`;

  try {
    const image = sharp(from, { failOn: 'none' }).rotate(); // honour EXIF orientation
    const meta = await image.metadata();

    const resized = image.resize({
      width: meta.width >= meta.height ? MAX_EDGE : undefined,
      height: meta.height > meta.width ? MAX_EDGE : undefined,
      withoutEnlargement: true,
    });

    const webp = path.join(OUT, `${name}.webp`);
    const jpeg = path.join(OUT, `${name}.jpg`);

    await resized.clone().webp({ quality: 82 }).toFile(webp);
    await resized.clone().jpeg({ quality: 84, mozjpeg: true }).toFile(jpeg);

    const outSize = fs.statSync(webp).size;
    totalOut += outSize;

    manifest.push({
      name,
      source: file,
      width: meta.width,
      height: meta.height,
      orientation: meta.width > meta.height ? 'landscape' : meta.width === meta.height ? 'square' : 'portrait',
      url: `/uploads/photos/${name}.webp`,
    });

    const kb = (n) => `${Math.round(n / 1024)}kB`;
    console.log(
      `  ${name}  ${String(meta.width).padStart(4)}×${String(meta.height).padEnd(4)}  ${kb(inSize).padStart(7)} → ${kb(outSize).padStart(6)}  (${file})`,
    );
  } catch (err) {
    console.log(`  SKIPPED ${file}: ${err.message}`);
  }
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)}MB`;
console.log(`\n  ${manifest.length} ready in server/uploads/photos`);
console.log(`  ${mb(totalIn)} → ${mb(totalOut)} as WebP\n`);
