import clsx from 'clsx';
import { assetUrl } from '../../lib/api';
import { LivePreview, type PreviewSlots } from './LivePreview';

/**
 * The plate a customer approved, drawn again from what was kept with the line.
 *
 * Shown wherever their order is shown -- the cart, the checkout, the order
 * page and the studio's production screen -- so the picture they agreed to
 * follows the order instead of staying behind on the product page. Drawn from
 * the snapshot, never from the product as it is now.
 */
export interface PreviewSnapshot {
  template: string;
  config: Record<string, unknown> | null;
  slots: PreviewSlots;
  scales?: Record<string, number>;
  /** What each code is called, kept beside the links it names. */
  qrLabels?: Record<string, string>;
}

/**
 * Lines the customer left empty stay empty. The product's sample words fill
 * an empty plate on the product page; on an order they would read as part of
 * what was ordered.
 */
const NOTHING: PreviewSlots = { number: ' ', line1: ' ', line2: ' ', line3: ' ' };

export function PlateSnapshot({
  preview, className, framed = true,
}: {
  preview: PreviewSnapshot;
  className?: string;
  /** Off for a thumbnail, where the frame and its padding would leave no plate. */
  framed?: boolean;
}) {
  return (
    <LivePreview
      template={preview.template}
      config={preview.config}
      slots={preview.qrLabels ? { ...preview.slots, qrLabels: preview.qrLabels } : preview.slots}
      scales={preview.scales}
      placeholders={NOTHING}
      hideLabel
      hideCaption
      className={clsx(!framed && '!p-1.5 sm:!p-2', className)}
    />
  );
}

/** A line's picture: the customer's own plate when there is one, else the product photograph. */
export function LineThumb({
  preview, image, alt, className,
}: {
  preview?: PreviewSnapshot | null;
  image: string | null;
  alt: string;
  /** Size classes for the photograph fallback. */
  className: string;
}) {
  if (preview) {
    return (
      <span className="block w-24 shrink-0 sm:w-28" title="Your plate, as you made it">
        <PlateSnapshot preview={preview} framed={false} className="border border-stone-line" />
      </span>
    );
  }
  return <img src={assetUrl(image)} alt={alt} className={className} />;
}
