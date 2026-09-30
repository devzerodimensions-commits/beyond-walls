import { useCallback, useEffect, useState } from 'react';

/**
 * Admin theming.
 *
 * A theme is only a set of CSS custom properties -- see `styles/admin.css`.
 * All this does is decide which name goes on `data-admin-theme` and remember
 * it, so nothing here needs to know a single colour.
 *
 * The choice is kept per browser rather than on the account. Two people
 * sharing one admin login should not be repainting each other's screen, and a
 * preference this cosmetic is not worth a round trip or a migration.
 */

export interface AdminTheme {
  id: string;
  label: string;
  /** One line for the picker, so the choice is not made on the name alone. */
  note: string;
  /** Drawn as the swatch: page, panel, accent. */
  swatch: [string, string, string];
}

export const ADMIN_THEMES: AdminTheme[] = [
  {
    id: 'studio',
    label: 'Studio',
    note: 'Warm neutral. Quiet, and lets photography carry the colour.',
    swatch: ['#F4F3F0', '#FFFFFF', '#1C1B18'],
  },
  {
    id: 'dark',
    label: 'Midnight',
    note: 'Deep charcoal for long evenings and low light.',
    swatch: ['#0D0F13', '#15181E', '#6C8CFF'],
  },
  {
    id: 'crimson',
    label: 'Crimson',
    note: 'Warm red on off-white. Confident without shouting.',
    swatch: ['#FAF5F4', '#FFFFFF', '#BE2C21'],
  },
  {
    id: 'indigo',
    label: 'Indigo',
    note: 'Cool blue. The steadiest of the five to read all day.',
    swatch: ['#F3F5FB', '#FFFFFF', '#3050C8'],
  },
  {
    id: 'emerald',
    label: 'Emerald',
    note: 'Deep green on a soft mint page. Calm and unusual.',
    swatch: ['#F2F7F4', '#FFFFFF', '#0E7A57'],
  },
];

export const DEFAULT_ADMIN_THEME = 'studio';

const STORAGE_KEY = 'bw.admin.theme';

function isKnown(value: string | null): value is string {
  return Boolean(value) && ADMIN_THEMES.some((theme) => theme.id === value);
}

/** The stored choice, or the default. Safe when storage is unavailable. */
export function readStoredTheme(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isKnown(stored) ? stored : DEFAULT_ADMIN_THEME;
  } catch {
    // Private windows and blocked site data both throw on access.
    return DEFAULT_ADMIN_THEME;
  }
}

/**
 * Reads and sets the admin theme.
 *
 * The caller puts `theme` on the element carrying `.admin-ui`; nothing is
 * written to <html>, so the storefront is never affected even when both are
 * open in the same tab.
 */
export function useAdminTheme() {
  const [theme, setThemeState] = useState<string>(() =>
    typeof window === 'undefined' ? DEFAULT_ADMIN_THEME : readStoredTheme(),
  );

  const setTheme = useCallback((next: string) => {
    if (!isKnown(next)) return;
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not being able to remember it is not a reason to refuse the change.
    }
  }, []);

  // A second admin tab should not drift out of step with this one.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && isKnown(event.newValue)) setThemeState(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { theme, setTheme, themes: ADMIN_THEMES };
}
