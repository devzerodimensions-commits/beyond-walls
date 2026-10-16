import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { PageLoader } from '../ui';
import { Header } from './Header';
import { Footer } from './Footer';
import { CartDrawer } from './CartDrawer';

/** Storefront-only shell, split away from the admin entry bundle. */
export default function StorefrontLayout() {
  const { pathname } = useLocation();
  const overlaid = pathname === '/';

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1" style={overlaid ? undefined : { paddingTop: 'var(--header-h)' }}>
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <CartDrawer />
    </div>
  );
}

