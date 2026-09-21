import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { Seo } from '../../lib/seo';
import { useAuth, useSettings } from '../../context/StoreProvider';
import { Button } from '../../components/ui';

const LINKS = [
  { to: '/account', label: 'Overview', end: true },
  { to: '/account/orders', label: 'Orders' },
  { to: '/account/wishlist', label: 'Wishlist' },
  { to: '/account/addresses', label: 'Addresses' },
  { to: '/account/profile', label: 'Profile' },
];

export default function AccountLayout() {
  const { user, logout, isAdmin } = useAuth();
  const { settings } = useSettings();

  return (
    <>
      <Seo settings={settings} title="My account" noindex />

      <section className="border-b border-stone-line bg-paper">
        <div className="container-site py-10 lg:py-12">
          <p className="eyebrow mb-3">My account</p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h1 className="text-3xl">{user?.name}</h1>
            <div className="flex gap-3">
              {isAdmin ? (
                <NavLink
                  to="/admin"
                  className="border border-ink px-5 py-2.5 text-2xs uppercase tracking-architect transition-colors hover:bg-ink hover:text-paper"
                >
                  Admin panel
                </NavLink>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => void logout()}>
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="container-site py-10 lg:py-14">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
          <aside className="lg:col-span-3">
            <nav className="no-scrollbar -mx-5 flex gap-1 overflow-x-auto px-5 lg:mx-0 lg:flex-col lg:px-0">
              {LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    clsx(
                      'whitespace-nowrap border-b-2 px-4 py-3 text-xs uppercase tracking-architect transition-colors lg:border-b-0 lg:border-l-2 lg:px-4',
                      isActive
                        ? 'border-ink text-ink'
                        : 'border-transparent text-ink-400 hover:text-ink',
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </aside>

          <div className="lg:col-span-9">
            <Outlet />
          </div>
        </div>
      </div>
    </>
  );
}
