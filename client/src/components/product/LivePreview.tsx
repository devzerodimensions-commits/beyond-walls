import { useEffect, useId, useMemo } from 'react';
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
const PLATE_FONT_STYLESHEET =
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

function resolveColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (value.startsWith('#')) return value;
  return COLOR_MAP[value.toLowerCase()] ?? fallback;
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
  };
}

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
  /** The product's stored `livePreviewConfig`. */
  config?: Record<string, unknown> | null;
}

export function LivePreview({
  template, slots, className, placeholders, config, hideLabel, hideCaption,
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

  const plate = resolveColor(merged.plateColor, '#111111');
  const text = resolveColor(merged.textColor, '#FFFFFF');
  const font = fontStack(merged.fontFamily);

  // A light plate needs a visible edge against the light backdrop.
  const isLightPlate = resolved.plate.borderOnLight && isLight(plate);

  const shared = { slots: merged, plate, text, font, config: resolved, uid };

  const body = (() => {
    switch (template) {
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
      {body}
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

function NameplateClassic({ slots, plate, text, font, config, uid }: TemplateProps) {
  return (
    <svg viewBox="0 0 600 300" className="mx-auto block w-full max-w-lg" role="img" aria-label="Nameplate preview">
      <defs>
        <filter id={`shadow-${uid}`} x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#111111" floodOpacity="0.18" />
        </filter>
      </defs>
      <rect x="30" y="40" width="540" height="220" rx={config.plate.radius} fill={plate} filter={`url(#shadow-${uid})`} />
      <rect x="48" y="58" width="504" height="184" rx="2" fill="none" stroke={text} strokeWidth="1.5" opacity="0.5" />

      {slots.number ? (
        <text x="300" y="112" textAnchor="middle" fill={text} fontFamily={font} fontSize="26" letterSpacing="6">
          {slots.number.toUpperCase()}
        </text>
      ) : null}

      <text
        x="300" y={slots.number ? 166 : 150} textAnchor="middle"
        fill={text} fontFamily={font} fontSize={(slots.line1 ?? '').length > 18 ? 30 : 38} letterSpacing="2"
      >
        {(slots.line1 ?? '').toUpperCase()}
      </text>

      {slots.line2 ? (
        <text
          x="300" y={slots.number ? 208 : 194} textAnchor="middle"
          fill={text} fontFamily={font} fontSize="24" letterSpacing="4" opacity="0.85"
        >
          {slots.line2.toUpperCase()}
        </text>
      ) : null}
    </svg>
  );
}

function DeskPlate({ slots, plate, text, font, config, uid }: TemplateProps) {
  return (
    <svg viewBox="0 0 600 300" className="mx-auto block w-full max-w-lg" role="img" aria-label="Desk plate preview">
      <defs>
        <filter id={`shadow-${uid}`} x="-10%" y="-10%" width="120%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#111111" floodOpacity="0.2" />
        </filter>
      </defs>
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
    </svg>
  );
}

function SignSquare({ slots, plate, text, font, config, uid }: TemplateProps) {
  return (
    <svg viewBox="0 0 400 420" className="mx-auto block w-full max-w-xs" role="img" aria-label="Sign preview">
      <defs>
        <filter id={`shadow-${uid}`} x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#111111" floodOpacity="0.18" />
        </filter>
      </defs>
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
  const VW = 860;
  const VH = 645;
  const BAND = 148;

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
function PlateVine({ slots, text, font, uid }: TemplateProps) {
  const VW = 1020;
  const VH = 685;

  const bandX = 48;
  const bandW = 292;
  const textX = bandX + bandW + 46;
  const room = VW - textX - 48;

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
  const VW = 860;
  const VH = 641;

  const bandX = 44;
  const bandW = 286;
  const textX = bandX + bandW + 56;
  const room = VW - textX - 44;

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

export const PREVIEW_TEMPLATES = [
  { value: '', label: 'No live preview' },
  { value: 'nameplate-minimal', label: 'Nameplate — minimal (number, rule, name)' },
  { value: 'nameplate-classic', label: 'Nameplate — classic (centred, framed)' },
  { value: 'desk-plate', label: 'Desk plate (name, designation, degree)' },
  { value: 'sign-square', label: 'Square sign (symbol + caption)' },
  { value: 'plate-botanical', label: 'Botanical frame (two names in a cut border)' },
  { value: 'plate-vine', label: 'Floral band (Devanagari name, flowering border)' },
  { value: 'plate-cubes', label: 'Cube band (script names beside a cut pattern)' },
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
