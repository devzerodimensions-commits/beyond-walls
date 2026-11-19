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
 * brand, and the blocks are general by design. So it is laid out directly,
 * while the header, the footer, the container, the type scale, the colours
 * and the buttons all stay exactly as the rest of the site uses them.
 *
 * Its SEO still comes from the CMS page row, so title and description remain
 * editable in the admin. The old section rows are left in the database
 * untouched: nothing is lost, and pointing the route back at StaticPage would
 * restore the previous page as it was.
 *
 * ON SCALE
 * An earlier version of this page was built big — a 64px heading over a 34rem
 * photograph, work shown two across at 636px. Big is not the same as good: at
 * that size the page is a slideshow you scroll past rather than a studio you
 * read about. Everything here is deliberately smaller and tighter, and the
 * quality is meant to come from proportion and restraint instead of scale.
 *
 * ON THE PHOTOGRAPHS
 * Every image is the studio's own, and every frame matches the shape of the
 * picture inside it, so nothing is cropped to fit a layout. That rule exists
 * because breaking it did real damage: the 2004 shopfront is a 4:5 portrait,
 * it was put in a 4:3 landscape frame, and the crop removed the words PATEL
 * CORPORATION from the top of the photograph. The name of the company, cut
 * out of the only picture of it. Hence `aspect-[4/5]` below, and hence the
 * matching comment on every other frame on this page.
 */

/*
 * The three photographs of the studio at work, with their real pixel sizes.
 *
 * The sizes are here because the row below is laid out from them: each frame
 * is given a flex-grow equal to its own aspect ratio, so its width comes out
 * proportional to its shape and every image in the row ends up exactly the
 * same height. Bottom edges line up, captions sit on one baseline, and not a
 * pixel of any of the three is cropped to achieve it.
 *
 * The arrangement it replaces put a 4:5 portrait and two ~4:3 landscapes in
 * equal columns, which cannot line up: the portrait ran half as tall again as
 * its neighbours, and `self-start` left the two landscapes hanging at the top
 * of a column of empty space with their captions stranded above the third.
 */
const PEOPLE = [
  {
    src: '/uploads/photos/bw-photo-08.webp',
    width: 1280,
    height: 1600,
    caption: 'Rasik Vatika, on the day.',
    alt: 'Installation day at Rasik Vatika: a stepladder against the wall, one of the team carrying tools, the gold lettering already mounted',
  },
  {
    src: '/uploads/photos/bw-photo-09.webp',
    width: 1600,
    height: 1164,
    caption: 'Going up.',
    alt: 'Two of the team behind a large Jasco Energy sign, lifting it into position on a boundary wall',
  },
  {
    src: '/uploads/photos/bw-photo-10.webp',
    width: 1600,
    height: 1217,
    caption: 'The same sign, finished.',
    alt: 'The finished Jasco Energy sign mounted above the boundary wall, seen from the gate',
  },
];

/** Four finished pieces. All installed, all the studio's own photographs. */
const WORK = [
  { src: '/uploads/photos/bw-photo-11.webp', label: 'Residential', name: 'Shridha, acrylic and brass' },
  { src: '/uploads/photos/bw-photo-06.webp', label: 'Commercial', name: 'Company plates, brass' },
  { src: '/uploads/photos/bw-photo-05.webp', label: 'Apartment', name: 'Door number, brass on black' },
  { src: '/uploads/photos/bw-photo-03.webp', label: 'Interior', name: 'Door number, 405' },
];

/*
 * The journey, in four moments.
 *
 * Only two carry a date, because only two are dated anywhere the studio has
 * published: the year it started, and now. The middle two are named by what
 * changed, which is the honest way to describe a stretch of years nobody
 * wrote down at the time.
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
    text: 'Years of brass, acrylic and the finishes around them, and of learning how each behaves in a real space.',
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
 * Four are the studio's own words from the page this replaces. The fifth,
 * Install, is new writing: there was no published copy for it, but there are
 * photographs of their own people on a ladder fitting a sign, so it describes
 * what those photographs show and claims nothing beyond them.
 */
