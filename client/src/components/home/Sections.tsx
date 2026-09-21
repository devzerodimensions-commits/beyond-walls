import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { assetUrl } from '../../lib/api';
import type {
  Banner, Category, Faq, GalleryItem, HomeSection, PersonalizationField, Product, Testimonial,
} from '../../lib/types';
import { ProductGrid } from '../product/ProductCard';
import { LivePreview, buildPreviewSlots } from '../product/LivePreview';
import { ArrowRight, ButtonLink, ChevronDown, Input } from '../ui';
import { useSettings } from '../../context/StoreProvider';

/** An attribute tile as resolved by the SHOP_BY_ATTRIBUTE section. */
interface AttributeTile {
  id: string;
  name: string;
  slug: string;
  hexColor: string | null;
  image: string | null;
  count: number;
  groupSlug: string;
}

// ---------------------------------------------------------------------------
// Shared heading
// ---------------------------------------------------------------------------

export function SectionHeading({
  title, subtitle, ctaLabel, ctaLink, align = 'left', className,
}: {
  title?: string | null;
  subtitle?: string | null;
  ctaLabel?: string | null;
  ctaLink?: string | null;
  align?: 'left' | 'center';
  className?: string;
}) {
  if (!title && !subtitle) return null;
  return (
    <div
      className={clsx(
        'mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between lg:mb-9',
        align === 'center' && 'sm:flex-col sm:items-center sm:text-center',
        className,
      )}
    >
      <div className="max-w-2xl">
        {title ? <h2 className="text-2xl sm:text-[1.75rem] lg:text-[2rem]">{title}</h2> : null}
        {subtitle ? (
          <p className="mt-2 text-sm leading-relaxed text-ink-500">{subtitle}</p>
        ) : null}
      </div>
      {ctaLabel && ctaLink ? (
        <Link
          to={ctaLink}
          className="link-underline shrink-0 text-2xs font-medium uppercase tracking-architect"
        >
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero — full-bleed, editorial
// ---------------------------------------------------------------------------

export function HeroSection({ section }: { section: HomeSection }) {
  const banner = (section.items as Banner[])?.[0];
  const config = (section.config ?? {}) as { image?: string; eyebrow?: string };

  /*
   * What an admin typed into the page editor wins. A banner record only fills
   * in what the block itself does not say — otherwise editing the heading in
   * the editor would appear to do nothing, because the banner silently
   * overrode it.
   */
  const eyebrow = config.eyebrow || banner?.eyebrow;
  const title = section.title || banner?.title;
  const subtitle = section.subtitle || banner?.subtitle;
  const ctaLabel = section.ctaLabel || banner?.ctaLabel;
  const ctaLink = section.ctaLink || banner?.link || '/shop';
  const image = config.image || banner?.image;

  return (
    <section className="relative isolate border-b border-stone-line bg-ink text-paper">
      {image ? (
        <>
          <picture>
            {banner?.mobileImage ? (
              <source media="(max-width: 640px)" srcSet={assetUrl(banner.mobileImage)} />
            ) : null}
            <img
              src={assetUrl(image)}
              alt=""
              className="absolute inset-0 -z-10 h-full w-full object-cover"
              {...{ fetchpriority: 'high' }}
            />
          </picture>
          {/* Keeps the headline legible over any photograph. */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/80 to-ink/25" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/70 via-transparent to-ink/30 sm:hidden" />
        </>
      ) : null}

      <div className="container-site">
        <div className="flex min-h-[78vh] max-w-3xl flex-col justify-center py-20 sm:min-h-[80vh] lg:min-h-[86vh] lg:py-28">
          {eyebrow ? (
            <p className="eyebrow mb-6 text-paper/60 animate-fade-up">{eyebrow}</p>
          ) : null}

          <h1 className="text-balance text-[2.75rem] font-medium leading-[0.98] tracking-tight animate-fade-up sm:text-6xl lg:text-[4.5rem]">
            {title}
          </h1>

          {subtitle ? (
            <p className="mt-7 max-w-xl text-base leading-relaxed text-paper/70 animate-fade-up lg:text-lg">
              {subtitle}
            </p>
          ) : null}

          <div className="mt-10 flex flex-wrap gap-3 animate-fade-up">
            {ctaLabel ? (
              <Link
                to={ctaLink}
                className="inline-flex items-center gap-2 bg-paper px-8 py-4 text-xs font-medium uppercase tracking-architect text-ink transition-colors duration-200 hover:bg-paper-warm"
              >
                {ctaLabel}
                <ArrowRight size={15} />
              </Link>
            ) : null}
            <Link
              to="/custom-order"
              className="inline-flex items-center gap-2 border border-paper/40 px-8 py-4 text-xs font-medium uppercase tracking-architect text-paper transition-colors duration-200 hover:border-paper hover:bg-paper hover:text-ink"
            >
              Custom order
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// USP strip
// ---------------------------------------------------------------------------

export function UspStrip({ section }: { section: HomeSection }) {
  const items = ((section.config?.items ?? []) as { title: string; text: string }[]) ?? [];
  if (!items.length) return null;

  return (
    <section className="border-b border-stone-line bg-paper">
      <div className="container-site grid divide-y divide-stone-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {items.map((item, index) => (
          <div key={item.title} className="flex gap-4 py-7 sm:px-7 sm:first:pl-0 sm:last:pr-0">
            <span className="font-mono text-2xs text-ink-300">0{index + 1}</span>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-architect">{item.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{item.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Category grid — image led, editorial rhythm
// ---------------------------------------------------------------------------

export function CategoryGrid({ section }: { section: HomeSection }) {
  const categories = section.items as Category[];
  if (!categories?.length) return null;

  return (
    <section className="container-site py-14 lg:py-18">
      <SectionHeading
        title={section.title}
        subtitle={section.subtitle}
        ctaLabel={section.ctaLabel}
        ctaLink={section.ctaLink}
      />

      <div className="grid auto-rows-[220px] grid-cols-2 gap-3 sm:auto-rows-[260px] lg:grid-cols-4 lg:gap-4">
        {categories.map((category, index) => (
          <Link
            key={category.id}
            to={`/shop/${category.slug}`}
            className={clsx(
              'group relative flex flex-col justify-end overflow-hidden bg-paper-sand p-5 lg:p-6',
              // First tile is the anchor: taller and wider on desktop.
              index === 0 && 'col-span-2 row-span-2 lg:col-span-2',
            )}
          >
            {category.image ? (
              <>
                <img
                  src={assetUrl(category.image)}
                  alt=""
                  loading={index === 0 ? 'eager' : 'lazy'}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-[900ms] ease-architect group-hover:scale-[1.07]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
              </>
            ) : (
              /*
               * No photograph yet — render a deliberate ink tile rather than an
               * empty cream box, so the grid never looks like dead space.
               */
              <div
                className="absolute inset-0 bg-ink transition-transform duration-[900ms] ease-architect group-hover:scale-[1.04]"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(135deg, rgba(255,255,255,0.045) 0 2px, transparent 2px 14px)',
                }}
              />
            )}

            <div className="relative text-paper">
              <h3 className={clsx('font-medium leading-tight', index === 0 ? 'text-2xl lg:text-3xl' : 'text-base lg:text-lg')}>
                {category.name}
              </h3>
              {index === 0 && category.shortText ? (
                <p className="mt-2 max-w-sm text-xs leading-relaxed text-paper/75">
                  {category.shortText}
                </p>
              ) : null}
              {category._count?.products ? (
                <p className="mt-1 text-2xs text-paper/50">
                  {category._count.products} product{category._count.products === 1 ? '' : 's'}
                </p>
              ) : null}
              <span className="mt-3 inline-flex items-center gap-1.5 text-2xs uppercase tracking-architect">
                Browse
                <ArrowRight
                  size={13}
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shop by attribute — material / style / shape rail
// ---------------------------------------------------------------------------

export function ShopByAttribute({ section }: { section: HomeSection }) {
  const tiles = section.items as unknown as AttributeTile[];
  if (!tiles?.length) return null;

  return (
    <section className="border-y border-stone-line bg-paper-warm py-14 lg:py-18">
      <div className="container-site">
        <SectionHeading
          title={section.title}
          subtitle={section.subtitle}
          ctaLabel={section.ctaLabel ?? 'All products'}
          ctaLink={section.ctaLink ?? '/shop'}
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((tile) => (
            <Link
              key={tile.id}
              to={`/shop?attr=${tile.slug}`}
              className="group flex flex-col border border-stone-line bg-paper transition-colors duration-300 hover:border-ink"
            >
              <span className="relative block aspect-[4/3] overflow-hidden bg-paper-warm">
                {tile.image ? (
                  <img
                    src={assetUrl(tile.image)}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 ease-architect group-hover:scale-105"
                  />
                ) : (
                  <span
                    className="absolute inset-0"
                    style={{
                      background: tile.hexColor ?? undefined,
                      backgroundImage: tile.hexColor
                        ? undefined
                        : 'repeating-linear-gradient(135deg,#F4F2EE 0 8px,#EDEAE4 8px 16px)',
                    }}
                  />
                )}
              </span>

              <span className="flex flex-1 items-center justify-between gap-2 px-3.5 py-3">
                <span className="text-xs font-medium leading-snug text-ink">{tile.name}</span>
                {tile.count > 0 ? (
                  <span className="text-2xs text-ink-300">{tile.count}</span>
                ) : null}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Featured products
// ---------------------------------------------------------------------------

export function FeaturedProducts({ section }: { section: HomeSection }) {
  const products = section.items as Product[];
  if (!products?.length) return null;

  return (
    <section className="container-site py-14 lg:py-18">
      <SectionHeading
        title={section.title}
        subtitle={section.subtitle}
        ctaLabel={section.ctaLabel}
        ctaLink={section.ctaLink}
      />
      <ProductGrid products={products} columns={4} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Live personalisation demo — try it before you buy
// ---------------------------------------------------------------------------

export function PersonalisationDemo({ section }: { section: HomeSection }) {
  const product = (section.items as Product[])?.[0];
  const fields = useMemo<PersonalizationField[]>(
    () => (product?.personalization ?? []).filter((f) => f.previewSlot),
    [product],
  );

  // Seeded with the field placeholders so the plate never looks empty.
  const [values, setValues] = useState<Record<string, string>>({});

  const slots = buildPreviewSlots(product?.personalization ?? [], values);
  const placeholders = useMemo(() => {
    const out: Record<string, string> = {};
    for (const field of fields) {
      if (field.previewSlot && field.placeholder) out[field.previewSlot] = field.placeholder;
    }
    return out;
  }, [fields]);

  if (!product) return null;

  // Only the text slots get an input here — colour/font stay on the product page.
  const textFields = fields.filter((f) =>
    ['number', 'line1', 'line2', 'line3'].includes(f.previewSlot ?? ''),
  );

  return (
    <section className="border-y border-stone-line bg-ink py-14 text-paper lg:py-20">
      <div className="container-site">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="eyebrow mb-5 text-paper/50">Personalise</p>
            <h2 className="text-balance text-2xl leading-tight sm:text-3xl lg:text-[2.5rem]">
              {section.title}
            </h2>
            {section.subtitle ? (
              <p className="mt-4 max-w-md text-sm leading-relaxed text-paper/65">
                {section.subtitle}
              </p>
            ) : null}

            <div className="mt-8 space-y-4">
              {textFields.map((field) => (
                <div key={field.id}>
                  <label
                    htmlFor={`demo-${field.key}`}
                    className="mb-1.5 block text-2xs font-medium uppercase tracking-architect text-paper/50"
                  >
                    {field.label}
                  </label>
                  <input
                    id={`demo-${field.key}`}
                    value={values[field.key] ?? ''}
                    maxLength={field.maxLength ?? undefined}
                    placeholder={field.placeholder ?? ''}
                    onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                    className="w-full border border-paper/25 bg-transparent px-3.5 py-2.5 text-sm text-paper transition-colors placeholder:text-paper/30 focus:border-paper focus:outline-none"
                  />
                </div>
              ))}
            </div>

            <ButtonLink
              to={`/product/${product.slug}`}
              size="lg"
              className="mt-8 border-paper bg-paper text-ink hover:bg-paper-warm"
            >
              {section.ctaLabel ?? 'Personalise this plate'}
            </ButtonLink>
          </div>

          {/* Preview panel */}
          <div className="bg-paper-warm p-4 sm:p-8">
            <LivePreview
              template={product.livePreviewTemplate}
              config={product.livePreviewConfig}
              slots={slots}
              placeholders={placeholders}
              className="bg-transparent p-0"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Gallery — masonry
// ---------------------------------------------------------------------------

export function GallerySection({ section }: { section: HomeSection }) {
  const items = section.items as GalleryItem[];
  if (!items?.length) return null;

  return (
    <section className="container-site py-14 lg:py-18">
      <SectionHeading
        title={section.title}
        subtitle={section.subtitle}
        ctaLabel={section.ctaLabel ?? 'View gallery'}
        ctaLink={section.ctaLink ?? '/gallery'}
      />

      {/* CSS columns give a true masonry flow without a layout library. */}
      <div className="columns-2 gap-3 lg:columns-4 lg:gap-4 [&>*]:mb-3 lg:[&>*]:mb-4">
        {items.map((item, index) => (
          <Link
            key={item.id}
            to="/gallery"
            className="group relative block break-inside-avoid overflow-hidden bg-paper-warm"
          >
            <img
              src={assetUrl(item.image)}
              alt={item.title ?? ''}
              loading="lazy"
              className={clsx(
                'w-full object-cover transition-transform duration-700 ease-architect group-hover:scale-105',
                // Alternating heights create the masonry rhythm.
                index % 3 === 0 ? 'aspect-[4/5]' : index % 3 === 1 ? 'aspect-square' : 'aspect-[4/3]',
              )}
            />
            {item.title ? (
              <span className="absolute inset-x-0 bottom-0 translate-y-full bg-ink/85 px-3 py-2.5 text-2xs text-paper transition-transform duration-300 group-hover:translate-y-0">
                {item.title}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------

export function TestimonialsSection({ section }: { section: HomeSection }) {
  const items = section.items as Testimonial[];
  if (!items?.length) return null;

  return (
    <section className="border-y border-stone-line bg-paper py-14 lg:py-18">
      <div className="container-site">
        <SectionHeading title={section.title} subtitle={section.subtitle} align="center" />
        <div className="grid gap-5 md:grid-cols-3">
          {items.map((item) => (
            <blockquote key={item.id} className="border border-stone-line p-7">
              {item.rating ? (
                <div className="mb-4 flex gap-0.5" aria-label={`${item.rating} out of 5`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <span key={i} className={i < (item.rating ?? 0) ? 'text-ink' : 'text-ink-200'}>
                      ★
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="text-sm leading-relaxed text-ink-600">{item.content}</p>
              <footer className="mt-5 flex items-center gap-3">
                {item.image ? (
                  <img src={assetUrl(item.image)} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : null}
                <div>
                  <cite className="block text-xs font-medium not-italic">{item.name}</cite>
                  {item.role || item.location ? (
                    <span className="text-2xs text-ink-400">
                      {[item.role, item.location].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                </div>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

export function FaqSection({ section }: { section: HomeSection }) {
  const items = section.items as Faq[];
  const [open, setOpen] = useState<string | null>(items?.[0]?.id ?? null);
  if (!items?.length) return null;

  return (
    <section className="container-site py-14 lg:py-18">
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-4">
          <h2 className="text-2xl sm:text-[1.75rem]">{section.title}</h2>
          {section.subtitle ? (
            <p className="mt-3 text-sm text-ink-500">{section.subtitle}</p>
          ) : null}
          <Link
            to="/contact"
            className="link-underline mt-5 inline-block text-2xs uppercase tracking-architect"
          >
            Still have a question? →
          </Link>
        </div>

        <div className="lg:col-span-8">
          <div className="border-t border-stone-line">
            {items.map((faq) => (
              <div key={faq.id} className="border-b border-stone-line">
                <button
                  type="button"
                  onClick={() => setOpen(open === faq.id ? null : faq.id)}
                  aria-expanded={open === faq.id}
                  className="flex w-full items-center justify-between gap-4 py-4.5 text-left"
                >
                  <span className="py-0.5 text-sm font-medium">{faq.question}</span>
                  <ChevronDown
                    size={15}
                    className={clsx(
                      'shrink-0 text-ink-400 transition-transform duration-300',
                      open === faq.id && 'rotate-180',
                    )}
                  />
                </button>
                {open === faq.id ? (
                  <p className="-mt-1 pb-5 pr-8 text-sm leading-relaxed text-ink-500">{faq.answer}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Banners & CTAs
// ---------------------------------------------------------------------------

export function BannerSplit({ section }: { section: HomeSection }) {
  const banners = section.items as Banner[];
  if (!banners?.length) return null;

  return (
    <section className="container-site py-7">
      <div className="grid gap-3 md:grid-cols-2 lg:gap-4">
        {banners.slice(0, 2).map((banner) => (
          <Link
            key={banner.id}
            to={banner.link ?? '/shop'}
            className="group relative flex min-h-[300px] flex-col justify-end overflow-hidden bg-paper-sand p-8"
          >
            {banner.image ? (
              <>
                <img
                  src={assetUrl(banner.image)}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-[900ms] ease-architect group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/75 to-transparent" />
              </>
            ) : null}
            <div className={clsx('relative', banner.image && 'text-paper')}>
              {banner.eyebrow ? <p className="eyebrow mb-2 opacity-80">{banner.eyebrow}</p> : null}
              <h3 className="text-2xl">{banner.title}</h3>
              {banner.subtitle ? (
                <p className="mt-2 max-w-md text-sm opacity-85">{banner.subtitle}</p>
              ) : null}
              {banner.ctaLabel ? (
                <span className="mt-4 inline-flex items-center gap-1.5 text-2xs uppercase tracking-architect">
                  {banner.ctaLabel}
                  <ArrowRight size={13} className="transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function BannerWide({ section }: { section: HomeSection }) {
  const banner = (section.items as Banner[])?.[0];
  if (!banner) return null;

  return (
    <section className="container-site py-7">
      <Link
        to={banner.link ?? '/shop'}
        className="group relative flex min-h-[320px] items-center overflow-hidden bg-ink p-10 text-paper lg:min-h-[400px] lg:p-16"
      >
        {banner.image ? (
          <>
            <img
              src={assetUrl(banner.image)}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover opacity-70 transition-transform duration-[900ms] ease-architect group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-ink/85 to-ink/25" />
          </>
        ) : null}
        <div className="relative max-w-xl">
          {banner.eyebrow ? <p className="eyebrow mb-3 text-paper/60">{banner.eyebrow}</p> : null}
          <h3 className="text-3xl lg:text-4xl">{banner.title}</h3>
          {banner.subtitle ? (
            <p className="mt-3 text-sm leading-relaxed text-paper/75">{banner.subtitle}</p>
          ) : null}
          {banner.ctaLabel ? (
            <span className="mt-6 inline-flex items-center gap-2 border border-paper px-6 py-3 text-2xs uppercase tracking-architect transition-colors group-hover:bg-paper group-hover:text-ink">
              {banner.ctaLabel}
              <ArrowRight size={14} />
            </span>
          ) : null}
        </div>
      </Link>
    </section>
  );
}

export function CtaSection({ section }: { section: HomeSection }) {
  return (
    <section className="container-site py-7">
      <div className="flex flex-col items-start justify-between gap-6 border border-ink bg-ink px-8 py-12 text-paper sm:flex-row sm:items-center lg:px-14 lg:py-14">
        <div className="max-w-xl">
          <h2 className="text-2xl lg:text-3xl">{section.title}</h2>
          {section.bodyText ? (
            <p className="mt-3 text-sm leading-relaxed text-paper/70">{section.bodyText}</p>
          ) : null}
        </div>
        {section.ctaLabel && section.ctaLink ? (
          <Link
            to={section.ctaLink}
            className="inline-flex shrink-0 items-center gap-2 border border-paper bg-paper px-7 py-3.5 text-2xs uppercase tracking-architect text-ink transition-colors hover:bg-transparent hover:text-paper"
          >
            {section.ctaLabel}
            <ArrowRight size={14} />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function RichTextSection({ section }: { section: HomeSection }) {
  if (!section.bodyText) return null;
  return (
    <section className="container-site py-14">
      <div className="mx-auto max-w-2xl text-center">
        {section.title ? <h2 className="text-2xl sm:text-[1.75rem]">{section.title}</h2> : null}
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-500">
          {section.bodyText}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Blocks the homepage never needed, but a content page does
// ---------------------------------------------------------------------------

/** A heading and a line of text, with nothing else. */
export function SectionHeadingBlock({ section }: { section: HomeSection }) {
  return (
    <section className="container-site py-12">
      <SectionHeading title={section.title} subtitle={section.subtitle} align="center" />
    </section>
  );
}

/** An image beside a paragraph. The side is chosen in the editor. */
export function ImageTextSection({ section }: { section: HomeSection }) {
  const config = (section.config ?? {}) as { image?: string; imageSide?: string };
  const imageFirst = config.imageSide !== 'right';

  return (
    <section className="container-site py-14">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        {config.image ? (
          <div className={clsx('overflow-hidden bg-paper-warm', imageFirst ? 'lg:order-1' : 'lg:order-2')}>
            <img
              src={assetUrl(config.image)}
              alt={section.title ?? ''}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        ) : null}

        <div className={clsx(imageFirst ? 'lg:order-2' : 'lg:order-1')}>
          {section.subtitle ? <p className="eyebrow mb-4">{section.subtitle}</p> : null}
          {section.title ? <h2 className="text-2xl lg:text-3xl">{section.title}</h2> : null}
          {section.bodyText ? (
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-500">
              {section.bodyText}
            </p>
          ) : null}
          {section.ctaLabel && section.ctaLink ? (
            <ButtonLink to={section.ctaLink} className="mt-8">
              {section.ctaLabel}
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * The studio's address, phone, email and opening hours.
 *
 * Read from Settings rather than typed into the section, so there is one place
 * to change them and a page can never quietly go out of date.
 */
export function ContactBlock({ section }: { section: HomeSection }) {
  const { settings } = useSettings();
  const str = (key: string) => {
    const value = settings[key];
    return typeof value === 'string' && value.trim() ? value : null;
  };

  const phone = str('contact.phone');
  const email = str('contact.email');
  const address = str('contact.address');
  const hours = Array.isArray(settings['hours.weekly'])
    ? (settings['hours.weekly'] as { day: string; open?: string; close?: string; closed?: boolean }[])
    : [];

  return (
    <section className="container-site py-14">
      <div className="grid gap-10 border border-stone-line p-8 lg:grid-cols-2 lg:p-12">
        <div>
          {section.subtitle ? <p className="eyebrow mb-4">{section.subtitle}</p> : null}
          {section.title ? <h2 className="text-2xl lg:text-3xl">{section.title}</h2> : null}
          {section.bodyText ? (
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-500">
              {section.bodyText}
            </p>
          ) : null}
        </div>

        <dl className="space-y-5 text-sm">
          {address ? (
            <div>
              <dt className="eyebrow mb-1.5 text-ink-300">Studio</dt>
              <dd className="leading-relaxed text-ink-600">{address}</dd>
            </div>
          ) : null}
          {phone ? (
            <div>
              <dt className="eyebrow mb-1.5 text-ink-300">Phone</dt>
              <dd>
                <a href={`tel:${phone.replace(/\s/g, '')}`} className="link-underline text-ink">
                  {phone}
                </a>
              </dd>
            </div>
          ) : null}
          {email ? (
            <div>
              <dt className="eyebrow mb-1.5 text-ink-300">Email</dt>
              <dd>
                <a href={`mailto:${email}`} className="link-underline text-ink">
                  {email}
                </a>
              </dd>
            </div>
          ) : null}
          {hours.length ? (
            <div>
              <dt className="eyebrow mb-1.5 text-ink-300">Open</dt>
              <dd className="space-y-0.5 text-ink-600">
                {hours.map((row) => (
                  <p key={row.day}>
                    {row.day} ·{' '}
                    {row.closed ? 'Closed' : `${row.open ?? ''}${row.close ? ` – ${row.close}` : ''}`}
                  </p>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </section>
  );
}

/**
 * Dispatches a section to its renderer.
 *
 * Shared by the homepage, every content page and the admin page builder, so the
 * builder's preview is the real thing rather than an approximation of it.
 */
export function SectionRenderer({ section }: { section: HomeSection }) {
  switch (section.type) {
    case 'HERO':
      return <HeroSection section={section} />;
    case 'USP_STRIP':
      return <UspStrip section={section} />;
    case 'CATEGORY_GRID':
      return <CategoryGrid section={section} />;
    case 'SHOP_BY_ATTRIBUTE':
      return <ShopByAttribute section={section} />;
    case 'FEATURED_PRODUCTS':
      return <FeaturedProducts section={section} />;
    case 'PERSONALISATION_DEMO':
      return <PersonalisationDemo section={section} />;
    case 'BANNER_SPLIT':
      return <BannerSplit section={section} />;
    case 'BANNER_WIDE':
      return <BannerWide section={section} />;
    case 'GALLERY':
      return <GallerySection section={section} />;
    case 'TESTIMONIALS':
      return <TestimonialsSection section={section} />;
    case 'FAQ':
      return <FaqSection section={section} />;
    case 'CUSTOM_ORDER_CTA':
    case 'CTA':
      return <CtaSection section={section} />;
    case 'RICH_TEXT':
      return <RichTextSection section={section} />;
    case 'SECTION_HEADING':
      return <SectionHeadingBlock section={section} />;
    case 'IMAGE_TEXT':
      return <ImageTextSection section={section} />;
    case 'CONTACT_BLOCK':
      return <ContactBlock section={section} />;
    default:
      return null;
  }
}
