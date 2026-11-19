import prisma from '../lib/prisma';

/**
 * Canonical settings registry. Everything here is editable from
 * Admin → Settings and is served to the storefront via GET /api/settings.
 *
 * Only the business facts supplied by the client are pre-filled; anything
 * that would amount to a marketing claim is left blank for the owner to write.
 */
export interface SettingDefinition {
  key: string;
  group: string;
  label: string;
  value: unknown;
  /** Secret settings never leave the server via the public endpoint. */
  serverOnly?: boolean;
}

export const SETTING_DEFINITIONS: SettingDefinition[] = [
  // --- Brand -----------------------------------------------------------------
  { key: 'brand.name', group: 'brand', label: 'Business name', value: 'Beyond Walls' },
  { key: 'brand.logoText', group: 'brand', label: 'Text logo (used until artwork is supplied)', value: 'BEYOND WALLS' },
  /* Empty by default: the studio wants the mark to stand on its own. Set one
     in Admin -> Brand and it appears under the logo again. */
  { key: 'brand.logoTagline', group: 'brand', label: 'Logo tagline', value: '' },
  { key: 'brand.logoImage', group: 'brand', label: 'Logo image (light background)', value: null },
  { key: 'brand.logoImageDark', group: 'brand', label: 'Logo image (dark background)', value: null },
  { key: 'brand.favicon', group: 'brand', label: 'Favicon', value: null },
  /*
   * One colour, applied to the shop and the admin alike. Everything derived
   * from it -- hover, tints, borders, focus rings and the text that sits on
   * each -- is computed in client/src/lib/brandColor.ts, so this stays a
   * single hex rather than a dozen settings that could disagree.
   */
  { key: 'brand.color', group: 'brand', label: 'Brand colour', value: '#0E7A57' },

  // --- About page ------------------------------------------------------------
  /*
   * The words on /about.
   *
   * That page is laid out by hand rather than built from section blocks, so
   * its text used to live in the component and could not be changed without a
   * developer. The layout still belongs to the design; only the words and the
   * captions are kept here, which is the part a studio actually rewrites.
   *
   * The default below is the page exactly as it was written, so nothing moves
   * until somebody edits it. The component keeps its own copy as a fallback:
   * if this ever arrives empty or malformed, the page still reads properly
   * rather than rendering a column of blanks.
   */
  { key: 'about.content', group: 'about', label: 'About page text', value: {
    "hero": {
      "eyebrow": "About us",
      "heading": "We design, make, and bring spaces to life.",
      "body": "Beyond Walls creates thoughtful signage, spaces and custom pieces by bringing together design thinking, material knowledge and in-house making.",
      "buttonLabel": "Our story"
    },
    "story": {
      "eyebrow": "Our story",
      "heading": "From a small signage business to a design-led brand.",
      "photoCaption": "Patel Corporation, Ahmedabad — where it started.",
      "paragraphs": [
        "In 2004 we started as Patel Corporation, an offline signage manufacturing business.",
        "For more than two decades we have worked with materials, finishes, spaces and businesses to turn ideas into physical signs. That experience taught us something simple: the right detail can change how a space feels.",
        "Now the second generation is carrying that experience forward in a new direction — from making signs to a design-led brand for personal spaces."
      ]
    },
    "journey": [
      {
        "marker": "2004",
        "title": "Patel Corporation",
        "text": "An offline signage manufacturing business in Ahmedabad, making signs for other businesses."
      },
      {
        "marker": "Two decades",
        "title": "Materials and making",
        "text": "Years of brass, acrylic and the finishes around them, and of learning how each behaves in a real space."
      },
      {
        "marker": "Second generation",
        "title": "A new direction",
        "text": "The next generation takes two decades of manufacturing experience and points it at design."
      },
      {
        "marker": "Today",
        "title": "Beyond Walls",
        "text": "A design-led brand for personal spaces — drawn, made and fitted by the same studio."
      }
    ],
    "stats": [
      {
        "value": "",
        "label": "Years of making",
        "text": "Signage manufacturing since 2004, now in its second generation."
      },
      {
        "value": "In-house",
        "label": "Manufacturing",
        "text": "Production happens at our own facility, from material to finishing."
      },
      {
        "value": "One roof",
        "label": "Design and production",
        "text": "The people who draw it and the people who make it work together."
      }
    ],
    "difference": {
      "eyebrow": "Why Beyond Walls",
      "heading": "Design meets making.",
      "body": "We do not stop at how something looks. We understand what happens after the design leaves the screen: the materials, the making, and the challenges that come with turning an idea into a physical product.",
      "items": [
        {
          "title": "Design-led thinking",
          "text": "We approach a piece with a design mindset — the space, the material, the purpose."
        },
        {
          "title": "Materials and finishes",
          "text": "Two decades of working out how materials behave, and how they perform in a real space."
        },
        {
          "title": "Made in-house",
          "text": "Production happens at our own facility, so quality, finish and timing stay with us."
        },
        {
          "title": "Design and making together",
          "text": "Our design experience creates with intention. Our manufacturing experience makes it work."
        }
      ]
    },
    "process": {
      "eyebrow": "Our process",
      "heading": "A clear journey from idea to your space.",
      "items": [
        {
          "title": "Understand",
          "text": "We listen, and work out the idea behind the request — the space it is going into, and what it has to do once it is there."
        },
        {
          "title": "Design",
          "text": "Every piece begins as an idea, brought to life digitally first: the design, the proportions and the details."
        },
        {
          "title": "Prototype",
          "text": "Smaller versions of the design, made to understand how it looks, how it feels and how it comes together."
        },
        {
          "title": "Produce",
          "text": "Production begins at our in-house facility. From choosing the material to assembly and finishing."
        },
        {
          "title": "Install",
          "text": "The finished piece is fitted on site by our own team, so how it sits on the wall is part of the work."
        }
      ]
    },
    "work": {
      "heading": "Spaces we have made.",
      "linkLabel": "View the full gallery →",
      "items": [
        {
          "src": "/uploads/photos/bw-photo-11.webp",
          "label": "Residential",
          "name": "Shridha, acrylic and brass"
        },
        {
          "src": "/uploads/photos/bw-photo-06.webp",
          "label": "Commercial",
          "name": "Company plates, brass"
        },
        {
          "src": "/uploads/photos/bw-photo-05.webp",
          "label": "Apartment",
          "name": "Door number, brass on black"
        },
        {
          "src": "/uploads/photos/bw-photo-03.webp",
          "label": "Interior",
          "name": "Door number, 405"
        }
      ]
    },
    "people": {
      "eyebrow": "The people behind the work",
      "heading": "Made by us. Fitted by us.",
      "paragraphs": [
        "A sign is not finished when it leaves the facility. It is finished when it is on the wall, level, and looking like the drawing.",
        "So the last step stays with us too. The same studio that draws a piece and makes it is the one that turns up with the ladder."
      ],
      "captions": [
        "Rasik Vatika, on the day.",
        "Going up.",
        "The same sign, finished."
      ]
    },
    "cta": {
      "eyebrow": "Let us make something",
      "heading": "Have a space, sign or idea in mind?",
      "body": "Send us the sizes, the material and the artwork, and we will come back to you with a quote.",
      "buttonLabel": "Start a custom order"
    }
  } },

  // --- Contact ---------------------------------------------------------------
  { key: 'contact.phone', group: 'contact', label: 'Phone', value: '+91 7600738785' },
  { key: 'contact.whatsapp', group: 'contact', label: 'WhatsApp number', value: '+91 7600738785' },
  { key: 'contact.email', group: 'contact', label: 'Email', value: 'info@thebeyondwalls.com' },
  /*
   * A second address, shown beneath the first wherever the site lists the
   * studio's contact details. The studio keeps two mailboxes and wanted both
   * reachable from the site.
   *
   * Deliberately unlabelled on the page. Calling one "sales" and the other
   * "support" would be inventing a promise about who answers what, and
   * nobody has made that promise. Two addresses, both real, in the order the
   * studio put them. Blank hides it entirely.
   */
  { key: 'contact.emailSecondary', group: 'contact', label: 'Second email', value: 'socials@thebeyondwalls.com' },
  {
    key: 'contact.addressLines',
    group: 'contact',
    label: 'Address lines',
    value: [
      'First Floor, Shop No. 01',
      'Prime Center Mall',
      'Opp. Three Corner Garden, Mirzapur',
      'Ahmedabad, Gujarat 380001',
    ],
  },
  { key: 'contact.city', group: 'contact', label: 'City', value: 'Ahmedabad' },
  { key: 'contact.state', group: 'contact', label: 'State', value: 'Gujarat' },
  { key: 'contact.postalCode', group: 'contact', label: 'Postal code', value: '380001' },
  { key: 'contact.country', group: 'contact', label: 'Country', value: 'India' },
  { key: 'contact.mapEmbedUrl', group: 'contact', label: 'Google Maps embed URL', value: null },

  // --- Business hours --------------------------------------------------------
  {
    key: 'hours.schedule',
    group: 'hours',
    label: 'Business hours',
    value: [
      { day: 'Monday', open: '10:00', close: '20:00', closed: false },
      { day: 'Tuesday', open: '10:00', close: '20:00', closed: false },
      { day: 'Wednesday', open: '10:00', close: '20:00', closed: false },
      { day: 'Thursday', open: '10:00', close: '20:00', closed: false },
      { day: 'Friday', open: '10:00', close: '20:00', closed: false },
      { day: 'Saturday', open: '10:00', close: '20:00', closed: false },
      { day: 'Sunday', open: null, close: null, closed: true },
    ],
  },
  { key: 'hours.summary', group: 'hours', label: 'Hours summary line', value: 'Monday–Saturday, 10 AM – 8 PM' },

  // --- Social ----------------------------------------------------------------
  { key: 'social.instagram', group: 'social', label: 'Instagram URL', value: null },
  { key: 'social.facebook', group: 'social', label: 'Facebook URL', value: null },
  { key: 'social.linkedin', group: 'social', label: 'LinkedIn URL', value: null },
  { key: 'social.youtube', group: 'social', label: 'YouTube URL', value: null },
  { key: 'social.pinterest', group: 'social', label: 'Pinterest URL', value: null },

  // --- Footer ----------------------------------------------------------------
  {
    key: 'footer.about',
    group: 'footer',
    label: 'Footer about text',
    value:
      'A contemporary home & lifestyle brand creating thoughtfully designed objects for ' +
      'spaces that feel like yours. Made to order in Ahmedabad.',
  },
  { key: 'footer.copyright', group: 'footer', label: 'Copyright line', value: '© {year} Beyond Walls. All rights reserved.' },
  { key: 'footer.newsletterEnabled', group: 'footer', label: 'Show newsletter signup', value: false },
  { key: 'footer.newsletterHeading', group: 'footer', label: 'Newsletter heading', value: '' },

  // --- Announcement bar ------------------------------------------------------
  { key: 'announcement.enabled', group: 'announcement', label: 'Show announcement bar', value: false },
  { key: 'announcement.text', group: 'announcement', label: 'Announcement text', value: '' },
  { key: 'announcement.link', group: 'announcement', label: 'Announcement link', value: null },

  // --- Payments --------------------------------------------------------------
  { key: 'payment.razorpayEnabled', group: 'payment', label: 'Enable Razorpay (UPI / Cards / Net Banking / Wallets)', value: true },
  { key: 'payment.codEnabled', group: 'payment', label: 'Enable Cash on Delivery', value: false },
  { key: 'payment.codFee', group: 'payment', label: 'COD handling fee (INR)', value: 0 },
  { key: 'payment.codMinOrder', group: 'payment', label: 'COD minimum order value (INR)', value: 0 },
  { key: 'payment.codMaxOrder', group: 'payment', label: 'COD maximum order value (INR, 0 = no limit)', value: 0 },
  { key: 'payment.codNote', group: 'payment', label: 'Note shown next to the COD option', value: '' },
  { key: 'payment.currency', group: 'payment', label: 'Currency code', value: 'INR' },

  // --- Shipping / tax --------------------------------------------------------
  { key: 'shipping.flatRate', group: 'shipping', label: 'Flat shipping rate (INR)', value: 0 },
  { key: 'shipping.freeAbove', group: 'shipping', label: 'Free shipping above (INR, 0 = always free)', value: 0 },
  { key: 'shipping.note', group: 'shipping', label: 'Shipping note shown at checkout', value: '' },
  { key: 'tax.pricesIncludeTax', group: 'tax', label: 'Product prices already include GST', value: true },
  { key: 'tax.gstin', group: 'tax', label: 'Business GSTIN', value: '' },
  // A GST invoice can only be raised by a registered business, so asking the
  // customer for a GSTIN while unregistered promises what cannot be issued.
  // Off until the studio registers; the feature stays built either way.
  { key: 'tax.gstInvoiceEnabled', group: 'tax', label: 'Offer a GST invoice at checkout', value: false },

  // --- SEO -------------------------------------------------------------------
  {
    key: 'seo.defaultTitle',
    group: 'seo',
    label: 'Default page title',
    value: 'Beyond Walls — A design-led brand for your spaces',
  },
  {
    key: 'seo.titleTemplate',
    group: 'seo',
    label: 'Title template ({page} is replaced)',
    value: '{page} | Beyond Walls',
  },
  {
    key: 'seo.defaultDescription',
    group: 'seo',
    label: 'Default meta description',
    value:
      'Beyond Walls is a contemporary home & lifestyle brand creating thoughtfully designed ' +
      'objects for spaces that feel like yours. Made to order in Ahmedabad.',
  },
  {
    key: 'seo.defaultKeywords',
    group: 'seo',
    label: 'Default meta keywords',
    value: 'home and lifestyle, design-led objects, nameplates, signage, prints, Ahmedabad',
  },
  { key: 'seo.defaultOgImage', group: 'seo', label: 'Default social share image', value: null },
  {
    key: 'seo.siteUrl',
    group: 'seo',
    label: 'Canonical site URL',
    // Every canonical tag, sitemap entry and share link is built from this.
    // This is the domain the site is actually served on, confirmed rather than
    // inferred — see seo.domainConfirmed below.
    value: 'https://thebeyondwalls.com',
  },
  {
    key: 'seo.domainConfirmed',
    group: 'seo',
    label: 'Canonical site URL confirmed',
    value: true,
  },
  { key: 'seo.googleSiteVerification', group: 'seo', label: 'Google site verification token', value: '' },
  { key: 'seo.robots', group: 'seo', label: 'Robots directive', value: 'index, follow' },

  // --- Product images --------------------------------------------------------
  /*
   * How a product photograph sits in its frame, catalogue-wide.
   *
   * The default is the one that never damages a picture. "contain" and "cover"
   * are there because a catalogue shot on a white background and a photograph
   * of a sign on a wall want different things, and which one this shop sells
   * is not a decision code should be making on the studio's behalf.
   */
  { key: 'catalog.imageFit', group: 'catalog', label: 'Product image fit', value: 'natural' },
  /*
   * The frame shape used by "contain" and "cover" -- and the fallback in
   * "natural" for an image whose pixel size was never recorded, which is every
   * product image uploaded before that was captured.
   */
  { key: 'catalog.imageRatio', group: 'catalog', label: 'Product image shape', value: '1:1' },

  // --- Store behaviour -------------------------------------------------------
  { key: 'store.enableWishlist', group: 'store', label: 'Enable wishlist', value: true },
  { key: 'store.enableReviews', group: 'store', label: 'Show product reviews', value: false },
  { key: 'store.enableCheckout', group: 'store', label: 'Enable checkout', value: true },
  { key: 'store.customOrderIntro', group: 'store', label: 'Custom order form intro', value: '' },
  {
    key: 'store.budgetBands',
    group: 'store',
    label: 'Budget filter bands',
    value: [
      // minExclusive on the top band stops a 2,499 product appearing in both
      // "Under 2499" and "Premium".
      { slug: 'under-999', label: 'Under ₹999', min: null, max: 999 },
      { slug: 'under-1999', label: 'Under ₹1,999', min: null, max: 1999 },
      { slug: 'under-2499', label: 'Under ₹2,499', min: null, max: 2499 },
      { slug: 'premium', label: 'Over ₹2,499', min: 2499, max: null, minExclusive: true },
    ],
  },

  // --- Live preview ----------------------------------------------------------
  /*
   * What the studio calls each live preview design.
   *
   * One object keyed by the design's id rather than a setting per design, so a
   * design added later is renameable the day it ships instead of needing a
   * settings entry and a deploy. Only the names actually changed are stored:
   * anything absent falls back to the shipped name in LivePreview.tsx, which is
   * also how a renamed design survives that list being reworded.
   *
   * It is in a public group because the shop reads settings from one endpoint,
   * not because the storefront shows these names. They are the studio's own
   * labels in the product editor.
   */
  {
    key: 'preview.templateNames',
    group: 'preview',
    label: 'Live preview design names',
    value: {},
  },
  /**
   * Designs the studio has built and kept, as against the ones that shipped.
   *
   * A shipped design is a drawing in code. This is a saved set of answers
   * about one -- which drawing, what shape, which colours, where the
   * lettering sits -- under a name the workshop actually uses. It exists
   * because the same piece is sold in several sizes and finishes, and setting
   * each one up by hand produced a slightly different answer every time.
   *
   * Applying one copies its settings onto the product, so the product owns
   * them from that point. That is deliberate: a design edited next month must
   * not quietly change what a customer already approved and ordered against a
   * product set up with it.
   *
   * A setting rather than a table because it needs no migration to exist, and
   * because this is a studio's shortlist rather than a catalogue.
   */
  {
    key: 'preview.savedDesigns',
    group: 'preview',
    label: 'Saved live preview designs',
    value: [],
  },
];

