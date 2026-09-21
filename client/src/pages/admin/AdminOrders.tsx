import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { API_URL, api, tokenStore } from '../../lib/api';
import type { Order } from '../../lib/types';
import { formatDate, formatPrice, statusMeta } from '../../lib/format';
import { useToast } from '../../context/StoreProvider';
import { AdminCard, AdminPageHeader, AdminSearch, DataTable } from '../../components/admin/AdminKit';
import { Badge, Button, Input, Pagination, Select } from '../../components/ui';

const ORDER_STATUSES = [
  'PENDING', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP',
  'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED',
];

const PAYMENT_STATUSES = [
  'PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED',
];

export default function AdminOrders() {
  const { push } = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orders', page, search, status, paymentStatus, paymentMethod, from, to],
    queryFn: () =>
      api.list<Order[]>('/admin/orders', {
        page, perPage: 25, search, status, paymentStatus, paymentMethod, from, to,
      }),
    placeholderData: keepPreviousData,
  });

  /** Downloads the CSV with the admin token attached. */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const response = await fetch(`${API_URL}/admin/orders-export.csv${status ? `?status=${status}` : ''}`, {
        headers: { Authorization: `Bearer ${tokenStore.access ?? ''}` },
      });
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `beyond-walls-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      push('Export downloaded', 'success');
    } catch {
      push('Could not export orders', 'error');
    } finally {
      setExporting(false);
    }
  };

  const orders = data?.data ?? [];

  return (
    <>
      <AdminPageHeader
        title="Orders"
        description="Every order, with the customisation the customer submitted."
        actions={
          <Button size="sm" variant="secondary" loading={exporting} onClick={() => void exportCsv()}>
            Export CSV
          </Button>
        }
      />

      <AdminCard>
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <AdminSearch
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Order no., name, email…"
            className="lg:col-span-2"
          />
          <Select
            value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            aria-label="Filter by order status"
            options={[
              { value: '', label: 'All statuses' },
              ...ORDER_STATUSES.map((s) => ({ value: s, label: statusMeta(s).label })),
            ]}
          />
          <Select
            value={paymentStatus} onChange={(e) => { setPaymentStatus(e.target.value); setPage(1); }}
            aria-label="Filter by payment status"
            options={[
              { value: '', label: 'All payments' },
              ...PAYMENT_STATUSES.map((s) => ({ value: s, label: statusMeta(s).label })),
            ]}
          />
          <Select
            value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setPage(1); }}
            aria-label="Filter by payment method"
            options={[
              { value: '', label: 'Any method' },
              { value: 'RAZORPAY', label: 'Online' },
              { value: 'COD', label: 'Cash on delivery' },
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From date" />
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To date" />
          </div>
        </div>

        <DataTable
          rows={orders}
          loading={isLoading}
          emptyTitle="No orders found"
          emptyDescription="Try clearing the filters, or wait for your first order."
          columns={[
            {
              key: 'order',
              header: 'Order',
              render: (order) => (
                <Link to={`/admin/orders/${order.id}`} className="block">
                  <p className="font-mono text-xs font-medium hover:underline">{order.orderNumber}</p>
                  <p className="text-2xs text-ink-400">{formatDate(order.placedAt, true)}</p>
                </Link>
              ),
            },
            {
              key: 'customer',
              header: 'Customer',
              render: (order) => (
                <div className="min-w-0">
                  <p className="truncate text-sm">{order.customerName}</p>
                  <p className="truncate text-2xs text-ink-400">{order.customerEmail}</p>
                </div>
              ),
            },
            {
              key: 'items',
              header: 'Items',
              render: (order) => (
                <span className="text-xs text-ink-500">
                  {order.items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (order) => {
                const meta = statusMeta(order.status);
                return <Badge tone={meta.tone}>{meta.label}</Badge>;
              },
            },
            {
              key: 'payment',
              header: 'Payment',
              render: (order) => {
                const meta = statusMeta(order.paymentStatus);
                return (
                  <div className="flex flex-col gap-1">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span className="text-2xs text-ink-300">
                      {order.paymentMethod === 'COD' ? 'COD' : 'Online'}
                    </span>
                  </div>
                );
              },
            },
            {
              key: 'total',
              header: 'Total',
              className: 'text-right',
              render: (order) => <span className="font-medium">{formatPrice(order.total)}</span>,
            },
          ]}
        />

        <Pagination page={page} totalPages={data?.meta?.totalPages ?? 1} onChange={setPage} />
      </AdminCard>
    </>
  );
}
