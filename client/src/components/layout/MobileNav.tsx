import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import type { CatalogFilters, Category, NavLink } from '../../lib/types';
import { useAuth } from '../../context/StoreProvider';
import { ChevronDown, CloseIcon } from '../ui';
import { Logo } from './Logo';

/** Clean accordion drawer — collections expand in place, nothing nested deeper. */
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

  if (!open) return null;

  const toggle = (id: string) => setSection(section === id ? null : id);

  const extraLinks = navLinks.filter(
    (l) => l.group === 'header' && l.href !== '/shop' && l.href !== '/custom-order',
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

        <nav className="flex-1 overflow-y-auto" aria-label="Mobile">
          {/* Collections */}
          <Accordion
            id="collections"
            label="Shop"
            to="/shop"
            onNavigate={onClose}
            open={section === 'collections'}
            onToggle={() => toggle('collections')}
          >
            <ul>
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    to={`/shop/${category.slug}`}
                    onClick={onClose}
                    className="flex items-center justify-between py-2.5 text-sm text-ink-600"
                  >
                    {category.name}
                    {category._count?.products ? (
                      <span className="text-2xs text-ink-300">{category._count.products}</span>
                    ) : null}
                  </Link>

                  {/* Subcategories sit inline, indented — no second accordion level. */}
                  {category.children?.length ? (
                    <ul className="mb-1 border-l border-stone-line pl-3">
                      {category.children.map((child) => (
                        <li key={child.id}>
                          <Link
                            to={`/shop/${child.slug}`}
                            onClick={onClose}
                            className="block py-2 text-xs text-ink-400"
                          >
                            {child.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </Accordion>

          {/* Shop by attribute */}
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

          {/* Flat links */}
          <ul className="border-t border-stone-line">
            <li>
              <Link
                to="/custom-order"
                onClick={onClose}
                className="flex items-center justify-between border-b border-stone-line bg-ink px-5 py-4 text-sm font-medium text-paper"
              >
                Custom Order
                <span aria-hidden="true">→</span>
              </Link>
            </li>
            {extraLinks.map((link) => (
              <li key={link.id}>
                <Link
                  to={link.href}
                  onClick={onClose}
                  className="block border-b border-stone-line px-5 py-3.5 text-sm text-ink-700"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
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

/**
 * A drawer section.
 *
 * When `to` is given the header splits: the label navigates and only the
 * chevron expands. On a phone the commonest intent is "just show me the shop",
 * and that should not cost two taps and a scroll past every category.
 */
function Accordion({
  id, label, open, onToggle, children, to, onNavigate,
}: {
  id: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  to?: string;
  onNavigate?: () => void;
}) {
  const chevron = (
    <ChevronDown
      size={15}
      className={clsx('text-ink-400 transition-transform duration-300', open && 'rotate-180')}
    />
  );

  return (
    <div className="border-b border-stone-line">
      {to ? (
        <div className="flex items-stretch">
          <Link
            to={to}
            onClick={onNavigate}
            className="flex-1 px-5 py-4 text-left text-sm font-medium text-ink"
          >
            {label}
          </Link>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={`section-${id}`}
            aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
            className="px-5 py-4"
          >
            {chevron}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`section-${id}`}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <span className="text-sm font-medium text-ink">{label}</span>
          {chevron}
        </button>
      )}
      {open ? (
        <div id={`section-${id}`} className="px-5 pb-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}
