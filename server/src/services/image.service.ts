import sharp from 'sharp';
import { env } from '../config/env';

/**
 * Every raster image uploaded anywhere is re-encoded as WebP.
 *
 * Uploads arrive as whatever the sender happens to have -- a 6MB JPEG straight
 * off a phone, a screenshot PNG, an AVIF someone exported. Storing them as-is
 * means serving them as-is, so this normalises the lot: one format, no
 * embedded metadata, and a single file rather than an original plus a copy.
 *
 * It runs after validation, so the bytes have already been proven to be the
 * format they claim. Nothing here is a security control.
 */

/**
 * Two profiles, because the two kinds of upload want opposite things.
 *
 * A catalogue photograph exists to be downloaded by a browser, so it is capped
 * at a size no layout can actually use and compressed for the wire. Artwork
 * attached to a custom order is what the piece gets made from: it keeps every
 * pixel it arrived with and is compressed far more gently, because a plate is
 * cut from it rather than looked at on a screen.
 */
export type ImageProfile = 'catalogue' | 'original';

const PROFILES: Record<ImageProfile, { maxEdge: number | null; quality: number }> = {
  // 2400 is past the point any layout here can show, retina included.
  catalogue: { maxEdge: 2400, quality: 82 },
  original: { maxEdge: null, quality: 95 },
};

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
 * Re-encodes an image as WebP.
 *
 * Returns the original untouched when the type is not a raster image (a PDF
 * attached to an order, say), when the conversion would make the file bigger,
 * or when sharp cannot read it. An upload is somebody's work -- a failure to
 * optimise must never lose it.
 */
export async function optimizeImage(
  buffer: Buffer,
  mimeType: string,
  profile: ImageProfile = 'catalogue',
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

    const { maxEdge, quality } = PROFILES[profile];

    // Dimensions are left alone unless the profile asks for a ceiling, and
    // even then only when the image is actually above it -- nothing is ever
    // enlarged.
    const longest = Math.max(meta.width ?? 0, meta.pageHeight ?? meta.height ?? 0);
    if (maxEdge && longest > maxEdge) {
      pipeline.resize({
        width: maxEdge,
        height: maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    const out = await pipeline.webp({ quality, effort: 4 }).toBuffer();

    // Re-encoding an already-tight WebP, or a flat PNG at high quality, can
    // cost bytes rather than save them. Keep whichever is smaller, unless a
    // resize means the larger file is genuinely a different image.
    const resized = Boolean(maxEdge) && longest > (maxEdge ?? Infinity);
    if (!resized && out.length >= buffer.length && mimeType === 'image/webp') return unchanged;

    return { buffer: out, mimeType: 'image/webp', extension: '.webp', converted: true };
  } catch {
    // Corrupt frame, an exotic colour profile, a codec this build of sharp was
    // not compiled with. Store what was sent rather than refusing the upload.
    return unchanged;
  }
}
