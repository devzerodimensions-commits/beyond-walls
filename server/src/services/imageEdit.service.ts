import sharp, { type Sharp } from 'sharp';
import type { MediaAsset } from '@prisma/client';
import prisma from '../lib/prisma';
import { ApiError } from '../utils/http';
import { backupStored, readStored, replaceStored, toKey } from './mediaFile.service';

/**
 * Editing an image already in the media library.
 *
 * Two rules shape all of this.
 *
 * The URL cannot change. It is written into product rows, page sections,
 * settings and gallery entries, and rewriting all of those on every crop is a
 * migration waiting to go wrong. So an edit replaces the bytes under the
 * existing key and everything that points at it keeps working.
 *
 * And the original has to survive. Overwriting in place would normally mean
 * the first crop is final, so the bytes from before the first edit are copied
 * to a key of their own and that key is remembered. Edits after that compound
 * on the current image — crop, then crop again, then adjust — but the backup
 * is never overwritten, so Restore always returns the picture that was
 * uploaded rather than the state before the last change.
 */

export interface ImageEdit {
  /**
   * In pixels of the image *after* the rotate and flip below.
   *
   * That order matters and it is the editor's, not an arbitrary one: the
   * browser shows the picture already turned, and the rectangle is dragged
   * over what is on screen. Cropping first would mean the numbers arriving
   * here described a frame the person never saw.
   */
  crop?: { left: number; top: number; width: number; height: number };
  /** Clockwise, in quarter turns. Applied before the crop. */
  rotate?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  /** 1 is unchanged for all three. */
  brightness?: number;
  saturation?: number;
  contrast?: number;
}

/** Nothing here may be so extreme that it destroys the picture. */
const ADJUST_RANGE = { min: 0.4, max: 1.8 };

function clampAdjust(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(ADJUST_RANGE.max, Math.max(ADJUST_RANGE.min, n));
}

/** Re-encode as whatever it already was, so the extension keeps telling the truth. */
function encodeAs(pipeline: Sharp, mimeType: string): Sharp {
  if (mimeType === 'image/png') return pipeline.png({ compressionLevel: 9 });
  if (mimeType === 'image/jpeg') return pipeline.jpeg({ quality: 88, mozjpeg: true });
  if (mimeType === 'image/avif') return pipeline.avif({ quality: 60 });
  return pipeline.webp({ quality: 86, effort: 4 });
}

export function isEditableType(mimeType: string): boolean {
  return ['image/webp', 'image/png', 'image/jpeg', 'image/avif'].includes(mimeType);
}

/**
 * The picture half of an edit, with no database and no storage in it.
 *
 * Separated out because this is where a mistake is silent: a crop measured
 * against the wrong frame, or a rotation that cancels the EXIF orientation,
 * produces a perfectly valid image that is simply the wrong one. Taking only
 * bytes in and giving bytes back means it can be run against real photographs
 * and checked pixel by pixel.
 */
