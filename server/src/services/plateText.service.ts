import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { readStored } from './mediaFile.service';
import { getStorage } from './storage.service';

/**
 * Turning a product photograph into a live preview, by itself.
 *
 * A new design used to mean new code: each plate was a hand-drawn SVG, so a
 * design the studio made on a Tuesday could not be sold until a developer had
 * redrawn it. This reads the picture instead -- it finds the sample name,
 * measures how it sits, paints it off the plate and hands back the boxes the
 * customer's own words go into. The preview cannot drift from the product
 * because it IS the product, with the name swapped.
 *
 * ---- Why it does not look for the plate ----
 *
 * The first version of this did. It assumed a rectangle with its ornament in
 * bands along the edges, found the clear field inside those bands, and took
 * the writing from it. That held for three artboards and fell over on the
 * fourth real product, a round plate: there are no edges to walk in from and
 * no rectangle to find, so nothing applied.
 *
 * So nothing here asks what shape anything is. It looks for the writing
 * directly -- marks that stand clear of their own surroundings, shaped like
 * letters, sitting on a line -- and then only ever touches the plate in the
 * immediate neighbourhood of a line it found. A circle, an oval, a cut shape
 * or a rectangle all read the same way, and whatever else is in the picture
 * is never painted over, because nothing outside a line of writing is.
 *
 * ---- What it will refuse ----
 *
 * Painting a name out means refilling that patch from the plate around it,
 * which only disappears if the plate is plain there. So the test is applied
 * where it matters: around each line, not over the picture as a whole. That
 * is deliberate -- an earlier version judged the whole image and refused a
 * perfectly good plate for having a photographed wall behind it, while
 * accepting a render whose shading it had no way to see.
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

/** The analysis, with the blank plate as bytes rather than a stored file. */
export interface PlateAnalysis extends Omit<PlatePreview, 'image'> {
  blank: Buffer | null;
}

/** Analysis width. Letter strokes survive this; the work stays cheap. */
const WORK = 760;
/** Nothing larger is written out, so one huge upload cannot exhaust memory. */
const MAX_OUT = 2600;
/** How far a mark must stand clear of its surroundings to count as ink. */
const INK = 16;
/** Writing and plate must differ by at least this much to be separable. */
const MIN_CONTRAST = 0.17;
/**
 * How uneven the plate may be around a line, 0..1.
 *
 * The one check that decides whether a name can be painted out invisibly.
 * Measured on the plate beside the writing and nowhere else: a plate is
 * plain where its name sits even when the photograph around it is not.
 */
const MAX_ROUGHNESS = 0.072;
/** Less clear plate than this around the marks and it is ornament, not writing. */
const MIN_OPENNESS = 0.62;
/** How far the plate above a line may differ from the plate below it. */
const MAX_STEP = 16;
/** A line needs at least this share of the width clear beside it. */
const MIN_ROOM = 0.28;
/** More than this is a page of text, not a nameplate. */
const MAX_LINES = 6;
/**
 * A mark taller than this share of the picture is not a letter.
 *
 * Set from the largest real lettering seen rather than from caution: the
 * surname on the floral plate is a single joined Devanagari word a fifth of
 * the picture tall, and a cap set just under that quietly dropped it while
 * erasing the two smaller lines beneath, leaving the plate with its biggest
 * name still on it.
 */
const MAX_LINE_TALL = 0.3;
/** Lines are the same plate if their backgrounds are this close. */
const SAME_PLATE = 30;

const lumaOf = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');

interface Rgb { r: number; g: number; b: number }

/** Mean over a square window, by summed-area table so the radius is free. */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let row = 0;
    for (let x = 0; x < w; x += 1) {
      row += src[y * w + x];
      sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      const area = (y1 - y0 + 1) * (x1 - x0 + 1);
      out[y * w + x] =
        (sat[(y1 + 1) * (w + 1) + x1 + 1] - sat[y0 * (w + 1) + x1 + 1]
          - sat[(y1 + 1) * (w + 1) + x0] + sat[y0 * (w + 1) + x0]) / area;
    }
  }
  return out;
}

interface Mark {
  minX: number; maxX: number; minY: number; maxY: number;
  n: number; w: number; h: number;
  polarity: 'dark' | 'light';
}

