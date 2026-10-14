import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink as RouterNavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../../lib/api';
import type { CatalogFilters, Category, GalleryItem } from '../../lib/types';
import { useAuth, useCart, useSettings, useWishlist } from '../../context/StoreProvider';
import { CartIcon, ChevronDown, HeartIcon, MenuIcon, SearchIcon, UserIcon } from '../ui';
import { MegaMenu } from './MegaMenu';
import { MobileNav } from './MobileNav';
import { SearchOverlay } from './SearchOverlay';
import { Logo } from './Logo';

export { Logo };

export function AnnouncementBar() {
  const { get } = useSettings();
  const enabled = get<boolean>('announcement.enabled', false);
  const text = get<string>('announcement.text', '');
  const link = get<string | null>('announcement.link', null);

  if (!enabled || !text) return null;

  const content = <span className="text-2xs uppercase tracking-architect">{text}</span>;

  return (
    <div className="bg-ink px-4 py-2.5 text-center text-paper">
      {link ? (
        <Link to={link} className="link-underline">
          {content}
        </Link>
      ) : (
        content
      )}
    </div>
  );
}

export function Header() {
  const navigate = useNavigate();
  const { navLinks, get } = useSettings();
  const { itemCount, openDrawer } = useCart();
  const { user, isAuthenticated } = useAuth();
  const { count: wishlistCount } = useWishlist();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const closeTimer = useRef<number>();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Cmd/Ctrl+K opens search, as people expect on a catalogue site.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const categoriesQuery = useQuery({
    queryKey: ['nav-categories'],
    queryFn: () => api.get<Category[]>('/catalog/categories'),
    staleTime: 10 * 60 * 1000,
  });

  const filtersQuery = useQuery({
    queryKey: ['catalog-filters', undefined],
    queryFn: () => api.get<CatalogFilters>('/catalog/filters'),
    staleTime: 10 * 60 * 1000,
  });

  const galleryQuery = useQuery({
    queryKey: ['gallery'],
    queryFn: () => api.get<GalleryItem[]>('/gallery'),
    staleTime: 10 * 60 * 1000,
  });

  /*
   * The header carries two kinds of link, and the reference the studio sent
   * puts them on two different lines: the small row at the very top is for
   * errands -- about the company, how to reach them -- and the big centred row
   * under the logo is for shopping.
   *
   * Split by destination rather than by a list kept here, so adding a link in
   * the admin still lands on the right line.
   */
  const { shoppingLinks, utilityLinks } = useMemo(() => {
    const all = navLinks
      .filter((l) => l.group === 'header' && l.href !== '/shop' && l.href !== '/custom-order')
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const isErrand = (href: string) =>
      !href.startsWith('/shop') && href !== '/gallery';

    return {
      shoppingLinks: all.filter((l) => !isErrand(l.href)),
      utilityLinks: all.filter((l) => isErrand(l.href)),
    };
  }, [navLinks]);

  const socials = useMemo(
    () =>
      ([
        ['social.instagram', 'Instagram'],
        ['social.facebook', 'Facebook'],
        ['social.pinterest', 'Pinterest'],
        ['social.linkedin', 'LinkedIn'],
        ['social.youtube', 'YouTube'],
      ] as const)
        .map(([key, label]) => ({ label, url: get<string | null>(key, null) }))
        .filter((s) => Boolean(s.url)),
    [get],
  );

  const openMenu = () => {
    window.clearTimeout(closeTimer.current);
    setMenuOpen(true);
  };
  const closeMenu = () => {
    closeTimer.current = window.setTimeout(() => setMenuOpen(false), 140);
  };

  return (
    <>
      <AnnouncementBar />

      <header
        className={clsx(
          'sticky top-0 z-50 border-b bg-paper/95 backdrop-blur-md transition-shadow duration-300',
          scrolled ? 'border-stone-line shadow-card' : 'border-stone-line/60',
        )}
      >
        {/* ---- Errands, and where to find the studio elsewhere ---- */}
        {utilityLinks.length || socials.length ? (
          <div className="hidden border-b border-stone-line/60 lg:block">
            <div className="container-site flex h-9 items-center justify-between">
              <nav className="flex items-center gap-6" aria-label="Secondary">
                {utilityLinks.map((link) => (
                  <Link
                    key={link.id}
                    to={link.href}
                    className="text-2xs uppercase tracking-architect text-ink-400 transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  to="/track-order"
                  className="text-2xs uppercase tracking-architect text-ink-400 transition-colors hover:text-ink"
                >
                  Track an order
                </Link>
              </nav>

              <div className="flex items-center gap-5">
                {socials.map((social) => (
                  <a
                    key={social.label}
                    href={social.url as string}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-2xs uppercase tracking-architect text-ink-400 transition-colors hover:text-ink"
                  >
                    {social.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/*
          ---- The logo, centred, with the tools either side ----

          Three columns of equal width rather than a flex row. The logo is only
          truly centred on the page if what sits to its left and what sits to
          its right take the same space, and they never hold the same things.
        */}
        <div className="container-site">
          <div className="grid h-[68px] grid-cols-[1fr_auto_1fr] items-center gap-4 sm:h-[76px]">
            <div className="flex items-center justify-start">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="-ml-2 p-2 text-ink lg:hidden"
                aria-label="Open menu"
              >
                <MenuIcon size={21} />
              </button>

              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="hidden p-2.5 text-ink-600 transition-colors hover:text-ink lg:block"
                aria-label="Search"
              >
                <SearchIcon size={19} />
              </button>
            </div>

            <Link to="/" className="justify-self-center" aria-label="Beyond Walls — home">
              <Logo />
            </Link>

            {/* ---- Tools ---- */}
            <div className="flex items-center justify-end gap-0.5 sm:gap-1">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="p-2.5 text-ink-600 transition-colors hover:text-ink lg:hidden"
                aria-label="Search"
              >
                <SearchIcon size={19} />
              </button>

              <Link
                to={isAuthenticated ? '/account/wishlist' : '/login'}
                className="relative hidden p-2.5 text-ink-600 transition-colors hover:text-ink sm:block"
                aria-label={`Wishlist${wishlistCount ? ` — ${wishlistCount} saved` : ''}`}
              >
                <HeartIcon size={19} />
                {wishlistCount > 0 ? <Dot>{wishlistCount}</Dot> : null}
              </Link>

              <Link
                to={isAuthenticated ? '/account' : '/login'}
                className="p-2.5 text-ink-600 transition-colors hover:text-ink"
                aria-label={isAuthenticated ? `Account — ${user?.name}` : 'Sign in'}
              >
                <UserIcon size={19} />
              </Link>

              <button
                type="button"
                onClick={openDrawer}
                className="relative p-2.5 text-ink-600 transition-colors hover:text-ink"
                aria-label={`Cart — ${itemCount} item${itemCount === 1 ? '' : 's'}`}
              >
                <CartIcon size={19} />
                {itemCount > 0 ? <Dot>{itemCount}</Dot> : null}
              </button>
            </div>
          </div>
        </div>

        {/* ---- Shopping, on its own line under the logo ---- */}
        <div className="hidden border-t border-stone-line/60 lg:block">
          <nav
            className="container-site flex items-center justify-center gap-8 xl:gap-10"
            aria-label="Main"
          >
            <Link
              to="/shop"
              onMouseEnter={openMenu}
              onMouseLeave={closeMenu}
              onFocus={openMenu}
              aria-expanded={menuOpen}
              className={clsx(
                'flex items-center gap-1.5 py-3.5 text-xs font-medium uppercase tracking-[0.12em] transition-colors',
                menuOpen ? 'text-ink' : 'text-ink-600 hover:text-ink',
              )}
            >
              Shop
              <ChevronDown
                size={12}
                className={clsx('transition-transform duration-300', menuOpen && 'rotate-180')}
              />
            </Link>

            {shoppingLinks.map((link) => (
              <RouterNavLink
                key={link.id}
                to={link.href}
                className={({ isActive }) =>
                  clsx(
                    'py-3.5 text-xs font-medium uppercase tracking-[0.12em] transition-colors',
                    isActive ? 'text-ink' : 'text-ink-600 hover:text-ink',
                  )
                }
              >
                {link.label}
              </RouterNavLink>
            ))}

            {/* Custom Order is the one highlighted destination. */}
            <Link
              to="/custom-order"
              className="my-2 border border-ink px-4 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-ink transition-colors duration-200 hover:bg-ink hover:text-paper"
            >
              Custom Order
            </Link>
          </nav>
        </div>

        {/*
          Full width, flush under the nav rather than a box floating beneath it.
          A floating panel has to decide where to sit and clips at the edge when
          it guesses wrong; a band spanning the header has nowhere to be clipped
          and gives the pictures room to be pictures.
        */}
        {menuOpen ? (
          <div
            className="absolute inset-x-0 top-full hidden border-t border-stone-line bg-paper shadow-panel lg:block"
            onMouseEnter={openMenu}
            onMouseLeave={closeMenu}
          >
            <MegaMenu
              categories={categoriesQuery.data ?? []}
              filters={filtersQuery.data}
              gallery={galleryQuery.data ?? []}
              onNavigate={() => setMenuOpen(false)}
            />
          </div>
        ) : null}
      </header>

      <MobileNav
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        categories={categoriesQuery.data ?? []}
        filters={filtersQuery.data}
        navLinks={navLinks}
      />

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(path) => navigate(path)}
      />
    </>
  );
}

function Dot({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center bg-ink px-1 text-[0.55rem] font-semibold text-paper">
      {children}
    </span>
  );
}
