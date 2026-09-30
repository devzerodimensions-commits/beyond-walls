/**
 * The brand colour system.
 *
 * One colour is chosen in Admin → Settings. Everything else -- hover, active,
 * tints, borders, focus rings, and the text that sits on top of each of them --
 * is derived from it here, and the same derivation feeds the storefront and the
 * admin so the two cannot drift apart.
 *
 * WHY OKLAB
 * Shading in HSL looks wrong: dropping lightness on a yellow turns it olive,
 * and the same lightness step is visually much larger on a blue than on a
 * green. OKLab is perceptually uniform, so one ramp works for every hue the
 * client might pick.
 *
 * WHY CONTRAST IS COMPUTED, NOT CHOSEN
 * The client can pick anything, including a pale yellow or a near-black. A
 * fixed "white text on the brand colour" rule would be unreadable for half of
 * those. Every pairing here is measured against WCAG and darkened or lightened
 * until it passes, so the result is legible whatever is chosen.
 */

export type Rgb = [number, number, number];

/* --- sRGB <-> linear ----------------------------------------------------- */

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '').trim();
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const part = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

/** True for anything we can parse as a six-or-three digit hex. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

/* --- OKLab --------------------------------------------------------------- */

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export function rgbToOklch([r, g, b]: Rgb): Oklch {
  const lr = toLinear(r / 255);
  const lg = toLinear(g / 255);
  const lb = toLinear(b / 255);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  return {
    l: L,
    c: Math.sqrt(A * A + B * B),
    h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  };
}

export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);

  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;

  const lr = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const lg = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const lb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;

  return [
    clamp(toSrgb(lr)) * 255,
    clamp(toSrgb(lg)) * 255,
    clamp(toSrgb(lb)) * 255,
  ];
}

/** Returns a new hex at the given OKLab lightness, keeping hue and chroma. */
function atLightness(base: Oklch, l: number, chromaScale = 1): string {
  return rgbToHex(oklchToRgb({ l: clamp(l, 0, 1), c: base.c * chromaScale, h: base.h }));
}

/* --- Contrast ------------------------------------------------------------ */

export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * toLinear(r / 255) + 0.7152 * toLinear(g / 255) + 0.0722 * toLinear(b / 255);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever is actually more readable on this colour. */
export function readableOn(hex: string): string {
  const bg = hexToRgb(hex);
  const onWhite = contrastRatio(bg, [255, 255, 255]);
  const onBlack = contrastRatio(bg, [17, 17, 17]);
  return onWhite >= onBlack ? '#FFFFFF' : '#111111';
}

/**
 * Walks a colour's lightness until it clears `target` contrast against `against`.
 *
 * This is what stops a pale brand colour becoming an unreadable link on white,
 * or a near-black one disappearing on a dark panel.
 */
function shiftUntilReadable(base: Oklch, against: Rgb, target: number, direction: -1 | 1): string {
  let l = base.l;
  for (let i = 0; i < 100; i += 1) {
    const hex = atLightness(base, l);
    if (contrastRatio(hexToRgb(hex), against) >= target) return hex;
    l = clamp(l + direction * 0.01, 0, 1);
    if (l === 0 || l === 1) break;
  }
  return atLightness(base, l);
}

/* --- The palette --------------------------------------------------------- */

export interface BrandPalette {
  /** The colour exactly as chosen. Fills buttons, active states, bars. */
  base: string;
  /** One step down, for hover on a filled control. */
  hover: string;
  /** Two steps down, for the pressed state. */
  active: string;
  /** Text that sits ON the base colour. Black or white, whichever reads. */
  ink: string;
  /** Darkened until it is readable as text on a light page: links, icons. */
  strong: string;
  /** Lightened until it is readable on a dark panel. */
  onDark: string;
  /** A pale wash of the hue: badges, highlights, selected rows. */
  soft: string;
  /** Barely tinted, for large fills that must not shout. */
  subtle: string;
  /** Text on `soft`. */
  softInk: string;
  /** A tinted border, stronger than the neutral hairline. */
  border: string;
  /** The equivalent of `soft` for a dark surface: a deep, low-chroma wash. */
  softDark: string;
  /** Text on `softDark`. */
  softDarkInk: string;
  /** Focus ring, as rgba so it can sit over anything. */
  ring: string;
}

/**
 * Builds the full palette from one colour.
 *
 * Every value is derived, so changing the one setting moves the whole system.
 */
