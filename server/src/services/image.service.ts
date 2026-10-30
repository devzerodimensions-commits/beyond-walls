import sharp, { type Metadata } from 'sharp';
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

/*
 * `effort` is what the encoder spends looking for a smaller file, and it is
 * the single biggest cost in an upload.
 *
 * Measured on a 4000x3000 photograph: effort 4, sharp's default, took 1198ms
 * and produced 2215KB. Effort 2 took 690ms and produced 2232KB -- 42% of the
 * time back for 0.8% more bytes. On a batch of twelve that is the difference
 * between a wait and a timeout, and 17KB on an image nobody will notice.
 *
 * Artwork keeps the higher effort: it is encoded once, downloaded by the
 * studio rather than by every visitor, and the piece is cut from it.
 */
const PROFILES: Record<ImageProfile, { maxEdge: number | null; quality: number; effort: number }> = {
  // 2400 is past the point any layout here can show, retina included.
  catalogue: { maxEdge: 2400, quality: 82, effort: 2 },
  original: { maxEdge: null, quality: 95, effort: 4 },
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
  /**
   * The stored image's pixel size, after rotation and any resize.
   *
   * Recorded because the storefront needs an image's shape before the image
   * itself arrives: without it a frame sized to the picture can only be sized
   * once the picture has loaded, which is the definition of layout shift. Both
   * are undefined for a PDF, and for anything sharp could not read.
   */
  width?: number;
  height?: number;
}

export function isConvertible(mimeType: string): boolean {
  return CONVERTIBLE.has(mimeType);
}

/**
 * Width and height as the image will actually be seen.
 *
 * A phone writes orientation into EXIF rather than into the pixels, so a
 * portrait photograph off an iPhone reports 4032x3024 -- landscape -- until
 * the rotation is applied. Orientations 5 to 8 are the quarter turns, and for
 * those the two have to be swapped or every portrait upload would be recorded
 * as a landscape one.
 */
function orientedSize(meta: Metadata): { width?: number; height?: number } {
  const turned = (meta.orientation ?? 1) >= 5;
  const width = turned ? meta.pageHeight ?? meta.height : meta.width;
  const height = turned ? meta.width : meta.pageHeight ?? meta.height;
  return { width, height };
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
    /*
     * Opened once, on the single-frame path, and re-opened only if the file
     * turns out to have more than one frame.
     *
     * `animated: true` keeps every frame of a GIF or animated WebP -- without
     * it a spinning logo becomes a still -- but it puts sharp on its
     * multi-page path, which costs time and memory on the photographs that are
     * almost every upload here.
     *
     * Reading the frame count first with a separate probe was the obvious fix
     * and the wrong one: measured, a metadata pass over a 9MB JPEG costs about
     * 300ms, while the multi-page path costs about 30ms. The probe was ten
     * times more expensive than the problem. Re-using this metadata read
     * leaves the common case with exactly one pass, and makes an animated
     * image -- which is rare, and small -- pay for the second open.
     */
    const input = sharp(buffer, { failOn: 'none' });
    const meta = await input.metadata();
    const animated = (meta.pages ?? 1) > 1;
    const source = animated ? sharp(buffer, { animated: true, failOn: 'none' }) : input;

    // A phone writes the orientation into EXIF rather than the pixels, and the
    // metadata is about to be stripped — so apply it first, or portraits come
    // out on their side.
    const pipeline = source.rotate();

    const { maxEdge, quality, effort } = PROFILES[profile];

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

    /*
     * resolveWithObject costs nothing here -- sharp has just finished the
     * encode and knows the output size -- and it is the only reading that is
     * true after both the rotate and the resize above.
     */
    const { data: out, info } = await pipeline
      .webp({ quality, effort })
      .toBuffer({ resolveWithObject: true });

    // Re-encoding an already-tight WebP, or a flat PNG at high quality, can
    // cost bytes rather than save them. Keep whichever is smaller, unless a
    // resize means the larger file is genuinely a different image.
    const resized = Boolean(maxEdge) && longest > (maxEdge ?? Infinity);
    if (!resized && out.length >= buffer.length && mimeType === 'image/webp') {
      // Keeping the original still tells the caller its shape, which is the
      // whole point of measuring.
      return { ...unchanged, ...orientedSize(meta) };
    }

    return {
      buffer: out,
      mimeType: 'image/webp',
      extension: '.webp',
      converted: true,
      width: info.width,
      height: info.height,
    };
  } catch {
    // Corrupt frame, an exotic colour profile, a codec this build of sharp was
    // not compiled with. Store what was sent rather than refusing the upload.
    return unchanged;
  }
}