/**
 * Mean over a window, counting only the pixels a mask allows.
 *
 * A plain blur is not good enough to stand in for the plate. Next to
 * something strongly contrasting -- the white leaves of a cut border -- the
 * window fills with leaf and the estimate is dragged far off the plate, so
 * the plain dark panel beside the frame comes out reading as ink. That wiped
 * out the open plate around the lettering, and with it the lettering, which
 * was then dismissed along with the ornament it was supposed to be told from.
 *
 * Measuring the plate from pixels already thought to be plate fixes it: the
 * leaves stop voting on what the plate beside them looks like.
 */
function maskedBlur(
  src: Float32Array, keep: Uint8Array, w: number, h: number, r: number, fallback: Float32Array,
): Float32Array {
  const satV = new Float64Array((w + 1) * (h + 1));
  const satN = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let rowV = 0;
    let rowN = 0;
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (keep[i]) { rowV += src[i]; rowN += 1; }
      satV[(y + 1) * (w + 1) + x + 1] = satV[y * (w + 1) + x + 1] + rowV;
      satN[(y + 1) * (w + 1) + x + 1] = satN[y * (w + 1) + x + 1] + rowN;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      const at = (yy: number, xx: number) => yy * (w + 1) + xx;
      const n = satN[at(y1 + 1, x1 + 1)] - satN[at(y0, x1 + 1)] - satN[at(y1 + 1, x0)] + satN[at(y0, x0)];
      if (n < 12) { out[y * w + x] = fallback[y * w + x]; continue; }
      const v = satV[at(y1 + 1, x1 + 1)] - satV[at(y0, x1 + 1)] - satV[at(y1 + 1, x0)] + satV[at(y0, x0)];
      out[y * w + x] = v / n;
    }
  }
  return out;
}

/** Connected runs of ink, eight-connected. */
function components(mask: Uint8Array, w: number, h: number, polarity: 'dark' | 'light'): Mark[] {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out: Mark[] = [];
  for (let start = 0; start < w * h; start += 1) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let minX = w, maxX = 0, minY = h, maxY = 0, n = 0;
    while (top) {
      const i = stack[--top];
      const x = i % w;
      const y = (i - x) / w;
      n += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (mask[j] && !seen[j]) { seen[j] = 1; stack[top++] = j; }
        }
      }
    }
    out.push({ minX, maxX, minY, maxY, n, w: maxX - minX + 1, h: maxY - minY + 1, polarity });
  }
  return out;
}

/**
 * Shaped like writing? Nothing here is about what it says.
 *
 * Width is capped loosely on purpose: a whole word arrives as one blob
 * whenever its letters touch or share a drop shadow, which is how the round
 * plate's name came in. What the cap still rejects is a rule or a border,
 * which is thirty times longer than it is tall.
 */
function glyphLike(c: Mark, w: number, h: number): boolean {
  if (c.minX === 0 || c.minY === 0 || c.maxX === w - 1 || c.maxY === h - 1) return false;
  const tall = c.h / h;
  if (tall < 0.012 || tall > MAX_LINE_TALL) return false;
  if (c.w > c.h * 12) return false;
  if (c.h > c.w * 14) return false;
  const fill = c.n / (c.w * c.h);
  if (fill <= 0.08) return false;
  // A solid block is not a letter, but a stem -- I, l, 1 -- fills its box
  // completely and is. Without the exception the I of SAANVI was left
  // standing on the plate after the rest of the name had gone.
  return fill < 0.97 || c.w < c.h * 0.5;
}

interface Line {
  polarity: 'dark' | 'light';
  left: number; right: number; top: number; bottom: number;
  ink: number;
  parts: Mark[];
  bg: Rgb;
  fg: Rgb;
  roughness: number;
  contrast: number;
}

