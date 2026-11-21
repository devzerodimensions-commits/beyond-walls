import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiError, api, assetUrl } from '../../lib/api';
import { useToast } from '../../context/StoreProvider';
import { Button, Modal } from '../ui';
import { MediaPicker } from './AdminKit';

/**
 * Setting a preview up from a photograph, for a product with no design file.
 *
 * The automatic reader needs the flat artwork; a product photographed at an
 * angle on a sunlit wall cannot be read on its own. Two things only a person
 * can say make it work, and this asks for exactly those:
 *
 *  1. Where the plate is -- four corners, dragged into place. The server
 *     unwarps the photograph into a head-on picture of the plate.
 *  2. Where the words are -- a box drawn over each line. Only what is inside
 *     the boxes is painted out; the motif, screws and symbols stay.
 *
 * The straightened plate is kept in the media library, so the product has a
 * flat design picture from then on.
 */

interface Point { x: number; y: number }
interface Rect { x: number; y: number; w: number; h: number }

const START: Point[] = [
  { x: 0.25, y: 0.15 }, { x: 0.75, y: 0.15 }, { x: 0.75, y: 0.85 }, { x: 0.25, y: 0.85 },
];
const CORNER_NAMES = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

/** Where a pointer sits over an element, as fractions of it. */
function fractionOf(event: { clientX: number; clientY: number }, element: Element): Point {
  const box = element.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
    y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
  };
}

