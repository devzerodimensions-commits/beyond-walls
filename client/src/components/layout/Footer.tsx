import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { useSettings } from '../../context/StoreProvider';
import { usePaymentConfig } from '../../hooks/usePaymentConfig';
import { summariseHours } from '../../lib/format';
import type { BusinessHour, Category } from '../../lib/types';
import { Logo } from './Header';
import { ChevronDown, ClockIcon, MailIcon, PhoneIcon, PinIcon } from '../ui';

const SOCIALS = [
  { key: 'social.instagram', label: 'Instagram' },
  { key: 'social.facebook', label: 'Facebook' },
  { key: 'social.linkedin', label: 'LinkedIn' },
  { key: 'social.youtube', label: 'YouTube' },
  { key: 'social.pinterest', label: 'Pinterest' },
];

/**
 * A column of links.
 *
 * Open on a laptop, where four columns sit side by side and cost nothing. On a
 * phone they stack, and four open columns put the address and the opening
 * hours a long scroll below the fold — so there each heading collapses and the
 * whole footer is a screen you can read.
 *
 * The heading is a button only at that width: a control that does nothing when
 * pressed is worse than plain text, so on a laptop it is plain text.
 */
function FooterColumn({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={clsx('border-b border-stone-line pb-4 md:border-0 md:pb-0', className)}>
      <h3 className="eyebrow mb-0 md:mb-4">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex w-full items-center justify-between py-3 text-left md:pointer-events-none md:py-0"
        >
          {title}
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={clsx(
              'text-ink-300 transition-transform duration-300 md:hidden',
              open && 'rotate-180',
            )}
          />
        </button>
      </h3>
      <div className={clsx('pb-1 md:block', open ? 'block' : 'hidden')}>{children}</div>
    </div>
  );
}

export function Footer() {
  const { get, navLinks, footerPages } = useSettings();
  const { methodsLine } = usePaymentConfig();

  // The same query the header runs, so this is served from cache rather than
  // costing the foot of every page a second request.
  const { data: categories } = useQuery({
    queryKey: ['nav-categories'],
    queryFn: () => api.get<Category[]>('/catalog/categories'),
    staleTime: 10 * 60_000,
  });

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

  /*
   * The two lists overlap.
   *
   * "Studio" comes from the nav links an admin arranges; "Information" from
   * the published content pages. Contact exists in both, so the footer listed
   * it twice, one column apart — which reads as a mistake and makes a reader
   * wonder whether the two go to different places.
   *
   * The nav links win, because somebody chose their order deliberately. A page
   * already linked from there is dropped from this column rather than the
   * other way round.
   */
  const linkedHrefs = new Set(footerLinks.map((l) => l.href));
  const informationPages = footerPages.filter((p) => !linkedHrefs.has(`/${p.slug}`));

  const collections = (categories ?? [])
    .filter((c) => c.status === 'PUBLISHED')
    .slice(0, 6);

  const socials = SOCIALS.map((s) => ({ ...s, url: get<string | null>(s.key, null) })).filter(
    (s) => Boolean(s.url),
  );

  return (
    <footer className="mt-24 border-t border-stone-line bg-paper">
      <div className="container-site py-12 lg:py-18">
        <div className="grid gap-x-8 gap-y-2 md:grid-cols-2 md:gap-y-10 lg:grid-cols-12">
          {/* Brand */}
          <div className="pb-8 md:pb-0 lg:col-span-3">
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

            {/*
              The phone number and the address, on a phone, without a tap.

              Below this width the columns fold, which puts the studio's number
              behind "Visit the studio" — and a number somebody has to go
              looking for is the one thing a footer should never hide from
              somebody holding a telephone. Shown here, and only here: on a
              laptop the column beside this one already has them open.
            */}
            {phone || email ? (
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 lg:hidden">
                {phone ? (
                  <a
                    href={`tel:${phone.replace(/\s/g, '')}`}
                    className="inline-flex items-center gap-2 text-sm text-ink"
                  >
                    <PhoneIcon size={15} className="shrink-0 text-ink-300" />
                    {phone}
                  </a>
                ) : null}
                {email ? (
                  <a
                    href={`mailto:${email}`}
                    className="inline-flex items-center gap-2 text-sm text-ink"
                  >
                    <MailIcon size={15} className="shrink-0 text-ink-300" />
                    {email}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>

          {/*
            Collections, which the footer never carried. The foot of a page is
            where somebody lands after reading to the end of it, and the useful
            thing to offer there is the way back into the shop.
          */}
          {collections.length ? (
            <FooterColumn title="Shop" className="lg:col-span-2">
              <ul className="space-y-2.5">
                {collections.map((category) => (
                  <li key={category.id}>
                    <Link
                      to={`/shop/${category.slug}`}
                      className="text-sm text-ink-500 transition-colors hover:text-ink"
                    >
                      {category.name}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link to="/shop" className="text-sm text-ink-500 transition-colors hover:text-ink">
                    View everything
                  </Link>
                </li>
              </ul>
            </FooterColumn>
          ) : null}

          {footerLinks.length ? (
            <FooterColumn title="Studio" className="lg:col-span-2">
              <ul className="space-y-2.5">
                {footerLinks.map((link) => (
                  <li key={link.id}>
                    <Link
                      to={link.href}
                      className="text-sm text-ink-500 transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </FooterColumn>
          ) : null}

          <FooterColumn title="Information" className="lg:col-span-2">
            <ul className="space-y-2.5">
              {informationPages.map((page) => (
                <li key={page.slug}>
                  <Link
                    to={`/${page.slug}`}
                    className="text-sm text-ink-500 transition-colors hover:text-ink"
                  >
                    {page.title}
                  </Link>
                </li>
              ))}
              {/*
                Only when the admin's own footer links do not already carry it.
                They usually do, and it was listed in both columns -- the test
                found it twice before anyone else did.
              */}
              {footerLinks.some((l) => l.href === '/track-order') ? null : (
                <li>
                  <Link
                    to="/track-order"
                    className="text-sm text-ink-500 transition-colors hover:text-ink"
                  >
                    Track an order
                  </Link>
                </li>
              )}
            </ul>
          </FooterColumn>

          {/* Visit */}
          <FooterColumn title="Visit the studio" className="lg:col-span-3">
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
          </FooterColumn>
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
