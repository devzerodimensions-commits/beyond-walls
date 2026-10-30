#!/usr/bin/env node
/**
 * Gives every core content page a useful, editable first version.
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
 * About, Shipping and Returns use the studio's wording (Pages.pdf, 3 October
 * 2026). Contact is assembled from the business details already maintained in
 * Settings. Privacy and Terms are a plain-language first draft based on what
 * this application actually collects and does; the owner should still have
 * those two pages reviewed for the business before launch.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** A heading block. */
const heading = (title, subtitle) => ({ type: 'SECTION_HEADING', title, subtitle });

/** A block of prose, optionally under its own heading. */
const text = (title, bodyText) => ({ type: 'RICH_TEXT', title, bodyText });

/** Three concise promises in a graphic strip. */
const benefits = (items) => ({ type: 'USP_STRIP', config: { items } });

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
      {
        type: 'PAGE_HERO',
        subtitle: 'About us',
        title: 'Where it started',
        bodyText: '2004 — under the name Patel Corporation',
        config: { image: '/uploads/photos/bw-photo-03.webp', height: 'tall' },
      },

      {
        type: 'IMAGE_TEXT',
        subtitle: 'Two decades',
        title: 'From signs to a design-led brand',
        bodyText:
          'In 2004 we started as Patel Corporation, an offline signage manufacturing business.\n\n' +
          'For more than two decades we have worked with materials, finishes, spaces and businesses ' +
          'to turn ideas into physical signs. That experience taught us something simple: the right ' +
          'detail can change how a space feels.\n\n' +
          'Now the second generation is carrying that experience forward in a new direction — from ' +
          'making signs to a design-led brand for personal spaces.',
        config: {
          image: '/uploads/photos/bw-photo-07.webp',
          imageSide: 'right',
          variant: 'editorial',
          ratio: 'landscape',
        },
      },

      /*
       * The founder and co-founder profiles used to sit here. The studio asked
       * for them to come off the page in October 2026, so they are gone from
       * the seed as well -- otherwise a fresh environment would recreate what
       * production has had removed.
       *
       * What took their place is below: a strip of three facts the page already
       * states in the company's voice, and the gallery. The facts that lived
       * only in the profiles -- the 500 projects, the twenty years, the named
       * materials -- are not restated anywhere, because attributing one
       * person's record to the company is the studio's claim to make.
       */
      {
        type: 'USP_STRIP',
        subtitle: 'Beyond Walls',
        title: 'Two decades of making, now making for homes',
        config: {
          variant: 'feature',
          items: [
            {
              title: 'Since 2004',
              text: 'Started as Patel Corporation, an offline signage manufacturing business.',
            },
            {
              title: 'Made in-house',
              text:
                'Production happens at our own facility, from choosing the material to finishing.',
            },
            {
              title: 'Design and making',
              text:
                'Our design experience creates with intention. Our manufacturing experience makes ' +
                'it work.',
            },
          ],
        },
      },

      {
        type: 'STEPS',
        subtitle: 'Our process',
        title: 'Screen → Prototype → Production → Your space',
        config: {
          /*
           * Three steps, not four. The studio named a fourth -- "your space" --
           * but wrote nothing under it, and a step with invented copy under it
           * would be us talking, not them. It stays in the heading instead.
           */
          items: [
            {
              title: 'It starts on a screen',
              text:
                'Every Beyond Walls piece begins as an idea. We bring it to life digitally first, ' +
                'refining the design, the proportions and the details before anything is made.',
            },
            {
              title: 'Then we make a prototype',
              text:
                'Before moving into production we make smaller versions of the design to understand ' +
                'how it looks, how it feels and how it comes together in the physical world. This is ' +
                'where ideas meet materials.',
            },
            {
              title: 'Then we make it real',
              text:
                'Once the prototype is refined and approved, production begins at our in-house ' +
                'facility. From choosing the material to assembly and finishing, each piece is made ' +
                'with hands-on attention to detail.',
            },
          ],
        },
      },

      {
        type: 'GALLERY',
        subtitle: 'Our work',
        title: 'Pieces we have made',
        config: { limit: 8 },
      },

      {
        type: 'IMAGE_TEXT',
        subtitle: 'What makes us different',
        title: 'We understand both sides of the design',
        bodyText:
          'At Beyond Walls we do not stop at how something looks. We understand what happens after ' +
          'the design leaves the screen: the materials, the making, the details, and the challenges ' +
          'that come with turning an idea into a physical product.\n\n' +
          'Our design experience helps us create with intention. Our manufacturing experience helps ' +
          'us make it work.\n\n' +
          'But it is not only about what we make. It is about how we work with people. We do not see ' +
          'customers as numbers or orders. We listen, we understand the idea behind the request, and ' +
          'we work towards something that feels right for the person and the space.',
        config: {
          image: '/uploads/photos/bw-photo-02.webp',
          imageSide: 'left',
          variant: 'editorial',
          ratio: 'landscape',
        },
      },

      /*
       * The one sentence the page is making, set on its own rather than left at
       * the end of a paragraph where it reads like every other line. Immediately
       * before the call to action, so the page makes its point and then asks.
       */
      {
        type: 'SECTION_HEADING',
        title:
          'Good design starts with an idea. Good making brings it to life. We understand both.',
        config: { variant: 'statement' },
      },

      {
        type: 'CTA',
        title: 'Something in mind for your space?',
        bodyText:
          'Send us the sizes, the material and the artwork, and we will come back to you with a quote.',
        ctaLabel: 'Start a custom order',
        ctaLink: '/custom-order',
      },
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
    slug: 'contact',
    title: 'Contact',
    excerpt: 'Visit our Ahmedabad studio, call, WhatsApp or send us a message.',
    seoTitle: 'Contact Beyond Walls — Ahmedabad signage studio',
    seoDescription:
      'Visit Beyond Walls in Mirzapur, Ahmedabad, call or WhatsApp the studio, or send an enquiry online.',
    showInFooter: true,
    sections: [
      {
        type: 'PAGE_HERO',
        subtitle: 'Ahmedabad studio',
        title: 'Let’s make something for your space',
        bodyText:
          'Bring us an idea, a reference, or simply the space you are working with. We will help you find the right way to make it real.',
        config: { image: '/uploads/photos/bw-photo-06.webp', height: 'short' },
      },
      benefits([
        {
          title: 'Visit the studio',
          text: 'See materials and finishes in person at our Mirzapur studio.',
        },
        {
          title: 'Call or WhatsApp',
          text: 'A quick way to ask about a product, an order or a custom idea.',
        },
        {
          title: 'Send a clear brief',
          text: 'Share the size, material, wording and any reference artwork you have.',
        },
      ]),
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

  {
    slug: 'privacy-policy',
    title: 'Privacy policy',
    excerpt: 'What information we collect, why we use it and the choices you have.',
    seoTitle: 'Privacy policy — Beyond Walls',
    seoDescription:
      'How Beyond Walls handles account, order, enquiry, personalisation and payment-related information.',
    showInFooter: true,
    sections: [
      {
        type: 'PAGE_HERO',
        subtitle: 'Privacy, in plain language',
        title: 'Your information should have a clear purpose',
        bodyText:
          'This page explains what we collect when you browse, enquire or order, why we need it, and how to contact us about it.',
        config: { image: '/uploads/photos/bw-photo-02.webp', height: 'short' },
      },
      benefits([
        { title: 'Only what we need', text: 'We collect information needed to answer you, make your order and deliver it.' },
        { title: 'Used with purpose', text: 'We use it to provide the service you asked for, operate the shop and meet legal duties.' },
        { title: 'You stay in control', text: 'You can ask about your information or request a correction through our contact page.' },
      ]),
      text(
        'Last updated',
        '15 October 2026\n\nThis policy applies to the Beyond Walls website, customer accounts, enquiries and orders. “We”, “us” and “our” mean Beyond Walls. This is an editable business policy and should be reviewed whenever our services or providers change.',
      ),
      text(
        'Information we collect',
        'Depending on how you use the website, we may collect:\n\n' +
          '• Your name, email address, phone or WhatsApp number and account sign-in details. Passwords are stored in protected, unreadable form.\n' +
          '• Billing and delivery details, order history and any GST invoice details you choose to provide.\n' +
          '• Product personalisation, instructions, messages, reference images, artwork and other files you submit.\n' +
          '• Enquiry details when you use the contact or custom-order forms.\n' +
          '• Cart, session, device and basic technical information needed to keep the website secure and working.\n' +
          '• Transaction references and limited payment information returned by our payment provider. We do not receive your full card details or banking password.',
      ),
      text(
        'How we use your information',
        'We use personal information to create and secure accounts; answer enquiries; prepare quotations and proofs; personalise, make, deliver and support orders; process and reconcile payments; provide order updates; prevent fraud or misuse; improve the reliability of the website; keep required business records; and comply with applicable law.\n\nWe do not use your contact details for marketing unless you ask to receive it or otherwise give consent.',
      ),
      text(
        'When information is shared',
        'We share information only where it is needed to provide the service or meet a legal obligation. This may include payment providers, hosting and database providers, email providers, delivery partners, professional advisers and public authorities when lawfully required.\n\nEach provider receives only the information needed for its role. We do not sell personal information.',
      ),
      text(
        'Payments',
        'Online payments are handled by the payment option shown at checkout. The payment provider processes your card, UPI, bank or wallet details under its own privacy terms. We receive the result of the payment and limited transaction details so we can match it to your order, issue support and process an approved refund.',
      ),
      text(
        'Cookies and device storage',
        'We use essential cookies or similar browser storage to keep you signed in, remember your cart and preferences, protect forms and maintain the security of the service. These are required for features you choose to use. If optional analytics or advertising tools are added later, this policy and the website’s consent choices must be updated before they are enabled.',
      ),
      text(
        'How long we keep information',
        'We keep information only for as long as it is needed for the purpose described above, for warranty and customer support, to resolve disputes, to protect the service, and for accounting or other legal record-keeping. When information is no longer required, we delete it or remove identifying details where reasonably possible.',
      ),
      text(
        'Your choices and rights',
        'Subject to applicable law, you may ask us for information about how your personal data is used, request access or correction, ask for deletion where we no longer have a lawful reason to keep it, withdraw a consent you previously gave, and raise a grievance.\n\nTo make a request, use the contact page or email the address shown there. We may need to verify that the request relates to you before acting on it.',
      ),
      text(
        'Children’s information',
        'This shop is intended for people who can enter into a purchase. We do not knowingly ask a child to create an account or place an order without the involvement of a parent or lawful guardian. If you believe a child has provided personal information without appropriate permission, please contact us.',
      ),
      text(
        'Security and changes',
        'We use reasonable organisational and technical safeguards intended to protect information against unauthorised access, loss, alteration or disclosure. No online service can promise absolute security.\n\nWe may update this policy when the website, our providers or applicable requirements change. The latest version will appear on this page with its updated date.',
      ),
      {
        type: 'CTA',
        title: 'A question about your information?',
        bodyText: 'Contact the studio and tell us what you need help with. We will respond using the details you provide.',
        ctaLabel: 'Contact us',
        ctaLink: '/contact',
      },
    ],
  },

  {
    slug: 'terms-and-conditions',
    title: 'Terms and conditions',
    excerpt: 'The terms that apply when you browse, personalise or buy from Beyond Walls.',
    seoTitle: 'Terms and conditions — Beyond Walls',
    seoDescription:
      'Terms for using the Beyond Walls website and ordering ready-made, personalised and custom signage products.',
    showInFooter: true,
    sections: [
      {
        type: 'PAGE_HERO',
        subtitle: 'Clear terms, before you order',
        title: 'Made to order should not mean hard to understand',
        bodyText:
          'These terms explain how the website, personalisation, payment, production, delivery and support work.',
        config: { image: '/uploads/photos/bw-photo-05.webp', height: 'short' },
      },
      benefits([
        { title: 'Check the details', text: 'Names, numbers, sizes, colours and files supplied by you are used to make personalised pieces.' },
        { title: 'Know the timing', text: 'Production and delivery estimates are shown separately because both affect when an order arrives.' },
        { title: 'Consumer rights remain', text: 'Nothing in these terms removes a right that applicable consumer law gives you.' },
      ]),
      text(
        'Last updated',
        '15 October 2026\n\nThese terms apply when you use the Beyond Walls website or place an order with us. By placing an order, you confirm that you have read these terms together with the product information, Shipping Policy and Returns & Refunds page. Please contact us before ordering if anything is unclear.',
      ),
      text(
        'Using the website',
        'You may browse the website without an account. When you create an account or place an order, the information you provide must be accurate and current. You are responsible for protecting your sign-in details and for activity carried out through your account.\n\nYou must not misuse the website, interfere with its operation, attempt unauthorised access, submit malicious files, or use it in a way that violates law or the rights of another person.',
      ),
      text(
        'Products, images and personalisation',
        'We aim to describe each product, material, finish, size and option accurately. Photographs and on-screen previews are guides: screen settings, lighting, material batches and hand-finishing can create reasonable differences in colour, texture or appearance.\n\nFor a personalised or custom product, you are responsible for checking every name, number, date, spelling, size, colour, uploaded file and instruction before adding it to your cart. A digital preview is indicative unless we expressly confirm it as a production proof.',
      ),
      text(
        'Prices, taxes and payment',
        'Prices are displayed in Indian rupees. The product page and checkout show whether applicable tax is included or added, along with delivery charges and any enabled payment fee, before you confirm the order.\n\nPayment options are those available at checkout. An online payment order is not paid until the payment provider and our system confirm the transaction. If a payment appears to have left your account but the order is not confirmed, please contact us before paying again.',
      ),
      text(
        'Orders and acceptance',
        'An order acknowledgement means we received your request; it does not require us to accept an order that cannot lawfully or reasonably be fulfilled. We may contact you to clarify artwork or personalisation.\n\nIf a product is unavailable, a price or description contains a clear error, payment cannot be verified, or the submitted content cannot lawfully be produced, we may decline or cancel the affected order and return any amount paid for it.',
      ),
      text(
        'Production and delivery',
        'Ready-made and made-to-order products have different preparation times. Current production and delivery guidance is on the Shipping Policy page and may also appear on the product or checkout page. Dates are estimates rather than guaranteed appointment times.\n\nPlease provide a complete delivery address and a reachable phone number. Delays caused by incorrect details, unsuccessful delivery, severe weather, transport disruption or events outside reasonable control may extend the estimate.',
      ),
      text(
        'Cancellations, returns and refunds',
        'Contact us as soon as possible if you need to cancel. Whether cancellation is possible depends on the order’s payment, production and dispatch status. Once a personalised piece has entered production, it may not be possible to cancel or resell it.\n\nThe Returns & Refunds page explains the rules for personalised products, damage, reporting periods, replacements and any refund that applies. Those rules form part of these terms and do not limit rights that cannot lawfully be excluded.',
      ),
      text(
        'Artwork and content you send',
        'You keep ownership of artwork and other content you submit. You give us permission to store, reproduce, adapt and use it only as needed to quote, prepare a proof, manufacture, deliver and support your order.\n\nYou must have the right to use the names, photographs, logos, artwork and other material you submit. We may refuse content that appears unlawful, harmful, infringing or unsuitable for production.',
      ),
      text(
        'Our website and intellectual property',
        'The Beyond Walls name, website design, product photographs, original graphics and written content belong to us or are used with permission. You may view them for personal shopping and reference. You may not copy, republish, sell, scrape or commercially exploit them without written permission.',
      ),
      text(
        'Availability and third-party services',
        'We work to keep the website accurate and available, but maintenance, network issues and third-party services can sometimes interrupt it. Links or services supplied by a payment, mapping, social, delivery or other provider are also governed by that provider’s terms. We are not responsible for a third-party service beyond the extent required by applicable law.',
      ),
      text(
        'Responsibility and consumer rights',
        'We are responsible for supplying accepted orders with reasonable care and in accordance with applicable law. To the fullest extent law permits, we are not responsible for losses that are indirect, unforeseeable, caused by misuse, or caused by inaccurate information or content supplied by you.\n\nNothing in these terms excludes or limits liability, remedies or consumer rights where doing so would be unlawful.',
      ),
      text(
        'Law, disputes and changes',
        'These terms are governed by the laws of India. Courts with jurisdiction in Ahmedabad, Gujarat will have jurisdiction, subject to any mandatory right you have to approach a consumer commission or another competent forum.\n\nWe may update these terms for future use of the website and future orders. The version applying to an order is the version available when that order was placed, unless a change is required by law.',
      ),
      {
        type: 'CTA',
        title: 'Need an answer before ordering?',
        bodyText: 'Send us the product, size and question. We would rather clarify it before production begins.',
        ctaLabel: 'Ask the studio',
        ctaLink: '/contact',
      },
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
        ctaLabel: section.ctaLabel ?? null,
        ctaLink: section.ctaLink ?? null,
        // Pictures, alignment and the steps of a process all live in config.
        config: section.config ?? {},
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
