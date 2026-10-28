import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { API_URL, ApiError, api, tokenStore } from '../../lib/api';
import type { Order } from '../../lib/types';
import { formatDate, formatPrice, statusMeta } from '../../lib/format';
import { useToast } from '../../context/StoreProvider';
import { AdminCard, AdminPageHeader, AdminSearch, DataTable } from '../../components/admin/AdminKit';
import { Badge, Button, ConfirmDialog, Input, Pagination, Select } from '../../components/ui';

const ORDER_STATUSES = [
  'PENDING', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP',
  'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED',
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

  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);

  const { data, isLoading, refetch } = useQuery({
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

  /*
   * Narrowing the list drops the selection.
   *
   * Ticks are invisible once a row is filtered away, and acting on orders
   * nobody can see is how a bulk tool turns into an accident. Changing page is
   * deliberately not in here: picking a few from one page and a few from the
   * next is a reasonable thing to do, and those rows are all still listed.
   */
  useEffect(() => {
    setSelected([]);
  }, [search, status, paymentStatus, paymentMethod, from, to]);

  const isDelete = bulkAction === 'DELETE';

  /*
   * Applied one order at a time, through the endpoints a single order already
   * uses.
   *
   * Every guard therefore still runs: an order with money against it refuses
   * to be cancelled or deleted, stock goes back when it should, lifecycle
   * timestamps get stamped, and the customer is emailed about the change. A
   * bulk endpoint would have had to repeat all of that, and would have drifted
   * from it the first time one side was edited.
   *
   * One failure does not stop the rest. The ones that worked are reported, and
   * the first refusal is shown verbatim because it says what to do about it.
   */
  const applyBulk = async () => {
    setConfirming(false);
    setApplying(true);

    const ids = [...selected];
    let done = 0;
    let firstProblem = '';

    for (const id of ids) {
      try {
        if (isDelete) await api.delete(`/admin/orders/${id}`);
        else await api.patch(`/admin/orders/${id}`, { status: bulkAction });
        done += 1;
      } catch (err) {
        if (!firstProblem) firstProblem = err instanceof ApiError ? err.message : 'Could not be updated';
      }
    }

    const skipped = ids.length - done;
    setSelected([]);
    setBulkAction('');
    await refetch();
    setApplying(false);

    if (!done) push(firstProblem || 'Nothing was changed', 'error');
    else if (skipped) push(`${done} updated · ${skipped} skipped — ${firstProblem}`, 'info');
    else push(`${done} order${done === 1 ? '' : 's'} ${isDelete ? 'deleted' : 'updated'}`, 'success');
  };

  const bulkSummary = () => {
    const count = `${selected.length} order${selected.length === 1 ? '' : 's'}`;
    if (isDelete) {
      return `Delete ${count}? Items and payment records go with them, and this cannot be undone. Any order with a captured payment will be skipped — refund it first.`;
    }
    const label = statusMeta(bulkAction).label.toLowerCase();
    const warning =
      bulkAction === 'SHIPPED' || bulkAction === 'OUT_FOR_DELIVERY'
        ? ' The email carries tracking details, which are set per order — add them on each order afterwards if you have them.'
        : '';
    return `Set ${count} to ${label}? Each customer is emailed about the change.${warning}`;
  };

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
          {/*
            A native date input carries an intrinsic minimum width — wide
            enough for "mm/dd/yyyy" and the picker button — and a grid item
            will not shrink past that unless told to. Without min-w-0 the two
            of them push the filter row off the side of the page.
          */}
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <Input
              type="date" value={from} aria-label="From date"
              wrapClassName="min-w-0" className="min-w-0"
              onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            />
            <Input
              type="date" value={to} aria-label="To date"
              wrapClassName="min-w-0" className="min-w-0"
              onChange={(e) => { setTo(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        {/*
          Only once something is ticked. An empty bulk bar sitting above every
          list is a row of controls that does nothing most of the time.
        */}
        {selected.length ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 border border-stone-line bg-paper-off px-4 py-3">
            <span className="text-sm font-medium">
              {selected.length} selected
            </span>
            <Select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value)}
              aria-label="Bulk action"
              className="w-auto min-w-[200px]"
              options={[
                { value: '', label: 'Bulk actions…' },
                ...ORDER_STATUSES.map((s) => ({
                  value: s,
                  label: `Change status to ${statusMeta(s).label.toLowerCase()}`,
                })),
                { value: 'DELETE', label: 'Delete permanently' },
              ]}
            />
            <Button
              size="sm"
              variant={isDelete ? 'danger' : 'primary'}
              disabled={!bulkAction}
              loading={applying}
              onClick={() => setConfirming(true)}
            >
              Apply
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        ) : null}

        <ConfirmDialog
          open={confirming}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void applyBulk()}
          title={isDelete ? 'Delete orders' : 'Change order status'}
          message={bulkSummary()}
          confirmLabel={isDelete ? 'Delete' : 'Apply'}
          tone={isDelete ? 'danger' : 'primary'}
        />

        <DataTable
          rows={orders}
          loading={isLoading}
          emptyTitle="No orders found"
          emptyDescription="Try clearing the filters, or wait for your first order."
          selection={{
            selected,
            onChange: setSelected,
            label: (order) => `order ${order.orderNumber}`,
          }}
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
