import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, assetUrl } from '../../lib/api';
import type { Category, Product } from '../../lib/types';
import { formatPrice, toNumber } from '../../lib/format';
import { CloseIcon, SearchIcon } from '../ui';

export function SearchOverlay({
  open, onClose, onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const [term, setTerm] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTerm('');
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const suggestQuery = useQuery({
    queryKey: ['search-suggest', term],
    queryFn: () =>
      api.get<{ products: Product[]; categories: Category[] }>(
        '/catalog/products/search-suggest',
        { q: term },
      ),
    enabled: open && term.trim().length >= 2,
    staleTime: 30 * 1000,
  });

  if (!open) return null;

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!term.trim()) return;
    onNavigate(`/shop?search=${encodeURIComponent(term.trim())}`);
    onClose();
  };

  const results = suggestQuery.data;

  return (
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-ink/45 backdrop-blur-[2px]"
      />

      <div className="relative mx-auto mt-0 w-full max-w-2xl bg-paper shadow-panel animate-fade-up sm:mt-[8vh]">
        <form onSubmit={submit} className="flex items-center gap-3 border-b border-stone-line px-5 py-4">
          <SearchIcon size={19} className="shrink-0 text-ink-400" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search nameplates, signs, prints…"
            className="flex-1 bg-transparent text-base outline-none placeholder:text-ink-300"
            aria-label="Search products"
          />
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 p-1.5 text-ink-400 transition-colors hover:text-ink"
            aria-label="Close"
          >
            <CloseIcon size={19} />
          </button>
        </form>

        {term.trim().length >= 2 ? (
          <div className="max-h-[60vh] overflow-y-auto p-5">
            {suggestQuery.isLoading ? (
              <p className="py-8 text-center text-sm text-ink-400">Searching…</p>
            ) : results && (results.products.length || results.categories.length) ? (
              <>
                {results.categories.length ? (
                  <div className="mb-6">
                    <p className="eyebrow mb-2.5">Categories</p>
                    <div className="flex flex-wrap gap-2">
                      {results.categories.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            onNavigate(`/shop/${c.slug}`);
                            onClose();
                          }}
                          className="border border-stone-line px-3.5 py-2 text-sm transition-colors hover:border-ink"
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {results.products.length ? (
                  <div>
                    <p className="eyebrow mb-2.5">Products</p>
                    <ul className="space-y-1">
                      {results.products.map((p) => {
                        const price = toNumber(p.price);
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => {
                                onNavigate(`/product/${p.slug}`);
                                onClose();
                              }}
                              className="flex w-full items-center gap-3.5 p-2 text-left transition-colors hover:bg-paper-warm"
                            >
                              <img
                                src={assetUrl(p.images?.[0]?.url)}
                                alt=""
                                className="h-14 w-14 shrink-0 bg-paper-warm object-cover"
                              />
                              <span className="flex-1 text-sm">{p.name}</span>
                              <span className="shrink-0 text-xs text-ink-400">
                                {price !== null ? formatPrice(price) : '—'}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => submit()}
                  className="mt-5 w-full border border-stone-line py-3 text-2xs uppercase tracking-architect transition-colors hover:border-ink"
                >
                  See all results for “{term}”
                </button>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-ink-400">
                Nothing matched “{term}”. Try a different word.
              </p>
            )}
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-ink-400">Type at least two characters to search.</p>
        )}
      </div>
    </div>
  );
}
