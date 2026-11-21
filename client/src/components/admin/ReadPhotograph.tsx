import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ApiError, api, assetUrl } from '../../lib/api';
import type { MediaAsset } from '../../lib/types';
import { useToast } from '../../context/StoreProvider';
import { Badge, Button, Select, Spinner, UploadIcon } from '../ui';
import { MediaPicker } from './AdminKit';
import { LivePreview, resolvePreviewConfig } from '../product/LivePreview';

/**
 * Making the preview out of the product's own artwork, from the editor.
 *
 * Two ways in, and the first is the one that works best.
 *
 * The flat design file a piece is cut from -- square on, evenly lit, nothing
 * behind it -- is the ideal thing to read. A photograph of the piece is not:
 * it sits on a textured wall, in sunlight, at an angle, next to a caption, and
 * the reader either turns it down or, before it learned better, built a
 * preview out of a caption in the corner of an infographic. Uploading a design
 * file used to be possible only further down, under the line boxes, where it
 * swapped the picture and read nothing -- so the lines stayed wherever they had
 * been and the customer's name landed on the wrong part of the new artwork.
 *
 * So the design file comes first and is READ: its sample lettering is taken
 * off, its lines are found, and the product's questions are matched to them.
 * Reading the product's own photograph is still offered, second, for a product
 * photographed cleanly enough to work.
 *
 * Either way the result is written straight to the product -- the blank plate
 * it paints has to be stored somewhere -- and handed back so the editor can show
 * it without reloading and discarding whatever else is being edited.
 */

interface ReadResult {
  ok: boolean;
  reason: string;
  image: string | null;
  boxes: unknown[];
  livePreviewConfig?: Record<string, unknown>;
  /** Questions created so every line on the plate can be filled in. */
  added?: string[];
  /** The file that was read: the chosen design file, or the product's photograph. */
  source?: string;
}

/**
 * Something in every line the reader found.
 *
 * The shared placeholders only fill the first line, so a plate read as three
 * lines was compared against a preview showing one -- which says nothing about
 * whether the other two landed in the right places, the thing the comparison
 * exists to show. Each box found gets a sample instead.
 */
function sampleSlots(config: Record<string, unknown>): Record<string, string> {
  const SAMPLES: Record<string, string> = {
    number: 'A 101',
    line1: 'YOUR NAME',
    line2: 'FAMILY',
    line3: 'EST 2020',
  };
  const base = resolvePreviewConfig('photo', config).placeholders as Record<string, string>;
  const boxes = (config.photo as { boxes?: { slot: string }[] } | undefined)?.boxes ?? [];
  const slots: Record<string, string> = {};
  for (const box of boxes) slots[box.slot] = base[box.slot] || SAMPLES[box.slot] || 'SAMPLE';
  return slots;
}

/**
 * Which question belongs on which line of the plate.
 *
 * The reader finds where the lettering sits; it cannot read what the lettering
 * says, so it cannot know that the big line is the name and the small one is
 * the flat number. It matches the product's questions to the lines top
 * downwards, which is right on most plates and wrong on any plate that puts
 * the name above the number -- and guessing from the shape of the marks is
 * exactly the kind of guess that previously drew a black rectangle for a
 * round gold plate.
 *
 * So it is not guessed. It is shown, pre-filled, next to the comparison the
 * studio is already looking at, where putting it right takes one click.
 */
const LINE_SLOTS = [
  { value: 'number', label: 'House / flat number' },
  { value: 'line1', label: 'First line' },
  { value: 'line2', label: 'Second line' },
  { value: 'line3', label: 'Third line' },
];

