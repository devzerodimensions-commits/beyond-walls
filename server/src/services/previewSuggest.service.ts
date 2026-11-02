import sharp, { type Metadata, type Sharp } from 'sharp';
import { readStored } from './mediaFile.service';

/**
 * Working out a live-preview setup from a product photograph.
 *
 * Setting a product up by hand means choosing a preview template, matching the
 * plate's proportions and colours by eye, and then wiring a personalisation
 * field to each preview slot. For a studio adding a dozen products that is a
 * dozen rounds of the same judgement, and the judgement is one a photograph
 * can usually answer.
 *
 * WHAT IT CAN AND CANNOT SEE — this is the whole design.
 *
 * A catalogue cut-out has the piece on a plain backdrop, so trimming the
 * uniform border leaves exactly the plate: measured on the studio's own
 * photographs, the name plate came out 773x391 inside a 1200x1200 frame and
 * the No Smoking sign 614x665, with its red read correctly as #d4252d.
 *
 * A photograph of a sign already on a wall has no uniform border to trim. The
 * subject appears to fill the frame, and every measurement then describes the
 * wall rather than the plate — the marble behind a door number reads as a
 * sandy plate colour, which is not wrong so much as about the wrong object.
 *
 * So the coverage figure is not a statistic, it is the confidence: a subject
 * that fills the frame means nothing was found, and the honest result is to
 * say so rather than to return a confident-looking wrong answer. The caller
 * offers a suggestion the studio can see and accept; it never silently
 * configures a product from a guess.
 */

export type Confidence = 'detected' | 'uncertain';

export interface PreviewSuggestion {
  confidence: Confidence;
  /** Why, in words the admin panel can show as-is. */
  reason: string;
  /** The template whose proportions best match. Null when nothing was found. */
  template: string | null;
  /** Measured plate proportions, for the preview's viewBox. */
  aspect: { width: number; height: number } | null;
  /** Hex, straight off the photograph. */
  plateColor: string | null;
  textColor: string | null;
  /** What was measured, so the panel can show its working. */
  measured: {
    imageWidth: number;
    imageHeight: number;
    plateWidth: number | null;
    plateHeight: number | null;
    /** Share of the frame the subject occupies, 0..1. */
    coverage: number;
    /** Difference in brightness between plate and writing, 0..1. */
    contrast: number;
  };
}

/*
 * Above this the trim found no border worth removing, which means the photo
 * is of the piece in place rather than a cut-out. 0.92 rather than 1.0 because
 * a cut-out often carries a few pixels of shadow at the edge.
 */
const NO_SUBJECT_FOUND = 0.92;
/** Below this the plate and the writing are not distinguishable. */
const MIN_CONTRAST = 0.18;

