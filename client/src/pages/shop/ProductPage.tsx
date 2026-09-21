import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../../lib/api';
import type { Faq, Product } from '../../lib/types';
import { Seo, breadcrumbSchema, productSchema } from '../../lib/seo';
import { formatPrice, toNumber } from '../../lib/format';
import { effectivePrice, sellableVariants, stockState } from '../../lib/pricing';
import { useCart, useSettings, useWishlist } from '../../context/StoreProvider';
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed';
import { ProductCard, ProductGrid } from '../../components/product/ProductCard';
import { GalleryBadges, ProductGallery } from '../../components/product/ProductGallery';
import { LivePreview, buildPreviewSlots } from '../../components/product/LivePreview';
import {
  PersonalizationForm,
  defaultPersonalizationValues,
  personalizationCost,
  validatePersonalizationValues,
} from '../../components/product/PersonalizationForm';
import {
  Badge, Button, ButtonLink, CartIcon, CheckIcon, ChevronDown, EmptyState,
  HeartIcon, MinusIcon, PageLoader, PlusIcon,
} from '../../components/ui';

export default function ProductPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { settings, get } = useSettings();
  const { addItem } = useCart();
  const { isWishlisted, toggle } = useWishlist();

  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'cart' | 'buy' | null>(null);

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => api.get<Product>(`/catalog/products/${slug}`),
    enabled: Boolean(slug),
  });

  const { slugs: recentSlugs } = useRecentlyViewed(slug);

  const recentQuery = useQuery({
    queryKey: ['recently-viewed', recentSlugs],
    queryFn: () => api.get<Product[]>('/catalog/products', { slugs: recentSlugs }),
    enabled: recentSlugs.length > 0,
    staleTime: 60 * 1000,
  });

  const faqQuery = useQuery({
    queryKey: ['faqs', 'product'],
    queryFn: () => api.get<Faq[]>('/faqs'),
    staleTime: 5 * 60 * 1000,
  });

  const fields = useMemo(() => product?.personalization ?? [], [product]);

  useEffect(() => {
    if (!product) return;
    setQuantity(product.minOrderQty ?? 1);
    setValues(defaultPersonalizationValues(product.personalization ?? []));
    setErrors({});
    /*
     * Pre-select only when the choice is unambiguous: a single option, or one
     * the admin marked as default. Otherwise the customer must pick, so nobody
     * buys a size they never chose.
     */
    const published = sellableVariants(product.variants);
    const preselected =
      published.length === 1 ? published[0] : published.find((v) => v.isDefault);
    setVariantId(preselected?.id ?? null);
  }, [product]);

  if (isLoading) return <PageLoader label="Loading product" />;
  if (isError || !product) {
    return (
      <div className="container-site py-24">
        <EmptyState
          title="Product not found"
          description="This product may have been removed or is no longer published."
          action={<ButtonLink to="/shop">Browse the shop</ButtonLink>}
        />
      </div>
    );
  }

  const variants = sellableVariants(product.variants);
  const variant = variants.find((v) => v.id === variantId) ?? null;

  // Variant price wins; a product with no base price is still buyable when the
  // selected variant carries one.
  const basePrice = effectivePrice(product, variant);
  const hasPrice = basePrice !== null;
  // More than one option means a deliberate choice is required.
  const mustChooseVariant = variants.length > 1 && !variant;
  const customCost = personalizationCost(fields, values);
  const unitPrice = hasPrice ? (basePrice ?? 0) + customCost : null;
  const compareAt = toNumber(product.compareAtPrice);
  const discount =
    hasPrice && compareAt && compareAt > (basePrice ?? 0)
      ? Math.round(((compareAt - (basePrice ?? 0)) / compareAt) * 100)
      : null;

  const { stock, outOfStock, lowStock } = stockState(product, variant);
  const maxQty = Math.min(product.maxOrderQty ?? 99, stock ?? 99);

  const saved = isWishlisted(product.id);
  const wishlistEnabled = get<boolean>('store.enableWishlist', true);
  const previewSlots = buildPreviewSlots(fields, values);

  const crumbs = [
    { name: 'Home', href: '/' },
    { name: 'Shop', href: '/shop' },
    ...(product.category ? [{ name: product.category.name, href: `/shop/${product.category.slug}` }] : []),
    { name: product.name, href: `/product/${product.slug}` },
  ];

  const submit = async (mode: 'cart' | 'buy') => {
    const validation = validatePersonalizationValues(fields, values);
    if (Object.keys(validation).length) {
      setErrors(validation);
      document.getElementById('personalise')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setErrors({});
    setBusy(mode);
    try {
      await addItem({ productId: product.id, variantId, quantity, personalization: values });
      if (mode === 'buy') navigate('/checkout');
    } finally {
      setBusy(null);
    }
  };

  // --- Content sections, only rendered when the admin has filled them in ----
  const specs = [
    product.sku ? { label: 'SKU', value: product.sku } : null,
    product.widthInches && product.heightInches
      ? { label: 'Size', value: `${product.widthInches} × ${product.heightInches} inches` }
      : null,
    product.depthMm ? { label: 'Thickness', value: `${product.depthMm} mm` } : null,
    product.weightGrams ? { label: 'Weight', value: `${product.weightGrams} g` } : null,
    ...(product.attributes ?? []).map((a) => ({ label: a.value.group.name, value: a.value.name })),
  ].filter(Boolean) as { label: string; value: string }[];

  const faqs = faqQuery.data ?? [];
  const recent = (recentQuery.data ?? []).filter((p) => p.slug !== product.slug);

  return (
    <>
      <Seo
        settings={settings}
        title={product.seoTitle || product.name}
        description={product.seoDescription || product.shortDescription || ''}
        keywords={product.seoKeywords ?? undefined}
        image={product.ogImage || product.images[0]?.url}
        canonical={`/product/${product.slug}`}
        type="product"
        schema={[productSchema(product, settings), breadcrumbSchema(crumbs, settings)]}
      />

      <div className="container-site py-6 lg:py-10">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex flex-wrap items-center gap-1.5 text-2xs uppercase tracking-architect text-ink-400">
            {crumbs.map((crumb, i) => (
              <li key={crumb.href} className="flex items-center gap-1.5">
                {i > 0 ? <span className="text-ink-200">/</span> : null}
                {i === crumbs.length - 1 ? (
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

        {/* ---------------- Gallery + purchase panel ---------------- */}
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <ProductGallery
              images={product.images}
              productName={product.name}
              badges={
                <GalleryBadges badge={product.badge} isNew={product.isNew} discount={discount} />
              }
            />

            {/* Live preview sits under the gallery, at a generous size. */}
            {product.livePreviewEnabled ? (
              <div className="mt-4 border border-stone-line">
                <LivePreview
                  template={product.livePreviewTemplate}
                  config={product.livePreviewConfig}
                  slots={previewSlots}
                />
              </div>
            ) : null}
          </div>

          {/* Sticky purchase panel */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-[92px]">
              {product.category ? (
                <Link to={`/shop/${product.category.slug}`} className="eyebrow link-underline">
                  {product.category.name}
                </Link>
              ) : null}

              <h1 className="mt-3 text-[1.75rem] leading-tight lg:text-4xl">{product.name}</h1>

              {product.shortDescription ? (
                <p className="mt-3.5 text-sm leading-relaxed text-ink-500">
                  {product.shortDescription}
                </p>
              ) : null}

              {/* Price */}
              <div className="mt-5 flex flex-wrap items-baseline gap-3">
                {hasPrice ? (
                  <>
                    <span className="text-2xl font-medium">{formatPrice(unitPrice)}</span>
                    {compareAt && compareAt > (basePrice ?? 0) ? (
                      <span className="text-sm text-ink-300 line-through">
                        {formatPrice(compareAt)}
                      </span>
                    ) : null}
                    {customCost > 0 ? (
                      <span className="text-2xs text-ink-400">
                        incl. {formatPrice(customCost)} personalisation
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-lg font-medium text-ink-500">
                    {get<string>('store.priceOnRequestLabel', 'Price on request')}
                  </span>
                )}
              </div>

              {hasPrice ? (
                <p className="mt-1.5 text-2xs text-ink-400">
                  {get<boolean>('tax.pricesIncludeTax', true)
                    ? 'Inclusive of all taxes'
                    : 'Plus applicable taxes'}
                </p>
              ) : null}

              {/* Stock */}
              {product.trackInventory ? (
                <p
                  className={clsx(
                    'mt-3.5 flex items-center gap-1.5 text-xs',
                    outOfStock ? 'text-state-danger' : lowStock ? 'text-state-warning' : 'text-state-success',
                  )}
                >
                  {!outOfStock ? <CheckIcon size={13} /> : null}
                  {outOfStock ? 'Out of stock' : lowStock ? `Only ${stock} left` : 'In stock'}
                </p>
              ) : null}

              <div className="my-6 rule" />

              {/* Variants */}
              {variants.length > 1 ? (
                <div className="mb-6">
                  <p className="field-label" id="variant-label">Choose an option</p>
                  {/*
                    These are mutually exclusive choices, so they are a radio
                    group. Without the roles a screen reader announces four
                    unrelated buttons and never says which one is selected.
                  */}
                  <div
                    role="radiogroup"
                    aria-labelledby="variant-label"
                    className="flex flex-wrap gap-2"
                  >
                    {variants.map((v) => {
                      const disabled = product.trackInventory && v.stock <= 0;
                      const selected = v.id === variantId;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-disabled={disabled || undefined}
                          disabled={disabled}
                          onClick={() => setVariantId(v.id)}
                          className={clsx(
                            'border px-4 py-2.5 text-xs transition-colors duration-200',
                            selected
                              ? 'border-ink bg-ink text-paper'
                              : 'border-stone-line hover:border-ink',
                            disabled && 'cursor-not-allowed line-through opacity-40',
                          )}
                        >
                          {v.label}
                          {v.price !== null && toNumber(v.price) !== basePrice ? (
                            <span className="ml-2 opacity-70">{formatPrice(v.price)}</span>
                          ) : null}
                          {disabled ? <span className="sr-only"> — out of stock</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Personalisation */}
              {fields.length ? (
                <div id="personalise" className="mb-6 border border-stone-line bg-paper p-5">
                  <h2 className="mb-1 text-xs font-semibold uppercase tracking-architect">
                    Personalise
                  </h2>
                  <p className="mb-5 text-2xs text-ink-400">
                    Your details are attached to the order and used for production.
                  </p>
                  <PersonalizationForm
                    fields={fields}
                    values={values}
                    errors={errors}
                    onChange={(key, value) => {
                      setValues((prev) => ({ ...prev, [key]: value }));
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      });
                    }}
                  />
                </div>
              ) : null}

              {/* Quantity + actions */}
              {hasPrice ? (
                <div className="space-y-3">
                  <div className="flex items-stretch gap-3">
                    <div className="flex items-center border border-stone-line">
                      <button
                        type="button"
                        onClick={() => setQuantity(Math.max(product.minOrderQty ?? 1, quantity - 1))}
                        disabled={quantity <= (product.minOrderQty ?? 1)}
                        className="px-3.5 py-3.5 text-ink-500 transition-colors hover:text-ink disabled:opacity-30"
                        aria-label="Decrease quantity"
                      >
                        <MinusIcon size={14} />
                      </button>
                      <span className="min-w-[42px] text-center text-sm tabular-nums">{quantity}</span>
                      <button
                        type="button"
                        onClick={() => setQuantity(Math.min(maxQty, quantity + 1))}
                        disabled={quantity >= maxQty}
                        className="px-3.5 py-3.5 text-ink-500 transition-colors hover:text-ink disabled:opacity-30"
                        aria-label="Increase quantity"
                      >
                        <PlusIcon size={14} />
                      </button>
                    </div>

                    <Button
                      variant="secondary"
                      size="lg"
                      fullWidth
                      icon={<CartIcon size={16} />}
                      loading={busy === 'cart'}
                      disabled={outOfStock || mustChooseVariant || busy !== null}
                      onClick={() => void submit('cart')}
                    >
                      {outOfStock ? 'Out of stock' : mustChooseVariant ? 'Choose an option' : 'Add to cart'}
                    </Button>
                  </div>

                  <Button
                    size="lg"
                    fullWidth
                    loading={busy === 'buy'}
                    disabled={outOfStock || mustChooseVariant || busy !== null}
                    onClick={() => void submit('buy')}
                  >
                    Buy now
                  </Button>

                  {mustChooseVariant ? (
                    <p className="text-center text-2xs text-state-warning">
                      Select an option above to continue.
                    </p>
                  ) : null}

                  {wishlistEnabled ? (
                    <button
                      type="button"
                      onClick={() => void toggle(product.id)}
                      className="flex w-full items-center justify-center gap-2 py-2 text-2xs uppercase tracking-architect text-ink-500 transition-colors hover:text-ink"
                    >
                      <HeartIcon size={14} className={saved ? 'fill-current text-ink' : ''} />
                      {saved ? 'Saved to wishlist' : 'Save to wishlist'}
                    </button>
                  ) : null}
                </div>
              ) : (
                /*
                 * Catalogue products are direct-purchase. When no price has been
                 * published yet the panel says so plainly rather than inventing
                 * one — bespoke work goes through the Custom Order form.
                 */
                <div className="space-y-3">
                  <Button size="lg" fullWidth disabled>
                    Add to cart
                  </Button>
                  <p className="text-2xs leading-relaxed text-ink-400">
                    This product is temporarily unavailable to order. Looking for something bespoke?
                    Start a{' '}
                    <Link to="/custom-order" className="link-underline text-ink">
                      custom order
                    </Link>
                    .
                  </p>
                </div>
              )}

              {/* Quick reassurance strip — only shows what the admin has filled in */}
              <ul className="mt-6 space-y-2 border-t border-stone-line pt-5 text-xs text-ink-500">
                {product.productionDays ? (
                  <li className="flex gap-2.5">
                    <CheckIcon size={13} className="mt-0.5 shrink-0 text-ink-300" />
                    Made to order in about {product.productionDays} days
                  </li>
                ) : null}
                {fields.length ? (
                  <li className="flex gap-2.5">
                    <CheckIcon size={13} className="mt-0.5 shrink-0 text-ink-300" />
                    Personalised before production
                  </li>
                ) : null}
                {product.shippingNote ? (
                  <li className="flex gap-2.5">
                    <CheckIcon size={13} className="mt-0.5 shrink-0 text-ink-300" />
                    {product.shippingNote}
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
        </div>

        {/* ---------------- Detail sections ---------------- */}
        <div className="mt-14 grid gap-10 lg:mt-20 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-8">
            {product.description ? (
              <Section title="Description">
                <p className="whitespace-pre-line">{product.description}</p>
              </Section>
            ) : null}

            {product.designNote ? (
              <Section title="Design">
                <p className="whitespace-pre-line">{product.designNote}</p>
              </Section>
            ) : null}

            {product.materialNote ? (
              <Section title="Material & finish">
                <p className="whitespace-pre-line">{product.materialNote}</p>
              </Section>
            ) : null}

            {product.features?.length ? (
              <Section title="Features">
                <BulletList items={product.features} />
              </Section>
            ) : null}

            {product.includedItems?.length ? (
              <Section title="What's included">
                <BulletList items={product.includedItems} />
              </Section>
            ) : null}

            {product.applications?.length ? (
              <Section title="Ideal for">
                <BulletList items={product.applications} columns />
              </Section>
            ) : null}

            {product.installationNote ? (
              <Section title="Installation">
                <p className="whitespace-pre-line">{product.installationNote}</p>
              </Section>
            ) : null}

            {product.careInstructions ? (
              <Section title="Care">
                <p className="whitespace-pre-line">{product.careInstructions}</p>
              </Section>
            ) : null}

            {product.shippingNote ? (
              <Section title="Shipping">
                <p className="whitespace-pre-line">{product.shippingNote}</p>
              </Section>
            ) : null}
          </div>

          {/* Dimensions / spec rail */}
          <aside className="lg:col-span-4">
            {specs.length ? (
              <div className="border border-stone-line p-6">
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-architect">
                  Dimensions & specification
                </h2>
                <dl className="divide-y divide-stone-line/70">
                  {specs.map((spec) => (
                    <div
                      key={`${spec.label}-${spec.value}`}
                      className="flex justify-between gap-4 py-2.5 text-sm"
                    >
                      <dt className="shrink-0 text-ink-400">{spec.label}</dt>
                      <dd className="text-right text-ink-700">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {variants.length ? (
              <div className="mt-5 border border-stone-line p-6">
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-architect">
                  Available options
                </h2>
                <ul className="space-y-2 text-sm">
                  {variants.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-3">
                      <span className="text-ink-600">{v.label}</span>
                      {v.price !== null ? (
                        <span className="shrink-0 font-medium">{formatPrice(v.price)}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>

        {/* ---------------- FAQ ---------------- */}
        {faqs.length ? (
          <section className="mt-14 border-t border-stone-line pt-12 lg:mt-20">
            <h2 className="mb-7 text-xl lg:text-2xl">Frequently asked questions</h2>
            <div className="grid gap-x-12 lg:grid-cols-2">
              {faqs.slice(0, 6).map((faq) => (
                <details key={faq.id} className="group border-b border-stone-line">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 py-4 text-sm font-medium">
                    {faq.question}
                    <ChevronDown
                      size={15}
                      className="shrink-0 text-ink-400 transition-transform duration-300 group-open:rotate-180"
                    />
                  </summary>
                  <p className="-mt-1 pb-4 pr-8 text-sm leading-relaxed text-ink-500">{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {/* ---------------- Reviews (only if published) ---------------- */}
        {get<boolean>('store.enableReviews', false) && product.reviews?.length ? (
          <section className="mt-14 border-t border-stone-line pt-12 lg:mt-20">
            <h2 className="mb-7 text-xl lg:text-2xl">Customer reviews</h2>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {product.reviews.map((review) => (
                <div key={review.id} className="border border-stone-line p-6">
                  <div className="mb-3 flex gap-0.5" aria-label={`${review.rating} out of 5`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <span key={i} className={i < review.rating ? 'text-ink' : 'text-ink-200'}>
                        ★
                      </span>
                    ))}
                  </div>
                  {review.title ? <h3 className="text-sm font-medium">{review.title}</h3> : null}
                  <p className="mt-2 text-sm leading-relaxed text-ink-500">{review.content}</p>
                  <p className="mt-4 text-2xs uppercase tracking-architect text-ink-400">
                    {review.authorName}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ---------------- Related ---------------- */}
        {product.related?.length ? (
          <section className="mt-14 border-t border-stone-line pt-12 lg:mt-20">
            <h2 className="mb-7 text-xl lg:text-2xl">You may also like</h2>
            <ProductGrid products={product.related} columns={4} />
          </section>
        ) : null}

        {/* ---------------- Recently viewed ---------------- */}
        {recent.length ? (
          <section className="mt-14 border-t border-stone-line pt-12">
            <h2 className="mb-7 text-xl lg:text-2xl">Recently viewed</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
              {recent.slice(0, 4).map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {/* ---------------- Mobile sticky buy bar ---------------- */}
      {hasPrice && !outOfStock ? (
        <div className="sticky bottom-0 z-40 border-t border-stone-line bg-paper/95 px-4 py-3 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-2xs text-ink-400">{product.name}</p>
              <p className="text-sm font-medium">{formatPrice(unitPrice)}</p>
            </div>
            <Button
              size="md"
              loading={busy === 'buy'}
              disabled={busy !== null}
              onClick={() => void submit('buy')}
            >
              Buy now
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-9 last:mb-0">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-architect">{title}</h2>
      <div className="text-sm leading-relaxed text-ink-600">{children}</div>
    </section>
  );
}

function BulletList({ items, columns }: { items: string[]; columns?: boolean }) {
  return (
    <ul className={clsx('gap-x-8', columns ? 'grid sm:grid-cols-2' : 'space-y-1.5')}>
      {items.map((item) => (
        <li key={item} className={clsx('flex gap-2.5', columns && 'py-0.5')}>
          <span className="mt-[7px] h-1 w-1 shrink-0 bg-ink-300" />
          {item}
        </li>
      ))}
    </ul>
  );
}
