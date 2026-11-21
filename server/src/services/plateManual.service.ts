import path from 'path';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import prisma from '../lib/prisma';
import { ApiError } from '../utils/http';
import { readStored } from './mediaFile.service';
import { getStorage } from './storage.service';
import {
  BOLD_FILL, MAX_OUT, components, hex, lumaOf,
  type Mark, type PlateAnalysis, type PlateBox, type PlatePreview,
} from './plateText.service';

/**
 * A preview from a photograph, with the studio pointing.
 *
 * The automatic reader needs a flat, head-on picture: a design file. Plenty of
 * products have only photographs -- the Ganesha plate is a brushed-silver
 * panel shot at an angle on a sunlit wall -- and the reader rightly turns
 * those down, because it cannot tell on its own where the plate is or which
 * marks are words. A person can, in seconds. So this does the two things only
 * a person can say, and nothing else:
 *
 *  1. Straighten. The studio drags the four corners of the plate, and the
 *     photograph is unwarped into a head-on picture of it. That picture is
 *     kept in the media library: it is the flat design file the product
 *     never had.
 *  2. Mark the words. On the straightened plate the studio draws a box over
 *     each line of sample lettering. Inside each box the marks are found and
 *     painted out, the surface's own grain is put back over the patch so
 *     brushed metal still looks brushed, and each line is measured -- edge,
 *     baseline, size -- exactly as the automatic reader measures one.
 *
 * Everything outside the boxes is left as it was photographed: the motif, the
 * screws, the house symbol. Only what the studio marked is ever touched.
 */

/** Fractions of the picture, so they survive any resize. */
export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const unit = (n: number) => Math.min(1, Math.max(0, n));

export function parseCorners(raw: unknown): Point[] {
  if (!Array.isArray(raw) || raw.length !== 4) throw ApiError.badRequest('Mark the four corners of the plate.');
  return raw.map((p) => {
    if (!p || !finite(p.x) || !finite(p.y)) throw ApiError.badRequest('Mark the four corners of the plate.');
    return { x: unit(p.x), y: unit(p.y) };
  });
}

export function parseRects(raw: unknown): Rect[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 6) {
    throw ApiError.badRequest('Draw a box over each line of words — between one and six.');
  }
  return raw.map((r) => {
    if (!r || !finite(r.x) || !finite(r.y) || !finite(r.w) || !finite(r.h)) {
      throw ApiError.badRequest('One of the boxes was not drawn properly — draw it again.');
    }
    const x = unit(r.x);
    const y = unit(r.y);
    return { x, y, w: Math.min(1 - x, Math.max(0, r.w)), h: Math.min(1 - y, Math.max(0, r.h)) };
  });
}

// ---------------------------------------------------------------------------
// Straightening
// ---------------------------------------------------------------------------

