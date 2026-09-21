import { useCallback, useEffect, useState } from 'react';

const KEY = 'bw.recentlyViewed';
const MAX = 8;

/**
 * Remembers the last few products a visitor opened, per browser.
 * Purely a convenience, so every access is guarded — private windows and
 * blocked site data must not break the product page.
 */
function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function write(slugs: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(slugs.slice(0, MAX)));
  } catch {
    // Storage unavailable — recently-viewed simply does not persist.
  }
}

export function useRecentlyViewed(currentSlug?: string) {
  const [slugs, setSlugs] = useState<string[]>([]);

  // Read once on mount so the list reflects earlier visits.
  useEffect(() => {
    setSlugs(read().filter((s) => s !== currentSlug));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Record the current product, most recent first.
  useEffect(() => {
    if (!currentSlug) return;
    const next = [currentSlug, ...read().filter((s) => s !== currentSlug)].slice(0, MAX);
    write(next);
  }, [currentSlug]);

  const clear = useCallback(() => {
    write([]);
    setSlugs([]);
  }, []);

  return { slugs, clear };
}
