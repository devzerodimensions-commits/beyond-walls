import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Order } from '../../lib/types';
import { PageLoader } from '../../components/ui';

/**
 * The confirmation page already renders a complete order view (including the
 * retry-payment flow), so the account view simply reuses it.
 */
export default function AccountOrderDetail() {
  const { orderNumber } = useParams();

  const { data: order, isLoading } = useQuery({
    queryKey: ['account-order', orderNumber],
    queryFn: () => api.get<Order>(`/orders/${orderNumber}`),
    enabled: Boolean(orderNumber),
    retry: false,
  });

  if (isLoading) return <PageLoader />;
  if (!order) return <Navigate to="/account/orders" replace />;

  return <Navigate to={`/order/${order.orderNumber}`} replace />;
}
