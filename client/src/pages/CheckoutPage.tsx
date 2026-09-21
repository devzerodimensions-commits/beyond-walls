import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ApiError, api, assetUrl } from '../lib/api';
import type { Address, Cart, CheckoutConfig, Order } from '../lib/types';
import { formatPrice } from '../lib/format';
import { Seo } from '../lib/seo';
import { useAuth, useCart, useSettings, useToast } from '../context/StoreProvider';
import { openRazorpayCheckout } from '../lib/razorpay';
import {
  Button, ButtonLink, Checkbox, EmptyState, Input, PageLoader, Select, Spinner,
} from '../components/ui';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const EMPTY_ADDRESS: Address = {
  fullName: '', phone: '', line1: '', line2: '', landmark: '',
  city: '', state: 'Gujarat', pincode: '', country: 'India',
};

interface OrderResponse {
  order: Order;
  payment: { id: string; method: string };
  razorpay: { keyId: string; orderId: string; amount: number; currency: string } | null;
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { cart, refresh } = useCart();
  const { user, isAuthenticated } = useAuth();
  const { settings, get } = useSettings();
  const { push } = useToast();

  const [paymentMethod, setPaymentMethod] = useState<'RAZORPAY' | 'COD'>('RAZORPAY');
  const [shipping, setShipping] = useState<Address>(EMPTY_ADDRESS);
  const [billing, setBilling] = useState<Address>(EMPTY_ADDRESS);
  const [billingSame, setBillingSame] = useState(true);
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [note, setNote] = useState('');
  // GST invoice request — company name and GSTIN are only sent when ticked.
  const [gst, setGst] = useState({ wanted: false, companyName: '', gstin: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState(false);
  const [stage, setStage] = useState<'form' | 'paying' | 'verifying'>('form');

  // --- Config & totals -----------------------------------------------------
  const configQuery = useQuery({
    queryKey: ['checkout-config'],
    queryFn: () => api.get<CheckoutConfig>('/checkout/config'),
  });

  const summaryQuery = useQuery({
    queryKey: ['checkout-summary', paymentMethod],
    queryFn: () => api.get<Cart>('/checkout/summary', { paymentMethod }),
    enabled: (cart?.lines.length ?? 0) > 0,
  });

  const addressesQuery = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api.get<Address[]>('/addresses'),
    enabled: isAuthenticated,
  });

  const config = configQuery.data;
  const totals = summaryQuery.data?.totals ?? cart?.totals;
  const lines = cart?.lines ?? [];

  // Prefill from the signed-in customer and their default address.
  useEffect(() => {
    if (user) {
      setContact((prev) => ({
        name: prev.name || user.name,
        email: prev.email || user.email,
        phone: prev.phone || (user.phone ?? ''),
      }));
    }
  }, [user]);

