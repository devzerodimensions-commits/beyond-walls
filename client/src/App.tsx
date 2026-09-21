import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { CartDrawer } from './components/layout/CartDrawer';
import { PageLoader, ToastViewport } from './components/ui';
import { useAuth } from './context/StoreProvider';

// --- Storefront pages ------------------------------------------------------
import HomePage from './pages/HomePage';
const ShopPage = lazy(() => import('./pages/shop/ShopPage'));
const ProductPage = lazy(() => import('./pages/shop/ProductPage'));
const CartPage = lazy(() => import('./pages/CartPage'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
const OrderConfirmationPage = lazy(() => import('./pages/OrderConfirmationPage'));
const TrackOrderPage = lazy(() => import('./pages/TrackOrderPage'));
const CustomOrderPage = lazy(() => import('./pages/CustomOrderPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const GalleryPage = lazy(() => import('./pages/GalleryPage'));
const StaticPage = lazy(() => import('./pages/StaticPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

// --- Account ---------------------------------------------------------------
const AccountLayout = lazy(() => import('./pages/account/AccountLayout'));
const AccountOverview = lazy(() => import('./pages/account/AccountOverview'));
const AccountOrders = lazy(() => import('./pages/account/AccountOrders'));
const AccountOrderDetail = lazy(() => import('./pages/account/AccountOrderDetail'));
const AccountAddresses = lazy(() => import('./pages/account/AccountAddresses'));
const AccountWishlist = lazy(() => import('./pages/account/AccountWishlist'));
const AccountProfile = lazy(() => import('./pages/account/AccountProfile'));

// --- Admin -----------------------------------------------------------------
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'));
const AdminProductEdit = lazy(() => import('./pages/admin/AdminProductEdit'));
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories'));
const AdminAttributes = lazy(() => import('./pages/admin/AdminAttributes'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'));
const AdminOrderDetail = lazy(() => import('./pages/admin/AdminOrderDetail'));
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'));
const AdminEnquiries = lazy(() => import('./pages/admin/AdminEnquiries'));
const AdminDesignPages = lazy(() => import('./pages/admin/AdminDesignPages'));
const AdminPageBuilder = lazy(() => import('./pages/admin/AdminPageBuilder'));
const AdminContentLists = lazy(() => import('./pages/admin/AdminContentLists'));
const AdminMedia = lazy(() => import('./pages/admin/AdminMedia'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));

/** Resets scroll on navigation, except when returning via the back button. */
function ScrollToTop() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, search]);
  return null;
}

function StorefrontLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <CartDrawer />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading, isAuthenticated } = useAuth();

  if (isLoading) return <PageLoader label="Checking access" />;
  // Admins sign in through a dedicated screen, so non-admins never see the panel.
  if (!isAuthenticated || !isAdmin) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* ---------------- Storefront ---------------- */}
        <Route element={<StorefrontLayout />}>
          <Route index element={<HomePage />} />
          <Route path="shop" element={<ShopPage />} />
          <Route path="shop/:categorySlug" element={<ShopPage />} />
          <Route path="product/:slug" element={<ProductPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="order/:orderNumber" element={<OrderConfirmationPage />} />
          <Route path="track-order" element={<TrackOrderPage />} />
          <Route path="custom-order" element={<CustomOrderPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="gallery" element={<GalleryPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />

          <Route
            path="account"
            element={
              <RequireAuth>
                <Suspense fallback={<PageLoader />}>
                  <AccountLayout />
                </Suspense>
              </RequireAuth>
            }
          >
            <Route index element={<AccountOverview />} />
            <Route path="orders" element={<AccountOrders />} />
            <Route path="orders/:orderNumber" element={<AccountOrderDetail />} />
            <Route path="addresses" element={<AccountAddresses />} />
            <Route path="wishlist" element={<AccountWishlist />} />
            <Route path="profile" element={<AccountProfile />} />
          </Route>

          {/* Dynamic CMS pages: /about, /privacy-policy, … */}
          <Route path=":slug" element={<StaticPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* ---------------- Admin ---------------- */}
        <Route
          path="admin/builder"
          element={
            <RequireAdmin>
              <Suspense fallback={<PageLoader label="Opening the editor" />}>
                <AdminPageBuilder />
              </Suspense>
            </RequireAdmin>
          }
        />
        <Route
          path="admin/login"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminLogin />
            </Suspense>
          }
        />
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <Suspense fallback={<PageLoader label="Loading admin" />}>
                <AdminLayout />
              </Suspense>
            </RequireAdmin>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="products/new" element={<AdminProductEdit />} />
          <Route path="products/:id" element={<AdminProductEdit />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="attributes" element={<AdminAttributes />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="orders/:id" element={<AdminOrderDetail />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="enquiries" element={<AdminEnquiries />} />
          <Route path="design-pages" element={<AdminDesignPages />} />
          <Route path="banners" element={<AdminContentLists resource="banners" />} />
          <Route path="gallery" element={<AdminContentLists resource="gallery" />} />
          <Route path="testimonials" element={<AdminContentLists resource="testimonials" />} />
          <Route path="faqs" element={<AdminContentLists resource="faqs" />} />
          <Route path="coupons" element={<AdminContentLists resource="coupons" />} />
          <Route path="reviews" element={<AdminContentLists resource="reviews" />} />
          <Route path="navigation" element={<AdminContentLists resource="nav-links" />} />
          <Route path="media" element={<AdminMedia />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>

      <ToastViewport />
    </>
  );
}
