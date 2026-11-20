import { useState } from 'react';
import type { PreviewPhoto, PreviewPhotoBox } from '../product/LivePreview';
import { assetUrl } from '../../lib/api';
import { Fold, MediaPicker } from './AdminKit';
import { Button, Input, Select } from '../ui';

/**
 * Correcting a preview that was worked out from a photograph.
 *
 * Reading a picture is a judgement, and the server that makes it is the one
 * place that judgement cannot be checked. It finds the sample name, paints it
 * out and measures where it sat; when it gets that slightly wrong there was
 * previously nothing anyone could do but give up on the design and set the
 * product up by hand, losing the artwork along with the mistake.
 *
 * So every number it produced is editable here, beside a preview that redraws
 * as the numbers change. The studio can also point the design at a blank
 * plate of their own, which is the case the reader cannot serve at all: a
 * piece whose artwork exists but has never been photographed with a name on
 * it, and so has no sample lettering to find.
 *
 * Positions are kept as fractions of the picture, so they survive the image
 * being resized or re-encoded, but they are shown and typed as percentages
 * because nobody reasons about a nameplate in thousandths.
 */

const SLOTS: { value: PreviewPhotoBox['slot']; label: string }[] = [
  { value: 'logo', label: 'Symbol or logo (a picture, not typed)' },
  { value: 'number', label: 'House / flat number' },
  { value: 'line1', label: 'First line' },
  { value: 'line2', label: 'Second line' },
  { value: 'line3', label: 'Third line' },
];

const ALIGNMENTS: { value: PreviewPhotoBox['align']; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centred' },
  { value: 'right', label: 'Right' },
];

/** A line placed in the middle of the plate, for a design starting from nothing. */
const NEW_BOX: PreviewPhotoBox = {
  slot: 'line1', y: 0.42, h: 0.14, align: 'center', anchor: 0.5, room: 0.8,
};

const pct = (value: number) => Math.round(value * 1000) / 10;

