import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { assetUrl } from '../../lib/api';
import type { MediaAsset } from '../../lib/types';
import { Button, Select } from '../ui';

/**
 * Crop, turn and adjust an image already in the library.
 *
 * Hand-rolled rather than brought in as a dependency, the same way the CSV
 * reader was: what is needed here is a rectangle with eight handles, and the
 * cropping libraries that do that also bring zooming, gestures and a canvas
 * pipeline this never uses.
 *
 * Nothing is done to the picture in the browser. The rectangle is measured as
 * fractions of the displayed image and sent to the server, which re-cuts the
 * original at full resolution — so the result is never a crop of whatever
 * downscaled copy happened to be on screen.
 *
 * The preview shows rotation, flipping and the three adjustments live, through
 * CSS, in the order the server applies them. The crop rectangle is drawn over
 * the image as it is shown, already turned, because a rectangle dragged over
 * one orientation and applied to another is the single easiest thing to get
 * wrong here.
 */

export interface ImageEditPayload {
  crop?: { left: number; top: number; width: number; height: number };
  rotate: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  brightness: number;
  saturation: number;
  contrast: number;
}

/** Fractions of the displayed image: 0..1, so the box survives a resize. */
interface Rect { x: number; y: number; w: number; h: number }

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

const ASPECTS: { value: string; label: string; ratio: number | null }[] = [
  { value: 'free', label: 'Free', ratio: null },
  { value: '1:1', label: 'Square 1:1', ratio: 1 },
  { value: '4:5', label: 'Portrait 4:5', ratio: 4 / 5 },
  { value: '3:4', label: 'Portrait 3:4', ratio: 3 / 4 },
  { value: '4:3', label: 'Landscape 4:3', ratio: 4 / 3 },
  { value: '3:2', label: 'Landscape 3:2', ratio: 3 / 2 },
  { value: '16:9', label: 'Wide 16:9', ratio: 16 / 9 },
];

const ADJUSTMENTS = [
  { key: 'brightness' as const, label: 'Brightness' },
  { key: 'contrast' as const, label: 'Contrast' },
  { key: 'saturation' as const, label: 'Saturation' },
];

