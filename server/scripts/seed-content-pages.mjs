#!/usr/bin/env node
/**
 * Fills the About, Shipping and Returns pages with the studio's own wording.
 *
 * WHY THIS EXISTS
 * Page content lives in the database, and a database is not deployed. Writing
 * these pages in the admin panel on one machine leaves every other environment
 * blank, which is how the live site ended up with five empty pages while they
 * looked finished locally.
 *
 * WHAT IT WILL AND WILL NOT DO
 * It only fills a page that currently has no blocks. The moment a page has any
 * content -- whether from here or typed in the admin -- it is never touched
 * again, so an edit made by the studio can never be overwritten by a deploy.
 *
 * Every word below was supplied by the studio (Pages.pdf, 3 October 2026). The
 * dates, delivery times, charges and refund rules are their commitments, not
 * ours. Nothing here is invented: the question they asked to hold -- how many
 * orders so far -- is simply absent, and Terms and Privacy are left alone until
 * they have settled their GST position.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** A heading block. */
const heading = (title, subtitle) => ({ type: 'SECTION_HEADING', title, subtitle });

/** A block of prose, optionally under its own heading. */
const text = (title, bodyText) => ({ type: 'RICH_TEXT', title, bodyText });

const PAGES = [
  {
    slug: 'about',
    title: 'About us',
    excerpt: 'A signage manufacturer since 2004, now a design-led brand for personal spaces.',
    seoTitle: 'About Beyond Walls — nameplates and signage, Ahmedabad',
    seoDescription:
      'Beyond Walls began in 2004 as Patel Corporation. Two decades of signage manufacturing, now a design-led brand for personal spaces.',
    showInFooter: true,
    sections: [
      heading('Where it started', '2004 — under the name Patel Corporation'),

      text(
        null,
        'In 2004 we started as Patel Corporation, an offline signage manufacturing business.\n\n' +
          'For more than two decades we have worked with materials, finishes, spaces and businesses ' +
          'to turn ideas into physical signs. That experience taught us something simple: the right ' +
          'detail can change how a space feels.\n\n' +
          'Now the second generation is carrying that experience forward in a new direction — from ' +
          'making signs to a design-led brand for personal spaces.',
      ),

      text(
        'Founder — Patel Mohmed Ammar',
        'From digital design to physical expression.\n\n' +
          'With a Bachelor’s degree in Fine Arts and two years of experience as a visual designer, I ' +
          'have spent much of my career working with ideas through a screen: building identities, ' +
          'creating visuals, and finding ways to communicate through design.\n\n' +
          'But I wanted to take that thinking beyond the digital world.\n\n' +
          'Growing up around our family’s signage manufacturing business gave me an early connection ' +
          'to materials, making and physical spaces. Today I am bringing that together with my ' +
          'background in visual design to build Beyond Walls.\n\n' +
          'The goal is simple: to explore what happens when design leaves the screen and becomes ' +
          'something you can see, touch and live with.',
      ),

      text(
        'Co-founder — Patel Mohmed Ishaq',
        'Twenty years of making things real.\n\n' +
          'With 20 years of experience in signage manufacturing, Mohmed Ishaq brings hands-on ' +
          'knowledge of materials, fabrication and execution to Beyond Walls.\n\n' +
          'Over the years he has completed more than 500 signage and elevation projects, working ' +
          'closely with interior designers, architects and businesses to turn designs into finished ' +
          'physical products.\n\n' +
          'From acrylic, MDF and ACP to fabrication, finishing and installation, his experience goes ' +
          'beyond knowing materials. It comes from understanding how they behave, how they work ' +
          'together, and how they perform in the real world.\n\n' +
          'At Beyond Walls that experience is the foundation of our approach: pieces that are not ' +
          'only designed well, but made to work well.',
      ),

      text(
        'Our process',
        'Screen → Prototype → Production → Your space\n\n' +
          'It starts on a screen. Every Beyond Walls piece begins as an idea. We bring it to life ' +
          'digitally first, refining the design, the proportions and the details before anything is ' +
          'made.\n\n' +
          'Then we make a prototype. Before moving into production we make smaller versions of the ' +
          'design to understand how it looks, how it feels and how it comes together in the physical ' +
          'world. This is where ideas meet materials.\n\n' +
          'Then we make it real. Once the prototype is refined and approved, production begins at our ' +
          'in-house facility. From choosing the material to assembly and finishing, each piece is ' +
          'made with hands-on attention to detail.',
      ),

      text(
        'What makes us different',
        'We understand both sides of the design.\n\n' +
          'At Beyond Walls we do not stop at how something looks. We understand what happens after ' +
          'the design leaves the screen: the materials, the making, the details, and the challenges ' +
          'that come with turning an idea into a physical product.\n\n' +
          'Our design experience helps us create with intention. Our manufacturing experience helps ' +
          'us make it work.\n\n' +
          'But it is not only about what we make. It is about how we work with people. We do not see ' +
          'customers as numbers or orders. We listen, we understand the idea behind the request, and ' +
          'we work towards something that feels right for the person and the space.\n\n' +
          'Good design starts with an idea. Good making brings it to life. We understand both.',
      ),
    ],
  },

  {
    slug: 'shipping-policy',
    title: 'Shipping policy',
    excerpt: 'How long an order takes to make, and where we deliver.',
    seoTitle: 'Shipping policy — Beyond Walls',
    seoDescription:
      'Custom pieces take 2 to 3 working days to make. Delivery across India takes around 4 to 5 days after dispatch. Free delivery above ₹1,000.',
    showInFooter: true,
    sections: [
      heading('Shipping policy', 'How long an order takes to make, and where we deliver.'),

      text(
        'Making your order',
        'Custom made designs take 2 to 3 working days to make.\n\n' +
          'Ready made products are dispatched within 1 working day of the order being placed.',
      ),

      text(
        'Delivery',
        'Delivery takes around 4 to 5 days after dispatch.\n\n' +
          'An order may take longer in certain weather conditions, such as heavy rain, and to some ' +
          'regions — for example Jammu & Kashmir, Kerala and Nagaland.',
      ),

      text('Where we deliver', 'We deliver all over India.'),

      text('Delivery charges', 'Delivery is free on orders above ₹1,000.'),
    ],
  },

  {
    slug: 'returns-and-refunds',
    title: 'Returns and refunds',
    excerpt: 'What we can do if something is wrong with your order.',
    seoTitle: 'Returns and refunds — Beyond Walls',
    seoDescription:
      'Custom and personalised pieces cannot be returned. Damaged items are replaced. Tell us within 5 working days.',
    showInFooter: true,
    sections: [
      heading('Returns and refunds', 'What we can do if something is wrong with your order.'),

      text(
        'Custom and personalised pieces',
        'Custom and personalised pieces are made specifically to your requirements, so we do not ' +
          'accept returns, exchanges or refund requests on them.\n\n' +
          'Please check your personalisation details carefully before placing your order.',
      ),

      text(
        'If your order arrives damaged',
        'If a piece reaches you damaged we will replace it with the same piece. A refund does not ' +
          'apply in this situation.',
      ),

      text(
        'Telling us about a problem',
        'Please tell us within 5 working days of receiving your order. After that period we cannot ' +
          'offer a replacement or a refund.',
      ),

      text(
        'Refund timing',
        'Where a refund does apply, it is processed within 3 working days of the request being ' +
          'approved.',
      ),
    ],
  },
];

