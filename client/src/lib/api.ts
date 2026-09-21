/**
 * Thin fetch wrapper around the Beyond Walls API.
 *
 * Handles: auth headers, the guest-cart session token, envelope unwrapping,
 * typed errors, and a single silent access-token refresh on 401.
 */

/*
 * These are baked in at BUILD time, not read at runtime.
 *
 * In production the server hosts the site, the admin panel and the API from one
 * origin, so the defaults are relative — the site talks to whatever host it was
 * loaded from. That is what makes the build portable: the same bundle works on
 * a Render URL, a staging domain and the live domain without rebuilding, and a
 * forgotten variable cannot ship a site that calls the visitor's own machine.
 *
 * Set them only to point the client at a different origin, which is what
 * client/.env does for local development (Vite on 5173, API on 4000).
 */
export const API_URL = (import.meta.env.VITE_API_URL as string) || '/api';
export const ASSET_URL = (import.meta.env.VITE_ASSET_URL as string) || '';
export const SITE_URL = (import.meta.env.VITE_SITE_URL as string) || window.location.origin;

const ACCESS_KEY = 'bw.accessToken';
const CART_KEY = 'bw.cartSession';
const SESSION_KEY = 'bw.hasSession';

export interface ApiMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  [key: string]: unknown;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: ApiMeta;
  message?: string;
  error?: { code: string; message: string; details?: unknown };
}

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: ApiErrorDetail[];

  constructor(status: number, message: string, code = 'ERROR', details?: ApiErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field-keyed messages for inline form errors. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details ?? []) out[d.path] = d.message;
    return out;
  }
}

// --- token storage ---------------------------------------------------------

/**
 * Only the short-lived access token is held in JS. The refresh token lives in an
 * HttpOnly cookie the browser attaches automatically, so no script can read it.
 */
export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  /**
   * Whether this browser has an active session at all.
   *
   * The refresh token is HttpOnly, so JavaScript cannot see it. Without this
   * marker every first-time visitor would fire /auth/me, get a 401, attempt a
   * refresh, get another 401 and retry — three failed requests and a console
   * full of errors on a page they are simply browsing. The flag holds no
   * secret: it only records that a session was once issued here.
   */
  get hasSession() {
    return localStorage.getItem(SESSION_KEY) === '1';
  },
  set(access: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(SESSION_KEY, '1');
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(SESSION_KEY);
    // Remove the token left behind by pre-cookie sessions.
    localStorage.removeItem('bw.refreshToken');
  },
};

/** Stable per-browser token so guests keep their cart across reloads. */
export function cartSessionId(): string {
  let id = localStorage.getItem(CART_KEY);
  if (!id) {
    id = `guest_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(CART_KEY, id);
  }
  return id;
}

export function clearCartSession() {
  localStorage.removeItem(CART_KEY);
}

// --- request ---------------------------------------------------------------

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Skip the Authorization header (used by the refresh call itself). */
  skipAuth?: boolean;
  /** Skip the automatic refresh-and-retry on 401. */
  skipRetry?: boolean;
  query?: Record<string, unknown>;
}

function buildUrl(path: string, query?: Record<string, unknown>): string {
  const base = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return base;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchanges the HttpOnly refresh cookie for a fresh access token.
 * `credentials: 'include'` is what puts the cookie on the request; there is no
 * refresh token in JavaScript to send.
 */
async function refreshAccessToken(): Promise<boolean> {
  // Collapse concurrent 401s into a single refresh request.
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          tokenStore.clear();
          return false;
        }
        const json = (await res.json()) as ApiEnvelope<{ accessToken: string }>;
        tokenStore.set(json.data.accessToken);
        return true;
      } catch {
        tokenStore.clear();
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const { body, skipAuth, skipRetry, query, headers, ...rest } = options;

  const isFormData = body instanceof FormData;
  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    'x-cart-session': cartSessionId(),
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...((headers as Record<string, string>) ?? {}),
  };

  if (!skipAuth) {
    const token = tokenStore.access;
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path, query), {
    ...rest,
    // Sends the HttpOnly refresh cookie on the auth routes that need it.
    credentials: 'include',
    headers: finalHeaders,
    body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
  });

  // One silent refresh-and-retry when the access token has expired. A visitor
  // who has never signed in has nothing to refresh, so we do not ask.
  if (response.status === 401 && !skipRetry && !skipAuth && tokenStore.hasSession) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, { ...options, skipRetry: true });
    }
  }

  let payload: ApiEnvelope<T> | null = null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  }

  if (!response.ok) {
    const err = payload?.error;
    throw new ApiError(
      response.status,
      err?.message ?? `Request failed (${response.status})`,
      err?.code ?? 'ERROR',
      (err?.details as ApiErrorDetail[] | undefined) ?? undefined,
    );
  }

  if (!payload) {
    throw new ApiError(response.status, 'Unexpected response from the server');
  }

  return payload;
}

/** Convenience helpers that unwrap `data`. */
export const api = {
  get: <T>(path: string, query?: Record<string, unknown>) =>
    request<T>(path, { method: 'GET', query }).then((r) => r.data),

  /** GET that keeps `meta` (for paginated lists). */
  list: <T>(path: string, query?: Record<string, unknown>) =>
    request<T>(path, { method: 'GET', query }).then((r) => ({ data: r.data, meta: r.meta })),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body }).then((r) => r.data),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body }).then((r) => r.data),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body }).then((r) => r.data),

  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body }).then((r) => r.data),

  upload: <T>(path: string, form: FormData, method: 'POST' | 'PATCH' = 'POST') =>
    request<T>(path, { method, body: form }).then((r) => r.data),
};

/** Resolves an upload path to a fully-qualified URL. */
export function assetUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  return `${ASSET_URL}${url.startsWith('/') ? url : `/${url}`}`;
}