export function PhotoPlateSetup({
  productId, photos, busy, onMarked,
}: {
  productId: string;
  /** The product's own pictures, offered first. */
  photos: string[];
  busy: boolean;
  /** Reads the straightened plate with the lines marked on it. */
  onMarked: (flatUrl: string, lines: Rect[]) => void;
}) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [corners, setCorners] = useState<Point[]>(START);
  const [flat, setFlat] = useState<{ url: string; width: number; height: number } | null>(null);
  const [lines, setLines] = useState<Rect[]>([]);
  const [drawing, setDrawing] = useState<{ from: Point; to: Point } | null>(null);
  const dragging = useRef<number | null>(null);
  const surface = useRef<SVGSVGElement>(null);

  const reset = () => {
    setPhoto(null); setCorners(START); setFlat(null); setLines([]); setDrawing(null);
  };
  const close = () => { setOpen(false); reset(); };

  const straighten = useMutation({
    mutationFn: () =>
      api.post<{ url: string; width: number; height: number }>(`/admin/products/${productId}/straighten`, {
        url: photo,
        corners,
      }),
    onSuccess: (result) => { setFlat(result); setLines([]); },
    onError: (err) => push(err instanceof ApiError ? err.message : 'The photograph could not be straightened', 'error'),
  });

  // ---- corners --------------------------------------------------------------
  const onCornerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragging.current === null || !surface.current) return;
    const point = fractionOf(event, surface.current);
    setCorners((current) => current.map((c, i) => (i === dragging.current ? point : c)));
  };

  // ---- line boxes -----------------------------------------------------------
  const onDrawStart = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!surface.current) return;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    const point = fractionOf(event, surface.current);
    setDrawing({ from: point, to: point });
  };
  const onDrawMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing || !surface.current) return;
    setDrawing({ ...drawing, to: fractionOf(event, surface.current) });
  };
  const onDrawEnd = () => {
    if (!drawing) return;
    const x = Math.min(drawing.from.x, drawing.to.x);
    const y = Math.min(drawing.from.y, drawing.to.y);
    const w = Math.abs(drawing.to.x - drawing.from.x);
    const h = Math.abs(drawing.to.y - drawing.from.y);
    setDrawing(null);
    if (w > 0.03 && h > 0.015) setLines((current) => [...current, { x, y, w, h }].slice(0, 6));
  };
  const live = drawing && {
    x: Math.min(drawing.from.x, drawing.to.x),
    y: Math.min(drawing.from.y, drawing.to.y),
    w: Math.abs(drawing.to.x - drawing.from.x),
    h: Math.abs(drawing.to.y - drawing.from.y),
  };

  const step = !photo ? 'pick' : !flat ? 'corners' : 'lines';

  return (
    <div className="mt-4 border-t border-stone-line pt-3">
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => setOpen(true)}>
        No design file? Set it up from a photo
      </Button>
      <p className="mt-1 text-2xs leading-relaxed text-ink-400">
        For a product with only photographs. You mark the plate’s corners and box each line of
        words; the photo is straightened and only those words are taken off.
      </p>

      <Modal
        open={open}
        onClose={close}
        size="xl"
        title={
          step === 'pick' ? 'Choose the photograph'
            : step === 'corners' ? 'Step 1 of 2 — drag the four dots to the plate’s corners'
              : 'Step 2 of 2 — draw a box over each line of words'
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {step !== 'pick' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => (step === 'lines' ? (setFlat(null), setLines([])) : reset())}
                >
                  Back
                </Button>
              ) : null}
            </div>
            {step === 'corners' ? (
              <Button size="sm" loading={straighten.isPending} onClick={() => straighten.mutate()}>
                Straighten the plate
              </Button>
            ) : step === 'lines' ? (
              <div className="flex items-center gap-3">
                {lines.length ? (
                  <button type="button" className="text-2xs underline underline-offset-2" onClick={() => setLines([])}>
                    Clear boxes
                  </button>
                ) : null}
                <Button
                  size="sm"
                  disabled={!lines.length || busy}
                  loading={busy}
                  onClick={() => {
                    if (!flat) return;
                    onMarked(flat.url, lines);
                    close();
                  }}
                >
                  Make the preview
                </Button>
              </div>
            ) : null}
          </div>
        }
      >
        {step === 'pick' ? (
          <div>
            {photos.length ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {photos.map((url) => (
                  <button
                    key={url}
                    type="button"
                    className="border border-stone-line p-1 hover:border-ink"
                    onClick={() => setPhoto(url)}
                  >
                    <img src={assetUrl(url)} alt="" className="aspect-square w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-400">This product has no photographs yet.</p>
            )}
            <Button size="sm" variant="secondary" className="mt-4" onClick={() => setPicking(true)}>
              Choose from the media library
            </Button>
            <p className="mt-3 text-2xs leading-relaxed text-ink-400">
              Pick the clearest picture: the whole plate in view, the words sharp, no caption over it.
            </p>
          </div>
        ) : null}

        {step === 'corners' && photo ? (
          <div>
            <p className="mb-3 text-2xs leading-relaxed text-ink-500">
              Drag each dot onto a corner of the plate itself — not the wall or the shadow. Order does
              not matter for you; the dots are labelled.
            </p>
            <div className="relative mx-auto w-full max-w-2xl select-none">
              <img src={assetUrl(photo)} alt="" className="block w-full" draggable={false} />
              <svg
                ref={surface}
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full touch-none"
                onPointerMove={onCornerMove}
                onPointerUp={() => { dragging.current = null; }}
                onPointerLeave={() => { dragging.current = null; }}
              >
                <polygon
                  points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
                  fill="rgba(14,122,87,0.12)"
                  stroke="#0E7A57"
                  strokeWidth={0.004}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {corners.map((c, i) => (
                <button
                  key={CORNER_NAMES[i]}
                  type="button"
                  aria-label={`Move the ${CORNER_NAMES[i]} corner`}
                  title={CORNER_NAMES[i]}
                  className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-white bg-[#0E7A57] shadow"
                  style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    dragging.current = i;
                    surface.current?.setPointerCapture?.(e.pointerId);
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}

        {step === 'lines' && flat ? (
          <div>
            <p className="mb-3 text-2xs leading-relaxed text-ink-500">
              Drag a box over each line the customer will change — the name, the surname, the
              number. Leave out anything that stays the same on every plate, like a symbol. A box can
              be loose; a letter that sticks out of it is still taken whole.
            </p>
            <div className="relative mx-auto w-full max-w-md select-none">
              <img src={assetUrl(flat.url)} alt="The plate, straightened" className="block w-full" draggable={false} />
              <svg
                ref={surface}
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                onPointerDown={onDrawStart}
                onPointerMove={onDrawMove}
                onPointerUp={onDrawEnd}
              >
                {[...lines, ...(live ? [live] : [])].map((r, i) => (
                  <rect
                    // eslint-disable-next-line react/no-array-index-key
                    key={i}
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    fill="rgba(14,122,87,0.15)"
                    stroke="#0E7A57"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
              {lines.map((r, i) => (
                <button
                  // eslint-disable-next-line react/no-array-index-key
                  key={i}
                  type="button"
                  className="absolute -translate-y-full bg-[#0E7A57] px-1.5 text-2xs text-white"
                  style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%` }}
                  onClick={() => setLines((current) => current.filter((_, k) => k !== i))}
                  aria-label={`Remove box ${i + 1}`}
                >
                  {i + 1} ×
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>

      <MediaPicker
        open={picking}
        accept="image"
        folder="products"
        onClose={() => setPicking(false)}
        onPick={(assets) => {
          setPicking(false);
          if (assets[0]?.url) setPhoto(assets[0].url);
        }}
      />
    </div>
  );
}