/**
 * Puts About in the main menu.
 *
 * It was reachable only from the footer, which is where nobody looks for it.
 * Added before Contact, which is where a visitor expects it, and only when it
 * is not already there -- so the studio can move or remove it afterwards and a
 * deploy will not put it back.
 */
async function ensureAboutInMenu() {
  const existing = await prisma.navLink.findFirst({
    where: { group: 'header', href: '/about' },
    select: { id: true },
  });
  if (existing) return 'about already in the menu';

  const contact = await prisma.navLink.findFirst({
    where: { group: 'header', href: '/contact' },
    select: { id: true, sortOrder: true },
  });

  const at = contact ? contact.sortOrder : 99;
  if (contact) {
    // Everything from Contact onwards shifts down one to make room.
    await prisma.navLink.updateMany({
      where: { group: 'header', sortOrder: { gte: at } },
      data: { sortOrder: { increment: 1 } },
    });
  }

  await prisma.navLink.create({
    data: { label: 'About', href: '/about', group: 'header', sortOrder: at, status: 'PUBLISHED' },
  });
  return 'about added to the menu';
}

async function main() {
  const filled = [];
  const skipped = [];

  for (const def of PAGES) {
    const page = await prisma.page.upsert({
      where: { slug: def.slug },
      create: {
        slug: def.slug,
        title: def.title,
        excerpt: def.excerpt,
        seoTitle: def.seoTitle,
        seoDescription: def.seoDescription,
        showInFooter: def.showInFooter,
        status: 'PUBLISHED',
      },
      // An existing page keeps its own title and status: those are the studio's
      // to change, and a deploy should not quietly republish something they
      // deliberately took down.
      update: {},
    });

    const already = await prisma.pageSection.count({ where: { pageId: page.id } });
    if (already > 0) {
      skipped.push(`${def.slug} (${already} blocks already)`);
      continue;
    }

    await prisma.pageSection.createMany({
      data: def.sections.map((section, index) => ({
        pageId: page.id,
        type: section.type,
        title: section.title ?? null,
        subtitle: section.subtitle ?? null,
        bodyText: section.bodyText ?? null,
        sortOrder: index,
        status: 'PUBLISHED',
      })),
    });

    // A page written for the first time is published, so it is actually
    // reachable. One already in the database keeps whatever status it had.
    await prisma.page.update({
      where: { id: page.id },
      data: { status: 'PUBLISHED', showInFooter: def.showInFooter },
    });

    filled.push(`${def.slug} (${def.sections.length} blocks)`);
  }

  console.log(await ensureAboutInMenu());

  if (filled.length) console.log('content pages written: ' + filled.join(', '));
  if (skipped.length) console.log('content pages left alone: ' + skipped.join(', '));
  if (!filled.length && !skipped.length) console.log('content pages: nothing to do');
}

main()
  .catch((error) => {
    // Never fail a deploy over page content: the rest of the site is fine
    // without it, and the pages can be written in the admin panel.
    console.error('seed-content-pages: skipped —', error.message);
  })
  .finally(() => prisma.$disconnect());
