/**
 * Beyond Walls — database seed.
 *
 * Seeds ONLY what the client supplied:
 *   - the category / filter taxonomy from "Website Categories.pdf"
 *   - the two products written up in "Product catalogue.pdf"
 *     (No Smoking Sign, Minimal Acrylic Name Plate) with their real copy
 *   - the real business contact details, address and opening hours
 *
 * PRICES: catalogue products are direct-purchase, so a published product must
 * have a resolvable price. No prices were supplied in the brief, so the two
 * products carry PLACEHOLDER prices flagged with `priceConfirmed: false`. The
 * admin dashboard shows a banner listing every unconfirmed price until the
 * owner reviews it. Nothing else is invented.
 *
 * Deliberately NOT seeded, because it was not supplied and must not be invented:
 *   - reviews / testimonials
 *   - offers, coupons, marketing claims
 *   - policy copy   → policy pages are created as DRAFTS with a placeholder
 *                     telling the owner to write them. Drafts are not public.
 *
 * Safe to re-run: everything is upserted by a stable key.
 */

import { PrismaClient, type ContentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();

const PUBLISHED: ContentStatus = 'PUBLISHED';
const DRAFT: ContentStatus = 'DRAFT';

function log(step: string, detail = '') {
  // eslint-disable-next-line no-console
  console.log(`  ${step.padEnd(28)} ${detail}`);
}

// ---------------------------------------------------------------------------
// 1. Admin account
// ---------------------------------------------------------------------------
async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@beyondwall.in').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
  const name = process.env.SEED_ADMIN_NAME ?? 'Beyond Walls Admin';

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, role: 'ADMIN', passwordHash: await bcrypt.hash(password, 12) },
    update: { role: 'ADMIN', isActive: true },
  });

  log('admin account', email);
  return user;
}

// ---------------------------------------------------------------------------
// 2. Settings
// ---------------------------------------------------------------------------
async function seedSettings() {
  const { SETTING_DEFINITIONS } = await import('../src/services/settings.service');
  for (const def of SETTING_DEFINITIONS) {
    await prisma.setting.upsert({
      where: { key: def.key },
      create: { key: def.key, group: def.group, label: def.label, value: def.value as never },
      update: { group: def.group, label: def.label },
    });
  }
  await repairBudgetBands();
  log('settings', `${SETTING_DEFINITIONS.length} keys`);
}

/**
 * One-time repair for stores seeded before the Premium band gained an
 * exclusive lower bound: a product priced exactly 2,499 used to appear in both
 * "Under 2,499" and "Premium". Only the missing flag is added, so any label or
 * threshold an admin has edited is left alone.
 */
async function repairBudgetBands() {
  const row = await prisma.setting.findUnique({ where: { key: 'store.budgetBands' } });
  if (!Array.isArray(row?.value)) return;

  const bands = row.value as Array<Record<string, unknown>>;
  const premium = bands.find((b) => b.slug === 'premium');
  if (!premium || premium.minExclusive === true) return;

  premium.minExclusive = true;
  await prisma.setting.update({
    where: { key: 'store.budgetBands' },
    data: { value: bands as never },
  });
  log('settings', 'budget bands: Premium no longer overlaps Under 2,499');
}

// ---------------------------------------------------------------------------
// 3. Categories — from "Website Categories.pdf"
// ---------------------------------------------------------------------------
interface CategorySeed {
  slug: string;
  name: string;
  shortText?: string;
  description?: string;
  image?: string;
  seoTitle?: string;
  seoDescription?: string;
  children?: CategorySeed[];
}

