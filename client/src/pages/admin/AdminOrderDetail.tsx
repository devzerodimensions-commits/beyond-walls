import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ApiError, api, assetUrl } from '../../lib/api';
import type { Order, OrderStatus } from '../../lib/types';
import { formatDate, formatPrice, statusMeta } from '../../lib/format';
import { useToast } from '../../context/StoreProvider';
import { AdminCard, AdminPageHeader, DefinitionList } from '../../components/admin/AdminKit';
import {
  Badge, Button, ConfirmDialog, Input, Modal, PageLoader, Select, Textarea,
} from '../../components/ui';

const ORDER_STATUSES: OrderStatus[] = [
  'PENDING', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP',
  'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED',
];

export default function AdminOrderDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { push } = useToast();

  const [status, setStatus] = useState<OrderStatus>('PENDING');
  const [adminNote, setAdminNote] = useState('');
  const [tracking, setTracking] = useState({ courierName: '', trackingNumber: '', trackingUrl: '' });
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ['admin-order', id],
    queryFn: () => api.get<Order>(`/admin/orders/${id}`),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!order) return;
    setStatus(order.status);
    setAdminNote(order.adminNote ?? '');
    setTracking({
      courierName: order.courierName ?? '',
      trackingNumber: order.trackingNumber ?? '',
      trackingUrl: order.trackingUrl ?? '',
    });
  }, [order]);

  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch<Order>(`/admin/orders/${id}`, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-order', id] });
      await queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
      push('Order updated', 'success');
      setCancelOpen(false);
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Update failed', 'error'),
  });

  const refund = useMutation({
    mutationFn: (amount?: number) => api.post(`/admin/orders/${id}/refund`, { amount }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-order', id] });
      setRefundOpen(false);
      setRefundAmount('');
      push('Refund submitted to Razorpay', 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Refund failed', 'error'),
  });

  if (isLoading || !order) return <PageLoader label="Loading order" />;

  const orderStatus = statusMeta(order.status);
  const payStatus = statusMeta(order.paymentStatus);
  const payment = order.payments?.[0];
  const canRefund =
    order.paymentMethod === 'RAZORPAY' && ['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus);

  return (
    <>
      <AdminPageHeader
        breadcrumb={{ label: 'Orders', to: '/admin/orders' }}
        title={order.orderNumber}
        description={`Placed ${formatDate(order.placedAt, true)}`}
        actions={
          <>
            {canRefund ? (
              <Button size="sm" variant="secondary" onClick={() => setRefundOpen(true)}>
                Refund
              </Button>
            ) : null}
            {!['CANCELLED', 'REFUNDED', 'DELIVERED'].includes(order.status) ? (
              <Button size="sm" variant="danger" onClick={() => setCancelOpen(true)}>
                Cancel order
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone={orderStatus.tone}>{orderStatus.label}</Badge>
        <Badge tone={payStatus.tone}>Payment: {payStatus.label}</Badge>
        <Badge>{order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Razorpay'}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Items + customisation */}
        <div className="space-y-6 lg:col-span-2">
          <AdminCard title="Items" description="Everything the customer entered is shown here, ready for production.">
            <ul className="divide-y divide-stone-line">
              {order.items.map((item) => (
                <li key={item.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                  <img
                    src={assetUrl(item.imageUrl)}
                    alt=""
                    className="h-20 w-16 shrink-0 border border-stone-line bg-paper-warm object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{item.productName}</p>
                        {item.variantLabel ? (
                          <p className="text-2xs text-ink-400">{item.variantLabel}</p>
                        ) : null}
                        {item.sku ? <p className="font-mono text-2xs text-ink-300">{item.sku}</p> : null}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{formatPrice(item.lineTotal)}</p>
                        <p className="text-2xs text-ink-400">
                          {formatPrice(item.unitPrice)} × {item.quantity}
                        </p>
                      </div>
                    </div>

                    {item.personalization?.length ? (
                      <div className="mt-3 border border-stone-line bg-paper-off p-3">
                        <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-architect text-ink-400">
                          Customisation
                        </p>
                        <dl className="grid gap-1.5 sm:grid-cols-2">
                          {item.personalization
                            .filter((entry) => entry.value)
                            .map((entry) => (
                              <div key={entry.key} className="text-xs">
                                <dt className="text-ink-400">{entry.label}</dt>
                                <dd className="mt-0.5 break-words font-medium text-ink">
                                  {entry.type === 'IMAGE_UPLOAD' || entry.type === 'FILE_UPLOAD' ? (
                                    <a
                                      href={assetUrl(entry.value)}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="inline-flex items-center gap-2 underline underline-offset-2"
                                    >
                                      {/\.(png|jpe?g|webp|gif|svg)$/i.test(entry.value) ? (
                                        <img
                                          src={assetUrl(entry.value)}
                                          alt=""
                                          className="h-10 w-10 border border-stone-line object-contain"
                                        />
                                      ) : null}
                                      Download file
                                    </a>
                                  ) : (
                                    (entry.displayValue ?? entry.value)
                                  )}
                                </dd>
                              </div>
                            ))}
                        </dl>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-5 border-t border-stone-line pt-4">
              <DefinitionList
                rows={[
                  { label: 'Subtotal', value: formatPrice(order.subtotal) },
                  ...(Number(order.discountAmount) > 0
                    ? [{
                        label: `Discount${order.couponCode ? ` (${order.couponCode})` : ''}`,
                        value: `−${formatPrice(order.discountAmount)}`,
                      }]
                    : []),
                  { label: 'Shipping & handling', value: formatPrice(order.shippingAmount) },
                  ...(Number(order.taxAmount) > 0
                    ? [{ label: 'Tax', value: formatPrice(order.taxAmount) }]
                    : []),
                  { label: 'Total', value: <strong>{formatPrice(order.total)}</strong> },
                ]}
              />
            </div>
          </AdminCard>

          {/* Payment trail */}
          <AdminCard title="Payment" description="Full transaction record, straight from Razorpay.">
            {payment ? (
              <>
                <DefinitionList
                  rows={[
                    { label: 'Method', value: order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Razorpay' },
                    { label: 'Status', value: <Badge tone={statusMeta(payment.status).tone}>{statusMeta(payment.status).label}</Badge> },
                    { label: 'Amount', value: formatPrice(payment.amount) },
                    ...(payment.instrument ? [{ label: 'Instrument', value: payment.instrument.toUpperCase() }] : []),
                    ...(payment.vpa ? [{ label: 'UPI ID', value: payment.vpa }] : []),
                    ...(payment.cardLast4 ? [{ label: 'Card', value: `•••• ${payment.cardLast4}` }] : []),
                    ...(payment.bank ? [{ label: 'Bank', value: payment.bank }] : []),
                    ...(payment.wallet ? [{ label: 'Wallet', value: payment.wallet }] : []),
                    ...(payment.razorpayOrderId ? [{ label: 'Razorpay order', value: <span className="font-mono text-2xs">{payment.razorpayOrderId}</span> }] : []),
                    ...(payment.razorpayPaymentId ? [{ label: 'Payment ID', value: <span className="font-mono text-2xs">{payment.razorpayPaymentId}</span> }] : []),
                    ...(Number(payment.refundedAmount) > 0 ? [{ label: 'Refunded', value: formatPrice(payment.refundedAmount) }] : []),
                    ...(payment.errorDescription
                      ? [{ label: 'Last error', value: <span className="text-state-danger">{payment.errorDescription}</span> }]
                      : []),
                  ]}
                />

                {payment.events?.length ? (
                  <div className="mt-5 border-t border-stone-line pt-4">
                    <p className="mb-3 text-[0.6rem] font-semibold uppercase tracking-architect text-ink-400">
                      Event log
                    </p>
                    <ol className="space-y-2.5">
                      {payment.events.map((event) => (
                        <li key={event.id} className="flex gap-3 text-xs">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-300" />
                          <div>
                            <p className="font-medium">{event.type.replace(/_/g, ' ').toLowerCase()}</p>
                            {event.message ? <p className="text-ink-500">{event.message}</p> : null}
                            <p className="text-2xs text-ink-300">{formatDate(event.createdAt, true)}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-ink-400">No payment record for this order.</p>
            )}
          </AdminCard>
        </div>

        {/* Side */}
        <div className="space-y-6">
          <AdminCard title="Update status">
            <Select
              label="Order status"
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
              options={ORDER_STATUSES.map((s) => ({ value: s, label: statusMeta(s).label }))}
            />
            <Button
              size="sm"
              className="mt-4"
              fullWidth
              loading={update.isPending}
              disabled={status === order.status}
              onClick={() => update.mutate({ status })}
            >
              Save status
            </Button>

            {/* Quick progression */}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-line pt-4">
              {ORDER_STATUSES.slice(0, 6).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={s === order.status || update.isPending}
                  onClick={() => update.mutate({ status: s })}
                  className={clsx(
                    'border px-2.5 py-1.5 text-[0.6rem] uppercase tracking-architect transition-colors',
                    s === order.status
                      ? 'border-ink bg-ink text-paper'
                      : 'border-stone-line hover:border-ink disabled:opacity-40',
                  )}
                >
                  {statusMeta(s).label}
                </button>
              ))}
            </div>
          </AdminCard>

          <AdminCard title="Customer">
            <DefinitionList
              rows={[
                { label: 'Name', value: order.customerName },
                { label: 'Email', value: <a href={`mailto:${order.customerEmail}`} className="link-underline">{order.customerEmail}</a> },
                { label: 'Phone', value: <a href={`tel:${order.customerPhone}`} className="link-underline">{order.customerPhone}</a> },
              ]}
            />
            {order.customerNote ? (
              <div className="mt-4 border border-stone-line bg-paper-warm p-3 text-xs">
                <p className="mb-1 text-[0.6rem] uppercase tracking-architect text-ink-400">Customer note</p>
                {order.customerNote}
              </div>
            ) : null}
          </AdminCard>

          {/* A GST invoice has to be raised against these exact details. */}
          {order.gstInvoice ? (
            <AdminCard
              title="GST invoice requested"
              description="Raise the invoice against these details."
            >
              <DefinitionList
                rows={[
                  { label: 'Company', value: order.companyName ?? '—' },
                  {
                    label: 'GSTIN',
                    value: <span className="font-mono">{order.gstin ?? '—'}</span>,
                  },
                ]}
              />
            </AdminCard>
          ) : null}

          <AdminCard title="Delivery address">
            <address className="text-sm not-italic leading-relaxed text-ink-600">
              <span className="block font-medium text-ink">{order.shippingAddress.fullName}</span>
              {order.shippingAddress.line1}
              {order.shippingAddress.line2 ? <><br />{order.shippingAddress.line2}</> : null}
              {order.shippingAddress.landmark ? <><br />{order.shippingAddress.landmark}</> : null}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pincode}
              <br />
              {order.shippingAddress.phone}
            </address>
          </AdminCard>

          <AdminCard title="Shipping">
            <div className="space-y-4">
              <Input
                label="Courier" value={tracking.courierName}
                onChange={(e) => setTracking({ ...tracking, courierName: e.target.value })}
              />
              <Input
                label="Tracking number" value={tracking.trackingNumber}
                onChange={(e) => setTracking({ ...tracking, trackingNumber: e.target.value })}
              />
              <Input
                label="Tracking URL" value={tracking.trackingUrl}
                onChange={(e) => setTracking({ ...tracking, trackingUrl: e.target.value })}
              />
              <Button size="sm" fullWidth loading={update.isPending} onClick={() => update.mutate(tracking)}>
                Save tracking
              </Button>
            </div>
          </AdminCard>

          <AdminCard title="Internal note">
            <Textarea
              value={adminNote}
              rows={4}
              placeholder="Only visible to your team"
              onChange={(e) => setAdminNote(e.target.value)}
            />
            <Button
              size="sm"
              className="mt-3"
              fullWidth
              variant="secondary"
              loading={update.isPending}
              onClick={() => update.mutate({ adminNote })}
            >
              Save note
            </Button>
          </AdminCard>
        </div>
      </div>

      {/* Refund */}
      <Modal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title="Refund this payment"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRefundOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={refund.isPending}
              onClick={() => refund.mutate(refundAmount ? Number(refundAmount) : undefined)}
            >
              Issue refund
            </Button>
          </div>
        }
      >
        <p className="mb-4 text-sm leading-relaxed text-ink-600">
          This sends a refund request to Razorpay. Leave the amount blank to refund the full
          {' '}{formatPrice(order.total)}.
        </p>
        <Input
          type="number"
          label="Partial amount (₹)"
          value={refundAmount}
          placeholder={String(order.total)}
          onChange={(e) => setRefundAmount(e.target.value)}
        />
      </Modal>

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel this order?"
        message="The order is marked cancelled and any tracked stock is returned to inventory. If it was paid online, issue the refund separately."
        confirmLabel="Cancel order"
        loading={update.isPending}
        onCancel={() => setCancelOpen(false)}
        onConfirm={() => update.mutate({ status: 'CANCELLED' })}
      />
    </>
  );
}