export async function transformImage(
  buffer: Buffer,
  mimeType: string,
  edit: ImageEdit,
): Promise<{ data: Buffer; width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  /*
   * Orientations 5 to 8 are the quarter turns, and sharp reports the stored
   * pixel dimensions rather than the displayed ones. The browser that drew the
   * crop rectangle showed the picture already oriented, so the bounds have to
   * be the oriented ones or every crop of a phone photo would be measured
   * against a frame the wrong way round.
   */
  const quarterTurnedByExif = (meta.orientation ?? 1) >= 5;
  const width = (quarterTurnedByExif ? meta.height : meta.width) ?? 0;
  const height = (quarterTurnedByExif ? meta.width : meta.height) ?? 0;
  if (!width || !height) throw ApiError.badRequest('That file is not an image this editor can read');

  /*
   * autoOrient, not rotate().
   *
   * A bare `.rotate()` applies the EXIF orientation, but sharp keeps one
   * rotation setting, so a later `.rotate(90)` replaces it and the EXIF turn
   * is silently lost — a portrait phone photo would come back on its side the
   * moment anyone rotated it. autoOrient is a separate step and survives the
   * explicit turn below.
   */
  let pipeline = sharp(buffer, { failOn: 'none' }).autoOrient();

  const turn = ((Math.round((edit.rotate ?? 0) / 90) * 90) % 360 + 360) % 360;
  if (turn) pipeline = pipeline.rotate(turn);
  if (edit.flipHorizontal) pipeline = pipeline.flop();
  if (edit.flipVertical) pipeline = pipeline.flip();

  if (edit.crop) {
    /*
     * The crop is measured against the turned image, so a quarter turn swaps
     * the bounds it has to fit inside. Getting this wrong would not fail
     * loudly — it would quietly clamp every crop of a rotated picture to the
     * wrong edge.
     */
    const quarterTurned = turn === 90 || turn === 270;
    const frameWidth = quarterTurned ? height : width;
    const frameHeight = quarterTurned ? width : height;

    /*
     * Rounded and clamped rather than trusted. The rectangle comes from a drag
     * in a browser, so it is a float, it can land a pixel past the edge, and
     * sharp treats a region outside the image as an error rather than as
     * something to trim.
     */
    const left = Math.max(0, Math.min(Math.round(edit.crop.left), frameWidth - 1));
    const top = Math.max(0, Math.min(Math.round(edit.crop.top), frameHeight - 1));
    const cropWidth = Math.max(1, Math.min(Math.round(edit.crop.width), frameWidth - left));
    const cropHeight = Math.max(1, Math.min(Math.round(edit.crop.height), frameHeight - top));

    if (cropWidth < 16 || cropHeight < 16) {
      throw ApiError.badRequest('That crop is too small — keep it at least 16 pixels each way');
    }
    pipeline = pipeline.extract({ left, top, width: cropWidth, height: cropHeight });
  }

  const brightness = clampAdjust(edit.brightness);
  const saturation = clampAdjust(edit.saturation);
  const contrast = clampAdjust(edit.contrast);

  if (brightness !== 1 || saturation !== 1) {
    pipeline = pipeline.modulate({ brightness, saturation });
  }
  if (contrast !== 1) {
    /*
     * Contrast as a straight line through mid-grey: out = a*in + b with
     * b chosen so 128 maps to itself. Without the offset, raising contrast
     * would also brighten the whole picture.
     */
    pipeline = pipeline.linear(contrast, 128 * (1 - contrast));
  }

  const { data, info } = await encodeAs(pipeline, mimeType).toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
/**
 * Applies an edit and writes the result back over the stored file.
 *
 * Returns the updated asset row. Throws a user-facing ApiError when the file
 * cannot be read or the crop does not land inside it, because both are things
 * the admin needs to be told rather than a 500.
 */
export async function applyImageEdit(assetId: string, edit: ImageEdit): Promise<MediaAsset> {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw ApiError.notFound('Image not found');
  if (!isEditableType(asset.mimeType)) {
    throw ApiError.badRequest('Only JPEG, PNG, WebP and AVIF images can be edited');
  }

  const stored = await readStored(asset.url);
  if (!stored) throw ApiError.badRequest('The stored file for this image could not be read');

  const { data, width: outWidth, height: outHeight } = await transformImage(
    stored.buffer,
    stored.mimeType,
    edit,
  );


  /*
   * Back up before the first write, never after. A second edit must not
   * overwrite the backup with an already-edited picture, or Restore would
   * only undo the most recent change.
   */
  let originalKey = asset.originalKey;
  if (!originalKey) {
    const name = `${toKey(asset.url).split('/').pop() ?? 'original'}`;
    originalKey = await backupStored(asset.url, name);
  }

  await replaceStored(asset.url, data, stored.mimeType);

  return finishEdit(asset, {
    originalKey,
    width: outWidth,
    height: outHeight,
    size: data.length,
    edited: true,
  });
}

/** Puts the backed-up bytes back and forgets that an edit ever happened. */
export async function restoreOriginalImage(assetId: string): Promise<MediaAsset> {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw ApiError.notFound('Image not found');
  if (!asset.originalKey) throw ApiError.badRequest('This image has not been edited');

  const original = await readStored(asset.originalKey);
  if (!original) throw ApiError.badRequest('The original for this image is no longer available');

  await replaceStored(asset.url, original.buffer, original.mimeType);

  const meta = await sharp(original.buffer).metadata();
  return finishEdit(asset, {
    originalKey: null,
    width: meta.width ?? null,
    height: meta.height ?? null,
    size: original.buffer.length,
    edited: false,
  });
}

/**
 * The bookkeeping both paths share.
 *
 * Product images carry their own copy of the pixel size, because the shop
 * reserves a frame from it before the picture loads. A crop changes that size,
 * so every product image pointing at this file is corrected in the same
 * transaction — otherwise the shop would hold a frame the wrong shape for an
 * image that no longer matches it.
 */
async function finishEdit(
  asset: MediaAsset,
  next: { originalKey: string | null; width: number | null; height: number | null; size: number; edited: boolean },
): Promise<MediaAsset> {
  const [updated] = await prisma.$transaction([
    prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        originalKey: next.originalKey,
        editedAt: next.edited ? new Date() : null,
        width: next.width,
        height: next.height,
        size: next.size,
      },
    }),
    prisma.productImage.updateMany({
      where: { url: asset.url },
      data: { width: next.width, height: next.height },
    }),
  ]);
  return updated;
}
