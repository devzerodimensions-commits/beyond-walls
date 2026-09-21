/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_ASSET_URL: string;
  readonly VITE_SITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Razorpay Checkout, loaded on demand from checkout.razorpay.com. */
interface RazorpayInstance {
  open: () => void;
  close: () => void;
  on: (event: string, handler: (response: never) => void) => void;
}

interface Window {
  Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
}
