import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CheckoutConfig } from '../lib/types';

/**
 * Payment availability, straight from the server.
 *
 * The storefront uses this to decide whether it may advertise online payment at
 * all — no "secured by Razorpay" claim is shown until Razorpay keys are actually
 * configured on the server AND the admin has switched it on.
 */
export function usePaymentConfig() {
  const query = useQuery({
    queryKey: ['checkout-config'],
    queryFn: () => api.get<CheckoutConfig>('/checkout/config'),
    staleTime: 5 * 60 * 1000,
  });

  const config = query.data;
  const razorpayLive = Boolean(config?.razorpay.enabled && config?.razorpay.configured);
  const codLive = Boolean(config?.cod.enabled);

  /** The methods we can honestly name on the storefront. */
  const methods: string[] = [];
  if (razorpayLive) methods.push('UPI', 'Cards', 'Net banking', 'Wallets');
  if (codLive) methods.push('Cash on delivery');

  return {
    config,
    isLoading: query.isLoading,
    razorpayLive,
    codLive,
    /** True when at least one payment route actually works. */
    canPay: razorpayLive || codLive,
    methods,
    methodsLine: methods.join(' · '),
  };
}
