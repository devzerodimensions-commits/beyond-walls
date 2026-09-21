import type { PageSection, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { PRODUCT_CARD_SELECT } from '../routes/public/catalog.routes';

/**
 * Page sections.
 *
 * A section describes a block on a page — a hero, a grid of categories, a row
 * of products — but it does not hold the products or categories themselves.
 * Those are looked up when the page is served, so a section keeps working when
 * the catalogue changes underneath it.
 *
 * This used to live inside the /api/home route and could only describe the
 * homepage. It is a service now so the same resolution serves any page, and so
 * the visual builder can preview a page with exactly the data the storefront
 * would receive.
 */

const PUBLISHED = { status: 'PUBLISHED' as const };

/** A section plus whatever it needs to render. */
export type ResolvedSection = PageSection & { items: unknown[] };

/**
 * Every widget an admin can place, with the fields the editor should show.
 *
 * The client renders its form from this, so a new widget is described once,
 * here, rather than in both the API and the admin panel.
 */
export interface WidgetField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'image' | 'number' | 'link' | 'select' | 'products' | 'categories';
  hint?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Fields under `config` rather than on the section row itself. */
  inConfig?: boolean;
}

export interface WidgetDefinition {
  type: PageSection['type'];
  name: string;
  description: string;
  /** Grouping in the widget picker. */
  group: 'Layout' | 'Catalogue' | 'Content' | 'Trust';
  fields: WidgetField[];
  /** Sensible starting content, so a newly added widget is never blank. */
  defaults?: Partial<Pick<PageSection, 'title' | 'subtitle' | 'bodyText' | 'ctaLabel' | 'ctaLink'>> & {
    config?: Record<string, unknown>;
  };
}

/*
 * Field definitions.
 *
 * These describe the storefront components as they actually behave, which is
 * not uniform: most blocks render `subtitle` as the paragraph under the
 * heading, while a few use `bodyText` for it and `subtitle` as a small label
 * above. Naming each field per widget keeps the editor honest — a field
 * labelled "Description" always produces the description.
 */

const TITLE: WidgetField = { key: 'title', label: 'Heading', type: 'text' };
/** The paragraph under the heading, for blocks built on the shared heading. */
const LEAD: WidgetField = { key: 'subtitle', label: 'Description', type: 'textarea' };
/** The paragraph, for blocks that use bodyText for it instead. */
const BODY: WidgetField = { key: 'bodyText', label: 'Description', type: 'textarea' };
/** The small label above the heading, for blocks that draw one. */
const EYEBROW: WidgetField = { key: 'subtitle', label: 'Small text above the heading', type: 'text' };

const CTA: WidgetField[] = [
  { key: 'ctaLabel', label: 'Button text', type: 'text' },
  { key: 'ctaLink', label: 'Button link', type: 'link', placeholder: '/shop' },
];

const LIMIT: WidgetField = {
  key: 'limit',
  label: 'How many to show',
  type: 'number',
  inConfig: true,
  hint: 'Leave blank for the default.',
};

/** Blocks built on the shared heading all take the same two fields. */
const HEADED = [TITLE, LEAD];

