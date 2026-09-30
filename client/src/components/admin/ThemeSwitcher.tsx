import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { AdminTheme } from '../../lib/adminTheme';
import { CheckIcon } from '../ui';

/**
 * The theme picker in the top bar.
 *
 * Each option carries its own three-colour swatch — page, panel, accent —
 * drawn from the theme's real values, so the choice is made by eye rather than
 * by reading five names.
 */
export function ThemeSwitcher({
  theme, themes, onChange,
}: {
  theme: string;
  themes: AdminTheme[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Clicking anywhere else, or pressing Escape, closes it — as with any menu.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = themes.find((t) => t.id === theme) ?? themes[0];

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${active.label}. Change it.`}
        className="flex items-center gap-2 rounded-[var(--a-radius-sm)] border px-2.5 py-1.5 transition-colors"
        style={{ borderColor: 'var(--a-line)', background: 'var(--a-surface)' }}
      >
        <Swatch theme={active} />
        <span className="hidden text-xs font-medium sm:inline" style={{ color: 'var(--a-text)' }}>
          {active.label}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Admin theme"
          className="absolute right-0 z-50 mt-2 w-[17.5rem] overflow-hidden rounded-[var(--a-radius)] border shadow-[var(--a-shadow-lift)]"
          style={{ borderColor: 'var(--a-line)', background: 'var(--a-surface)' }}
        >
          <p
            className="border-b px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider"
            style={{ borderColor: 'var(--a-line-soft)', color: 'var(--a-faint)' }}
          >
            Theme
          </p>

          <ul className="p-1.5">
            {themes.map((item) => {
              const selected = item.id === theme;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => { onChange(item.id); setOpen(false); }}
                    className={clsx(
                      'flex w-full items-start gap-3 rounded-[var(--a-radius-sm)] px-2.5 py-2 text-left transition-colors',
                      selected && 'font-medium',
                    )}
                    style={{ background: selected ? 'var(--a-accent-soft)' : undefined }}
                  >
                    <span className="mt-0.5 shrink-0">
                      <Swatch theme={item} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm" style={{ color: 'var(--a-text)' }}>
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug" style={{ color: 'var(--a-muted)' }}>
                        {item.note}
                      </span>
                    </span>
                    {selected ? (
                      <CheckIcon size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--a-accent-ink)' }} />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <p
            className="border-t px-3.5 py-2.5 text-xs leading-snug"
            style={{ borderColor: 'var(--a-line-soft)', color: 'var(--a-faint)' }}
          >
            Saved in this browser. It changes the admin panel only — never the shop.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Page, panel and accent, taken from the theme's own values. */
function Swatch({ theme }: { theme: AdminTheme }) {
  const [page, panel, accent] = theme.swatch;
  return (
    <span
      aria-hidden="true"
      className="flex h-5 w-5 shrink-0 overflow-hidden rounded-full border"
      style={{ borderColor: 'var(--a-line)' }}
    >
      <span className="h-full w-1/3" style={{ background: page }} />
      <span className="h-full w-1/3" style={{ background: panel }} />
      <span className="h-full w-1/3" style={{ background: accent }} />
    </span>
  );
}
