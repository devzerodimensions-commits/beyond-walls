import { useEffect, useId, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { PersonalizationField } from '../../lib/types';
import { assetUrl } from '../../lib/api';
import { useSettings } from '../../context/StoreProvider';
import { CubeBand, LeafFrame, VINE_PALETTE, VineBand } from './plateOrnaments';

/**
 * Live nameplate preview.
 *
 * Personalization fields are bound to preview "slots" in the admin panel
 * (previewSlot = number | line1 | line2 | line3 | fontFamily | textColor |
 * plateColor | logo). This component reads the customer's current answers and
 * renders the plate as SVG, so the preview always reflects the real inputs
 * rather than a hard-coded mock.
 */

export interface PreviewSlots {
  number?: string;
  line1?: string;
  line2?: string;
  line3?: string;
  fontFamily?: string;
  textColor?: string;
  plateColor?: string;
  logo?: string;
}

/**
 * The lettering a customer can choose for their plate.
 *
 * This is the one list: the admin's font picker is built from it, and the
 * preview renders from it. Adding a face here is all it takes for it to appear
 * as an option and to draw correctly — previously the admin could type any
 * font name and the preview would quietly ignore it.
 *
 * Every built-in face is loaded in styles/index.css. Admins may also provide a
 * custom CSS family/stack; the first built-in face remains the final fallback.
 */
export interface PlateFont {
  id: string;
  label: string;
  stack: string;
  /** A word or two about where it suits, shown to the admin. */
  note: string;
}

export const PLATE_FONTS: PlateFont[] = [
  {
    id: 'grotesque',
    label: 'Grotesque',
    stack: '"Space Grotesk", "Archivo", "Inter", system-ui, sans-serif',
    note: 'Clean and modern. The default.',
  },
  {
    id: 'display',
    label: 'Display',
    stack: '"Clash Display", "Archivo", system-ui, sans-serif',
    note: 'The Beyond Walls face — confident, architectural.',
  },
  {
    id: 'serif',
    label: 'Serif',
    stack: '"Playfair Display", Georgia, "Times New Roman", serif',
    note: 'Traditional and formal. Suits bungalows and chambers.',
  },
  {
    id: 'condensed',
    label: 'Condensed',
    stack: '"Archivo Narrow", "Archivo", system-ui, sans-serif',
    note: 'Narrow — fits a long name on a small plate.',
  },
  {
    id: 'mono',
    label: 'Technical',
    stack: '"JetBrains Mono", ui-monospace, monospace',
    note: 'Even spacing. Reads as industrial or wayfinding.',
  },
  {
    id: 'script',
    label: 'Script',
    stack: '"Great Vibes", "Segoe Script", cursive',
    note: 'Flowing and decorative, like the Rasik Vatika sign.',
  },
  /*
   * The three faces below came with the botanical, vine and cube designs.
   *
   * Two of them are named twice on purpose. The studio supplied Avenir and
   * Canto, which are licensed fonts: a webfont licence is sold separately from
   * a desktop one, and serving the file from the site is the part a desktop
   * licence does not cover. So each stack asks for the real face first -- a
   * visitor who has it installed, which on a Mac means Avenir, sees exactly the
   * artwork -- and falls back to the closest face we may legitimately serve.
   * Drop a licensed woff2 into styles/ and add one @font-face to switch
   * everyone over; nothing here needs to change.
   */
  {
    id: 'geometric',
    label: 'Geometric',
    stack: '"Avenir Next", "Avenir", "Jost", "Montserrat", system-ui, sans-serif',
    note: 'Light, wide, geometric. The lettering on the botanical frame.',
  },
  {
    id: 'devanagari',
    label: 'Devanagari',
    stack: '"Yatra One", "Tiro Devanagari Marathi", "Noto Serif Devanagari", Georgia, serif',
    note: 'Draws Marathi and Hindi names. Also covers Latin and numerals.',
  },
  {
    id: 'formal-script',
    label: 'Formal script',
    stack: '"Petit Formal Script", "Canto", "Great Vibes", cursive',
    note: 'Upright, formal handwriting. Steadier than Script.',
  },
];

const FONT_STACKS: Record<string, string> = Object.fromEntries(
  PLATE_FONTS.map((font) => [font.id, font.stack]),
);

const PLATE_FONT_STYLESHEET_ID = 'bw-plate-fonts';
export const PLATE_FONT_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Archivo+Narrow:wght@400;500;600;700&family=Inter:wght@300;400;500;600&family=Playfair+Display:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Great+Vibes&family=Jost:wght@300;400;500&family=Petit+Formal+Script&family=Yatra+One&display=swap';

function usePlateFonts() {
  useEffect(() => {
    if (document.getElementById(PLATE_FONT_STYLESHEET_ID)) return;
    const link = document.createElement('link');
    link.id = PLATE_FONT_STYLESHEET_ID;
    link.rel = 'stylesheet';
    link.href = PLATE_FONT_STYLESHEET;
    document.head.appendChild(link);
  }, []);
}

/** The stack for a chosen font, falling back to the default rather than nothing. */
export function fontStack(id: string | undefined | null): string {
  const value = id?.trim();
  if (!value) return PLATE_FONTS[0].stack;
  if (FONT_STACKS[value]) return FONT_STACKS[value];

  // Admins may enter a custom CSS family/stack for a product. Keep a dependable
  // loaded face at the end so the preview remains readable when that custom
  // font is not installed in the customer's browser.
  return `${value}, ${PLATE_FONTS[0].stack}`;
}

const COLOR_MAP: Record<string, string> = {
  black: '#111111',
  white: '#F7F6F4',
  ink: '#111111',
  steel: '#C9CCD1',
  brass: '#C8A961',
};

/**
 * A colour, which may be a hex, a built-in name, or one this product invented.
 *
 * The built-in names are the ones every plate shares -- black, white, brass.
 * A product that sells its own finishes names them in its own palette, and
 * those names were resolving to nothing: a plate whose default was written as
 * "forest" fell through to the fallback and drew in white, on a design whose
 * whole point was that the lettering is the product. So the product's own
 * list is asked first, and the shared names only after.
 */
function resolveColor(
  value: string | undefined,
  fallback: string,
  palette?: { value: string; hex: string }[],
): string {
  if (!value) return fallback;
  if (value.startsWith('#')) return value;
  const named = value.toLowerCase();
  const own = palette?.find((entry) => entry.value.toLowerCase() === named);
  return own?.hex ?? COLOR_MAP[named] ?? fallback;
}

/** Reads the customer's answers into preview slots using the field bindings. */
export function buildPreviewSlots(
  fields: PersonalizationField[],
  values: Record<string, string>,
): PreviewSlots {
  const slots: PreviewSlots = {};

  for (const field of fields) {
    if (!field.previewSlot) continue;
    const raw = values[field.key];
    if (raw === undefined || raw === '') continue;

    // For option-driven fields, prefer the option's hex over its value.
    if ((field.type === 'COLOR' || field.type === 'FONT') && field.options?.length) {
      const option = field.options.find((o) => o.value === raw);
      const resolved = field.type === 'COLOR' ? (option?.hex ?? raw) : raw;
      (slots as Record<string, string>)[field.previewSlot] = resolved;
      continue;
    }

    (slots as Record<string, string>)[field.previewSlot] = raw;
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Per-product configuration
// ---------------------------------------------------------------------------

/**
 * Everything about the preview that an admin can change for one product.
 *
 * The template chosen on the product supplies the starting point (see
 * PREVIEW_PRESETS); anything stored in the product's `livePreviewConfig`
 * overrides it. Unknown keys are ignored, so new options can be added without
 * a migration and older products keep rendering.
 */
export interface PreviewConfig {
  /** Plate proportions, as a viewBox. */
  aspect: { width: number; height: number };
  plate: {
    inset: number;
    radius: number;
    showScrews: boolean;
    /** Draws an edge so a light plate stays visible on a light backdrop. */
    borderOnLight: boolean;
  };
  defaults: {
    plateColor: string;
    textColor: string;
    fontFamily: string;
  };
  /** Shown before the customer has typed anything. Never sent to production. */
  placeholders: PreviewSlots;
  /** Colour choices offered when a field has no options of its own. */
  palette: {
    plate: { value: string; label: string; hex: string }[];
    text: { value: string; label: string; hex: string }[];
  };
  /** The line under the preview. Keep it honest — it is a promise to a customer. */
  caption: string;
  /**
   * Set only on a plate built from a photograph of the piece.
   *
   * The image is the piece with its sample name painted out, and each box is
   * where one of those names sat, as a fraction of the picture so it survives
   * any resize. Normally written by the server when it reads a photograph,
   * but every value is the studio's to correct afterwards: reading a picture
   * is a judgement, and the one place that judgement cannot be checked is on
   * the server that made it.
   */
  photo?: PreviewPhoto;
}

/** Where one line of writing sits on a photographed plate. */
export interface PreviewPhotoBox {
  slot: keyof PreviewSlots;
  /** Top of the lettering, as a fraction of the picture's height. */
  y: number;
  /** Height of the lettering — the design's own type size for this line. */
  h: number;
  align: 'left' | 'center' | 'right';
  /** The point the line is set from: its left edge, centre or right edge. */
  anchor: number;
  /** Clear plate available from that anchor. A limit, not a target. */
  room: number;
}

export interface PreviewPhoto {
  /** The plate with its sample lettering removed. */
  image: string;
  boxes: PreviewPhotoBox[];
}

const BASE_CONFIG: PreviewConfig = {
  aspect: { width: 600, height: 300 },
  plate: { inset: 30, radius: 6, showScrews: true, borderOnLight: true },
  defaults: { plateColor: 'black', textColor: 'white', fontFamily: 'grotesque' },
  placeholders: { line1: 'YOUR NAME' },
  palette: {
    plate: [
      { value: 'black', label: 'Black', hex: '#111111' },
      { value: 'white', label: 'White', hex: '#F7F6F4' },
      { value: 'steel', label: 'Steel', hex: '#C9CCD1' },
      { value: 'brass', label: 'Brass', hex: '#C8A961' },
    ],
    text: [
      { value: 'white', label: 'White', hex: '#F7F6F4' },
      { value: 'black', label: 'Black', hex: '#111111' },
      { value: 'brass', label: 'Brass', hex: '#C8A961' },
    ],
  },
  caption: 'Indicative preview. Final artwork is confirmed with you before production.',
};

/** The shipped templates, expressed as configuration. */
export const PREVIEW_PRESETS: Record<string, Partial<PreviewConfig>> = {
  /*
   * The empty plate shows a number as well as a name.
   *
   * With only "YOUR NAME" on it, the preview filled the whole plate with one
   * line and never showed what the plate is actually for. The studio asked for
   * the two-line arrangement to be what you see before typing, so the shape of
   * the thing is obvious the moment the page loads.
   *
   * Both strings are placeholders in the strict sense: drawn, never submitted,
   * and replaced by the first character typed into either field.
   */
  'nameplate-minimal': {
    placeholders: { number: 'A 01', line1: 'YOUR NAME' },
  },
  'nameplate-classic': {
    plate: { inset: 30, radius: 4, showScrews: false, borderOnLight: true },
    placeholders: { line1: 'Your Name' },
  },
  'desk-plate': {
    plate: { inset: 30, radius: 3, showScrews: false, borderOnLight: true },
    defaults: { plateColor: 'brass', textColor: 'black', fontFamily: 'serif' },
    placeholders: { line1: 'Your Name', line2: 'Designation' },
  },
  'sign-square': {
    aspect: { width: 400, height: 420 },
    plate: { inset: 30, radius: 8, showScrews: false, borderOnLight: false },
    defaults: { plateColor: 'black', textColor: 'white', fontFamily: 'grotesque' },
    placeholders: { line1: 'SIGN TEXT' },
  },

  /*
   * The three decorated designs.
   *
   * Each carries its own typeface as a default rather than leaving the house
   * grotesque on it: the ornament and the lettering were drawn together, and a
   * flowering Marathi plate set in Space Grotesk is not the thing the studio
   * sells. A customer who is offered a font field still overrides it.
   *
   * Their placeholders show two names, because that is the arrangement these
   * designs exist for and an empty one should say so before anybody types.
   */
  'plate-botanical': {
    aspect: { width: 860, height: 645 },
    plate: { inset: 0, radius: 4, showScrews: false, borderOnLight: false },
    defaults: { plateColor: '#4A4D50', textColor: '#FFFFFF', fontFamily: 'geometric' },
    placeholders: { line1: 'FIRST NAME', line2: 'SECOND NAME' },
  },
  'plate-vine': {
    aspect: { width: 1020, height: 685 },
    plate: { inset: 0, radius: 0, showScrews: false, borderOnLight: false },
    // The plate colour is the cream ground of the artwork and is not offered as
    // a choice; see VINE_PALETTE for why this design keeps its own colours.
    defaults: { plateColor: '#F7F3EA', textColor: '#33302C', fontFamily: 'devanagari' },
    placeholders: { line1: 'आडनाव', line2: 'नाव | नाव', number: 'B -102' },
  },
  'plate-cubes': {
    aspect: { width: 860, height: 641 },
    plate: { inset: 0, radius: 4, showScrews: false, borderOnLight: false },
    defaults: { plateColor: '#4A4D50', textColor: '#FFFFFF', fontFamily: 'formal-script' },
    placeholders: { number: 'A 105', line1: 'First name', line2: '& Second name' },
  },
  /*
   * There is no plate here, so there is no plate colour worth offering: the
   * lettering is the product and its finish is the only choice a customer
   * actually makes. The plate list is left with the one entry the wall stands
   * for, rather than offering colours for a panel that does not exist.
   */
  'script-cut': {
    aspect: { width: 500, height: 180 },
    plate: { inset: 0, radius: 0, showScrews: false, borderOnLight: false },
    defaults: { plateColor: '#F2EFE9', textColor: '#1C1C1C', fontFamily: 'script' },
    placeholders: { line1: 'Your name', number: 'A 101' },
    palette: {
      plate: [{ value: 'wall', label: 'Wall', hex: '#F2EFE9' }],
      text: [
        { value: 'black', label: 'Black', hex: '#1C1C1C' },
        { value: 'forest', label: 'Forest', hex: '#1F3B2E' },
        { value: 'ivory', label: 'Ivory', hex: '#EFE4CE' },
      ],
    },
  },
};

/** Deep-merges the preset for `template` and the product's stored overrides. */
export function resolvePreviewConfig(
  template: string | null | undefined,
  stored: Record<string, unknown> | null | undefined,
): PreviewConfig {
  const preset = PREVIEW_PRESETS[template ?? ''] ?? {};
  const overrides = (stored ?? {}) as Partial<PreviewConfig>;

  return {
    aspect: { ...BASE_CONFIG.aspect, ...preset.aspect, ...overrides.aspect },
    plate: { ...BASE_CONFIG.plate, ...preset.plate, ...overrides.plate },
    defaults: { ...BASE_CONFIG.defaults, ...preset.defaults, ...overrides.defaults },
    placeholders: { ...BASE_CONFIG.placeholders, ...preset.placeholders, ...overrides.placeholders },
    palette: {
      plate: overrides.palette?.plate ?? preset.palette?.plate ?? BASE_CONFIG.palette.plate,
      text: overrides.palette?.text ?? preset.palette?.text ?? BASE_CONFIG.palette.text,
    },
    caption: overrides.caption ?? preset.caption ?? BASE_CONFIG.caption,
    // Only ever comes from the product: it is measurements taken off that
    // product's own photograph, so there is no base or preset to fall back to.
    photo: overrides.photo,
  };
}

/**
 * The script this product is lettered in.
 *
 * Two things can say so, and either is enough: the design was given the
 * Devanagari face, or the sample name read off the artwork is in Devanagari.
 * The second matters because the photograph reader fills the placeholders
 * from the piece itself, so a Marathi nameplate announces its own script
 * before anyone has chosen a font for it.
 *
 * What it decides is whether the customer is asked to type Devanagari with no
 * keyboard for it -- see ScriptInput.
 */
export function previewScript(config: PreviewConfig): 'latin' | 'devanagari' {
  if (config.defaults.fontFamily === 'devanagari') return 'devanagari';
  const sample = [
    config.placeholders.line1, config.placeholders.line2, config.placeholders.line3,
  ].filter(Boolean).join('');
  return /[ऀ-ॿ]/.test(sample) ? 'devanagari' : 'latin';
}

/**
 * How much bigger or smaller a customer may set a line.
 *
 * Bounded, and bounded tightly. The lettering is already sized from the real
 * artwork, so every step away from 100% is a step away from the piece as the
 * studio drew it -- this exists because a long surname can come out smaller
 * than somebody wants, not so a plate can be redesigned on the product page.
 *
 * Whatever is chosen travels with the order, so the studio cuts the size that
 * was approved rather than guessing which one the customer meant.
 */
export const TEXT_SIZES = [80, 90, 100, 110, 125] as const;
export const DEFAULT_TEXT_SIZE = 100;

/** The slots a customer can resize: the lines, never the colours or the face. */
export const SIZEABLE_SLOTS = ['number', 'line1', 'line2', 'line3'];

interface LivePreviewProps {
  template?: string | null;
  slots: PreviewSlots;
  className?: string;
  /** Hidden where something outside the frame already names it. */
  hideLabel?: boolean;
  /**
   * Drops the line under the plate.
   *
   * That line promises a customer their artwork will be confirmed before
   * production, which is true on a product page and meaningless on a row of
   * thumbnails in Settings -- there it is a promise repeated seven times to
   * the person making it.
   */
  hideCaption?: boolean;
  /**
   * Placeholder copy shown before the customer has typed anything. Overrides
   * the placeholders that come from the product's configuration.
   */
  placeholders?: PreviewSlots;
  /**
   * Per-line size, as a percentage, where 100 is the artwork's own size.
   * Missing or 100 means the line is drawn exactly as the piece has it.
   */
  scales?: Record<string, number>;
  /** The product's stored `livePreviewConfig`. */
  config?: Record<string, unknown> | null;
}

export function LivePreview({
  template, slots, className, placeholders, config, hideLabel, hideCaption, scales,
}: LivePreviewProps) {
  usePlateFonts();
  // Namespaces this instance's SVG defs so two previews on one page cannot
  // steal each other's filters and gradients.
  const uid = useId().replace(/:/g, '');
  const resolved = useMemo(() => resolvePreviewConfig(template, config), [template, config]);

  const merged = useMemo<PreviewSlots>(() => {
    const fallback = { ...resolved.placeholders, ...placeholders };
    return {
      number: slots.number || fallback.number || '',
      line1: slots.line1 || fallback.line1 || '',
      line2: slots.line2 || fallback.line2 || '',
      line3: slots.line3 || fallback.line3 || '',
      fontFamily: slots.fontFamily || fallback.fontFamily || resolved.defaults.fontFamily,
      textColor: slots.textColor || fallback.textColor || resolved.defaults.textColor,
      plateColor: slots.plateColor || fallback.plateColor || resolved.defaults.plateColor,
      logo: slots.logo || fallback.logo || '',
    };
  }, [slots, placeholders, resolved]);

  const plate = resolveColor(merged.plateColor, '#111111', resolved.palette.plate);
  const text = resolveColor(merged.textColor, '#FFFFFF', resolved.palette.text);
  const font = fontStack(merged.fontFamily);

  // A light plate needs a visible edge against the light backdrop.
  const isLightPlate = resolved.plate.borderOnLight && isLight(plate);

  const shared = { slots: merged, plate, text, font, config: resolved, uid, scales };

  const body = (() => {
    switch (template) {
      case 'script-cut':
        return <ScriptCut {...shared} />;
      case 'photo':
        return <PlatePhoto {...shared} />;
      case 'plate-botanical':
        return <PlateBotanical {...shared} />;
      case 'plate-vine':
        return <PlateVine {...shared} />;
      case 'plate-cubes':
        return <PlateCubes {...shared} />;
      case 'sign-square':
        return <SignSquare {...shared} />;
      case 'desk-plate':
        return <DeskPlate {...shared} />;
      case 'nameplate-classic':
        return <NameplateClassic {...shared} />;
      case 'nameplate-minimal':
      default:
        return <NameplateMinimal {...shared} isLight={isLightPlate} />;
    }
  })();

  return (
    <div className={clsx('relative w-full bg-paper-warm p-6 sm:p-10', className)}>
      {hideLabel ? null : (
        <span className="eyebrow absolute left-4 top-4 text-ink-300">Live preview</span>
      )}
      {/*
        * Marked so the plate can be found again.
        *
        * Saving the preview has to pick the drawing out of the page, and
        * "the first svg inside" is not it: an icon anywhere above it wins,
        * and what gets saved is a 24-pixel glyph. The drawing says which one
        * it is rather than leaving the saver to guess.
        */}
      <div data-plate="">{body}</div>
      {resolved.caption && !hideCaption ? (
        <p className="mt-4 text-center text-2xs text-ink-400">{resolved.caption}</p>
      ) : null}
    </div>
  );
}

/** Relative luminance, so "is this plate light?" is not a string comparison. */
function isLight(hex: string): boolean {
  const value = hex.replace('#', '');
  if (value.length !== 6) return false;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.65;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

interface TemplateProps {
  slots: PreviewSlots;
  plate: string;
  text: string;
  font: string;
  config: PreviewConfig;
  isLight?: boolean;
  /**
   * Unique per rendered preview.
   *
   * More than one preview can share a page: the product page has one beside
   * the photograph and another inside the phone sheet. SVG ids are global, so
   * fixed ids made every url(#...) resolve to the FIRST definition in the
   * document. That first copy sat in a display:none container, so it had no
   * size, its filter region collapsed, and every filtered shape vanished --
   * the plate disappeared and only the unfiltered screws were left showing.
   */
  uid: string;
  /** Per-line size as a percentage; see TEXT_SIZES. */
  scales?: Record<string, number>;
}

/**
 * Matches the supplied product: number top-right, rule, name lines below.
 *
 * ---- The plate never changes size. The lettering does. ----
 *
 * A first attempt cut the plate down to whatever was in it, because a name on
 * its own left the top half black and empty. The studio stopped that straight
 * away, and they were right: a nameplate is a manufactured object bought in a
 * size, so a preview whose proportions move as you type is showing you
 * something you cannot order. Their instruction was to change the size of the
 * text, not the plate.
 *
 * So the rows are measured, and then the whole block of lettering is scaled to
 * fill the plate: up when there is little to say, down when there is a lot. An
 * empty plate is no longer mostly black, a fourth line costs nothing, and the
 * outline stays exactly as it was in every case.
 *
 * The scale is whichever of three limits bites first -- the height between the
 * margins, the width of the rule, or a ceiling that stops two words becoming a
 * billboard.
 */
function NameplateMinimal({ slots, plate, text, font, config, isLight, uid }: TemplateProps) {
  const number = (slots.number ?? '').toUpperCase();
  const name = (slots.line1 ?? '').toUpperCase();
  const family = (slots.line2 ?? '').toUpperCase();
  const detail = (slots.line3 ?? '').toUpperCase();

  const { width: vw, height: vh } = config.aspect;
  const inset = config.plate.inset;
  const plateW = vw - inset * 2;
  const plateH = vh - inset * 2;
  const right = vw - inset - 40;
  const ruleLeft = inset + 58;

  /** Steps a size down as the text lengthens, so one long line cannot shrink the rest. */
  const fit = (value: string, [big, mid, small]: [number, number, number]) =>
    value.length > 22 ? small : value.length > 16 ? mid : big;

  const PAD = 30;
  const RULE_ABOVE = 20;
  const RULE_BELOW = 28;
  const LINE_GAP = 12;
  /** Two short words should fill the plate, not become a billboard. */
  const MAX_SCALE = 1.5;
  /** Advance width of a capital in these faces, as a fraction of the size. */
  const CAP_WIDTH = 0.62;

  interface TextRow {
    text: string;
    size: number;
    weight: number;
    spacing: number;
    y: number;
  }

  const rows: TextRow[] = [];
  let y = 0;

  if (number) {
    const size = fit(number, [56, 46, 38]);
    rows.push({ text: number, size, weight: 600, spacing: 2, y: y + size * 0.78 });
    y += size * 0.92 + RULE_ABOVE;
  }

  // The rule is the spine of the plate, and with no number above it the block
  // simply starts here.
  const ruleY = y;
  y += RULE_BELOW;

  const lines = [
    name && { text: name, size: fit(name, [32, 26, 22]), weight: 500, spacing: 1.5 },
    family && { text: family, size: fit(family, [28, 24, 20]), weight: 500, spacing: 1.5 },
    detail && { text: detail, size: fit(detail, [22, 20, 18]), weight: 400, spacing: 2 },
  ].filter(Boolean) as { text: string; size: number; weight: number; spacing: number }[];

  lines.forEach((line, index) => {
    if (index) y += LINE_GAP;
    rows.push({ ...line, y: y + line.size * 0.78 });
    y += line.size * 0.92;
  });

  const contentH = y;
  const contentW = rows.reduce(
    (widest, row) =>
      Math.max(widest, row.text.length * row.size * CAP_WIDTH + Math.max(0, row.text.length - 1) * row.spacing),
    0,
  );

  const ruleSpan = right - ruleLeft;
  const scale = Math.min(
    (plateH - PAD * 2) / contentH,
    contentW ? ruleSpan / contentW : Number.POSITIVE_INFINITY,
    MAX_SCALE,
  );

  const blockTop = inset + (plateH - contentH * scale) / 2;
  const ruleAtY = blockTop + ruleY * scale;

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} className="mx-auto block w-full max-w-lg" role="img" aria-label="Nameplate preview">
      <defs>
        <linearGradient id={`sheen-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.10" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.06" />
        </linearGradient>
        <filter id={`shadow-${uid}`} x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#111111" floodOpacity="0.18" />
        </filter>
      </defs>

      <rect
        x={inset} y={inset} width={plateW} height={plateH} rx={config.plate.radius}
        fill={plate}
        stroke={isLight ? '#D9D6D0' : 'none'}
        strokeWidth={isLight ? 1 : 0}
        filter={`url(#shadow-${uid})`}
      />
      <rect
        x={inset} y={inset} width={plateW} height={plateH} rx={config.plate.radius}
        fill={`url(#sheen-${uid})`}
      />

      {/*
        The fixings sit on the rule rather than at the plate's midpoint, so the
        line always runs from one to the other however the block has settled.
      */}
      {config.plate.showScrews ? (
        <>
          <circle cx={inset + 26} cy={ruleAtY} r="6" fill="#A8A8A8" />
          <circle cx={inset + 26} cy={ruleAtY} r="2.4" fill="#787878" />
          <circle cx={vw - inset - 26} cy={ruleAtY} r="6" fill="#A8A8A8" />
          <circle cx={vw - inset - 26} cy={ruleAtY} r="2.4" fill="#787878" />
        </>
      ) : null}

      {slots.logo ? (
        <image
          href={assetUrl(slots.logo)}
          x={inset + 40} y={inset + 24} height="52" width="120"
          preserveAspectRatio="xMinYMid meet"
        />
      ) : null}

      {/* Drawn at full width and full weight: the rule is part of the plate, not of the lettering. */}
      <line x1={ruleLeft} y1={ruleAtY} x2={right} y2={ruleAtY} stroke={text} strokeWidth="3" strokeLinecap="square" />

      {/*
        Laid out against x=0 as the right margin, so one transform both places
        the block and scales it without disturbing the alignment.
      */}
      <g transform={`translate(${right} ${blockTop}) scale(${scale})`}>
        {rows.map((row, index) => (
          <text
            key={index}
            x={0} y={row.y} textAnchor="end"
            fill={text} fontFamily={font}
            fontSize={row.size} fontWeight={row.weight} letterSpacing={row.spacing}
          >
            {row.text}
          </text>
        ))}
      </g>
    </svg>
  );
}

/*
 * The framed plate fills the shape it is given, rather than being fitted into
 * it. A plate is the product, so when a product is set to a long, shallow
 * shape the plate has to be long and shallow -- leaving it at its drawn 2:1
 * and centring it would show the customer the wrong piece. Only the lettering
 * is scaled as a block, so the type never stretches.
 */
function NameplateClassic({ slots, plate, text, font, config, uid }: TemplateProps) {
  const { width: vw, height: vh } = config.aspect;
  const padX = vw * 0.05;
  const padY = vh * 0.1333;
  const pw = vw - padX * 2;
  const ph = vh - padY * 2;
  const rule = Math.min(pw, ph) * 0.0818;

  // The lettering keeps the proportions it was drawn in and is centred on the
  // plate; 540x220 is the plate it was drawn against.
  const scale = Math.min(pw / 540, ph / 220);
  const block = `translate(${(padX + pw / 2).toFixed(2)} ${(padY + ph / 2).toFixed(2)})`
    + ` scale(${scale.toFixed(5)}) translate(-270 -110)`;

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} className="mx-auto block w-full max-w-lg" role="img" aria-label="Nameplate preview">
      <defs>
        <filter id={`shadow-${uid}`} x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#111111" floodOpacity="0.18" />
        </filter>
      </defs>
      <rect x={padX} y={padY} width={pw} height={ph} rx={config.plate.radius} fill={plate} filter={`url(#shadow-${uid})`} />
      <rect
        x={padX + rule} y={padY + rule} width={pw - rule * 2} height={ph - rule * 2}
        rx="2" fill="none" stroke={text} strokeWidth="1.5" opacity="0.5"
      />

      <g transform={block}>
        {slots.number ? (
          <text x="270" y="72" textAnchor="middle" fill={text} fontFamily={font} fontSize="26" letterSpacing="6">
            {slots.number.toUpperCase()}
          </text>
        ) : null}

        <text
          x="270" y={slots.number ? 126 : 110} textAnchor="middle"
          fill={text} fontFamily={font} fontSize={(slots.line1 ?? '').length > 18 ? 30 : 38} letterSpacing="2"
        >
          {(slots.line1 ?? '').toUpperCase()}
        </text>

        {slots.line2 ? (
          <text
            x="270" y={slots.number ? 168 : 154} textAnchor="middle"
            fill={text} fontFamily={font} fontSize="24" letterSpacing="4" opacity="0.85"
          >
            {slots.line2.toUpperCase()}
          </text>
        ) : null}
      </g>
    </svg>
  );
}

/*
 * A desk plate is fitted rather than filled: the wedge it stands on is part of
 * the design, so the whole composition keeps its proportions and sits centred
 * in whatever shape the product is set to.
 */
function DeskPlate({ slots, plate, text, font, config, uid }: TemplateProps) {
  const { viewBox, transform } = fitDesign(config, 600, 300);
  return (
    <svg viewBox={viewBox} className="mx-auto block w-full max-w-lg" role="img" aria-label="Desk plate preview">
      <defs>
        <filter id={`shadow-${uid}`} x="-10%" y="-10%" width="120%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#111111" floodOpacity="0.2" />
        </filter>
      </defs>
      <g transform={transform}>
      {/* Wedge base */}
      <path d="M60 240 L540 240 L560 268 L40 268 Z" fill="#8A8A8A" />
      <rect x="70" y="80" width="460" height="160" rx={config.plate.radius} fill={plate} filter={`url(#shadow-${uid})`} />

      <text
        x="300" y="150" textAnchor="middle"
        fill={text} fontFamily={font} fontSize={(slots.line1 ?? '').length > 20 ? 28 : 34} fontWeight="600" letterSpacing="1"
      >
        {(slots.line1 ?? '').toUpperCase()}
      </text>
      {slots.line2 ? (
        <text x="300" y="186" textAnchor="middle" fill={text} fontFamily={font} fontSize="20" letterSpacing="3" opacity="0.8">
          {slots.line2.toUpperCase()}
        </text>
      ) : null}
      {slots.line3 ? (
        <text x="300" y="214" textAnchor="middle" fill={text} fontFamily={font} fontSize="16" letterSpacing="2" opacity="0.65">
          {slots.line3}
        </text>
      ) : null}
      </g>
    </svg>
  );
}

/*
 * The square sign is fitted rather than filled: the board and the caption
 * panel beneath it are one piece, and a square sign stays square whatever
 * shape the frame around it is set to.
 */
function SignSquare({ slots, plate, text, font, config, uid }: TemplateProps) {
  const { viewBox, transform } = fitDesign(config, 400, 420);
  return (
    <svg viewBox={viewBox} className="mx-auto block w-full max-w-xs" role="img" aria-label="Sign preview">
      <defs>
        <filter id={`shadow-${uid}`} x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#111111" floodOpacity="0.18" />
        </filter>
      </defs>
      <g transform={transform}>
      <rect x="30" y="20" width="340" height="380" rx={config.plate.radius} fill="#FFFFFF" filter={`url(#shadow-${uid})`} />
      <path d="M30 28a8 8 0 0 1 8-8h324a8 8 0 0 1 8 8v272H30Z" fill={plate} />

      {slots.logo ? (
        <image href={assetUrl(slots.logo)} x="90" y="70" width="220" height="180" preserveAspectRatio="xMidYMid meet" />
      ) : (
        <text x="200" y="180" textAnchor="middle" fill={text} fontFamily={font} fontSize="80" opacity="0.5">
          ⃠
        </text>
      )}

      <text
        x="200" y="356" textAnchor="middle"
        fill="#111111" fontFamily={font} fontSize={(slots.line1 ?? '').length > 12 ? 28 : 36} fontWeight="700" letterSpacing="1"
      >
        {(slots.line1 ?? '').toUpperCase()}
      </text>
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The decorated designs
// ---------------------------------------------------------------------------

/**
 * The size at which one line fills `room`, never larger than `max`.
 *
 * The three designs below all have a fixed opening for their lettering -- the
 * window inside a frame, or the half of the plate the ornament leaves -- so the
 * type has to come down to meet a long name rather than the plate growing to
 * take it. Same rule the studio set for the minimal nameplate, applied line by
 * line here because these designs set their lines at different sizes.
 */
/**
 * Real text metrics, measured in the browser rather than estimated.
 *
 * The drawn templates each fix their own typeface, so a measured constant per
 * template was enough. A plate taken from a photograph fixes nothing: any of
 * the faces, in any script, in a box whose size came off the artwork. A
 * constant that is a little low is exactly what pushed a name off the edge of
 * the cube plate once already, and no single constant can be right for Latin
 * capitals and for Devanagari at the same time.
 *
 * So the browser is asked. Everything is measured at 100px and returned as a
 * fraction of the font size, which is what the caller needs to invert.
 */
interface TextMetrics {
  /** Width of the string, as a multiple of the font size. */
  width: number;
  /** Height of the marks themselves, ascender to descender. */
  ink: number;
  /** How far the top of the marks sits above the baseline. */
  ascent: number;
}

/** Conservative enough to stay inside a box when nothing can be measured. */
const UNMEASURED: TextMetrics = { width: 0.62, ink: 1, ascent: 0.75 };

const REFERENCE = 100;
let scratch: CanvasRenderingContext2D | null | undefined;

function useTextMetrics(): (value: string, stack: string) => TextMetrics {
  /*
   * Measured again once the webfonts arrive.
   *
   * The first paint happens in the fallback face, and Yatra One is a good
   * deal wider than the serif standing in for it, so a plate measured then
   * and never remeasured would be laid out for a font the customer is no
   * longer looking at.
   */
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);

  return useMemo(() => {
    void ready;
    return (value: string, stack: string): TextMetrics => {
      if (scratch === undefined) scratch = document.createElement('canvas').getContext('2d');
      if (!scratch) return UNMEASURED;
      scratch.font = `${REFERENCE}px ${stack}`;
      const m = scratch.measureText(value);
      const ascent = m.actualBoundingBoxAscent;
      const descent = m.actualBoundingBoxDescent;
      if (!Number.isFinite(ascent) || !Number.isFinite(descent) || ascent + descent <= 0) {
        return { ...UNMEASURED, width: m.width / REFERENCE || UNMEASURED.width };
      }
      return {
        width: m.width / REFERENCE,
        ink: (ascent + descent) / REFERENCE,
        ascent: ascent / REFERENCE,
      };
    };
  }, [ready]);
}

/**
 * Puts a template's own drawing inside the shape the product is set to.
 *
 * Three of these designs were drawn against a fixed box -- 600x300 for the
 * plates, 400x420 for the square sign -- with every coordinate written out by
 * hand against it. They took no notice of the shape the product was set to, so
 * a piece cut three times as wide as it is tall still previewed as the same
 * 2:1 rectangle, and the proportions measured off a photograph were worked out
 * and then thrown away.
 *
 * Re-laying out each of them proportionally would have changed how all three
 * look. So the drawing is kept exactly as it is and fitted into the configured
 * box instead: scaled by the same factor on both axes, so nothing is ever
 * stretched out of proportion, and centred in whatever is left over. At the
 * shape a design was drawn for the factor is 1 and the result is identical to
 * what it was before.
 */
function fitDesign(config: PreviewConfig, designW: number, designH: number) {
  const vw = config.aspect.width;
  const vh = config.aspect.height;
  const scale = Math.min(vw / designW, vh / designH);
  return {
    viewBox: `0 0 ${vw} ${vh}`,
    transform:
      `translate(${((vw - designW * scale) / 2).toFixed(2)} ${((vh - designH * scale) / 2).toFixed(2)})`
      + ` scale(${scale.toFixed(5)})`,
  };
}

function fitSize(text: string, room: number, max: number, spacing = 0, capWidth = 0.6): number {
  const n = text.length;
  if (!n) return max;
  const size = (room - Math.max(0, n - 1) * spacing) / (n * capWidth);
  return Math.max(9, Math.min(max, size));
}

/**
 * Brings a stack of lines down until it fits the height it has.
 *
 * fitSize only knows about one line at a time, so four of them at their own
 * best sizes can still add up to more than the opening -- a number, two names
 * and a detail filled the botanical frame's window to the pixel and put the
 * first and last lines into the leaves. Scaling the whole stack keeps the
 * proportions the design was drawn with instead of singling out a line to cut.
 */
function squeeze<T extends { size: number; gap: number }>(rows: T[], room: number): T[] {
  const height = rows.reduce((total, row, index) => total + (index ? row.gap : 0) + row.size, 0);
  if (height <= room || height <= 0) return rows;
  const scale = room / height;
  return rows.map((row) => ({ ...row, size: row.size * scale, gap: row.gap * scale }));
}

/**
 * Two names inside a cut botanical frame.
 *
 * The frame is the product, so it is drawn at a fixed thickness and the
 * lettering lives in the window it leaves. The ampersand only appears when
 * there are in fact two names -- on a plate with one it would be lettering that
 * means nothing, and the customer would be looking at a plate they cannot buy.
 */
function PlateBotanical({ slots, plate, text, font, config, uid }: TemplateProps) {
  const { width: VW, height: VH } = config.aspect;
  // A proportion of the plate, not a fixed number of units: the border has to
  // stay the same share of a plate whatever shape the product is cut to.
  const BAND = Math.round(Math.min(VW, VH) * 0.229);

  const number = (slots.number ?? '').toUpperCase();
  const first = (slots.line1 ?? '').toUpperCase();
  const second = (slots.line2 ?? '').toUpperCase();
  const detail = (slots.line3 ?? '').toUpperCase();

  const room = VW - BAND * 2 - 76;
  const midX = VW / 2;

  /*
   * Measured, not guessed. Each of these three is the widest advance per
   * character the design's own face actually produced across the studio's
   * sample names, rounded up -- a figure below the real one is what put "&
   * Aarna" through the right-hand edge of the cube plate the first time.
   */
  const CAP = 0.66;

  const nameMax = second ? 76 : 92;
  const size1 = fitSize(first, room, nameMax, 7, CAP);
  const size2 = fitSize(second, room, nameMax, 7, CAP);
  const nameSize = Math.min(size1, size2 || nameMax);

  const lines: { text: string; size: number; weight: number; spacing: number; gap: number }[] = [];
  if (number) lines.push({ text: number, size: fitSize(number, room, 30, 6, CAP), weight: 400, spacing: 6, gap: 0 });
  if (first) lines.push({ text: first, size: nameSize, weight: 300, spacing: 7, gap: 26 });
  if (first && second) lines.push({ text: '&', size: nameSize * 0.72, weight: 300, spacing: 0, gap: 16 });
  if (second) lines.push({ text: second, size: nameSize, weight: 300, spacing: 7, gap: 16 });
  if (detail) lines.push({ text: detail, size: fitSize(detail, room, 26, 5, CAP), weight: 400, spacing: 5, gap: 28 });

  // The window the frame leaves, less a margin so no line sits on the leaves.
  const rows = squeeze(lines, VH - BAND * 2 - 44);
  const blockH = rows.reduce((total, row, index) => total + (index ? row.gap : 0) + row.size, 0);
  let cursor = VH / 2 - blockH / 2;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="mx-auto block w-full max-w-lg" role="img" aria-label="Nameplate preview">
      <defs>
        <filter id={`shadow-${uid}`} x="-8%" y="-8%" width="116%" height="120%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#111111" floodOpacity="0.18" />
        </filter>
      </defs>

      <rect x="0" y="0" width={VW} height={VH} rx={config.plate.radius} fill={plate} filter={`url(#shadow-${uid})`} />
      <LeafFrame width={VW} height={VH} band={BAND} color={text} ground={plate} uid={uid} />

      {rows.map((row, index) => {
        if (index) cursor += row.gap;
        const baseline = cursor + row.size * 0.78;
        cursor += row.size;
        return (
          <text
            key={index}
            x={midX}
            y={baseline}
            textAnchor="middle"
            fill={text}
            fontFamily={font}
            fontSize={row.size}
            fontWeight={row.weight}
            letterSpacing={row.spacing}
            // Centred text with letter-spacing hangs one space off the right,
            // so shift back by half of it to keep the block on the axis.
            dx={-row.spacing / 2}
          >
            {row.text}
          </text>
        );
      })}
    </svg>
  );
}

/**
 * A flowering band beside a name, for Marathi and Hindi plates.
 *
 * Nothing here is uppercased. Devanagari has no case to change, and the one
 * Latin line is a flat number -- running toUpperCase over the lot would do
 * nothing visible and would quietly mangle any script that does have case.
 */
function PlateVine({ slots, text, font, config, uid }: TemplateProps) {
  const { width: VW, height: VH } = config.aspect;

  // Proportions of the plate, so the band keeps its share of a plate cut to
  // any shape rather than swamping a small one and stranding a wide one.
  const bandX = Math.round(VW * 0.047);
  const bandW = Math.round(VW * 0.286);
  const textX = bandX + bandW + Math.round(VW * 0.045);
  const room = VW - textX - bandX;

  const name = slots.line1 ?? '';
  const second = slots.line2 ?? '';
  const number = slots.number ?? '';
  const detail = slots.line3 ?? '';

  // Devanagari sets wider than Latin caps, and the conjuncts and the matras
  // above and below need the extra room allowed for here.
  const CAP = 0.56;
  const nameSize = fitSize(name, room, 96, 0, CAP);
  const secondSize = fitSize(second, room, 56, 0, CAP);
  const numberSize = fitSize(number, room, 50, 1, 0.64);

  const lines: { text: string; size: number; rule?: boolean; gap: number }[] = [];
  if (name) lines.push({ text: name, size: nameSize, gap: 0 });
  if (name && (second || number)) lines.push({ text: '', size: 26, rule: true, gap: 14 });
  if (second) lines.push({ text: second, size: secondSize, gap: 14 });
  if (number) lines.push({ text: number, size: numberSize, gap: 16 });
  if (detail) lines.push({ text: detail, size: fitSize(detail, room, 34, 0, CAP), gap: 16 });

  // Inside the inner frame line, with a margin.
  const rows = squeeze(lines, VH - 104);
  const blockH = rows.reduce((total, row, index) => total + (index ? row.gap : 0) + row.size, 0);
  let cursor = VH / 2 - blockH / 2;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="mx-auto block w-full max-w-xl" role="img" aria-label="Nameplate preview">
      <defs>
        <filter id={`shadow-${uid}`} x="-8%" y="-8%" width="116%" height="120%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#111111" floodOpacity="0.18" />
        </filter>
      </defs>

      <rect x="0" y="0" width={VW} height={VH} fill={VINE_PALETTE.ground} filter={`url(#shadow-${uid})`} />
      {/* The double frame: a broad outer band and a hairline inside it. */}
      <rect x="5" y="5" width={VW - 10} height={VH - 10} fill="none" stroke={VINE_PALETTE.frame} strokeWidth="10" />
      <rect x="26" y="26" width={VW - 52} height={VH - 52} fill="none" stroke={VINE_PALETTE.frame} strokeWidth="2.5" />

      <VineBand x={bandX} y={48} width={bandW} height={VH - 96} uid={uid} />

      {rows.map((row, index) => {
        if (index) cursor += row.gap;
        const top = cursor;
        cursor += row.size;

        if (row.rule) {
          const y = top + row.size / 2;
          const right = textX + Math.min(room, 520);
          const mid = (textX + right) / 2;
          return (
            <g key={index} fill={text} stroke={text}>
              <line x1={textX} y1={y} x2={mid - 34} y2={y} strokeWidth="3" />
              <line x1={mid + 34} y1={y} x2={right} y2={y} strokeWidth="3" />
              {/* The paired diamonds from the studio's artwork. */}
              <path d={`M${mid - 26} ${y} L${mid - 9} ${y - 11} L${mid} ${y} L${mid - 9} ${y + 11} Z`} />
              <path d={`M${mid} ${y} L${mid + 9} ${y - 11} L${mid + 26} ${y} L${mid + 9} ${y + 11} Z`} />
            </g>
          );
        }

        return (
          <text
            key={index}
            x={textX}
            y={top + row.size * 0.8}
            fill={text}
            fontFamily={font}
            fontSize={row.size}
          >
            {row.text}
          </text>
        );
      })}
    </svg>
  );
}

/**
 * A cut geometric band beside handwritten names.
 *
 * Case is left exactly as typed. The design is set in a formal script, and a
 * script face in all capitals is the one way to make it look like a mistake.
 */
function PlateCubes({ slots, plate, text, font, config, uid }: TemplateProps) {
  const { width: VW, height: VH } = config.aspect;

  // Proportions of the plate, so the cut band keeps its share of the face
  // whatever shape the product is made in.
  const bandX = Math.round(VW * 0.051);
  const bandW = Math.round(VW * 0.333);
  const textX = bandX + bandW + Math.round(VW * 0.065);
  const room = VW - textX - bandX;

  const number = slots.number ?? '';
  const first = slots.line1 ?? '';
  const second = slots.line2 ?? '';
  const detail = slots.line3 ?? '';

  // Petit Formal Script sets wide for a script, close to Latin caps.
  const CAP = 0.75;
  const nameSize = Math.min(
    fitSize(first, room, 104, 0, CAP),
    second ? fitSize(second, room, 104, 0, CAP) : 104,
  );
  /*
   * The flat is numbered, not announced.
   *
   * Sized on its own, a short number like "C 1204" takes the ceiling while two
   * long names come down to meet the plate, and the result reads as a door
   * number with the residents noted underneath. It stays under the names.
   */
  const numberSize = Math.min(fitSize(number, room, 86, 0, CAP), nameSize * 0.84);

  const lines: { text: string; size: number; gap: number }[] = [];
  if (number) lines.push({ text: number, size: numberSize, gap: 0 });
  if (first) lines.push({ text: first, size: nameSize, gap: 44 });
  if (second) lines.push({ text: second, size: nameSize, gap: 18 });
  if (detail) lines.push({ text: detail, size: fitSize(detail, room, 46, 0, CAP), gap: 26 });

  // The height the band occupies, so the lettering keeps to the same field.
  const rows = squeeze(lines, VH - 112);
  const blockH = rows.reduce((total, row, index) => total + (index ? row.gap : 0) + row.size, 0);
  let cursor = VH / 2 - blockH / 2;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="mx-auto block w-full max-w-lg" role="img" aria-label="Nameplate preview">
      <defs>
        <filter id={`shadow-${uid}`} x="-8%" y="-8%" width="116%" height="120%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#111111" floodOpacity="0.18" />
        </filter>
      </defs>

      <rect x="0" y="0" width={VW} height={VH} rx={config.plate.radius} fill={plate} filter={`url(#shadow-${uid})`} />
      <CubeBand x={bandX} y={44} width={bandW} height={VH - 88} color={text} ground={plate} uid={uid} />

      {rows.map((row, index) => {
        if (index) cursor += row.gap;
        const baseline = cursor + row.size * 0.74;
        cursor += row.size;
        return (
          <text key={index} x={textX} y={baseline} fill={text} fontFamily={font} fontSize={row.size}>
            {row.text}
          </text>
        );
      })}
    </svg>
  );
}