const CATEGORY_TREE: CategorySeed[] = [
  {
    slug: 'for-home',
    name: 'For Home',
    shortText: 'Nameplates for homes, apartments and villas.',
    description:
      'Nameplates for home entrances, apartments, villas and bungalows. Choose by material, style and shape, and personalise the plate with your family name and house number.',
    image: '/uploads/products/minimal-acrylic-name-plate-2.png',
    seoTitle: 'Home Nameplates in Ahmedabad | Beyond Walls',
    seoDescription:
      'Personalised home nameplates in stainless steel, acrylic and mild steel. Minimal, traditional, modern and experimental styles in rectangle, square, oval and circle shapes.',
  },
  {
    slug: 'for-offices',
    name: 'For Offices',
    shortText: 'Office nameplates, branding, GST plates, QR stands and desk plates.',
    description:
      'Signage for offices, clinics and retail spaces — office branding, GST plates, QR stands and desk plates, made for doctors, chartered accountants, advocates, corporations and retail stores.',
    seoTitle: 'Office Nameplates & Branding in Ahmedabad | Beyond Walls',
    seoDescription:
      'Office nameplates, branding, GST plates, QR stands and desk plates in stainless steel, acrylic and mild steel.',
    children: [
      {
        slug: 'office-branding',
        name: 'Office Branding',
        shortText: 'Reception logos, wall branding and door signage.',
        description: 'Branding elements for office receptions, doors and walls.',
      },
      {
        slug: 'gst-plates',
        name: 'GST Plates',
        shortText: 'GSTIN display plates for business premises.',
        description: 'Plates that display your GSTIN clearly at your place of business.',
      },
      {
        slug: 'qr-stands',
        name: 'QR Stands',
        shortText: 'Table-top and wall-mounted QR code stands.',
        description: 'QR stands for payments, menus, reviews and digital links.',
      },
      {
        slug: 'desk-plates',
        name: 'Desk Plates',
        shortText: 'Desk name and designation plates.',
        description: 'Desk plates showing a name, designation and degree.',
      },
    ],
  },
  {
    slug: 'prints',
    name: 'Prints',
    shortText: 'Canvas and matte paper prints.',
    description:
      'Prints on canvas and matte paper — minimal, abstract and fully custom artwork for house warmings, birthdays and gifts.',
    seoTitle: 'Canvas & Matte Paper Prints | Beyond Walls',
    seoDescription: 'Minimal, abstract and custom prints on canvas and matte paper.',
    children: [
      { slug: 'minimal-prints', name: 'Minimal Prints', shortText: 'Clean, understated artwork.' },
      { slug: 'abstract-prints', name: 'Abstract Prints', shortText: 'Abstract forms and compositions.' },
      { slug: 'custom-prints', name: 'Custom Prints', shortText: 'Your own artwork, printed to order.' },
    ],
  },
  {
    slug: 'informative-signs',
    name: 'Informative Signs',
    shortText: 'Prohibition, way finding and mandatory signage.',
    description:
      'Informative and safety signage in acrylic, stainless steel and foam board for offices, commercial complexes and restaurants.',
    image: '/uploads/products/no-smoking-sign-3.png',
    seoTitle: 'Safety & Informative Signs in Ahmedabad | Beyond Walls',
    seoDescription:
      'Prohibition signs, way finding and mandatory signage in acrylic, stainless steel and foam board.',
    children: [
      {
        slug: 'prohibition-signs',
        name: 'Prohibition Signs',
        shortText: 'No smoking, no entry and other restrictions.',
        description: 'Signs that communicate what is not permitted in a space.',
      },
      {
        slug: 'way-finding',
        name: 'Way Finding',
        shortText: 'Directional and location signage.',
        description: 'Signage that helps people navigate a building or complex.',
      },
      {
        slug: 'mandatory-signs',
        name: 'Mandatory Signs',
        shortText: 'Signage for required actions.',
        description: 'Signs that communicate an action people must take.',
      },
    ],
  },
];

async function seedCategories() {
  const ids = new Map<string, string>();
  let order = 0;

  for (const parent of CATEGORY_TREE) {
    const created = await prisma.category.upsert({
      where: { slug: parent.slug },
      create: {
        slug: parent.slug,
        name: parent.name,
        shortText: parent.shortText ?? null,
        description: parent.description ?? null,
        image: parent.image ?? null,
        status: PUBLISHED,
        showInMenu: true,
        featured: true,
        sortOrder: order,
        seoTitle: parent.seoTitle ?? null,
        seoDescription: parent.seoDescription ?? null,
      },
      update: {
        name: parent.name,
        shortText: parent.shortText ?? null,
        description: parent.description ?? null,
        sortOrder: order,
      },
    });
    ids.set(parent.slug, created.id);
    order += 1;

    let childOrder = 0;
    for (const child of parent.children ?? []) {
      const createdChild = await prisma.category.upsert({
        where: { slug: child.slug },
        create: {
          slug: child.slug,
          name: child.name,
          shortText: child.shortText ?? null,
          description: child.description ?? null,
          parentId: created.id,
          status: PUBLISHED,
          showInMenu: true,
          sortOrder: childOrder,
        },
        update: {
          name: child.name,
          shortText: child.shortText ?? null,
          description: child.description ?? null,
          parentId: created.id,
          sortOrder: childOrder,
        },
      });
      ids.set(child.slug, createdChild.id);
      childOrder += 1;
    }
  }

  log('categories', `${ids.size} created/updated`);
  return ids;
}

