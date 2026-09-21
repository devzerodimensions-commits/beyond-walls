import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { assetUrl } from '../../lib/api';
import type { ProductImage } from '../../lib/types';
import { Badge, ChevronLeft, ChevronRight, CloseIcon } from '../ui';

/**
 * Product gallery with hover-to-zoom on desktop and a fullscreen lightbox.
 * Falls back cleanly to plain tap-through on touch devices.
 */
export function ProductGallery({
  images, productName, badges,
}: {
  images: ProductImage[];
  productName: string;
  badges?: React.ReactNode;
}) {
  const [active, setActive] = useState(0);
  const [zooming, setZooming] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [lightbox, setLightbox] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const count = images.length;
  const go = useCallback(
    (delta: number) => setActive((i) => (i + delta + count) % Math.max(count, 1)),
    [count],
  );

  useEffect(() => setActive(0), [productName]);

  // Arrow keys move through the gallery while the lightbox is open.
  useEffect(() => {
    if (!lightbox) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [lightbox, go]);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    setOrigin({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  if (!count) {
    return (
      <div className="flex aspect-square items-center justify-center bg-paper-warm text-2xs uppercase tracking-architect text-ink-300">
        No image
      </div>
    );
  }

  const current = images[active];

  return (
    <>
      <div className="flex flex-col-reverse gap-3 lg:flex-row lg:gap-4">
        {/* Thumbnail rail — below on mobile, beside on desktop */}
        {count > 1 ? (
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto lg:w-[76px] lg:shrink-0 lg:flex-col lg:overflow-visible">
            {images.map((image, index) => (
              <button
                key={image.url}
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => setActive(index)}
                aria-label={`View image ${index + 1} of ${count}`}
                aria-current={index === active}
                className={clsx(
                  'aspect-square w-[68px] shrink-0 overflow-hidden border bg-paper-warm transition-colors duration-200 lg:w-full',
                  index === active ? 'border-ink' : 'border-stone-line hover:border-ink-300',
                )}
              >
                <img
                  src={assetUrl(image.url)}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        ) : null}

        {/* Main frame */}
        <div className="relative min-w-0 flex-1">
          <div
            ref={frameRef}
            onMouseEnter={() => setZooming(true)}
            onMouseLeave={() => setZooming(false)}
            onMouseMove={onMove}
            onClick={() => setLightbox(true)}
            className="group relative aspect-square cursor-zoom-in overflow-hidden bg-paper-warm"
          >
            <img
              src={assetUrl(current.url)}
              alt={current.alt ?? productName}
              {...{ fetchpriority: 'high' }}
              className="h-full w-full object-cover transition-transform duration-300 ease-out"
              style={
                zooming
                  ? { transform: 'scale(1.85)', transformOrigin: `${origin.x}% ${origin.y}%` }
                  : undefined
              }
            />

            {badges ? (
              <div className="pointer-events-none absolute left-4 top-4 flex flex-col items-start gap-1.5">
                {badges}
              </div>
            ) : null}

            <span className="pointer-events-none absolute bottom-4 right-4 hidden border border-ink/10 bg-paper/90 px-2.5 py-1.5 text-[0.6rem] uppercase tracking-architect text-ink-500 opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100 lg:block">
              Click to expand
            </span>
          </div>

          {/* Mobile arrows */}
          {count > 1 ? (
            <>
              <GalleryArrow side="left" onClick={() => go(-1)} />
              <GalleryArrow side="right" onClick={() => go(1)} />
              <div className="mt-3 flex justify-center gap-1.5 lg:hidden">
                {images.map((image, index) => (
                  <span
                    key={image.url}
                    className={clsx(
                      'h-1 w-5 transition-colors',
                      index === active ? 'bg-ink' : 'bg-stone-mute',
                    )}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Fullscreen lightbox */}
      {lightbox ? (
        <div className="fixed inset-0 z-[90] flex flex-col bg-ink/95" role="dialog" aria-modal="true">
          <div className="flex items-center justify-between px-5 py-4 text-paper">
            <span className="text-2xs uppercase tracking-architect text-paper/60">
              {active + 1} / {count}
            </span>
            <button
              type="button"
              onClick={() => setLightbox(false)}
              className="p-1.5 text-paper/70 transition-colors hover:text-paper"
              aria-label="Close"
            >
              <CloseIcon size={22} />
            </button>
          </div>

          <div className="relative flex flex-1 items-center justify-center px-4 pb-6">
            <img
              src={assetUrl(current.url)}
              alt={current.alt ?? productName}
              className="max-h-full max-w-full object-contain"
            />
            {count > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 border border-paper/25 p-3 text-paper transition-colors hover:bg-paper hover:text-ink"
                  aria-label="Previous image"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 border border-paper/25 p-3 text-paper transition-colors hover:bg-paper hover:text-ink"
                  aria-label="Next image"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            ) : null}
          </div>

          {count > 1 ? (
            <div className="no-scrollbar flex justify-center gap-2 overflow-x-auto px-5 pb-6">
              {images.map((image, index) => (
                <button
                  key={image.url}
                  type="button"
                  onClick={() => setActive(index)}
                  className={clsx(
                    'aspect-square w-16 shrink-0 overflow-hidden border transition-opacity',
                    index === active ? 'border-paper' : 'border-transparent opacity-45 hover:opacity-80',
                  )}
                  aria-label={`View image ${index + 1}`}
                >
                  <img src={assetUrl(image.url)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function GalleryArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={side === 'left' ? 'Previous image' : 'Next image'}
      className={clsx(
        'absolute top-1/2 z-10 -translate-y-1/2 border border-stone-line bg-paper/90 p-2.5 text-ink transition-all duration-200',
        'hover:bg-ink hover:text-paper lg:opacity-0 lg:group-hover:opacity-100',
        side === 'left' ? 'left-2.5' : 'right-2.5',
      )}
    >
      {side === 'left' ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
    </button>
  );
}

/** Small badge helper so the PDP and gallery stay visually in sync. */
export function GalleryBadges({
  badge, isNew, discount,
}: {
  badge?: string | null;
  isNew?: boolean;
  discount?: number | null;
}) {
  return (
    <>
      {badge ? <Badge tone="dark">{badge}</Badge> : null}
      {isNew && !badge ? <Badge tone="dark">New</Badge> : null}
      {discount ? <Badge tone="danger">−{discount}%</Badge> : null}
    </>
  );
}
