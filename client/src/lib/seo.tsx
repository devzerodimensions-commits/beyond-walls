import { Helmet } from 'react-helmet-async';
import { SITE_URL, assetUrl } from './api';
import type { BusinessHour, Faq, Order, Product, SettingsMap } from './types';
import { toNumber } from './format';

interface SeoProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string | null;
  canonical?: string;
  type?: 'website' | 'article' | 'product';
  noindex?: boolean;
  settings?: SettingsMap;
  /** Extra JSON-LD blocks appended to the document head. */
  schema?: Record<string, unknown>[];
}

function str(settings: SettingsMap | undefined, key: string, fallback = ''): string {
  const value = settings?.[key];
  return typeof value === 'string' && value ? value : fallback;
}

export function Seo({
  title,
  description,
  keywords,
  image,
  canonical,
  type = 'website',
  noindex = false,
  settings,
  schema = [],
}: SeoProps) {
  const siteName = str(settings, 'brand.name', 'Beyond Walls');
  const template = str(settings, 'seo.titleTemplate', '{page} | Beyond Walls');
  const defaultTitle = str(settings, 'seo.defaultTitle', 'Beyond Walls — Nameplates & Signage');
  const defaultDescription = str(settings, 'seo.defaultDescription', '');
  const siteUrl = str(settings, 'seo.siteUrl', SITE_URL).replace(/\/+$/, '');

  // Don't apply the "{page} | Brand" template when the title already names the
  // brand — an admin-written SEO title often includes it already.
  const titleHasBrand =
    Boolean(title) && siteName.length > 0 && title!.toLowerCase().includes(siteName.toLowerCase());
  const pageTitle = title ? (titleHasBrand ? title : template.replace('{page}', title)) : defaultTitle;
  const pageDescription = description || defaultDescription;
  const pageImage = assetUrl(image || (settings?.['seo.defaultOgImage'] as string | null));
  const url = canonical
    ? canonical.startsWith('http')
      ? canonical
      : `${siteUrl}${canonical}`
    : `${siteUrl}${typeof window !== 'undefined' ? window.location.pathname : ''}`;

  const robots = noindex ? 'noindex, nofollow' : str(settings, 'seo.robots', 'index, follow');
  const verification = str(settings, 'seo.googleSiteVerification');

  return (
    <Helmet prioritizeSeoTags>
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />
      {keywords ? <meta name="keywords" content={keywords} /> : null}
      <meta name="robots" content={robots} />
      <link rel="canonical" href={url} />
      {verification ? <meta name="google-site-verification" content={verification} /> : null}

      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:url" content={url} />
      {pageImage ? <meta property="og:image" content={pageImage} /> : null}
      <meta property="og:locale" content="en_IN" />

      <meta name="twitter:card" content={pageImage ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDescription} />
      {pageImage ? <meta name="twitter:image" content={pageImage} /> : null}

      {schema.map((block, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <script key={index} type="application/ld+json">
          {JSON.stringify(block)}
        </script>
      ))}
    </Helmet>
  );
}

// ---------------------------------------------------------------------------
// Schema.org builders
// ---------------------------------------------------------------------------

const DAY_MAP: Record<string, string> = {
  Monday: 'Monday',
  Tuesday: 'Tuesday',
  Wednesday: 'Wednesday',
  Thursday: 'Thursday',
  Friday: 'Friday',
  Saturday: 'Saturday',
  Sunday: 'Sunday',
};