export const WIDGETS: WidgetDefinition[] = [
  {
    type: 'HERO',
    name: 'Large banner',
    description: 'A full-width image with a heading and a button.',
    group: 'Layout',
    fields: [
      { key: 'eyebrow', label: 'Small text above the heading', type: 'text', inConfig: true },
      TITLE,
      { key: 'subtitle', label: 'Description', type: 'textarea' },
      { key: 'image', label: 'Background image', type: 'image', inConfig: true },
      ...CTA,
    ],
    defaults: { title: 'A heading for this banner', ctaLabel: 'Shop now', ctaLink: '/shop' },
  },
  {
    type: 'BANNER_SPLIT',
    name: 'Two-up banner',
    description: 'Two banners side by side. Their images come from Banners.',
    group: 'Layout',
    fields: HEADED,
    defaults: { title: 'Two-up banner' },
  },
  {
    type: 'BANNER_WIDE',
    name: 'Wide banner',
    description: 'One wide promotional strip. Its image comes from Banners.',
    group: 'Layout',
    fields: HEADED,
    defaults: { title: 'Wide banner' },
  },
  {
    type: 'SECTION_HEADING',
    name: 'Section title',
    description: 'A heading and a line of text, with nothing else.',
    group: 'Layout',
    fields: HEADED,
    defaults: { title: 'A section heading' },
  },

  {
    type: 'CATEGORY_GRID',
    name: 'Categories',
    description: 'A grid of categories. Leave the picker empty to show top-level ones.',
    group: 'Catalogue',
    fields: [
      ...HEADED,
      {
        key: 'categoryIds',
        label: 'Which categories',
        type: 'categories',
        inConfig: true,
        hint: 'Leave empty to show every top-level category.',
      },
      LIMIT,
    ],
    defaults: { title: 'Shop by category' },
  },
  {
    type: 'FEATURED_PRODUCTS',
    name: 'Products',
    description: 'A row of products. Leave the picker empty to show featured ones.',
    group: 'Catalogue',
    fields: [
      ...HEADED,
      {
        key: 'productIds',
        label: 'Which products',
        type: 'products',
        inConfig: true,
        hint: 'Leave empty to show whatever is marked Featured.',
      },
      LIMIT,
      ...CTA,
    ],
    defaults: { title: 'Featured', ctaLabel: 'View all', ctaLink: '/shop' },
  },
  {
    type: 'SHOP_BY_ATTRIBUTE',
    name: 'Shop by material',
    description: 'A browsable strip of materials, styles or shapes.',
    group: 'Catalogue',
    fields: [
      ...HEADED,
      {
        key: 'groupSlug',
        label: 'Which group',
        type: 'select',
        inConfig: true,
        options: [
          { value: 'material', label: 'Material' },
          { value: 'style', label: 'Style' },
          { value: 'shape', label: 'Shape' },
          { value: 'profession', label: 'Profession' },
          { value: 'requirement', label: 'Requirement' },
        ],
      },
      LIMIT,
    ],
    defaults: { title: 'Shop by material', config: { groupSlug: 'material' } },
  },
  {
    type: 'PERSONALISATION_DEMO',
    name: 'Live preview demo',
    description: 'Lets a visitor try personalising a nameplate before they buy.',
    group: 'Catalogue',
    fields: [
      ...HEADED,
      {
        key: 'productSlug',
        label: 'Which product',
        type: 'text',
        inConfig: true,
        hint: 'Leave blank to use the first product with live preview turned on.',
      },
    ],
    defaults: { title: 'See it before you order' },
  },

  {
    type: 'RICH_TEXT',
    name: 'Text',
    description: 'A heading and a block of text.',
    group: 'Content',
    fields: [TITLE, { key: 'bodyText', label: 'Text', type: 'textarea' }],
    defaults: { title: 'A heading', bodyText: 'Write something here.' },
  },
  {
    type: 'IMAGE_TEXT',
    name: 'Image + text',
    description: 'An image beside a paragraph and a button.',
    group: 'Content',
    fields: [
      EYEBROW,
      TITLE,
      BODY,
      { key: 'image', label: 'Image', type: 'image', inConfig: true },
      {
        key: 'imageSide',
        label: 'Image on the',
        type: 'select',
        inConfig: true,
        options: [
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
        ],
      },
      ...CTA,
    ],
    defaults: { title: 'A heading', config: { imageSide: 'left' } },
  },
  {
    type: 'GALLERY',
    name: 'Gallery',
    description: 'Photos of finished work. Manage the images in Gallery.',
    group: 'Content',
    fields: [...HEADED, LIMIT, ...CTA],
    defaults: { title: 'Recent work', ctaLabel: 'See the gallery', ctaLink: '/gallery' },
  },
  {
    type: 'CTA',
    name: 'Call to action',
    description: 'A short prompt with a button.',
    group: 'Content',
    fields: [TITLE, BODY, ...CTA],
    defaults: { title: 'Ready to start?', ctaLabel: 'Get in touch', ctaLink: '/contact' },
  },
  {
    type: 'CUSTOM_ORDER_CTA',
    name: 'Custom order prompt',
    description: 'Invites a visitor to ask for something made to their own specification.',
    group: 'Content',
    fields: [TITLE, BODY, ...CTA],
    defaults: {
      title: 'Need something made to your own specification?',
      ctaLabel: 'Start a custom order',
      ctaLink: '/custom-order',
    },
  },
  {
    type: 'CONTACT_BLOCK',
    name: 'Contact box',
    description: 'Your address, phone and hours, taken from Settings.',
    group: 'Content',
    fields: [EYEBROW, TITLE, BODY],
    defaults: { title: 'Visit the studio' },
  },

  {
    type: 'USP_STRIP',
    name: 'Benefits',
    description: 'A row of short promises.',
    group: 'Trust',
    fields: [
      TITLE,
      {
        key: 'items',
        label: 'One benefit per line',
        type: 'textarea',
        inConfig: true,
        hint: 'For example: Made in Ahmedabad',
      },
    ],
    defaults: { config: { items: [] } },
  },
  {
    type: 'TESTIMONIALS',
    name: 'Reviews',
    description: 'Customer quotes. Manage them in Testimonials.',
    group: 'Trust',
    fields: [...HEADED, LIMIT],
    defaults: { title: 'What our customers say' },
  },
  {
    type: 'FAQ',
    name: 'Questions',
    description: 'Frequently asked questions. Manage them in FAQs.',
    group: 'Trust',
    fields: [
      ...HEADED,
      {
        key: 'group',
        label: 'Only show this group',
        type: 'text',
        inConfig: true,
        hint: 'Leave blank to show all.',
      },
      LIMIT,
    ],
    defaults: { title: 'Frequently asked questions' },
  },
];