const PUBLIC_GROUPS = new Set([
  'brand', 'contact', 'hours', 'social', 'footer', 'announcement',
  'payment', 'shipping', 'tax', 'seo', 'store', 'catalog', 'preview', 'about',
]);

/** Keys that must never be exposed to the storefront. */
const PRIVATE_KEYS = new Set<string>(['payment.razorpayKeySecret']);

export type SettingsMap = Record<string, unknown>;

const SETTINGS_TTL_MS = 60_000;
let settingsCache: { value: SettingsMap; expiresAt: number } | null = null;
let settingsInFlight: Promise<SettingsMap> | null = null;
let settingsGeneration = 0;

function clearSettingsCache() {
  settingsGeneration += 1;
  settingsCache = null;
  settingsInFlight = null;
}

/** Reads all settings, merged over the registry defaults. */
export async function getAllSettings(): Promise<SettingsMap> {
  if (settingsCache && settingsCache.expiresAt > Date.now()) return settingsCache.value;
  if (settingsInFlight) return settingsInFlight;

  const startedInGeneration = settingsGeneration;
  const request = prisma.setting.findMany()
    .then((rows) => {
      const map: SettingsMap = {};
      for (const def of SETTING_DEFINITIONS) map[def.key] = def.value;
      for (const row of rows) map[row.key] = row.value;
      if (settingsGeneration === startedInGeneration) {
        settingsCache = { value: map, expiresAt: Date.now() + SETTINGS_TTL_MS };
      }
      return map;
    })
    .finally(() => {
      if (settingsInFlight === request) settingsInFlight = null;
    });

  settingsInFlight = request;
  return request;
}

