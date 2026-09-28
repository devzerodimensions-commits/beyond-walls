import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Helmet } from 'react-helmet-async';
import { api } from '../../lib/api';
import type { DashboardData } from '../../lib/types';
import { useAuth, useSettings } from '../../context/StoreProvider';
import {
  BoxIcon, CloseIcon, CompassIcon, DashboardIcon, ExternalIcon, HelpIcon, ImageIcon, InboxIcon,
  LayersIcon, LogoutIcon, MenuIcon, PagesIcon, QuoteIcon, ReceiptIcon, SearchIcon, SettingsIcon,
  SparkIcon, TagIcon, TicketIcon, UsersIcon,
} from '../../components/ui';

/**
 * The admin shell.
 *
 * A dark rail beside a light working area. The rail is the same near-black the
 * storefront uses, so the two still feel like one product, but everything
 * inside the working area is softer and larger than the shop — see the
 * `.admin-ui` block in styles/index.css for why.
 *
 * Below 1024px the rail becomes a drawer. It is a real drawer, not a squeezed
 * column: on a phone the admin is mostly used to check an order or answer an
 * enquiry, and that needs the full width for content.
 */

interface NavItem {
  to: string;
  label: string;
  icon: (props: { size?: number; className?: string }) => ReactNode;
  end?: boolean;
  badge?: 'enquiries' | 'orders';
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Overview',
    items: [{ to: '/admin', label: 'Dashboard', icon: DashboardIcon, end: true }],
  },
  {
    group: 'Catalogue',
    items: [
      { to: '/admin/products', label: 'Products', icon: BoxIcon },
      { to: '/admin/categories', label: 'Categories', icon: LayersIcon },
      { to: '/admin/attributes', label: 'Materials & styles', icon: TagIcon },
      { to: '/admin/coupons', label: 'Coupons', icon: TicketIcon },
      { to: '/admin/reviews', label: 'Reviews', icon: QuoteIcon },
    ],
  },
  {
    group: 'Sales',
    items: [
      { to: '/admin/orders', label: 'Orders', icon: ReceiptIcon, badge: 'orders' },
      { to: '/admin/customers', label: 'Customers', icon: UsersIcon },
      { to: '/admin/enquiries', label: 'Enquiries', icon: InboxIcon, badge: 'enquiries' },
    ],
  },
  {
    group: 'Website',
    items: [
      { to: '/admin/design-pages', label: 'Design Pages', icon: PagesIcon },
      { to: '/admin/banners', label: 'Banners', icon: SparkIcon },
      { to: '/admin/gallery', label: 'Gallery', icon: ImageIcon },
      { to: '/admin/testimonials', label: 'Testimonials', icon: QuoteIcon },
      { to: '/admin/faqs', label: 'FAQs', icon: HelpIcon },
      { to: '/admin/navigation', label: 'Navigation', icon: CompassIcon },
      { to: '/admin/media', label: 'Media', icon: ImageIcon },
    ],
  },
  {
    group: 'Configuration',
    items: [{ to: '/admin/settings', label: 'Settings', icon: SettingsIcon }],
  },
];

/** Flattened once, for the search and the page title. */
const ALL_ITEMS = NAV.flatMap((group) => group.items);

