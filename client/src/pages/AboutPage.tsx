import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, assetUrl } from '../lib/api';
import type { Page } from '../lib/types';
import { useSettings } from '../context/StoreProvider';
import { Seo } from '../lib/seo';
import { ArrowRight } from '../components/ui';

/**
 * About, built rather than assembled.
 *
 * Every other content page is composed from the shared section blocks, which
 * is right for a shipping policy and wrong here: this page has to carry the
 * brand, and the blocks are general by design. So it is laid out directly —
 * an asymmetric hero, a timeline, a stats band, the process, the work and the
 * people — while the header, the footer, the container, the type scale, the
 * colours and the buttons all stay exactly as the rest of the site uses them.
 *
 * Its SEO still comes from the CMS page row, so title and description remain
 * editable in the admin. The old section rows are left in the database
 * untouched: nothing is lost, and pointing the route back at StaticPage would
 * restore the previous page as it was.
 *
 * ON THE PHOTOGRAPHS
 * Every image here is the studio's own. Four were found unused in the client's
 * handover folder, still in HEIC straight off a phone, and they are the only
 * photographs that show anybody working: the Rasik Vatika fit-out with the
 * ladder and the team, and the Jasco Energy sign going up and then finished.
 * They are why this page can have a people section and an installation image
 * at all. Nothing here is stock and nothing is generated.
 */

/*
 * Selected work, chosen rather than read from the gallery.
 *
 * An earlier version of this page handed the section over to the gallery as
 * soon as the gallery held four categorised images. It now does, and the four
 * are catalogue cut-outs — a plate on a white background, which is the right
 * photograph for a shop listing and the wrong one here, where the question is
 * what a finished piece looks like in somebody's building. So the hand-over is
 * gone and these four are named outright.
 */
const WORK = [
  {
    src: '/uploads/photos/bw-photo-11.webp',
    label: 'Residential',
    name: 'Shridha, acrylic and brass',
  },
  {
    src: '/uploads/photos/bw-photo-06.webp',
    label: 'Commercial',
    name: 'Company plates, brass',
  },
  {
    src: '/uploads/photos/bw-photo-05.webp',
    label: 'Apartment',
    name: 'Door number, brass on black',
  },
  {
    src: '/uploads/photos/bw-photo-03.webp',
    label: 'Interior',
    name: 'Door number, 405',
  },
];

/*
 * The journey, in four moments rather than three.
 *
 * Only two carry a date, because only two are dated anywhere the studio has
 * published: the year it started, and now. The middle two are named by what
 * changed, which is the honest way to describe a stretch of years nobody wrote
 * down at the time.
 */
const JOURNEY = [
  {
    marker: '2004',
    title: 'Patel Corporation',
    text: 'An offline signage manufacturing business in Ahmedabad, making signs for other businesses.',
  },
  {
    marker: 'Two decades',
    title: 'Materials and making',
    text: 'Years of brass, acrylic and the finishes around them — and of learning how each behaves in a real space.',
  },
  {
    marker: 'Second generation',
    title: 'A new direction',
    text: 'The next generation takes two decades of manufacturing experience and points it at design.',
  },
  {
    marker: 'Today',
    title: 'Beyond Walls',
    text: 'A design-led brand for personal spaces — drawn, made and fitted by the same studio.',
  },
];

/*
 * Five steps, as the studio asked for them.
 *
 * Four are the studio's own words, lifted from the page this replaces. The
 * fifth, Install, is new writing: there was no published copy for it, but
 * there are photographs of their own people on a ladder fitting a sign, so it
 * describes what those photographs show and claims nothing beyond them.
 */
const PROCESS = [
  {
    title: 'Understand',
    text:
      'We listen, and work out the idea behind the request — the space it is going into, and what '
      + 'it has to do once it is there.',
  },
  {
    title: 'Design',
    text:
      'Every piece begins as an idea, brought to life digitally first: the design, the proportions '
      + 'and the details, refined before anything is made.',
  },
  {
    title: 'Prototype',
    text:
      'Smaller versions of the design, made to understand how it looks, how it feels and how it '
      + 'comes together in the physical world.',
  },
  {
    title: 'Produce',
    text:
      'Production begins at our in-house facility. From choosing the material to assembly and '
      + 'finishing, each piece is made with hands-on attention.',
  },
  {
    title: 'Install',
    text:
      'The finished piece is fitted on site by our own team, so how it sits on the wall is part of '
      + 'the work rather than somebody else’s problem.',
  },
];

