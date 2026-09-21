import { useMemo } from 'react';
import clsx from 'clsx';
import type { PersonalizationField } from '../../lib/types';
import { assetUrl } from '../../lib/api';

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

const FONT_STACKS: Record<string, string> = {
  grotesque: '"Archivo", "Inter", system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  condensed: '"Archivo Narrow", "Archivo", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
};

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
  'nameplate-minimal': {},
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
  /**
   * Placeholder copy shown before the customer has typed anything. Overrides
   * the placeholders that come from the product's configuration.
   */
  placeholders?: PreviewSlots;
  /** The product's stored `livePreviewConfig`. */
  config?: Record<string, unknown> | null;
}

export function LivePreview({ template, slots, className, placeholders, config }: LivePreviewProps) {
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
  const font = FONT_STACKS[merged.fontFamily ?? 'grotesque'] ?? FONT_STACKS.grotesque;

  // A light plate needs a visible edge against the light backdrop.
  const isLightPlate = resolved.plate.borderOnLight && isLight(plate);

  const shared = { slots: merged, plate, text, font, config: resolved };

  const body = (() => {
    switch (template) {
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
      <span className="eyebrow absolute left-4 top-4 text-ink-300">Live preview</span>
      {body}
      {resolved.caption ? (
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
}

/** Matches the supplied product: number top-right, rule, name lines below. */
function NameplateMinimal({ slots, plate, text, font, config, isLight }: TemplateProps) {
  const hasNumber = Boolean(slots.number);
  const name = (slots.line1 ?? '').toUpperCase();
  const family = (slots.line2 ?? '').toUpperCase();

  // Shrink the name as it lengthens so it never overflows the plate.
  const nameSize = name.length > 22 ? 22 : name.length > 16 ? 26 : 32;

  const { width: vw, height: vh } = config.aspect;
  const inset = config.plate.inset;
  const plateW = vw - inset * 2;
  const plateH = vh - inset * 2;
  const right = vw - inset - 40;
  const midY = vh / 2;

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} className="mx-auto block w-full max-w-lg" role="img" aria-label="Nameplate preview">
      <defs>
        <linearGradient id="plate-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.10" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.06" />
        </linearGradient>
        <filter id="plate-shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#111111" floodOpacity="0.18" />
        </filter>
      </defs>

      <rect
        x={inset} y={inset} width={plateW} height={plateH} rx={config.plate.radius}
        fill={plate}
        stroke={isLight ? '#D9D6D0' : 'none'}
        strokeWidth={isLight ? 1 : 0}
        filter="url(#plate-shadow)"
      />
      <rect
        x={inset} y={inset} width={plateW} height={plateH} rx={config.plate.radius}
        fill="url(#plate-sheen)"
      />

      {config.plate.showScrews ? (
        <>
          <circle cx={inset + 26} cy={midY} r="6" fill="#A8A8A8" />
          <circle cx={inset + 26} cy={midY} r="2.4" fill="#787878" />
          <circle cx={vw - inset - 26} cy={midY} r="6" fill="#A8A8A8" />
          <circle cx={vw - inset - 26} cy={midY} r="2.4" fill="#787878" />
        </>
      ) : null}

      {slots.logo ? (
        <image
          href={assetUrl(slots.logo)}
          x={inset + 40} y={inset + 28} height="52" width="120"
          preserveAspectRatio="xMinYMid meet"
        />
      ) : null}

      {hasNumber ? (
        <text
          x={right} y={midY - 22} textAnchor="end"
          fill={text} fontFamily={font} fontSize="56" fontWeight="600" letterSpacing="2"
        >
          {slots.number?.toUpperCase()}
        </text>
      ) : null}

      <line x1={inset + 58} y1={midY} x2={right} y2={midY} stroke={text} strokeWidth="3" strokeLinecap="square" />

      {name ? (
        <text
          x={right} y={midY + 46} textAnchor="end"
          fill={text} fontFamily={font} fontSize={nameSize} fontWeight="500" letterSpacing="1.5"
        >
          {name}
        </text>
      ) : null}

      {family ? (
        <text
          x={right} y={midY + 88} textAnchor="end"
          fill={text} fontFamily={font} fontSize="28" fontWeight="500" letterSpacing="1.5"
        >
          {family}
        </text>
      ) : null}
    </svg>
  );
}

function NameplateClassic({ slots, plate, text, font, config }: TemplateProps) {
  return (
    <svg viewBox="0 0 600 300" className="mx-auto block w-full max-w-lg" role="img" aria-label="Nameplate preview">
      <defs>
        <filter id="plate-shadow-2" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#111111" floodOpacity="0.18" />
        </filter>
      </defs>
      <rect x="30" y="40" width="540" height="220" rx={config.plate.radius} fill={plate} filter="url(#plate-shadow-2)" />
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

function DeskPlate({ slots, plate, text, font, config }: TemplateProps) {
  return (
    <svg viewBox="0 0 600 300" className="mx-auto block w-full max-w-lg" role="img" aria-label="Desk plate preview">
      <defs>
        <filter id="desk-shadow" x="-10%" y="-10%" width="120%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#111111" floodOpacity="0.2" />
        </filter>
      </defs>
      {/* Wedge base */}
      <path d="M60 240 L540 240 L560 268 L40 268 Z" fill="#8A8A8A" />
      <rect x="70" y="80" width="460" height="160" rx={config.plate.radius} fill={plate} filter="url(#desk-shadow)" />

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

function SignSquare({ slots, plate, text, font, config }: TemplateProps) {
  return (
    <svg viewBox="0 0 400 420" className="mx-auto block w-full max-w-xs" role="img" aria-label="Sign preview">
      <defs>
        <filter id="sign-shadow" x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#111111" floodOpacity="0.18" />
        </filter>
      </defs>
      <rect x="30" y="20" width="340" height="380" rx={config.plate.radius} fill="#FFFFFF" filter="url(#sign-shadow)" />
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

export const PREVIEW_TEMPLATES = [
  { value: '', label: 'No live preview' },
  { value: 'nameplate-minimal', label: 'Nameplate — minimal (number, rule, name)' },
  { value: 'nameplate-classic', label: 'Nameplate — classic (centred, framed)' },
  { value: 'desk-plate', label: 'Desk plate (name, designation, degree)' },
  { value: 'sign-square', label: 'Square sign (symbol + caption)' },
];

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
