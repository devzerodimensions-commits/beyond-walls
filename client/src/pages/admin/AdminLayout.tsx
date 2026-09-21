import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Helmet } from 'react-helmet-async';
import { api } from '../../lib/api';
import type { DashboardData } from '../../lib/types';
import { useAuth, useSettings } from '../../context/StoreProvider';
import { CloseIcon, ExternalIcon, MenuIcon } from '../../components/ui';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  badge?: 'enquiries' | 'orders';
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Overview',
    items: [{ to: '/admin', label: 'Dashboard', end: true }],
  },
  {
    group: 'Catalogue',
    items: [
      { to: '/admin/products', label: 'Products' },
      { to: '/admin/categories', label: 'Categories' },
      { to: '/admin/attributes', label: 'Materials, styles & shapes' },
      { to: '/admin/coupons', label: 'Coupons' },
      { to: '/admin/reviews', label: 'Reviews' },
    ],
  },
  {
    group: 'Sales',
    items: [
      { to: '/admin/orders', label: 'Orders', badge: 'orders' },
      { to: '/admin/customers', label: 'Customers' },
      { to: '/admin/enquiries', label: 'Enquiries', badge: 'enquiries' },
    ],
  },
  {
    group: 'Content',
    items: [
      { to: '/admin/design-pages', label: 'Design Pages' },
      { to: '/admin/banners', label: 'Banners' },
      { to: '/admin/gallery', label: 'Gallery' },
      { to: '/admin/testimonials', label: 'Testimonials' },
      { to: '/admin/faqs', label: 'FAQs' },
      { to: '/admin/navigation', label: 'Navigation' },
      { to: '/admin/media', label: 'Media' },
    ],
  },
  {
    group: 'Configuration',
    items: [{ to: '/admin/settings', label: 'Settings' }],
  },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { get } = useSettings();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Counts drive the sidebar badges.
  const { data: dashboard } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get<DashboardData>('/admin/dashboard'),
    staleTime: 60 * 1000,
  });

  const badgeCount = (badge: NavItem['badge']) => {
    if (badge === 'enquiries') return dashboard?.counts.newEnquiries ?? 0;
    if (badge === 'orders') return dashboard?.counts.pendingOrders ?? 0;
    return 0;
  };

  return (
    <div className="flex min-h-screen bg-paper-off">
      <Helmet>
        {/* The admin panel must never be indexed. */}
        <meta name="robots" content="noindex, nofollow" />
        <title>Admin · Beyond Walls</title>
      </Helmet>

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-stone-line bg-paper',
          'transition-transform duration-300 ease-architect lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-stone-line px-5 py-5">
          <Link to="/admin" className="flex flex-col leading-none">
            <span className="font-display text-sm font-semibold tracking-wider2">
              {get<string>('brand.logoText', 'BEYOND WALLS')}
            </span>
            <span className="mt-1 text-[0.5rem] uppercase tracking-wider2 text-ink-400">Admin panel</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1 text-ink-400 lg:hidden"
            aria-label="Close menu"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Admin">
          {NAV.map((section) => (
            <div key={section.group} className="mb-6">
              <p className="mb-2 px-3 text-[0.6rem] font-semibold uppercase tracking-architect text-ink-300">
                {section.group}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const count = badgeCount(item.badge);
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          clsx(
                            'flex items-center justify-between gap-2 px-3 py-2 text-xs transition-colors',
                            isActive
                              ? 'bg-ink text-paper'
                              : 'text-ink-600 hover:bg-paper-warm hover:text-ink',
                          )
                        }
                      >
                        <span>{item.label}</span>
                        {count > 0 ? (
                          <span className="flex h-4 min-w-[16px] items-center justify-center bg-state-danger px-1 text-[0.55rem] font-semibold text-paper">
                            {count}
                          </span>
                        ) : null}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-stone-line px-5 py-4">
          <p className="truncate text-xs font-medium">{user?.name}</p>
          <p className="truncate text-2xs text-ink-400">{user?.email}</p>
          <div className="mt-3 flex items-center gap-3">
            <Link
              to="/"
              target="_blank"
              className="flex items-center gap-1.5 text-2xs uppercase tracking-architect text-ink-500 hover:text-ink"
            >
              <ExternalIcon size={12} /> View site
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="text-2xs uppercase tracking-architect text-ink-400 hover:text-state-danger"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
        />
      ) : null}

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-line bg-paper/95 px-5 py-3 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="p-1.5 text-ink"
            aria-label="Open admin menu"
          >
            <MenuIcon size={20} />
          </button>
          <span className="text-xs font-semibold uppercase tracking-architect">Admin</span>
        </header>

        <main key={location.pathname} className="flex-1 px-5 py-8 lg:px-10 lg:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