// ---------------------------------------------------------------------------
// 4. Attribute groups & values — the filter rails from the categories PDF
// ---------------------------------------------------------------------------
const ATTRIBUTE_GROUPS = [
  {
    slug: 'material',
    name: 'Material',
    kind: 'MATERIAL' as const,
    values: [
      'Stainless Steel',
      'Acrylic',
      'Mild Steel',
      'Canvas',
      'Matte Paper',
      'Foam Board',
    ],
  },
  {
    slug: 'style',
    name: 'Style',
    kind: 'STYLE' as const,
    values: ['Minimal', 'Traditional', 'Modern', 'Experimental'],
  },
  {
    slug: 'shape',
    name: 'Shape',
    kind: 'SHAPE' as const,
    values: ['Rectangle', 'Square', 'Oval', 'Circle'],
  },
  {
    slug: 'profession',
    name: 'Profession',
    kind: 'PROFESSION' as const,
    values: ['Doctor', 'CA', 'Advocate', 'Corporation', 'Retail Store'],
  },
  {
    slug: 'requirement',
    name: 'Requirement',
    kind: 'REQUIREMENT' as const,
    values: [
      'Office Branding',
      'GST Plates',
      'QR Stands',
      'Desk Plates',
      'For Offices',
      'Commercial Complexes',
      'For Restaurants',
    ],
  },
  {
    slug: 'occasion',
    name: 'Occasion',
    kind: 'OCCASION' as const,
    values: ['House Warming', 'Birthday Gift', 'Gift for Partner'],
  },
];

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function seedAttributes() {
  const valueIds = new Map<string, string>(); // "group:value-slug" -> id
  let groupOrder = 0;

  for (const group of ATTRIBUTE_GROUPS) {
    const createdGroup = await prisma.attributeGroup.upsert({
      where: { slug: group.slug },
      create: {
        slug: group.slug,
        name: group.name,
        kind: group.kind,
        status: PUBLISHED,
        showInFilter: true,
        multiSelect: true,
        sortOrder: groupOrder,
      },
      update: { name: group.name, kind: group.kind, sortOrder: groupOrder },
    });
    groupOrder += 1;

    let valueOrder = 0;
    for (const value of group.values) {
      const slug = slugify(value);
      const created = await prisma.attributeValue.upsert({
        where: { groupId_slug: { groupId: createdGroup.id, slug } },
        create: {
          groupId: createdGroup.id,
          name: value,
          slug,
          status: PUBLISHED,
          sortOrder: valueOrder,
        },
        update: { name: value, sortOrder: valueOrder },
      });
      valueIds.set(`${group.slug}:${slug}`, created.id);
      valueOrder += 1;
    }
  }

  log('attributes', `${ATTRIBUTE_GROUPS.length} groups, ${valueIds.size} values`);
  return valueIds;
}

