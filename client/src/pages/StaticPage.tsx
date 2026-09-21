import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, assetUrl } from '../lib/api';
import type { Page } from '../lib/types';
import { renderMarkdown } from '../lib/format';
import { Seo, breadcrumbSchema } from '../lib/seo';
import { useSettings } from '../context/StoreProvider';
import { ButtonLink, EmptyState, PageLoader } from '../components/ui';

/** Renders any published CMS page: /about, /privacy-policy, and so on. */
export default function StaticPage() {
  const { slug } = useParams();
  const { settings } = useSettings();

  const { data: page, isLoading, isError } = useQuery({
    queryKey: ['page', slug],
    queryFn: () => api.get<Page>(`/pages/${slug}`),
    enabled: Boolean(slug),
    retry: false,
  });

  if (isLoading) return <PageLoader />;

  if (isError || !page) {
    return (
      <div className="container-site py-24">
        <EmptyState
          title="Page not found"
          description="This page does not exist, or has not been published yet."
          action={<ButtonLink to="/">Back to home</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <>
      <Seo
        settings={settings}
        title={page.seoTitle || page.title}
        description={page.seoDescription || page.excerpt || ''}
        keywords={page.seoKeywords ?? undefined}
        image={page.ogImage || page.heroImage}
        canonical={`/${page.slug}`}
        type="article"
        schema={[
          breadcrumbSchema(
            [
              { name: 'Home', href: '/' },
              { name: page.title, href: `/${page.slug}` },
            ],
            settings,
          ),
        ]}
      />

      {page.heroImage ? (
        <div className="relative h-56 w-full overflow-hidden bg-paper-warm lg:h-80">
          <img src={assetUrl(page.heroImage)} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}

      <article className="container-site py-12 lg:py-18">
        <header className="mx-auto max-w-3xl">
          <h1 className="text-3xl lg:text-4xl">{page.title}</h1>
          {page.excerpt ? (
            <p className="mt-4 text-base leading-relaxed text-ink-500">{page.excerpt}</p>
          ) : null}
        </header>

        <div
          className="prose-bw mx-auto mt-10 max-w-3xl text-sm leading-relaxed text-ink-600"
          // Content comes from the admin panel and is escaped by renderMarkdown
          // before any markup is produced.
          dangerouslySetInnerHTML={{ __html: renderMarkdown(page.content) }}
        />
      </article>
    </>
  );
}
