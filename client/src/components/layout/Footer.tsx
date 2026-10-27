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
 * Open on a laptop, where the columns sit side by side and cost nothing. On a
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
    <div className={clsx('border-b border-white/10 pb-4 md:border-0 md:pb-0', className)}>
      <h3 className="eyebrow mb-0 text-paper/40 md:mb-5">
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
              'text-paper/40 transition-transform duration-300 md:hidden',
              open && 'rotate-180',
            )}
          />
        </button>
      </h3>
      <div className={clsx('pb-1 md:block', open ? 'block' : 'hidden')}>{children}</div>
    </div>
  );
}

const linkClass = 'text-sm text-paper/60 transition-colors duration-200 hover:text-paper';

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

  /*
   * ---- Why the footer is dark ----
   *
   * It was the same off-white as the page above it, so it read as more page
   * rather than the end of one, and the studio said twice that it looked out
   * of place. Two attempts at rearranging the light version did not fix that,
   * because the problem was not the arrangement.
   *
   * Ink closes the page. It is also the colour the site already uses for its
   * most deliberate moments — the hero, the header once you scroll, the plate
   * itself — so the foot of the page now belongs to the same design rather
   * than trailing off into white. The mark has a dark-background version in
   * the brand book, which is what `inverted` draws.
   */
  return (
    <footer className="bg-ink text-paper">
      {/*
        ---- The custom-order strip ----

        This used to be a bordered box floating at the right-hand end of a
        flex row, with a quarter of the screen empty beside it. Given the full
        width it stops being a box that has to be placed and becomes the first
        thing the footer says — which is right, because somebody who has read
        to the bottom of a page without buying is exactly who should be asked
        whether they want something made.
      */}
      <Link
        to="/custom-order"
        className="group/cta block border-b border-white/10 transition-colors duration-300 hover:bg-white/[0.04]"
      >
        <div className="container-site flex items-center justify-between gap-6 py-9 lg:py-11">
          <span>
            <span className="eyebrow block text-paper/40">Something of your own</span>
            <span className="mt-2 block text-2xl font-medium leading-tight text-paper sm:text-3xl">
              Start a custom order
            </span>
          </span>
          <span
            aria-hidden="true"
            className="shrink-0 text-2xl text-paper/70 transition-all duration-300 group-hover/cta:translate-x-1 group-hover/cta:text-paper sm:text-3xl"
          >
            →
          </span>
        </div>
      </Link>

      {/*
        ---- One row, five columns ----

        3 + 2 + 2 + 2 + 3. The studio's line sits in the first column instead
        of in a band of its own above everything, so there is no longer a
        stretch of empty footer anywhere: every column has something in it and
        they all start on the same line. The social links live under the
        statement rather than in the bottom bar, which gives that column a
        second thing to hold once the studio fills them in.
      */}
      <div className="container-site py-12 lg:py-16">
        <div className="grid gap-x-8 gap-y-2 md:grid-cols-2 md:gap-y-12 lg:grid-cols-12">
          <div className="pb-8 md:col-span-2 md:pb-0 lg:col-span-3">
            <Logo inverted />
            {about ? (
              <p className="mt-5 max-w-sm text-sm leading-relaxed text-paper/60">{about}</p>
            ) : null}

            {socials.length ? (
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                {socials.map((social) => (
                  <a
                    key={social.key}
                    href={social.url as string}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-2xs uppercase tracking-architect text-paper/50 transition-colors hover:text-paper"
                  >
                    {social.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>

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
                  className="inline-flex items-center gap-2 text-sm text-paper/80"
                >
                  <PhoneIcon size={15} className="shrink-0 text-paper/40" />
                  {phone}
                </a>
              ) : null}
              {email ? (
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-2 text-sm text-paper/80"
                >
                  <MailIcon size={15} className="shrink-0 text-paper/40" />
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
            <FooterColumn title="Shop" className="lg:col-span-2">
              <ul className="space-y-2.5">
                {collections.map((category) => (
                  <li key={category.id}>
                    <Link to={`/shop/${category.slug}`} className={linkClass}>
                      {category.name}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link to="/shop" className={linkClass}>
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
                    <Link to={link.href} className={linkClass}>
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
                  <Link to={`/${page.slug}`} className={linkClass}>
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
                  <Link to="/track-order" className={linkClass}>
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
                <div className="flex gap-2.5 text-sm text-paper/60">
                  <PinIcon size={15} className="mt-0.5 shrink-0 text-paper/40" />
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
                  <PhoneIcon size={15} className="shrink-0 text-paper/40" />
                  <a href={`tel:${phone.replace(/\s/g, '')}`} className="link-underline text-paper/60">
                    {phone}
                  </a>
                </div>
              ) : null}

              {email ? (
                <div className="flex items-center gap-2.5 text-sm">
                  <MailIcon size={15} className="shrink-0 text-paper/40" />
                  <a href={`mailto:${email}`} className="link-underline text-paper/60">
                    {email}
                  </a>
                </div>
              ) : null}

              {hoursSummary.length ? (
                <div className="flex gap-2.5 text-sm text-paper/60">
                  <ClockIcon size={15} className="mt-0.5 shrink-0 text-paper/40" />
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
        A shade darker than the footer above it, so the last line of the site
        settles rather than stopping dead.
      */}
      <div className="border-t border-white/10 bg-ink-900">
        <div className="container-site flex flex-col items-center gap-3 py-5 sm:flex-row sm:justify-between">
          <p className="text-2xs text-paper/40">{copyright}</p>
          {/* Only names payment methods that are actually live. */}
          {methodsLine ? <p className="text-2xs text-paper/40">{methodsLine}</p> : null}
        </div>
      </div>
    </footer>
  );
}