/**
 * A plate drawn from the product's own photograph.
 *
 * Every other design here is a drawing: a developer reads the artwork and
 * builds it in SVG, which means a design the studio makes on a Tuesday cannot
 * be sold until someone writes code for it. This one is not drawn at all. The
 * server takes the photograph, paints the sample name off it and measures
 * where that name sat; what is left is the real piece with an empty face, and
 * all this does is put the customer's words back in the same boxes.
 *
 * So the preview cannot drift from the product, because it IS the product --
 * and a new design needs no code, only an upload.
 */
function PlatePhoto({ slots, plate, text, font, config, uid, scales }: TemplateProps) {
  const photo = config.photo;
  const measure = useTextMetrics();
  const VW = config.aspect.width;
  const VH = config.aspect.height;

  /*
   * Nothing to stand on yet.
   *
   * This design carries measurements taken off one particular picture, so
   * until a photograph has been read there is no artwork to draw. Returning
   * nothing left an empty frame wherever the design was listed -- in the
   * settings page beside its name, and in the editor if it was selected
   * before a photograph had been read -- which reads as a broken preview
   * rather than as one waiting for its artwork. A plain plate with the
   * lettering on it says what the design is for and what is missing.
   */
  if (!photo?.image) {
    const lines = [slots.number, slots.line1, slots.line2, slots.line3]
      .map((line) => (line ?? '').trim())
      .filter(Boolean);
    const step = VH / (lines.length + 1);
    return (
      <svg viewBox={`0 0 ${VW} ${VH}`} className="mx-auto block w-full max-w-lg" role="img" aria-label="Nameplate preview">
        <rect x="0" y="0" width={VW} height={VH} rx={config.plate.radius} fill={plate} />
        <rect
          x={VW * 0.03} y={VH * 0.05} width={VW * 0.94} height={VH * 0.9}
          rx={config.plate.radius} fill="none" stroke={text} strokeWidth={Math.max(1, VW * 0.004)}
          strokeDasharray={`${VW * 0.02} ${VW * 0.015}`} opacity="0.45"
        />
        {lines.map((line, index) => (
          <text
            key={`${line}-${uid}-${index}`}
            x={VW / 2}
            y={step * (index + 1) + VH * 0.02}
            textAnchor="middle"
            fill={text}
            fontFamily={font}
            fontSize={Math.min(VH * 0.16, (VW * 0.82) / Math.max(6, line.length) / 0.62)}
          >
            {line}
          </text>
        ))}
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="mx-auto block w-full max-w-lg" role="img" aria-label="Nameplate preview">
      <image href={assetUrl(photo.image)} x="0" y="0" width={VW} height={VH} preserveAspectRatio="none" />

      {photo.boxes.map((box, index) => {
        const value = (slots[box.slot] ?? '').trim();
        if (!value) return null;

        /*
         * A picture rather than words.
         *
         * The symbol a family puts on a nameplate -- an Om, a Ganesha, a cross
         * -- is chosen, not typed, so this box carries an image. Fitted inside
         * its box without cropping: a symbol squeezed out of shape is worse
         * than one drawn slightly small, and these are not shapes anybody
         * should be distorting to fill a rectangle.
         */
        if (box.slot === 'logo') {
          const boxW = box.room * VW;
          const boxH = box.h * VH;
          const left = box.align === 'center' ? box.anchor * VW - boxW / 2
            : box.align === 'right' ? box.anchor * VW - boxW
              : box.anchor * VW;
          return (
            <image
              key={index}
              href={assetUrl(value)}
              x={left}
              y={box.y * VH}
              width={boxW}
              height={boxH}
              preserveAspectRatio="xMidYMid meet"
            />
          );
        }

        const roomW = box.room * VW;
        const roomH = box.h * VH;
        const m = measure(value, font);

        /*
         * Sized to the ink, not to the font size.
         *
         * A box was measured from the sample name's own marks, so the letters
         * that replace it have to be matched the same way -- by how tall and
         * wide they actually draw. Going by font size instead would leave
         * Devanagari, which carries marks above and below, overflowing a box
         * that Latin capitals sat inside comfortably.
         */
        /*
         * The size the artwork itself has, then whatever the customer asked
         * for. Applied after the fit rather than inside it, so 100% is always
         * exactly the piece's own lettering and the steps read as steps.
         */
        const fitted = Math.min(roomH / Math.max(0.01, m.ink), roomW / Math.max(0.01, m.width));
        const scale = (scales?.[box.slot] ?? 100) / 100;
        const size = Math.max(6, fitted * scale);

        const anchor = box.align === 'center' ? 'middle' : box.align === 'right' ? 'end' : 'start';

        return (
          <text
            key={index}
            x={box.anchor * VW}
            y={box.y * VH + m.ascent * size}
            fill={text}
            fontFamily={font}
            fontSize={size}
            textAnchor={anchor}
          >
            {value}
          </text>
        );
      })}
    </svg>
  );
}

/**
 * Lettering cut out and fixed straight to the wall.
 *
 * Every other design here draws a plate and writes on it. This piece has no
 * plate: the letters themselves are the product, cut from steel and stood off
 * the wall on studs, with a slim bar running through them and the flat number
 * under it. Shown on any of the plate designs it came out as a panel with a
 * name on it -- the wrong product, in the one picture a customer is asked to
 * approve before anything is made.
 *
 * So nothing is drawn behind the lettering and the page shows through where
 * the wall would be. The shadow is not decoration: it is what the real piece
 * does standing off a wall, and it is also what keeps a pale finish such as
 * ivory legible against a pale wall -- exactly as it is in life.
 */
function ScriptCut({ slots, text, font, config, uid }: TemplateProps) {
  const { width: VW, height: VH } = config.aspect;
  const measure = useTextMetrics();

  const name = (slots.line1 ?? '').trim();
  const number = (slots.number ?? '').trim();
  const second = (slots.line2 ?? '').trim();

  const margin = VW * 0.045;
  const room = VW - margin * 2;
  /** The bar runs where the script's own baseline sits, as on the piece. */
  const barY = VH * 0.63;
  const barH = Math.max(1.5, VH * 0.018);

  /*
   * The script takes whichever limit bites first: the height above the bar or
   * the width of the piece. Measured rather than estimated, because a
   * signature face sets far wider per letter than a text face, and guessing
   * at that is what pushes a long surname off the end of the metal.
   */
  const m = measure(name || 'Name', font);
  const scriptSize = Math.max(
    8,
    Math.min((barY - VH * 0.08) / Math.max(0.01, m.ascent), room / Math.max(0.01, m.width)),
  );

  const numberFont = fontStack('grotesque');
  const nm = measure(number || 'A 000', numberFont);
  const numberSize = Math.max(
    6,
    Math.min((VH * 0.2) / Math.max(0.01, nm.ink), (room * 0.5) / Math.max(0.01, nm.width)),
  );

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="mx-auto block w-full max-w-lg" role="img" aria-label="Nameplate preview">
      <defs>
        <filter id={`lift-${uid}`} x="-12%" y="-12%" width="130%" height="140%">
          <feDropShadow
            dx={VW * 0.006} dy={VH * 0.022} stdDeviation={VH * 0.018}
            floodColor="#2B2520" floodOpacity="0.32"
          />
        </filter>
      </defs>

      <g filter={`url(#lift-${uid})`} fill={text}>
        <rect x={margin} y={barY} width={room} height={barH} rx={barH / 2} />

        {name ? (
          <text x={margin} y={barY + barH / 2} fontFamily={font} fontSize={scriptSize}>
            {name}
          </text>
        ) : null}

        {number ? (
          <text
            x={VW - margin}
            y={barY + barH + VH * 0.21}
            textAnchor="end"
            fontFamily={numberFont}
            fontSize={numberSize}
            letterSpacing={numberSize * 0.06}
          >
            {number}
          </text>
        ) : null}

        {second ? (
          <text
            x={margin}
            y={barY + barH + VH * 0.21}
            fontFamily={numberFont}
            fontSize={numberSize * 0.78}
            letterSpacing={numberSize * 0.05}
            opacity="0.85"
          >
            {second}
          </text>
        ) : null}
      </g>
    </svg>
  );
}

