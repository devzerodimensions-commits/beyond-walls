import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, assetUrl } from '../../lib/api';
import type { CatalogFilters, Category, Product } from '../../lib/types';
import { Seo, breadcrumbSchema, collectionSchema } from '../../lib/seo';
import { useSettings } from '../../context/StoreProvider';
import { ProductGrid } from '../../components/product/ProductCard';
import {
  Button, ButtonLink, ChevronDown, CloseIcon, Drawer, EmptyState, FilterIcon,
  Pagination, Select, Skeleton,
} from '../../components/ui';

const PER_PAGE = 12;

export default function ShopPage() {
  const { categorySlug } = useParams();
  const [params, setParams] = useSearchParams();
  const { settings } = useSettings();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const page = Number(params.get('page')) || 1;
  const sort = params.get('sort') ?? 'featured';
  const search = params.get('search') ?? '';
  const selectedAttrs = useMemo(
    () => (params.get('attr') ?? '').split(',').filter(Boolean),
    [params],
  );
  const selectedBudgets = useMemo(
    () => (params.get('budget') ?? '').split(',').filter(Boolean),
    [params],
  );
  const inStockOnly = params.get('inStock') === 'true';

  // --- Data ----------------------------------------------------------------
  const categoryQuery = useQuery({
    queryKey: ['category', categorySlug],
    queryFn: () => api.get<Category>(`/catalog/categories/${categorySlug}`),
    enabled: Boolean(categorySlug),
  });

  const filtersQuery = useQuery({
    queryKey: ['catalog-filters', categorySlug],
    queryFn: () => api.get<CatalogFilters>('/catalog/filters', { category: categorySlug }),
    staleTime: 5 * 60 * 1000,
  });

  const productsQuery = useQuery({
    queryKey: ['products', categorySlug, page, sort, search, selectedAttrs, selectedBudgets, inStockOnly],
    queryFn: () =>
      api.list<Product[]>('/catalog/products', {
        category: categorySlug,
        page,
        perPage: PER_PAGE,
        sort,
        search,
        attr: selectedAttrs,
        budget: selectedBudgets,
        inStock: inStockOnly ? 'true' : undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const products = productsQuery.data?.data ?? [];
  const meta = productsQuery.data?.meta;
  const category = categoryQuery.data;
  const filters = filtersQuery.data;

  /*
   * Wording for the empty state. A subcategory is a "range" inside a
   * collection, so calling it a category reads wrong — and a parent whose
   * ranges are all empty should say so rather than claim the whole collection
   * is unpublished.
   */
  const isSubcategory = Boolean(category?.parent);
  const stockedChildren = (category?.children ?? []).filter(
    (child) => (child._count?.products ?? 0) > 0,
  );
  const emptyTitle = search
    ? 'Nothing matched that search'
    : isSubcategory
      ? `No ${category!.name.toLowerCase()} yet`
      : 'Nothing here yet';
  const emptyDescription = search
    ? `We could not find anything for “${search}”. Try a different word, or ask us for a custom piece.`
    : isSubcategory
      ? `This range is part of ${category?.parent?.name ?? 'the catalogue'}. Nothing is published in it yet — browse the rest of the collection, or ask us for a custom piece.`
      : 'Nothing is published in this collection yet. Browse everything, or ask us for a custom piece.';

  // --- URL helpers ---------------------------------------------------------
  const update = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params);
      mutate(next);
      next.delete('page'); // any filter change returns to page 1
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const toggleValue = useCallback(
    (key: 'attr' | 'budget', value: string) => {
      update((next) => {
        const current = (next.get(key) ?? '').split(',').filter(Boolean);
        const updated = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
        if (updated.length) next.set(key, updated.join(','));
        else next.delete(key);
      });
    },
    [update],
  );

  const clearAll = useCallback(() => {
    const next = new URLSearchParams();
    if (search) next.set('search', search);
    setParams(next, { replace: true });
  }, [search, setParams]);

  const goToPage = useCallback(
    (nextPage: number) => {
      const next = new URLSearchParams(params);
      next.set('page', String(nextPage));
      setParams(next);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [params, setParams],
  );

  const activeCount = selectedAttrs.length + selectedBudgets.length + (inStockOnly ? 1 : 0);

  // --- SEO -----------------------------------------------------------------
  const title = category?.seoTitle || category?.name || (search ? `Search: ${search}` : 'Shop');
  const description =
    category?.seoDescription ||
    category?.description ||
    'Browse nameplates, office signage, GST plates, QR stands, desk plates, prints and safety signs.';

  const crumbs = [
    { name: 'Home', href: '/' },
    { name: 'Shop', href: '/shop' },
    ...(category?.parent ? [{ name: category.parent.name, href: `/shop/${category.parent.slug}` }] : []),
    ...(category ? [{ name: category.name, href: `/shop/${category.slug}` }] : []),
  ];

  return (
    <>
      <Seo
        settings={settings}
        title={title}
        description={description}
        keywords={category?.seoKeywords ?? undefined}
        canonical={categorySlug ? `/shop/${categorySlug}` : '/shop'}
        image={category?.bannerImage ?? category?.image}
        // Filtered / paged views are kept out of the index to avoid duplicates.
        noindex={activeCount > 0 || page > 1}
        schema={[
          breadcrumbSchema(crumbs, settings),
          ...(products.length ? [collectionSchema(title, description, products, settings)] : []),
        ]}
      />

      {/* Header */}
      <section className="border-b border-stone-line bg-paper">
        <div className="container-site py-7 lg:py-10">
          <Breadcrumbs crumbs={crumbs} />
          <h1 className="mt-3 text-[1.75rem] lg:text-[2.5rem]">
            {search ? `Results for “${search}”` : (category?.name ?? 'All products')}
          </h1>
          {category?.description ? (
            <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-ink-500">
              {category.description}
            </p>
          ) : null}

          {/* Subcategory chips */}
          {category?.children?.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {category.children.map((child) => (
                <Link
                  key={child.id}
                  to={`/shop/${child.slug}`}
                  className="border border-stone-line px-4 py-2 text-xs transition-colors hover:border-ink"
                >
                  {child.name}
                  {child._count?.products ? (
                    <span className="ml-1.5 text-ink-300">{child._count.products}</span>
                  ) : null}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div className="container-site py-8">
        <div className="lg:grid lg:grid-cols-12 lg:gap-10">
          {/* Desktop filter rail */}
          <aside className="hidden lg:col-span-3 lg:block">
            <div className="sticky top-28">
              <FilterPanel
                filters={filters}
                loading={filtersQuery.isLoading}
                selectedAttrs={selectedAttrs}
                selectedBudgets={selectedBudgets}
                inStockOnly={inStockOnly}
                onToggle={toggleValue}
                onToggleStock={() =>
                  update((next) => {
                    if (inStockOnly) next.delete('inStock');
                    else next.set('inStock', 'true');
                  })
                }
                onClear={clearAll}
                activeCount={activeCount}
              />
            </div>
          </aside>

          <div className="lg:col-span-9">
            {/* Toolbar */}
            <div className="mb-8 flex items-center justify-between gap-4 border-b border-stone-line pb-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFiltersOpen(true)}
                  className="flex items-center gap-2 border border-stone-line px-4 py-2.5 text-2xs uppercase tracking-architect transition-colors hover:border-ink lg:hidden"
                >
                  <FilterIcon size={14} />
                  Filters
                  {activeCount > 0 ? (
                    <span className="flex h-4 min-w-[16px] items-center justify-center bg-ink px-1 text-[0.55rem] text-paper">
                      {activeCount}
                    </span>
                  ) : null}
                </button>
                <p className="text-xs text-ink-400">
                  {productsQuery.isLoading
                    ? 'Loading…'
                    : `${meta?.total ?? 0} product${meta?.total === 1 ? '' : 's'}`}
                </p>
              </div>

              <Select
                aria-label="Sort products"
                value={sort}
                onChange={(e) => update((next) => next.set('sort', e.target.value))}
                className="w-auto min-w-[180px] py-2 text-xs"
                options={filters?.sortOptions ?? [{ value: 'featured', label: 'Featured' }]}
              />
            </div>

            {/* Active filter pills */}
            {activeCount > 0 ? (
              <div className="mb-6 flex flex-wrap items-center gap-2">
                {selectedAttrs.map((slug) => {
                  const value = filters?.attributes
                    .flatMap((g) => g.values)
                    .find((v) => v.slug === slug);
                  return (
                    <FilterPill key={slug} onRemove={() => toggleValue('attr', slug)}>
                      {value?.name ?? slug}
                    </FilterPill>
                  );
                })}
                {selectedBudgets.map((slug) => {
                  const band = filters?.budgetBands.find((b) => b.slug === slug);
                  return (
                    <FilterPill key={slug} onRemove={() => toggleValue('budget', slug)}>
                      {band?.label ?? slug}
                    </FilterPill>
                  );
                })}
                {inStockOnly ? (
                  <FilterPill onRemove={() => update((next) => next.delete('inStock'))}>In stock</FilterPill>
                ) : null}
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-2xs uppercase tracking-architect text-ink-400 underline underline-offset-2 hover:text-ink"
                >
                  Clear all
                </button>
              </div>
            ) : null}

            {/* Grid */}
            {productsQuery.isLoading ? (
              <ProductGrid products={[]} loading columns={3} skeletonCount={9} />
            ) : products.length === 0 ? (
              <>
                {/*
                  A parent category with no products of its own is not an error —
                  point people at its subcategories instead of a dead end.
                */}
                {activeCount === 0 && stockedChildren.length ? (
                  <div>
                    <p className="mb-5 text-sm text-ink-500">
                      Browse the {category?.name.toLowerCase()} range:
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {stockedChildren.map((child) => (
                        <Link
                          key={child.id}
                          to={`/shop/${child.slug}`}
                          className="group flex items-center justify-between gap-3 border border-stone-line p-5 transition-colors hover:border-ink"
                        >
                          <span>
                            <span className="block text-sm font-medium">{child.name}</span>
                            {child.shortText ? (
                              <span className="mt-1 block text-xs text-ink-400">{child.shortText}</span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-2xs text-ink-300">
                            {child._count?.products === 1
                              ? '1 design'
                              : `${child._count?.products ?? 0} designs`}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title={activeCount > 0 ? 'No products matched' : emptyTitle}
                    description={
                      activeCount > 0
                        ? 'Try removing a filter, or browse the full catalogue.'
                        : emptyDescription
                    }
                    action={
                      activeCount > 0 ? (
                        <Button variant="secondary" size="sm" onClick={clearAll}>
                          Clear filters
                        </Button>
                      ) : (
                        <div className="flex flex-wrap justify-center gap-2">
                          <ButtonLink
                            to={isSubcategory ? `/shop/${category!.parent!.slug}` : '/shop'}
                            variant="secondary"
                            size="sm"
                          >
                            {isSubcategory ? `Back to ${category!.parent!.name}` : 'View all products'}
                          </ButtonLink>
                          <ButtonLink to="/custom-order" size="sm">
                            Request a custom piece
                          </ButtonLink>
                        </div>
                      )
                    }
                  />
                )}
              </>
            ) : (
              <>
                <ProductGrid products={products} columns={3} />
                <Pagination page={page} totalPages={meta?.totalPages ?? 1} onChange={goToPage} />
              </>
            )}

            {/* Category SEO copy sits below the grid, as search engines prefer */}
            {category?.description && !search ? (
              <div className="mt-12 border-t border-stone-line pt-10">
                <h2 className="text-lg">About {category.name}</h2>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-500">{category.description}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Mobile filter drawer */}
      <Drawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        side="left"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear all
            </Button>
            <Button size="sm" onClick={() => setFiltersOpen(false)}>
              Show {meta?.total ?? 0} results
            </Button>
          </div>
        }
      >
        <div className="p-5">
          <FilterPanel
            filters={filters}
            loading={filtersQuery.isLoading}
            selectedAttrs={selectedAttrs}
            selectedBudgets={selectedBudgets}
            inStockOnly={inStockOnly}
            onToggle={toggleValue}
            onToggleStock={() =>
              update((next) => {
                if (inStockOnly) next.delete('inStock');
                else next.set('inStock', 'true');
              })
            }
            onClear={clearAll}
            activeCount={activeCount}
            hideHeader
          />
        </div>
      </Drawer>
    </>
  );
}

// ---------------------------------------------------------------------------

function Breadcrumbs({ crumbs }: { crumbs: { name: string; href: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-2xs uppercase tracking-architect text-ink-400">
        {crumbs.map((crumb, index) => (
          <li key={crumb.href} className="flex items-center gap-1.5">
            {index > 0 ? <span className="text-ink-200">/</span> : null}
            {index === crumbs.length - 1 ? (
              <span className="text-ink">{crumb.name}</span>
            ) : (
              <Link to={crumb.href} className="transition-colors hover:text-ink">
                {crumb.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function FilterPill({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-ink bg-ink px-3 py-1.5 text-2xs uppercase tracking-architect text-paper">
      {children}
      <button type="button" onClick={onRemove} aria-label="Remove filter" className="opacity-70 hover:opacity-100">
        <CloseIcon size={11} />
      </button>
    </span>
  );
}

function FilterPanel({
  filters, loading, selectedAttrs, selectedBudgets, inStockOnly,
  onToggle, onToggleStock, onClear, activeCount, hideHeader,
}: {
  filters: CatalogFilters | undefined;
  loading: boolean;
  selectedAttrs: string[];
  selectedBudgets: string[];
  inStockOnly: boolean;
  onToggle: (key: 'attr' | 'budget', value: string) => void;
  onToggleStock: () => void;
  onClear: () => void;
  activeCount: number;
  hideHeader?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {!hideHeader ? (
        <div className="mb-6 flex items-center justify-between border-b border-stone-line pb-3">
          <h2 className="text-2xs font-semibold uppercase tracking-architect">Filter</h2>
          {activeCount > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="text-2xs uppercase tracking-architect text-ink-400 underline underline-offset-2 hover:text-ink"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Budget */}
      {filters?.budgetBands?.length ? (
        <FilterGroupBlock title="Budget" defaultOpen>
          <ul className="space-y-2">
            {filters.budgetBands.map((band) => (
              <li key={band.slug}>
                <FilterCheckbox
                  label={band.label}
                  checked={selectedBudgets.includes(band.slug)}
                  onChange={() => onToggle('budget', band.slug)}
                />
              </li>
            ))}
          </ul>
        </FilterGroupBlock>
      ) : null}

      {/* Attribute rails */}
      {filters?.attributes.map((group) => (
        <FilterGroupBlock key={group.id} title={group.name} defaultOpen={group.values.length <= 8}>
          <ul className="space-y-2">
            {group.values.map((value) => (
              <li key={value.id}>
                <FilterCheckbox
                  label={value.name}
                  count={value.count}
                  hex={value.hexColor}
                  checked={selectedAttrs.includes(value.slug)}
                  onChange={() => onToggle('attr', value.slug)}
                />
              </li>
            ))}
          </ul>
        </FilterGroupBlock>
      ))}

      <FilterGroupBlock title="Availability" defaultOpen>
        <FilterCheckbox label="In stock only" checked={inStockOnly} onChange={onToggleStock} />
      </FilterGroupBlock>
    </div>
  );
}

function FilterGroupBlock({
  title, children, defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-stone-line py-4 first:pt-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-1 text-left"
      >
        <span className="text-2xs font-semibold uppercase tracking-architect">{title}</span>
        <ChevronDown size={13} className={clsx('text-ink-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function FilterCheckbox({
  label, checked, onChange, count, hex,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  count?: number;
  hex?: string | null;
}) {
  return (
    <label className="group flex cursor-pointer items-center gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none border border-ink-300 bg-paper transition-colors checked:border-ink checked:bg-ink
                   checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22white%22><path d=%22M6.2 11.3 3.4 8.5l1-1 1.8 1.8 4.4-4.4 1 1z%22/></svg>')] checked:bg-center checked:bg-no-repeat"
      />
      {hex ? <span className="h-3.5 w-3.5 shrink-0 border border-ink-100" style={{ background: hex }} /> : null}
      <span className={clsx('flex-1 text-xs transition-colors', checked ? 'text-ink' : 'text-ink-500 group-hover:text-ink')}>
        {label}
      </span>
      {count !== undefined ? <span className="text-2xs text-ink-300">{count}</span> : null}
    </label>
  );
}
