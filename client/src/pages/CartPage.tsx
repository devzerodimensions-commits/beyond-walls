import { useState } from 'react';
import { Link } from 'react-router-dom';
import { assetUrl } from '../lib/api';
import { formatPrice } from '../lib/format';
import { useCart, useSettings } from '../context/StoreProvider';
import { usePaymentConfig } from '../hooks/usePaymentConfig';
import { Seo } from '../lib/seo';
import {
  Button, ButtonLink, CartIcon, EmptyState, Input, MinusIcon, PageLoader,
  PlusIcon, TrashIcon,
} from '../components/ui';

export default function CartPage() {
  const { cart, isLoading, updateItem, removeItem, applyCoupon, removeCoupon } = useCart();
  const { settings, get } = useSettings();
  const { methodsLine } = usePaymentConfig();
  const [coupon, setCoupon] = useState('');
  const [applying, setApplying] = useState(false);

  if (isLoading) return <PageLoader label="Loading your cart" />;

  const lines = cart?.lines ?? [];
  const totals = cart?.totals;
  const checkoutEnabled = get('store.enableCheckout', true);

  if (!lines.length) {
    return (
      <>
        <Seo settings={settings} title="Cart" noindex canonical="/cart" />
        <div className="container-site py-20">
          <EmptyState
            icon={<CartIcon size={34} />}
            title="Your cart is empty"
            description="Once you add something, it will show up here."
            action={<ButtonLink to="/shop">Browse the shop</ButtonLink>}
          />
        </div>
      </>
    );
  }

  const handleCoupon = async () => {
    if (!coupon.trim()) return;
    setApplying(true);
    try {
      await applyCoupon(coupon.trim());
      setCoupon('');
    } catch {
      // The toast from the store already reported the failure.
    } finally {
      setApplying(false);
    }
  };

  const hasIssue = lines.some((l) => !l.inStock || l.unavailable);

  return (
    <>
      <Seo settings={settings} title="Cart" noindex canonical="/cart" />

      <div className="container-site py-10 lg:py-14">
        <h1 className="text-3xl lg:text-4xl">Your cart</h1>
        <p className="mt-2 text-sm text-ink-400">
          {totals?.itemCount} item{totals?.itemCount === 1 ? '' : 's'}
        </p>

        <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:gap-14">
          {/* Lines */}
          <div className="lg:col-span-7 xl:col-span-8">
            <ul className="divide-y divide-stone-line border-y border-stone-line">
              {lines.map((line) => (
                <li key={line.id} className="flex gap-4 py-6 sm:gap-6">
                  <Link to={`/product/${line.slug}`} className="shrink-0">
                    <img
                      src={assetUrl(line.image)}
                      alt={line.name}
                      className="h-32 w-24 bg-paper-warm object-cover sm:h-36 sm:w-28"
                    />
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link to={`/product/${line.slug}`} className="text-sm font-medium hover:underline sm:text-base">
                          {line.name}
                        </Link>
                        {line.variantLabel ? (
                          <p className="mt-0.5 text-xs text-ink-400">{line.variantLabel}</p>
                        ) : null}
                        {line.sku ? <p className="mt-0.5 text-2xs text-ink-300">SKU {line.sku}</p> : null}
                      </div>
                      <span className="shrink-0 text-sm font-medium">{formatPrice(line.lineTotal)}</span>
                    </div>

                    {/* Customisation detail — visible so the customer can verify it */}
                    {line.personalization?.length ? (
                      <dl className="mt-3 space-y-1 border-l-2 border-stone-line pl-3">
                        {line.personalization
                          .filter((entry) => entry.value)
                          .map((entry) => (
                            <div key={entry.key} className="flex gap-2 text-2xs">
                              <dt className="text-ink-400">{entry.label}:</dt>
                              <dd className="min-w-0 flex-1 truncate text-ink-600">
                                {entry.type === 'IMAGE_UPLOAD' || entry.type === 'FILE_UPLOAD' ? (
                                  <a
                                    href={assetUrl(entry.value)}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="underline underline-offset-2"
                                  >
                                    View file
                                  </a>
                                ) : (
                                  entry.displayValue ?? entry.value
                                )}
                                {entry.priceDelta > 0 ? (
                                  <span className="ml-1.5 text-ink-400">+{formatPrice(entry.priceDelta)}</span>
                                ) : null}
                              </dd>
                            </div>
                          ))}
                      </dl>
                    ) : null}

                    {line.unavailable ? (
                      <p className="mt-2 text-xs text-state-danger">
                        This item is no longer available and must be removed before checkout.
                      </p>
                    ) : !line.inStock ? (
                      <p className="mt-2 text-xs text-state-danger">
                        Only {line.availableStock ?? 0} available — reduce the quantity to continue.
                      </p>
                    ) : null}

                    <div className="mt-auto flex items-center justify-between pt-4">
                      <div className="flex items-center border border-stone-line">
                        <button
                          type="button"
                          onClick={() => void updateItem(line.id, Math.max(1, line.quantity - 1))}
                          disabled={line.quantity <= 1}
                          className="px-3 py-2 text-ink-500 transition-colors hover:text-ink disabled:opacity-30"
                          aria-label="Decrease quantity"
                        >
                          <MinusIcon size={13} />
                        </button>
                        <span className="min-w-[34px] text-center text-xs tabular-nums">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => void updateItem(line.id, line.quantity + 1)}
                          className="px-3 py-2 text-ink-500 transition-colors hover:text-ink"
                          aria-label="Increase quantity"
                        >
                          <PlusIcon size={13} />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => void removeItem(line.id)}
                        className="flex items-center gap-1.5 text-2xs uppercase tracking-architect text-ink-400 transition-colors hover:text-state-danger"
                      >
                        <TrashIcon size={13} />
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <Link to="/shop" className="link-underline mt-6 inline-block text-2xs uppercase tracking-architect">
              ← Continue shopping
            </Link>
          </div>

          {/* Summary */}
          <aside className="lg:col-span-5 xl:col-span-4">
            <div className="sticky top-28 border border-stone-line bg-paper p-6">
              <h2 className="text-xs font-semibold uppercase tracking-architect">Order summary</h2>

              <div className="mt-5 space-y-3 text-sm">
                <Row label="Subtotal" value={formatPrice(totals?.subtotal ?? 0)} />
                {totals?.discount ? (
                  <Row
                    label={`Discount${totals.couponCode ? ` · ${totals.couponCode}` : ''}`}
                    value={`−${formatPrice(totals.discount)}`}
                    tone="success"
                  />
                ) : null}
                <Row
                  label="Shipping"
                  value={totals?.shipping ? formatPrice(totals.shipping) : 'Calculated at checkout'}
                  muted={!totals?.shipping}
                />
                {totals?.tax ? <Row label="Tax" value={formatPrice(totals.tax)} /> : null}
              </div>

              <div className="my-5 rule" />

              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-architect">Total</span>
                <span className="text-xl font-medium">{formatPrice(totals?.total ?? 0)}</span>
              </div>

              {/* Coupon */}
              <div className="mt-6 border-t border-stone-line pt-5">
                {totals?.couponCode ? (
                  <div className="flex items-center justify-between border border-state-success/30 bg-[#EDF5F1] px-3 py-2.5">
                    <span className="text-xs text-state-success">
                      {totals.couponCode} applied
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeCoupon()}
                      className="text-2xs uppercase tracking-architect text-ink-400 hover:text-ink"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Coupon code"
                      value={coupon}
                      onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                      wrapClassName="flex-1"
                      className="uppercase"
                      aria-label="Coupon code"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleCoupon();
                      }}
                    />
                    <Button variant="secondary" size="sm" loading={applying} onClick={() => void handleCoupon()}>
                      Apply
                    </Button>
                  </div>
                )}
                {totals?.couponMessage ? (
                  <p className="mt-2 text-2xs text-state-warning">{totals.couponMessage}</p>
                ) : null}
              </div>

              <div className="mt-6">
                {checkoutEnabled ? (
                  <ButtonLink to="/checkout" size="lg" fullWidth>
                    Proceed to checkout
                  </ButtonLink>
                ) : (
                  <Button size="lg" fullWidth disabled>
                    Checkout unavailable
                  </Button>
                )}
                {hasIssue ? (
                  <p className="mt-2 text-center text-2xs text-state-danger">
                    Resolve the warnings above before checking out.
                  </p>
                ) : null}
              </div>

              {methodsLine ? (
                <p className="mt-4 text-center text-2xs text-ink-400">
                  Pay by {methodsLine.toLowerCase()}.
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

function Row({
  label, value, tone, muted,
}: {
  label: string;
  value: string;
  tone?: 'success';
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-500">{label}</span>
      <span
        className={
          tone === 'success' ? 'text-state-success' : muted ? 'text-xs text-ink-400' : 'font-medium text-ink'
        }
      >
        {value}
      </span>
    </div>
  );
}
