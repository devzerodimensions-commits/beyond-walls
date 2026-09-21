import clsx from 'clsx';
import { assetUrl } from '../../lib/api';
import { useSettings } from '../../context/StoreProvider';

/**
 * Text wordmark until the client supplies artwork. The moment a logo image is
 * uploaded in Admin → Brand, it replaces the text mark everywhere.
 */
export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  const { get } = useSettings();
  const logoImage = get<string | null>(inverted ? 'brand.logoImageDark' : 'brand.logoImage', null);
  const logoText = get<string>('brand.logoText', 'BEYOND WALLS');
  const tagline = get<string>('brand.logoTagline', '');

  if (logoImage) {
    return (
      <img
        src={assetUrl(logoImage)}
        alt={get<string>('brand.name', 'Beyond Walls')}
        className={clsx('h-8 w-auto object-contain sm:h-9', className)}
      />
    );
  }

  return (
    <span className={clsx('flex flex-col leading-none', className)}>
      <span className="font-display text-base font-semibold tracking-wider2 sm:text-lg">
        {logoText}
      </span>
      {tagline ? (
        <span className="mt-1 text-[0.5rem] font-medium uppercase tracking-wider2 text-ink-400 sm:text-[0.55rem]">
          {tagline}
        </span>
      ) : null}
    </span>
  );
}