// ---------------------------------------------------------------------------
// 5. Products — the two products written up in "Product catalogue.pdf"
// ---------------------------------------------------------------------------
async function seedProducts(
  categoryIds: Map<string, string>,
  attributeIds: Map<string, string>,
) {
  // ---- 5a. No Smoking Sign ------------------------------------------------
  const noSmoking = await prisma.product.upsert({
    where: { slug: 'no-smoking-sign' },
    update: {},
    create: {
      slug: 'no-smoking-sign',
      name: 'No Smoking Sign',
      sku: 'BW-SIGN-NS-001',
      categoryId: categoryIds.get('informative-signs'),
      subcategoryId: categoryIds.get('prohibition-signs'),
      shortDescription:
        'Acrylic no smoking sign with UV-printed graphics, for offices, hotels, restaurants, hospitals and public areas.',
      description:
        'Make your no-smoking policy clear with a bold and easy-to-understand No Smoking Sign, designed for offices, commercial spaces, hotels, restaurants, hospitals, and other public areas. The sign features a clear prohibition symbol paired with highly visible typography for quick recognition.\n\nMade from high-quality acrylic with UV printing, the design delivers sharp graphics, strong colour contrast, and a clean professional finish.',
      designNote:
        'The sign combines the universally recognised No Smoking symbol with clear, bold lettering, making the message instantly understandable and easy to spot.',
      materialNote:
        'The sign is made using premium acrylic with UV-printed graphics. UV printing provides a crisp, detailed finish while keeping the design firmly printed onto the surface.',
      careInstructions:
        'Simply wipe the surface gently with a soft, clean cloth to keep the sign looking neat and clear.',
      applications: [
        'Offices & commercial spaces',
        'Hotels & restaurants',
        'Hospitals & clinics',
        'Schools & institutions',
        'Residential societies',
        'Public & restricted areas',
      ],
      features: [
        'Universally recognised No Smoking symbol',
        'UV-printed graphics on premium acrylic',
        'High colour contrast for quick recognition',
        'Clean, professional finish',
      ],
      widthInches: 6.5,
      heightInches: 7,
      /*
       * PLACEHOLDER PRICE — review before launch.
       * No prices were supplied in the brief, but catalogue products are
       * direct-purchase, so a product cannot be published without one.
       *  flags this in the admin dashboard until the
       * owner reviews it.
       */
      price: 649,
      priceConfirmed: false,
      trackInventory: true,
      stock: 40,
      lowStockAlert: 5,
      status: PUBLISHED,
      featured: true,
      publishedAt: new Date(),
      sortOrder: 1,
      livePreviewEnabled: false,
      seoTitle: 'No Smoking Sign — Acrylic, UV Printed | Beyond Walls',
      seoDescription:
        'Acrylic No Smoking sign with UV-printed graphics for offices, hotels, restaurants, hospitals and public areas. 6.5 x 7 inches.',
      seoKeywords: 'no smoking sign, prohibition sign, acrylic sign, safety signage, Ahmedabad',
      images: {
        create: [
          { url: '/uploads/products/no-smoking-sign-1.png', alt: 'No Smoking Sign in acrylic', sortOrder: 0, isPrimary: true },
          { url: '/uploads/products/no-smoking-sign-2.png', alt: 'No Smoking Sign dimensions: 6.5 x 7 inches', sortOrder: 1 },
          { url: '/uploads/products/no-smoking-sign-3.png', alt: 'No Smoking Sign mounted in a meeting room', sortOrder: 2 },
        ],
      },
      variants: {
        create: [
          {
            label: '6.5 x 7 inches — Acrylic',
            sku: 'BW-SIGN-NS-001-65X7',
            options: { Size: '6.5 x 7 in', Material: 'Acrylic' },
            stock: 40,
            isDefault: true,
            sortOrder: 0,
            status: PUBLISHED,
          },
        ],
      },
      personalization: {
        create: [
          {
            key: 'mountingType',
            label: 'Mounting',
            type: 'SELECT',
            required: false,
            helpText: 'How the sign will be fixed to the surface.',
            options: [
              { label: 'Adhesive backing', value: 'adhesive' },
              { label: 'Screw mount', value: 'screw' },
            ],
            defaultValue: 'adhesive',
            sortOrder: 0,
            status: PUBLISHED,
          },
          {
            key: 'instructions',
            label: 'Instructions for us',
            type: 'TEXTAREA',
            required: false,
            placeholder: 'Anything we should know about this order',
            maxLength: 500,
            sortOrder: 1,
            status: PUBLISHED,
          },
        ],
      },
    },
  });

  // Attributes: acrylic material, for offices / commercial complexes / restaurants
  const noSmokingAttrs = [
    'material:acrylic',
    'requirement:for-offices',
    'requirement:commercial-complexes',
    'requirement:for-restaurants',
    'shape:square',
  ]
    .map((key) => attributeIds.get(key))
    .filter((v): v is string => Boolean(v));

  await prisma.productAttribute.deleteMany({ where: { productId: noSmoking.id } });
  await prisma.productAttribute.createMany({
    data: noSmokingAttrs.map((valueId) => ({ productId: noSmoking.id, valueId })),
    skipDuplicates: true,
  });

  // ---- 5b. Minimal Acrylic Name Plate ------------------------------------
  const namePlate = await prisma.product.upsert({
    where: { slug: 'minimal-acrylic-name-plate' },
    update: {},
    create: {
      slug: 'minimal-acrylic-name-plate',
      name: 'Minimal Acrylic Name Plate',
      sku: 'BW-HOME-NP-001',
      categoryId: categoryIds.get('for-home'),
      shortDescription:
        'A minimal acrylic name plate with crisp typography, weather proof and suitable for indoor and outdoor entrances.',
      description:
        'Keep your entrance clean, refined, and easy to identify with this minimal acrylic name plate. Designed with a simple layout and crisp typography, it adds a sophisticated touch to modern homes, apartments, offices, and other spaces.\n\nMade from high-quality acrylic, the name plate offers a sleek finish and a durable construction. Its weather-resistant design makes it suitable for both indoor and outdoor use.',
      designNote:
        'A clean, minimalist layout with bold white typography on a black acrylic surface. The understated design complements contemporary architecture without overpowering the entrance.',
      materialNote:
        'Made with premium-quality acrylic, offering a smooth, sleek surface and a professional finish. The material is durable and weather proof, making it suitable for outdoor entrances.',
      careInstructions:
        'Clean gently with a soft, dry or slightly damp cloth. Avoid abrasive cleaners and rough materials that may scratch the acrylic surface.',
      applications: [
        'Home & apartment entrances',
        'Villas & bungalows',
        'Office doors',
        'Commercial spaces',
        'Residential societies',
        'Outdoor entrances',
      ],
      features: [
        'Minimal & elegant design',
        'Weather proof',
        'Durable acrylic material',
        'Suitable for indoor & outdoor use',
        'Easy to install',
      ],
      // PLACEHOLDER PRICE — see the note on the No Smoking Sign above.
      price: 1499,
      priceConfirmed: false,
      trackInventory: true,
      stock: 25,
      lowStockAlert: 5,
      status: PUBLISHED,
      featured: true,
      isNew: true,
      publishedAt: new Date(),
      sortOrder: 0,
      // This product drives the live nameplate preview on the product page.
      livePreviewEnabled: true,
      livePreviewTemplate: 'nameplate-minimal',
      seoTitle: 'Minimal Acrylic Name Plate — Personalised | Beyond Walls',
      seoDescription:
        'Personalised minimal acrylic name plate with crisp typography. Weather proof, suitable for indoor and outdoor entrances. Made in Ahmedabad.',
      seoKeywords:
        'acrylic name plate, minimal name plate, house name plate, personalised nameplate, Ahmedabad',
      images: {
        create: [
          {
            url: '/uploads/products/minimal-acrylic-name-plate-1.png',
            alt: 'Minimal acrylic name plate with house number and family name',
            sortOrder: 0,
            isPrimary: true,
          },
          {
            url: '/uploads/products/minimal-acrylic-name-plate-2.png',
            alt: 'Minimal acrylic name plate mounted beside a front door',
            sortOrder: 1,
          },
          {
            url: '/uploads/products/minimal-acrylic-name-plate-3.png',
            alt: 'Minimal acrylic name plate on a console table',
            sortOrder: 2,
          },
        ],
      },
      variants: {
        create: [
          {
            label: '12 x 6 inches — Acrylic',
            sku: 'BW-HOME-NP-001-12X6',
            options: { Size: '12 x 6 in', Material: 'Acrylic' },
            stock: 25,
            isDefault: true,
            sortOrder: 0,
            status: PUBLISHED,
          },
          {
            label: '15 x 7 inches — Acrylic',
            sku: 'BW-HOME-NP-001-15X7',
            options: { Size: '15 x 7 in', Material: 'Acrylic' },
            // Larger size carries its own price, overriding the base.
            price: 1899,
            stock: 15,
            sortOrder: 1,
            status: PUBLISHED,
          },
        ],
      },
      personalization: {
        create: [
          {
            key: 'houseNumber',
            label: 'House / flat number',
            type: 'TEXT',
            required: false,
            placeholder: 'A 01',
            maxLength: 10,
            helpText: 'Shown in the top line of the plate.',
            previewSlot: 'number',
            sortOrder: 0,
            status: PUBLISHED,
          },
          {
            key: 'name',
            label: 'Name',
            type: 'TEXT',
            required: true,
            placeholder: 'Ayush & Twinkle',
            maxLength: 28,
            helpText: 'First names, or both names for a couple.',
            previewSlot: 'line1',
            sortOrder: 1,
            status: PUBLISHED,
          },
          {
            key: 'familyName',
            label: 'Family name',
            type: 'TEXT',
            required: false,
            placeholder: 'Shah',
            maxLength: 20,
            previewSlot: 'line2',
            sortOrder: 2,
            status: PUBLISHED,
          },
          {
            key: 'font',
            label: 'Font',
            type: 'FONT',
            required: false,
            options: [
              { label: 'Grotesque (as shown)', value: 'grotesque' },
              { label: 'Serif', value: 'serif' },
              { label: 'Condensed', value: 'condensed' },
            ],
            defaultValue: 'grotesque',
            previewSlot: 'fontFamily',
            sortOrder: 3,
            status: PUBLISHED,
          },
          {
            key: 'plateColour',
            label: 'Plate colour',
            type: 'COLOR',
            required: false,
            options: [
              { label: 'Black', value: 'black', hex: '#111111' },
              { label: 'White', value: 'white', hex: '#F5F5F3' },
            ],
            defaultValue: 'black',
            previewSlot: 'plateColor',
            sortOrder: 4,
            status: PUBLISHED,
          },
          {
            key: 'textColour',
            label: 'Text colour',
            type: 'COLOR',
            required: false,
            options: [
              { label: 'White', value: 'white', hex: '#FFFFFF' },
              { label: 'Black', value: 'black', hex: '#111111' },
            ],
            defaultValue: 'white',
            previewSlot: 'textColor',
            sortOrder: 5,
            status: PUBLISHED,
          },
          {
            key: 'logoUpload',
            label: 'Logo (optional)',
            type: 'IMAGE_UPLOAD',
            required: false,
            helpText: 'PNG or SVG with a transparent background works best.',
            previewSlot: 'logo',
            sortOrder: 6,
            status: PUBLISHED,
          },
          {
            key: 'instructions',
            label: 'Instructions for us',
            type: 'TEXTAREA',
            required: false,
            placeholder: 'Spelling, spacing, or anything else we should know',
            maxLength: 500,
            sortOrder: 7,
            status: PUBLISHED,
          },
        ],
      },
    },
  });

  // Attributes from the catalogue: Acrylic, Minimal, Rectangle
  const namePlateAttrs = ['material:acrylic', 'style:minimal', 'shape:rectangle']
    .map((key) => attributeIds.get(key))
    .filter((v): v is string => Boolean(v));

  await prisma.productAttribute.deleteMany({ where: { productId: namePlate.id } });
  await prisma.productAttribute.createMany({
    data: namePlateAttrs.map((valueId) => ({ productId: namePlate.id, valueId })),
    skipDuplicates: true,
  });

  // Keep placeholder pricing in sync on re-runs (skipped once confirmed).
  await syncPlaceholderPricing('no-smoking-sign', { price: 649, stock: 40 });
  await syncPlaceholderPricing('minimal-acrylic-name-plate', {
    price: 1499,
    stock: 25,
    variantPrices: { '15 x 7 inches — Acrylic': 1899 },
  });

  log('products', '2 products (placeholder prices — review in admin)');
  return { noSmoking, namePlate };
}


