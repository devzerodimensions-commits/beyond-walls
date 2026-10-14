import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { assetUrl } from '../../lib/api';
import type { CatalogFilters, Category, NavLink } from '../../lib/types';
import { useAuth } from '../../context/StoreProvider';
import { ChevronDown, CloseIcon } from '../ui';
import { Logo } from './Logo';

/**
 * The drawer behind the phone header.
 *
 * Two tabs, because the drawer carries two unrelated things. Shopping is
 * browsing — you arrive without knowing what you want and move by sight. The
 * pages are errands: track an order, read the returns policy, find the phone
 * number. Stacked in one scroll the errands sit under every category and
 * filter group, which is a long way to go to find "Contact".
 *
 * The collections are pictures here for the same reason they are on the
 * desktop menu: a range is recognised by sight before its name is read.
 */
export function MobileNav({
  open, onClose, categories, filters, navLinks,
}: {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  filters: CatalogFilters | undefined;
  navLinks: NavLink[];
}) {
  const { isAuthenticated, logout } = useAuth();
  const [tab, setTab] = useState<'shop' | 'pages'>('shop');
  const [section, setSection] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Opening the drawer again should start where it starts, not wherever it was
  // left three pages ago.
  useEffect(() => {
    if (open) {
      setTab('shop');
      setSection(null);
    }
  }, [open]);

  if (!open) return null;

  const toggle = (id: string) => setSection(section === id ? null : id);

  /*
   * Pages means pages.
   *
   * The header nav mixes the two: alongside About and Contact it carries For
   * Home, For Offices and Signs, which are collections wearing a nav link.
   * Listing those here would put the same three collections in both tabs and
   * undo the split — so anything pointing into the shop belongs to the shop
   * tab, which shows every collection anyway, and Custom Order has its own
   * call to action at the foot of it.
   */
  const pageLinks = navLinks.filter(
    (l) => l.group === 'header' && !l.href.startsWith('/shop') && l.href !== '/custom-order',
  );

  return (
    <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-ink/45 backdrop-blur-[2px]"
      />

      <div className="absolute left-0 top-0 flex h-full w-[88%] max-w-sm flex-col bg-paper shadow-panel">
        <div className="flex items-center justify-between border-b border-stone-line px-5 py-4">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            className="-mr-1.5 p-2 text-ink-500 transition-colors hover:text-ink"
            aria-label="Close menu"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* ---- Shop / Pages ---- */}
        <div className="grid grid-cols-2 border-b border-stone-line" role="tablist" aria-label="Menu">
          {(['shop', 'pages'] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              aria-controls={`mobile-${key}`}
              onClick={() => setTab(key)}
              className={clsx(
                'relative px-5 py-3.5 text-2xs uppercase tracking-architect transition-colors duration-200',
                tab === key ? 'text-ink' : 'text-ink-400',
              )}
            >
              {key === 'shop' ? 'Shop' : 'Pages'}
              {/* Drawn rather than a border, so switching tabs does not nudge
                  the panel below by a pixel. */}
              <span
                aria-hidden="true"
                className={clsx(
                  'absolute inset-x-0 bottom-0 h-px transition-colors duration-200',
                  tab === key ? 'bg-ink' : 'bg-transparent',
                )}
              />
            </button>
          ))}
        </div>

        <nav className="flex-1 overflow-y-auto" aria-label="Mobile">
          {tab === 'shop' ? (
            <div id="mobile-shop" role="tabpanel">
              {/* ---- The collections, as pictures ---- */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-4 px-5 py-5">
                {categories.map((category) => (
                  <Link
                    key={category.id}
                    to={`/shop/${category.slug}`}
                    onClick={onClose}
                    className="group/tile block"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-paper-warm">
                      {category.image ? (
                        <img
                          src={assetUrl(category.image)}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center px-2 text-center text-2xs leading-tight text-ink-400">
                          {category.name}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs font-medium leading-snug text-ink">
                      {category.name}
                    </p>
                    {category.children?.length ? (
                      <p className="mt-0.5 text-2xs leading-snug text-ink-400">
                        {category.children
                          .slice(0, 3)
                          .map((c) => c.name)
                          .join(' · ')}
                      </p>
                    ) : category._count?.products ? (
                      <p className="mt-0.5 text-2xs text-ink-300">
                        {category._count.products}{' '}
                        {category._count.products === 1 ? 'design' : 'designs'}
                      </p>
                    ) : null}
                  </Link>
                ))}
              </div>

              <div className="border-t border-stone-line">
                <Link
                  to="/shop"
                  onClick={onClose}
                  className="flex items-center justify-between border-b border-stone-line px-5 py-3.5 text-sm text-ink-700"
                >
                  View everything
                  <span aria-hidden="true">→</span>
                </Link>
              </div>

              {/* ---- Narrow it down ---- */}
              {(filters?.attributes ?? []).slice(0, 4).map((group) => (
                <Accordion
                  key={group.id}
                  id={group.id}
                  label={`Shop by ${group.name.toLowerCase()}`}
                  open={section === group.id}
                  onToggle={() => toggle(group.id)}
                >
                  <ul className="grid grid-cols-2 gap-x-4">
                    {group.values.map((value) => (
                      <li key={value.id}>
                        <Link
                          to={`/shop?attr=${value.slug}`}
                          onClick={onClose}
                          className="flex items-center gap-2 py-2 text-sm text-ink-600"
                        >
                          {value.hexColor ? (
                            <span
                              className="h-2.5 w-2.5 shrink-0 border border-ink-100"
                              style={{ background: value.hexColor }}
                            />
                          ) : null}
                          {value.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Accordion>
              ))}

              <Link
                to="/custom-order"
                onClick={onClose}
                className="flex items-center justify-between bg-ink px-5 py-4 text-sm font-medium text-paper"
              >
                Custom Order
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          ) : (
            <ul id="mobile-pages" role="tabpanel">
              {pageLinks.map((link) => (
                <li key={link.id}>
                  <Link
                    to={link.href}
                    onClick={onClose}
                    className="flex items-center justify-between border-b border-stone-line px-5 py-4 text-sm text-ink-700"
                  >
                    {link.label}
                    <span aria-hidden="true" className="text-ink-300">→</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  to="/custom-order"
                  onClick={onClose}
                  className="flex items-center justify-between border-b border-stone-line px-5 py-4 text-sm text-ink-700"
                >
                  Custom Order
                  <span aria-hidden="true" className="text-ink-300">→</span>
                </Link>
              </li>
            </ul>
          )}
        </nav>

        <div className="border-t border-stone-line px-5 py-4">
          {isAuthenticated ? (
            <div className="flex items-center justify-between">
              <Link to="/account" onClick={onClose} className="text-xs uppercase tracking-architect">
                My account
              </Link>
              <button
                type="button"
                onClick={() => {
                  void logout();
                  onClose();
                }}
                className="text-xs uppercase tracking-architect text-ink-400"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Link to="/login" onClick={onClose} className="text-xs uppercase tracking-architect">
                Sign in
              </Link>
              <span className="text-ink-200">/</span>
              <Link to="/register" onClick={onClose} className="text-xs uppercase tracking-architect">
                Create account
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A collapsible group inside the shop tab. */
function Accordion({
  id, label, open, onToggle, children,
}: {
  id: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-stone-line">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`section-${id}`}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-sm font-medium text-ink">{label}</span>
        <ChevronDown
          size={15}
          className={clsx('text-ink-400 transition-transform duration-300', open && 'rotate-180')}
        />
      </button>
      {open ? (
        <div id={`section-${id}`} className="px-5 pb-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}