  useEffect(() => {
    const saved = addressesQuery.data?.find((a) => a.isDefault) ?? addressesQuery.data?.[0];
    if (saved && !shipping.line1) {
      setShipping({ ...saved });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressesQuery.data]);

  // Fall back to whichever method is actually enabled.
  useEffect(() => {
    if (!config) return;
    if (paymentMethod === 'RAZORPAY' && !config.razorpay.enabled && config.cod.enabled) {
      setPaymentMethod('COD');
    } else if (paymentMethod === 'COD' && !config.cod.enabled && config.razorpay.enabled) {
      setPaymentMethod('RAZORPAY');
    }
  }, [config, paymentMethod]);

  if (configQuery.isLoading) return <PageLoader label="Preparing checkout" />;

  if (!lines.length) {
    return (
      <div className="container-site py-20">
        <EmptyState
          title="Your cart is empty"
          description="Add something to your cart before checking out."
          action={<ButtonLink to="/shop">Browse the shop</ButtonLink>}
        />
      </div>
    );
  }

  if (config && !config.checkoutEnabled) {
    return (
      <div className="container-site py-20">
        <EmptyState
          title="Checkout is currently closed"
          description="Online ordering is temporarily unavailable. Please contact us to place your order."
          action={<ButtonLink to="/contact">Contact us</ButtonLink>}
        />
      </div>
    );
  }

  const noPaymentMethod = config && !config.razorpay.enabled && !config.cod.enabled;

  // --- Submit --------------------------------------------------------------
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setPlacing(true);

    try {
      const payload = {
        customerName: contact.name,
        customerEmail: contact.email,
        customerPhone: contact.phone,
        shippingAddress: shipping,
        billingAddress: billingSame ? shipping : billing,
        billingSameAsShipping: billingSame,
        paymentMethod,
        customerNote: note || null,
        gstInvoice: gst.wanted,
        companyName: gst.wanted ? gst.companyName : null,
        gstin: gst.wanted ? gst.gstin.toUpperCase() : null,
      };

      const result = await api.post<OrderResponse>('/orders', payload);

      // ---- Cash on delivery: done ----
      if (paymentMethod === 'COD' || !result.razorpay) {
        await refresh();
        navigate(`/order/${result.order.orderNumber}?email=${encodeURIComponent(contact.email)}`, {
          replace: true,
        });
        return;
      }

      // ---- Razorpay ----
      setStage('paying');
      const opened = await openRazorpayCheckout({
        keyId: result.razorpay.keyId,
        amount: result.razorpay.amount,
        currency: result.razorpay.currency,
        orderId: result.razorpay.orderId,
        name: get('brand.name', 'Beyond Walls'),
        description: `Order ${result.order.orderNumber}`,
        logo: assetUrl(get<string | null>('brand.logoImage', null)) || undefined,
        prefill: { name: contact.name, email: contact.email, contact: contact.phone },
        notes: { orderNumber: result.order.orderNumber },

        onSuccess: async (response) => {
          setStage('verifying');
          try {
            // The server verifies the HMAC signature before marking the order paid.
            await api.post('/payments/verify', {
              orderId: result.order.id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            await refresh();
            navigate(`/order/${result.order.orderNumber}?email=${encodeURIComponent(contact.email)}`, {
              replace: true,
            });
          } catch (err) {
            setStage('form');
            setPlacing(false);
            push(
              err instanceof ApiError ? err.message : 'We could not verify your payment.',
              'error',
            );
            navigate(`/order/${result.order.orderNumber}?email=${encodeURIComponent(contact.email)}`, {
              replace: true,
            });
          }
        },

        onFailure: async (failure) => {
          await api
            .post('/payments/failed', {
              orderId: result.order.id,
              // Proves ownership of a guest order; ignored for signed-in users.
              email: contact.email,
              code: failure.error?.code ?? null,
              description: failure.error?.description ?? null,
              razorpayPaymentId: failure.error?.metadata?.payment_id ?? null,
            })
            .catch(() => undefined);

          setStage('form');
          setPlacing(false);
          push(failure.error?.description ?? 'Payment failed. You can retry from your order page.', 'error');
          navigate(`/order/${result.order.orderNumber}?email=${encodeURIComponent(contact.email)}`, {
            replace: true,
          });
        },

        onDismiss: () => {
          setStage('form');
          setPlacing(false);
          push('Payment was cancelled. Your order is saved — you can retry payment.', 'info');
          navigate(`/order/${result.order.orderNumber}?email=${encodeURIComponent(contact.email)}`, {
            replace: true,
          });
        },
      });

      if (!opened) {
        setStage('form');
        setPlacing(false);
        push('Could not open the payment window. Check your connection and retry.', 'error');
      }
    } catch (err) {
      setPlacing(false);
      setStage('form');
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        push(err.message, 'error');
      } else {
        push('Could not place your order. Please try again.', 'error');
      }
    }
  };

  if (stage === 'verifying') {
    return (
      <div className="container-site flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <Spinner size={26} />
        <h1 className="text-xl">Confirming your payment</h1>
        <p className="max-w-sm text-sm text-ink-500">
          Please do not close this window or press back. This only takes a moment.
        </p>
      </div>
    );
  }

  return (
    <>
      <Seo settings={settings} title="Checkout" noindex canonical="/checkout" />

      <div className="container-site py-10 lg:py-14">
        <h1 className="text-3xl lg:text-4xl">Checkout</h1>
        {!isAuthenticated ? (
          <p className="mt-2 text-sm text-ink-500">
            Checking out as a guest.{' '}
            <Link to="/login" state={{ from: '/checkout' }} className="link-underline font-medium">
              Sign in
            </Link>{' '}
            to use your saved addresses.
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-10 grid gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="space-y-10 lg:col-span-7 xl:col-span-8">
            {/* Contact */}
            <section>
              <SectionTitle step="01" title="Contact" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Full name" required value={contact.name} error={errors.customerName}
                  onChange={(e) => setContact({ ...contact, name: e.target.value })}
                  autoComplete="name"
                />
                <Input
                  label="Phone" type="tel" required value={contact.phone} error={errors.customerPhone}
                  onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                  autoComplete="tel"
                />
                <Input
                  label="Email" type="email" required value={contact.email} error={errors.customerEmail}
                  onChange={(e) => setContact({ ...contact, email: e.target.value })}
                  autoComplete="email" wrapClassName="sm:col-span-2"
                  hint="Your order confirmation goes here."
                />
              </div>
            </section>

            {/* Saved addresses */}
            {addressesQuery.data?.length ? (
              <section>
                <SectionTitle step="02" title="Saved addresses" />
                <div className="grid gap-3 sm:grid-cols-2">
                  {addressesQuery.data.map((address) => {
                    const selected = address.line1 === shipping.line1 && address.pincode === shipping.pincode;
                    return (
                      <button
                        key={address.id}
                        type="button"
                        onClick={() => setShipping({ ...address })}
                        className={clsx(
                          'border p-4 text-left text-xs leading-relaxed transition-colors',
                          selected ? 'border-ink bg-paper-warm' : 'border-stone-line hover:border-ink',
                        )}
                      >
                        <span className="block font-medium text-ink">{address.fullName}</span>
                        <span className="block text-ink-500">
                          {address.line1}
                          {address.line2 ? `, ${address.line2}` : ''}
                        </span>
                        <span className="block text-ink-500">
                          {address.city}, {address.state} {address.pincode}
                        </span>
                        <span className="mt-1 block text-ink-400">{address.phone}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* Shipping */}
            <section>
              <SectionTitle step={addressesQuery.data?.length ? '03' : '02'} title="Delivery address" />
              <AddressFields value={shipping} onChange={setShipping} errors={errors} prefix="shippingAddress" />
            </section>

            {/* Billing */}
            <section>
              <Checkbox
                label="Billing address is the same as the delivery address"
                checked={billingSame}
                onChange={setBillingSame}
              />
              {!billingSame ? (
                <div className="mt-5">
                  <AddressFields value={billing} onChange={setBilling} errors={errors} prefix="billingAddress" />
                </div>
              ) : null}
            </section>

            {/* Payment */}
            <section>
              <SectionTitle step={addressesQuery.data?.length ? '04' : '03'} title="Payment" />

              {noPaymentMethod ? (
                <div className="border border-state-warning/40 bg-[#F8F3E6] p-4 text-xs text-state-warning">
                  No payment method is currently enabled. Please contact us to place your order.
                </div>
              ) : (
                <div className="space-y-3">
                  {config?.razorpay.enabled ? (
                    <PaymentOption
                      selected={paymentMethod === 'RAZORPAY'}
                      onSelect={() => setPaymentMethod('RAZORPAY')}
                      title="Pay online"
                      description="UPI · Cards · Net banking · Wallets"
                      badge={config.razorpay.configured ? 'Secured by Razorpay' : undefined}
                    />
                  ) : null}

                  {config?.cod.enabled ? (
                    <PaymentOption
                      selected={paymentMethod === 'COD'}
                      onSelect={() => setPaymentMethod('COD')}
                      title="Cash on delivery"
                      description={
                        config.cod.note ||
                        (config.cod.fee > 0
                          ? `A handling fee of ${formatPrice(config.cod.fee)} applies.`
                          : 'Pay when your order is delivered.')
                      }
                    />
                  ) : null}
                </div>
              )}

              {config?.razorpay.enabled && !config.razorpay.configured ? (
                <p className="mt-3 text-2xs text-state-warning">
                  Online payment keys are not configured on the server yet.
                </p>
              ) : null}
            </section>

            {/* GST invoice */}
            <section>
              <SectionTitle step={addressesQuery.data?.length ? '05' : '04'} title="GST invoice" />
              <Checkbox
                label="I need a GST invoice for this order"
                hint="We will raise the invoice against the company details below."
                checked={gst.wanted}
                onChange={(wanted) => setGst({ ...gst, wanted })}
              />
              {gst.wanted ? (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Company name"
                    required
                    value={gst.companyName}
                    error={errors.companyName}
                    onChange={(e) => setGst({ ...gst, companyName: e.target.value })}
                    autoComplete="organization"
                  />
                  <Input
                    label="GSTIN"
                    required
                    value={gst.gstin}
                    maxLength={15}
                    className="uppercase"
                    placeholder="24AAAAA0000A1Z5"
                    hint="15 characters"
                    error={errors.gstin}
                    onChange={(e) => setGst({ ...gst, gstin: e.target.value.toUpperCase() })}
                  />
                </div>
              ) : null}
            </section>

            {/* Note */}
            <section>
              <Input
                label="Order note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything we should know about this order"
              />
            </section>
          </div>

          {/* Summary */}
          <aside className="lg:col-span-5 xl:col-span-4">
            <div className="sticky top-28 border border-stone-line bg-paper p-6">
              <h2 className="text-xs font-semibold uppercase tracking-architect">Your order</h2>

              <ul className="mt-5 max-h-64 space-y-4 overflow-y-auto pr-1">
                {lines.map((line) => (
                  <li key={line.id} className="flex gap-3">
                    <div className="relative shrink-0">
                      <img
                        src={assetUrl(line.image)}
                        alt=""
                        className="h-16 w-14 bg-paper-warm object-cover"
                      />
                      <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center bg-ink px-1 text-[0.6rem] text-paper">
                        {line.quantity}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{line.name}</p>
                      {line.variantLabel ? (
                        <p className="truncate text-2xs text-ink-400">{line.variantLabel}</p>
                      ) : null}
                      {line.personalization?.length ? (
                        <p className="truncate text-2xs text-ink-400">
                          {line.personalization.filter((p) => p.value).length} customisation
                          {line.personalization.filter((p) => p.value).length === 1 ? '' : 's'}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs">{formatPrice(line.lineTotal)}</span>
                  </li>
                ))}
              </ul>

              <div className="my-5 rule" />

              <div className="space-y-2.5 text-sm">
                <SummaryRow label="Subtotal" value={formatPrice(totals?.subtotal ?? 0)} />
                {totals?.discount ? (
                  <SummaryRow label="Discount" value={`−${formatPrice(totals.discount)}`} tone="success" />
                ) : null}
                <SummaryRow
                  label="Shipping"
                  value={totals?.shipping ? formatPrice(totals.shipping) : 'Free'}
                />
                {totals?.codFee ? (
                  <SummaryRow label="COD handling" value={formatPrice(totals.codFee)} />
                ) : null}
                {totals?.tax ? <SummaryRow label="Tax" value={formatPrice(totals.tax)} /> : null}
              </div>

              <div className="my-5 rule" />

              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-architect">Total</span>
                <span className="text-xl font-medium">{formatPrice(totals?.total ?? 0)}</span>
              </div>

              <Button
                type="submit"
                size="lg"
                fullWidth
                className="mt-6"
                loading={placing || stage === 'paying'}
                disabled={Boolean(noPaymentMethod)}
              >
                {paymentMethod === 'COD'
                  ? 'Place order'
                  : `Pay ${formatPrice(totals?.total ?? 0)}`}
              </Button>

              {config?.shippingNote ? (
                <p className="mt-3 text-center text-2xs text-ink-400">{config.shippingNote}</p>
              ) : null}

              {config?.razorpay.configured && paymentMethod === 'RAZORPAY' ? (
                <p className="mt-3 text-center text-2xs leading-relaxed text-ink-400">
                  Your card and UPI details are handled by Razorpay. They never reach our servers.
                </p>
              ) : null}
            </div>
          </aside>
        </form>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function SectionTitle({ step, title }: { step: string; title: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="font-mono text-2xs text-ink-300">{step}</span>
      <h2 className="text-xs font-semibold uppercase tracking-architect">{title}</h2>
      <span className="h-px flex-1 bg-stone-line" />
    </div>
  );
}

function SummaryRow({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone?: 'success';
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-500">{label}</span>
      <span className={tone === 'success' ? 'text-state-success' : 'font-medium'}>{value}</span>
    </div>
  );
}

function PaymentOption({
  selected, onSelect, title, description, badge,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        'flex w-full items-start gap-3.5 border p-4 text-left transition-colors',
        selected ? 'border-ink bg-paper-warm' : 'border-stone-line hover:border-ink-300',
      )}
    >
      <span
        className={clsx(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-ink' : 'border-ink-300',
        )}
      >
        {selected ? <span className="h-2 w-2 rounded-full bg-ink" /> : null}
      </span>
      <span className="flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          {badge ? (
            <span className="border border-stone-line px-1.5 py-0.5 text-[0.6rem] uppercase tracking-architect text-ink-400">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-xs text-ink-500">{description}</span>
      </span>
    </button>
  );
}

function AddressFields({
  value, onChange, errors, prefix,
}: {
  value: Address;
  onChange: (address: Address) => void;
  errors: Record<string, string>;
  prefix: string;
}) {
  const set = (key: keyof Address, next: string) => onChange({ ...value, [key]: next });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input
        label="Recipient name" required value={value.fullName}
        error={errors[`${prefix}.fullName`]}
        onChange={(e) => set('fullName', e.target.value)} autoComplete="name"
      />
      <Input
        label="Phone" type="tel" required value={value.phone}
        error={errors[`${prefix}.phone`]}
        onChange={(e) => set('phone', e.target.value)} autoComplete="tel"
      />
      <Input
        label="Address line 1" required value={value.line1} wrapClassName="sm:col-span-2"
        error={errors[`${prefix}.line1`]}
        onChange={(e) => set('line1', e.target.value)} autoComplete="address-line1"
        placeholder="Flat / house no., building, street"
      />
      <Input
        label="Address line 2" value={value.line2 ?? ''} wrapClassName="sm:col-span-2"
        onChange={(e) => set('line2', e.target.value)} autoComplete="address-line2"
        placeholder="Area, locality"
      />
      <Input
        label="Landmark" value={value.landmark ?? ''}
        onChange={(e) => set('landmark', e.target.value)}
      />
      <Input
        label="PIN code" required value={value.pincode} inputMode="numeric" maxLength={6}
        error={errors[`${prefix}.pincode`]}
        onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))}
        autoComplete="postal-code"
      />
      <Input
        label="City / town" required value={value.city}
        error={errors[`${prefix}.city`]}
        onChange={(e) => set('city', e.target.value)} autoComplete="address-level2"
      />
      <Select
        label="State" required value={value.state}
        error={errors[`${prefix}.state`]}
        onChange={(e) => set('state', e.target.value)}
        options={INDIAN_STATES.map((s) => ({ value: s, label: s }))}
      />
    </div>
  );
}
