import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Faq, HomeSection } from '../lib/types';
import { Seo, faqSchema, localBusinessSchema, websiteSchema } from '../lib/seo';
import { useSettings } from '../context/StoreProvider';
import { ButtonLink, Skeleton } from '../components/ui';
import { SectionRenderer } from '../components/home/Sections';

export default function HomePage() {
  const { settings } = useSettings();

  const sectionsQuery = useQuery({
    queryKey: ['home-sections'],
    queryFn: () => api.get<HomeSection[]>('/home'),
    staleTime: 2 * 60 * 1000,
  });

  const sections = sectionsQuery.data ?? [];
  const faqs = (sections.find((s) => s.type === 'FAQ')?.items ?? []) as Faq[];

  const schema = [
    localBusinessSchema(settings),
    websiteSchema(settings),
    ...(faqs.length ? [faqSchema(faqs)] : []),
  ];

  return (
    <>
      <Seo settings={settings} canonical="/" schema={schema} />

      {sectionsQuery.isLoading ? (
        <HomeSkeleton />
      ) : sections.length === 0 ? (
        <EmptyHome />
      ) : (
        sections.map((section) => <SectionRenderer key={section.id} section={section} />)
      )}
    </>
  );
}

function HomeSkeleton() {
  return (
    <>
      <div className="bg-ink">
        <div className="container-site flex min-h-[78vh] max-w-3xl flex-col justify-center py-20">
          <Skeleton className="h-3 w-24 opacity-20" />
          <Skeleton className="mt-6 h-16 w-full opacity-20" />
          <Skeleton className="mt-3 h-16 w-2/3 opacity-20" />
          <Skeleton className="mt-7 h-4 w-96 max-w-full opacity-20" />
          <Skeleton className="mt-10 h-14 w-56 opacity-20" />
        </div>
      </div>
      <div className="container-site py-14">
        <Skeleton className="h-8 w-56" />
        <div className="mt-8 grid auto-rows-[220px] grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 5 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={i} className={i === 0 ? 'col-span-2 row-span-2 h-full w-full' : 'h-full w-full'} />
          ))}
        </div>
      </div>
    </>
  );
}

function EmptyHome() {
  return (
    <div className="container-site py-24 text-center">
      <p className="eyebrow mb-4">Beyond Walls</p>
      <h1 className="text-3xl">The homepage has not been set up yet</h1>
      <p className="mx-auto mt-4 max-w-md text-sm text-ink-500">
        Sign in to the admin panel and publish your homepage sections to see them here.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <ButtonLink to="/shop" variant="secondary">
          Browse the shop
        </ButtonLink>
        <ButtonLink to="/admin">Open admin</ButtonLink>
      </div>
    </div>
  );
}