const DIFFERENCE = [
  {
    title: 'Design-led thinking',
    text: 'We approach a piece with a design mindset — the space, the material, the purpose.',
  },
  {
    title: 'Materials and finishes',
    text: 'Two decades of working out how materials behave, and how they perform in a real space.',
  },
  {
    title: 'Made in-house',
    text: 'Production happens at our own facility, so quality, finish and timing stay with us.',
  },
  {
    title: 'Design and making together',
    text: 'Our design experience creates with intention. Our manufacturing experience makes it work.',
  },
];

export default function AboutPage() {
  /* Only for the SEO fields, which stay editable in the admin. */
  const { data: page } = useQuery({
    queryKey: ['page', 'about'],
    queryFn: () => api.get<Page>('/pages/about'),
    staleTime: 5 * 60_000,
  });

  const settings = useSettings();
  const established = 2004;
  const years = new Date().getFullYear() - established;

  return (
    <>
      <Seo
        settings={settings.settings}
        title={page?.seoTitle || page?.title || 'About'}
        description={
          page?.seoDescription
          || 'Beyond Walls began in 2004 as Patel Corporation. Two decades of signage manufacturing, now a design-led brand for personal spaces.'
        }
        canonical="/about"
      />

      {/* ------------------------------------------------------------------ */}
      {/* Hero. Split rather than a banner with text over it: the photograph   */}
      {/* is the product, and laying words across it would hide the thing      */}
      {/* being sold.                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-b border-stone-line bg-paper-warm">
        <div className="container-site grid items-stretch gap-0 lg:grid-cols-12">
          <div className="flex flex-col justify-center py-16 lg:col-span-5 lg:py-28 lg:pr-12">
            <p className="eyebrow mb-6">About us</p>
            <h1 className="text-balance text-[2.35rem] leading-[1.08] sm:text-[3rem] lg:text-[3.5rem] xl:text-[4rem]">
              We design, make, and bring spaces to life.
            </h1>
            <p className="mt-7 max-w-[42ch] text-[1.0625rem] leading-[1.75] text-ink-600 lg:text-[1.1875rem] lg:leading-[1.7]">
              Beyond Walls creates thoughtful signage, spaces and custom pieces by bringing together
              design thinking, material knowledge and in-house making.
            </p>
            {/*
              A plain anchor, not a router Link. ScrollToTop only fires on a
              pathname change so it will not fight this, but a router Link
              pushes a hash without the browser scrolling to it -- a
              same-document anchor does the scrolling itself, and scroll-mt on
              the target keeps the heading clear of the fixed header.
            */}
            <div className="mt-10">
              <a
                href="#our-story"
                className="inline-flex items-center gap-2 border border-ink bg-ink px-7 py-4 text-2xs uppercase tracking-architect text-paper transition-colors hover:bg-transparent hover:text-ink"
              >
                Our story
                <ArrowRight size={14} />
              </a>
            </div>
          </div>

          <div className="lg:col-span-7">
            {/*
              Negative margins pull the picture out to the viewport edge on wide
              screens, where the container's gutter would otherwise leave a
              strip of background beside a full-bleed image. Below that it sits
              inside the container like everything else.
            */}
            <div className="-mx-5 aspect-[4/5] sm:-mx-8 sm:aspect-[16/10] lg:mx-0 lg:h-full lg:aspect-auto lg:min-h-[34rem]">
              <img
                src={assetUrl('/uploads/photos/bw-photo-02.webp')}
                alt="Gold lettering reading Rasik Vatika, mounted on a dark textured wall"
                width={1280}
                height={1600}
                {...{ fetchpriority: 'high' }}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Our story. The 2004 photograph stays exactly where it is.            */}
      {/* ------------------------------------------------------------------ */}
      <section id="our-story" className="container-site scroll-mt-24 py-16 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-6">
            <div className="relative">
              <div className="aspect-[4/3] overflow-hidden bg-paper-warm">
                <img
                  src={assetUrl('/uploads/general/about-us-04-Z1qL22gVby.webp')}
                  alt="The original Patel Corporation shopfront in 2004, garlanded, with the team outside"
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
              {/*
                The year, set on the photograph's lower edge. Hidden below the
                large breakpoint, where it would sit on top of faces rather than
                beside them.
              */}
              <div className="absolute -bottom-6 right-0 hidden border border-stone-line bg-paper px-6 py-4 lg:block">
                <p className="text-2xl leading-none">{established}</p>
                <p className="mt-2 max-w-[14ch] text-2xs leading-relaxed text-ink-500">
                  It started with a simple signage manufacturing business.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 lg:pt-6">
            <p className="eyebrow mb-5">Our story</p>
            <h2 className="text-balance text-[1.75rem] leading-tight sm:text-[2.1rem] lg:text-[2.5rem]">
              From a small signage business to a design-led brand.
            </h2>
            <div className="mt-7 space-y-5 text-[1.0625rem] leading-[1.75] text-ink-600">
              <p>
                In 2004 we started as Patel Corporation, an offline signage manufacturing business.
              </p>
              <p>
                For more than two decades we have worked with materials, finishes, spaces and
                businesses to turn ideas into physical signs. That experience taught us something
                simple: the right detail can change how a space feels.
              </p>
              <p>
                Now the second generation is carrying that experience forward in a new direction —
                from making signs to a design-led brand for personal spaces.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Journey. Horizontal on a laptop, vertical on a phone.                */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-y border-stone-line bg-paper-off py-16 lg:py-24">
        <div className="container-site">
          <div className="max-w-2xl">
            <p className="eyebrow mb-5">Our journey</p>
            <h2 className="text-balance text-[1.75rem] leading-tight sm:text-[2.1rem] lg:text-[2.4rem]">
              Twenty years of making, in four moments.
            </h2>
          </div>

          <ol className="relative mt-12 lg:mt-16">
            {/*
              One rule behind the markers, in two orientations: horizontally
              across the four on a laptop, vertically down the left below that.
              It stops short of the last marker on a phone, where the entries
              stack, so the line does not run past the end of the journey.
            */}
            <span
              aria-hidden="true"
              className="absolute left-[7px] top-2 bottom-6 w-px bg-stone-line sm:bottom-2 lg:left-0 lg:right-0 lg:top-[7px] lg:bottom-auto lg:h-px lg:w-auto"
            />
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {JOURNEY.map((entry) => (
                <li key={entry.marker} className="relative pl-8 lg:pl-0 lg:pr-6 lg:pt-9">
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 border-paper-off lg:top-0"
                    style={{ background: 'var(--brand-strong)' }}
                  />
                  <p className="text-xl leading-none text-ink lg:text-[1.4rem]">{entry.marker}</p>
                  <h3 className="mt-3.5 text-xs font-semibold uppercase tracking-architect">
                    {entry.title}
                  </h3>
                  <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-500">
                    {entry.text}
                  </p>
                </li>
              ))}
            </div>
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Numbers. Only what the business can actually stand behind.           */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-ink py-12 text-paper lg:py-16">
        <div className="container-site grid gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-14">
          <div>
            {/* Counted from 2004 rather than written down, so it stays true. */}
            <p className="text-4xl leading-none lg:text-5xl">{years}+</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-architect">Years of making</p>
            <p className="mt-2 text-sm leading-relaxed text-paper/60">
              Signage manufacturing since 2004, now in its second generation.
            </p>
          </div>
          <div>
            <p className="text-4xl leading-none lg:text-5xl">In-house</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-architect">Manufacturing</p>
            <p className="mt-2 text-sm leading-relaxed text-paper/60">
              Production happens at our own facility, from material to finishing.
            </p>
          </div>
          <div>
            <p className="text-4xl leading-none lg:text-5xl">One roof</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-architect">Design and production</p>
            <p className="mt-2 text-sm leading-relaxed text-paper/60">
              The people who draw it and the people who make it work together.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* What makes us different                                             */}
      {/* ------------------------------------------------------------------ */}
      <section className="container-site py-16 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <p className="eyebrow mb-5">Why Beyond Walls</p>
            <h2 className="text-balance text-[1.75rem] leading-tight sm:text-[2.1rem] lg:text-[2.5rem]">
              Design meets making.
            </h2>
            <p className="mt-6 max-w-[42ch] text-[1.0625rem] leading-[1.75] text-ink-600">
              We do not stop at how something looks. We understand what happens after the design
              leaves the screen: the materials, the making, the details, and the challenges that
              come with turning an idea into a physical product.
            </p>
          </div>

          <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:col-span-7">
            {DIFFERENCE.map((item, index) => (
              <div key={item.title} className="border-t border-stone-line pt-5">
                <span
                  className="block text-sm font-medium"
                  style={{ color: 'var(--brand-strong)' }}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-3 text-[1.0625rem] font-medium leading-snug">{item.title}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-500">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Process — five steps, understand through install.                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-y border-stone-line bg-paper-warm py-16 lg:py-24">
        <div className="container-site">
          <div className="max-w-2xl">
            <p className="eyebrow mb-5">Our process</p>
            <h2 className="text-balance text-[1.75rem] leading-tight sm:text-[2.1rem] lg:text-[2.5rem]">
              A clear journey from idea to your space.
            </h2>
          </div>

          {/*
            Two across on a tablet and five on a desktop. Five columns leaves
            each step around 200px at the large breakpoint, enough for a number,
            a one-word title and three lines — and the five then read as one run
            across the page, which is the point of naming them.
          */}
          <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:mt-16 lg:grid-cols-5 lg:gap-x-6">
            {PROCESS.map((entry, index) => (
              <li key={entry.title} className="border-t border-ink/15 pt-6">
                <span
                  className="block text-3xl font-light leading-none lg:text-[2.25rem]"
                  style={{ color: 'var(--brand-strong)' }}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-5 text-lg leading-snug">{entry.title}</h3>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-600">{entry.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Selected work. Two across rather than four, so the photographs are   */}
      {/* big enough to read as work rather than as thumbnails.                */}
      {/* ------------------------------------------------------------------ */}
      <section className="container-site py-16 lg:py-24">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-5 lg:mb-14">
          <div>
            <p className="eyebrow mb-5">Selected work</p>
            <h2 className="text-balance text-[1.75rem] leading-tight sm:text-[2.1rem] lg:text-[2.5rem]">
              Spaces we have made.
            </h2>
          </div>
          <Link to="/gallery" className="link-underline text-sm text-ink">
            View the full gallery →
          </Link>
        </div>

        <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:gap-x-8 lg:gap-y-14">
          {WORK.map((item) => (
            <figure key={item.src} className="group">
              <div className="aspect-[4/5] overflow-hidden bg-paper-warm">
                <img
                  src={assetUrl(item.src)}
                  alt={item.name}
                  width={1280}
                  height={1600}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 ease-architect group-hover:scale-[1.03]"
                />
              </div>
              <figcaption className="mt-5">
                <p className="eyebrow">{item.label}</p>
                <p className="mt-2 text-[1.0625rem] text-ink">{item.name}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* The people behind the work.                                          */}
      {/*                                                                      */}
      {/* One job, twice: the sign being lifted onto the wall, and the same    */}
      {/* sign finished. Both are the studio's own photographs of their own    */}
      {/* people — the only two that exist, and the reason this section can be */}
      {/* here at all.                                                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-t border-stone-line bg-paper-off py-16 lg:py-24">
        <div className="container-site">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <p className="eyebrow mb-5">The people behind the work</p>
              <h2 className="text-balance text-[1.75rem] leading-tight sm:text-[2.1rem] lg:text-[2.5rem]">
                Made by us. Fitted by us.
              </h2>
              <div className="mt-7 max-w-[44ch] space-y-5 text-[1.0625rem] leading-[1.75] text-ink-600">
                <p>
                  A sign is not finished when it leaves the facility. It is finished when it is on
                  the wall, level, and looking like the drawing.
                </p>
                <p>
                  So the last step stays with us too. The same studio that draws a piece and makes
                  it is the one that turns up with the ladder.
                </p>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:col-span-7 lg:gap-7">
              <figure>
                <div className="aspect-[4/3] overflow-hidden bg-paper-warm">
                  <img
                    src={assetUrl('/uploads/photos/bw-photo-09.webp')}
                    alt="Two of the team behind a large Jasco Energy sign, lifting it into position on a boundary wall"
                    width={1600}
                    height={1164}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <figcaption className="mt-4 text-sm text-ink-500">
                  Going up — Jasco Energy, Naroda.
                </figcaption>
              </figure>

              <figure>
                <div className="aspect-[4/3] overflow-hidden bg-paper-warm">
                  <img
                    src={assetUrl('/uploads/photos/bw-photo-10.webp')}
                    alt="The finished Jasco Energy sign mounted above the boundary wall, seen from the gate"
                    width={1600}
                    height={1217}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <figcaption className="mt-4 text-sm text-ink-500">
                  The same sign, finished.
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Design and making — the asymmetric editorial block.                  */}
      {/*                                                                      */}
      {/* The photograph is the Rasik Vatika fit-out: the stepladder, one of   */}
      {/* the team carrying tools, the lettering already up. It replaces a     */}
      {/* shot of a brass plate held in somebody's hand, which said nothing    */}
      {/* about making at the size this block prints it.                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-t border-stone-line">
        <div className="grid lg:grid-cols-12">
          <div className="lg:col-span-6">
            <div className="aspect-[4/5] sm:aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-[32rem]">
              <img
                src={assetUrl('/uploads/photos/bw-photo-08.webp')}
                alt="Installation day at Rasik Vatika: a stepladder against the wall, one of the team carrying tools, the gold lettering already mounted"
                width={1280}
                height={1600}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          <div className="flex items-center bg-paper-off lg:col-span-6">
            <div className="px-5 py-14 sm:px-8 lg:px-14 lg:py-20 xl:px-20">
              <p className="eyebrow mb-5">Design meets making</p>
              <h2 className="text-balance text-[1.75rem] leading-tight sm:text-[2.1rem] lg:text-[2.5rem]">
                Thoughtful design. Real-world making.
              </h2>
              <div className="mt-7 max-w-[50ch] space-y-5 text-[1.0625rem] leading-[1.75] text-ink-600">
                <p>
                  Our design experience helps us create with intention. Our manufacturing
                  experience helps us make it work.
                </p>
                <p>
                  But it is not only about what we make. It is about how we work with people. We do
                  not see customers as numbers or orders. We listen, we understand the idea behind
                  the request, and we work towards something that feels right for the person and
                  the space.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Closing call to action                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-ink py-16 text-paper lg:py-20">
        <div className="container-site flex flex-wrap items-center justify-between gap-8">
          <div>
            <p className="eyebrow mb-4 text-paper/50">Let us make something</p>
            <h2 className="text-balance text-[1.75rem] leading-tight sm:text-[2.1rem] lg:text-[2.4rem]">
              Have a space, sign or idea in mind?
            </h2>
            <p className="mt-4 max-w-[44ch] text-[0.9375rem] leading-relaxed text-paper/65">
              Send us the sizes, the material and the artwork, and we will come back to you with a
              quote.
            </p>
          </div>
          {/*
            A light button on a dark band, matching the CTA block the rest of
            the site uses. The kit's `secondary` is ink-on-transparent, which
            would be all but invisible here.
          */}
          <Link
            to="/custom-order"
            className="inline-flex shrink-0 items-center gap-2 border border-paper bg-paper px-7 py-4 text-2xs uppercase tracking-architect text-ink transition-colors hover:bg-transparent hover:text-paper"
          >
            Start a custom order
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>

    </>
  );
}