/**
 * Placeholder pricing is re-applied on every seed run ONLY while the owner has
 * not confirmed it. Once  is true the real price is left alone,
 * so re-seeding can never overwrite the owner's work.
 */
async function syncPlaceholderPricing(
  slug: string,
  pricing: { price: number; stock: number; variantPrices?: Record<string, number> },
) {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: { variants: true },
  });
  if (!product || product.priceConfirmed) return;

  await prisma.product.update({
    where: { id: product.id },
    data: {
      price: pricing.price,
      trackInventory: true,
      stock: pricing.stock,
      lowStockAlert: 5,
    },
  });

  for (const variant of product.variants) {
    const override = pricing.variantPrices?.[variant.label];
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { stock: pricing.stock, ...(override !== undefined ? { price: override } : {}) },
    });
  }
}

// ---------------------------------------------------------------------------
// 6. Media library — register the supplied images
// ---------------------------------------------------------------------------
async function seedMedia() {
  const files = [
    'minimal-acrylic-name-plate-1.png',
    'minimal-acrylic-name-plate-2.png',
    'minimal-acrylic-name-plate-3.png',
    'no-smoking-sign-1.png',
    'no-smoking-sign-2.png',
    'no-smoking-sign-3.png',
  ];

  for (const filename of files) {
    const url = `/uploads/products/${filename}`;
    await prisma.mediaAsset.upsert({
      where: { url },
      create: { url, filename, mimeType: 'image/png', size: 0, folder: 'products' },
      update: {},
    });
  }
  log('media library', `${files.length} assets`);
}

