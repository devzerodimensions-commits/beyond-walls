import path from 'path';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import prisma from '../lib/prisma';
import { validateUpload } from './fileValidation.service';
import { deleteFileIfUnreferenced } from './media.service';
import { getSetting, setSetting } from './settings.service';
import { getStorage } from './storage.service';
import { ApiError } from '../utils/http';
import { alignLettering } from './previewBinding.service';
import { env } from '../config/env';

/**
 * The symbols a customer can put on a plate: Ganesha, Om, Swastik, a cross,
 * a khanda -- whatever the studio offers.
 *
 * Kept once for the whole shop rather than per product, so a symbol uploaded
 * today is offered on every plate that has room for one, including plates
 * added later. A symbol is usually cut or printed in the same colour as the
 * lettering, so by default it is stored as a shape -- coverage only, no colour
 * -- and the preview fills it with whatever colour the plate's words are in. A
 * black Om on a black acrylic plate would otherwise vanish. A symbol that has
 * colours of its own (a printed, multi-coloured deity) can keep them.
 */

export interface PlateSymbol {
  id: string;
  label: string;
  /** The shape: black, with its coverage in the alpha channel. The option value customers choose. */
  url: string;
  /** The symbol as supplied, background removed, for one shown in its own colours. */
  colour: string;
  /** Filled with the plate's lettering colour (the usual case), or shown as supplied. */
  tint: boolean;
}

const KEY = 'preview.symbols';
const MAX_SIDE = 800;

export async function listSymbols(): Promise<PlateSymbol[]> {
  const raw = await getSetting<unknown>(KEY, []);
  return Array.isArray(raw) ? (raw as PlateSymbol[]).filter((s) => s && s.url && s.label) : [];
}

/**
 * A symbol image turned into a clean shape.
 *
 * Studios send what they have: a black symbol on a white JPEG, a transparent
 * PNG, a photo crop. Either the transparency already says where the symbol
 * is, or the background is the colour round the edge and the symbol is
 * whatever stands out from it. The result is trimmed to the symbol, so every
 * symbol fills the space on the plate the same way.
 */
export async function shapeOf(source: Buffer): Promise<{ shape: Buffer; colour: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(source)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const px = (i: number) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]];
  const lum = (i: number) => 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];

  let clear = 0;
  for (let i = 0; i < w * h; i += 1) if (data[i * 4 + 3] < 128) clear += 1;
  const transparent = clear > w * h * 0.05;

  const coverage = new Float32Array(w * h);
  if (transparent) {
    for (let i = 0; i < w * h; i += 1) coverage[i] = data[i * 4 + 3] / 255;
  } else {
    const edge: number[] = [];
    for (let x = 0; x < w; x += 1) edge.push(lum(x), lum((h - 1) * w + x));
    for (let y = 0; y < h; y += 1) edge.push(lum(y * w), lum(y * w + w - 1));
    edge.sort((a, b) => a - b);
    const page = edge[edge.length >> 1];
    const far: number[] = [];
    for (let i = 0; i < w * h; i += 1) {
      const d = Math.abs(lum(i) - page);
      if (d > 40) far.push(d);
    }
    if (far.length < w * h * 0.005) throw ApiError.badRequest('No symbol could be made out on that picture — use one with the symbol on a plain background.');
    far.sort((a, b) => a - b);
    const ink = far[Math.floor(far.length * 0.8)];
    for (let i = 0; i < w * h; i += 1) {
      coverage[i] = Math.min(1, Math.max(0, (Math.abs(lum(i) - page) - ink * 0.12) / (ink * 0.75)));
    }
  }

  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (coverage[y * w + x] < 0.15) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw ApiError.badRequest('No symbol could be made out on that picture.');
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;

  const shape = Buffer.alloc(cw * ch * 4);
  const colour = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const i = (y + y0) * w + (x + x0);
      const o = (y * cw + x) * 4;
      const a = Math.round(coverage[i] * 255);
      shape[o + 3] = a;
      const [r, g, b, alpha] = px(i);
      colour[o] = r; colour[o + 1] = g; colour[o + 2] = b;
      colour[o + 3] = transparent ? alpha : a;
    }
  }
  const out = (buffer: Buffer) => sharp(buffer, { raw: { width: cw, height: ch, channels: 4 } })
    .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  const [s, c] = await Promise.all([out(shape), out(colour)]);
  return { shape: s.data, colour: c.data, width: s.info.width, height: s.info.height };
}