/** Solves the 8x8 system for the projective map taking `from` onto `to`. */
function homography(from: Point[], to: Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x: u, y: v } = from[i];
    const { x, y } = to[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  for (let col = 0; col < 8; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 8; row += 1) if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
    if (Math.abs(A[pivot][col]) < 1e-12) throw ApiError.badRequest('Those corners do not make a plate shape — drag them to the four corners of the plate.');
    [A[col], A[pivot]] = [A[pivot], A[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    for (let row = 0; row < 8; row += 1) {
      if (row === col) continue;
      const f = A[row][col] / A[col][col];
      if (!f) continue;
      for (let k = col; k < 8; k += 1) A[row][k] -= f * A[col][k];
      b[row] -= f * b[col];
    }
  }
  return [...b.map((v, i) => v / A[i][i]), 1];
}

/** Twice the signed area; the quad must turn one way all round to be a plate. */
function convex(points: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    if (!sign) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/**
 * The plate inside four corners, as if photographed straight on.
 * Corners run top-left, top-right, bottom-right, bottom-left.
 */
export async function straighten(source: Buffer, corners: Point[]): Promise<{ buffer: Buffer; width: number; height: number }> {
  const meta = await sharp(source).metadata();
  const fullW = meta.width ?? 0;
  const fullH = meta.height ?? 0;
  if (!fullW || !fullH) throw ApiError.badRequest('That file is not an image this can read.');

  const sw = Math.min(fullW, 3000);
  const sh = Math.max(1, Math.round((fullH * sw) / fullW));
  const src = await sharp(source).resize(sw, sh, { fit: 'fill' })
    .flatten({ background: '#ffffff' }).toColourspace('srgb').raw().toBuffer();

  const px = corners.map((p) => ({ x: p.x * (sw - 1), y: p.y * (sh - 1) }));
  if (!convex(px)) throw ApiError.badRequest('Those corners cross over — drag each one to its own corner of the plate.');
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  let outW = Math.round((dist(px[0], px[1]) + dist(px[3], px[2])) / 2);
  let outH = Math.round((dist(px[0], px[3]) + dist(px[1], px[2])) / 2);
  if (outW < 60 || outH < 30) throw ApiError.badRequest('The plate marked is too small — drag the corners out to its edges.');
  const fit = Math.min(1, MAX_OUT / outW, MAX_OUT / outH);
  outW = Math.round(outW * fit);
  outH = Math.round(outH * fit);

  const rect = [{ x: 0, y: 0 }, { x: outW - 1, y: 0 }, { x: outW - 1, y: outH - 1 }, { x: 0, y: outH - 1 }];
  const [h0, h1, h2, h3, h4, h5, h6, h7] = homography(rect, px);
  const out = Buffer.alloc(outW * outH * 3);
  for (let v = 0; v < outH; v += 1) {
    for (let u = 0; u < outW; u += 1) {
      const d = h6 * u + h7 * v + 1;
      const x = Math.min(sw - 1, Math.max(0, (h0 * u + h1 * v + h2) / d));
      const y = Math.min(sh - 1, Math.max(0, (h3 * u + h4 * v + h5) / d));
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
      const fx = x - x0, fy = y - y0;
      const o = (v * outW + u) * 3;
      for (let c = 0; c < 3; c += 1) {
        const top = src[(y0 * sw + x0) * 3 + c] * (1 - fx) + src[(y0 * sw + x1) * 3 + c] * fx;
        const bottom = src[(y1 * sw + x0) * 3 + c] * (1 - fx) + src[(y1 * sw + x1) * 3 + c] * fx;
        out[o + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  const buffer = await sharp(out, { raw: { width: outW, height: outH, channels: 3 } }).webp({ quality: 92 }).toBuffer();
  return { buffer, width: outW, height: outH };
}

/** Straightens a stored picture and keeps the result in the media library. */
export async function straightenStored(url: string, corners: Point[]): Promise<{ url: string; width: number; height: number }> {
  const stored = await readStored(url).catch(() => null);
  if (!stored) throw ApiError.badRequest('That picture could not be read.');
  const flat = await straighten(stored.buffer, corners);
  const base = path.basename(url, path.extname(url)).replace(/-[\w-]{10}$/, '').slice(0, 40) || 'plate';
  const filename = `${base}-flat-${nanoid(10)}.webp`;
  const put = await getStorage().put({ buffer: flat.buffer, filename, mimeType: 'image/webp', folder: 'products' });
  await prisma.mediaAsset.create({
    data: {
      url: put.url, filename, mimeType: 'image/webp', size: flat.buffer.length,
      folder: 'products', alt: 'Plate straightened from a photograph', width: flat.width, height: flat.height,
    },
  }).catch(() => undefined);
  return { url: put.url, width: flat.width, height: flat.height };
}

// ---------------------------------------------------------------------------
// Marked lines
// ---------------------------------------------------------------------------

interface Line {
  rect: { x0: number; y0: number; x1: number; y1: number };
  left: number; right: number; top: number; bottom: number; foot: number;
  marks: Mark[];
}

export async function analyseMarked(source: Buffer, rects: Rect[]): Promise<PlateAnalysis> {
  const no = (reason: string): PlateAnalysis => ({
    ok: false, reason, blank: null, aspect: null, plateColor: null, textColor: null, boxes: [], script: 'latin', weight: 400,
  });

  const meta = await sharp(source).metadata();
  const fullW = meta.width ?? 0;
  const fullH = meta.height ?? 0;
  if (!fullW || !fullH) return no('That file is not an image this can read.');
  const w = Math.min(fullW, MAX_OUT);
  const h = Math.max(1, Math.round((fullH * w) / fullW));
  const orig = await sharp(source).resize(w, h, { fit: 'fill' })
    .flatten({ background: '#ffffff' }).toColourspace('srgb').raw().toBuffer();
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) lum[i] = lumaOf(orig[i * 3], orig[i * 3 + 1], orig[i * 3 + 2]);

  const ink = new Uint8Array(w * h);
  const lines: Line[] = [];
  const plateSamples: number[][] = [];
  const inkSamples: number[][] = [];

  /** Pixels that stand out from the plate anywhere near a box: never sampled as plate. */
  const unsafe = new Uint8Array(w * h);

  for (const [index, r] of rects.entries()) {
    const x0 = Math.max(0, Math.floor(r.x * w));
    const y0 = Math.max(0, Math.floor(r.y * h));
    const x1 = Math.min(w - 1, Math.ceil((r.x + r.w) * w) - 1);
    const y1 = Math.min(h - 1, Math.ceil((r.y + r.h) * h) - 1);
    if (x1 - x0 < 8 || y1 - y0 < 6) return no(`Box ${index + 1} is too small — draw it over the whole line of words.`);

    /*
     * A little more than the box is looked at. A box drawn snugly round a
     * line cuts through the loop of a script capital or a tail below it, and
     * a letter left half on the plate is worse than one left whole -- so any
     * mark that lies mostly inside the box is taken in full, wherever it
     * reaches. A mark that only strays into the margin from a neighbouring
     * line is not.
     */
    const boxH = y1 - y0 + 1;
    const X0 = Math.max(0, x0 - Math.round(boxH * 0.4));
    const X1 = Math.min(w - 1, x1 + Math.round(boxH * 0.4));
    const Y0 = Math.max(0, y0 - Math.round(boxH * 0.45));
    const Y1 = Math.min(h - 1, y1 + Math.round(boxH * 0.45));

    // Which way the words stand out: whichever tail of the box's brightness reaches further.
    const inside: number[] = [];
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) inside.push(lum[y * w + x]);
    inside.sort((a, b) => a - b);
    const at = (q: number) => inside[Math.min(inside.length - 1, Math.floor(inside.length * q))];
    const sign = at(0.5) - at(0.03) >= at(0.97) - at(0.5) ? -1 : 1;

    /*
     * The plate's own level down each column. Writing never fills a column
     * of the region, so the plate is the bulk of it: a high percentile for
     * dark lettering, a low one for light. Smoothed across neighbouring
     * columns, so it follows light falling across the plate but not the
     * letters.
     */
    const raw = new Float32Array(X1 - X0 + 1);
    const column: number[] = [];
    for (let x = X0; x <= X1; x += 1) {
      column.length = 0;
      for (let y = Y0; y <= Y1; y += 1) column.push(lum[y * w + x]);
      column.sort((a, b) => a - b);
      raw[x - X0] = column[Math.floor(column.length * (sign < 0 ? 0.75 : 0.25))];
    }
    const plateLevel = new Float32Array(X1 - X0 + 1);
    const near: number[] = [];
    for (let x = X0; x <= X1; x += 1) {
      near.length = 0;
      for (let k = -12; k <= 12; k += 1) {
        const xx = x + k;
        if (xx >= X0 && xx <= X1) near.push(raw[xx - X0]);
      }
      near.sort((a, b) => a - b);
      plateLevel[x - X0] = near[near.length >> 1];
    }
    const stand = (x: number, y: number) => sign * (lum[y * w + x] - plateLevel[x - X0]);

    const deviations: number[] = [];
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const d = stand(x, y);
        if (d > 15) deviations.push(d);
      }
    }
    if (deviations.length < (x1 - x0 + 1) * (y1 - y0 + 1) * 0.01) {
      return no(`Nothing that looks like writing was found inside box ${index + 1}. Draw it over the words themselves.`);
    }
    deviations.sort((a, b) => a - b);
    const core = deviations[Math.floor(deviations.length * 0.9)];
    const cut = Math.max(18, core * 0.35);

    // Every mark in the region, labelled, with how much of each lies inside the box.
    const label = new Int32Array(w * h).fill(-1);
    const stats: { n: number; inBox: number; minX: number; maxX: number; minY: number; maxY: number }[] = [];
    const stack: number[] = [];
    for (let y = Y0; y <= Y1; y += 1) {
      for (let x = X0; x <= X1; x += 1) {
        const start = y * w + x;
        if (label[start] >= 0 || stand(x, y) <= cut) continue;
        const id = stats.length;
        const s = { n: 0, inBox: 0, minX: x, maxX: x, minY: y, maxY: y };
        stats.push(s);
        label[start] = id;
        stack.push(start);
        while (stack.length) {
          const i = stack.pop() as number;
          const px = i % w;
          const py = (i - px) / w;
          s.n += 1;
          if (px >= x0 && px <= x1 && py >= y0 && py <= y1) s.inBox += 1;
          if (px < s.minX) s.minX = px;
          if (px > s.maxX) s.maxX = px;
          if (py < s.minY) s.minY = py;
          if (py > s.maxY) s.maxY = py;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const nx = px + dx;
              const ny = py + dy;
              if (nx < X0 || nx > X1 || ny < Y0 || ny > Y1) continue;
              const j = ny * w + nx;
              if (label[j] < 0 && stand(nx, ny) > cut) { label[j] = id; stack.push(j); }
            }
          }
        }
      }
    }
    const kept = new Set<number>();
    stats.forEach((s, id) => { if (s.n >= 4 && s.inBox >= s.n * 0.3) kept.add(id); });
    if (!kept.size) return no(`Nothing that looks like writing was found inside box ${index + 1}.`);

    const mask = new Uint8Array(w * h);
    for (let y = Y0; y <= Y1; y += 1) {
      for (let x = X0; x <= X1; x += 1) {
        const i = y * w + x;
        if (stand(x, y) > cut * 0.6) unsafe[i] = 1;
        if (label[i] >= 0 && kept.has(label[i])) mask[i] = 1;
      }
    }
    const marks: Mark[] = [...kept].map((id) => {
      const s = stats[id];
      return {
        minX: s.minX, maxX: s.maxX, minY: s.minY, maxY: s.maxY, n: s.n,
        w: s.maxX - s.minX + 1, h: s.maxY - s.minY + 1, polarity: sign < 0 ? 'dark' : 'light',
      };
    });

    let left = w, right = -1, top = h, bottom = -1;
    for (const m of marks) {
      left = Math.min(left, m.minX); right = Math.max(right, m.maxX);
      top = Math.min(top, m.minY); bottom = Math.max(bottom, m.maxY);
    }
    const rows = new Array<number>(bottom - top + 1).fill(0);
    for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) rows[y - top] += mask[y * w + x];
    const busiest = Math.max(...rows);
    let foot = bottom;
    while (foot > top && rows[foot - top] < busiest * 0.35) foot -= 1;

    for (let i = 0; i < w * h; i += 1) if (mask[i]) ink[i] = 1;
    lines.push({ rect: { x0, y0, x1, y1 }, left, right, top, bottom, foot, marks });

    for (let x = X0; x <= X1; x += 5) {
      for (let y = Y0; y <= Y1; y += 5) {
        const i = y * w + x;
        if (Math.abs(lum[i] - plateLevel[x - X0]) < 6) plateSamples.push([orig[i * 3], orig[i * 3 + 1], orig[i * 3 + 2]]);
      }
    }
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const i = y * w + x;
        if (mask[i] && stand(x, y) >= core * 0.85) inkSamples.push([orig[i * 3], orig[i * 3 + 1], orig[i * 3 + 2]]);
      }
    }
  }

  // ---- Paint out what was marked, and put the surface's grain back ----
  const tallest = Math.max(...lines.map((l) => l.bottom - l.top + 1));
  const grow = Math.max(2, Math.round(tallest * 0.08));
  const patch = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!ink[y * w + x]) continue;
      for (let dy = -grow; dy <= grow; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -grow; dx <= grow; dx += 1) {
          const xx = x + dx;
          if (xx >= 0 && xx < w) patch[yy * w + xx] = 1;
        }
      }
    }
  }
  const clean = (y: number, X: number) => y >= 0 && y < h && !patch[y * w + X] && !unsafe[y * w + X];

  const out = Buffer.from(orig);
  const SAMPLE = 3;
  const GRAIN = 10;
  for (let X = 0; X < w; X += 1) {
    let Y = 0;
    while (Y < h) {
      if (!patch[Y * w + X]) { Y += 1; continue; }
      let end = Y;
      while (end + 1 < h && patch[(end + 1) * w + X]) end += 1;
      const run = end - Y + 1;

      /** The plate just beyond the patch, walking past anything that is not plate. */
      const edge = (from: number, step: number) => {
        const sum = [0, 0, 0];
        let n = 0;
        for (let y = from, tries = 0; n < SAMPLE && tries < 14 && y >= 0 && y < h; y += step, tries += 1) {
          if (!clean(y, X)) continue;
          const p = (y * w + X) * 3;
          sum[0] += orig[p]; sum[1] += orig[p + 1]; sum[2] += orig[p + 2]; n += 1;
        }
        return n ? sum.map((v) => v / n) : null;
      };
      const topC = edge(Y - 1, -1);
      const botC = edge(end + 1, 1);
      const a = topC ?? botC;
      const b = botC ?? topC;
      if (a && b) {
        /*
         * The grain: how a clean stretch of the same column wanders about its
         * own average, taken from beside the patch. Brushed metal and grained
         * acrylic run in lines, so that wandering is the texture; laid back
         * over the smooth fill, the patch reads as the same surface rather
         * than a smear. Only borrowed from plate that is clean all the way.
         */
        let donor = -1;
        for (const start of [Y - run - SAMPLE - 2, end + SAMPLE + 3]) {
          if (start - 2 < 0 || start + run + 2 >= h) continue;
          let ok = true;
          for (let y = start - 2; y <= start + run + 1 && ok; y += 1) ok = clean(y, X);
          if (ok) { donor = start; break; }
        }
        for (let y = Y; y <= end; y += 1) {
          const t = (y - Y + 1) / (run + 1);
          const p = (y * w + X) * 3;
          for (let c = 0; c < 3; c += 1) {
            let grain = 0;
            if (donor >= 0) {
              const dy = donor + (y - Y);
              let local = 0;
              for (let k = -2; k <= 2; k += 1) local += orig[((dy + k) * w + X) * 3 + c];
              grain = Math.max(-GRAIN, Math.min(GRAIN, orig[(dy * w + X) * 3 + c] - local / 5));
            }
            out[p + c] = Math.max(0, Math.min(255, Math.round(a[c] + (b[c] - a[c]) * t + grain)));
          }
        }
      }
      Y = end + 1;
    }
  }

  // ---- Measure each line the way the automatic reader does ----
  lines.sort((p, q) => p.top - q.top);
  const SHARED = w * 0.02;
  const lefts = lines.map((l) => l.left);
  const rights = lines.map((l) => l.right + 1);
  const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
  const middle = (v: number[]) => [...v].sort((p, q) => p - q)[v.length >> 1];
  const block = lines.length >= 2
    ? spread(lefts) <= SHARED ? 'left' : spread(rights) <= SHARED ? 'right' : null
    : null;

  const boxes: PlateBox[] = lines.map((line) => {
    const tall = line.bottom - line.top + 1;
    const inkW = line.right - line.left + 1;
    const drawnW = line.rect.x1 - line.rect.x0 + 1;
    const base = {
      y: line.top / h,
      h: tall / h,
      base: Math.min(1, Math.max(0.3, (line.foot - line.top + 1) / tall)),
    };
    if (block === 'left') {
      const anchor = middle(lefts);
      return { ...base, align: 'left' as const, anchor: anchor / w, room: Math.max(inkW, line.rect.x1 + 1 - anchor) / w };
    }
    if (block === 'right') {
      const anchor = middle(rights);
      return { ...base, align: 'right' as const, anchor: anchor / w, room: Math.max(inkW, anchor - line.rect.x0) / w };
    }
    // Set from its own middle, with the box the studio drew as the room it may fill.
    const centre = (line.left + line.right + 1) / 2;
    const room = Math.min(Math.max(inkW, drawnW), 2 * Math.min(centre, w - centre));
    return { ...base, align: 'center' as const, anchor: centre / w, room: room / w };
  });

  const fills = lines.flatMap((l) => l.marks.filter((m) => m.n >= 20).map((m) => m.n / (m.w * m.h))).sort((p, q) => p - q);
  const weight = fills.length && fills[fills.length >> 1] >= BOLD_FILL ? 700 : 400;
  const average = (samples: number[][]) => {
    if (!samples.length) return null;
    const sum = samples.reduce((acc, s) => [acc[0] + s[0], acc[1] + s[1], acc[2] + s[2]], [0, 0, 0]);
    return hex(sum[0] / samples.length, sum[1] / samples.length, sum[2] / samples.length);
  };

  const blank = await sharp(out, { raw: { width: w, height: h, channels: 3 } }).webp({ quality: 92 }).toBuffer();
  return {
    ok: true,
    reason: `Painted out the ${lines.length} line${lines.length === 1 ? '' : 's'} you marked and measured where each sat. Everything outside the boxes is untouched.`,
    blank,
    aspect: { width: fullW, height: fullH },
    plateColor: average(plateSamples),
    textColor: average(inkSamples),
    weight,
    boxes,
    script: 'latin',
  };
}

/** The same, on a stored picture, with the blank kept. */
export async function readMarked(url: string, rects: Rect[]): Promise<PlatePreview> {
  const stored = await readStored(url).catch(() => null);
  if (!stored) {
    return { ok: false, reason: 'That picture could not be read.', image: null, aspect: null, plateColor: null, textColor: null, boxes: [], script: 'latin', weight: 400 };
  }
  const read = await analyseMarked(stored.buffer, rects);
  const { blank, ...rest } = read;
  if (!read.ok || !blank) return { ...rest, image: null };
  const put = await getStorage().put({
    buffer: blank,
    filename: `plate-${nanoid(10)}.webp`,
    mimeType: 'image/webp',
    folder: 'products',
  });
  return { ...rest, image: put.url };
}