/** LocalBusiness — built strictly from the details the client supplied. */
export function localBusinessSchema(settings: SettingsMap): Record<string, unknown> {
  const siteUrl = str(settings, 'seo.siteUrl', SITE_URL).replace(/\/+$/, '');
  const hours = (settings['hours.schedule'] as BusinessHour[] | undefined) ?? [];
  const addressLines = (settings['contact.addressLines'] as string[] | undefined) ?? [];
  const social = ['instagram', 'facebook', 'linkedin', 'youtube', 'pinterest']
    .map((k) => settings[`social.${k}`])
    .filter((v): v is string => typeof v === 'string' && v.length > 0);

  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${siteUrl}/#business`,
    name: str(settings, 'brand.name', 'Beyond Walls'),
    url: siteUrl,
    telephone: str(settings, 'contact.phone'),
    email: str(settings, 'contact.email'),
    ...(str(settings, 'brand.logoImage')
      ? { logo: assetUrl(str(settings, 'brand.logoImage')) }
      : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: addressLines.slice(0, -1).join(', ') || addressLines.join(', '),
      addressLocality: str(settings, 'contact.city', 'Ahmedabad'),
      addressRegion: str(settings, 'contact.state', 'Gujarat'),
      postalCode: str(settings, 'contact.postalCode', '380001'),
      addressCountry: 'IN',
    },
    openingHoursSpecification: hours
      .filter((h) => !h.closed && h.open && h.close)
      .map((h) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${DAY_MAP[h.day] ?? h.day}`,
        opens: h.open,
        closes: h.close,
      })),
    ...(social.length ? { sameAs: social } : {}),
  };
}

export function websiteSchema(settings: SettingsMap): Record<string, unknown> {
  const siteUrl = str(settings, 'seo.siteUrl', SITE_URL).replace(/\/+$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    name: str(settings, 'brand.name', 'Beyond Walls'),
    url: siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/shop?search={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Product schema. An `offers` block is only emitted when a real price exists —
 * a price-on-request product advertises availability, not an invented price.
 */
export function productSchema(product: Product, settings: SettingsMap): Record<string, unknown> {
  const siteUrl = str(settings, 'seo.siteUrl', SITE_URL).replace(/\/+$/, '');
  const price = toNumber(product.price);
  const inStock = !product.trackInventory || product.stock > 0;

  const published = (product.reviews ?? []).filter((r) => r.rating > 0);
  const aggregate = published.length
    ? {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: (published.reduce((s, r) => s + r.rating, 0) / published.length).toFixed(1),
          reviewCount: published.length,
        },
      }
    : {};

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription || product.description?.slice(0, 300) || '',
    image: product.images.map((i) => assetUrl(i.url)),
    ...(product.sku ? { sku: product.sku } : {}),
    brand: { '@type': 'Brand', name: str(settings, 'brand.name', 'Beyond Walls') },
    ...(product.category ? { category: product.category.name } : {}),
    url: `${siteUrl}/product/${product.slug}`,
    ...aggregate,
    ...(price !== null
      ? {
          offers: {
            '@type': 'Offer',
            price: price.toFixed(2),
            priceCurrency: 'INR',
            availability: inStock
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
            url: `${siteUrl}/product/${product.slug}`,
            seller: { '@type': 'Organization', name: str(settings, 'brand.name', 'Beyond Walls') },
          },
        }
      : {
          offers: {
            '@type': 'Offer',
            availability: 'https://schema.org/InStock',
            priceCurrency: 'INR',
            url: `${siteUrl}/product/${product.slug}`,
            // No price is published, because none has been set.
            priceSpecification: {
              '@type': 'PriceSpecification',
              valueAddedTaxIncluded: true,
            },
          },
        }),
  };
}

export function breadcrumbSchema(
  crumbs: { name: string; href: string }[],
  settings: SettingsMap,
): Record<string, unknown> {
  const siteUrl = str(settings, 'seo.siteUrl', SITE_URL).replace(/\/+$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: `${siteUrl}${crumb.href}`,
    })),
  };
}

export function faqSchema(faqs: Faq[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

export function collectionSchema(
  name: string,
  description: string,
  products: Product[],
  settings: SettingsMap,
): Record<string, unknown> {
  const siteUrl = str(settings, 'seo.siteUrl', SITE_URL).replace(/\/+$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${siteUrl}/product/${product.slug}`,
        name: product.name,
      })),
    },
  };
}

export function orderSchema(order: Order, settings: SettingsMap): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Order',
    orderNumber: order.orderNumber,
    orderStatus: `https://schema.org/OrderStatus/Order${
      order.status === 'DELIVERED' ? 'Delivered' : order.status === 'CANCELLED' ? 'Cancelled' : 'Processing'
    }`,
    priceCurrency: order.currency,
    price: String(order.total),
    seller: { '@type': 'Organization', name: str(settings, 'brand.name', 'Beyond Walls') },
  };
}
