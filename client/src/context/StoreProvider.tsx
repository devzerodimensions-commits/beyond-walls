import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, clearCartSession, tokenStore } from '../lib/api';
import type { Cart, SiteSettings, User } from '../lib/types';

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export interface Toast {
  id: string;
  message: string;
  tone: 'success' | 'error' | 'info';
  action?: { label: string; href: string };
}

interface ToastContextValue {
  toasts: Toast[];
  push: (message: string, tone?: Toast['tone'], action?: Toast['action']) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function toastReducer(state: Toast[], action: { type: 'add'; toast: Toast } | { type: 'remove'; id: string }) {
  if (action.type === 'add') return [...state, action.toast].slice(-4);
  return state.filter((t) => t.id !== action.id);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const SettingsContext = createContext<{
  site: SiteSettings | undefined;
  isLoading: boolean;
  isError: boolean;
} | null>(null);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { name: string; email: string; password: string; phone?: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (input: { name?: string; phone?: string | null }) => Promise<User>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

interface AddToCartInput {
  productId: string;
  variantId?: string | null;
  quantity?: number;
  personalization?: Record<string, string>;
}

interface CartContextValue {
  cart: Cart | undefined;
  isLoading: boolean;
  itemCount: number;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  addItem: (input: AddToCartInput) => Promise<void>;
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  updatePersonalization: (itemId: string, personalization: Record<string, string>) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clear: () => Promise<void>;
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => Promise<void>;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

// ---------------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------------

interface WishlistContextValue {
  ids: Set<string>;
  isWishlisted: (productId: string) => boolean;
  toggle: (productId: string) => Promise<void>;
  count: number;
  refresh: () => Promise<void>;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function StoreProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [toasts, dispatchToast] = useReducer(toastReducer, []);

  const push = useCallback((message: string, tone: Toast['tone'] = 'info', action?: Toast['action']) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    dispatchToast({ type: 'add', toast: { id, message, tone, action } });
    window.setTimeout(() => dispatchToast({ type: 'remove', id }), tone === 'error' ? 6500 : 4000);
  }, []);

  const dismiss = useCallback((id: string) => dispatchToast({ type: 'remove', id }), []);
  const toastValue = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  // --- Settings ------------------------------------------------------------
  const settingsQuery = useQuery({
    queryKey: ['site-settings'],
    queryFn: () => api.get<SiteSettings>('/settings'),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const settingsValue = useMemo(
    () => ({
      site: settingsQuery.data,
      isLoading: settingsQuery.isLoading,
      isError: settingsQuery.isError,
    }),
    [settingsQuery.data, settingsQuery.isLoading, settingsQuery.isError],
  );

  // --- Auth ----------------------------------------------------------------
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    /*
     * There may be no access token but still a valid refresh cookie (a returning
     * visitor), so an expired token is not the same as no session. But someone
     * who has never signed in on this browser has nothing to restore, and
     * asking anyway costs three failed requests on every page they open.
     */
    if (!tokenStore.access && !tokenStore.hasSession) {
      setUser(null);
      setAuthLoading(false);
      return;
    }

    try {
      const me = await api.get<User>('/auth/me');
      setUser(me);
    } catch {
      tokenStore.clear();
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.post<{ user: User; accessToken: string }>('/auth/login', {
        email,
        password,
      });
      tokenStore.set(result.accessToken);
      setUser(result.user);
      // The guest cart merges into the account cart on the next fetch.
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      await queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      return result.user;
    },
    [queryClient],
  );

  const register = useCallback(
    async (input: { name: string; email: string; password: string; phone?: string }) => {
      const result = await api.post<{ user: User; accessToken: string }>('/auth/register', input);
      tokenStore.set(result.accessToken);
      setUser(result.user);
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      return result.user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    tokenStore.clear();
    setUser(null);
    clearCartSession();
    // The server clears the HttpOnly cookie and revokes the stored token.
    await api.post('/auth/logout').catch(() => undefined);
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const updateProfile = useCallback(async (input: { name?: string; phone?: string | null }) => {
    const updated = await api.patch<User>('/auth/me', input);
    setUser(updated);
    return updated;
  }, []);

  const authValue = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: authLoading,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'ADMIN',
      login,
      register,
      logout,
      refreshUser,
      updateProfile,
    }),
    [user, authLoading, login, register, logout, refreshUser, updateProfile],
  );

  // --- Cart ----------------------------------------------------------------
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  const cartQuery = useQuery({
    queryKey: ['cart', user?.id ?? 'guest'],
    queryFn: () => api.get<Cart>('/cart'),
    staleTime: 15 * 1000,
  });

  const setCartData = useCallback(
    (cart: Cart) => {
      queryClient.setQueryData(['cart', user?.id ?? 'guest'], cart);
    },
    [queryClient, user?.id],
  );

  const handleCartError = useCallback(
    (err: unknown) => {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      push(message, 'error');
      throw err;
    },
    [push],
  );

  const addItem = useCallback(
    async (input: AddToCartInput) => {
      try {
        const cart = await api.post<Cart>('/cart/items', {
          productId: input.productId,
          variantId: input.variantId ?? null,
          quantity: input.quantity ?? 1,
          personalization: input.personalization ?? {},
        });
        setCartData(cart);
        setDrawerOpen(true);
      } catch (err) {
        handleCartError(err);
      }
    },
    [setCartData, handleCartError],
  );

  const updateItem = useCallback(
    async (itemId: string, quantity: number) => {
      try {
        const cart = await api.patch<Cart>(`/cart/items/${itemId}`, { quantity });
        setCartData(cart);
      } catch (err) {
        handleCartError(err);
      }
    },
    [setCartData, handleCartError],
  );

  const updatePersonalization = useCallback(
    async (itemId: string, personalization: Record<string, string>) => {
      try {
        const cart = await api.patch<Cart>(`/cart/items/${itemId}`, { personalization });
        setCartData(cart);
        push('Customisation updated', 'success');
      } catch (err) {
        handleCartError(err);
      }
    },
    [setCartData, handleCartError, push],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      try {
        const cart = await api.delete<Cart>(`/cart/items/${itemId}`);
        setCartData(cart);
        push('Removed from cart', 'info');
      } catch (err) {
        handleCartError(err);
      }
    },
    [setCartData, handleCartError, push],
  );

  const clear = useCallback(async () => {
    try {
      const cart = await api.delete<Cart>('/cart');
      setCartData(cart);
    } catch (err) {
      handleCartError(err);
    }
  }, [setCartData, handleCartError]);

  const applyCoupon = useCallback(
    async (code: string) => {
      try {
        const cart = await api.post<Cart>('/cart/coupon', { code });
        setCartData(cart);
        push(`Coupon ${code.toUpperCase()} applied`, 'success');
      } catch (err) {
        handleCartError(err);
      }
    },
    [setCartData, handleCartError, push],
  );

  const removeCoupon = useCallback(async () => {
    try {
      const cart = await api.delete<Cart>('/cart/coupon');
      setCartData(cart);
    } catch (err) {
      handleCartError(err);
    }
  }, [setCartData, handleCartError]);

  const refreshCart = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['cart'] });
  }, [queryClient]);

  const cartValue = useMemo<CartContextValue>(
    () => ({
      cart: cartQuery.data,
      isLoading: cartQuery.isLoading,
      itemCount: cartQuery.data?.totals.itemCount ?? 0,
      isDrawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      addItem,
      updateItem,
      updatePersonalization,
      removeItem,
      clear,
      applyCoupon,
      removeCoupon,
      refresh: refreshCart,
    }),
    [
      cartQuery.data, cartQuery.isLoading, isDrawerOpen, addItem, updateItem,
      updatePersonalization, removeItem, clear, applyCoupon, removeCoupon, refreshCart,
    ],
  );

  // --- Wishlist ------------------------------------------------------------
  const wishlistQuery = useQuery({
    queryKey: ['wishlist', user?.id],
    queryFn: () => api.get<{ productId: string }[]>('/wishlist'),
    enabled: Boolean(user),
    staleTime: 60 * 1000,
  });

  const wishlistIds = useMemo(
    () => new Set((wishlistQuery.data ?? []).map((w) => w.productId)),
    [wishlistQuery.data],
  );

  const toggleWishlist = useCallback(
    async (productId: string) => {
      if (!user) {
        push('Sign in to save items to your wishlist', 'info', { label: 'Sign in', href: '/login' });
        return;
      }
      try {
        if (wishlistIds.has(productId)) {
          await api.delete(`/wishlist/${productId}`);
          push('Removed from wishlist', 'info');
        } else {
          await api.post(`/wishlist/${productId}`);
          push('Saved to wishlist', 'success');
        }
        await queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      } catch (err) {
        push(err instanceof ApiError ? err.message : 'Could not update your wishlist', 'error');
      }
    },
    [user, wishlistIds, push, queryClient],
  );

  const wishlistValue = useMemo<WishlistContextValue>(
    () => ({
      ids: wishlistIds,
      isWishlisted: (id: string) => wishlistIds.has(id),
      toggle: toggleWishlist,
      count: wishlistIds.size,
      refresh: async () => {
        await queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      },
    }),
    [wishlistIds, toggleWishlist, queryClient],
  );

  return (
    <ToastContext.Provider value={toastValue}>
      <SettingsContext.Provider value={settingsValue}>
        <AuthContext.Provider value={authValue}>
          <CartContext.Provider value={cartValue}>
            <WishlistContext.Provider value={wishlistValue}>{children}</WishlistContext.Provider>
          </CartContext.Provider>
        </AuthContext.Provider>
      </SettingsContext.Provider>
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useRequired<T>(context: T | null, name: string): T {
  if (!context) throw new Error(`${name} must be used inside <StoreProvider>`);
  return context;
}

export const useToast = () => useRequired(useContext(ToastContext), 'useToast');
export const useAuth = () => useRequired(useContext(AuthContext), 'useAuth');
export const useCart = () => useRequired(useContext(CartContext), 'useCart');
export const useWishlist = () => useRequired(useContext(WishlistContext), 'useWishlist');

export function useSettings() {
  const ctx = useRequired(useContext(SettingsContext), 'useSettings');
  const settings = ctx.site?.settings ?? {};

  return {
    ...ctx,
    settings,
    navLinks: ctx.site?.navLinks ?? [],
    footerPages: ctx.site?.footerPages ?? [],
    /** Typed getter with a fallback, so pages never render `undefined`. */
    get: <T,>(key: string, fallback: T): T => {
      const value = settings[key];
      return (value === undefined || value === null ? fallback : value) as T;
    },
  };
}
