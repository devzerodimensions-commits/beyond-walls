import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, assetUrl } from '../../lib/api';
import type { CatalogFilters, Category, GalleryItem } from '../../lib/types';
import { ArrowRight } from '../ui';

/**
 * Compact desktop mega menu.
 *
 * Three columns — collections, a contextual middle column and one lifestyle
 * image — all fed from the admin: categories, their subcategories, the
 * attribute groups that actually occur inside the hovered category, and the
 * category tile image. Deliberately capped in width and height so it never
 * blankets the viewport.
 */

interface Props {
  categories: Category[];
  filters: CatalogFilters | undefined;
  gallery: GalleryItem[];
  onNavigate: () => void;
}

/** Attribute groups worth surfacing in the menu, in the order they should appear. */
const MENU_GROUPS = ['material', 'style', 'shape', 'profession', 'requirement'];
const MAX_GROUPS = 4;
const MAX_VALUES = 5;
const MAX_SUBCATEGORIES = 6;

function rankGroups(filters: CatalogFilters | undefined, limit: number) {
  const all = filters?.attributes ?? [];
  return [...all]
    .sort((a, b) => {
      const ai = MENU_GROUPS.indexOf(a.slug);
      const bi = MENU_GROUPS.indexOf(b.slug);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .filter((g) => g.values.length > 0)
    .slice(0, limit);
}

export function MegaMenu({ categories, filters, gallery, onNavigate }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = useMemo(
    () => categories.find((c) => c.id === activeId) ?? categories[0],
    [categories, activeId],
  );

  /*
   * Filters for the hovered collection. The endpoint only returns attribute
   * values that occur inside that category, so the menu never offers a
   * combination that leads to an empty shop page. Cached per category, so
   * moving back up the list costs nothing.
   */
  const { data: scoped } = useQuery({
    queryKey: ['menu-filters', active?.slug],
    queryFn: () => api.get<CatalogFilters>('/catalog/filters', { category: active!.slug }),
    enabled: Boolean(active?.slug),
    staleTime: 5 * 60_000,
  });

  const subcategories = (active?.children ?? [])
    .filter((child) => child.showInMenu !== false && child.status === 'PUBLISHED')
    .slice(0, MAX_SUBCATEGORIES);

  // Contextual when the category has its own attributes, global otherwise.
  const scopedGroups = rankGroups(scoped, subcategories.length ? 2 : MAX_GROUPS);
  const groups = scopedGroups.length ? scopedGroups : rankGroups(filters, MAX_GROUPS);
  const isScoped = scopedGroups.length > 0;

  // The panel image follows the hovered collection, falling back to the gallery.
  const image = active?.image ?? active?.bannerImage ?? gallery[0]?.image ?? null;

  return (
    <div
      className={clsx(
        'w-[min(92vw,980px)] border border-stone-line bg-paper shadow-panel',
        'animate-fade-up overflow-hidden',
      )}
    >
      <div className="grid grid-cols-[180px_minmax(0,1fr)_240px]">
        {/* ---- Collections ---- */}
        <div className="border-r border-stone-line bg-paper-off px-5 py-6">
          <p className="eyebrow mb-4 text-ink-300">Collections</p>
          <ul className="space-y-0.5">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  to={`/shop/${category.slug}`}
                  onClick={onNavigate}
                  onMouseEnter={() => setActiveId(category.id)}
                  onFocus={() => setActiveId(category.id)}
                  className={clsx(
                    'flex items-center justify-between gap-2 px-2.5 py-2 text-sm transition-colors duration-200',
                    active?.id === category.id
                      ? 'bg-ink text-paper'
                      : 'text-ink-600 hover:text-ink',
                  )}
                >
                  <span>{category.name}</span>
                  <ArrowRight
                    size={13}
                    className={clsx(
                      'transition-opacity duration-200',
                      active?.id === category.id ? 'opacity-70' : 'opacity-0',
                    )}
                  />
                </Link>
              </li>
            ))}
          </ul>

          <Link
            to="/shop"
            onClick={onNavigate}
            className="link-underline mt-5 inline-block text-2xs uppercase tracking-architect text-ink-500"
          >
            View everything
          </Link>
        </div>

        {/* ---- Contextual column: this collection's ranges and filters ---- */}
        <div className="min-w-0 px-7 py-6">
          <p className="eyebrow mb-4 text-ink-300">
            {isScoped && active ? active.name : 'Shop by'}
          </p>

          <div className="grid grid-cols-2 gap-x-6 gap-y-6">
            {subcategories.length ? (
              <div>
                <p className="mb-2.5 text-2xs font-semibold uppercase tracking-architect text-ink">
                  Ranges
                </p>
                <ul className="space-y-1.5">
                  {subcategories.map((child) => (
                    <li key={child.id}>
                      <Link
                        to={`/shop/${active!.slug}?subcategory=${child.slug}`}
                        onClick={onNavigate}
                        className="text-sm text-ink-500 transition-colors duration-200 hover:text-ink"
                      >
                        {child.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {groups.map((group) => (
              <div key={group.id}>
                <p className="mb-2.5 text-2xs font-semibold uppercase tracking-architect text-ink">
                  {group.name}
                </p>
                <ul className="space-y-1.5">
                  {group.values.slice(0, MAX_VALUES).map((value) => (
                    <li key={value.id}>
                      <Link
                        // Scoped links stay inside the collection being browsed.
                        to={
                          isScoped && active
                            ? `/shop/${active.slug}?attr=${value.slug}`
                            : `/shop?attr=${value.slug}`
                        }
                        onClick={onNavigate}
                        className="group/link inline-flex items-center gap-1.5 text-sm text-ink-500 transition-colors duration-200 hover:text-ink"
                      >
                        {value.hexColor ? (
                          <span
                            className="h-2.5 w-2.5 shrink-0 border border-ink-100"
                            style={{ background: value.hexColor }}
                          />
                        ) : null}
                        {value.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {!subcategories.length && !groups.length ? (
              <p className="col-span-2 text-sm text-ink-400">
                Filter groups appear here once they are published in the admin.
              </p>
            ) : null}
          </div>
        </div>

        {/* ---- Lifestyle image ---- */}
        <Link
          to={active ? `/shop/${active.slug}` : '/shop'}
          onClick={onNavigate}
          className="group/panel relative flex flex-col justify-end overflow-hidden bg-paper-warm"
        >
          {image ? (
            <>
              <img
                src={assetUrl(image)}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-[900ms] ease-architect group-hover/panel:scale-[1.06]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent" />
            </>
          ) : null}

          <div className={clsx('relative p-6', image ? 'text-paper' : 'text-ink')}>
            <p className="text-lg font-medium leading-snug">{active?.name ?? 'Shop'}</p>
            <span className="mt-2.5 inline-flex items-center gap-1.5 text-2xs uppercase tracking-architect">
              Shop now
              <ArrowRight
                size={13}
                className="transition-transform duration-300 group-hover/panel:translate-x-1"
              />
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
}
