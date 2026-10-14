import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink as RouterNavLink, useLocation, useNavigate } from 'react-router-dom';
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

  /*
   * The header sits over the homepage rather than above it, as the reference
   * does: the opening photograph starts at the top of the screen and the
   * header floats on it until you scroll, when it takes its background.
   *
   * Only the homepage, because only its first section is built dark -- the
   * hero carries bg-ink whether or not it has a photograph behind it. Pale
   * text over a pale section would be text nobody can read, so everywhere
   * else the header keeps its paper background and the page starts beneath it.
   */
  const { pathname } = useLocation();
  const overlaid = pathname === '/';
  const transparent = overlaid && !scrolled && !menuOpen;

  /*
   * Being taken out of the flow means the page no longer knows how tall the
   * header is, and it is four rows on a laptop and one on a phone. Measured
   * rather than guessed, and published as a custom property so the layout can
   * leave exactly that much room -- a hardcoded number here is a strip of
   * hidden content the first time somebody adds a nav link that wraps.
   */
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = headerRef.current;
    if (!node) return undefined;
    const publish = () =>
      document.documentElement.style.setProperty('--header-h', `${node.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => observer.disconnect();
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
      <header
        ref={headerRef}
        data-transparent={transparent || undefined}
        className={clsx(
          'fixed inset-x-0 top-0 z-50 border-b transition-[background-color,box-shadow,border-color] duration-300',
          transparent
            ? 'border-transparent bg-transparent text-paper'
            : 'border-stone-line/60 bg-paper/95 text-ink backdrop-blur-md',
          scrolled && !transparent ? 'border-stone-line shadow-card' : '',
        )}
      >
        {/*
          A wash behind the header while it is transparent. The hero is dark by
          construction, but a photograph can be light exactly where the nav sits,
          and a nav that is readable on most pictures is not good enough.
        */}
        {transparent ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-ink/55 to-transparent"
          />
        ) : null}

        <AnnouncementBar />
        {/*
          ---- Errands, and where to find the studio elsewhere ----

          Always rendered, never gated on whether there is anything in it.
          Its links come from settings, which arrive after the first paint, so
          a guard here meant the header grew by this row a moment after every
          page load and pushed the whole page down with it. It always carries
          Track an order in any case.
        */}
        <div className={clsx('hidden border-b lg:block', transparent ? 'border-paper/20' : 'border-stone-line/60')}>
          <div className="container-site flex h-9 items-center justify-between">
            <nav className="flex items-center gap-6" aria-label="Secondary">
              {utilityLinks.map((link) => (
                <Link
                  key={link.id}
                  to={link.href}
                  className={clsx(
                    'text-2xs uppercase tracking-architect transition-colors',
                    transparent ? 'text-paper/70 hover:text-paper' : 'text-ink-400 hover:text-ink',
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                to="/track-order"
                className={clsx(
                  'text-2xs uppercase tracking-architect transition-colors',
                  transparent ? 'text-paper/70 hover:text-paper' : 'text-ink-400 hover:text-ink',
                )}
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
                  className={clsx(
                    'text-2xs uppercase tracking-architect transition-colors',
                    transparent ? 'text-paper/70 hover:text-paper' : 'text-ink-400 hover:text-ink',
                  )}
                >
                  {social.label}
                </a>
              ))}
            </div>
          </div>
        </div>

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
                className={clsx('-ml-2 p-2 lg:hidden', transparent ? 'text-paper' : 'text-ink')}
                aria-label="Open menu"
              >
                <MenuIcon size={21} />
              </button>

              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className={clsx('hidden p-2.5 transition-colors lg:block', transparent ? 'text-paper/80 hover:text-paper' : 'text-ink-600 hover:text-ink')}
                aria-label="Search"
              >
                <SearchIcon size={19} />
              </button>
            </div>

            <Link to="/" className="justify-self-center" aria-label="Beyond Walls — home">
              {/*
                Not the same mark in white: the two plates swap colours so it
                still reads as a plate rather than a silhouette.
              */}
              <Logo inverted={transparent} />
            </Link>

            {/* ---- Tools ---- */}
            <div className="flex items-center justify-end gap-0.5 sm:gap-1">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className={clsx('p-2.5 transition-colors lg:hidden', transparent ? 'text-paper/80 hover:text-paper' : 'text-ink-600 hover:text-ink')}
                aria-label="Search"
              >
                <SearchIcon size={19} />
              </button>

              <Link
                to={isAuthenticated ? '/account/wishlist' : '/login'}
                className={clsx('relative hidden p-2.5 transition-colors sm:block', transparent ? 'text-paper/80 hover:text-paper' : 'text-ink-600 hover:text-ink')}
                aria-label={`Wishlist${wishlistCount ? ` — ${wishlistCount} saved` : ''}`}
              >
                <HeartIcon size={19} />
                {wishlistCount > 0 ? <Dot>{wishlistCount}</Dot> : null}
              </Link>

              <Link
                to={isAuthenticated ? '/account' : '/login'}
                className={clsx('p-2.5 transition-colors', transparent ? 'text-paper/80 hover:text-paper' : 'text-ink-600 hover:text-ink')}
                aria-label={isAuthenticated ? `Account — ${user?.name}` : 'Sign in'}
              >
                <UserIcon size={19} />
              </Link>

              <button
                type="button"
                onClick={openDrawer}
                className={clsx('relative p-2.5 transition-colors', transparent ? 'text-paper/80 hover:text-paper' : 'text-ink-600 hover:text-ink')}
                aria-label={`Cart — ${itemCount} item${itemCount === 1 ? '' : 's'}`}
              >
                <CartIcon size={19} />
                {itemCount > 0 ? <Dot>{itemCount}</Dot> : null}
              </button>
            </div>
          </div>
        </div>

        {/* ---- Shopping, on its own line under the logo ---- */}
        <div className={clsx('hidden border-t lg:block', transparent ? 'border-paper/20' : 'border-stone-line/60')}>
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
                transparent
                  ? 'text-paper/80 hover:text-paper'
                  : menuOpen ? 'text-ink' : 'text-ink-600 hover:text-ink',
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
                    transparent
                      ? isActive ? 'text-paper' : 'text-paper/80 hover:text-paper'
                      : isActive ? 'text-ink' : 'text-ink-600 hover:text-ink',
                  )
                }
              >
                {link.label}
              </RouterNavLink>
            ))}

            {/* Custom Order is the one highlighted destination. */}
            <Link
              to="/custom-order"
              className={clsx(
                'my-2 border px-4 py-1.5 text-xs font-medium uppercase tracking-[0.12em] transition-colors duration-200',
                transparent
                  ? 'border-paper text-paper hover:bg-paper hover:text-ink'
                  : 'border-ink text-ink hover:bg-ink hover:text-paper',
              )}
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
