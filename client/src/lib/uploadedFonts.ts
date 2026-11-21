import { assetUrl } from './api';

/**
 * The studio's uploaded lettering faces, loaded once for the whole site.
 *
 * They arrive with the shop's settings. Each becomes an @font-face rule under
 * the family name products use, so a product set in "Yustine Signature" draws
 * in the real face for every customer instead of a stand-in. Kept outside
 * React because fontStack() is a plain function called from many places that
 * have no hook to hand.
 */

export type UploadedFontKind = 'script' | 'serif' | 'sans' | 'display';

export interface UploadedFont {
  id: string;
  family: string;
  label: string;
  url: string;
  format: 'woff2' | 'woff' | 'truetype' | 'opentype';
  kind: UploadedFontKind;
}

const STYLE_ID = 'bw-uploaded-fonts';
let registry: UploadedFont[] = [];
let signature = '';

/** Read defensively: it comes from a free-form setting. */
export function parseUploadedFonts(raw: unknown): UploadedFont[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (f): f is UploadedFont => !!f && typeof f.family === 'string' && typeof f.url === 'string' && !!f.family && !!f.url,
  );
}

export function applyUploadedFonts(raw: unknown): void {
  const fonts = parseUploadedFonts(raw);
  const next = JSON.stringify(fonts.map((f) => [f.family, f.url, f.kind, f.label]));
  if (next === signature) return;
  signature = next;
  registry = fonts;

  if (typeof document === 'undefined') return;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  const quote = (value: string) => value.replace(/["\\]/g, '');
  style.textContent = fonts
    .map((f) => `@font-face{font-family:"${quote(f.family)}";src:url("${quote(assetUrl(f.url))}") format("${f.format}");font-display:swap;}`)
    .join('\n');
}

export function uploadedFonts(): UploadedFont[] {
  return registry;
}

/** The uploaded face a product's setting names, matched by family or id. */
export function findUploadedFont(value: string): UploadedFont | undefined {
  const name = value.replace(/["']/g, '').split(',')[0].trim().toLowerCase();
  return registry.find((f) => f.family.toLowerCase() === name || f.id === value);
}