const luma = (c: { r: number; g: number; b: number }) =>
  (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;

const hex = (c: { r: number; g: number; b: number }) =>
  '#' + [c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');

/**
 * Which shipped template fits these proportions.
 *
 * Thresholds sit between the shapes rather than on them, so a plate measured a
 * few pixels either way does not flip template.
 */
function templateFor(ratio: number): string {
  if (ratio >= 1.6) return 'nameplate-minimal';
  if (ratio >= 1.15) return 'nameplate-classic';
  if (ratio >= 0.85) return 'sign-square';
  return 'sign-square';
}

/** The two colours that matter: the plate, and what is written on it. */
async function readColours(image: Sharp): Promise<{ plate: string; text: string; contrast: number }> {
  const { data, info } = await image
    .clone()
    .resize(64, 64, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  /*
   * Quantised into 32-level buckets before counting. Counting exact pixel
   * values would find 4,000 near-identical shades of one plate and rank none
   * of them highly enough to be the answer.
   */
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cur.n += 1; cur.r += r; cur.g += g; cur.b += b;
    buckets.set(key, cur);
  }

  const ranked = [...buckets.values()]
    .map((c) => ({ n: c.n, r: c.r / c.n, g: c.g / c.n, b: c.b / c.n }))
    .sort((a, b) => b.n - a.n);

  if (!ranked.length) return { plate: '#111111', text: '#f7f6f4', contrast: 0 };

  const plate = ranked[0];
  // The writing is the commonest colour that is clearly not the plate. Falling
  // back to second place keeps a two-tone plate from reporting one colour twice.
  const text = ranked.slice(1).find((c) => Math.abs(luma(c) - luma(plate)) > 0.25)
    ?? ranked[1]
    ?? plate;

  return { plate: hex(plate), text: hex(text), contrast: Math.abs(luma(plate) - luma(text)) };
}

/**
 * Looks at one stored product image and suggests a preview setup.
 *
 * Never throws for an unreadable file: a suggestion is an optional
 * convenience, and failing to make one must not fail the request that asked.
 */
export async function suggestPreviewFromImage(url: string): Promise<PreviewSuggestion> {
  const unknown = (reason: string): PreviewSuggestion => ({
    confidence: 'uncertain',
    reason,
    template: null,
    aspect: null,
    plateColor: null,
    textColor: null,
    measured: { imageWidth: 0, imageHeight: 0, plateWidth: null, plateHeight: null, coverage: 1, contrast: 0 },
  });

  /*
   * readStored looks on disk and then in the database, and the database half
   * can throw — an unreachable server, a malformed key. The image editor wants
   * to hear about that, so readStored stays strict; here it must not, because
   * a suggestion is a convenience and failing to produce one must not turn the
   * request that asked for it into a 500.
   */
  let stored;
  try {
    stored = await readStored(url);
  } catch {
    return unknown('That image could not be read just now. Choose a shape below instead.');
  }
  if (!stored) return unknown('That image could not be read.');

  let meta: Metadata;
  try {
    meta = await sharp(stored.buffer).metadata();
  } catch {
    return unknown('That file is not an image this can measure.');
  }
  const imageWidth = meta.width ?? 0;
  const imageHeight = meta.height ?? 0;
  if (!imageWidth || !imageHeight) return unknown('That file is not an image this can measure.');

  /*
   * trim() removes a uniform border and reports how much it removed, which is
   * the subject's bounding box. A threshold of 12 tolerates the gentle
   * gradient a softbox leaves on a white sweep without eating into the plate.
   */
  let plateWidth: number | null = null;
  let plateHeight: number | null = null;
  let region = sharp(stored.buffer);
  try {
    const { info } = await sharp(stored.buffer)
      .trim({ threshold: 12 })
      .toBuffer({ resolveWithObject: true });
    plateWidth = info.width;
    plateHeight = info.height;
    region = sharp(stored.buffer).extract({
      left: Math.max(0, -(info.trimOffsetLeft ?? 0)),
      top: Math.max(0, -(info.trimOffsetTop ?? 0)),
      width: info.width,
      height: info.height,
    });
  } catch {
    // A photograph with no uniform border at all. Handled as "not found" below.
    plateWidth = imageWidth;
    plateHeight = imageHeight;
  }

  const coverage = (plateWidth! * plateHeight!) / (imageWidth * imageHeight);
  const colours = await readColours(region);
  const measured = { imageWidth, imageHeight, plateWidth, plateHeight, coverage, contrast: colours.contrast };

  if (coverage > NO_SUBJECT_FOUND) {
    return {
      confidence: 'uncertain',
      reason:
        'The piece fills the whole photograph, so its edges could not be found — this looks like a sign photographed in place rather than on a plain background. Measuring it would describe the wall behind it, not the plate. Choose a shape below, or use a cut-out photo.',
      template: null,
      aspect: null,
      plateColor: null,
      textColor: null,
      measured,
    };
  }

  if (colours.contrast < MIN_CONTRAST) {
    return {
      confidence: 'uncertain',
      reason:
        'The plate was found, but its colour and the writing on it are too close to tell apart, so the colours below are a guess rather than a reading.',
      template: templateFor(plateWidth! / plateHeight!),
      aspect: { width: plateWidth!, height: plateHeight! },
      plateColor: null,
      textColor: null,
      measured,
    };
  }

  const ratio = plateWidth! / plateHeight!;
  return {
    confidence: 'detected',
    reason: `Found the piece at ${plateWidth}×${plateHeight} inside a ${imageWidth}×${imageHeight} photograph — ${Math.round(coverage * 100)}% of the frame — and read its colours from inside those edges.`,
    template: templateFor(ratio),
    aspect: { width: plateWidth!, height: plateHeight! },
    plateColor: colours.plate,
    textColor: colours.text,
    measured,
  };
}
