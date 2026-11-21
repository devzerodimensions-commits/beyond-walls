import path from 'path';
import zlib from 'zlib';
import { nanoid } from 'nanoid';
import { persistUpload } from '../middleware/upload';
import { ApiError } from '../utils/http';
import { deleteFileIfUnreferenced } from './media.service';
import { getSetting, setSetting } from './settings.service';

/**
 * The studio's own lettering faces.
 *
 * The preview could only letter a plate in the faces the site shipped with.
 * A studio that cuts its nameplates in a face of its own -- "Yustine
 * Signature" on the cut-out -- could type the name in, but no customer has
 * that face installed, so every customer saw a stand-in. Uploading the font
 * file once puts the real face on every product that names it, now and later.
 *
 * Kept as one setting rather than a table: it is a short list, it needs no
 * migration to exist, and it travels to the shop with the rest of the
 * settings, which is how the storefront learns which faces to load.
 */

export const FONT_KINDS = ['script', 'serif', 'sans', 'display'] as const;
export type FontKind = (typeof FONT_KINDS)[number];

export interface UploadedFont {
  id: string;
  /** The family name the preview asks for. Products name their face by this. */
  family: string;
  /** Shown to the studio and, as a lettering choice, to customers. */
  label: string;
  url: string;
  format: 'woff2' | 'woff' | 'truetype' | 'opentype';
  /** Which shipped face stands in while it loads, or if it ever fails to. */
  kind: FontKind;
}

const KEY = 'preview.fonts';

export async function listFonts(): Promise<UploadedFont[]> {
  const raw = await getSetting<unknown>(KEY, []);
  return Array.isArray(raw) ? (raw as UploadedFont[]).filter((f) => f && f.family && f.url) : [];
}

const FORMAT: Record<string, UploadedFont['format']> = {
  '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'truetype', '.otf': 'opentype',
};

/**
 * The family name written inside the font file, when it can be read.
 *
 * TrueType and OpenType files keep it in their `name` table; WOFF is the same
 * tables, each compressed on its own. WOFF2 compresses them all as one stream
 * and is left to the file name, which the studio can correct.
 */
function readTable(buffer: Buffer, wanted: string): Buffer | null {
  const tag = buffer.toString('latin1', 0, 4);
  if (tag === 'wOFF') {
    const count = buffer.readUInt16BE(12);
    for (let i = 0; i < count; i += 1) {
      const at = 44 + i * 20;
      if (buffer.toString('latin1', at, at + 4) !== wanted) continue;
      const offset = buffer.readUInt32BE(at + 4);
      const compLength = buffer.readUInt32BE(at + 8);
      const origLength = buffer.readUInt32BE(at + 12);
      const slice = buffer.subarray(offset, offset + compLength);
      return compLength < origLength ? zlib.inflateSync(slice) : slice;
    }
  } else if (tag === 'OTTO' || tag === 'true' || buffer.readUInt32BE(0) === 0x00010000) {
    const count = buffer.readUInt16BE(4);
    for (let i = 0; i < count; i += 1) {
      const at = 12 + i * 16;
      if (buffer.toString('latin1', at, at + 4) !== wanted) continue;
      return buffer.subarray(buffer.readUInt32BE(at + 8), buffer.readUInt32BE(at + 8) + buffer.readUInt32BE(at + 12));
    }
  }
  return null;
}

/**
 * What kind of face the file says it is.
 *
 * Fonts classify themselves (PANOSE, in the OS/2 table): handwritten, or text
 * with or without serifs. Far better than guessing from the name, which called
 * Georgia a sans. Null when the file does not say.
 */
export function readKind(buffer: Buffer): FontKind | null {
  try {
    const os2 = readTable(buffer, 'OS/2');
    if (!os2 || os2.length < 42) return null;
    const family = os2[32];
    const serif = os2[33];
    if (family === 3) return 'script';
    if (family === 4) return 'display';
    if (family !== 2) return null;
    if (serif >= 11 && serif <= 13) return 'sans';
    if (serif >= 2 && serif <= 10) return 'serif';
    return null;
  } catch {
    return null;
  }
}

