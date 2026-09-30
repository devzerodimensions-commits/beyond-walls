import { useMemo } from 'react';
import clsx from 'clsx';
import {
  BRAND_PRESETS, DEFAULT_BRAND_COLOR, buildBrandPalette, contrastRatio, hexToRgb, isHexColor,
  readableOn,
} from '../../lib/brandColor';
import { CheckIcon } from '../ui';

/**
 * Picks the one colour the whole product is built from.
 *
 * Everything under the swatches is derived, not chosen, so what is shown here
 * is exactly what the shop and the admin will use. The contrast figures are
 * measured rather than asserted — if a colour cannot carry readable text the
 * panel says so instead of quietly shipping something illegible.
 */
export function BrandColorField({
  value, onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const current = isHexColor(value) ? value : DEFAULT_BRAND_COLOR;
  const palette = useMemo(() => buildBrandPalette(current), [current]);

  const onBrand = contrastRatio(hexToRgb(palette.base), hexToRgb(palette.ink));
  const linkOnWhite = contrastRatio(hexToRgb(palette.strong), [255, 255, 255]);

  return (
    <div className="sm:col-span-2">
      <span className="field-label">Brand colour</span>
      <p className="-mt-1 mb-3 text-xs" style={{ color: 'var(--a-muted)' }}>
        Used across the shop and this panel: buttons, links, focus rings, active menu items,
        badges and highlights. Everything else — hover, pressed, tints and the text that sits on
        each — is worked out from it.
      </p>

      <div className="flex flex-wrap gap-2">
        {BRAND_PRESETS.map((preset) => {
          const selected = preset.value.toUpperCase() === current.toUpperCase();
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChange(preset.value)}
              aria-pressed={selected}
              title={`${preset.label} — ${preset.value}`}
              className={clsx(
                'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform',
                selected ? 'scale-110' : 'hover:scale-105',
              )}
              style={{
                background: preset.value,
                borderColor: selected ? 'var(--a-text)' : 'transparent',
              }}
            >
              {selected ? (
                <CheckIcon size={15} style={{ color: buildBrandPalette(preset.value).ink }} />
              ) : (
                <span className="sr-only">{preset.label}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--a-muted)' }}>
          Custom
          <input
            type="color"
            value={current}
            aria-label="Pick a custom brand colour"
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="h-9 w-12 cursor-pointer rounded-[var(--a-radius-sm)] border p-1"
            style={{ borderColor: 'var(--a-line)', background: 'var(--a-surface)' }}
          />
        </label>
        <input
          value={current}
          aria-label="Brand colour hex"
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value.trim();
            if (isHexColor(next)) onChange((next.startsWith('#') ? next : `#${next}`).toUpperCase());
          }}
          className="field w-32 font-mono"
        />
        {current.toUpperCase() !== DEFAULT_BRAND_COLOR ? (
          <button type="button" className="a-btn a-btn-ghost" onClick={() => onChange(DEFAULT_BRAND_COLOR)}>
            Reset to emerald
          </button>
        ) : null}
      </div>

      {/* What the choice actually produces. */}
      <div
        className="mt-5 rounded-[var(--a-radius)] border p-4"
        style={{ borderColor: 'var(--a-line)', background: 'var(--a-sunken)' }}
      >
        <p className="mb-3 text-xs font-medium" style={{ color: 'var(--a-muted)' }}>
          Worked out from it
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Chip label="Button" bg={palette.base} fg={palette.ink} />
          <Chip label="Hover" bg={palette.hover} />
          <Chip label="Pressed" bg={palette.active} />
          <Chip label="Badge" bg={palette.soft} fg={palette.softInk} />
          <Chip label="On dark" bg="#15181E" fg={palette.onDark} />
          <span
            className="rounded-[var(--a-radius-sm)] px-2.5 py-1.5 text-xs"
            style={{ color: palette.strong, background: '#FFFFFF', border: `1px solid ${palette.border}` }}
          >
            Link on white
          </span>
        </div>

        <dl className="mt-4 grid gap-1.5 text-xs sm:grid-cols-2">
          <Reading
            label="Text on the button"
            ratio={onBrand}
            note={palette.ink === '#FFFFFF' ? 'white' : 'near-black'}
          />
          <Reading label="Link text on white" ratio={linkOnWhite} note={palette.strong} />
        </dl>
      </div>
    </div>
  );
}

function Chip({ label, bg, fg }: { label: string; bg: string; fg?: string }) {
  return (
    <span
      className="rounded-[var(--a-radius-sm)] px-2.5 py-1.5 text-xs font-medium"
      style={{ background: bg, color: fg ?? readableOn(bg) }}
    >
      {label}
    </span>
  );
}

/** A measured contrast reading, with the WCAG AA threshold applied. */
function Reading({ label, ratio, note }: { label: string; ratio: number; note: string }) {
  const passes = ratio >= 4.5;
  return (
    <div className="flex items-center gap-2">
      <dt style={{ color: 'var(--a-muted)' }}>{label}:</dt>
      <dd className="flex items-center gap-1.5">
        <span className="font-mono" style={{ color: 'var(--a-text)' }}>{ratio.toFixed(1)}:1</span>
        <span
          className="a-pill"
          data-badge={passes ? 'success' : 'warning'}
          style={{
            background: passes ? 'var(--a-success-soft)' : 'var(--a-warning-soft)',
            color: passes ? 'var(--a-success)' : 'var(--a-warning)',
          }}
        >
          {passes ? 'Readable' : 'Low contrast'}
        </span>
        <span className="font-mono" style={{ color: 'var(--a-faint)' }}>{note}</span>
      </dd>
    </div>
  );
}
