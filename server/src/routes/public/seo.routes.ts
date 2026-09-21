import { Router } from 'express';
import prisma from '../../lib/prisma';
import { asyncHandler } from '../../utils/http';
import { getSetting } from '../../services/settings.service';
import { escapeXml } from '../../utils/helpers';

const router = Router();
const PUBLISHED = { status: 'PUBLISHED' as const };

async function siteUrl(): Promise<string> {
  const url = await getSetting<string>('seo.siteUrl', 'https://beyondwall.in');
  return String(url).replace(/\/+$/, '');
}

interface UrlEntry {
  loc: string;
  lastmod?: Date | null;
  changefreq?: string;
  priority?: string;
}

function renderSitemap(base: string, entries: UrlEntry[]): string {
  const urls = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(base + entry.loc)}</loc>`];
      if (entry.lastmod) parts.push(`    <lastmod>${entry.lastmod.toISOString().split('T')[0]}</lastmod>`);
      if (entry.changefreq) parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
      if (entry.priority) parts.push(`    <priority>${entry.priority}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

// GET /sitemap.xml — generated live from published content.
router.get(
  '/sitemap.xml',
  asyncHandler(async (_req, res) => {
    const base = await siteUrl();

    const [categories, products, pages] = await Promise.all([
      prisma.category.findMany({ where: PUBLISHED, select: { slug: true, updatedAt: true } }),
      prisma.product.findMany({ where: PUBLISHED, select: { slug: true, updatedAt: true } }),
      prisma.page.findMany({ where: PUBLISHED, select: { slug: true, updatedAt: true } }),
    ]);

    const entries: UrlEntry[] = [
      { loc: '/', changefreq: 'weekly', priority: '1.0' },
      { loc: '/shop', changefreq: 'daily', priority: '0.9' },
      { loc: '/custom-order', changefreq: 'monthly', priority: '0.8' },
      { loc: '/contact', changefreq: 'monthly', priority: '0.7' },
      { loc: '/gallery', changefreq: 'weekly', priority: '0.6' },
      ...categories.map((c) => ({
        loc: `/shop/${c.slug}`,
        lastmod: c.updatedAt,
        changefreq: 'weekly',
        priority: '0.8',
      })),
      ...products.map((p) => ({
        loc: `/product/${p.slug}`,
        lastmod: p.updatedAt,
        changefreq: 'weekly',
        priority: '0.8',
      })),
      ...pages.map((p) => ({
        loc: `/${p.slug}`,
        lastmod: p.updatedAt,
        changefreq: 'monthly',
        priority: '0.5',
      })),
    ];

    res.header('Content-Type', 'application/xml; charset=utf-8');
    res.send(renderSitemap(base, entries));
  }),
);

// GET /robots.txt
router.get(
  '/robots.txt',
  asyncHandler(async (_req, res) => {
    const base = await siteUrl();
    const robots = await getSetting<string>('seo.robots', 'index, follow');
    const disallowAll = String(robots).includes('noindex');

    res.header('Content-Type', 'text/plain; charset=utf-8');
    res.send(
      [
        'User-agent: *',
        disallowAll ? 'Disallow: /' : 'Disallow: /admin',
        disallowAll ? '' : 'Disallow: /checkout',
        disallowAll ? '' : 'Disallow: /account',
        disallowAll ? '' : 'Disallow: /cart',
        '',
        `Sitemap: ${base}/sitemap.xml`,
        '',
      ]
        .filter((line) => line !== undefined)
        .join('\n'),
    );
  }),
);

export default router;