export function readFamilyName(buffer: Buffer): string | null {
  try {
    const table = readTable(buffer, 'name');
    if (!table) return null;

    const records = table.readUInt16BE(2);
    const strings = table.readUInt16BE(4);
    // Typographic family (16) first, then the legacy family (1); Windows Unicode, then Mac Roman.
    const found: Record<number, string> = {};
    for (let i = 0; i < records; i += 1) {
      const at = 6 + i * 12;
      const platform = table.readUInt16BE(at);
      const nameId = table.readUInt16BE(at + 6);
      if (nameId !== 1 && nameId !== 16) continue;
      const length = table.readUInt16BE(at + 8);
      const offset = strings + table.readUInt16BE(at + 10);
      const bytes = table.subarray(offset, offset + length);
      let text = '';
      if (platform === 3 || platform === 0) {
        for (let k = 0; k + 1 < bytes.length; k += 2) text += String.fromCharCode(bytes.readUInt16BE(k));
      } else if (platform === 1) {
        text = bytes.toString('latin1');
      }
      text = text.replace(/[^\p{L}\p{N} '&.-]/gu, '').trim();
      if (text && (!found[nameId] || platform === 3)) found[nameId] = text;
    }
    return found[16] || found[1] || null;
  } catch {
    return null;
  }
}

/** "YustineSignature-Regular.otf" -> "Yustine Signature". */
function nameFromFile(original: string): string {
  return path.basename(original, path.extname(original))
    .replace(/[-_ ](regular|book|normal|webfont|std|pro)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

/** A family name safe to put inside CSS quotes and to compare against. */
function cleanFamily(raw: string): string {
  return raw.replace(/["'\\;{}<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** What a face is from its name alone, for the stand-in. The studio can change it. */
export function guessKind(family: string): FontKind {
  const name = family.toLowerCase();
  if (/script|signature|hand|callig|brush|vibes|cursive/.test(name)) return 'script';
  if (/serif/.test(name) && !/sans/.test(name)) return 'serif';
  if (/display|poster|headline/.test(name)) return 'display';
  return 'sans';
}

export async function addFont(
  file: Express.Multer.File,
  options: { family?: string; kind?: string },
): Promise<UploadedFont[]> {
  const stored = await persistUpload(file, 'font', 'fonts');
  const family = cleanFamily(options.family || readFamilyName(file.buffer) || nameFromFile(file.originalname));
  if (!family) throw ApiError.badRequest('Give the font a name.');

  const kind = (FONT_KINDS as readonly string[]).includes(options.kind ?? '')
    ? (options.kind as FontKind)
    : readKind(file.buffer) ?? guessKind(family);
  const format = FORMAT[path.extname(file.originalname).toLowerCase()] ?? 'woff2';

  /*
   * One file per family. Uploading the same family again -- a better cut, the
   * WOFF2 after the TTF -- replaces it, and every product naming the family
   * follows without being touched.
   */
  const current = await listFonts();
  const replaced = current.filter((f) => f.family.toLowerCase() === family.toLowerCase());
  const next: UploadedFont[] = [
    ...current.filter((f) => f.family.toLowerCase() !== family.toLowerCase()),
    { id: replaced[0]?.id ?? nanoid(8), family, label: family, url: stored.url, format, kind },
  ];
  await setSetting(KEY, next);
  for (const old of replaced) await deleteFileIfUnreferenced(old.url).catch(() => undefined);
  return next;
}

export async function updateFont(id: string, patch: { label?: string; kind?: string }): Promise<UploadedFont[]> {
  const current = await listFonts();
  const next = current.map((f) => {
    if (f.id !== id) return f;
    const label = patch.label !== undefined ? cleanFamily(patch.label) || f.label : f.label;
    const kind = (FONT_KINDS as readonly string[]).includes(patch.kind ?? '') ? (patch.kind as FontKind) : f.kind;
    return { ...f, label, kind };
  });
  await setSetting(KEY, next);
  return next;
}

export async function removeFont(id: string): Promise<UploadedFont[]> {
  const current = await listFonts();
  const gone = current.find((f) => f.id === id);
  if (!gone) throw ApiError.notFound('That font is not in the library.');
  const next = current.filter((f) => f.id !== id);
  await setSetting(KEY, next);
  await deleteFileIfUnreferenced(gone.url).catch(() => undefined);
  return next;
}