const PROCESS = [
  {
    title: 'Understand',
    text: 'We listen, and work out the idea behind the request — the space it is going into, and what it has to do once it is there.',
  },
  {
    title: 'Design',
    text: 'Every piece begins as an idea, brought to life digitally first: the design, the proportions and the details.',
  },
  {
    title: 'Prototype',
    text: 'Smaller versions of the design, made to understand how it looks, how it feels and how it comes together.',
  },
  {
    title: 'Produce',
    text: 'Production begins at our in-house facility. From choosing the material to assembly and finishing.',
  },
  {
    title: 'Install',
    text: 'The finished piece is fitted on site by our own team, so how it sits on the wall is part of the work.',
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

/**
 * The page's own words, with anything the studio has rewritten laid over them.
 *
 * Taken a section at a time rather than wholesale, so a half-filled setting --
 * or one saved by an older version that did not have a section yet -- still
 * leaves every other part of the page reading properly. A list is only taken
 * when it actually has rows: an empty array means nobody has written one, not
 * that the strip should disappear.
 */
function merged<T extends object>(fallback: T, stored: unknown): T {
  if (!stored || typeof stored !== 'object') return fallback;
  const out = { ...fallback } as Record<string, unknown>;
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out as T;
}

/*
 * The page's own words, used when nothing has been written in the admin and
 * whenever a stored section is missing or empty.
 *
 * They are kept here rather than only on the server so the page can never come
 * out as a column of blanks: if the settings call fails, or a section is saved
 * half-filled, what shows is this, which reads properly.
 */
const DEFAULT_HERO = {
  eyebrow: 'About us',
  heading: 'We design, make, and bring spaces to life.',
  body: 'Beyond Walls creates thoughtful signage, spaces and custom pieces by bringing together design thinking, material knowledge and in-house making.',
  buttonLabel: 'Our story',
};

const DEFAULT_STORY = {
  eyebrow: 'Our story',
  heading: 'From a small signage business to a design-led brand.',
  photoCaption: 'Patel Corporation, Ahmedabad — where it started.',
  paragraphs: [
    'In 2004 we started as Patel Corporation, an offline signage manufacturing business.',
    'For more than two decades we have worked with materials, finishes, spaces and businesses to turn ideas into physical signs. That experience taught us something simple: the right detail can change how a space feels.',
    'Now the second generation is carrying that experience forward in a new direction — from making signs to a design-led brand for personal spaces.',
  ],
};

/** The first figure counts itself from 2004 when its value is left blank. */
const DEFAULT_STATS = [
  { value: '', label: 'Years of making', text: 'Signage manufacturing since 2004, now in its second generation.' },
  { value: 'In-house', label: 'Manufacturing', text: 'Production happens at our own facility, from material to finishing.' },
  { value: 'One roof', label: 'Design and production', text: 'The people who draw it and the people who make it work together.' },
];

const DEFAULT_DIFFERENCE = {
  eyebrow: 'Why Beyond Walls',
  heading: 'Design meets making.',
  body: 'We do not stop at how something looks. We understand what happens after the design leaves the screen: the materials, the making, and the challenges that come with turning an idea into a physical product.',
  items: DIFFERENCE,
};

const DEFAULT_PROCESS = {
  eyebrow: 'Our process',
  heading: 'A clear journey from idea to your space.',
  items: PROCESS,
};

const DEFAULT_WORK = {
  heading: 'Spaces we have made.',
  linkLabel: 'View the full gallery →',
  items: WORK,
};

const DEFAULT_PEOPLE_TEXT = {
  eyebrow: 'The people behind the work',
  heading: 'Made by us. Fitted by us.',
  paragraphs: [
    'A sign is not finished when it leaves the facility. It is finished when it is on the wall, level, and looking like the drawing.',
    'So the last step stays with us too. The same studio that draws a piece and makes it is the one that turns up with the ladder.',
  ],
  captions: PEOPLE.map((photo) => photo.caption),
};

const DEFAULT_CTA = {
  eyebrow: 'Let us make something',
  heading: 'Have a space, sign or idea in mind?',
  body: 'Send us the sizes, the material and the artwork, and we will come back to you with a quote.',
  buttonLabel: 'Start a custom order',
};

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

  /*
   * Everything written on this page, editable in Admin -> Settings -> About
   * page. The layout stays in the design; only the words come from there.
   */
  const stored = settings.get<Record<string, unknown>>('about.content', {}) ?? {};
  const hero = merged(DEFAULT_HERO, stored.hero);
  const story = merged(DEFAULT_STORY, stored.story);
  const difference = merged(DEFAULT_DIFFERENCE, stored.difference);
  const process = merged(DEFAULT_PROCESS, stored.process);
  const work = merged(DEFAULT_WORK, stored.work);
  const people = merged(DEFAULT_PEOPLE_TEXT, stored.people);
  const cta = merged(DEFAULT_CTA, stored.cta);
  const journey = Array.isArray(stored.journey) && stored.journey.length
    ? (stored.journey as typeof JOURNEY) : JOURNEY;
  const stats = Array.isArray(stored.stats) && stored.stats.length
    ? (stored.stats as typeof DEFAULT_STATS) : DEFAULT_STATS;

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
      {/* Hero.                                                               */}
      {/*                                                                     */}
      {/* Capped at 26rem rather than left to grow with the photograph. A     */}
      {/* hero is an opening line, not a chapter: the previous one ran to     */}
      {/* 857px and filled the whole screen before a word had been read.      */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-b border-stone-line bg-paper-warm">
        <div className="container-site grid items-stretch lg:grid-cols-12 lg:min-h-[26rem]">
          <div className="flex flex-col justify-center py-12 lg:col-span-6 lg:py-16 lg:pr-14">
            <p className="eyebrow mb-4">{hero.eyebrow}</p>
            <h1 className="text-balance text-[1.9rem] leading-[1.14] sm:text-[2.3rem] lg:text-[2.6rem]">
              {hero.heading}
            </h1>
            <p className="mt-5 max-w-[46ch] text-[0.975rem] leading-[1.75] text-ink-600">
              {hero.body}
            </p>
            {/*
              A plain anchor, not a router Link. ScrollToTop only fires on a
              pathname change so it will not fight this, but a router Link
              pushes a hash without the browser scrolling to it — a
              same-document anchor does the scrolling itself, and scroll-mt on
              the target keeps the heading clear of the fixed header.
            */}
            <div className="mt-8">
              <a
                href="#our-story"
                className="inline-flex items-center gap-2 border border-ink bg-ink px-6 py-3 text-2xs uppercase tracking-architect text-paper transition-colors hover:bg-transparent hover:text-ink"
              >
                {hero.buttonLabel}
                <ArrowRight size={13} />
              </a>
            </div>
          </div>

          {/*
            Below lg the photograph keeps its own 4:5 shape. From lg it fills
            the capped band instead, which is the one place on this page a
            crop is the right answer: the lettering sits centre-frame, and a
            hero that grows to 750px to avoid trimming its edges is the
            problem this rewrite exists to fix.
          */}
          <div className="-mx-5 aspect-[4/5] sm:-mx-8 sm:aspect-[16/10] lg:relative lg:mx-0 lg:col-span-6 lg:aspect-auto">
            {/*
              Absolute from lg, which is the only way the cap actually holds.
              Left in flow, `h-full` resolves against an auto-height row and
              falls back to the picture's intrinsic height — so the image sets
              the row instead of the row setting the image, and a 26rem cap
              silently became 734px. Out of flow it contributes no height, and
              the row is the text plus the grid's own minimum.
            */}
            <img
              src={assetUrl('/uploads/photos/bw-photo-02.webp')}
              alt="Gold lettering reading Rasik Vatika, mounted on a dark textured wall"
              width={1280}
              height={1600}
              {...{ fetchpriority: 'high' }}
              className="h-full w-full object-cover lg:absolute lg:inset-0"
            />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Our story.                                                          */}
      {/*                                                                     */}
      {/* The 2004 photograph, whole. It is 1920x2400 — a 4:5 portrait — so   */}
      {/* the frame is 4:5. Nothing of it is trimmed, including the sign.     */}
      {/* ------------------------------------------------------------------ */}
      <section id="our-story" className="container-site scroll-mt-24 py-14 lg:py-20">
        <div className="grid items-start gap-9 lg:grid-cols-12 lg:gap-14">
          {/*
            Capped below lg. The frame keeps the photograph's 4:5 whatever the
            width, which is right — but a 4:5 frame at full tablet width is
            1042px of photograph, and "do not crop it" is not the same request
            as "make it enormous". The cap bounds the height without touching
            the shape; from lg the column is narrow enough to do that itself.
          */}
          <figure className="mx-auto w-full max-w-[22rem] sm:max-w-[26rem] lg:col-span-5 lg:mx-0 lg:max-w-none">
            <div className="aspect-[4/5] overflow-hidden bg-paper-warm">
              <img
                src={assetUrl('/uploads/general/about-us-04-Z1qL22gVby.webp')}
                alt="The Patel Corporation shopfront in 2004, hung with marigold garlands, the family and staff standing beneath the sign"
                width={1920}
                height={2400}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
            <figcaption className="mt-3.5 flex items-baseline gap-3 border-t border-stone-line pt-3.5">
              <span className="text-lg leading-none text-ink">{established}</span>
              <span className="text-xs leading-relaxed text-ink-500">
                {story.photoCaption}
              </span>
            </figcaption>
          </figure>

          <div className="lg:col-span-7 lg:pt-1">
            <p className="eyebrow mb-4">{story.eyebrow}</p>
            <h2 className="text-balance text-[1.55rem] leading-tight sm:text-[1.8rem] lg:text-[2.05rem]">
              {story.heading}
            </h2>
            <div className="mt-6 max-w-[58ch] space-y-4 text-[0.975rem] leading-[1.78] text-ink-600">
              {story.paragraphs.map((text) => <p key={text}>{text}</p>)}
            </div>

            {/*
              The journey sits inside the story rather than in a band of its
              own. It is the same subject, and giving it a separate section
              with its own heading was one more full screen to scroll past.
            */}
            <ol className="relative mt-10 border-t border-stone-line pt-8">
              <span
                aria-hidden="true"
                className="absolute left-[5px] top-10 bottom-5 w-px bg-stone-line sm:left-0 sm:right-0 sm:top-[calc(2rem+5px)] sm:bottom-auto sm:h-px sm:w-auto"
              />
              <div className="grid gap-7 sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-4 lg:gap-x-6">
                {journey.map((entry) => (
                  <li key={entry.marker} className="relative pl-6 sm:pl-0 sm:pt-6">
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1 h-2.5 w-2.5 rounded-full border-2 border-paper sm:top-0"
                      style={{ background: 'var(--brand-strong)' }}
                    />
                    <p className="text-[0.95rem] leading-none text-ink">{entry.marker}</p>
                    <h3 className="mt-2.5 text-2xs font-semibold uppercase tracking-architect text-ink-500">
                      {entry.title}
                    </h3>
                    <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-500">{entry.text}</p>
                  </li>
                ))}
              </div>
            </ol>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Numbers. Only what the business can actually stand behind.          */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-ink py-10 text-paper lg:py-12">
        <div className="container-site grid gap-8 sm:grid-cols-3 lg:gap-12">
          {stats.map((stat) => (
            <div key={stat.label}>
              {/*
                * Left blank, the first figure counts itself from 2004 rather
                * than being written down, so it cannot quietly go stale.
                */}
              <p className="text-[2rem] leading-none lg:text-[2.5rem]">{stat.value || `${years}+`}</p>
              <p className="mt-3 text-2xs font-semibold uppercase tracking-architect">{stat.label}</p>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-paper/60">{stat.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* How we work — the difference and the five steps, in one section.    */}
      {/* ------------------------------------------------------------------ */}
      <section className="container-site py-14 lg:py-20">
        <div className="grid gap-9 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-4">
            <p className="eyebrow mb-4">{difference.eyebrow}</p>
            <h2 className="text-balance text-[1.55rem] leading-tight sm:text-[1.8rem] lg:text-[2.05rem]">
              {difference.heading}
            </h2>
            <p className="mt-5 max-w-[42ch] text-[0.975rem] leading-[1.78] text-ink-600">
              {difference.body}
            </p>
          </div>

          <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:col-span-8">
            {difference.items.map((item, index) => (
              <div key={item.title} className="border-t border-stone-line pt-4">
                <span
                  className="block text-2xs font-medium"
                  style={{ color: 'var(--brand-strong)' }}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-2.5 text-[0.975rem] font-medium leading-snug">{item.title}</h3>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-500">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Process — five steps, understand through install.                   */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-y border-stone-line bg-paper-warm py-14 lg:py-20">
        <div className="container-site">
          <div className="flex flex-wrap items-baseline justify-between gap-x-10 gap-y-3">
            <h2 className="text-balance text-[1.55rem] leading-tight sm:text-[1.8rem] lg:text-[2.05rem]">
              {process.heading}
            </h2>
            <p className="eyebrow">{process.eyebrow}</p>
          </div>

          <ol className="mt-10 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:mt-12 lg:grid-cols-5">
            {process.items.map((entry, index) => (
              <li key={entry.title} className="border-t border-ink/15 pt-5">
                <span
                  className="block text-xl font-light leading-none"
                  style={{ color: 'var(--brand-strong)' }}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-3.5 text-[0.975rem] font-medium leading-snug">{entry.title}</h3>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-600">{entry.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Selected work. Four across, each its own 4:5 — nothing cropped,     */}
      {/* and small enough that the section is a row of work rather than a    */}
      {/* second scroll through the gallery.                                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="container-site py-14 lg:py-20">
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-x-10 gap-y-3 lg:mb-10">
          <h2 className="text-balance text-[1.55rem] leading-tight sm:text-[1.8rem] lg:text-[2.05rem]">
            {work.heading}
          </h2>
          <Link to="/gallery" className="link-underline text-sm text-ink">
            {work.linkLabel}
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-7 lg:grid-cols-4 lg:gap-x-6">
          {work.items.map((item) => (
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
              <figcaption className="mt-3">
                <p className="eyebrow text-ink-400">{item.label}</p>
                <p className="mt-1 text-[0.875rem] text-ink">{item.name}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* The people behind the work.                                         */}
      {/*                                                                     */}
      {/* Three photographs of the studio's own people at two jobs: the       */}
      {/* Rasik Vatika fit-out, and a sign going up and then finished. Each   */}
      {/* frame matches its picture — 4:5 for the portrait, 4:3 for the two   */}
      {/* landscapes — so none of the three is trimmed to line up with the    */}
      {/* others.                                                             */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-t border-stone-line bg-paper-off py-14 lg:py-20">
        <div className="container-site">
          <div className="grid gap-9 lg:grid-cols-12 lg:gap-14">
            <div className="lg:col-span-4">
              <p className="eyebrow mb-4">{people.eyebrow}</p>
              <h2 className="text-balance text-[1.55rem] leading-tight sm:text-[1.8rem] lg:text-[2.05rem]">
                {people.heading}
              </h2>
              <div className="mt-5 max-w-[40ch] space-y-4 text-[0.975rem] leading-[1.78] text-ink-600">
                {people.paragraphs.map((text) => <p key={text}>{text}</p>)}
              </div>
            </div>

            {/*
              A justified row: stacked on a phone, side by side from sm.

              Each frame grows in proportion to its own aspect ratio against a
              zero basis, so widths come out as 0.80 : 1.37 : 1.31 and all
              three images resolve to one height. The captions then share a
              baseline for free. `min-w-0` because a flex item will not shrink
              below its content otherwise, and `items-start` keeps a longer
              caption from stretching its neighbours.
            */}
            <div className="flex flex-col items-start gap-5 sm:flex-row lg:col-span-8 lg:gap-6">
              {PEOPLE.map((photo, index) => (
                <figure
                  key={photo.src}
                  className="w-full min-w-0 sm:w-auto"
                  style={{ flexGrow: photo.width / photo.height, flexBasis: 0 }}
                >
                  <div
                    className="overflow-hidden bg-paper-warm"
                    style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
                  >
                    <img
                      src={assetUrl(photo.src)}
                      alt={photo.alt}
                      width={photo.width}
                      height={photo.height}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <figcaption className="mt-3 text-[0.8125rem] text-ink-500">
                    {people.captions[index] || photo.caption}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Closing call to action                                              */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-ink py-12 text-paper lg:py-16">
        <div className="container-site flex flex-wrap items-center justify-between gap-7">
          <div>
            <p className="eyebrow mb-3 text-paper/50">{cta.eyebrow}</p>
            <h2 className="text-balance text-[1.55rem] leading-tight sm:text-[1.8rem] lg:text-[2rem]">
              {cta.heading}
            </h2>
            <p className="mt-3 max-w-[46ch] text-[0.875rem] leading-relaxed text-paper/65">
              {cta.body}
            </p>
          </div>
          {/*
            A light button on a dark band, matching the CTA block the rest of
            the site uses. The kit's `secondary` is ink-on-transparent, which
            would be all but invisible here.
          */}
          <Link
            to="/custom-order"
            className="inline-flex shrink-0 items-center gap-2 border border-paper bg-paper px-6 py-3 text-2xs uppercase tracking-architect text-ink transition-colors hover:bg-transparent hover:text-paper"
          >
            {cta.buttonLabel}
            <ArrowRight size={13} />
          </Link>
        </div>
      </section>

    </>
  );
}
