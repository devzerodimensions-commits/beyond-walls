/**
 * Razorpay Checkout loader.
 *
 * The script is fetched on demand so it never costs anything on pages that do
 * not take payment. Only the PUBLIC key id is used here — it is fetched from
 * the API at checkout time, and the secret key never leaves the server.
 */

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let loader: Promise<boolean> | null = null;

export function loadRazorpay(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  if (!loader) {
    loader = new Promise<boolean>((resolve) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(true));
        existing.addEventListener('error', () => resolve(false));
        return;
      }
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => {
        loader = null;
        resolve(false);
      };
      document.body.appendChild(script);
    });
  }
  return loader;
}

export interface RazorpayHandlerResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayFailure {
  error: {
    code?: string;
    description?: string;
    reason?: string;
    metadata?: { payment_id?: string; order_id?: string };
  };
}

export interface OpenCheckoutOptions {
  keyId: string;
  /** Amount in paise, as returned by the server. */
  amount: number;
  currency: string;
  orderId: string;
  name: string;
  description: string;
  logo?: string;
  prefill: { name: string; email: string; contact: string };
  notes?: Record<string, string>;
  onSuccess: (response: RazorpayHandlerResponse) => void;
  onFailure: (failure: RazorpayFailure) => void;
  onDismiss: () => void;
}

/** Opens Razorpay Checkout with UPI, cards, net banking and wallets enabled. */
export async function openRazorpayCheckout(options: OpenCheckoutOptions): Promise<boolean> {
  const ready = await loadRazorpay();
  if (!ready || !window.Razorpay) return false;

  const instance = new window.Razorpay({
    key: options.keyId,
    amount: options.amount,
    currency: options.currency,
    order_id: options.orderId,
    name: options.name,
    description: options.description,
    ...(options.logo ? { image: options.logo } : {}),
    prefill: options.prefill,
    notes: options.notes ?? {},
    theme: { color: '#111111', backdrop_color: '#FAF9F7' },
    // Razorpay shows whichever of these the merchant account supports.
    method: { upi: true, card: true, netbanking: true, wallet: true, emi: true, paylater: true },
    handler: (response: unknown) => options.onSuccess(response as RazorpayHandlerResponse),
    modal: {
      ondismiss: () => options.onDismiss(),
      escape: true,
      confirm_close: true,
    },
    retry: { enabled: false }, // retries are handled by our own retry endpoint
  });

  instance.on('payment.failed', (response: unknown) => {
    options.onFailure(response as RazorpayFailure);
  });

  instance.open();
  return true;
}
