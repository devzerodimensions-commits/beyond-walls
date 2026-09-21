import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ApiError, api, assetUrl } from '../lib/api';
import type { Order } from '../lib/types';
import { formatDate, formatPrice, statusMeta } from '../lib/format';
import { Seo } from '../lib/seo';
import { useSettings, useToast } from '../context/StoreProvider';
import { openRazorpayCheckout } from '../lib/razorpay';
import {
  AlertIcon, Badge, Button, ButtonLink, CheckIcon, EmptyState, PageLoader, RefreshIcon,
} from '../components/ui';

export default function OrderConfirmationPage() {
  const { orderNumber } = useParams();
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const { settings, get } = useSettings();
  const { push } = useToast();
  const [retrying, setRetrying] = useState(false);

  const { data: order, isLoading, isError, refetch } = useQuery({
    queryKey: ['order', orderNumber, email],
    queryFn: () => api.get<Order>(`/orders/${orderNumber}`, { email }),
    enabled: Boolean(orderNumber),
    retry: false,
  });

  if (isLoading) return <PageLoader label="Loading your order" />;

  if (isError || !order) {
    return (
      <div className="container-site py-20">
        <EmptyState
          title="We could not find that order"
          description="Check the order number, or use the email address the order was placed with."
          action={<ButtonLink to="/track-order">Track an order</ButtonLink>}
        />
      </div>
    );
  }

  const paid = order.paymentStatus === 'PAID';
  const failed = order.paymentStatus === 'FAILED';
  const pending = order.paymentStatus === 'PENDING' && order.paymentMethod === 'RAZORPAY';
  const isCod = order.paymentMethod === 'COD';
  const canRetry = (failed || pending) && order.status !== 'CANCELLED';

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const result = await api.post<{
        razorpay: { keyId: string; orderId: string; amount: number; currency: string };
        order: { id: string; orderNumber: string; customerName: string; customerEmail: string; customerPhone: string };
      }>(`/payments/retry/${order.id}`, { email: email || order.customerEmail });

      const opened = await openRazorpayCheckout({
        keyId: result.razorpay.keyId,
        amount: result.razorpay.amount,
        currency: result.razorpay.currency,
        orderId: result.razorpay.orderId,
        name: get('brand.name', 'Beyond Walls'),
        description: `Order ${order.orderNumber}`,
        prefill: {
          name: result.order.customerName,
          email: result.order.customerEmail,
          contact: result.order.customerPhone,
        },
        onSuccess: async (response) => {
          try {
            await api.post('/payments/verify', {
              orderId: order.id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            push('Payment received. Thank you!', 'success');
          } catch (err) {
            push(err instanceof ApiError ? err.message : 'Verification failed', 'error');
          } finally {
            setRetrying(false);
            void refetch();
          }
        },
        onFailure: async (failure) => {
          await api
            .post('/payments/failed', {
              orderId: order.id,
              email: email || order.customerEmail,
              code: failure.error?.code ?? null,
              description: failure.error?.description ?? null,
            })
            .catch(() => undefined);
          setRetrying(false);
          push(failure.error?.description ?? 'Payment failed again.', 'error');
          void refetch();
        },
        onDismiss: () => {
          setRetrying(false);
          void refetch();
        },
      });

      if (!opened) {
        setRetrying(false);
        push('Could not open the payment window.', 'error');
      }
    } catch (err) {
      setRetrying(false);
      push(err instanceof ApiError ? err.message : 'Could not start the payment.', 'error');
    }
  };

  const status = statusMeta(order.status);
  const payStatus = statusMeta(order.paymentStatus);
  const payment = order.payments?.[0];

  return (
    <>
      <Seo settings={settings} title={`Order ${order.orderNumber}`} noindex />

      <div className="container-site py-12 lg:py-16">
        {/* Banner */}
        <div
          className={clsx(
            'flex flex-col items-start gap-4 border p-7 sm:flex-row sm:items-center lg:p-9',
            paid || isCod
              ? 'border-state-success/30 bg-[#EDF5F1]'
              : failed
                ? 'border-state-danger/30 bg-[#F9EDED]'
                : 'border-state-warning/30 bg-[#F8F3E6]',
          )}
        >
          <span
            className={clsx(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
              paid || isCod ? 'bg-state-success text-paper' : failed ? 'bg-state-danger text-paper' : 'bg-state-warning text-paper',
            )}
          >
            {paid || isCod ? <CheckIcon size={20} /> : <AlertIcon size={20} />}
          </span>

          <div className="flex-1">
            <h1 className="text-xl lg:text-2xl">
              {paid
                ? 'Payment received — thank you'
                : isCod
                  ? 'Order placed'
                  : failed
                    ? 'Payment did not go through'
                    : 'Awaiting payment'}
            </h1>
            <p className="mt-1.5 text-sm text-ink-600">
              {paid
                ? `We have your order ${order.orderNumber} and will start on it shortly.`
                : isCod
                  ? `Order ${order.orderNumber} is confirmed. You will pay on delivery.`
                  : failed
                    ? 'Your order is saved. You can retry the payment below — nothing was charged.'
                    : 'Your order is saved but payment has not completed yet.'}
            </p>
          </div>

          {canRetry ? (
            <Button loading={retrying} icon={<RefreshIcon size={15} />} onClick={() => void handleRetry()}>
              Retry payment
            </Button>
          ) : null}
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:gap-14">
          {/* Items */}
          <div className="lg:col-span-7 xl:col-span-8">
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-architect">
                Order {order.orderNumber}
              </h2>
              <Badge tone={status.tone}>{status.label}</Badge>
              <Badge tone={payStatus.tone}>Payment: {payStatus.label}</Badge>
              <span className="text-2xs text-ink-400">{formatDate(order.placedAt, true)}</span>
            </div>

            <ul className="divide-y divide-stone-line border-y border-stone-line">
              {order.items.map((item) => (
                <li key={item.id} className="flex gap-4 py-5">
                  {item.slug ? (
                    <Link to={`/product/${item.slug}`} className="shrink-0">
                      <img src={assetUrl(item.imageUrl)} alt="" className="h-24 w-20 bg-paper-warm object-cover" />
                    </Link>
                  ) : (
                    <img src={assetUrl(item.imageUrl)} alt="" className="h-24 w-20 shrink-0 bg-paper-warm object-cover" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{item.productName}</p>
                        {item.variantLabel ? (
                          <p className="text-xs text-ink-400">{item.variantLabel}</p>
                        ) : null}
                        <p className="mt-0.5 text-2xs text-ink-400">
                          {formatPrice(item.unitPrice)} × {item.quantity}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-medium">{formatPrice(item.lineTotal)}</span>
                    </div>

                    {item.personalization?.length ? (
                      <dl className="mt-3 space-y-1 border-l-2 border-stone-line pl-3">
                        {item.personalization
                          .filter((entry) => entry.value)
                          .map((entry) => (
                            <div key={entry.key} className="flex gap-2 text-2xs">
                              <dt className="shrink-0 text-ink-400">{entry.label}:</dt>
                              <dd className="min-w-0 flex-1 text-ink-600">
                                {entry.type === 'IMAGE_UPLOAD' || entry.type === 'FILE_UPLOAD' ? (
                                  <a
                                    href={assetUrl(entry.value)}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="underline underline-offset-2"
                                  >
                                    View uploaded file
                                  </a>
                                ) : (
                                  (entry.displayValue ?? entry.value)
                                )}
                              </dd>
                            </div>
                          ))}
                      </dl>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            {/* Payment detail */}
            {payment ? (
              <div className="mt-8 border border-stone-line p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-architect">Payment</h3>
                <dl className="grid gap-2 text-xs sm:grid-cols-2">
                  <Detail label="Method" value={order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Razorpay'} />
                  {payment.instrument ? <Detail label="Paid via" value={payment.instrument.toUpperCase()} /> : null}
                  {payment.vpa ? <Detail label="UPI ID" value={payment.vpa} /> : null}
                  {payment.cardLast4 ? <Detail label="Card" value={`•••• ${payment.cardLast4}`} /> : null}
                  {payment.bank ? <Detail label="Bank" value={payment.bank} /> : null}
                  {payment.wallet ? <Detail label="Wallet" value={payment.wallet} /> : null}
                  {payment.razorpayPaymentId ? (
                    <Detail label="Transaction ID" value={payment.razorpayPaymentId} />
                  ) : null}
                  {payment.errorDescription ? (
                    <Detail label="Last error" value={payment.errorDescription} tone="danger" />
                  ) : null}
                </dl>
              </div>
            ) : null}
          </div>

          {/* Summary */}
          <aside className="lg:col-span-5 xl:col-span-4">
            <div className="border border-stone-line p-6">
              <h2 className="text-xs font-semibold uppercase tracking-architect">Summary</h2>
              <div className="mt-5 space-y-2.5 text-sm">
                <Row label="Subtotal" value={formatPrice(order.subtotal)} />
                {Number(order.discountAmount) > 0 ? (
                  <Row label={`Discount${order.couponCode ? ` · ${order.couponCode}` : ''}`} value={`−${formatPrice(order.discountAmount)}`} />
                ) : null}
                {Number(order.shippingAmount) > 0 ? (
                  <Row label="Shipping & handling" value={formatPrice(order.shippingAmount)} />
                ) : null}
                {Number(order.taxAmount) > 0 ? <Row label="Tax" value={formatPrice(order.taxAmount)} /> : null}
              </div>
              <div className="my-5 rule" />
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-architect">Total</span>
                <span className="text-xl font-medium">{formatPrice(order.total)}</span>
              </div>
            </div>

            <div className="mt-5 border border-stone-line p-6 text-sm">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-architect">Delivering to</h2>
              <address className="not-italic leading-relaxed text-ink-600">
                <span className="block font-medium text-ink">{order.shippingAddress.fullName}</span>
                {order.shippingAddress.line1}
                {order.shippingAddress.line2 ? <><br />{order.shippingAddress.line2}</> : null}
                {order.shippingAddress.landmark ? <><br />{order.shippingAddress.landmark}</> : null}
                <br />
                {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pincode}
                <br />
                {order.shippingAddress.phone}
              </address>
            </div>

            {/*
              Shown back to the customer so they can check the GSTIN they typed
              before the invoice is raised against it.
            */}
            {order.gstInvoice ? (
              <div className="mt-5 border border-stone-line p-6 text-sm">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-architect">
                  GST invoice
                </h2>
                <dl className="space-y-1.5 text-ink-600">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-400">Company</dt>
                    <dd className="text-right font-medium text-ink">{order.companyName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-400">GSTIN</dt>
                    <dd className="text-right font-mono text-ink">{order.gstin}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-2xs leading-relaxed text-ink-400">
                  Spotted a mistake? Tell us before the order ships and we will correct it.
                </p>
              </div>
            ) : null}

            {order.trackingNumber ? (
              <div className="mt-5 border border-stone-line p-6 text-sm">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-architect">Tracking</h2>
                <p className="text-ink-600">
                  {order.courierName ? `${order.courierName} · ` : ''}
                  {order.trackingNumber}
                </p>
                {order.trackingUrl ? (
                  <a
                    href={order.trackingUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="link-underline mt-2 inline-block text-2xs uppercase tracking-architect"
                  >
                    Track shipment →
                  </a>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-2">
              <ButtonLink to="/shop" variant="secondary" fullWidth>
                Continue shopping
              </ButtonLink>
              <ButtonLink to="/contact" variant="ghost" fullWidth>
                Need help with this order?
              </ButtonLink>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Detail({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div>
      <dt className="text-ink-400">{label}</dt>
      <dd className={clsx('mt-0.5 break-all', tone === 'danger' ? 'text-state-danger' : 'text-ink-700')}>
        {value}
      </dd>
    </div>
  );
}
