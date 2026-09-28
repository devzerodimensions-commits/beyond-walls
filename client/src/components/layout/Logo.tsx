import clsx from 'clsx';
import { assetUrl } from '../../lib/api';
import { useSettings } from '../../context/StoreProvider';

/**
 * The Beyond Walls mark.
 *
 * The artwork is the logo from the brand book, converted to SVG from the
 * supplied PDF. It is two overlapping plates with a drop shadow — a nameplate,
 * which is what the business makes.
 *
 * Because the plates are an ink one behind an off-white one, the dark-background
 * version is not simply "the same mark in white": the two plate colours swap, so
 * it still reads as a plate rather than flattening into a silhouette. That is
 * what `logo-light.svg` is.
 *
 * An image uploaded in Admin → Brand still wins, so the client can replace it
 * without waiting for a developer.
 */

type LogoProps = {
  className?: string;
  /** For dark backgrounds — the footer, the admin rail, the hero. */
  inverted?: boolean;
  /** The square BW monogram, for tight spaces. */
  mark?: boolean;
};

export function Logo({ className, inverted, mark }: LogoProps) {
  const { get } = useSettings();

  const uploaded = get<string | null>(inverted ? 'brand.logoImageDark' : 'brand.logoImage', null);
  const name = get<string>('brand.name', 'Beyond Walls');
  const tagline = get<string>('brand.logoTagline', '');

  const src = uploaded
    ? assetUrl(uploaded)
    : mark
      ? inverted ? '/brand/logo-mark-light.svg' : '/brand/logo-mark.svg'
      : inverted ? '/brand/logo-light.svg' : '/brand/logo.svg';

  return (
    <span className={clsx('inline-flex flex-col', className)}>
      <img
        src={src}
        alt={name}
        /*
         * Sized by height so the mark keeps its proportions in the header, the
         * footer and the admin rail without each one guessing a width.
         */
        className={clsx('w-auto object-contain', mark ? 'h-9 sm:h-10' : 'h-8 sm:h-9')}
      />
      {tagline && !mark ? (
        <span
          className={clsx(
            'mt-1.5 text-[0.5rem] font-medium uppercase tracking-wider2 sm:text-[0.55rem]',
            inverted ? 'text-paper/50' : 'text-ink-400',
          )}
        >
          {tagline}
        </span>
      ) : null}
    </span>
  );
}
