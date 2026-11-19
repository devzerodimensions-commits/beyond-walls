import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api';
import { useToast } from '../../context/StoreProvider';
import {
  usePreviewTemplates, useSavedDesigns, type SavedDesign,
} from '../product/LivePreview';
import { Button, Input, Select } from '../ui';

/**
 * Choosing a design for a product, and keeping one worth reusing.
 *
 * The shipped designs are drawings in code. What a workshop actually works
 * from is narrower than that: not "the cut lettering drawing" but "the 500mm
 * script in matte black", a drawing plus every answer settled about it. The
 * same piece is sold in several sizes and finishes, and setting each one up
 * by hand gave a slightly different answer every time.
 *
 * So a design can be saved under the name the workshop uses and applied to
 * any product afterwards. Applying COPIES the settings onto the product
 * rather than pointing at the library, which matters more than it looks:
 * a design edited next month must not quietly change what a customer already
 * approved and ordered against a product set up with it. The copy is the
 * product's own from the moment it lands.
 */

const SETTING = 'preview.savedDesigns';

export function DesignLibrary({
  template, config, productImage, onApply,
}: {
  template: string;
  config: Record<string, unknown>;
  /**
   * The product's own first photograph.
   *
   * A design built from a picture carries the boxes and the colours but not
   * the picture, because the picture belongs to the product. Applying such a
   * design to a different product points it at that product's own image, so
   * the design travels and the photograph stays put.
   */
  productImage?: string | null;
  onApply: (template: string, config: Record<string, unknown>) => void;
}) {
  const { push } = useToast();
  const queryClient = useQueryClient();
  const designs = useSavedDesigns();
  const templates = usePreviewTemplates();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const write = useMutation({
    mutationFn: (next: SavedDesign[]) => api.put('/admin/settings', { values: { [SETTING]: next } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['site-settings'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not save the design', 'error'),
  });

  const apply = (value: string) => {
    const saved = designs.find((design) => design.id === value);
    if (!saved) {
      // A shipped drawing, with none of a saved design's answers attached.
      onApply(value, {});
      return;
    }

    const next = { ...saved.config };
    const photo = next.photo as { image?: string } | undefined;
    if (photo && productImage) next.photo = { ...photo, image: productImage };
    onApply(saved.template, next);
    push(`Applied “${saved.name}”`, 'success');
  };

  const save = () => {
    const label = name.trim();
    if (!label) return;
    /*
     * Saving under a name already in the library replaces it, which is what
     * someone correcting a design expects. Products already set up from it
     * keep their copy and are untouched.
     */
    const existing = designs.find((design) => design.name.toLowerCase() === label.toLowerCase());
    const entry: SavedDesign = {
      id: existing?.id ?? `d${Date.now().toString(36)}`,
      name: label,
      template,
      config,
    };
    const next = existing
      ? designs.map((design) => (design.id === existing.id ? entry : design))
      : [...designs, entry];

    write.mutate(next, {
      onSuccess: () => {
        push(existing ? `Updated “${label}”` : `Saved “${label}”`, 'success');
        setNaming(false);
        setName('');
      },
    });
  };

  return (
    <div className="mt-4 space-y-3">
      <Select
        label="Design"
        value={template}
        options={[
          ...templates,
          // Prefixed rather than put under a heading: the select takes plain
          // options, and a saved design has to be tellable from a shipped
          // drawing at a glance in the same list.
          ...designs.map((design) => ({ value: design.id, label: `Your design — ${design.name}` })),
        ]}
        hint="A shipped drawing, or one of your own saved designs. Choosing a saved design brings its shape, colours and lettering positions onto this product."
        onChange={(event) => apply(event.target.value)}
      />

      {naming ? (
        <div className="flex flex-wrap items-end gap-2">
          <Input
            label="Name this design"
            value={name}
            placeholder="500mm script — matte black"
            wrapClassName="min-w-[220px] flex-1"
            hint="The name the workshop uses. Saving over an existing name replaces it."
            onChange={(event) => setName(event.target.value)}
          />
          <Button size="sm" loading={write.isPending} onClick={save}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => { setNaming(false); setName(''); }}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setNaming(true)}>
          Save these settings as a design
        </Button>
      )}
    </div>
  );
}
