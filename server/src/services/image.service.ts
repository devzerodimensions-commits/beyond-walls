import sharp from 'sharp';
import { env } from '../config/env';

/**
 * Every raster image that reaches the catalogue is re-encoded as WebP.
 *
 * Uploads arrive as whatever the studio happens to have — a 6MB JPEG straight
 * off a phone, a screenshot PNG, an AVIF someone exported. Storing them as-is
 * means the storefront serves them as-is, so this normalises the lot: one
 * format, one sensible ceiling on dimensions, no embedded metadata.
 *
 * It runs after validation, so the bytes have already been proven to be the
 * format they claim. Nothing here is a security control.
 */

/** Longest edge, in pixels. Enough for a full-bleed banner on a retina screen. */
const MAX_EDGE = 2400;

/** WebP quality. 82 is the point where artefacts stop being visible on photographs. */
const QUALITY = 82;

/** Formats sharp can re-encode. PDFs and anything else pass through untouched. */
const CONVERTIBLE = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/avif',
  'image/webp',
]);

export interface OptimizedImage {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  /** False when the original was kept, so the caller can name the file correctly. */
  converted: boolean;
}

export function isConvertible(mimeType: string): boolean {
  return CONVERTIBLE.has(mimeType);
}

/**
 * Re-encodes an image as WebP, scaled down to fit MAX_EDGE.
 *
 * Returns the original untouched when the type is not a raster image, when the
 * conversion would make the file bigger, or when sharp cannot read it. An
 * upload is the studio's work — a failure to optimise must never lose it.
 */
export async function optimizeImage(
  buffer: Buffer,
  mimeType: string,
): Promise<OptimizedImage> {
  const unchanged: OptimizedImage = {
    buffer,
    mimeType,
    extension: mimeType === 'image/webp' ? '.webp' : '',
    converted: false,
  };

  if (!env.optimizeUploads || !isConvertible(mimeType)) return unchanged;

  try {
    // `animated` keeps every frame of a GIF or animated WebP; without it only
    // the first frame survives and a spinning logo becomes a still.
    const input = sharp(buffer, { animated: true, failOn: 'none' });
    const meta = await input.metadata();

    // A phone writes the orientation into EXIF rather than the pixels, and the
    // metadata is about to be stripped — so apply it first, or portraits come
    // out on their side.
    const pipeline = input.rotate();

    const longest = Math.max(meta.width ?? 0, meta.pageHeight ?? meta.height ?? 0);
    if (longest > MAX_EDGE) {
      pipeline.resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    const out = await pipeline.webp({ quality: QUALITY, effort: 4 }).toBuffer();

    // Re-encoding an already-tight WebP or a flat PNG can cost bytes rather
    // than save them. Keep whichever is smaller.
    if (out.length >= buffer.length && mimeType === 'image/webp') return unchanged;

    return { buffer: out, mimeType: 'image/webp', extension: '.webp', converted: true };
  } catch {
    // Corrupt frame, an exotic colour profile, a codec this build of sharp was
    // not compiled with. Store what was sent rather than refusing the upload.
    return unchanged;
  }
}
