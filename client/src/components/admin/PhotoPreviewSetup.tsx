import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api';
import type { Product } from '../../lib/types';
import { useToast } from '../../context/StoreProvider';
import { LivePreview } from '../product/LivePreview';
import { PreviewSetup } from './PreviewSetup';
import { Badge, Button } from '../ui';

/**
 * Making the live preview out of the product's own photograph.
 *
 * Adding a design used to mean adding code: every plate in the preview was a
 * hand-drawn SVG, so a design the studio made on a Tuesday could not be sold
 * until a developer had redrawn it. That does not survive a catalogue that
 * grows every week, and it is the wrong shape of work -- the studio already
 * has the artwork; nobody should be redrawing it.
 *
 * So this reads the photograph instead. The sample name is painted off it and
 * the customer's words go back where that name sat, which means the preview
 * cannot drift from the product: it is the product.
 *
 * It runs on its own as soon as the step opens, because a studio that has
 * just uploaded the artwork has already said what they want. When the
 * photograph cannot be read -- a sign shot on a wall, a picture rather than
 * flat artwork -- it says why in a sentence and hands over to the older
 * manual setup rather than leaving the step empty.
 */

interface PlateBox {
  slot: string;
  x: number;
  y: number;
  w: number;
  h: number;
  align: 'left' | 'center' | 'right';
}

interface PlateResult {
  ok: boolean;
  reason: string;
  image: string | null;
  aspect: { width: number; height: number } | null;
  plateColor: string | null;
  textColor: string | null;
  boxes: PlateBox[];
  fields?: number;
}

/** Shown in the boxes so the studio can see the plate working. */
const SAMPLE: Record<string, string> = {
  line1: 'Aarav',
  line2: 'Saanvi',
  line3: 'Sharma',
  number: 'B 102',
};

export function PhotoPreviewSetup({
  productId, product, hasImage, onApplied,
}: {
  productId: string;
  /** The product as it stands, for drawing the result. */
  product: Product | null | undefined;
  hasImage: boolean;
  onApplied: () => void;
}) {
  const { push } = useToast();
  const [result, setResult] = useState<PlateResult | null>(null);
  const [byHand, setByHand] = useState(false);

  const read = useMutation({
    mutationFn: () => api.post<PlateResult>(`/admin/products/${productId}/preview-from-photo`, {}),
    onSuccess: (data) => {
      setResult(data);
      if (data.ok) {
        push('Live preview made from the photograph', 'success');
        onApplied();
      }
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not read the photograph', 'error'),
  });

  /*
   * Run once, by itself.
   *
   * Guarded by a ref rather than by the mutation's own state: in development
   * React mounts every component twice, and without the guard the studio's
   * photograph is read -- and a second blank plate written to storage -- on
   * every visit to this step.
   */
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !hasImage || byHand) return;
    started.current = true;
    read.mutate();
  }, [hasImage, byHand, read]);

  if (!hasImage) {
    return (
      <p className="text-sm text-ink-500">
        Add a photograph first. The live preview is made from it.
      </p>
    );
  }

  if (byHand) {
    return (
      <div className="space-y-4">
        <PreviewSetup productId={productId} hasImage={hasImage} onApplied={onApplied} />
      </div>
    );
  }

  if (read.isPending || (!result && !read.isError)) {
    return <p className="text-sm text-ink-500">Reading the photograph…</p>;
  }

  if (!result?.ok) {
    return (
      <div className="space-y-4">
        <div className="border border-state-warning/40 bg-state-warning/5 p-4">
          <Badge tone="neutral">Could not read this photograph</Badge>
          <p className="mt-2 text-xs leading-relaxed text-ink-600">
            {result?.reason ?? 'The photograph could not be read.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => read.mutate()} loading={read.isPending}>
            Try again
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setByHand(true)}>
            Set it up by hand
          </Button>
        </div>
      </div>
    );
  }

  const config = (product?.livePreviewConfig ?? null) as Record<string, unknown> | null;

  return (
    <div className="space-y-5">
      <div className="border border-stone-line bg-paper-off p-4">
        <Badge tone="success">Made from the photograph</Badge>
        <p className="mt-2 text-xs leading-relaxed text-ink-600">{result.reason}</p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-ink-500">This is what the customer will see</p>
        <LivePreview
          template="photo"
          slots={{}}
          config={config}
          placeholders={Object.fromEntries(
            result.boxes.map((box) => [box.slot, SAMPLE[box.slot] ?? 'Sample']),
          )}
        />
      </div>

      <div className="border border-stone-line p-4">
        <p className="text-xs font-medium text-ink-500">
          {result.boxes.length} line{result.boxes.length === 1 ? '' : 's'} of writing found
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-600">
          The customer is asked for each one. The wording of the questions is yours to change —
          Products → this product → Personalisation.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-stone-line pt-4">
        <Button size="sm" variant="ghost" onClick={() => read.mutate()} loading={read.isPending}>
          Read it again
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setByHand(true)}>
          Set it up by hand instead
        </Button>
      </div>
    </div>
  );
}