export const WIDGETS_BY_TYPE = new Map(WIDGETS.map((w) => [w.type, w]));

/**
 * Ready-made page layouts. One click builds a whole page rather than making an
 * admin place a dozen widgets and guess the order.
 */
export interface PageLayout {
  key: string;
  name: string;
  description: string;
  sections: PageSection['type'][];
}

export const PAGE_LAYOUTS: PageLayout[] = [
  {
    key: 'home',
    name: 'Complete home page',
    description: 'Banner, categories, materials, products, custom orders, gallery, reviews and questions.',
    sections: [
      'HERO', 'USP_STRIP', 'CATEGORY_GRID', 'SHOP_BY_ATTRIBUTE', 'FEATURED_PRODUCTS',
      'CUSTOM_ORDER_CTA', 'GALLERY', 'PERSONALISATION_DEMO', 'TESTIMONIALS', 'FAQ',
    ],
  },
  {
    key: 'landing',
    name: 'Collection landing page',
    description: 'A banner, the products, why buy from you, and a prompt to get in touch.',
    sections: ['HERO', 'FEATURED_PRODUCTS', 'USP_STRIP', 'GALLERY', 'CTA'],
  },
  {
    key: 'about',
    name: 'About page',
    description: 'A banner, your story, what you stand for, recent work and contact details.',
    sections: ['HERO', 'IMAGE_TEXT', 'USP_STRIP', 'GALLERY', 'CONTACT_BLOCK'],
  },
  {
    key: 'policy',
    name: 'Policy page',
    description: 'A heading, the text itself, and questions.',
    sections: ['SECTION_HEADING', 'RICH_TEXT', 'FAQ'],
  },
  {
    key: 'contact',
    name: 'Contact page',
    description: 'A heading, your details, and frequently asked questions.',
    sections: ['SECTION_HEADING', 'CONTACT_BLOCK', 'FAQ'],
  },
];

/**
 * Looks up whatever each section needs to render, in one pass.
 *
 * `preview` includes draft sections and draft catalogue entries, so the builder
 * shows an admin what they are working on rather than only what is live.
 */
