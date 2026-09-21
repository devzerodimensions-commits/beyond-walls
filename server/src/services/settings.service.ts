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
  { key: 'brand.logoTagline', group: 'brand', label: 'Logo tagline', value: 'SIGNAGE STUDIO' },
  { key: 'brand.logoImage', group: 'brand', label: 'Logo image (light background)', value: null },
  { key: 'brand.logoImageDark', group: 'brand', label: 'Logo image (dark background)', value: null },
  { key: 'brand.favicon', group: 'brand', label: 'Favicon', value: null },

  // --- Contact ---------------------------------------------------------------
  { key: 'contact.phone', group: 'contact', label: 'Phone', value: '+91 7600738785' },
  { key: 'contact.whatsapp', group: 'contact', label: 'WhatsApp number', value: '+91 7600738785' },
  { key: 'contact.email', group: 'contact', label: 'Email', value: 'info@beyondwall.in' },
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
  { key: 'footer.about', group: 'footer', label: 'Footer about text', value: '' },
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

  // --- SEO -------------------------------------------------------------------
  { key: 'seo.defaultTitle', group: 'seo', label: 'Default page title', value: 'Beyond Walls — Nameplates & Signage, Ahmedabad' },
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
      'Beyond Walls designs and makes nameplates, office branding, GST plates, QR stands, desk plates, prints and safety signage in Ahmedabad.',
  },
  { key: 'seo.defaultKeywords', group: 'seo', label: 'Default meta keywords', value: 'nameplates, signage, Ahmedabad, acrylic name plate, office branding' },
  { key: 'seo.defaultOgImage', group: 'seo', label: 'Default social share image', value: null },
  {
    key: 'seo.siteUrl',
    group: 'seo',
    label: 'Canonical site URL',
    // Inferred from the business email address, NOT confirmed by the client.
    // Every canonical tag, sitemap entry and share link is built from this, so
    // it must be checked before launch — see seo.domainConfirmed.
    value: 'https://beyondwall.in',
  },
  {
    key: 'seo.domainConfirmed',
    group: 'seo',
    label: 'Canonical site URL confirmed',
    value: false,
  },
  { key: 'seo.googleSiteVerification', group: 'seo', label: 'Google site verification token', value: '' },
  { key: 'seo.robots', group: 'seo', label: 'Robots directive', value: 'index, follow' },

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
];

const PUBLIC_GROUPS = new Set([
  'brand', 'contact', 'hours', 'social', 'footer', 'announcement',
  'payment', 'shipping', 'tax', 'seo', 'store',
]);

/** Keys that must never be exposed to the storefront. */
const PRIVATE_KEYS = new Set<string>(['payment.razorpayKeySecret']);

export type SettingsMap = Record<string, unknown>;

/** Reads all settings, merged over the registry defaults. */
export async function getAllSettings(): Promise<SettingsMap> {
  const rows = await prisma.setting.findMany();
  const map: SettingsMap = {};
  for (const def of SETTING_DEFINITIONS) map[def.key] = def.value;
  for (const row of rows) map[row.key] = row.value;
  return map;
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
  const row = await prisma.setting.findUnique({ where: { key } });
  if (row && row.value !== null) return row.value as T;
  const def = SETTING_DEFINITIONS.find((d) => d.key === key);
  if (def) return def.value as T;
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
