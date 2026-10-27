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
    <footer className="border-t border-stone-line bg-paper">
      {/*
        ---- The band across the top ----

        The studio's line, and the one action worth offering to somebody who
        has read to the bottom of a page without buying.

        It used to float: the footer was pushed down by a 96px margin, so on
        the home page a pale stripe sat between the questions block and the
        footer and belonged to neither. Inside, the line and the button were
        thrown to opposite ends of a flex row, which at 1440px left 352px of
        nothing between them -- a quarter of the screen. Together that read as
        a section that had come loose, which is exactly what the studio said
        about it.

        Both are fixed by alignment rather than by decoration. The margin is
        gone, so the border alone divides the page from the footer. The band
        now uses the same twelve columns as the links below it, and the button
        sits in columns 10-12 -- directly above "Visit the studio", the same
        width, the same edges. The gap in the middle is still there, but it is
        now a column gap that lines up with everything under it, which reads as
        a grid instead of as a mistake.
      */}
      <div className="border-b border-stone-line">
        <div className="container-site grid gap-x-8 gap-y-8 py-10 lg:grid-cols-12 lg:py-12">
          <div className="lg:col-span-6">
            <Logo />
            {about ? (
              <p className="mt-5 max-w-xl text-lg leading-snug text-ink sm:text-xl">{about}</p>
            ) : null}
          </div>

          <Link
            to="/custom-order"
            className="group/cta flex items-center justify-between gap-6 border border-ink px-6 py-4 transition-colors duration-300 hover:bg-ink lg:col-span-3 lg:col-start-10 lg:self-end"
          >
            <span className="text-left">
              <span className="block text-2xs uppercase tracking-architect text-ink-400 transition-colors duration-300 group-hover/cta:text-paper/60">
                Something of your own
              </span>
              <span className="mt-1 block text-sm font-medium text-ink transition-colors duration-300 group-hover/cta:text-paper">
                Start a custom order
              </span>
            </span>
            <span
              aria-hidden="true"
              className="text-ink transition-all duration-300 group-hover/cta:translate-x-1 group-hover/cta:text-paper"
            >
              →
            </span>
          </Link>
        </div>
      </div>

      <div className="container-site py-12 lg:py-14">
        <div className="grid gap-x-8 gap-y-2 md:grid-cols-2 md:gap-y-10 lg:grid-cols-12">
          {/*
            The number and the email, on a phone, without a tap.

            Below this width the columns fold, which puts the studio's number
            behind "Visit the studio" — and a number somebody has to go looking
            for is the one thing a footer should never hide from somebody
            holding a telephone. Shown here and only here: on a laptop the
            column at the end of the row already has them open.
          */}
          {phone || email ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-7 md:col-span-2 lg:hidden">
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

          {/*
            Collections, which the footer never carried. The foot of a page is
            where somebody lands after reading to the end of it, and the useful
            thing to offer there is the way back into the shop.
          */}
          {collections.length ? (
            <FooterColumn title="Shop" className="lg:col-span-3">
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
            <FooterColumn title="Studio" className="lg:col-span-3">
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

          <FooterColumn title="Information" className="lg:col-span-3">
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

      {/*
        The bottom bar carries the social links now.

        They used to sit under the brand paragraph, where nothing else was, so
        on a site that has not filled them in yet — this one — the column was a
        logo, a sentence and a hole. Down here their absence costs nothing: the
        bar simply has the copyright at one end and the payment line at the
        other, which is what it had anyway.
      */}
      <div className="border-t border-stone-line">
        <div className="container-site flex flex-col items-center gap-4 py-5 sm:flex-row sm:justify-between">
          <p className="order-3 text-2xs text-ink-400 sm:order-1">{copyright}</p>

          {socials.length ? (
            <div className="order-1 flex flex-wrap items-center justify-center gap-5 sm:order-2">
              {socials.map((social) => (
                <a
                  key={social.key}
                  href={social.url as string}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-2xs uppercase tracking-architect text-ink-400 transition-colors hover:text-ink"
                >
                  {social.label}
                </a>
              ))}
            </div>
          ) : null}

          {/* Only names payment methods that are actually live. */}
          {methodsLine ? (
            <p className="order-2 text-2xs text-ink-300 sm:order-3">{methodsLine}</p>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
