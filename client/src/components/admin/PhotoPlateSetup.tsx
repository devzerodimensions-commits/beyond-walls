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
interface Rect {
  x: number; y: number; w: number; h: number;
  /** Words the customer types, or a symbol they choose (Ganesha, Om ...). */
  kind?: 'words' | 'symbol';
  /** What to call a symbol in the library. */
  label?: string;
}

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

/**
 * Follows one press across the whole window until it is let go.
 *
 * Listening on the picture alone lost a quick drag the moment the pointer
 * outran it, and the dot stopped short of the corner. The release is
 * reported with its own position, so the dot always lands where it was
 * dropped.
 */
function follow(element: Element, onMove: (p: Point) => void, onEnd: (p: Point) => void) {
  const move = (e: PointerEvent) => onMove(fractionOf(e, element));
  const end = (e: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    onEnd(fractionOf(e, element));
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
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
  const moveCorner = (index: number, point: Point) =>
    setCorners((current) => current.map((c, i) => (i === index ? point : c)));

  /*
   * Pressing anywhere on the photograph brings the nearest dot there, and it
   * follows the pointer until it is let go. Clicking the plate's four corners
   * one after another is all it takes; dragging works too.
   */
  const onPhotoDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!surface.current) return;
    event.preventDefault();
    const point = fractionOf(event, surface.current);
    let nearest = 0;
    corners.forEach((c, i) => {
      if (Math.hypot(c.x - point.x, c.y - point.y) < Math.hypot(corners[nearest].x - point.x, corners[nearest].y - point.y)) nearest = i;
    });
    moveCorner(nearest, point);
    follow(surface.current, (p) => moveCorner(nearest, p), (p) => moveCorner(nearest, p));
  };
  const onDotDown = (index: number) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!surface.current) return;
    event.preventDefault();
    event.stopPropagation();
    follow(surface.current, (p) => moveCorner(index, p), (p) => moveCorner(index, p));
  };

  // ---- line boxes -----------------------------------------------------------
  const onDrawStart = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!surface.current) return;
    event.preventDefault();
    const from = fractionOf(event, surface.current);
    setDrawing({ from, to: from });
    follow(
      surface.current,
      (to) => setDrawing({ from, to }),
      (to) => {
        setDrawing(null);
        const box = { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) };
        if (box.w > 0.03 && box.h > 0.015) setLines((current) => [...current, { ...box, kind: 'words' as const }].slice(0, 6));
      },
    );
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
        Set it up by hand — from a photo, or with a symbol
      </Button>
      <p className="mt-1 text-2xs leading-relaxed text-ink-400">
        For a product with only photographs, or a plate with a symbol customers can change (Ganesha,
        Om, Swastik). You mark the plate’s corners — skipped for a flat design file — and box each line
        and symbol; only what you box is taken off.
      </p>

      <Modal
        open={open}
        onClose={close}
        size="xl"
        title={
          step === 'pick' ? 'Choose the photograph'
            : step === 'corners' ? 'Step 1 of 2 — put the four dots on the plate’s corners'
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
              <div className="flex flex-wrap items-center gap-3">
                {/* A design file is already head-on: its symbol and lines can be marked as it is. */}
                <button
                  type="button"
                  className="text-2xs underline underline-offset-2"
                  onClick={() => { if (photo) { setFlat({ url: photo, width: 0, height: 0 }); setLines([]); } }}
                >
                  Already flat — skip this step
                </button>
                <Button size="sm" loading={straighten.isPending} onClick={() => straighten.mutate()}>
                  Straighten the plate
                </Button>
              </div>
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
              Click each corner of the plate itself — not the wall or its shadow. The nearest dot
              jumps there; drag a dot to fine-tune it.
            </p>
            {/* Sized to the dialog's height, so the whole plate is in view without scrolling. */}
            <div className="relative mx-auto w-fit max-w-full select-none">
              <img src={assetUrl(photo)} alt="" className="block max-h-[58vh] w-auto max-w-full" draggable={false} />
              <svg
                ref={surface}
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                onPointerDown={onPhotoDown}
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
                  onPointerDown={onDotDown(i)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {step === 'lines' && flat ? (
          <div>
            <p className="mb-3 text-2xs leading-relaxed text-ink-500">
              Drag a box over each line the customer will change — the name, the surname, the
              number. If the plate has a symbol customers may swap, such as a Ganesha or an Om, box it
              too and mark it as a symbol below. Leave out anything that stays on every plate, like a
              house sign. A box can be loose; a letter that sticks out of it is still taken whole.
            </p>
            <div className="relative mx-auto w-fit max-w-full select-none">
              <img src={assetUrl(flat.url)} alt="The plate, straightened" className="block max-h-[58vh] w-auto max-w-full" draggable={false} />
              <svg
                ref={surface}
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                onPointerDown={onDrawStart}
              >
                {[...lines, ...(live ? [live] : [])].map((r: Rect, i) => (
                  <rect
                    // eslint-disable-next-line react/no-array-index-key
                    key={i}
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    fill={r.kind === 'symbol' ? 'rgba(180,83,9,0.15)' : 'rgba(14,122,87,0.15)'}
                    stroke={r.kind === 'symbol' ? '#B45309' : '#0E7A57'}
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
                  className={`absolute -translate-y-full px-1.5 text-2xs text-white ${r.kind === 'symbol' ? 'bg-[#B45309]' : 'bg-[#0E7A57]'}`}
                  style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%` }}
                  onClick={() => setLines((current) => current.filter((_, k) => k !== i))}
                  aria-label={`Remove box ${i + 1}`}
                >
                  {i + 1} ×
                </button>
              ))}
            </div>

            {lines.length ? (
              <ul className="mx-auto mt-4 max-w-md space-y-2">
                {lines.map((r, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <li key={i} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="w-12 text-ink-400">Box {i + 1}</span>
                    {(['words', 'symbol'] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        aria-pressed={(r.kind ?? 'words') === kind}
                        onClick={() => setLines((current) => current.map((box, k) => (
                          k === i ? { ...box, kind, label: kind === 'symbol' ? box.label || 'Symbol' : box.label } : box
                        )))}
                        className={`border px-2.5 py-1 ${(r.kind ?? 'words') === kind ? 'border-ink bg-ink text-paper' : 'border-stone-line hover:border-ink'}`}
                      >
                        {kind === 'words' ? 'Words' : 'Symbol'}
                      </button>
                    ))}
                    {r.kind === 'symbol' ? (
                      <input
                        className="field min-w-0 flex-1 py-1 text-xs"
                        value={r.label ?? ''}
                        placeholder="Name it, e.g. Ganesha"
                        aria-label={`Name of the symbol in box ${i + 1}`}
                        onChange={(e) => setLines((current) => current.map((box, k) => (k === i ? { ...box, label: e.target.value } : box)))}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {lines.some((r) => r.kind === 'symbol') ? (
              <p className="mx-auto mt-2 max-w-md text-2xs leading-relaxed text-ink-400">
                The symbol is taken off the plate and added to your symbol library. Customers then
                choose from every symbol in the library; the plate starts on this one.
              </p>
            ) : null}
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
