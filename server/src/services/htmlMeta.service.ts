/**
 * Per-page title, description and share card, written into the HTML itself.
 *
 * The site is a single page application: one shell is served for every URL and
 * React fills in the rest. React also sets the page's title and its social
 * tags -- but only once it has run. A search crawler often does not run it,
 * and the card WhatsApp draws when somebody forwards a link never does.
 *
 * So every page of the shop was being shared and indexed under the same title,
 * the same description and the same picture: the shell's. A customer sending a
 * friend a nameplate got a link that said "Beyond Walls — A design-led brand
 * for your spaces" with no idea which plate it was, which for a shop whose
 * links travel on WhatsApp is most of the point of sending one.
 *
 * This fills the shell in before it is sent. Nothing is invented: a product's
 * own name, its own short description and its own photograph; a page's own
 * title; and for everything else the wording the studio has already written
 * under Settings → SEO.
 */
import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';
import { getSetting } from './settings.service';

/** HTML-escapes a value going into an attribute or a text node. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Collapses whitespace and trims to a length a search result will show. */
function clamp(value: string, max = 300): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

interface PageMeta {
  /**
   * False when the URL names nothing that exists.
   *
   * The shop is one page application, so the server used to answer every URL
   * the same way: 200, here is the shell, let React decide. A customer who
   * mistyped saw a proper "Page not found" screen and all was well -- but a
   * search engine was told the page existed, and indexed a not-found screen
   * as a real page of the shop. A deleted product kept its place in the
   * results that way, and kept sending people to nothing.
   */
  found?: boolean;
  title?: string;
  description?: string;
  image?: string | null;
  type?: 'website' | 'product';
  noindex?: boolean;
}

/*
 * The pages that are not records in the database.
 *
 * Only their names: the title template and the description come from the
 * studio's own settings, so nothing here claims anything about the business
 * that the studio has not written itself.
 */
/*
 * Routes the application owns whatever is behind them.
 *
 * Whether a particular order exists, or the visitor is signed in, is for the
 * page itself to answer -- the address is real either way, and none of these
 * are for search engines.
 */
const PRIVATE_PREFIXES = ['/admin', '/account', '/order', '/reset-password', '/forgot-password'];

const STATIC_PAGES: Record<string, string> = {
  '/shop': 'Shop',
  '/cart': 'Your cart',
  '/checkout': 'Checkout',
  '/track-order': 'Track an order',
  '/custom-order': 'Custom order',
  '/contact': 'Contact',
  '/gallery': 'Gallery',
  '/about': 'About',
  '/login': 'Sign in',
  '/register': 'Create an account',
};

/**
 * What this URL is about, taken from the thing it names.
 *
 * Returns nothing rather than guessing: an unknown URL keeps the shell's own
 * wording, which is accurate about the business even when it cannot be
 * specific about the page.
 */
async function metaForPath(pathname: string): Promise<PageMeta | null> {
  /* The admin panel is not for search engines, and has nothing to share. */
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return { title: 'Admin', noindex: true, found: true };
  }

  const owned = PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (owned) return { noindex: true, found: true };

  const product = /^\/product\/([^/]+)\/?$/.exec(pathname);
  if (product) {
    const slug = decodeURIComponent(product[1]);
    const row = await prisma.product.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: {
        name: true,
        shortDescription: true,
        seoTitle: true,
        seoDescription: true,
        images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
      },
    });
    if (!row) return { found: false };
    return {
      title: row.seoTitle || row.name,
      description: row.seoDescription || row.shortDescription || undefined,
      image: row.images[0]?.url ?? null,
      type: 'product',
      found: true,
    };
  }

  /*
   * The front page keeps the studio's own wording, but still earns a
   * canonical address and a share card: it is the link sent most often.
   */
  if (pathname === '/') return { found: true };

  const known = STATIC_PAGES[pathname.replace(/\/+$/, '') || '/'];
  if (known) return { title: known, found: true };

  /*
   * A collection. An address that names no category of ours is not a thinner
   * shop page, it is a page we do not have.
   */
  const collection = /^\/shop\/([^/]+)\/?$/.exec(pathname);
  if (collection) {
    const category = await prisma.category.findFirst({
      where: { slug: decodeURIComponent(collection[1]), status: 'PUBLISHED' },
      select: { name: true, shortText: true, description: true },
    });
    if (!category) return { found: false };
    return {
      title: category.name,
      description: category.shortText || category.description || undefined,
      found: true,
    };
  }

  /* A page the studio wrote in the admin panel. */
  const slug = /^\/([^/]+)\/?$/.exec(pathname)?.[1];
  if (slug) {
    const page = await prisma.page.findFirst({
      where: { slug: decodeURIComponent(slug), status: 'PUBLISHED' },
      select: { title: true, seoTitle: true, seoDescription: true },
    });
    if (page) {
      return {
        title: page.seoTitle || page.title,
        description: page.seoDescription || undefined,
        found: true,
      };
    }
  }

  return { found: false };
}