export async function analysePlate(source: Buffer): Promise<PlateAnalysis> {
  const no = (reason: string): PlateAnalysis => ({
    ok: false, reason, blank: null, aspect: null, plateColor: null, textColor: null, boxes: [],
  });

  let meta;
  try {
    meta = await sharp(source).metadata();
  } catch {
    return no('That file is not an image this can read.');
  }
  const fullW = meta.width ?? 0;
  const fullH = meta.height ?? 0;
  if (!fullW || !fullH) return no('That file is not an image this can read.');

  const w = Math.min(WORK, fullW);
  const h = Math.max(1, Math.round((fullH * w) / fullW));
  const { data, info } = await sharp(source)
    .resize(w, h, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;

  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    lum[i] = lumaOf(data[i * ch], data[i * ch + 1], data[i * ch + 2]);
  }

  /*
   * The background is the plate as it would look with nothing written on it:
   * a blur wide enough that a letter cannot colour its own surroundings. Ink
   * is whatever stands clear of that, which is what lets this work on a plate
   * that shades across its face as well as on flat artwork.
   */
  /*
   * The radius is a compromise and both ends of it were measured.
   *
   * Wide enough and a letter cannot colour its own surroundings, but the
   * estimate then stops following the plate: on the round plate, lit from one
   * side, the brighter half of the face came out reading as ink and the name
   * on it was thrown away. Narrow enough to follow that lighting, and each
   * letter drags the plate beside it dark, ringing every word with a halo of
   * false ink. A twentieth of the width sits between the two.
   *
   * The passes are what make the narrow radius safe: each one measures the
   * plate using only what still looks like plate, so the letters drop out of
   * their own background and the halo closes up. It settles after about four.
   */
  const radius = Math.max(10, Math.round(w / 19));
  const rough = boxBlur(lum, w, h, radius);
  let bgLum = rough;
  for (let pass = 0; pass < 3; pass += 1) {
    const plain = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i += 1) plain[i] = Math.abs(lum[i] - bgLum[i]) <= INK ? 1 : 0;
    bgLum = maskedBlur(lum, plain, w, h, radius, rough);
  }

  const dark = new Uint8Array(w * h);
  const light = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const d = lum[i] - bgLum[i];
    if (d < -INK) dark[i] = 1;
    else if (d > INK) light[i] = 1;
  }
  const anyInk = (i: number) => dark[i] === 1 || light[i] === 1;

  const glyphs: Mark[] = [];
  /** Ink that is not writing — rules, borders, the ornament. Never painted. */
  const fixtures: Mark[] = [];
  for (const [polarity, mask] of [['dark', dark], ['light', light]] as const) {
    for (const c of components(mask, w, h, polarity)) {
      if (glyphLike(c, w, h)) glyphs.push(c);
      else if (c.n > w * 0.02) fixtures.push(c);
    }
  }
  if (!glyphs.length) return no('No writing could be made out on this picture.');

  // Marks that overlap vertically and are of a like size belong to one line.
  /*
   * A mark joins a line by where its middle sits, not by whether it overlaps.
   *
   * Overlap was tested against the group's whole span, and the span grew with
   * every mark that joined -- so each addition loosened the test that admitted
   * the next. On the botanical plate that ran away completely: the cut border
   * is a continuous chain of leaves, it swallowed the lettering that sat level
   * with it, and ninety-four leaves and letters came back as one line reaching
   * from one edge of the plate to the other.
   *
   * Measuring from the middle of the line cannot run away, because the middle
   * of a line of writing does not move as more of its letters are found.
   */
  interface Group { polarity: 'dark' | 'light'; centre: number; medianH: number; parts: Mark[] }
  const middle = (m: Mark) => (m.minY + m.maxY) / 2;
  const groups: Group[] = [];
  for (const g of [...glyphs].sort((a, b) => a.minY - b.minY)) {
    const fit = groups.find((L) => {
      if (L.polarity !== g.polarity) return false;
      const ratio = Math.max(L.medianH, g.h) / Math.min(L.medianH, g.h);
      return Math.abs(middle(g) - L.centre) < L.medianH * 0.6 && ratio < 2.4;
    });
    if (fit) {
      fit.parts.push(g);
      const hs = fit.parts.map((p) => p.h).sort((a, b) => a - b);
      const cs = fit.parts.map(middle).sort((a, b) => a - b);
      fit.medianH = hs[Math.floor(hs.length / 2)];
      fit.centre = cs[Math.floor(cs.length / 2)];
    } else {
      groups.push({ polarity: g.polarity, centre: middle(g), medianH: g.h, parts: [g] });
    }
  }

  const candidates: Line[] = [];
  for (const group of groups) {
    const parts = group.parts.sort((a, b) => a.minX - b.minX);
    let run: Mark[] = [parts[0]];
    const runs: Mark[][] = [run];
    for (let i = 1; i < parts.length; i += 1) {
      if (parts[i].minX - run[run.length - 1].maxX > group.medianH * 2.2) {
        run = [];
        runs.push(run);
      }
      run.push(parts[i]);
    }

    for (const whole of runs) {
      if (!whole.length) continue;

      /*
       * Letters of one word are one colour.
       *
       * A run gathers marks that sit at the same height and are close enough
       * along the line, and on the round plate that reached past the last
       * letter and took in a piece of the gold ring. The run then stretched
       * to the edge of the piece, so the name was measured as both wider and
       * further right than it is, and came out hanging over the side of the
       * plate. Dropping marks that are not the colour of the rest leaves the
       * word.
       */
      const mask = group.polarity === 'dark' ? dark : light;
      const inkColour = (m: Mark): Rgb | null => {
        let r2 = 0, g2 = 0, b2 = 0, n2 = 0;
        for (let y = m.minY; y <= m.maxY; y += 1) {
          for (let x = m.minX; x <= m.maxX; x += 1) {
            const i = y * w + x;
            if (!mask[i]) continue;
            const p = i * ch;
            r2 += data[p]; g2 += data[p + 1]; b2 += data[p + 2]; n2 += 1;
          }
        }
        return n2 ? { r: r2 / n2, g: g2 / n2, b: b2 / n2 } : null;
      };
      const tinted = whole.map((m) => ({ m, c: inkColour(m) })).filter((t) => t.c);
      if (!tinted.length) continue;
      const mid = (pick: (c: Rgb) => number) => {
        const v = tinted.map((t) => pick(t.c!)).sort((a, b) => a - b);
        return v[Math.floor(v.length / 2)];
      };
      const tone = { r: mid((c) => c.r), g: mid((c) => c.g), b: mid((c) => c.b) };
      const r = tinted
        .filter((t) => (Math.abs(t.c!.r - tone.r) + Math.abs(t.c!.g - tone.g) + Math.abs(t.c!.b - tone.b)) / 3 < 45)
        .map((t) => t.m);
      if (!r.length) continue;
      /*
       * One mark counts as a line only when it is word-shaped. Letters that
       * touch come in as a single blob, and refusing those would mean
       * refusing every plate set in a script.
       */
      const lone =
        r.length === 1
        && r[0].w > r[0].h * 2.2
        // A word leaves gaps between its letters; a single cut leaf is solid,
        // and without this every leaf lying on its side read as a word.
        && r[0].n / (r[0].w * r[0].h) < 0.55;
      if (r.length < 2 && !lone) continue;

      /*
       * Letters on a line stand on a common baseline. Ornament that happens
       * to line up does not, which is what stops a row of cut leaves being
       * read as a word.
       */
      if (!lone) {
        const bottoms = r.map((p) => p.maxY);
        const mean = bottoms.reduce((a, b) => a + b, 0) / bottoms.length;
        const spread = Math.sqrt(bottoms.reduce((a, b) => a + (b - mean) ** 2, 0) / bottoms.length);
        const hs = r.map((p) => p.h).sort((a, b) => a - b);
        const med = hs[Math.floor(hs.length / 2)];
        if (spread > med * 0.34) continue;

        /*
         * Writing on one line is set at one size.
         *
         * Without this the bottom border of the botanical plate passed every
         * other test -- a long row of marks, level along the bottom, sitting
         * on clean plate -- and was painted out, taking that side of the cut
         * border off the product. Its leaves are all sizes, which a line of
         * letters never is.
         */
        const vary = Math.sqrt(
          r.reduce((a, p) => a + (p.h - med) ** 2, 0) / r.length,
        ) / Math.max(1, med);
        if (vary > 0.42) continue;
      }

      const left = Math.min(...r.map((p) => p.minX));
      const right = Math.max(...r.map((p) => p.maxX));
      const top = Math.min(...r.map((p) => p.minY));
      const bottom = Math.max(...r.map((p) => p.maxY));
      const tall = bottom - top + 1;

      // A line of writing runs along. A clump of ornament roughly as tall as
      // it is wide is not a line however neatly its pieces happen to sit.
      if (right - left + 1 < tall * 1.8) continue;

      /*
       * The plate beside this line: its colour, and how even it is. Taken
       * from a band around the line, ignoring the ink itself, because what
       * is being judged is the surface a patch would have to disappear into.
       */
      /*
       * Only above and below, never out to the sides.
       *
       * Reaching sideways as well put the gold ring of the round plate into
       * the reading for its longest line: the background came back part gold,
       * the unevenness came back enormous, and the name of the product was
       * thrown away while the flat number under it survived. The surface a
       * patch has to disappear into is the plate directly over and under the
       * writing, so that is what is measured.
       */
      const reach = Math.round(tall * 0.6);
      let bgR = 0, bgG = 0, bgB = 0, bgN = 0, sum = 0, sumSq = 0;
      const strip = (from: number, to: number) => {
        let clear = 0;
        let area = 0;
        let r2 = 0, g2 = 0, b2 = 0, n2 = 0;
        for (let y = Math.max(0, from); y <= Math.min(h - 1, to); y += 1) {
          for (let x = left; x <= right; x += 1) {
            area += 1;
            const i = y * w + x;
            if (anyInk(i)) continue;
            const p = i * ch;
            bgR += data[p]; bgG += data[p + 1]; bgB += data[p + 2];
            r2 += data[p]; g2 += data[p + 1]; b2 += data[p + 2]; n2 += 1;
            const v = lum[i] / 255;
            sum += v; sumSq += v * v; bgN += 1; clear += 1;
          }
        }
        return {
          open: area ? clear / area : 0,
          colour: n2 ? { r: r2 / n2, g: g2 / n2, b: b2 / n2 } : null,
        };
      };
      const over = strip(top - reach, top - 1);
      const under = strip(bottom + 1, bottom + reach);
      const openAbove = over.open;
      const openBelow = under.open;
      if (bgN < 40) continue;
      const bg = { r: bgR / bgN, g: bgG / bgN, b: bgB / bgN };
      const roughness = Math.sqrt(Math.max(0, sumSq / bgN - (sum / bgN) ** 2));

      /*
       * The plate above the writing and the plate below it must match.
       *
       * A line is painted out by running the plate down through it from the
       * rows above to the rows below, so this is the condition under which
       * that is honest. On artwork and on a plain plate the two are the same
       * surface and it disappears. Where they are not -- a sign photographed
       * on a wall, its face in light above the writing and in shadow below,
       * or a lens that has blurred one and not the other -- the fill has to
       * invent the difference and lands as a visible streak, which is how a
       * photographed billboard came back with its top half wiped.
       */
      if (over.colour && under.colour) {
        const step =
          (Math.abs(over.colour.r - under.colour.r)
            + Math.abs(over.colour.g - under.colour.g)
            + Math.abs(over.colour.b - under.colour.b)) / 3;
        if (step > MAX_STEP) continue;
      }

      /*
       * Writing sits on open plate; ornament does not.
       *
       * This is what tells a line of letters from a row of cut leaves that
       * happens to line up, and it had to be measured because evenness does
       * not: the plate showing between the leaves of the botanical frame is
       * as even as the panel in the middle of it, so the frame read as line
       * after line of writing and the plate was dismissed as a page of text.
       * What differs is how much clear plate surrounds the marks.
       */
      /*
       * A line of writing has clear plate above it or below it.
       *
       * Measuring the clear plate around the whole line did not work: big
       * lettering with a drop shadow fills its own band, so the name on the
       * round plate scored lower than the ornament this was meant to reject.
       * What a line of writing really has is LEADING -- a clear strip over it
       * or under it. A row of cut leaves has more leaves in both directions,
       * because it is a field rather than a line.
       */
      const openness = Math.max(openAbove, openBelow);
      if (openness < MIN_OPENNESS) continue;

      let fgR = 0, fgG = 0, fgB = 0, fgN = 0;
      for (const part of r) {
        for (let y = part.minY; y <= part.maxY; y += 1) {
          for (let x = part.minX; x <= part.maxX; x += 1) {
            const i = y * w + x;
            if (!anyInk(i)) continue;
            const p = i * ch;
            fgR += data[p]; fgG += data[p + 1]; fgB += data[p + 2]; fgN += 1;
          }
        }
      }
      if (!fgN) continue;
      const fg = { r: fgR / fgN, g: fgG / fgN, b: fgB / fgN };
      const contrast =
        Math.abs(lumaOf(fg.r, fg.g, fg.b) - lumaOf(bg.r, bg.g, bg.b)) / 255;

      candidates.push({
        polarity: group.polarity,
        left, right, top, bottom,
        ink: r.reduce((a, p) => a + p.n, 0),
        parts: r, bg, fg, roughness, contrast,
      });
    }
  }


  /*
   * One line of writing, not two.
   *
   * Light lettering is found as light marks, and the plate showing between
   * its letters is found again as dark ones, so the same name arrives twice
   * -- once per polarity. Keeping the heavier reading of any pair that covers
   * the same ground leaves one line where there is one line.
   */
  const deduped: Line[] = [];
  for (const line of [...candidates].sort((a, b) => b.ink - a.ink)) {
    const area = (line.right - line.left + 1) * (line.bottom - line.top + 1);
    const covered = deduped.some((kept) => {
      const ox = Math.min(kept.right, line.right) - Math.max(kept.left, line.left) + 1;
      const oy = Math.min(kept.bottom, line.bottom) - Math.max(kept.top, line.top) + 1;
      return ox > 0 && oy > 0 && (ox * oy) / area > 0.5;
    });
    if (!covered) deduped.push(line);
  }

  const usable = deduped.filter(
    (l) => l.roughness <= MAX_ROUGHNESS && l.contrast >= MIN_CONTRAST,
  );
  if (!usable.length) {
    return no(
      'The writing on this picture sits on a surface too uneven to paint it off cleanly — a wall, a texture or a strong shadow behind it. Upload the design file the plate is cut from, or set the preview up by hand below.',
    );
  }

  /*
   * How much clear plate each line has beside it.
   *
   * Walked outward along the line's own band until the surface stops looking
   * like the plate. It is measured per line and never assumed from a shape,
   * which is what makes a round plate work: the room narrows towards the top
   * and bottom of the circle because the plate does.
   *
   * It also decides what is writing at all. Two rows of leaves at the edge of
   * the botanical panel passed every other test -- level, evenly sized,
   * sitting on clean dark plate -- and painting them out took a corner of the
   * cut border off the product. What they did not have is a plate to sit on:
   * ornament pressed in on both sides, leaving a fifth of the width clear,
   * where the names above had four fifths. Writing is given room; ornament is
   * packed in.
   */
  const plateHere = (x: number, top: number, bottom: number, bg: Rgb): boolean => {
    let hit = 0, seen = 0;
    for (let y = top; y <= bottom; y += 1) {
      const i = y * w + x;
      if (anyInk(i)) continue;
      seen += 1;
      const p = i * ch;
      /*
       * Judged on the channel that differs most, not on the average.
       *
       * The ring around the round plate is broken into arcs by design, so a
       * column can pass between them and the walk carries on to the wall --
       * and a cream wall against a white face differs by only a few points
       * once the three channels are averaged together, far too little to
       * stop it. The difference is almost all in one channel, which is what
       * the eye reads as a different colour and what is used here.
       */
      const d = Math.max(
        Math.abs(data[p] - bg.r),
        Math.abs(data[p + 1] - bg.g),
        Math.abs(data[p + 2] - bg.b),
      );
      if (d < 15) hit += 1;
    }
    /*
     * A column that is mostly ink is the edge of the plate, not more plate.
     *
     * Skipping ink and judging on what was left let the walk tunnel straight
     * through the gold ring of the round plate: the ring is ink, so it was
     * passed over, and the cream wall beyond it is close enough to the white
     * face to be taken for more of it. The name was then given room out to
     * the wall and set wide enough to hang over both sides of the piece.
     */
    if (seen < (bottom - top + 1) * 0.78) return false;
    return seen > 0 && hit / seen > 0.75;
  };

  const measured = usable.map((line) => {
    let clearL = line.left;
    let clearR = line.right;
    while (clearL > 0 && plateHere(clearL - 1, line.top, line.bottom, line.bg)) clearL -= 1;
    while (clearR < w - 1 && plateHere(clearR + 1, line.top, line.bottom, line.bg)) clearR += 1;
    /*
     * A margin, so a long name stops short of the edge rather than on it.
     *
     * The clear run is measured to the last column that still looks like
     * plate, and a name set to exactly that width grazes whatever stops it --
     * on the round plate, the gold ring. Nobody cuts a plate with the
     * lettering hard against the border, so neither does this.
     */
    const margin = Math.round((clearR - clearL + 1) * 0.05);
    return { line, clearL: clearL + margin, clearR: clearR - margin };
  }).filter((m) => (m.clearR - m.clearL + 1) / w >= MIN_ROOM);

  if (!measured.length) {
    return no('What was found is packed in by ornament rather than set on open plate, so it was left alone.');
  }

  /*
   * Which lines are the plate.
   *
   * A picture of a piece in place holds other writing: a watermark in the
   * corner, a number on a door behind it. Lines that belong to one plate sit
   * on the same colour, so they are grouped by background and the heaviest
   * group wins -- the name on the plate is the subject of the photograph and
   * carries far more ink than a caption in a corner.
   */
  const roomOf = new Map(measured.map((m) => [m.line, m]));
  const clusters: Line[][] = [];
  for (const { line } of measured) {
    const near = clusters.find((c) => {
      const b = c[0].bg;
      return (Math.abs(b.r - line.bg.r) + Math.abs(b.g - line.bg.g) + Math.abs(b.b - line.bg.b)) / 3 < SAME_PLATE;
    });
    if (near) near.push(line);
    else clusters.push([line]);
  }
  const group = clusters.sort(
    (a, b) => b.reduce((n, l) => n + l.ink, 0) - a.reduce((n, l) => n + l.ink, 0),
  )[0];

  /*
   * The lines of a nameplate stand one above another.
   *
   * The heaviest line is the name, and anything belonging with it shares its
   * column of the plate. Without this the bottom row of the cube band -- off
   * to the left of the lettering, on the same black plate, level and evenly
   * sized -- was taken for a line of the name and smeared away, which took a
   * row of the cut pattern off the product.
   */
  const anchorLine = group.reduce((a, b) => (b.ink > a.ink ? b : a));
  const chosen = group
    .filter((line) => {
      const overlap =
        Math.min(anchorLine.right, line.right) - Math.max(anchorLine.left, line.left) + 1;
      const narrower = Math.min(anchorLine.right - anchorLine.left, line.right - line.left) + 1;
      return overlap / narrower > 0.25;
    })
    .sort((a, b) => a.top - b.top);

  if (chosen.length > MAX_LINES) {
    return no('This reads as a page of text rather than a nameplate, so it was left alone.');
  }

  const boxes: PlateBox[] = [];
  for (const line of chosen) {
    const { clearL, clearR } = roomOf.get(line)!;
    const centre = (line.left + line.right + 1) / 2;
    const mid = (clearL + clearR + 1) / 2;
    const span = Math.max(1, clearR - clearL + 1);
    const off = (centre - mid) / span;
    const align = Math.abs(off) < 0.06 ? 'center' : off < 0 ? 'left' : 'right';
    const anchorPx = align === 'center' ? centre : align === 'left' ? line.left : line.right + 1;
    const room =
      align === 'center'
        ? Math.min(anchorPx - clearL, clearR + 1 - anchorPx) * 2
        : align === 'left'
          ? clearR + 1 - anchorPx
          : anchorPx - clearL;

    boxes.push({
      y: line.top / h,
      h: (line.bottom - line.top + 1) / h,
      align,
      anchor: anchorPx / w,
      room: room / w,
    });
  }

  /*
   * Paint each line out, over the marks themselves and nothing else.
   *
   * Filling the line's whole rectangle was wrong twice over. A run can pick
   * up a stray mark off to one side, and the rectangle then stretches out to
   * meet it -- on the round plate that reached past the face and flattened a
   * section of the gold ring, which is the one thing a preview must never do
   * to a product. And a rectangle covers plate that had nothing on it, so any
   * error in the fill shows up over an area far larger than the writing.
   *
   * So the patch is the ink, grown by a little to take the soft edge of a
   * letter and its shadow with it. Every column is then closed by running the
   * plate from just above the marks to just below them, which keeps a plate
   * that is lit from one side looking lit.
   */
  const outW = Math.min(fullW, MAX_OUT);
  const outH = Math.max(1, Math.round((fullH * outW) / fullW));
  const big = await sharp(source).resize(outW, outH, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const sx = outW / w;
  const sy = outH / h;

  /*
   * Everything inside a line's own box goes, except a rule.
   *
   * Covering only the marks that qualified as letters left crumbs behind --
   * the dot of an i, the tail of a letter, a piece of a shadow that was too
   * small or too thin to be called writing on its own, each of them sitting
   * on the plate after the name around it had gone. Inside the box the line
   * occupies, anything that is not plate belongs to that line.
   *
   * A rule is the exception and is protected: it runs far longer than it is
   * tall, it is part of the design rather than part of the name, and half of
   * one left behind would be worse than leaving all of it.
   */
  const protect = new Uint8Array(w * h);
  for (const f of fixtures) {
    if (f.w <= f.h * 8) continue;
    for (let y = f.minY; y <= f.maxY; y += 1) {
      for (let x = f.minX; x <= f.maxX; x += 1) protect[y * w + x] = 1;
    }
  }

  const cover = new Uint8Array(w * h);
  for (const line of chosen) {
    for (let y = line.top; y <= line.bottom; y += 1) {
      for (let x = line.left; x <= line.right; x += 1) {
        const i = y * w + x;
        if (anyInk(i) && !protect[i]) cover[i] = 1;
      }
    }
  }

  // Grown by a share of the lettering's own height, so the amount of spread
  // suits the size of the writing rather than the size of the picture.
  const tallest = Math.max(...chosen.map((l) => l.bottom - l.top + 1));
  const grow = Math.max(2, Math.round(tallest * 0.1));
  const grown = new Uint8Array(w * h);
  const spread = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let on = 0;
      for (let k = -grow; k <= grow && !on; k += 1) {
        const xx = x + k;
        if (xx >= 0 && xx < w && cover[y * w + xx]) on = 1;
      }
      spread[y * w + x] = on;
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let on = 0;
      for (let k = -grow; k <= grow && !on; k += 1) {
        const yy = y + k;
        if (yy >= 0 && yy < h && spread[yy * w + x]) on = 1;
      }
      grown[y * w + x] = on;
    }
  }

  const painted = (X: number, Y: number) => {
    const x = Math.min(w - 1, Math.floor(X / sx));
    const y = Math.min(h - 1, Math.floor(Y / sy));
    return grown[y * w + x] === 1;
  };

  /** A few rows of plate either side of the marks, averaged for steadiness. */
  const SAMPLE = 3;
  for (let X = 0; X < outW; X += 1) {
    let Y = 0;
    while (Y < outH) {
      if (!painted(X, Y)) { Y += 1; continue; }
      let end = Y;
      while (end + 1 < outH && painted(X, end + 1)) end += 1;

      const a = [0, 0, 0];
      const b = [0, 0, 0];
      let an = 0, bn = 0;
      for (let y = Math.max(0, Y - SAMPLE); y < Y; y += 1) {
        const p = (y * outW + X) * 3;
        a[0] += big[p]; a[1] += big[p + 1]; a[2] += big[p + 2]; an += 1;
      }
      for (let y = end + 1; y <= Math.min(outH - 1, end + SAMPLE); y += 1) {
        const p = (y * outW + X) * 3;
        b[0] += big[p]; b[1] += big[p + 1]; b[2] += big[p + 2]; bn += 1;
      }
      if (an || bn) {
        const topC = an ? a.map((v) => v / an) : b.map((v) => v / bn);
        const botC = bn ? b.map((v) => v / bn) : topC;
        for (let y = Y; y <= end; y += 1) {
          const t = (y - Y + 1) / (end - Y + 2);
          const p = (y * outW + X) * 3;
          big[p] = topC[0] + (botC[0] - topC[0]) * t;
          big[p + 1] = topC[1] + (botC[1] - topC[1]) * t;
          big[p + 2] = topC[2] + (botC[2] - topC[2]) * t;
        }
      }
      Y = end + 1;
    }
  }

  const blank = await sharp(big, { raw: { width: outW, height: outH, channels: 3 } })
    .webp({ quality: 92 })
    .toBuffer();

  const plate = chosen[0].bg;
  const ink = chosen[0].fg;
  return {
    ok: true,
    reason: `Read ${chosen.length} line${chosen.length === 1 ? '' : 's'} of writing on a ${fullW}×${fullH} picture and painted ${chosen.length === 1 ? 'it' : 'them'} out. Everything else is untouched.`,
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
