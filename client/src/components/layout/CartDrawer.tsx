import { Link } from 'react-router-dom';
import { useCart, useSettings } from '../../context/StoreProvider';
import { assetUrl } from '../../lib/api';
import { describePersonalization, formatPrice } from '../../lib/format';
import { Button, ButtonLink, CartIcon, Drawer, EmptyState, MinusIcon, PlusIcon, TrashIcon } from '../ui';

export function CartDrawer() {
  const { cart, isDrawerOpen, closeDrawer, updateItem, removeItem } = useCart();
  const { get } = useSettings();
  const checkoutEnabled = get('store.enableCheckout', true);

  const lines = cart?.lines ?? [];
  const totals = cart?.totals;
  const freeThreshold = totals?.freeShippingThreshold ?? 0;
  const remaining = freeThreshold > 0 ? freeThreshold - (totals?.subtotal ?? 0) : 0;

  return (
    <Drawer
      open={isDrawerOpen}
      onClose={closeDrawer}
      title={`Your cart${totals?.itemCount ? ` (${totals.itemCount})` : ''}`}
      footer={
        lines.length ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-500">Subtotal</span>
              <span className="font-medium">{formatPrice(totals?.subtotal ?? 0)}</span>
            </div>
            {totals?.discount ? (
              <div className="flex items-center justify-between text-sm text-state-success">
                <span>Discount {totals.couponCode ? `(${totals.couponCode})` : ''}</span>
                <span>−{formatPrice(totals.discount)}</span>
              </div>
            ) : null}
            <p className="text-2xs text-ink-400">
              Shipping and taxes are calculated at checkout.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <ButtonLink to="/cart" variant="secondary" size="sm" fullWidth>
                View cart
              </ButtonLink>
              {checkoutEnabled ? (
                <ButtonLink to="/checkout" variant="primary" size="sm" fullWidth>
                  Checkout
                </ButtonLink>
              ) : (
                <Button variant="primary" size="sm" fullWidth disabled>
                  Unavailable
                </Button>
              )}
            </div>
          </div>
        ) : null
      }
    >
      {lines.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={<CartIcon size={32} />}
            title="Your cart is empty"
            description="Browse the catalogue and add something to get started."
            action={
              <ButtonLink to="/shop" size="sm">
                Browse the shop
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <>
          {freeThreshold > 0 && remaining > 0 ? (
            <div className="border-b border-stone-line bg-paper-warm px-5 py-3 text-xs text-ink-600">
              Add {formatPrice(remaining)} more for free shipping.
            </div>
          ) : null}

          <ul className="divide-y divide-stone-line/70">
            {lines.map((line) => {
              const custom = describePersonalization(line.personalization);
              return (
                <li key={line.id} className="flex gap-4 p-5">
                  <Link to={`/product/${line.slug}`} onClick={closeDrawer} className="shrink-0">
                    <img
                      src={assetUrl(line.image)}
                      alt={line.name}
                      className="h-24 w-20 bg-paper-warm object-cover"
                    />
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to={`/product/${line.slug}`}
                        onClick={closeDrawer}
                        className="text-sm font-medium leading-snug hover:underline"
                      >
                        {line.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() => void removeItem(line.id)}
                        className="p-0.5 text-ink-300 transition-colors hover:text-state-danger"
                        aria-label={`Remove ${line.name}`}
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>

                    {line.variantLabel ? (
                      <p className="mt-0.5 text-2xs text-ink-400">{line.variantLabel}</p>
                    ) : null}
                    {custom ? (
                      <p className="mt-1 line-clamp-2 text-2xs leading-relaxed text-ink-400">{custom}</p>
                    ) : null}
                    {!line.inStock ? (
                      <p className="mt-1 text-2xs text-state-danger">
                        Only {line.availableStock ?? 0} available
                      </p>
                    ) : null}

                    <div className="mt-auto flex items-center justify-between pt-3">
                      <div className="flex items-center border border-stone-line">
                        <button
                          type="button"
                          onClick={() => void updateItem(line.id, Math.max(1, line.quantity - 1))}
                          disabled={line.quantity <= 1}
                          className="px-2 py-1.5 text-ink-500 transition-colors hover:text-ink disabled:opacity-30"
                          aria-label="Decrease quantity"
                        >
                          <MinusIcon size={13} />
                        </button>
                        <span className="min-w-[30px] text-center text-xs tabular-nums">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => void updateItem(line.id, line.quantity + 1)}
                          className="px-2 py-1.5 text-ink-500 transition-colors hover:text-ink"
                          aria-label="Increase quantity"
                        >
                          <PlusIcon size={13} />
                        </button>
                      </div>
                      <span className="text-sm font-medium">{formatPrice(line.lineTotal)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Drawer>
  );
}