// ---------------------------------------------------------------------------
// 7. Homepage sections + banners + gallery
// ---------------------------------------------------------------------------
async function seedHomepage() {
  const sections = [
    {
      key: 'hero',
      type: 'HERO' as const,
      title: 'Nameplates & signage',
      subtitle:
        'Home nameplates, office branding, GST plates, QR stands, desk plates, prints and safety signage.',
      ctaLabel: 'Browse the shop',
      ctaLink: '/shop',
      sortOrder: 0,
      status: PUBLISHED,
      config: {},
    },
    {
      key: 'usp-strip',
      type: 'USP_STRIP' as const,
      sortOrder: 1,
      status: PUBLISHED,
      config: {
        items: [
          { title: 'Personalised', text: 'Names, numbers, logos and artwork set on the plate before it is made.' },
          { title: 'Made to order', text: 'Every piece is produced for the specification you send us.' },
          { title: 'Studio in Ahmedabad', text: 'Prime Center Mall, Mirzapur — open Monday to Saturday.' },
        ],
      },
    },
    {
      key: 'categories',
      type: 'CATEGORY_GRID' as const,
      title: 'Shop by category',
      subtitle: 'For homes, offices, prints and signage.',
      sortOrder: 2,
      status: PUBLISHED,
      config: { limit: 6 },
    },
    {
      key: 'featured',
      type: 'FEATURED_PRODUCTS' as const,
      title: 'Featured',
      subtitle: 'A selection from the catalogue.',
      ctaLabel: 'View all products',
      ctaLink: '/shop',
      sortOrder: 3,
      status: PUBLISHED,
      config: { limit: 8 },
    },
    {
      key: 'custom-order-cta',
      type: 'CUSTOM_ORDER_CTA' as const,
      title: 'Need something made to your own specification?',
      bodyText:
        'Send us your requirement, sizes and artwork. We will come back to you with a quote.',
      ctaLabel: 'Start a custom order',
      ctaLink: '/custom-order',
      sortOrder: 4,
      status: PUBLISHED,
      config: {},
    },
    {
      key: 'gallery',
      type: 'GALLERY' as const,
      title: 'Recent work',
      sortOrder: 5,
      status: PUBLISHED,
      config: { limit: 8 },
    },
    {
      key: 'testimonials',
      type: 'TESTIMONIALS' as const,
      title: 'What our customers say',
      sortOrder: 6,
      // Draft: no testimonials were supplied, so this stays hidden until the
      // owner adds real ones in Admin → Testimonials.
      status: DRAFT,
      config: { limit: 6 },
    },
    {
      key: 'faq',
      type: 'FAQ' as const,
      title: 'Frequently asked questions',
      sortOrder: 7,
      status: PUBLISHED,
      config: { limit: 6, group: 'General' },
    },
  ];

  for (const section of sections) {
    await prisma.homeSection.upsert({
      where: { key: section.key },
      create: { ...section, config: section.config as never },
      update: { sortOrder: section.sortOrder, type: section.type },
    });
  }

  // Hero banner uses the supplied product photography.
  const existingHero = await prisma.banner.findFirst({ where: { placement: 'HOME_HERO' } });
  if (!existingHero) {
    await prisma.banner.create({
      data: {
        eyebrow: 'Ahmedabad',
        title: 'Nameplates & signage',
        subtitle:
          'Home nameplates, office branding, GST plates, QR stands, desk plates, prints and safety signage.',
        image: '/uploads/products/minimal-acrylic-name-plate-2.png',
        link: '/shop',
        ctaLabel: 'Browse the shop',
        placement: 'HOME_HERO',
        status: PUBLISHED,
        sortOrder: 0,
      },
    });
  }

  // Gallery from the supplied lifestyle photography.
  const gallery = [
    { image: '/uploads/products/minimal-acrylic-name-plate-2.png', title: 'Minimal acrylic name plate', tag: 'Nameplates' },
    { image: '/uploads/products/minimal-acrylic-name-plate-3.png', title: 'Name plate, interior setting', tag: 'Nameplates' },
    { image: '/uploads/products/no-smoking-sign-3.png', title: 'No smoking sign, meeting room', tag: 'Signage' },
    { image: '/uploads/products/no-smoking-sign-1.png', title: 'No smoking sign', tag: 'Signage' },
  ];

  for (const [index, item] of gallery.entries()) {
    const exists = await prisma.galleryItem.findFirst({ where: { image: item.image } });
    if (!exists) {
      await prisma.galleryItem.create({
        data: { ...item, status: PUBLISHED, sortOrder: index },
      });
    }
  }

  log('homepage', `${sections.length} sections, hero banner, ${gallery.length} gallery items`);
}