/*
 * The shell is read from disk once and kept.
 *
 * It only changes when the site is rebuilt, which means a new process, and a
 * file read on every page request to learn the same thing is a page request
 * made slower for nothing.
 */
let shell: string | null = null;

function readShell(indexPath: string): string | null {
  if (shell === null) {
    try {
      shell = fs.readFileSync(indexPath, 'utf8');
    } catch {
      return null;
    }
  }
  return shell;
}

/**
 * The shell with this page's own tags in it, or null to serve the file as is.
 */
export interface Shell {
  /** The filled-in page, or null to send the built file untouched. */
  html: string | null;
  /** What to answer with. 404 when the URL names nothing that exists. */
  status: number;
}

export async function renderShell(
  pathname: string,
  clientDist: string,
): Promise<Shell | null> {
  const html = readShell(path.join(clientDist, 'index.html'));
  if (!html) return null;

  let meta: PageMeta | null = null;
  try {
    meta = await metaForPath(pathname);
  } catch {
    /*
     * A page must still be served when the database is unreachable. Losing a
     * share card is a small thing; losing the site is not.
     */
    return null;
  }
  if (!meta) return null;

  /*
   * Nothing here. The visitor still gets the real page -- React draws the
   * same "Page not found" screen it always did -- but the answer carries the
   * code that says so, which is the part a search engine reads.
   */
  const status = meta.found === false ? 404 : 200;
  if (status === 404) {
    return {
      status,
      html: html.replace('</head>', '    <meta name="robots" content="noindex" />\n  </head>'),
    };
  }

  const [template, defaultTitle, siteName, defaultDescription, configuredUrl, defaultImage, robots] =
    await Promise.all([
      getSetting<string>('seo.titleTemplate', '{page} | Beyond Walls'),
      getSetting<string>('seo.defaultTitle', ''),
      getSetting<string>('brand.name', 'Beyond Walls'),
      getSetting<string>('seo.defaultDescription', ''),
      getSetting<string>('seo.siteUrl', ''),
      getSetting<string | null>('seo.defaultOgImage', null),
      getSetting<string>('seo.robots', 'index, follow'),
    ]);

  const base = (configuredUrl || '').replace(/\/+$/, '');
  const titleText = meta.title
    && !meta.title.toLowerCase().includes(siteName.toLowerCase())
    ? template.replace('{page}', meta.title)
    : meta.title || defaultTitle;

  const description = clamp(meta.description || defaultDescription || '');
  const picture = meta.image || defaultImage || null;
  const absolute = (url: string) => (/^https?:\/\//i.test(url) ? url : `${base}${url}`);

  const tags: string[] = [];
  if (description) tags.push(`<meta property="og:description" content="${esc(description)}" />`);
  if (titleText) {
    tags.push(`<meta property="og:title" content="${esc(titleText)}" />`);
    tags.push(`<meta name="twitter:title" content="${esc(titleText)}" />`);
  }
  tags.push(`<meta property="og:type" content="${meta.type === 'product' ? 'product' : 'website'}" />`);
  tags.push(`<meta property="og:site_name" content="${esc(siteName)}" />`);
  if (base) {
    tags.push(`<link rel="canonical" href="${esc(base + pathname)}" />`);
    tags.push(`<meta property="og:url" content="${esc(base + pathname)}" />`);
  }
  if (picture) {
    tags.push(`<meta property="og:image" content="${esc(absolute(picture))}" />`);
    tags.push(`<meta name="twitter:image" content="${esc(absolute(picture))}" />`);
    tags.push('<meta name="twitter:card" content="summary_large_image" />');
  }
  if (description) tags.push(`<meta name="twitter:description" content="${esc(description)}" />`);
  tags.push(`<meta name="robots" content="${esc(meta.noindex ? 'noindex, nofollow' : robots)}" />`);

  let out = html;
  if (titleText) {
    out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(titleText)}</title>`);
  }
  if (description) {
    out = out.replace(
      /<meta\s+name="description"[\s\S]*?\/>/i,
      `<meta name="description" content="${esc(description)}" />`,
    );
  }
  return { status, html: out.replace('</head>', `    ${tags.join('\n    ')}\n  </head>`) };
}
