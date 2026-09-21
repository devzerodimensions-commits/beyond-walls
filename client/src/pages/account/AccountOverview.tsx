import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { OrderSummary } from '../../lib/types';
import { formatDate, formatPrice, statusMeta } from '../../lib/format';
import { useAuth, useWishlist } from '../../context/StoreProvider';
import { Badge, ButtonLink, Skeleton } from '../../components/ui';

export default function AccountOverview() {
  const { user } = useAuth();
  const { count: wishlistCount } = useWishlist();

  const { data, isLoading } = useQuery({
    queryKey: ['my-orders', 1],
    queryFn: () => api.list<OrderSummary[]>('/orders', { page: 1, perPage: 3 }),
  });

  const orders = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  return (
    <div className="space-y-10">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Orders" value={String(total)} to="/account/orders" />
        <StatTile label="Wishlist" value={String(wishlistCount)} to="/account/wishlist" />
        <StatTile label="Account" value={user?.email ?? ''} to="/account/profile" small />
      </div>

      {/* Recent orders */}
      <section>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-architect">Recent orders</h2>
          <Link to="/account/orders" className="link-underline text-2xs uppercase tracking-architect">
            View all
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="border border-dashed border-stone-line p-10 text-center">
            <p className="text-sm text-ink-500">You have not placed an order yet.</p>
            <ButtonLink to="/shop" size="sm" className="mt-5">
              Browse the shop
            </ButtonLink>
          </div>
        ) : (
          <ul className="divide-y divide-stone-line border-y border-stone-line">
            {orders.map((order) => {
              const status = statusMeta(order.status);
              return (
                <li key={order.id}>
                  <Link
                    to={`/account/orders/${order.orderNumber}`}
                    className="flex flex-wrap items-center justify-between gap-3 py-4 transition-colors hover:text-ink"
                  >
                    <div>
                      <p className="font-mono text-sm">{order.orderNumber}</p>
                      <p className="mt-0.5 text-2xs text-ink-400">{formatDate(order.placedAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <span className="text-sm font-medium">{formatPrice(order.total)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatTile({
  label, value, to, small,
}: {
  label: string;
  value: string;
  to: string;
  small?: boolean;
}) {
  return (
    <Link to={to} className="border border-stone-line bg-paper p-5 transition-colors hover:border-ink">
      <p className="eyebrow">{label}</p>
      <p className={small ? 'mt-2 truncate text-sm text-ink-600' : 'mt-2 text-2xl font-medium'}>{value}</p>
    </Link>
  );
}