/** Settings safe to send to the browser. */
export async function getPublicSettings(): Promise<SettingsMap> {
  const all = await getAllSettings();
  const out: SettingsMap = {};
  for (const def of SETTING_DEFINITIONS) {
    if (!PUBLIC_GROUPS.has(def.group)) continue;
    if (PRIVATE_KEYS.has(def.key)) continue;
    out[def.key] = all[def.key];
  }
  // Extra keys added by the admin still flow through if they are in a public group.
  return out;
}

export async function getSetting<T = unknown>(key: string, fallback?: T): Promise<T> {
  const settings = await getAllSettings();
  if (Object.prototype.hasOwnProperty.call(settings, key) && settings[key] !== null) {
    return settings[key] as T;
  }
  return fallback as T;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const def = SETTING_DEFINITIONS.find((d) => d.key === key);
  await prisma.setting.upsert({
    where: { key },
    create: {
      key,
      group: def?.group ?? 'general',
      label: def?.label ?? key,
      value: value as never,
    },
    update: { value: value as never },
  });
  clearSettingsCache();
}

export async function setSettings(values: SettingsMap): Promise<void> {
  const entries = Object.entries(values);
  for (const [key, value] of entries) await setSetting(key, value);
}

/** Writes any missing registry defaults into the database. */
export async function ensureSettingDefaults(): Promise<void> {
  for (const def of SETTING_DEFINITIONS) {
    await prisma.setting.upsert({
      where: { key: def.key },
      create: { key: def.key, group: def.group, label: def.label, value: def.value as never },
      update: { group: def.group, label: def.label },
    });
  }
}

export function numberSetting(map: SettingsMap, key: string, fallback = 0): number {
  const raw = map[key];
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function boolSetting(map: SettingsMap, key: string, fallback = false): boolean {
  const raw = map[key];
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
  return fallback;
}
