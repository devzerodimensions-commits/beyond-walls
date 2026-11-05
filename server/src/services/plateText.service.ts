import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { readStored } from './mediaFile.service';
import { getStorage } from './storage.service';

/**
 * Turning a product photograph into a live preview, by itself.
 *
 * Until now a new design meant new code: each plate was a hand-drawn SVG
 * template, so the studio could not add one without a developer. That does
 * not survive a catalogue that grows every week.
 *
 * This takes the other road. The photograph already IS the design, so the
 * preview keeps it and changes only the writing: find the sample name the
 * artwork was made with, measure where and how it sits, paint it out, and
 * hand back a blank plate plus the boxes the customer's own words go into.
 * Nothing about the piece is redrawn, so the preview cannot drift from the
 * product -- it is the product, with the name swapped.
 *
 * ---- What it can and cannot see ----
 *
 * It reads flat artwork: the plate square to the frame, lit evenly, the
 * writing sitting on plain plate. That is what the studio's artboards are,
 * and on those it is reliable.
 *
 * It cannot read a photograph of a sign already on a wall -- held in a hand,
 * at an angle, against a street. There the writing cannot be painted out
 * without the patch showing, and a preview with a smudge where the name used
 * to be is worse than no preview. Every check below exists to say so rather
 * than to return something that looks almost right, and the caller offers the
 * result for the studio to accept instead of applying it silently.
 */

/** Everything is a fraction of the image, so it survives any resize. */
export interface PlateBox {
  /** Top of the lettering. */
  y: number;
  /** Height of the lettering — the design's own type size for this line. */
  h: number;
  align: 'left' | 'center' | 'right';
  /** The point the line is set from: its left edge, centre or right edge. */
  anchor: number;
  /** Clear plate available from that anchor. A limit, not a target. */
  room: number;
}

export interface PlatePreview {
  ok: boolean;
  /** Why, in words the admin panel can show as they are. */
  reason: string;
  /** The plate with the sample writing painted out. Null when it could not be made. */
  image: string | null;
  aspect: { width: number; height: number } | null;
  plateColor: string | null;
  textColor: string | null;
  /** Top to bottom. Each one is a line of writing the customer replaces. */
  boxes: PlateBox[];
}

/** Analysis width. Letter strokes survive this; the work stays cheap. */
const WORK = 520;
/** How far a pixel may sit from the plate colour and still count as plate. */
const TOL = 46;
/** A line or column this inked belongs to an ornament rather than to writing. */
const BUSY = 0.25;
/** An ornament band has to start this near its edge, or it is not a band. */
const MARGIN_MAX = 0.1;
/** A clear run this long ends a band rather than being a gap inside it. */
const GAP_MIN = 0.03;
/** Thinner than this is an exported hairline, not a band. */
const MIN_BAND = 0.025;
/** An ornament inks nearly every line it covers; writing does not. */
const BAND_MEAN = 0.3;
/** A line this much wider than it is tall is a rule, not writing. */
const RULE_ASPECT = 8;
/** A line inked end to end is a border rule. */
const RULE = 0.6;
/** How far in from an edge a border rule is looked for. */
const RULE_REACH = 0.08;
/** Writing and plate must differ by at least this much to be separable. */
const MIN_CONTRAST = 0.18;
/**
 * How uneven the plate behind the writing may be, 0..1.
 *
 * This is the check that keeps a sign photographed on a wall out. Painting
 * the sample name out means refilling that patch with the plate's own colour,
 * which only disappears if the plate is near enough to one colour there. On a
 * street photograph it is not, and the fill would land as a visible block.
 */
const MAX_ROUGHNESS = 0.085;
/**
 * More colours than this and it is a photograph, not artwork.
 *
 * Set between the two groups measured, not on either: the studio's artboards
 * reached twelve and the catalogue's photographs started at nineteen.
 */
const MAX_PALETTE = 15;
/** Fewer lines than this and nothing was found; more and it is not a nameplate. */
const MAX_LINES = 6;

const luma = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');

interface Rgb { r: number; g: number; b: number }

/** The commonest colour, quantised first so near-shades count as one. */
function dominant(data: Buffer, ch: number, pixels: number[]): Rgb & { share: number } {
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (const i of pixels) {
    const key = `${data[i] >> 4}-${data[i + 1] >> 4}-${data[i + 2] >> 4}`;
    const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cur.n += 1; cur.r += data[i]; cur.g += data[i + 1]; cur.b += data[i + 2];
    buckets.set(key, cur);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const c of buckets.values()) if (!best || c.n > best.n) best = c;
  if (!best) return { r: 0, g: 0, b: 0, share: 0 };
  return { r: best.r / best.n, g: best.g / best.n, b: best.b / best.n, share: best.n / pixels.length };
}

