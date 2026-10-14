import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, assetUrl } from '../../lib/api';
import type { CatalogFilters, Category, GalleryItem, Product } from '../../lib/types';
import { ArrowRight } from '../ui';

/**
 * Desktop mega menu.
 *
 * Three columns: the collections down the left, the ranges inside the hovered
 * collection as picture tiles in the middle, and one lifestyle panel on the
 * right. Everything is fed from the admin — categories, their children, the
 * attribute groups that actually occur inside the hovered category, and the
 * tile images.
 *
 * The middle column used to be a list of words. A range is a thing you
 * recognise by sight long before you read its name, and "Way Finding" means
 * very little until you see one, so it shows the picture.
 *
 * Capped in width and height so it never blankets the viewport.
 */

interface Props {
  categories: Category[];
  filters: CatalogFilters | undefined;
  gallery: GalleryItem[];
  onNavigate: () => void;
}

/** Attribute groups worth surfacing in the menu, in the order they should appear. */
const MENU_GROUPS = ['material', 'style', 'shape', 'profession', 'requirement'];
const MAX_GROUPS = 3;
const MAX_VALUES = 5;
const MAX_RANGES = 6;

function rankGroups(filters: CatalogFilters | undefined, limit: number) {
  return [...(filters?.attributes ?? [])]
    .sort((a, b) => {
      const ai = MENU_GROUPS.indexOf(a.slug);
      const bi = MENU_GROUPS.indexOf(b.slug);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .filter((g) => g.values.length > 0)
    .slice(0, limit);
}

/**
 * One range, shown as a picture.
 *
 * Falls back to its own name set on a tinted panel when no image has been
 * uploaded for it yet. That matters: not one subcategory has a tile image at
 * the time of writing, and a grid of grey rectangles reads as broken, while a
 * typographic tile reads as a choice. Each one improves on its own the moment
 * somebody sets the image in Design → Categories.
 */
function RangeTile({
  name,
  to,
  image,
  onNavigate,
}: {
  name: string;
  to: string;
  image: string | null | undefined;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="group/tile block overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      {/*
        With a picture, the caption sits under it. Without one, the name is the
        tile — printing it inside the panel and again underneath says the same
        word twice and looks like a mistake, which is what it was.
      */}
      <div
        className={clsx(
          'relative flex items-center justify-center overflow-hidden bg-paper-warm transition-colors duration-300',
          image ? 'aspect-[4/3]' : 'aspect-[5/2] group-hover/tile:bg-paper-sand',
        )}
      >
        {image ? (
          <img
            src={assetUrl(image)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 ease-architect group-hover/tile:scale-[1.06]"
          />
        ) : (
          <span className="px-3 text-center text-xs leading-tight text-ink-600 transition-colors duration-300 group-hover/tile:text-ink">
            {name}
          </span>
        )}
      </div>
      {image ? (
        <p className="mt-2 text-xs text-ink-600 transition-colors duration-200 group-hover/tile:text-ink">
          {name}
        </p>
      ) : null}
    </Link>
  );
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

  /*
   * A collection with no ranges of its own.
   *
   * "For Home" has no children, so the middle column had a heading, three
   * filter words and a great deal of nothing. Its products stand in: they are
   * what the ranges would have pointed at anyway, and a picture of the thing
   * is a better answer to "what is in here" than the word "Acrylic".
   *
   * Only fetched for those collections, and cached per collection.
   */
  const hasRanges = (active?.children ?? []).some(
    (c) => c.showInMenu !== false && c.status === 'PUBLISHED',
  );
  const { data: standIns } = useQuery({
    queryKey: ['menu-products', active?.slug],
    queryFn: () => api.get<Product[]>('/catalog/products', { category: active!.slug, limit: 6 }),
    enabled: Boolean(active?.slug) && !hasRanges,
    staleTime: 5 * 60_000,
  });

  const ranges = (active?.children ?? [])
    .filter((child) => child.showInMenu !== false && child.status === 'PUBLISHED')
    .slice(0, MAX_RANGES);

  // Contextual when the category has its own attributes, global otherwise.
  const scopedGroups = rankGroups(scoped, MAX_GROUPS);
  const groups = scopedGroups.length ? scopedGroups : rankGroups(filters, MAX_GROUPS);
  const isScoped = scopedGroups.length > 0;

  // The panel image follows the hovered collection, falling back to the gallery.
  const image = active?.image ?? active?.bannerImage ?? gallery[0]?.image ?? null;

  return (
    <div className="w-[min(94vw,1040px)] animate-fade-up overflow-hidden border border-stone-line bg-paper shadow-panel">
      <div className="grid grid-cols-[190px_minmax(0,1fr)_240px]">
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
                  /*
                   * A touch screen has no hover. Without this, the first tap
                   * would navigate away before the panel had ever shown that
                   * category's work — so the first tap previews it and the
                   * second opens it.
                   */
                  onTouchStart={(event) => {
                    if (active?.id !== category.id) {
                      event.preventDefault();
                      setActiveId(category.id);
                    }
                  }}
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

        {/* ---- The ranges inside the hovered collection ---- */}
        <div className="min-w-0 px-7 py-6">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <p className="eyebrow text-ink-300">{active ? active.name : 'Shop by'}</p>
            {active ? (
              <Link
                to={`/shop/${active.slug}`}
                onClick={onNavigate}
                className="link-underline text-2xs uppercase tracking-architect text-ink-400"
              >
                See all
              </Link>
            ) : null}
          </div>

          {ranges.length ? (
            <div
              className={clsx(
                'grid gap-x-4 gap-y-4',
                // Four across three columns strands one on a row of its own.
                ranges.length === 4 ? 'grid-cols-2' : 'grid-cols-3',
              )}
            >
              {ranges.map((child) => (
                <RangeTile
                  key={child.id}
                  name={child.name}
                  image={child.image}
                  to={`/shop/${active!.slug}?subcategory=${child.slug}`}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          ) : standIns?.length ? (
            <div className="grid grid-cols-3 gap-x-4 gap-y-4">
              {standIns.slice(0, 6).map((product) => (
                <RangeTile
                  key={product.id}
                  name={product.name}
                  image={product.images?.[0]?.url ?? null}
                  to={`/product/${product.slug}`}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          ) : null}

          {/*
            The filters sit under the pictures rather than beside them: you
            choose what a thing is before you narrow it by material or shape.
          */}
          {groups.length ? (
            <div
              className={clsx(
                'flex flex-wrap gap-x-7 gap-y-4',
                ranges.length || standIns?.length ? 'mt-6 border-t border-stone-line pt-5' : '',
              )}
            >
              {groups.map((group) => (
                <div key={group.id}>
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-architect text-ink">
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
                          className="inline-flex items-center gap-1.5 text-sm text-ink-500 transition-colors duration-200 hover:text-ink"
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
            </div>
          ) : null}

          {!ranges.length && !standIns?.length && !groups.length ? (
            <p className="text-sm text-ink-400">
              Ranges and filter groups appear here once they are published in the admin.
            </p>
          ) : null}
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
