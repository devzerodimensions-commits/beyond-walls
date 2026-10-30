import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { Product } from '../../lib/types';
import { assetUrl } from '../../lib/api';
import { formatPrice, toNumber } from '../../lib/format';
import {
  cardAction, displayPriceRange, isFullyOutOfStock, sellableVariants,
} from '../../lib/pricing';
import { useCart, useSettings, useWishlist } from '../../context/StoreProvider';
import { imageFrame, isImageFit, ratioValue } from '../../lib/productImage';
import { Badge, CartIcon, HeartIcon, Skeleton, Spinner } from '../ui';

interface Props {
  product: Product;
  className?: string;
  hideWishlist?: boolean;
  priority?: boolean;
}

export function ProductCard({ product, className, hideWishlist, priority }: Props) {
  const navigate = useNavigate();
  const { isWishlisted, isUpdating, toggle } = useWishlist();
  const { addItem } = useCart();
  const { get } = useSettings();
  const [adding, setAdding] = useState(false);

  const wishlistEnabled = get<boolean>('store.enableWishlist', true);

  const image = product.images?.find((i) => i.isPrimary) ?? product.images?.[0];
  const hover = product.images?.find((i) => i.url !== image?.url);

  /*
   * The frame is sized from the primary image, and the hover image is laid
   * over it. Two photographs of one product are nearly always the same shape,
   * and where they are not, the second is fitted to the first rather than
   * allowed to resize the card from under the cursor.
   */
  const fitSetting = get<string>('catalog.imageFit', 'natural');
  const fit = isImageFit(fitSetting) ? fitSetting : 'natural';
  const frame = imageFrame(image, fit, get<string>('catalog.imageRatio', '1:1'));

  // Price comes from the pricing helper so a variant-priced product shows the
  // right figure — and a range when its variants differ.
  const range = displayPriceRange(product);
  const compareAt = toNumber(product.compareAtPrice);
  const hasPrice = range.min !== null;
  const discount =
    hasPrice && compareAt && compareAt > (range.min ?? 0)
      ? Math.round(((compareAt - (range.min ?? 0)) / compareAt) * 100)
      : null;

  const outOfStock = isFullyOutOfStock(product);
  const saved = isWishlisted(product.id);
  const action = cardAction(product);
  const variantCount = sellableVariants(product.variants).length;

  const handleAction = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    // Anything needing a choice goes to the product page rather than guessing.
    if (action.kind !== 'add') {
      navigate(`/product/${product.slug}`);
      return;
    }

    setAdding(true);
    try {
      await addItem({
        productId: product.id,
        // A single published variant is passed explicitly, so the server never
        // has to infer which one was meant.
        variantId: variantCount === 1 ? sellableVariants(product.variants)[0].id : null,
        quantity: product.minOrderQty ?? 1,
      });
    } finally {
      setAdding(false);
    }
  };

  return (
    <article className={clsx('group relative flex h-full flex-col', className)}>
      <Link
        to={`/product/${product.slug}`}
        className="relative block w-full shrink-0 overflow-hidden bg-paper-warm"
        style={frame.style}
        aria-label={product.name}
      >
        {image ? (
          <>
            <img
              src={assetUrl(image.url)}
              alt={image.alt ?? product.name}
              loading={priority ? 'eager' : 'lazy'}
              className={clsx(
                'h-full w-full transition-all duration-700 ease-architect',
                frame.objectClass,
                hover ? 'group-hover:opacity-0' : 'group-hover:scale-[1.06]',
              )}
            />
            {hover ? (
              <img
                src={assetUrl(hover.url)}
                alt=""
                loading="lazy"
                aria-hidden="true"
                className={clsx(
                  'absolute inset-0 h-full w-full scale-[1.02] opacity-0 transition-all duration-700 ease-architect group-hover:scale-100 group-hover:opacity-100',
                  // Never crop the second photograph when the first was not
                  // cropped either.
                  fit === 'cover' ? 'object-cover' : 'object-contain',
                )}
              />
            ) : null}
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xs uppercase tracking-architect text-ink-300">
            No image
          </div>
        )}

        <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {product.badge ? <Badge tone="dark">{product.badge}</Badge> : null}
          {product.isNew && !product.badge ? <Badge tone="dark">New</Badge> : null}
          {discount ? <Badge tone="danger">−{discount}%</Badge> : null}
          {product.livePreviewEnabled ? <Badge tone="neutral">Personalise</Badge> : null}
        </div>

        {outOfStock ? (
          <div className="absolute inset-0 flex items-center justify-center bg-paper/70">
            <span className="border border-ink bg-paper px-3 py-1.5 text-2xs uppercase tracking-architect">
              Out of stock
            </span>
          </div>
        ) : null}

        {/* Desktop quick action — slides up on hover. */}
        {!action.disabled && action.kind !== 'unavailable' ? (
          <span className="absolute inset-x-0 bottom-0 hidden translate-y-full transition-transform duration-300 ease-architect group-hover:translate-y-0 lg:block">
            <button
              type="button"
              onClick={handleAction}
              className="flex w-full items-center justify-center gap-2 bg-ink py-3.5 text-2xs font-medium uppercase tracking-architect text-paper transition-colors hover:bg-ink-700"
            >
              {adding ? <Spinner size={14} /> : <CartIcon size={14} />}
              {action.label}
            </button>
          </span>
        ) : null}
      </Link>

      {wishlistEnabled && !hideWishlist ? (
        <button
          type="button"
          onClick={() => void toggle(product.id)}
          disabled={isUpdating(product.id)}
          aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          aria-pressed={saved}
          className={clsx(
            'absolute right-3 top-3 flex h-9 w-9 items-center justify-center border bg-paper/90 backdrop-blur-sm transition-all duration-200 disabled:cursor-wait',
            saved
              ? 'border-ink text-ink'
              : 'border-transparent text-ink-400 hover:text-ink lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100',
          )}
        >
          <HeartIcon size={16} className={saved ? 'fill-current' : ''} />
        </button>
      ) : null}

      <div className="flex flex-1 flex-col pt-3.5">
        <span className="eyebrow mb-1.5 block min-h-[0.875rem] truncate">
          {product.category?.name ?? ' '}
        </span>

        {/*
          Two lines, always. Without a fixed height a one-line name and a
          two-line name push the price and the button to different heights and
          the grid stops reading as a grid.
        */}
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-ink">
          <Link to={`/product/${product.slug}`} className="link-underline">
            {product.name}
          </Link>
        </h3>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {hasPrice ? (
            <>
              <span className="text-sm font-medium text-ink">
                {/* A range reads "From ₹1,499" rather than a single misleading figure. */}
                {range.varies ? `From ${formatPrice(range.min)}` : formatPrice(range.min)}
              </span>
              {!range.varies && compareAt && compareAt > (range.min ?? 0) ? (
                <span className="text-xs text-ink-300 line-through">{formatPrice(compareAt)}</span>
              ) : null}
            </>
          ) : (
            <span className="text-xs uppercase tracking-architect text-ink-400">
              Currently unavailable
            </span>
          )}

          {variantCount > 1 ? (
            <span className="text-2xs text-ink-300">
              {variantCount} options
            </span>
          ) : null}
        </div>

        {/* Mobile CTA — always visible, since there is no hover on touch. */}
        <button
          type="button"
          onClick={handleAction}
          disabled={action.disabled}
          className={clsx(
            'mt-auto flex w-full items-center justify-center gap-2 py-2.5 text-2xs font-medium uppercase tracking-architect transition-colors lg:hidden',
            action.disabled
              ? 'cursor-not-allowed border border-stone-line text-ink-300'
              : action.kind === 'add'
                ? 'border border-ink text-ink hover:bg-ink hover:text-paper'
                : 'border border-stone-line text-ink-600 hover:border-ink hover:text-ink',
          )}
        >
          {adding ? <Spinner size={13} /> : action.kind === 'add' ? <CartIcon size={13} /> : null}
          {action.label}
        </button>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  // The placeholder takes the configured frame shape, so the grid does not
  // change height at the moment the real cards replace it. In natural mode
  // each card ends up its own photograph's shape, and the configured shape is
  // the closest guess available before any of them have loaded.
  const { get } = useSettings();
  const ratio = ratioValue(get<string>('catalog.imageRatio', '1:1'));

  return (
    <div className="flex h-full flex-col">
      <Skeleton className="w-full shrink-0" style={{ aspectRatio: String(ratio) }} />
      <Skeleton className="mt-3.5 h-2.5 w-20" />
      <Skeleton className="mt-2.5 h-3.5 w-3/4" />
      <Skeleton className="mt-2.5 h-3.5 w-1/2" />
      <Skeleton className="mt-2.5 h-4 w-24" />
    </div>
  );
}

export function ProductGrid({
  products, loading, skeletonCount = 8, columns = 4, className,
}: {
  products: Product[];
  loading?: boolean;
  skeletonCount?: number;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const cols = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
  }[columns];

  return (
    <div className={clsx('grid items-stretch gap-x-4 gap-y-8 sm:gap-x-5 sm:gap-y-10', cols, className)}>
      {loading
        ? Array.from({ length: skeletonCount }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <ProductCardSkeleton key={i} />
          ))
        : products.map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index < 4} />
          ))}
    </div>
  );
}