/** The eight grips, as unit vectors from the centre of the box. */
const HANDLES = [
  { id: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
  { id: 'n', x: 0.5, y: 0, cursor: 'ns-resize' },
  { id: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { id: 'e', x: 1, y: 0.5, cursor: 'ew-resize' },
  { id: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
  { id: 's', x: 0.5, y: 1, cursor: 'ns-resize' },
  { id: 'sw', x: 0, y: 1, cursor: 'nesw-resize' },
  { id: 'w', x: 0, y: 0.5, cursor: 'ew-resize' },
];

const MIN = 0.06; // of the frame, so a box can never be dragged to nothing

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function ImageEditor({
  asset, busy, onApply, onCancel,
}: {
  asset: MediaAsset;
  busy?: boolean;
  onApply: (payload: ImageEditPayload) => void;
  onCancel: () => void;
}) {
  const [rect, setRect] = useState<Rect>(FULL);
  const [aspect, setAspect] = useState('free');
  const [rotate, setRotate] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [adjust, setAdjust] = useState({ brightness: 1, contrast: 1, saturation: 1 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ handle: string | null; startX: number; startY: number; start: Rect } | null>(null);

  const ratio = ASPECTS.find((a) => a.value === aspect)?.ratio ?? null;

  /*
   * A quarter turn swaps the frame, so the ratio a person picks has to be
   * measured against the picture as they see it. Without this, choosing 16:9
   * on a rotated photo would give a 9:16 crop.
   */
  const quarterTurned = rotate === 90 || rotate === 270;
  const displayed = natural
    ? { w: quarterTurned ? natural.h : natural.w, h: quarterTurned ? natural.w : natural.h }
    : null;

  /** Forces a rect to the chosen aspect, keeping it inside the frame. */
  const applyAspect = useCallback((r: Rect, frameRatio: number, target: number | null): Rect => {
    if (!target) return r;
    // Work in frame-relative units where the box's real shape is w*frameRatio : h.
    let w = r.w;
    let h = (r.w * frameRatio) / target;
    if (h > 1) { h = 1; w = (h * target) / frameRatio; }
    const x = clamp01(Math.min(r.x, 1 - w));
    const y = clamp01(Math.min(r.y, 1 - h));
    return { x, y, w, h };
  }, []);

  // Re-fit the box whenever the aspect or the orientation changes.
  useEffect(() => {
    if (!displayed) return;
    setRect((r) => applyAspect(r, displayed.w / displayed.h, ratio));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, rotate, displayed?.w, displayed?.h]);

  const onPointerDown = (e: React.PointerEvent, handle: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { handle, startX: e.clientX, startY: e.clientY, start: rect };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || !frame || !displayed) return;

    const box = frame.getBoundingClientRect();
    const dx = (e.clientX - drag.startX) / box.width;
    const dy = (e.clientY - drag.startY) / box.height;
    const frameRatio = box.width / box.height;
    const s = drag.start;

    if (!drag.handle) {
      // Moving the whole box: it may slide to the edges but not past them.
      setRect({
        ...s,
        x: clamp01(Math.min(s.x + dx, 1 - s.w)),
        y: clamp01(Math.min(s.y + dy, 1 - s.h)),
      });
      return;
    }

    const h = HANDLES.find((k) => k.id === drag.handle)!;
    let { x, y, w, h: height } = s;

    if (h.x === 0) { const nx = clamp01(Math.min(s.x + dx, s.x + s.w - MIN)); w = s.w + (s.x - nx); x = nx; }
    if (h.x === 1) { w = Math.max(MIN, Math.min(s.w + dx, 1 - s.x)); }
    if (h.y === 0) { const ny = clamp01(Math.min(s.y + dy, s.y + s.h - MIN)); height = s.h + (s.y - ny); y = ny; }
    if (h.y === 1) { height = Math.max(MIN, Math.min(s.h + dy, 1 - s.y)); }

    if (ratio) {
      // Keep the locked shape by deriving the other side, anchored on the
      // corner opposite the one being dragged.
      const wanted = (height * ratio) / frameRatio;
      if (h.x === 0.5) {
        const centreX = x + w / 2;
        w = Math.min(wanted, 1);
        x = clamp01(Math.min(Math.max(0, centreX - w / 2), 1 - w));
      } else {
        w = Math.min(w, 1 - (h.x === 0 ? 0 : x));
        height = Math.min((w * frameRatio) / ratio, 1);
        if (h.y === 0) y = clamp01(Math.min(s.y + s.h - height, 1 - height));
        if (h.x === 0) x = clamp01(Math.min(s.x + s.w - w, 1 - w));
      }
      if (y + height > 1) { height = 1 - y; w = (height * ratio) / frameRatio; }
    }

    setRect({ x: clamp01(x), y: clamp01(y), w: Math.max(MIN, w), h: Math.max(MIN, height) });
  };

  const endDrag = () => { dragRef.current = null; };

  const reset = () => {
    setRect(FULL);
    setAspect('free');
    setRotate(0);
    setFlipH(false);
    setFlipV(false);
    setAdjust({ brightness: 1, contrast: 1, saturation: 1 });
  };

  const isWholeFrame = rect.x <= 0.001 && rect.y <= 0.001 && rect.w >= 0.999 && rect.h >= 0.999;
  const untouched = isWholeFrame && !rotate && !flipH && !flipV
    && adjust.brightness === 1 && adjust.contrast === 1 && adjust.saturation === 1;

  const apply = () => {
    if (!displayed) return;
    onApply({
      // A full-frame rectangle is not a crop; sending one would re-encode the
      // picture for nothing.
      crop: isWholeFrame ? undefined : {
        left: Math.round(rect.x * displayed.w),
        top: Math.round(rect.y * displayed.h),
        width: Math.round(rect.w * displayed.w),
        height: Math.round(rect.h * displayed.h),
      },
      rotate,
      flipHorizontal: flipH,
      flipVertical: flipV,
      ...adjust,
    });
  };

  const cropPixels = displayed
    ? `${Math.round(rect.w * displayed.w)} × ${Math.round(rect.h * displayed.h)}`
    : '—';

  return (
    <div className="space-y-4">
      <div
        className="relative mx-auto flex max-h-[46vh] justify-center overflow-hidden bg-[color:var(--a-sunken)] p-3"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <div
          ref={frameRef}
          className="relative touch-none select-none"
          style={{
            // The frame is the picture's own shape, so the overlay's fractions
            // map straight onto pixels with no letterboxing to compensate for.
            aspectRatio: displayed ? `${displayed.w} / ${displayed.h}` : undefined,
            maxHeight: '42vh',
            maxWidth: '100%',
            height: displayed ? undefined : '42vh',
          }}
        >
          <img
            src={assetUrl(asset.url)}
            alt=""
            draggable={false}
            onLoad={(e) => setNatural({
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            })}
            className="h-full w-full object-contain"
            style={{
              transform: `rotate(${rotate}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
              // A quarter turn inside a box of the turned shape needs the
              // image scaled to the box's other axis, or it overflows.
              transformOrigin: 'center',
              filter: `brightness(${adjust.brightness}) contrast(${adjust.contrast}) saturate(${adjust.saturation})`,
              ...(quarterTurned && displayed
                ? { width: `${(displayed.h / displayed.w) * 100}%`, height: `${(displayed.w / displayed.h) * 100}%`, position: 'absolute', left: '50%', top: '50%', translate: '-50% -50%' }
                : {}),
            }}
          />

          {/* Everything outside the box, dimmed. Four strips rather than a
              box-shadow so the cut-out edge stays crisp at any size. */}
          {[
            { top: 0, left: 0, right: 0, height: `${rect.y * 100}%` },
            { top: `${(rect.y + rect.h) * 100}%`, left: 0, right: 0, bottom: 0 },
            { top: `${rect.y * 100}%`, left: 0, width: `${rect.x * 100}%`, height: `${rect.h * 100}%` },
            { top: `${rect.y * 100}%`, left: `${(rect.x + rect.w) * 100}%`, right: 0, height: `${rect.h * 100}%` },
          ].map((style, i) => (
            <div key={i} aria-hidden="true" className="pointer-events-none absolute bg-black/45" style={style} />
          ))}

          <div
            role="presentation"
            onPointerDown={(e) => onPointerDown(e, null)}
            className="absolute cursor-move border border-white/90"
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.w * 100}%`,
              height: `${rect.h * 100}%`,
            }}
          >
            {/* Thirds, the standard guide for placing a subject. */}
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/25" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/25" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/25" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/25" />

            {HANDLES.map((h) => (
              <span
                key={h.id}
                role="presentation"
                onPointerDown={(e) => onPointerDown(e, h.id)}
                className="absolute h-3.5 w-3.5 rounded-full border border-ink/40 bg-white shadow"
                style={{
                  left: `${h.x * 100}%`,
                  top: `${h.y * 100}%`,
                  translate: '-50% -50%',
                  cursor: h.cursor,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <Select
            label="Crop shape"
            value={aspect}
            onChange={(e) => setAspect(e.target.value)}
            options={ASPECTS.map((a) => ({ value: a.value, label: a.label }))}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setRotate((r) => (r + 270) % 360)}>
              Rotate left
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRotate((r) => (r + 90) % 360)}>
              Rotate right
            </Button>
            <Button
              size="sm"
              variant={flipH ? 'primary' : 'secondary'}
              onClick={() => setFlipH((v) => !v)}
            >
              Flip across
            </Button>
            <Button
              size="sm"
              variant={flipV ? 'primary' : 'secondary'}
              onClick={() => setFlipV((v) => !v)}
            >
              Flip down
            </Button>
          </div>
          <p className="text-2xs text-[color:var(--a-faint)]">
            Crop area {cropPixels} pixels
            {displayed ? ` · original ${displayed.w} × ${displayed.h}` : ''}
          </p>
        </div>

        <div className="space-y-3">
          {ADJUSTMENTS.map((a) => (
            <label key={a.key} className="block">
              <span className="flex items-baseline justify-between text-xs">
                <span>{a.label}</span>
                <span className="text-[color:var(--a-faint)]">
                  {Math.round((adjust[a.key] - 1) * 100)}%
                </span>
              </span>
              <input
                type="range"
                min={0.4}
                max={1.8}
                step={0.02}
                value={adjust[a.key]}
                onChange={(e) => setAdjust((v) => ({ ...v, [a.key]: Number(e.target.value) }))}
                className="mt-1.5 w-full accent-[color:var(--a-accent)]"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[color:var(--a-line)] pt-4">
        <Button variant="ghost" size="sm" onClick={reset} disabled={untouched}>
          Reset
        </Button>
        <span className="flex-1" />
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" loading={busy} disabled={untouched} onClick={apply}>
          Apply changes
        </Button>
      </div>
    </div>
  );
}
