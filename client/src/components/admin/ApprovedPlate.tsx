import { useRef } from 'react';
import { PlateSnapshot, type PreviewSnapshot } from '../product/PlateSnapshot';
import { SavePreview } from '../product/SavePreview';

/**
 * The plate as the customer approved it, on the studio's order screen.
 *
 * The answers listed under it are what gets cut; this is what the customer
 * looked at when they agreed to it -- face, sizes and where each line sits.
 * Downloadable, so the proof sent on WhatsApp before production is the same
 * picture the customer already saw rather than one redrawn from the answers.
 */
export function ApprovedPlate({ preview, name }: { preview: PreviewSnapshot; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="mt-3 border border-stone-line p-3">
      <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-architect text-ink-400">
        Plate the customer approved
      </p>
      <div ref={ref} className="max-w-md">
        <PlateSnapshot preview={preview} />
      </div>
      <div className="max-w-md">
        <SavePreview target={ref} name={name} />
      </div>
    </div>
  );
}
