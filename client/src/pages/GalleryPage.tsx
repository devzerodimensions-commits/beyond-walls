import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, assetUrl } from '../lib/api';
import type { GalleryItem } from '../lib/types';
import { Seo } from '../lib/seo';
import { useSettings } from '../context/StoreProvider';
import { ButtonLink, ChevronLeft, ChevronRight, CloseIcon, EmptyState, Skeleton } from '../components/ui';

export default function GalleryPage() {
  const { settings } = useSettings();
  const [tag, setTag] = useState<string | null>(null);
  const [index, setIndex] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['gallery'],
    queryFn: () => api.get<GalleryItem[]>('/gallery'),
  });

  const items = data ?? [];
  const tags = useMemo(
    () => [...new Set(items.map((i) => i.tag).filter((t): t is string => Boolean(t)))],
    [items],
  );
  const filtered = useMemo(
    () => (tag ? items.filter((i) => i.tag === tag) : items),
    [items, tag],
  );

  const close = useCallback(() => setIndex(null), []);
  const go = useCallback(
    (delta: number) =>
      setIndex((i) => (i === null ? null : (i + delta + filtered.length) % filtered.length)),
    [filtered.length],
  );

  useEffect(() => {
    if (index === null) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [index, close, go]);

  const active = index !== null ? filtered[index] : null;

  return (
    <>
      <Seo
        settings={settings}
        title="Gallery"
        description="A look at nameplates, signage and prints made by Beyond Walls."
        canonical="/gallery"
        image={items[0]?.image}
      />

      <section className="border-b border-stone-line bg-paper">
        <div className="container-site py-10 lg:py-14">
          <p className="eyebrow mb-3">Recent work</p>
          <h1 className="text-3xl lg:text-[2.5rem]">Gallery</h1>
        </div>
      </section>

      <div className="container-site py-8 lg:py-12">
        {tags.length > 1 ? (
          <div className="mb-7 flex flex-wrap gap-2">
            <FilterChip active={tag === null} onClick={() => setTag(null)}>
              All
            </FilterChip>
            {tags.map((t) => (
              <FilterChip key={t} active={tag === t} onClick={() => setTag(t)}>
                {t}
              </FilterChip>
            ))}
          </div>
        ) : null}

        {isLoading ? (
          <div className="columns-2 gap-3 lg:columns-3 xl:columns-4 lg:gap-4 [&>*]:mb-3 lg:[&>*]:mb-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                className={clsx(
                  'w-full break-inside-avoid',
                  i % 3 === 0 ? 'aspect-[4/5]' : i % 3 === 1 ? 'aspect-square' : 'aspect-[4/3]',
                )}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Nothing in the gallery yet"
            description="Published gallery images will appear here."
            action={<ButtonLink to="/shop">Browse the shop</ButtonLink>}
          />
        ) : (
          /* True masonry via CSS columns — no layout library, no gaps. */
          <div className="columns-2 gap-3 lg:columns-3 xl:columns-4 lg:gap-4 [&>*]:mb-3 lg:[&>*]:mb-4">
            {filtered.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(i)}
                className="group relative block w-full break-inside-avoid overflow-hidden bg-paper-warm text-left"
              >
                <img
                  src={assetUrl(item.image)}
                  alt={item.title ?? ''}
                  loading="lazy"
                  className="w-full object-cover transition-transform duration-[900ms] ease-architect group-hover:scale-[1.05]"
                />
                <span className="absolute inset-0 bg-ink/0 transition-colors duration-300 group-hover:bg-ink/15" />

                {item.title || item.tag ? (
                  <span className="absolute inset-x-0 bottom-0 translate-y-full bg-ink/85 px-4 py-3 transition-transform duration-300 group-hover:translate-y-0">
                    {item.title ? (
                      <span className="block text-xs font-medium text-paper">{item.title}</span>
                    ) : null}
                    {item.tag ? (
                      <span className="mt-0.5 block text-2xs uppercase tracking-architect text-paper/60">
                        {item.tag}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {active ? (
        <div className="fixed inset-0 z-[90] flex flex-col bg-ink/95" role="dialog" aria-modal="true">
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-2xs uppercase tracking-architect text-paper/60">
              {(index ?? 0) + 1} / {filtered.length}
            </span>
            <button
              type="button"
              onClick={close}
              className="p-1.5 text-paper/70 transition-colors hover:text-paper"
              aria-label="Close"
            >
              <CloseIcon size={22} />
            </button>
          </div>

          <div className="relative flex flex-1 items-center justify-center px-4">
            <img
              src={assetUrl(active.image)}
              alt={active.title ?? ''}
              className="max-h-full max-w-full object-contain"
            />

            {filtered.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 border border-paper/25 p-3 text-paper transition-colors hover:bg-paper hover:text-ink"
                  aria-label="Previous"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 border border-paper/25 p-3 text-paper transition-colors hover:bg-paper hover:text-ink"
                  aria-label="Next"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            ) : null}
          </div>

          {active.title || active.caption ? (
            <div className="px-5 py-6 text-center">
              {active.title ? (
                <h2 className="text-base font-medium text-paper">{active.title}</h2>
              ) : null}
              {active.caption ? (
                <p className="mx-auto mt-1.5 max-w-lg text-sm text-paper/60">{active.caption}</p>
              ) : null}
            </div>
          ) : (
            <div className="pb-6" />
          )}
        </div>
      ) : null}
    </>
  );
}

function FilterChip({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'border px-4 py-2 text-2xs uppercase tracking-architect transition-colors duration-200',
        active ? 'border-ink bg-ink text-paper' : 'border-stone-line hover:border-ink',
      )}
    >
      {children}
    </button>
  );
}