/** Stores a shaped symbol and adds it to the library. */
export async function saveSymbol(
  shaped: { shape: Buffer; colour: Buffer; width: number; height: number },
  options: { label: string; tint?: boolean; baseName?: string },
): Promise<{ symbol: PlateSymbol; library: PlateSymbol[] }> {
  const label = options.label.replace(/[<>"]/g, '').trim().slice(0, 40) || 'Symbol';
  const base = (options.baseName || label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'symbol';
  const storage = getStorage();
  const [shape, colour] = await Promise.all([
    storage.put({ buffer: shaped.shape, filename: `${base}-${nanoid(10)}.png`, mimeType: 'image/png', folder: 'symbols' }),
    storage.put({ buffer: shaped.colour, filename: `${base}-colour-${nanoid(10)}.png`, mimeType: 'image/png', folder: 'symbols' }),
  ]);
  await prisma.mediaAsset.create({
    data: {
      url: shape.url, filename: `${label}.png`, mimeType: 'image/png', size: shaped.shape.length,
      folder: 'symbols', alt: `${label} symbol`, width: shaped.width, height: shaped.height,
    },
  }).catch(() => undefined);

  const symbol: PlateSymbol = { id: nanoid(8), label, url: shape.url, colour: colour.url, tint: options.tint !== false };
  const library = [...(await listSymbols()), symbol];
  await setSetting(KEY, library);
  return { symbol, library };
}

export async function addSymbol(file: Express.Multer.File, options: { label?: string; tint?: boolean }) {
  const checked = validateUpload(
    { originalname: file.originalname, mimetype: file.mimetype, buffer: file.buffer, size: file.size },
    'image',
    env.maxUploadMb * 1024 * 1024,
  );
  const shaped = await shapeOf(file.buffer);
  const label = options.label?.trim()
    || path.basename(file.originalname, path.extname(file.originalname)).replace(/[-_]+/g, ' ').trim();
  return (await saveSymbol(shaped, { label, tint: options.tint, baseName: checked.safeBaseName })).library;
}

export async function updateSymbol(id: string, patch: { label?: string; tint?: boolean }): Promise<PlateSymbol[]> {
  const library = (await listSymbols()).map((s) => (s.id !== id ? s : {
    ...s,
    label: patch.label !== undefined ? patch.label.replace(/[<>"]/g, '').trim().slice(0, 40) || s.label : s.label,
    tint: typeof patch.tint === 'boolean' ? patch.tint : s.tint,
  }));
  await setSetting(KEY, library);
  return library;
}

export async function removeSymbol(id: string): Promise<PlateSymbol[]> {
  const current = await listSymbols();
  const gone = current.find((s) => s.id === id);
  if (!gone) throw ApiError.notFound('That symbol is not in the library.');
  const library = current.filter((s) => s.id !== id);
  await setSetting(KEY, library);

  /*
   * Every product that pointed at it, not just the one on screen.
   *
   * A question left starting on a symbol that no longer exists draws nothing
   * where the symbol was and offers a choice the shop cannot serve -- and the
   * studio would only find out on whichever product they were not looking at.
   * A plate starting on the removed symbol falls back to the first symbol
   * left, or to none when the library is empty.
   */
  const fields = await prisma.personalizationField.findMany({
    where: { previewSlot: 'logo' },
    select: { id: true, defaultValue: true, options: true },
  });
  for (const field of fields) {
    const data: Record<string, unknown> = {};
    const options = Array.isArray(field.options) ? field.options as { value?: unknown }[] : [];
    if (options.some((o) => o?.value === gone.url)) {
      data.options = options.filter((o) => o?.value !== gone.url);
    }
    if (field.defaultValue === gone.url) data.defaultValue = library[0]?.url ?? null;
    if (Object.keys(data).length) {
      await prisma.personalizationField.update({ where: { id: field.id }, data: data as never });
    }
  }

  // Kept on disk while an order still shows it: that plate was already agreed.
  await deleteFileIfUnreferenced(gone.url).catch(() => undefined);
  await deleteFileIfUnreferenced(gone.colour).catch(() => undefined);
  return library;
}

/** The questions exactly as the shop shows them: lettering started on the studio's face, symbols from the library. */
export async function servedFields<T extends SymbolField & { defaultValue: string | null }>(fields: T[], config: unknown): Promise<T[]> {
  return alignSymbols(alignLettering(fields, config), await listSymbols());
}

interface SymbolField {
  previewSlot: string | null;
  options: unknown;
}

/**
 * Offers the library on every symbol question that has not been given a list
 * of its own.
 *
 * Worked out each time the product is served, like the lettering, so a symbol
 * added to the library appears on every plate at once and a deleted one goes
 * from every plate at once. A question the studio gave its own short list
 * keeps that list.
 */
export function alignSymbols<T extends SymbolField>(fields: T[], symbols: PlateSymbol[]): T[] {
  if (!symbols.length) return fields;
  return fields.map((field) => {
    if (field.previewSlot !== 'logo') return field;
    const own = Array.isArray(field.options) ? field.options : [];
    if (own.length) return field;
    return { ...field, options: symbols.map((s) => ({ label: s.label, value: s.url })) };
  });
}
