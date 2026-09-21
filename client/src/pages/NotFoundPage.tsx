import { Seo } from '../lib/seo';
import { useSettings } from '../context/StoreProvider';
import { ButtonLink } from '../components/ui';

export default function NotFoundPage() {
  const { settings } = useSettings();

  return (
    <>
      <Seo settings={settings} title="Page not found" noindex />
      <div className="container-site flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <p className="font-mono text-2xs uppercase tracking-architect text-ink-300">Error 404</p>
        <h1 className="mt-5 text-4xl lg:text-5xl">This page does not exist</h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-500">
          The link may be out of date, or the page may have been moved.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <ButtonLink to="/">Back to home</ButtonLink>
          <ButtonLink to="/shop" variant="secondary">
            Browse the shop
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
