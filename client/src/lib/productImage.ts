import type { CSSProperties } from 'react';
import type { ProductImage } from './types';

/**
 * How a product photograph sits in its frame.
 *
 * One decision, read from settings, applied everywhere a product image is
 * drawn — the shop grid, the home page rails, the wishlist, the product page.
 * It lives here rather than in each component so the three can never drift
 * into showing the same photograph three different shapes.
 *
 *  natural  the frame takes the picture's own proportions. Nothing is cropped
 *           and nothing is stretched; cards in a row can end up different
 *           heights, which is the honest consequence of photographs that are
 *           different shapes.
 *  contain  a fixed frame, the whole picture inside it, the gaps showing the
 *           page behind. Every card the same height, still nothing cropped.
 *           The right answer for catalogue shots on a plain background.
 *  cover    a fixed frame the picture fills, cropped to fit. Tidiest, and the
 *           only one that can cut the top off a tall sign.
 */
export type ImageFit = 'natural' | 'contain' | 'cover';

/** Frame shapes offered in the admin, as width ÷ height. */
export const IMAGE_RATIOS: Record<string, number> = {
  '1:1': 1,
  '4:5': 4 / 5,
  '3:4': 3 / 4,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '16:9': 16 / 9,
};

export const RATIO_LABELS: { value: string; label: string }[] = [
  { value: '1:1', label: 'Square (1:1)' },
  { value: '4:5', label: 'Portrait (4:5)' },
  { value: '3:4', label: 'Tall portrait (3:4)' },
  { value: '4:3', label: 'Landscape (4:3)' },
  { value: '3:2', label: 'Wide landscape (3:2)' },
  { value: '16:9', label: 'Widescreen (16:9)' },
];

export const FIT_LABELS: { value: ImageFit; label: string }[] = [
  { value: 'natural', label: 'Natural — the frame follows each photo' },
  { value: 'contain', label: 'Fit inside — one shape, whole photo shown' },
  { value: 'cover', label: 'Fill — one shape, photo cropped to fit' },
];

export function isImageFit(value: unknown): value is ImageFit {
  return value === 'natural' || value === 'contain' || value === 'cover';
}

/** Falls back to square for a ratio the admin has never heard of. */
export function ratioValue(key: string | undefined): number {
  return IMAGE_RATIOS[key ?? '1:1'] ?? 1;
}

export interface ImageFrame {
  /** Goes on the frame: an explicit aspect-ratio, so the space is held before the image loads. */
  style: CSSProperties;
  /** Goes on the <img>: object-cover or object-contain. */
  objectClass: string;
  /** The frame's own width ÷ height, for callers fitting other images into it. */
  ratio: number;
}

/**
 * How a second image should sit in a frame that was sized for a first one.
 *
 * The product gallery sizes its frame once, from the first photograph, so
 * that clicking through the thumbnails does not resize the page under the
 * reader. Every other photograph then has to fit that frame: one the same
 * shape can fill it, and one a different shape is fitted inside rather than
 * cropped — cropping being the thing this whole setting exists to avoid.
 */
export function objectClassIn(
  image: Pick<ProductImage, 'width' | 'height'> | null | undefined,
  frame: ImageFrame,
  fit: ImageFit,
): string {
  if (fit === 'cover') return 'object-cover';
  const own = image?.width && image?.height ? image.width / image.height : null;
  const sameShape = own !== null && Math.abs(own - frame.ratio) < 0.01;
  return sameShape ? 'object-cover' : 'object-contain';
}

/**
 * The frame for one image.
 *
 * In every mode the frame gets an explicit `aspect-ratio`, including natural —
 * that is the whole reason the pixel size is recorded at upload. Sizing a
 * frame from the image itself can only happen once the image has arrived, and
 * a frame that resizes on arrival is a page that jumps while somebody is
 * reading it.
 *
 * An image whose size was never recorded (anything uploaded before the column
 * existed) falls back to the configured shape and is fitted inside it rather
 * than cropped, because a guessed shape is exactly when cropping does damage.
 */
export function imageFrame(
  image: Pick<ProductImage, 'width' | 'height'> | null | undefined,
  fit: ImageFit,
  ratioKey: string | undefined,
): ImageFrame {
  const fallback = ratioValue(ratioKey);

  if (fit !== 'natural') {
    return {
      style: { aspectRatio: String(fallback) },
      objectClass: fit === 'contain' ? 'object-contain' : 'object-cover',
      ratio: fallback,
    };
  }

  const known = image?.width && image?.height ? image.width / image.height : null;
  const ratio = known ?? fallback;
  return {
    style: { aspectRatio: String(ratio) },
    // A known shape means the frame already matches the picture, so cover and
    // contain are the same thing — cover avoids a sub-pixel hairline at the edge.
    objectClass: known ? 'object-cover' : 'object-contain',
    ratio,
  };
}