export async function resolveSections(
  sections: PageSection[],
  options: { preview?: boolean; pageSlug?: string } = {},
): Promise<ResolvedSection[]> {
  const visibility = options.preview ? {} : PUBLISHED;
  /*
   * The banner placements are called HOME_HERO, HOME_SPLIT and HOME_WIDE — they
   * describe the homepage and nothing else. Before the builder there was only
   * one page, so that distinction did not matter; now a hero placed on an About
   * page must not quietly inherit the homepage's banner.
   */
  const usesBanners = options.pageSlug === 'home';

  return Promise.all(
    sections.map(async (section): Promise<ResolvedSection> => {
      const config = (section.config ?? {}) as Record<string, unknown>;
      const limit = Number(config.limit) || 8;

      switch (section.type) {
        case 'HERO':
        case 'BANNER_SPLIT':
        case 'BANNER_WIDE': {
          // Anywhere but the homepage, a banner block is built from its own
          // fields alone.
          if (!usesBanners) return { ...section, items: [] };

          const placement =
            section.type === 'HERO' ? 'HOME_HERO' : section.type === 'BANNER_SPLIT' ? 'HOME_SPLIT' : 'HOME_WIDE';
          const now = new Date();
          const banners = await prisma.banner.findMany({
            where: {
              ...visibility,
              placement,
              AND: [
                { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
              ],
            },
            orderBy: { sortOrder: 'asc' },
          });
          return { ...section, items: banners };
        }

        case 'CATEGORY_GRID': {
          const ids = (config.categoryIds as string[] | undefined) ?? [];
          const categories = await prisma.category.findMany({
            where: ids.length ? { id: { in: ids }, ...visibility } : { ...visibility, parentId: null },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            take: ids.length ? undefined : limit,
            include: { _count: { select: { products: true } } },
          });
          // Preserve the admin-chosen order when explicit ids are configured.
          const ordered = ids.length
            ? ids.map((id) => categories.find((c) => c.id === id)).filter(Boolean)
            : categories;
          return { ...section, items: ordered };
        }

        case 'FEATURED_PRODUCTS': {
          const ids = (config.productIds as string[] | undefined) ?? [];
          const products = await prisma.product.findMany({
            where: ids.length ? { id: { in: ids }, ...visibility } : { ...visibility, featured: true },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
            take: ids.length ? undefined : limit,
            select: PRODUCT_CARD_SELECT,
          });
          const ordered = ids.length
            ? ids.map((id) => products.find((p) => p.id === id)).filter(Boolean)
            : products;
          return { ...section, items: ordered };
        }

        case 'SHOP_BY_ATTRIBUTE': {
          const groupSlug = String(config.groupSlug ?? 'material');
          const group = await prisma.attributeGroup.findFirst({
            where: { slug: groupSlug, ...visibility },
            include: {
              values: {
                where: visibility,
                orderBy: { sortOrder: 'asc' },
                include: { _count: { select: { products: true } } },
              },
            },
          });
          if (!group) return { ...section, items: [] };

          return {
            ...section,
            items: group.values.slice(0, limit).map((value) => ({
              id: value.id,
              name: value.name,
              slug: value.slug,
              hexColor: value.hexColor,
              image: value.image,
              count: value._count.products,
              groupSlug: group.slug,
            })),
          };
        }

        case 'PERSONALISATION_DEMO': {
          const slug = config.productSlug ? String(config.productSlug) : null;
          const product = await prisma.product.findFirst({
            where: {
              ...visibility,
              livePreviewEnabled: true,
              ...(slug ? { slug } : {}),
            },
            orderBy: { sortOrder: 'asc' },
            include: {
              images: { orderBy: { sortOrder: 'asc' }, take: 1 },
              personalization: { where: visibility, orderBy: { sortOrder: 'asc' } },
            },
          });
          return { ...section, items: product ? [product] : [] };
        }

        case 'GALLERY': {
          const items = await prisma.galleryItem.findMany({
            where: visibility,
            orderBy: { sortOrder: 'asc' },
            take: limit,
          });
          return { ...section, items };
        }

        case 'TESTIMONIALS': {
          const items = await prisma.testimonial.findMany({
            where: visibility,
            orderBy: { sortOrder: 'asc' },
            take: limit,
          });
          return { ...section, items };
        }

        case 'FAQ': {
          const items = await prisma.faq.findMany({
            where: { ...visibility, ...(config.group ? { group: String(config.group) } : {}) },
            orderBy: { sortOrder: 'asc' },
            take: limit,
          });
          return { ...section, items };
        }

        case 'USP_STRIP': {
          // The benefits are written straight into the section, one per line.
          const raw = config.items;
          const items = Array.isArray(raw)
            ? raw
            : String(raw ?? '')
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean);
          return { ...section, items };
        }

        default:
          return { ...section, items: [] };
      }
    }),
  );
}

/** Loads a page by slug and resolves its sections in one go. */
export async function getPageWithSections(slug: string, options: { preview?: boolean } = {}) {
  const page = await prisma.page.findUnique({
    where: { slug },
    include: {
      sections: {
        where: options.preview ? {} : PUBLISHED,
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!page) return null;
  if (!options.preview && page.status !== 'PUBLISHED') return null;

  const sections = await resolveSections(page.sections, { ...options, pageSlug: page.slug });
  return { ...page, sections };
}

/** Appends the widgets of a ready-made layout to a page. */
export async function applyLayout(pageId: string, layoutKey: string, replace: boolean) {
  const layout = PAGE_LAYOUTS.find((l) => l.key === layoutKey);
  if (!layout) return null;

  if (replace) {
    await prisma.pageSection.deleteMany({ where: { pageId } });
  }

  const existing = replace
    ? 0
    : await prisma.pageSection.count({ where: { pageId } });

  await prisma.pageSection.createMany({
    data: layout.sections.map((type, index) => {
      const widget = WIDGETS_BY_TYPE.get(type);
      const defaults = widget?.defaults ?? {};
      const { config, ...rest } = defaults;
      return {
        pageId,
        type,
        sortOrder: existing + index,
        status: 'PUBLISHED' as const,
        ...rest,
        config: (config ?? {}) as Prisma.InputJsonValue,
      };
    }),
  });

  return prisma.pageSection.findMany({ where: { pageId }, orderBy: { sortOrder: 'asc' } });
}