export function ReadPhotograph({
  productId, hasImage, photoUrl, onRead, ready = true,
}: {
  productId: string;
  hasImage: boolean;
  /** The product's first photograph, read by the second option. */
  photoUrl?: string | null;
  onRead: (template: string, config: Record<string, unknown>) => void;
  /**
   * Whether customers currently see a preview. Said plainly when they do not,
   * because a ticked "Enable" box with nothing behind it looks finished.
   */
  ready?: boolean;
}) {
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [made, setMade] = useState<Record<string, unknown> | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);

  /** The lines the reader found, in the order they sit on the plate. */
  const boxes = ((made?.photo as { boxes?: { slot: string }[] } | undefined)?.boxes ?? []);

  /*
   * Changing a line rewrites that one box and leaves the rest alone, so the
   * positions the reader measured are never lost by renaming what sits in
   * them. Saved immediately, and a failure is reported: this first went out
   * as a PUT this API does not have, fired and forgotten, so the dropdown and
   * the preview moved and nothing was saved.
   */
  const saveSlot = useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      api.patch(`/admin/products/${productId}`, { livePreviewConfig: config }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-product', productId] }),
    onError: (err) => push(
      err instanceof ApiError ? err.message : 'That line could not be saved',
      'error',
    ),
  });

  const setSlot = (index: number, slot: string) => {
    if (!made) return;
    const photo = made.photo as { boxes: { slot: string }[]; image: string };
    const next = {
      ...made,
      photo: {
        ...photo,
        boxes: photo.boxes.map((box, i) => (i === index ? { ...box, slot } : box)),
      },
    };
    setMade(next);
    onRead('photo', next);
    saveSlot.mutate(next);
  };

  /** Reads a chosen design file, or -- with no url -- the product's own photograph. */
  const read = useMutation({
    mutationFn: (url?: string) =>
      api.post<ReadResult>(`/admin/products/${productId}/preview-from-photo`, url ? { url } : {}),
    onSuccess: async (result, url) => {
      if (!result.ok || !result.livePreviewConfig) {
        push(result.reason || 'That picture could not be read', 'error');
        return;
      }
      setMade(result.livePreviewConfig);
      setSource(result.source ?? url ?? photoUrl ?? null);
      onRead('photo', result.livePreviewConfig);
      await queryClient.invalidateQueries({ queryKey: ['admin-product', productId] });
      const lines = result.boxes.length;
      push(`Read ${lines} line${lines === 1 ? '' : 's'} — check it matches below`, 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not read that picture', 'error'),
  });

  /** A design file from this device: stored in the media library, then read. */
  const uploadAndRead = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('files', file);
      form.append('folder', 'products');
      const [asset] = await api.upload<MediaAsset[]>('/admin/media', form);
      if (!asset?.url) throw new Error('The upload did not return a file');
      read.mutate(asset.url);
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const busy = uploading || read.isPending;

  return (
    <div className="mt-4 border border-stone-line bg-paper-off p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone="info">From your artwork</Badge>
        {ready ? null : (
          <span className="text-2xs text-state-warning">Customers don’t see a preview yet</span>
        )}
      </div>

      {/* ---- the design file, first ------------------------------------ */}
      <p className="mt-3 text-xs font-medium text-ink">Upload the design file</p>
      <p className="mt-1 text-2xs leading-relaxed text-ink-500">
        The flat 2D artwork the piece is cut from — head-on, on a plain background, with sample
        lettering on it. The sample words are taken off and the customer’s own are drawn in exactly
        where they sat.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <label
          className={clsx(
            'inline-flex cursor-pointer items-center gap-2 bg-ink px-3.5 py-2 text-2xs font-medium uppercase',
            'tracking-architect text-paper transition-opacity hover:opacity-90',
            busy && 'pointer-events-none opacity-60',
          )}
        >
          {busy ? <Spinner size={13} /> : <UploadIcon size={13} />}
          {uploading ? 'Uploading…' : read.isPending ? 'Reading…' : 'Upload from this device'}
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => { void uploadAndRead(e.target.files?.[0]); e.target.value = ''; }}
          />
        </label>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => setPicking(true)}>
          Choose from library
        </Button>
      </div>
      <MediaPicker
        open={picking}
        accept="image"
        folder="products"
        onClose={() => setPicking(false)}
        onPick={(assets) => {
          setPicking(false);
          if (assets[0]?.url) read.mutate(assets[0].url);
        }}
      />

      {/* ---- the product's own photograph, second ----------------------- */}
      <div className="mt-4 border-t border-stone-line pt-3">
        <Button
          size="sm"
          variant="ghost"
          disabled={!hasImage || busy}
          onClick={() => read.mutate(undefined)}
        >
          Or read this product’s photograph
        </Button>
        <p className="mt-1 text-2xs leading-relaxed text-ink-400">
          {hasImage
            ? 'Works when the photograph shows the piece head-on and evenly lit. A picture of it on a textured wall, at an angle or beside a caption is turned down with the reason — that is what the design file is for.'
            : 'No photographs on this product yet — upload the design file above instead.'}
        </p>
      </div>

      {read.data && !read.data.ok ? (
        <p className="mt-3 border-l-2 border-state-warning pl-3 text-2xs leading-relaxed text-ink-600">
          {read.data.reason}
        </p>
      ) : null}

      {/*
        * What was read and what was made from it, side by side.
        *
        * A preview that does not look like the product is the one fault that
        * hides: every line gets drawn, nothing errors, and the plate simply
        * comes out in the wrong lettering or with the words in the wrong
        * places. Put next to each other at the moment the preview is made,
        * with sample words in the boxes it found, nobody needs telling what
        * to check.
        */}
      {made && source ? (
        <div className="mt-4 border-t border-stone-line pt-4">
          <p className="text-2xs uppercase tracking-architect text-ink">
            Does this match your product?
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <figure className="m-0">
              <img
                src={assetUrl(source)}
                alt="The artwork this was made from"
                className="w-full border border-stone-line object-contain"
              />
              <figcaption className="mt-1 text-2xs text-ink-400">What was read</figcaption>
            </figure>
            <figure className="m-0">
              <LivePreview
                template="photo"
                config={made}
                slots={sampleSlots(made)}
                hideLabel
                hideCaption
                className="border border-stone-line"
              />
              <figcaption className="mt-1 text-2xs text-ink-400">What customers will see</figcaption>
            </figure>
          </div>

          {read.data?.added?.length ? (
            <p className="mt-3 border-l-2 border-state-info pl-3 text-2xs leading-relaxed text-ink-600">
              The plate has a line nobody was asked for, so a question was added for it:{' '}
              {read.data.added.map((label) => `“${label}”`).join(', ')}. Rename it under
              Personalisation — for example “House / flat number”.
            </p>
          ) : null}

          {boxes.length ? (
            <div className="mt-4 border-t border-stone-line pt-3">
              <p className="text-2xs uppercase tracking-architect text-ink">
                Which question goes on which line?
              </p>
              <p className="mb-2 mt-1 text-2xs leading-relaxed text-ink-400">
                Listed top of the plate downwards. The reader knows where the lines are, not what
                they said — so check this once and it is right for every order.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {boxes.map((box, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <Select
                    key={index}
                    label={`Line ${index + 1}`}
                    value={box.slot}
                    options={LINE_SLOTS}
                    onChange={(e) => setSlot(index, e.target.value)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <p className="mt-3 text-2xs leading-relaxed text-ink-500">
            The words differ — those are samples. What should match is where the lines sit and the
            style of the lettering. A picture cannot say which typeface a piece was cut in, so if
            the lettering looks wrong, pick the right face under Lettering below.
          </p>
        </div>
      ) : null}
    </div>
  );
}
