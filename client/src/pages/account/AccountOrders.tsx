import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, assetUrl } from '../../lib/api';
import type { OrderSummary } from '../../lib/types';
import { formatDate, formatPrice, statusMeta } from '../../lib/format';
import { Badge, ButtonLink, EmptyState, Pagination, Skeleton } from '../../components/ui';

export default function AccountOrders() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['my-orders', page],
    queryFn: () => api.list<OrderSummary[]>('/orders', { page, perPage: 10 }),
    placeholderData: keepPreviousData,
  });

  const orders = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (!orders.length) {
    return (
      <EmptyState
        title="No orders yet"
        description="When you place an order, it will appear here."
        action={<ButtonLink to="/shop">Browse the shop</ButtonLink>}
      />
    );
  }

  return (
    <>
      <h2 className="mb-6 text-xs font-semibold uppercase tracking-architect">Your orders</h2>

      <ul className="space-y-4">
        {orders.map((order) => {
          const status = statusMeta(order.status);
          const payment = statusMeta(order.paymentStatus);
          return (
            <li key={order.id}>
              <Link
                to={`/account/orders/${order.orderNumber}`}
                className="block border border-stone-line bg-paper p-5 transition-colors hover:border-ink"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-sm font-medium">{order.orderNumber}</p>
                    <p className="mt-1 text-2xs text-ink-400">
                      {formatDate(order.placedAt)} · {order.itemCount} item
                      {order.itemCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {order.paymentStatus !== 'PAID' ? (
                      <Badge tone={payment.tone}>{payment.label}</Badge>
                    ) : null}
                    <span className="ml-1 text-sm font-medium">{formatPrice(order.total)}</span>
                  </div>
                </div>

                {order.preview?.length ? (
                  <div className="mt-4 flex items-center gap-2">
                    {order.preview.map((item) => (
                      <img
                        key={item.id}
                        src={assetUrl(item.image)}
                        alt=""
                        className="h-12 w-11 bg-paper-warm object-cover"
                      />
                    ))}
                    {order.itemCount > order.preview.length ? (
                      <span className="text-2xs text-ink-400">
                        +{order.itemCount - order.preview.length} more
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <Pagination page={page} totalPages={data?.meta?.totalPages ?? 1} onChange={setPage} />
    </>
  );
}