export function buildBrandPalette(input: string): BrandPalette {
  const base = isHexColor(input) ? (input.startsWith('#') ? input : `#${input}`).toUpperCase() : '#0E7A57';
  const oklch = rgbToOklch(hexToRgb(base));

  /*
   * The ink is chosen from the base -- that is the state a button spends its
   * life in -- and the hover and pressed shades then move in whichever
   * direction that ink prefers.
   *
   * Convention says a button darkens on hover, but a mid-tone orange carrying
   * dark text gets LESS readable as it darkens: the two shades converge and the
   * label fades out under the pointer. Moving toward what the ink wants means
   * contrast can only improve, so one ink is safe for all three states. A pale
   * button therefore brightens slightly on hover, which reads just as well.
   */
  const ink = readableOn(base);
  const towardsLight = ink === '#111111';
  const step = (towardsLight ? 0.05 : -0.06);

  // Stop short of the ends, or a very light colour hovers to white and a very
  // dark one to black, and the state stops being visible at all.
  const bounded = (l: number) => Math.min(0.97, Math.max(0.12, l));

  const hover = atLightness(oklch, bounded(oklch.l + step));
  const active = atLightness(oklch, bounded(oklch.l + step * 2));

  const white: Rgb = [255, 255, 255];
  const darkPanel: Rgb = [21, 24, 30];

  return {
    base,
    hover,
    active,
    /*
     * One ink for all three filled shades, not one per shade.
     *
     * A button does not change its text colour when the pointer arrives, so the
     * choice has to hold for base, hover and pressed alike. Picking it from the
     * base alone put near-black on a mid orange and then let the hover shade
     * slide underneath it.
     */
    ink,

    // 4.5:1 is the AA threshold for body-size text, which is what a link is.
    strong: shiftUntilReadable(oklch, white, 4.5, -1),
    onDark: shiftUntilReadable(oklch, darkPanel, 4.5, 1),

    soft: atLightness(oklch, 0.95, 0.22),
    subtle: atLightness(oklch, 0.975, 0.12),
    softInk: shiftUntilReadable(oklch, hexToRgb(atLightness(oklch, 0.95, 0.22)), 4.5, -1),

    // A pale wash would be a bright block on a dark panel, so the dark themes
    // get their own tint built the same way from the other end of the scale.
    softDark: atLightness(oklch, 0.28, 0.35),
    softDarkInk: shiftUntilReadable(oklch, hexToRgb(atLightness(oklch, 0.28, 0.35)), 4.5, 1),
    border: atLightness(oklch, 0.86, 0.45),
    ring: `rgba(${hexToRgb(base).map(Math.round).join(', ')}, 0.28)`,
  };
}

/**
 * Writes the palette onto an element as custom properties.
 *
 * The storefront gets it on <html>; the admin shell gets it on its own root so
 * the two can never fight over the same declaration.
 */
export function applyBrandPalette(palette: BrandPalette, target: HTMLElement): void {
  const vars: Record<string, string> = {
    '--brand': palette.base,
    '--brand-hover': palette.hover,
    '--brand-active': palette.active,
    '--brand-ink': palette.ink,
    '--brand-strong': palette.strong,
    '--brand-on-dark': palette.onDark,
    '--brand-soft': palette.soft,
    '--brand-subtle': palette.subtle,
    '--brand-soft-ink': palette.softInk,
    '--brand-soft-dark': palette.softDark,
    '--brand-soft-dark-ink': palette.softDarkInk,
    '--brand-border': palette.border,
    '--brand-ring': palette.ring,
  };
  for (const [name, value] of Object.entries(vars)) target.style.setProperty(name, value);
}

/** The colours offered as one-click choices. Anything else can be typed. */
export const BRAND_PRESETS: { label: string; value: string }[] = [
  { label: 'Emerald', value: '#0E7A57' },
  { label: 'Blue', value: '#2563EB' },
  { label: 'Indigo', value: '#4F46E5' },
  { label: 'Purple', value: '#7C3AED' },
  { label: 'Red', value: '#DC2626' },
  { label: 'Orange', value: '#EA580C' },
  { label: 'Amber', value: '#D97706' },
  { label: 'Teal', value: '#0D9488' },
  { label: 'Rose', value: '#E11D48' },
  { label: 'Graphite', value: '#1C1B18' },
];

export const DEFAULT_BRAND_COLOR = '#0E7A57';