export default function AdminLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Counts drive the sidebar badges.
  const { data: dashboard } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get<DashboardData>('/admin/dashboard'),
    staleTime: 60_000,
  });

  const badgeCount = (badge: NavItem['badge']) => {
    if (badge === 'enquiries') return dashboard?.counts.newEnquiries ?? 0;
    if (badge === 'orders') return dashboard?.counts.pendingOrders ?? 0;
    return 0;
  };

  // Navigating on a phone should close the drawer behind you.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  // Escape closes it too, which people expect of anything that overlays.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const current = ALL_ITEMS.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  );

  const brand = typeof settings['brand.name'] === 'string' ? (settings['brand.name'] as string) : 'Beyond Walls';

  const filtered = query.trim()
    ? NAV.map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          item.label.toLowerCase().includes(query.trim().toLowerCase()),
        ),
      })).filter((group) => group.items.length)
    : NAV;

  const rail = (
    <div className="flex h-full flex-col" style={{ background: 'var(--a-nav)' }}>
      {/* Brand */}
      <div className="flex items-center justify-between px-5 pb-5 pt-6">
        <Link to="/admin" className="min-w-0">
          <span
            className="block truncate font-display text-base font-medium tracking-tight"
            style={{ color: 'var(--a-nav-text)' }}
          >
            {brand}
          </span>
          <span className="mt-0.5 block text-xs" style={{ color: 'var(--a-nav-muted)' }}>
            Admin panel
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close menu"
          className="-mr-1 rounded-lg p-2 lg:hidden"
          style={{ color: 'var(--a-nav-muted)' }}
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-4">
        <div className="relative">
          <SearchIcon
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--a-nav-muted)' }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to…"
            aria-label="Search the admin menu"
            className="w-full rounded-lg py-2 pl-9 pr-3 text-sm outline-none transition-colors"
            style={{
              background: 'var(--a-nav-soft)',
              color: 'var(--a-nav-text)',
              border: '1px solid transparent',
            }}
          />
        </div>
      </div>

      {/* Links */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="Admin">
        {filtered.map((group) => (
          <div key={group.group} className="mb-5">
            <p className="a-nav-group">{group.group}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const count = badgeCount(item.badge);
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink to={item.to} end={item.end} className="a-nav-link">
                      <Icon size={17} className="shrink-0 opacity-80" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {count > 0 ? (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[0.7rem] font-semibold leading-none"
                          style={{ background: 'var(--a-brass)', color: '#17160F' }}
                        >
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

        {query.trim() && !filtered.length ? (
          <p className="px-3 py-4 text-sm" style={{ color: 'var(--a-nav-muted)' }}>
            Nothing in the menu matches “{query.trim()}”.
          </p>
        ) : null}
      </nav>

      {/* Who is signed in */}
      <div className="border-t px-4 py-4" style={{ borderColor: 'var(--a-nav-soft)' }}>
        <div className="mb-3 flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            style={{ background: 'var(--a-brass)', color: '#17160F' }}
          >
            {(user?.name ?? 'A').charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm" style={{ color: 'var(--a-nav-text)' }}>
              {user?.name}
            </span>
            <span className="block truncate text-xs" style={{ color: 'var(--a-nav-muted)' }}>
              {user?.email}
            </span>
          </span>
        </div>

        <div className="flex gap-2">
          <Link
            to="/"
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs transition-colors"
            style={{ background: 'var(--a-nav-soft)', color: 'var(--a-nav-muted)' }}
          >
            <ExternalIcon size={13} />
            View site
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs transition-colors"
            style={{ background: 'var(--a-nav-soft)', color: 'var(--a-nav-muted)' }}
          >
            <LogoutIcon size={13} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="admin-ui min-h-screen">
      <Helmet>
        <title>{current ? `${current.label} · ${brand} admin` : `${brand} admin`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* Rail — fixed on desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[16.5rem] lg:block">{rail}</aside>

      {/* Drawer — phones and tablets */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 animate-fade-in bg-ink/50 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 w-[17rem] max-w-[85%] animate-slide-in-right">
            {rail}
          </div>
        </div>
      ) : null}

      {/* Working area */}
      <div className="lg:pl-[16.5rem]">
        {/* Top bar: only on small screens, where the rail is hidden */}
        <header
          className="sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-3 lg:hidden"
          style={{ background: 'var(--a-surface)', borderColor: 'var(--a-line)' }}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="a-btn a-btn-ghost -ml-1 px-2"
          >
            <MenuIcon size={20} />
          </button>
          <span className="min-w-0 flex-1 truncate font-medium">{current?.label ?? 'Admin'}</span>
          <Link
            to="/"
            target="_blank"
            rel="noreferrer"
            aria-label="View the site"
            className="a-btn a-btn-ghost px-2"
          >
            <ExternalIcon size={17} />
          </Link>
        </header>

        <main className="mx-auto w-full max-w-[86rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
