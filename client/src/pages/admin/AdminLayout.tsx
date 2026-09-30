import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Helmet } from 'react-helmet-async';
import { api } from '../../lib/api';
import type { DashboardData } from '../../lib/types';
import { useAuth, useSettings } from '../../context/StoreProvider';
import { useAdminTheme } from '../../lib/adminTheme';
import { ThemeSwitcher } from '../../components/admin/ThemeSwitcher';
import {
  BoxIcon, CloseIcon, CompassIcon, DashboardIcon, ExternalIcon, HelpIcon, ImageIcon, InboxIcon,
  LayersIcon, LogoutIcon, MenuIcon, PagesIcon, QuoteIcon, ReceiptIcon, SearchIcon, SettingsIcon,
  SparkIcon, TagIcon, TicketIcon, UsersIcon,
} from '../../components/ui';

/**
 * The admin shell.
 *
 * Structure, top to bottom: a bar that runs the full width of the window, and
 * under it a sidebar beside the working area. The bar carries identity, the
 * search, the theme and the account; the sidebar carries only navigation. The
 * previous shell put all of that in one dark column down the left, which meant
 * the search and the account sat as far from the content as it is possible to
 * put them.
 *
 * The sidebar is a page surface rather than a slab of chrome, so a theme can
 * repaint the whole panel at once. On desktop it collapses to an icon rail; on
 * anything narrower it is a drawer, because on a phone the admin is used to
 * check an order or answer an enquiry and that wants the full width.
 *
 * Every colour comes from a token. See `styles/admin.css`.
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

const COLLAPSE_KEY = 'bw.admin.rail';

export default function AdminLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const { theme, setTheme, themes } = useAdminTheme();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // A forgotten rail width is not worth failing the click over.
      }
      return next;
    });
  };

  // Counts drive the navigation badges.
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

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const current = ALL_ITEMS.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  );

  const group = NAV.find((g) => g.items.some((i) => i === current));

  const brand =
    typeof settings['brand.name'] === 'string' ? (settings['brand.name'] as string) : 'Beyond Walls';

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(trimmed)) }))
        .filter((g) => g.items.length)
    : NAV;

  // The rail collapses only on desktop; inside the drawer it is always full.
  const sidebar = (full: boolean) => (
    <div
      className="flex h-full flex-col border-r"
      style={{ background: 'var(--a-side)', borderColor: 'var(--a-side-line)' }}
    >
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Admin">
        {filtered.map((g) => (
          <div key={g.group} className="mb-5">
            {full ? <p className="a-nav-group">{g.group}</p> : <div className="mx-2 mb-2 h-px" style={{ background: 'var(--a-side-line)' }} />}
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const count = badgeCount(item.badge);
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className="a-nav-link"
                      title={full ? undefined : item.label}
                      style={full ? undefined : { justifyContent: 'center', padding: '0.55rem' }}
                    >
                      <Icon size={18} className="shrink-0" />
                      {full ? <span className="flex-1 truncate">{item.label}</span> : null}
                      {count > 0 ? (
                        <span
                          className={clsx(
                            'rounded-full text-[0.7rem] font-semibold leading-none',
                            full ? 'px-1.5 py-0.5' : 'absolute right-1.5 top-1 h-2 w-2',
                          )}
                          style={{ background: 'var(--a-accent)', color: 'var(--a-on-accent)' }}
                          aria-label={full ? undefined : `${count} waiting`}
                        >
                          {full ? count : ''}
                        </span>
                      ) : null}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {trimmed && !filtered.length ? (
          <p className="px-3 py-4 text-sm" style={{ color: 'var(--a-side-muted)' }}>
            Nothing in the menu matches “{query.trim()}”.
          </p>
        ) : null}
      </nav>

      <div className="border-t p-3" style={{ borderColor: 'var(--a-side-line)' }}>
        <Link
          to="/"
          target="_blank"
          rel="noreferrer"
          className="a-nav-link"
          title={full ? undefined : 'View the site'}
          style={full ? undefined : { justifyContent: 'center', padding: '0.55rem' }}
        >
          <ExternalIcon size={17} className="shrink-0" />
          {full ? <span className="flex-1 truncate">View the site</span> : null}
        </Link>
      </div>
    </div>
  );

  return (
    <div className="admin-ui min-h-screen" data-admin-theme={theme}>
      <Helmet>
        <title>{current ? `${current.label} · ${brand} admin` : `${brand} admin`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* ---------------- Top bar ---------------- */}
      <header
        className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b px-3 sm:px-5"
        style={{ background: 'var(--a-surface)', borderColor: 'var(--a-line)' }}
      >
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="a-btn a-btn-ghost px-2 lg:hidden"
        >
          <MenuIcon size={20} />
        </button>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu'}
          aria-pressed={collapsed}
          className="a-btn a-btn-ghost hidden px-2 lg:inline-flex"
        >
          <MenuIcon size={20} />
        </button>

        <Link to="/admin" className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--a-radius-sm)] text-sm font-semibold"
            style={{ background: 'var(--a-accent)', color: 'var(--a-on-accent)' }}
            aria-hidden="true"
          >
            {brand.charAt(0)}
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-sm font-semibold leading-tight" style={{ color: 'var(--a-text)' }}>
              {brand}
            </span>
            <span className="block text-xs leading-tight" style={{ color: 'var(--a-faint)' }}>
              Admin panel
            </span>
          </span>
        </Link>

        {/* Where you are. Hidden on small screens, where the title carries it. */}
        <div className="ml-2 hidden min-w-0 items-center gap-2 md:flex">
          <span aria-hidden="true" style={{ color: 'var(--a-faint)' }}>/</span>
          {group ? (
            <>
              <span className="text-sm" style={{ color: 'var(--a-faint)' }}>{group.group}</span>
              <span aria-hidden="true" style={{ color: 'var(--a-faint)' }}>/</span>
            </>
          ) : null}
          <span className="truncate text-sm font-medium" style={{ color: 'var(--a-text)' }}>
            {current?.label ?? 'Admin'}
          </span>
        </div>

        <div className="flex-1" />

        <MenuSearch query={query} setQuery={setQuery} />

        <ThemeSwitcher theme={theme} themes={themes} onChange={setTheme} />

        <AccountMenu name={user?.name} email={user?.email} onSignOut={() => void logout()} />
      </header>

      <div className="flex">
        {/* ---------------- Sidebar ---------------- */}
        <aside
          className={clsx(
            'sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 lg:block',
            collapsed ? 'w-[4.25rem]' : 'w-[15.5rem]',
          )}
          style={{ transition: 'width 0.18s ease' }}
        >
          {sidebar(!collapsed)}
        </aside>

        {/* ---------------- Drawer ---------------- */}
        {drawerOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 animate-fade-in"
              style={{ background: 'rgba(0, 0, 0, 0.45)' }}
            />
            <div className="absolute inset-y-0 left-0 w-[16.5rem] max-w-[85%] animate-slide-in-right">
              <div className="flex h-full flex-col" style={{ background: 'var(--a-side)' }}>
                <div
                  className="flex h-16 shrink-0 items-center justify-between border-b px-4"
                  style={{ borderColor: 'var(--a-side-line)' }}
                >
                  <span className="text-sm font-semibold" style={{ color: 'var(--a-side-text)' }}>
                    {brand}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    aria-label="Close menu"
                    className="a-btn a-btn-ghost px-2"
                  >
                    <CloseIcon size={18} />
                  </button>
                </div>
                <div className="min-h-0 flex-1">{sidebar(true)}</div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ---------------- Working area ---------------- */}
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[86rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

/** Filters the sidebar. It lives in the bar because that is where people look. */
function MenuSearch({ query, setQuery }: { query: string; setQuery: (v: string) => void }) {
  return (
    <div className="relative hidden md:block">
      <SearchIcon
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--a-faint)' }}
      />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Jump to…"
        aria-label="Search the admin menu"
        className="field w-56 py-1.5 pl-9 pr-3 text-sm"
        style={{ background: 'var(--a-sunken)' }}
      />
    </div>
  );
}

function AccountMenu({
  name, email, onSignOut,
}: {
  name?: string;
  email?: string;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${name ?? 'signed in'}`}
        className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold"
        style={{ background: 'var(--a-accent-soft)', color: 'var(--a-accent-ink)' }}
      >
        {(name ?? 'A').charAt(0).toUpperCase()}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-[var(--a-radius)] border shadow-[var(--a-shadow-lift)]"
          style={{ borderColor: 'var(--a-line)', background: 'var(--a-surface)' }}
        >
          <div className="border-b px-3.5 py-3" style={{ borderColor: 'var(--a-line-soft)' }}>
            <p className="truncate text-sm font-medium" style={{ color: 'var(--a-text)' }}>{name}</p>
            <p className="truncate text-xs" style={{ color: 'var(--a-muted)' }}>{email}</p>
          </div>
          <div className="p-1.5">
            <Link to="/" target="_blank" rel="noreferrer" role="menuitem" className="a-nav-link">
              <ExternalIcon size={16} />
              <span className="flex-1">View the site</span>
            </Link>
            <button type="button" role="menuitem" onClick={onSignOut} className="a-nav-link w-full">
              <LogoutIcon size={16} />
              <span className="flex-1 text-left">Sign out</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
