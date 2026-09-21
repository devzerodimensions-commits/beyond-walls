import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../../lib/api';
import type { DashboardData } from '../../lib/types';
import { formatDate, formatPrice, relativeTime, statusMeta } from '../../lib/format';
import { AdminCard, AdminPageHeader, DataTable, StatusBadge } from '../../components/admin/AdminKit';
import { AlertIcon, Badge, ButtonLink, Skeleton } from '../../components/ui';

export default function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get<DashboardData>('/admin/dashboard'),
  });

  if (isLoading || !data) {
    return (
      <>
        <AdminPageHeader title="Dashboard" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="mt-6 h-64 w-full" />
      </>
    );
  }

  const {
    counts, revenue, revenueSeries, lowStock, recentOrders, recentEnquiries, statusBreakdown,
    launchChecks,
  } = data;

  return (
    <>
      <AdminPageHeader
        title="Dashboard"
        description="An overview of your store."
        actions={
          <>
            <ButtonLink to="/admin/products/new" size="sm">
              Add product
            </ButtonLink>
            <ButtonLink to="/admin/orders" size="sm" variant="secondary">
              View orders
            </ButtonLink>
          </>
        }
      />

      <LaunchChecklist checks={launchChecks} />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue (paid)" value={formatPrice(revenue.allTime)} sub={`${formatPrice(revenue.thisMonth)} this month`} />
        <Stat label="Orders" value={String(counts.orders)} sub={`${counts.pendingOrders} need attention`} to="/admin/orders" />
        <Stat label="Products" value={String(counts.products)} sub={`${counts.draftProducts} in draft`} to="/admin/products" />
        <Stat label="Customers" value={String(counts.customers)} sub={`${counts.newEnquiries} new enquiries`} to="/admin/customers" />
      </div>

      {/* Revenue chart */}
      <AdminCard title="Revenue — last 30 days" className="mt-6">
        <RevenueChart series={revenueSeries} />
      </AdminCard>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Recent orders */}
        <AdminCard
          title="Recent orders"
          className="lg:col-span-2"
          actions={
            <Link to="/admin/orders" className="link-underline text-2xs uppercase tracking-architect">
              View all
            </Link>
          }
        >
          <DataTable
            rows={recentOrders}
            emptyTitle="No orders yet"
            emptyDescription="Orders will appear here once customers start buying."
            columns={[
              {
                key: 'order',
                header: 'Order',
                render: (row) => (
                  <Link to={`/admin/orders/${row.id}`} className="font-mono text-xs hover:underline">
                    {row.orderNumber}
                  </Link>
                ),
              },
              { key: 'customer', header: 'Customer', render: (row) => row.customerName },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <StatusBadge status={row.status} />,
              },
              {
                key: 'payment',
                header: 'Payment',
                render: (row) => {
                  const meta = statusMeta(row.paymentStatus);
                  return (
                    <span className="flex items-center gap-1.5">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="text-2xs text-ink-300">
                        {row.paymentMethod === 'COD' ? 'COD' : 'Online'}
                      </span>
                    </span>
                  );
                },
              },
              {
                key: 'total',
                header: 'Total',
                className: 'text-right',
                render: (row) => <span className="font-medium">{formatPrice(row.total)}</span>,
              },
              {
                key: 'date',
                header: 'Placed',
                render: (row) => <span className="text-2xs text-ink-400">{formatDate(row.placedAt)}</span>,
              },
            ]}
          />
        </AdminCard>

        {/* Side column */}
        <div className="space-y-6">
          <AdminCard title="Order status">
            {statusBreakdown.length ? (
              <ul className="space-y-2.5">
                {statusBreakdown.map((row) => {
                  const meta = statusMeta(row.status);
                  return (
                    <li key={row.status} className="flex items-center justify-between text-sm">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="font-medium tabular-nums">{row.count}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-ink-400">No orders yet.</p>
            )}
          </AdminCard>

          <AdminCard
            title="Low stock"
            actions={
              lowStock.length ? <AlertIcon size={15} className="text-state-warning" /> : null
            }
          >
            {lowStock.length ? (
              <ul className="space-y-2.5">
                {lowStock.map((product) => (
                  <li key={product.id} className="flex items-center justify-between gap-3 text-sm">
                    <Link to={`/admin/products/${product.id}`} className="truncate hover:underline">
                      {product.name}
                    </Link>
                    <span
                      className={clsx(
                        'shrink-0 text-xs font-medium tabular-nums',
                        product.stock === 0 ? 'text-state-danger' : 'text-state-warning',
                      )}
                    >
                      {product.stock}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-400">Nothing is running low.</p>
            )}
          </AdminCard>

          <AdminCard
            title="Latest enquiries"
            actions={
              <Link to="/admin/enquiries" className="link-underline text-2xs uppercase tracking-architect">
                All
              </Link>
            }
          >
            {recentEnquiries.length ? (
              <ul className="space-y-3">
                {recentEnquiries.map((enquiry) => (
                  <li key={enquiry.id}>
                    <Link to="/admin/enquiries" className="block hover:text-ink">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm">{enquiry.name}</span>
                        <StatusBadge status={enquiry.status} />
                      </div>
                      <p className="mt-0.5 truncate text-2xs text-ink-400">
                        {enquiry.subject || enquiry.type.replace(/_/g, ' ').toLowerCase()} ·{' '}
                        {relativeTime(enquiry.createdAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-400">No enquiries yet.</p>
            )}
          </AdminCard>
        </div>
      </div>
    </>
  );
}

/**
 * Everything that is still provisional. Placeholder prices are the important
 * one: they are live and sellable, so the store could take real money at a
 * number nobody has agreed to.
 */
function LaunchChecklist({ checks }: { checks: DashboardData['launchChecks'] }) {
  const { unconfirmedPrices, domainConfirmed, siteUrl, razorpayConfigured, emailConfigured } = checks;

  const items: { key: string; tone: 'warn' | 'info'; body: React.ReactNode }[] = [];

  if (unconfirmedPrices.length) {
    items.push({
      key: 'prices',
      tone: 'warn',
      body: (
        <>
          <p className="font-medium text-ink">
            {unconfirmedPrices.length} published{' '}
            {unconfirmedPrices.length === 1 ? 'product is' : 'products are'} still on a placeholder price
          </p>
          <p className="mt-1 leading-relaxed">
            These were filled in so the catalogue could be tested. Customers can buy at these prices
            right now. Open each product, set the real price and tick{' '}
            <em>Price confirmed</em>.
          </p>
          <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
            {unconfirmedPrices.slice(0, 8).map((product) => (
              <li key={product.id}>
                <Link to={`/admin/products/${product.id}`} className="link-underline text-ink">
                  {product.name}
                </Link>
                <span className="ml-1.5 text-ink-400">{formatPrice(product.price)}</span>
              </li>
            ))}
            {unconfirmedPrices.length > 8 ? (
              <li className="text-ink-400">and {unconfirmedPrices.length - 8} more</li>
            ) : null}
          </ul>
        </>
      ),
    });
  }

  if (!domainConfirmed) {
    items.push({
      key: 'domain',
      tone: 'warn',
      body: (
        <>
          <p className="font-medium text-ink">The canonical domain has not been confirmed</p>
          <p className="mt-1 leading-relaxed">
            Canonical tags, the sitemap and share links all point at{' '}
            <code className="font-mono text-ink">{siteUrl || 'nothing'}</code>, which was inferred
            rather than supplied.{' '}
            <Link to="/admin/settings?group=seo" className="link-underline text-ink">
              Check it in SEO settings
            </Link>
            .
          </p>
        </>
      ),
    });
  }

  if (!razorpayConfigured) {
    items.push({
      key: 'razorpay',
      tone: 'info',
      body: (
        <>
          <p className="font-medium text-ink">Online payment is not connected</p>
          <p className="mt-1 leading-relaxed">
            Customers can only pay by cash on delivery. Add your Razorpay keys to the server
            environment to accept UPI, cards, net banking and wallets.
          </p>
        </>
      ),
    });
  }

  if (!emailConfigured) {
    items.push({
      key: 'email',
      tone: 'info',
      body: (
        <>
          <p className="font-medium text-ink">Email is not connected</p>
          <p className="mt-1 leading-relaxed">
            Order confirmations, password resets and enquiry alerts are written to the server log
            instead of being sent. Add SMTP details to the server environment.
          </p>
        </>
      ),
    });
  }

  if (!items.length) return null;

  return (
    <section className="mb-6 border border-stone-line">
      <header className="flex items-center gap-2 border-b border-stone-line bg-paper-off px-5 py-3">
        <AlertIcon size={15} className="text-state-warning" />
        <h2 className="text-2xs uppercase tracking-architect text-ink">Before you go live</h2>
        <Badge>{items.length}</Badge>
      </header>
      <ul className="divide-y divide-stone-line">
        {items.map((item) => (
          <li
            key={item.key}
            className={clsx(
              'px-5 py-4 text-xs text-ink-600',
              item.tone === 'warn' && 'border-l-2 border-l-state-warning',
            )}
          >
            {item.body}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({
  label, value, sub, to,
}: {
  label: string;
  value: string;
  sub?: string;
  to?: string;
}) {
  const content = (
    <>
      <p className="eyebrow">{label}</p>
      <p className="mt-2 text-2xl font-medium tabular-nums">{value}</p>
      {sub ? <p className="mt-1 text-2xs text-ink-400">{sub}</p> : null}
    </>
  );

  return to ? (
    <Link to={to} className="border border-stone-line bg-paper p-5 transition-colors hover:border-ink">
      {content}
    </Link>
  ) : (
    <div className="border border-stone-line bg-paper p-5">{content}</div>
  );
}

/** Lightweight inline bar chart — no charting dependency needed. */
function RevenueChart({ series }: { series: { date: string; value: number }[] }) {
  const max = Math.max(...series.map((s) => s.value), 1);
  const total = series.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <p className="py-10 text-center text-xs text-ink-400">
        No paid orders in the last 30 days yet.
      </p>
    );
  }

  return (
    <div>
      <div className="flex h-40 items-end gap-1" role="img" aria-label="Daily revenue for the last 30 days">
        {series.map((point) => (
          <div key={point.date} className="group relative flex-1">
            <div
              className="w-full bg-ink-200 transition-colors group-hover:bg-ink"
              style={{ height: `${Math.max(2, (point.value / max) * 150)}px` }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap bg-ink px-2 py-1 text-[0.6rem] text-paper group-hover:block">
              {formatDate(point.date)} · {formatPrice(point.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between text-2xs text-ink-400">
        <span>{formatDate(series[0]?.date)}</span>
        <span className="font-medium text-ink">{formatPrice(total)} total</span>
        <span>{formatDate(series[series.length - 1]?.date)}</span>
      </div>
    </div>
  );
}