export const PREVIEW_TEMPLATES = [
  { value: '', label: 'No live preview' },
  { value: 'script-cut', label: 'Cut lettering (script name on a bar, no plate)' },
  { value: 'nameplate-minimal', label: 'Nameplate — minimal (number, rule, name)' },
  { value: 'nameplate-classic', label: 'Nameplate — classic (centred, framed)' },
  { value: 'desk-plate', label: 'Desk plate (name, designation, degree)' },
  { value: 'sign-square', label: 'Square sign (symbol + caption)' },
  { value: 'plate-botanical', label: 'Botanical frame (two names in a cut border)' },
  { value: 'plate-vine', label: 'Floral band (Devanagari name, flowering border)' },
  { value: 'plate-cubes', label: 'Cube band (script names beside a cut pattern)' },
  /*
   * Listed so a product set up from its photograph shows what it is in the
   * editor, but it is not something to pick from here: it carries measurements
   * taken off one particular picture, and choosing it for a product that has
   * none would draw an empty plate. It is set by reading a photograph.
   */
  { value: 'photo', label: 'From the product photograph (set up automatically)' },
];

/**
 * The shipped name of each design, which the studio may rename.
 *
 * Settings hold only the names that have actually been changed, so a design
 * nobody has renamed keeps whatever it is called here -- including after this
 * list is reworded, which is the behaviour you want from a default.
 */