export function PhotoArtworkEditor({
  photo, images, onChange,
}: {
  photo: PreviewPhoto | undefined;
  /** The product's own pictures, so a blank plate already uploaded can be used. */
  images: { url: string; alt?: string | null }[];
  /**
   * The second argument is the artwork's own proportions, sent only when a
   * picture has just been chosen and could be measured.
   */
  onChange: (next: PreviewPhoto | undefined, artworkSize?: { width: number; height: number }) => void;
}) {
  const current: PreviewPhoto = photo ?? { image: '', boxes: [] };
  const [picking, setPicking] = useState(false);

  /**
   * Choosing artwork also sets the plate to the shape of that artwork.
   *
   * The picture is drawn across the whole plate without keeping its own
   * proportions, which is right when the plate was measured from that same
   * picture. Choosing one by hand has no such measurement behind it, so a
   * square plate was being squashed into whatever shape the design happened
   * to default to, and the artwork arrived visibly distorted -- the one thing
   * a preview of a product must never be.
   *
   * Measured before anything is sent, and sent with the picture as a single
   * change: two changes in a row would each be worked out from the same
   * starting point, and the second would undo the first.
   */
  const setImage = (url: string) => {
    if (!url) {
      return onChange(current.boxes.length ? { ...current, image: '' } : undefined);
    }
    const probe = new Image();
    probe.onload = () => onChange(
      { ...current, image: url },
      probe.naturalWidth && probe.naturalHeight
        ? { width: probe.naturalWidth, height: probe.naturalHeight }
        : undefined,
    );
    probe.onerror = () => onChange({ ...current, image: url });
    probe.src = assetUrl(url);
  };

  const setBox = (index: number, patch: Partial<PreviewPhotoBox>) => {
    const boxes = current.boxes.map((box, i) => (i === index ? { ...box, ...patch } : box));
    onChange({ ...current, boxes });
  };

  /** Percentages in, fractions out, clamped so a line cannot leave the plate. */
  const setPct = (index: number, field: keyof PreviewPhotoBox, raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setBox(index, { [field]: Math.min(100, Math.max(0, n)) / 100 } as Partial<PreviewPhotoBox>);
  };

  /*
   * Folded, and closed.
   *
   * Everything in here is measured off the product's own photograph and is
   * already right when the panel opens -- the blank plate, where each line
   * sits, how tall its lettering is, how much room it has. A studio adding
   * products should meet a short panel that says what was found and let them
   * get on with it, not twenty numbers to scroll past per product. The line
   * count in the summary is the part worth reading without opening it: it is
   * how you see at a glance that a three-line plate read as three lines.
   */
  const summary = current.boxes.length
    ? `${current.boxes.length} line${current.boxes.length === 1 ? '' : 's'}${current.image ? ' · read from the photograph' : ''}`
    : 'nothing placed yet';

  return (
    <Fold title="Artwork and where the words go" note={summary} className="mt-3">
    <div className="space-y-5">
      <p className="text-2xs leading-relaxed text-ink-400">
        The picture below is the plate with its sample lettering removed. The customer's words are
        drawn into the boxes listed under it — correct any that sit wrong.
      </p>

      <div className="grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="border border-stone-line bg-paper-off p-2">
          {current.image ? (
            <img src={assetUrl(current.image)} alt="Blank plate artwork" className="w-full object-contain" />
          ) : (
            <p className="p-4 text-center text-2xs text-ink-400">No blank artwork yet</p>
          )}
        </div>

        <div className="space-y-3">
          <Input
            label="Blank artwork"
            value={current.image}
            placeholder="/uploads/products/…"
            hint="The plate with no lettering on it. Made automatically when a photograph is read; upload your own to the media library if the piece has never been photographed with a name on it."
            onChange={(e) => setImage(e.target.value)}
          />
          <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>
            Choose or upload artwork
          </Button>
          <MediaPicker
            open={picking}
            accept="image"
            onClose={() => setPicking(false)}
            onPick={(assets) => {
              if (assets[0]?.url) setImage(assets[0].url);
              setPicking(false);
            }}
          />
          {images.length ? (
            <div className="flex flex-wrap gap-1.5">
              {images.map((image) => (
                <button
                  key={image.url}
                  type="button"
                  title={image.alt ?? image.url}
                  onClick={() => setImage(image.url)}
                  className={`h-12 w-12 overflow-hidden border ${
                    image.url === current.image ? 'border-ink' : 'border-stone-line hover:border-ink'
                  }`}
                >
                  <img src={assetUrl(image.url)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        {current.boxes.map((box, index) => (
          <div key={index} className="border border-stone-line p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-2xs uppercase tracking-architect text-ink-400">Line {index + 1}</p>
              <button
                type="button"
                onClick={() => onChange({ ...current, boxes: current.boxes.filter((_, i) => i !== index) })}
                className="text-2xs uppercase tracking-architect text-ink-500 hover:text-state-danger"
              >
                Remove
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label="Asks the customer for"
                value={box.slot}
                options={SLOTS}
                onChange={(e) => setBox(index, { slot: e.target.value as PreviewPhotoBox['slot'] })}
              />
              <Select
                label="Alignment"
                value={box.align}
                options={ALIGNMENTS}
                onChange={(e) => setBox(index, { align: e.target.value as PreviewPhotoBox['align'] })}
              />
              <Input
                type="number"
                label="Set from (%)"
                value={pct(box.anchor)}
                hint={box.align === 'center' ? 'Its centre.' : box.align === 'left' ? 'Its left edge.' : 'Its right edge.'}
                onChange={(e) => setPct(index, 'anchor', e.target.value)}
              />
              <Input
                type="number"
                label="Top (%)"
                value={pct(box.y)}
                onChange={(e) => setPct(index, 'y', e.target.value)}
              />
              <Input
                type="number"
                label="Height (%)"
                value={pct(box.h)}
                hint="The size of the lettering."
                onChange={(e) => setPct(index, 'h', e.target.value)}
              />
              <Input
                type="number"
                label="Width available (%)"
                value={pct(box.room)}
                hint="A long name shrinks to fit this."
                onChange={(e) => setPct(index, 'room', e.target.value)}
              />
            </div>
          </div>
        ))}

        <Button
          size="sm"
          variant="secondary"
          onClick={() => onChange({ ...current, boxes: [...current.boxes, NEW_BOX] })}
        >
          Add a line
        </Button>
      </div>
    </div>
    </Fold>
  );
}
