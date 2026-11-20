import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, assetUrl } from '../../lib/api';
import { useToast } from '../../context/StoreProvider';
import { Badge, Button, Select } from '../ui';
import { LivePreview, resolvePreviewConfig } from '../product/LivePreview';

/**
 * Making the preview out of the product's own artwork, from the editor.
 *
 * The reader existed but only ran inside the add-product wizard, on one step,
 * once. Anyone who skipped that step, came back to an existing product, or
 * uploaded better artwork afterwards had no way to reach it -- so a studio
 * could upload a finished piece of artwork and still be looking at the plain
 * black nameplate the template defaults to, with nothing on the screen to
 * suggest the two had anything to do with each other.
 *
 * It is the same reading the wizard does, from the same endpoint, so a design
 * made here and one made there cannot come out differently.
 *
 * It writes to the product immediately -- the blank plate it paints has to be
 * stored somewhere -- and hands the settings straight back so the editor can
 * show them without reloading the product and throwing away whatever else is
 * being edited.
 */

interface ReadResult {
  ok: boolean;
  reason: string;
  image: string | null;
  boxes: unknown[];
  livePreviewConfig?: Record<string, unknown>;
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
 * studio is already looking at, where putting it right takes one click. Three
 * dropdowns beats a clever rule that is wrong on a tenth of the catalogue.
 */
const LINE_SLOTS = [
  { value: 'number', label: 'House / flat number' },
  { value: 'line1', label: 'First line' },
  { value: 'line2', label: 'Second line' },
  { value: 'line3', label: 'Third line' },
];

export function ReadPhotograph({
  productId, hasImage, photoUrl, onRead,
}: {
  productId: string;
  hasImage: boolean;
  /** The photograph being read, shown beside the result so the two can be compared. */
  photoUrl?: string | null;
  onRead: (template: string, config: Record<string, unknown>) => void;
}) {
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [made, setMade] = useState<Record<string, unknown> | null>(null);

  /** The lines the reader found, in the order they sit on the plate. */
  const boxes = ((made?.photo as { boxes?: { slot: string }[] } | undefined)?.boxes ?? []);

  /*
   * Changing a line rewrites that one box and leaves the rest alone, so the
   * positions the reader measured are never lost by renaming what sits in
   * them. Saved immediately: this sits beside a picture of the result, and a
   * setting that needs a separate Save is a setting people forget.
   */
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
    /*
     * PATCH, and the failure is reported.
     *
     * This first went out as a PUT, which this API does not have, so every
     * change 404'd -- and because the call was fired and forgotten, the
     * dropdown moved, the preview beside it moved, and nothing was saved. A
     * write that can fail silently is worse than one that does not exist.
     */
    saveSlot.mutate(next);
  };

  const saveSlot = useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      api.patch(`/admin/products/${productId}`, { livePreviewConfig: config }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-product', productId] }),
    onError: (err) => push(
      err instanceof ApiError ? err.message : 'That line could not be saved',
      'error',
    ),
  });

  const read = useMutation({
    mutationFn: () => api.post<ReadResult>(`/admin/products/${productId}/preview-from-photo`, {}),
    onSuccess: async (result) => {
      if (!result.ok || !result.livePreviewConfig) {
        push(result.reason || 'That picture could not be read', 'error');
        return;
      }
      setMade(result.livePreviewConfig);
      onRead('photo', result.livePreviewConfig);
      await queryClient.invalidateQueries({ queryKey: ['admin-product', productId] });
      push(`Read ${result.boxes.length} line${result.boxes.length === 1 ? '' : 's'} from the artwork`, 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not read that picture', 'error'),
  });

  return (
    <div className="mt-4 border border-stone-line bg-paper-off p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="info">From your artwork</Badge>
        <Button size="sm" loading={read.isPending} disabled={!hasImage} onClick={() => read.mutate()}>
          Make the preview from this product's picture
        </Button>
      </div>
      <p className="mt-2 text-2xs leading-relaxed text-ink-500">
        {hasImage
          ? 'Reads the first photograph, takes the sample name off it and uses the piece itself as the preview. Best with the flat design file the piece is cut from; a photograph of one on a wall will be turned down with a reason.'
          : 'Add a photograph on the Images tab first — the preview is made from it.'}
      </p>
      {read.data && !read.data.ok ? (
        <p className="mt-2 border-l-2 border-state-warning pl-3 text-2xs leading-relaxed text-ink-600">
          {read.data.reason}
        </p>
      ) : null}

      {/*
        * The photograph and what was made from it, side by side.
        *
        * A preview that does not look like the product is the one fault that
        * hides: every line gets drawn, nothing errors, and the plate simply
        * comes out in the wrong lettering or with the wrong words in the wrong
        * places. Nobody goes looking for it, because nothing suggests there is
        * anything to look for.
        *
        * Reading a photograph cannot tell which typeface a piece was cut in --
        * no picture carries that -- so instead of guessing, the two are put
        * next to each other at the moment the preview is made, with sample
        * words in the boxes it found. A studio that can see both in one glance
        * does not need to be told what to check.
        */}
      {made && photoUrl ? (
        <div className="mt-4 border-t border-stone-line pt-4">
          <p className="text-2xs uppercase tracking-architect text-ink">
            Does this match your product?
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <figure className="m-0">
              <img
                src={assetUrl(photoUrl)}
                alt="The photograph this was made from"
                className="w-full border border-stone-line object-contain"
              />
              <figcaption className="mt-1 text-2xs text-ink-400">Your photograph</figcaption>
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
            style of the lettering. A photograph cannot say which typeface a piece was cut in, so if
            the lettering looks wrong, pick the right face under Lettering below. The lines can be
            nudged under “Where the words go”.
          </p>
        </div>
      ) : null}
    </div>
  );
}
