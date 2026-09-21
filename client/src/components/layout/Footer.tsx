import { Link } from 'react-router-dom';
import { useSettings } from '../../context/StoreProvider';
import { usePaymentConfig } from '../../hooks/usePaymentConfig';
import { summariseHours } from '../../lib/format';
import type { BusinessHour } from '../../lib/types';
import { Logo } from './Header';
import { ClockIcon, MailIcon, PhoneIcon, PinIcon } from '../ui';

const SOCIALS = [
  { key: 'social.instagram', label: 'Instagram' },
  { key: 'social.facebook', label: 'Facebook' },
  { key: 'social.linkedin', label: 'LinkedIn' },
  { key: 'social.youtube', label: 'YouTube' },
  { key: 'social.pinterest', label: 'Pinterest' },
];

export function Footer() {
  const { get, navLinks, footerPages } = useSettings();
  const { methodsLine } = usePaymentConfig();

  const phone = get<string>('contact.phone', '');
  const email = get<string>('contact.email', '');
  const addressLines = get<string[]>('contact.addressLines', []);
  const hours = get<BusinessHour[]>('hours.schedule', []);
  const hoursSummary = summariseHours(hours);
  const about = get<string>('footer.about', '');
  const copyright = get<string>('footer.copyright', '© {year} Beyond Walls.').replace(
    '{year}',
    String(new Date().getFullYear()),
  );

  const footerLinks = navLinks
    .filter((l) => l.group === 'footer')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const socials = SOCIALS.map((s) => ({ ...s, url: get<string | null>(s.key, null) })).filter(
    (s) => Boolean(s.url),
  );

  return (
    <footer className="mt-24 border-t border-stone-line bg-paper">
      <div className="container-site py-14 lg:py-18">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-12 lg:gap-8">
          {/* Brand */}
          <div className="lg:col-span-4">
            <Logo />
            {about ? (
              <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-500">{about}</p>
            ) : null}

            {socials.length ? (
              <div className="mt-6 flex flex-wrap gap-4">
                {socials.map((social) => (
                  <a
                    key={social.key}
                    href={social.url as string}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="link-underline text-2xs uppercase tracking-architect text-ink-500"
                  >
                    {social.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          {/* Links */}
          <nav className="lg:col-span-2" aria-label="Footer">
            <h3 className="eyebrow mb-4">Shop</h3>
            <ul className="space-y-2.5">
              {footerLinks.map((link) => (
                <li key={link.id}>
                  <Link to={link.href} className="text-sm text-ink-500 transition-colors hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Policies */}
          <nav className="lg:col-span-2" aria-label="Information">
            <h3 className="eyebrow mb-4">Information</h3>
            <ul className="space-y-2.5">
              {footerPages.map((page) => (
                <li key={page.slug}>
                  <Link to={`/${page.slug}`} className="text-sm text-ink-500 transition-colors hover:text-ink">
                    {page.title}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/track-order" className="text-sm text-ink-500 transition-colors hover:text-ink">
                  Track an order
                </Link>
              </li>
            </ul>
          </nav>

          {/* Visit */}
          <div className="lg:col-span-4">
            <h3 className="eyebrow mb-4">Visit the studio</h3>
            <address className="space-y-3 not-italic">
              {addressLines.length ? (
                <div className="flex gap-2.5 text-sm text-ink-500">
                  <PinIcon size={15} className="mt-0.5 shrink-0 text-ink-300" />
                  <span className="leading-relaxed">
                    {addressLines.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </span>
                </div>
              ) : null}

              {phone ? (
                <div className="flex items-center gap-2.5 text-sm">
                  <PhoneIcon size={15} className="shrink-0 text-ink-300" />
                  <a href={`tel:${phone.replace(/\s/g, '')}`} className="link-underline text-ink-500">
                    {phone}
                  </a>
                </div>
              ) : null}

              {email ? (
                <div className="flex items-center gap-2.5 text-sm">
                  <MailIcon size={15} className="shrink-0 text-ink-300" />
                  <a href={`mailto:${email}`} className="link-underline text-ink-500">
                    {email}
                  </a>
                </div>
              ) : null}

              {hoursSummary.length ? (
                <div className="flex gap-2.5 text-sm text-ink-500">
                  <ClockIcon size={15} className="mt-0.5 shrink-0 text-ink-300" />
                  <span>
                    {hoursSummary.map((row) => (
                      <span key={row.days} className="block leading-relaxed">
                        {row.days} · {row.hours}
                      </span>
                    ))}
                  </span>
                </div>
              ) : null}
            </address>
          </div>
        </div>
      </div>

      <div className="border-t border-stone-line">
        <div className="container-site flex flex-col items-center justify-between gap-3 py-5 sm:flex-row">
          <p className="text-2xs text-ink-400">{copyright}</p>
          {/* Only names payment methods that are actually live. */}
          {methodsLine ? <p className="text-2xs text-ink-300">{methodsLine}</p> : null}
        </div>
      </div>
    </footer>
  );
}