export function previewTemplateOptions(
  names: Record<string, string> | null | undefined,
): { value: string; label: string }[] {
  return PREVIEW_TEMPLATES.map((option) => {
    const custom = option.value ? names?.[option.value]?.trim() : '';
    return custom ? { ...option, label: custom } : option;
  });
}

/**
 * A design the studio built and kept, as against one that shipped in code.
 *
 * `template` says which drawing it is based on; `config` is everything the
 * studio settled about it -- shape, colours, lettering placement. Applying it
 * to a product copies both onto that product, which then owns them.
 */
export interface SavedDesign {
  id: string;
  name: string;
  template: string;
  config: Record<string, unknown>;
}

/** Never shared: a fresh [] each render would re-run the memo on every render. */
const NO_DESIGNS: SavedDesign[] = [];

/** The studio's own saved designs, newest last. */
export function useSavedDesigns(): SavedDesign[] {
  const { get } = useSettings();
  const raw = get<SavedDesign[]>('preview.savedDesigns', NO_DESIGNS);
  return useMemo(
    () => (Array.isArray(raw) ? raw.filter((item) => item && item.id && item.name) : NO_DESIGNS),
    [raw],
  );
}

/** A fresh {} each render would re-run the memo below on every render. */
const EMPTY_NAMES: Record<string, string> = {};

/** The design list as the studio has named it, for every picker that shows it. */
export function usePreviewTemplates(): { value: string; label: string }[] {
  const { get } = useSettings();
  const names = get<Record<string, string>>('preview.templateNames', EMPTY_NAMES);
  return useMemo(() => previewTemplateOptions(names), [names]);
}

export const PREVIEW_SLOTS = [
  { value: '', label: 'Not bound to the preview' },
  { value: 'number', label: 'Number (top line)' },
  { value: 'line1', label: 'Line 1 — main name' },
  { value: 'line2', label: 'Line 2 — family name / designation' },
  { value: 'line3', label: 'Line 3 — degree / detail' },
  { value: 'fontFamily', label: 'Font' },
  { value: 'textColor', label: 'Text colour' },
  { value: 'plateColor', label: 'Plate colour' },
  { value: 'logo', label: 'Logo image' },
];
