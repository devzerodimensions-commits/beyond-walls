import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api';
import { useToast } from '../../context/StoreProvider';
import { Badge, Button } from '../ui';

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

export function ReadPhotograph({
  productId, hasImage, onRead,
}: {
  productId: string;
  hasImage: boolean;
  onRead: (template: string, config: Record<string, unknown>) => void;
}) {
  const { push } = useToast();
  const queryClient = useQueryClient();

  const read = useMutation({
    mutationFn: () => api.post<ReadResult>(`/admin/products/${productId}/preview-from-photo`, {}),
    onSuccess: async (result) => {
      if (!result.ok || !result.livePreviewConfig) {
        push(result.reason || 'That picture could not be read', 'error');
        return;
      }
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
    </div>
  );
}
