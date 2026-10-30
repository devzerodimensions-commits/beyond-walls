import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { env } from '../config/env';
import prisma from '../lib/prisma';
import { getSetting } from './settings.service';

/**
 * The site's favicon, rendered server-side into formats a search engine will
 * actually accept.
 *
 * This exists because the favicon was wrong in four different ways at once and
 * none of them were visible from the admin panel:
 *
 *  - the page offered Google only an SVG, and Google's supported favicon
 *    formats are BMP, GIF, ICO, PNG, JPEG, PPM and TIFF. SVG is not among
 *    them, so there was nothing for it to use and it drew the generic globe
 *  - /favicon.ico, which Google falls back to, returned the SPA's HTML
 *  - the favicon chosen in the admin was stored in a setting that no code
 *    ever rendered, so uploading one changed nothing at all
 *  - what had been uploaded was an 837x272 wordmark, and a favicon has to be
 *    square
 *
 * So rather than put a file in the page and hope it is the right shape and
 * format, the two URLs below are generated: whatever the studio picks is
 * squared and re-encoded here, and the page always points at a PNG and an ICO
 * that meet the requirements. Picking a bad source can still make an ugly
 * favicon, but it can no longer make an unusable one.
 */

/** 192 is comfortably past Google's "larger than 48x48" recommendation. */
const PNG_SIZE = 192;
/** What goes inside the .ico. One entry is enough and keeps the file tiny. */
const ICO_SIZE = 48;

/**
 * The fallback source, used until the studio chooses a favicon of its own.
 * Resolved against the client build so it ships with the deployment.
 */
const BUNDLED_MARK = ['brand/logo-mark-square.svg', 'favicon.svg'];

interface Rendered {
  png: Buffer;
  ico: Buffer;
  /** The setting this was built from, so a change invalidates the cache. */
  source: string;
}

let cache: Rendered | null = null;

/**
 * Reads a stored upload, whichever driver holds it.
 *
 * Uploads live on disk or as rows in the database depending on
 * STORAGE_DRIVER, and /uploads serves both from the same URL. The same two
 * places are checked here, in the same order, so the favicon works under
 * either without the caller knowing which is in use.
 */
async function readUpload(url: string): Promise<Buffer | null> {
  const rel = url.replace(/^\/uploads\//, '');
  if (!rel || rel.includes('..')) return null;

  const onDisk = path.join(env.uploadDir, rel);
  if (onDisk.startsWith(path.resolve(env.uploadDir)) && fs.existsSync(onDisk)) {
    try {
      return await fs.promises.readFile(onDisk);
    } catch {
      /* fall through to the database */
    }
  }

  try {
    const blob = await prisma.mediaBlob.findUnique({ where: { key: rel } });
    return blob?.bytes ? Buffer.from(blob.bytes) : null;
  } catch {
    return null;
  }
}

/** The shipped mark, for when nothing has been chosen or the choice is unreadable. */
function readBundled(): Buffer | null {
  const roots = [env.clientDist, path.resolve(process.cwd(), '../client/public')].filter(Boolean) as string[];
  for (const root of roots) {
    for (const name of BUNDLED_MARK) {
      const file = path.join(root, name);
      if (fs.existsSync(file)) {
        try {
          return fs.readFileSync(file);
        } catch {
          /* try the next candidate */
        }
      }
    }
  }
  return null;
}

/**
 * Wraps a PNG in an ICO container.
 *
 * An .ico is a six-byte header, a sixteen-byte directory entry per image and
 * then the image data, and since Vista that data is allowed to be a PNG
 * rather than a BMP. So the whole encoder is twenty-two bytes of header in
 * front of a buffer sharp has already produced, which is a great deal less
 * than taking on a dependency for it.
 */
function pngToIco(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(1, 4); // one image

  const entry = Buffer.alloc(16);
  // 0 means 256 in this field; every size we use is below that.
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2); // palette size, 0 for truecolour
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12); // offset to the data

  return Buffer.concat([header, entry, png]);
}

/**
 * Squares an image without cropping it.
 *
 * `contain` rather than `cover` because the source is whatever the studio
 * picked, and cropping a wordmark to a square removes most of the word. A
 * letterboxed wordmark reads badly at 16px and a cropped one reads as
 * nothing, so this keeps all of it and the admin says to use a square mark.
 */
async function square(source: Buffer, size: number): Promise<Buffer> {
  return sharp(source, { density: 384 })
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function render(): Promise<Rendered> {
  const chosen = await getSetting<string>('brand.favicon', '');
  const source = (chosen && (await readUpload(chosen))) || readBundled();

  if (!source) throw new Error('no favicon source available');

  const png = await square(source, PNG_SIZE);
  const small = await square(source, ICO_SIZE);
  return { png, ico: pngToIco(small, ICO_SIZE), source: chosen ?? '' };
}

/**
 * Both renditions, rebuilt only when the chosen favicon changes.
 *
 * The cache invalidates itself: the setting is read on every request and
 * compared with what the cached pair was built from, so saving a new favicon
 * in the admin takes effect without a restart and without anything having to
 * remember to call a clear function. The read is cheap — settings are cached
 * in their own service and that cache is already cleared on save.
 *
 * A failed render keeps whatever was served last rather than throwing: a
 * broken upload should leave the old icon in place, not take the favicon off
 * the site.
 */
export async function getFavicon(): Promise<Rendered> {
  const chosen = (await getSetting<string>('brand.favicon', '')) ?? '';
  if (cache && cache.source === chosen) return cache;

  try {
    cache = await render();
  } catch {
    if (!cache) throw new Error('favicon unavailable');
  }
  return cache;
}
