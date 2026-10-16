/**
 * Small in-process cache for public, read-heavy responses.
 *
 * Render and Neon can add noticeable network latency to every database round
 * trip. Public catalogue/content data changes far less often than it is read,
 * so keeping the composed response briefly in the web process removes repeat
 * queries and also collapses concurrent cache misses into one promise.
 */

interface CacheEntry<T> {
  value?: T;
  expiresAt: number;
  inFlight?: Promise<T>;
}

const entries = new Map<string, CacheEntry<unknown>>();
let generation = 0;

export async function cachedPublic<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = 60_000,
): Promise<T> {
  const now = Date.now();
  const existing = entries.get(key) as CacheEntry<T> | undefined;

  if (existing?.value !== undefined && existing.expiresAt > now) return existing.value;
  if (existing?.inFlight) return existing.inFlight;

  const startedInGeneration = generation;
  const inFlight = loader()
    .then((value) => {
      // An admin edit may finish while this query is still running. Do not let
      // that older result repopulate the cache after invalidation.
      if (generation === startedInGeneration) {
        entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      }
      return value;
    })
    .catch((error) => {
      entries.delete(key);
      throw error;
    });

  entries.set(key, { value: existing?.value, expiresAt: existing?.expiresAt ?? 0, inFlight });
  return inFlight;
}

/** Any successful admin mutation can affect one or more public responses. */
export function invalidatePublicCache(): void {
  generation += 1;
  entries.clear();
}