// ---------------------------------------------------------------------------
// 8. Pages — contact is factual and published; policies are drafts to write.
// ---------------------------------------------------------------------------
const POLICY_PLACEHOLDER =
  '> This page is a draft and is not visible on the website.\n\n' +
  'Write your policy here in Admin → Pages, then set the page to Published.\n\n' +
  'Nothing has been pre-written for you, because policy wording is a commitment ' +
  'to your customers and should be your own.';

async function seedPages() {
  const pages = [
    {
      slug: 'about',
      title: 'About Beyond Walls',
      excerpt: 'Signage and nameplate studio in Ahmedabad.',
      status: DRAFT,
      showInFooter: true,
      sortOrder: 0,
      content:
        '> This page is a draft and is not visible on the website.\n\n' +
        'Write your studio story here in Admin → Pages, then set the page to Published.\n\n' +
        '**What we already know about you, from your brief:**\n\n' +
        '- Beyond Walls makes nameplates, office branding, GST plates, QR stands, desk plates, prints and signage.\n' +
        '- The studio is at First Floor, Shop No. 01, Prime Center Mall, Opp. Three Corner Garden, Mirzapur, Ahmedabad, Gujarat 380001.\n' +
        '- Open Monday to Saturday, 10 AM to 8 PM.\n',
    },
    {
      slug: 'contact',
      title: 'Contact',
      excerpt: 'Visit the studio, call or email us.',
      status: PUBLISHED,
      showInFooter: true,
      sortOrder: 1,
      seoTitle: 'Contact Beyond Walls — Ahmedabad',
      seoDescription:
        'Beyond Walls, First Floor, Shop No. 01, Prime Center Mall, Opp. Three Corner Garden, Mirzapur, Ahmedabad 380001. Call +91 7600738785.',
      content:
        '## Visit the studio\n\n' +
        'First Floor, Shop No. 01\n' +
        'Prime Center Mall\n' +
        'Opp. Three Corner Garden, Mirzapur\n' +
        'Ahmedabad, Gujarat 380001\n\n' +
        '## Opening hours\n\n' +
        'Monday to Saturday, 10 AM to 8 PM.\n\n' +
        '## Get in touch\n\n' +
        'Phone: +91 7600738785\n' +
        'Email: info@beyondwall.in\n',
    },
    { slug: 'shipping-policy', title: 'Shipping Policy', status: DRAFT, showInFooter: true, sortOrder: 2, content: POLICY_PLACEHOLDER },
    { slug: 'returns-and-refunds', title: 'Returns & Refunds', status: DRAFT, showInFooter: true, sortOrder: 3, content: POLICY_PLACEHOLDER },
    { slug: 'privacy-policy', title: 'Privacy Policy', status: DRAFT, showInFooter: true, sortOrder: 4, content: POLICY_PLACEHOLDER },
    { slug: 'terms-and-conditions', title: 'Terms & Conditions', status: DRAFT, showInFooter: true, sortOrder: 5, content: POLICY_PLACEHOLDER },
  ];

  for (const page of pages) {
    await prisma.page.upsert({
      where: { slug: page.slug },
      create: page as never,
      update: { title: page.title, sortOrder: page.sortOrder, showInFooter: page.showInFooter },
    });
  }
  log('pages', `${pages.length} (contact published, rest drafts)`);
}