/**
 * How many colours the picture genuinely uses.
 *
 * This is what tells flat artwork from a photograph, and it is the check that
 * matters most, because the failure it prevents is the ugly one: a photograph
 * of a sign on a wall passes every other test here -- a smooth sky is as even
 * as a plate -- and comes back with a block of sky painted across it.
 *
 * Artwork is drawn from a handful of flat colours. A photograph, however
 * plain it looks, is thousands of shades. Measured over the studio's own
 * files and the catalogue's photographs the two do not overlap: every artboard
 * came in at twelve colours or fewer, every photograph at nineteen or more.
 */
function paletteSize(data: Buffer, ch: number, pixels: number[]): number {
  const buckets = new Map<string, number>();
  for (const i of pixels) {
    const key = `${data[i] >> 4}-${data[i + 1] >> 4}-${data[i + 2] >> 4}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  let n = 0;
  for (const count of buckets.values()) if (count / pixels.length > 0.01) n += 1;
  return n;
}

const away = (data: Buffer, i: number, c: Rgb) =>
  (Math.abs(data[i] - c.r) + Math.abs(data[i + 1] - c.g) + Math.abs(data[i + 2] - c.b)) / 3;

/**
 * Where the ornament along one edge ends, in steps from that edge; -1 for none.
 *
 * An ornament is a border or a band: it meets an edge and runs the LENGTH of
 * it. That is what tells it from the writing, and it is measured over the
 * whole plate rather than locally -- a column crossing a band is inked top to
 * bottom, while a column crossing the writing is inked only where its two or
 * three lines pass. Averaged over the full height the two are far apart even
 * when the strokes are identical, which is where thickness and local density
 * both failed.
 *
 * Two things are turned away. A run thinner than a band is the hairline the
 * artboard was exported with -- one light pixel along the edge, which
 * otherwise ends the search before it starts. A run that is thick but THIN ON
 * AVERAGE is writing: on the cube plate the script reaches within a tenth of
 * the right edge, near enough to pass for a band, but most of the columns
 * under it carry almost no ink while an ornament inks nearly every one.
 */
function bandEnd(profile: Float32Array, len: number, maxEat: number): number {
  const gapMin = Math.max(3, Math.round(len * GAP_MIN));
  const minBand = Math.max(3, Math.round(len * MIN_BAND));
  let k = 0;
  while (k < len * MARGIN_MAX) {
    while (k < len && profile[k] <= BUSY) k += 1;
    if (k >= len || k > len * MARGIN_MAX) return -1;

    const first = k;
    let lastBusy = k;
    let clear = 0;
    for (; k < len * maxEat; k += 1) {
      if (profile[k] > BUSY) { lastBusy = k; clear = 0; continue; }
      clear += 1;
      if (clear >= gapMin) break;
    }

    let sum = 0;
    for (let i = first; i <= lastBusy; i += 1) sum += profile[i];
    if (lastBusy - first + 1 >= minBand && sum / (lastBusy - first + 1) >= BAND_MEAN) return lastBusy;
  }
  return -1;
}

/** The analysis, with the blank plate as bytes rather than a stored file. */
export interface PlateAnalysis extends Omit<PlatePreview, 'image'> {
  blank: Buffer | null;
}

/**
 * The whole of the reading, on bytes alone.
 *
 * Kept apart from storage so it can be run over a folder of artwork and
 * checked by eye, which is the only way to be sure of something that is
 * ultimately a judgement about a picture.
 */
export async function analysePlate(source: Buffer): Promise<PlateAnalysis> {
  const no = (reason: string): PlateAnalysis => ({
    ok: false, reason, blank: null, aspect: null, plateColor: null, textColor: null, boxes: [],
  });

  const stored = { buffer: source };

  let meta;
  try {
    meta = await sharp(stored.buffer).metadata();
  } catch {
    return no('That file is not an image this can read.');
  }
  const fullW = meta.width ?? 0;
  const fullH = meta.height ?? 0;
  if (!fullW || !fullH) return no('That file is not an image this can read.');

  const w = Math.min(WORK, fullW);
  const h = Math.max(1, Math.round((fullH * w) / fullW));
  const { data, info } = await sharp(stored.buffer)
    .resize(w, h, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;

  const all: number[] = [];
  for (let p = 0; p < w * h; p += 1) all.push(p * ch);
  const palette = paletteSize(data, ch, all);
  if (palette > MAX_PALETTE) {
    return no(
      'This is a photograph rather than flat artwork — it has too many shades in it for the sample name to be painted out without leaving a mark. Upload the design file the plate was made from, or set the preview up by hand below.',
    );
  }

  const plate = dominant(data, ch, all);
  const inked = (x: number, y: number) => away(data, (y * w + x) * ch, plate) >= TOL;

  // How inked each column and each row is, over the whole plate.
  const colProfile = new Float32Array(w);
  const rowProfile = new Float32Array(h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (inked(x, y)) { colProfile[x] += 1; rowProfile[y] += 1; }
    }
  }
  for (let x = 0; x < w; x += 1) colProfile[x] /= h;
  for (let y = 0; y < h; y += 1) rowProfile[y] /= w;

  /** No edge may claim more than this, so dense writing cannot pass for a band. */
  const MAX_EAT = 0.45;
  const gap = Math.max(2, Math.round(w / 180));
  const flip = (p: Float32Array) => Float32Array.from(p).reverse();

  const left = bandEnd(colProfile, w, MAX_EAT);
  const rightK = bandEnd(flip(colProfile), w, MAX_EAT);
  const top = bandEnd(rowProfile, h, MAX_EAT);
  const bottomK = bandEnd(flip(rowProfile), h, MAX_EAT);

  const field = {
    x: left >= 0 ? left + gap : 0,
    y: top >= 0 ? top + gap : 0,
    w: 0,
    h: 0,
  };
  field.w = (rightK >= 0 ? w - 1 - rightK - gap : w - 1) - field.x + 1;
  field.h = (bottomK >= 0 ? h - 1 - bottomK - gap : h - 1) - field.y + 1;

  /*
   * Then step inside any ruled border the field still holds.
   *
   * The floral plate is framed by two thin brown rules, far too thin to read
   * as ornament bands, so the field kept them -- and a rule running the height
   * of the field puts ink in every row, which left the writing looking like a
   * single line from the top of the plate to the bottom. A rule gives itself
   * away by inking a line end to end, which no line of writing does.
   */
  const insideRules = (profile: Float32Array, start: number, extent: number, forward: boolean) => {
    const limit = Math.round(extent * RULE_REACH);
    let last = -1;
    for (let k = 0; k < limit; k += 1) {
      const i = forward ? start + k : start - k;
      if (i >= 0 && i < profile.length && profile[i] > RULE) last = k;
    }
    return last >= 0 ? last + 1 + gap : 0;
  };
  const cutL = insideRules(colProfile, field.x, w, true);
  const cutR = insideRules(colProfile, field.x + field.w - 1, w, false);
  const cutT = insideRules(rowProfile, field.y, h, true);
  const cutB = insideRules(rowProfile, field.y + field.h - 1, h, false);
  field.x += cutL; field.w -= cutL + cutR;
  field.y += cutT; field.h -= cutT + cutB;

  if (field.w < w * 0.1 || field.h < h * 0.08) {
    return no('No clear area was found on this plate for a name to sit in.');
  }

  // The writing: what is left inside the field that is not plate.
  const lineInk = new Int32Array(h);
  let inkR = 0, inkG = 0, inkB = 0, inkN = 0;
  for (let y = field.y; y < field.y + field.h; y += 1) {
    for (let x = field.x; x < field.x + field.w; x += 1) {
      if (!inked(x, y)) continue;
      const i = (y * w + x) * ch;
      lineInk[y] += 1;
      inkR += data[i]; inkG += data[i + 1]; inkB += data[i + 2]; inkN += 1;
    }
  }
  if (!inkN) return no('Nothing is written on this plate, so there is no name to replace.');

  const ink = { r: inkR / inkN, g: inkG / inkN, b: inkB / inkN };
  const contrast = Math.abs(luma(ink.r, ink.g, ink.b) - luma(plate.r, plate.g, plate.b));
  if (contrast < MIN_CONTRAST) {
    return no('The plate and the writing on it are too close in colour to tell apart.');
  }

  // Rows carrying ink, grouped into lines.
  const minRow = Math.max(1, Math.round(field.w * 0.012));
  const runs: { top: number; bottom: number }[] = [];
  let start = -1;
  for (let y = field.y; y < field.y + field.h; y += 1) {
    const on = lineInk[y] >= minRow;
    if (on && start < 0) start = y;
    const last = y === field.y + field.h - 1;
    if ((!on || last) && start >= 0) {
      const end = on && last ? y : y - 1;
      if (end - start >= 2) runs.push({ top: start, bottom: end });
      start = -1;
    }
  }
  if (!runs.length) return no('No line of writing could be made out on this plate.');
  if (runs.length > MAX_LINES) {
    return no('This looks like a page of text rather than a nameplate, so it was left alone.');
  }

  // Each line's horizontal extent, and whether it is writing at all.
  const lines = runs.map((run) => {
    let min = w, max = 0;
    for (let y = run.top; y <= run.bottom; y += 1) {
      for (let x = field.x; x < field.x + field.w; x += 1) {
        if (!inked(x, y)) continue;
        if (x < min) min = x;
        if (x > max) max = x;
      }
    }
    const width = max - min + 1;
    const height = run.bottom - run.top + 1;
    return {
      ...run,
      left: min,
      right: max,
      width,
      height,
      /*
       * A divider rule reads as a line of writing -- it is ink in a row of its
       * own. It is kept on the plate rather than painted out, because it is
       * part of the design, and no slot is offered for it: a customer cannot
       * type over an ornament.
       */
      ornament: width / height > RULE_ASPECT,
    };
  });

  /*
   * A joining mark between two names is design, not a name.
   *
   * The botanical plate reads AARAV / & / SAANVI, and taken literally that is
   * three lines of writing -- so the second name was offered the ampersand's
   * box and came out a fifth of the size of the first. The ampersand is part
   * of the piece: it is far narrower than the lines it sits between, and it
   * sits BETWEEN them rather than at either end, which no name does. It stays
   * on the plate and is never offered to a customer.
   */
  const inner = lines.slice(1, -1);
  const widest = Math.max(...lines.map((l) => l.width));
  for (const line of inner) {
    if (line.width < widest * 0.25) line.ornament = true;
  }

  const writing = lines.filter((l) => !l.ornament);
  if (!writing.length) return no('Only ornament was found on this plate, not writing.');

  /*
   * Is the plate flat enough behind the writing to paint over?
   *
   * Measured on the plate pixels around the writing, not on the whole frame:
   * what matters is whether the patch that gets refilled will disappear. A
   * studio artboard scores near zero here. A sign photographed on a wall does
   * not, and is turned away above rather than returned with a visible block
   * where its name used to be.
   */
  let n = 0, sum = 0, sumSq = 0;
  for (const line of writing) {
    const pad = Math.round(line.height * 0.6);
    for (let y = Math.max(field.y, line.top - pad); y <= Math.min(field.y + field.h - 1, line.bottom + pad); y += 1) {
      for (let x = field.x; x < field.x + field.w; x += 1) {
        if (inked(x, y)) continue;
        const v = luma(data[(y * w + x) * ch], data[(y * w + x) * ch + 1], data[(y * w + x) * ch + 2]);
        n += 1; sum += v; sumSq += v * v;
      }
    }
  }
  const roughness = n ? Math.sqrt(Math.max(0, sumSq / n - (sum / n) ** 2)) : 1;
  if (roughness > MAX_ROUGHNESS) {
    return no(
      'The plate is not evenly lit behind the writing — this looks like a photograph of a sign in place rather than flat artwork. Painting the sample name out would leave a mark, so it was left alone.',
    );
  }

  /*
   * Paint each line out, line by line rather than filling the whole field.
   *
   * Filling the field in one go also erased the divider rule on the floral
   * plate, which is part of the design and not something a customer replaces.
   * Each line is refilled with the plate colour read from just around it, so
   * a plate that shades slightly across its face is matched locally.
   *
   * Each patch is then held inside its own line's share of the plate. The
   * padding that covers a letter's soft edge is a fraction of the line's
   * height, and on a large line that was enough to reach the rule below it
   * and rub it out after all -- so a patch may never cross into the line
   * above or below, ornament or writing.
   */
  const scale = fullW / w;
  const composites = await Promise.all(writing.map(async (line) => {
    const pad = Math.max(2, Math.round(line.height * 0.35));
    const at = lines.indexOf(line);
    const above = at > 0 ? lines[at - 1].bottom + 1 : field.y;
    const below = at < lines.length - 1 ? lines[at + 1].top - 1 : field.y + field.h - 1;
    const topPx = Math.max(above, line.top - pad);
    const bottomPx = Math.min(below, line.bottom + pad);

    const box = {
      left: Math.max(0, Math.round((line.left - pad) * scale)),
      top: Math.max(0, Math.round(topPx * scale)),
      width: 0,
      height: 0,
    };
    box.width = Math.min(fullW - box.left, Math.round((line.width + pad * 2) * scale));
    box.height = Math.min(fullH - box.top, Math.round((bottomPx - topPx + 1) * scale));

    const around: number[] = [];
    const reach = Math.round(line.height * 0.8);
    for (let y = Math.max(0, line.top - reach); y <= Math.min(h - 1, line.bottom + reach); y += 1) {
      for (let x = field.x; x < field.x + field.w; x += 1) {
        if (!inked(x, y)) around.push((y * w + x) * ch);
      }
    }
    const local = around.length ? dominant(data, ch, around) : plate;

    const patch = await sharp({
      create: {
        width: Math.max(1, box.width),
        height: Math.max(1, box.height),
        channels: 3,
        background: { r: Math.round(local.r), g: Math.round(local.g), b: Math.round(local.b) },
      },
    }).png().toBuffer();
    return { input: patch, left: box.left, top: box.top };
  }));

  const blank = await sharp(stored.buffer)
    .composite(composites)
    .webp({ quality: 90 })
    .toBuffer();

  /*
   * A line's box is the room it has, not the room the sample happened to use.
   *
   * Measuring the width off the sample looked right until a long name met a
   * short one: "SAANVI" was handed the width of the word above it and shrank
   * to fit, when the plate had half its face free. What the sample does fix is
   * the SIZE of the lettering -- that is the design's own type size, and the
   * customer's name is set at it -- and where the line is anchored. The width
   * only ever acts as a limit, and that limit is the clear plate, so a name
   * keeps the design's size until it genuinely runs out of room.
   */
  const fieldLeft = field.x / w;
  const fieldRight = (field.x + field.w) / w;
  const boxes: PlateBox[] = writing.map((line) => {
    const centre = (line.left + line.right) / 2 / w;
    const off = (centre - (fieldLeft + fieldRight) / 2) / (fieldRight - fieldLeft);
    const align = Math.abs(off) < 0.06 ? 'center' : off < 0 ? 'left' : 'right';
    const anchor = align === 'center' ? centre : align === 'left' ? line.left / w : (line.right + 1) / w;
    const room =
      align === 'center'
        ? Math.min(anchor - fieldLeft, fieldRight - anchor) * 2
        : align === 'left'
          ? fieldRight - anchor
          : anchor - fieldLeft;
    return {
      y: line.top / h,
      h: line.height / h,
      align,
      anchor,
      room,
    };
  });

  return {
    ok: true,
    reason: `Read ${writing.length} line${writing.length === 1 ? '' : 's'} of writing on a ${fullW}×${fullH} plate and painted ${writing.length === 1 ? 'it' : 'them'} out. The design is untouched.`,
    blank,
    aspect: { width: fullW, height: fullH },
    plateColor: hex(plate.r, plate.g, plate.b),
    textColor: hex(ink.r, ink.g, ink.b),
    boxes,
  };
}

/**
 * The same reading, on a stored product image, with the blank plate kept.
 *
 * The blank is stored under a key of its own and never over the photograph:
 * the catalogue still needs the picture with the sample name on it, which is
 * what shows the customer what they are buying.
 */
export async function readPlate(url: string): Promise<PlatePreview> {
  const fail = (reason: string): PlatePreview => ({
    ok: false, reason, image: null, aspect: null, plateColor: null, textColor: null, boxes: [],
  });

  /*
   * readStored can throw on a database-backed file, and this must not: a
   * preview is a convenience, and failing to make one cannot turn the upload
   * that asked for it into an error.
   */
  let stored;
  try {
    stored = await readStored(url);
  } catch {
    return fail('That image could not be read just now.');
  }
  if (!stored) return fail('That image could not be read.');

  const read = await analysePlate(stored.buffer);
  if (!read.ok || !read.blank) {
    const { blank, ...rest } = read;
    return { ...rest, image: null };
  }

  const put = await getStorage().put({
    buffer: read.blank,
    filename: `plate-${nanoid(10)}.webp`,
    mimeType: 'image/webp',
    folder: 'products',
  });

  const { blank, ...rest } = read;
  return { ...rest, image: put.url };
}