// ---------------------------------------------------------------------------
// 9. FAQs — only questions answerable from the supplied facts.
// ---------------------------------------------------------------------------
async function seedFaqs() {
  const faqs = [
    {
      question: 'Where is your studio?',
      answer:
        'Beyond Walls is at First Floor, Shop No. 01, Prime Center Mall, Opp. Three Corner Garden, Mirzapur, Ahmedabad, Gujarat 380001.',
      group: 'General',
      status: PUBLISHED,
    },
    {
      question: 'What are your opening hours?',
      answer: 'We are open Monday to Saturday, 10 AM to 8 PM.',
      group: 'General',
      status: PUBLISHED,
    },
    {
      question: 'How do I get in touch?',
      answer: 'Call us on +91 7600738785 or email info@beyondwall.in.',
      group: 'General',
      status: PUBLISHED,
    },
    {
      question: 'Can I get something made to my own design?',
      answer:
        'Yes. Use the custom order form to send us your requirement, sizes and artwork, and we will come back to you with a quote.',
      group: 'General',
      status: PUBLISHED,
    },
    {
      question: 'How do I personalise a nameplate?',
      answer:
        'On a product that supports it, enter your name, house number and other details on the product page. A live preview shows how the plate will read, and your details travel with the order through to production.',
      group: 'Orders',
      status: PUBLISHED,
    },
    // Draft — the honest answer depends on the owner's own turnaround times.
    {
      question: 'How long does an order take?',
      answer:
        'DRAFT — add your real production and delivery timelines here, then publish this FAQ.',
      group: 'Orders',
      status: DRAFT,
    },
  ];

  for (const [index, faq] of faqs.entries()) {
    const exists = await prisma.faq.findFirst({ where: { question: faq.question } });
    if (!exists) await prisma.faq.create({ data: { ...faq, sortOrder: index } });
  }
  log('faqs', `${faqs.length} entries`);
}

// ---------------------------------------------------------------------------
// 10. Navigation
// ---------------------------------------------------------------------------
async function seedNavigation() {
  const links = [
    { label: 'Shop', href: '/shop', group: 'header', sortOrder: 0 },
    { label: 'For Home', href: '/shop/for-home', group: 'header', sortOrder: 1 },
    { label: 'For Offices', href: '/shop/for-offices', group: 'header', sortOrder: 2 },
    { label: 'Signs', href: '/shop/informative-signs', group: 'header', sortOrder: 3 },
    { label: 'Gallery', href: '/gallery', group: 'header', sortOrder: 4 },
    { label: 'Custom Order', href: '/custom-order', group: 'header', sortOrder: 5 },
    { label: 'Contact', href: '/contact', group: 'header', sortOrder: 6 },

    { label: 'All products', href: '/shop', group: 'footer', sortOrder: 0 },
    { label: 'Custom order', href: '/custom-order', group: 'footer', sortOrder: 1 },
    { label: 'Gallery', href: '/gallery', group: 'footer', sortOrder: 2 },
    { label: 'Track an order', href: '/track-order', group: 'footer', sortOrder: 3 },
    { label: 'Contact', href: '/contact', group: 'footer', sortOrder: 4 },
  ];

  for (const link of links) {
    const exists = await prisma.navLink.findFirst({
      where: { href: link.href, group: link.group },
    });
    if (!exists) await prisma.navLink.create({ data: { ...link, status: PUBLISHED } });
  }
  log('navigation', `${links.length} links`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  // eslint-disable-next-line no-console
  console.log('\n  Seeding Beyond Walls\n  ─────────────────────────────────────────');

  await seedAdmin();
  await seedSettings();
  const categoryIds = await seedCategories();
  const attributeIds = await seedAttributes();
  await seedMedia();
  await seedProducts(categoryIds, attributeIds);
  await seedHomepage();
  await seedPages();
  await seedFaqs();
  await seedNavigation();

  // eslint-disable-next-line no-console
  console.log('  ─────────────────────────────────────────');
  // eslint-disable-next-line no-console
  console.log(`  Done. Sign in at /admin with ${process.env.SEED_ADMIN_EMAIL ?? 'admin@beyondwall.in'}`);
  // eslint-disable-next-line no-console
  console.log('  NOTE: product prices are PLACEHOLDERS (priceConfirmed = false).');
  // eslint-disable-next-line no-console
  console.log('  Review them in Admin -> Products before going live; the dashboard');
  // eslint-disable-next-line no-console
  console.log("  shows a banner until each one is confirmed.\n");
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('\n  Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
