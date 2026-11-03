import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api';
import { PRESETS, PRESET_FOR_TEMPLATE, presetByLabel } from '../../lib/productPresets';
import { useToast } from '../../context/StoreProvider';
import { LivePreview, usePreviewTemplates } from '../product/LivePreview';
import { Badge, Button, Select } from '../ui';

/**
 * Setting up a live preview from the product's own photograph.
 *
 * Doing this by hand meant choosing a template, matching the plate's shape and
 * colours by eye, then wiring a personalisation field to each preview slot —
 * the same judgement repeated for every product, and a field wired to the
 * wrong slot draws the house number where the name should be without
 * anything complaining.
 *
 * So the photograph is measured instead. What comes back is a *suggestion*:
 * it is drawn here, with what was measured shown beside it, and nothing is
 * written to the product until it is accepted. When the photograph cannot be
 * measured — a sign already on a wall has no edges to find — it says so and
 * falls back to the same manual choice as before, which is the honest result
 * rather than a confident wrong one.
 */

interface Suggestion {
  confidence: 'detected' | 'uncertain';
  reason: string;
  template: string | null;
  aspect: { width: number; height: number } | null;
  plateColor: string | null;
  textColor: string | null;
  measured: {
    imageWidth: number;
    imageHeight: number;
    plateWidth: number | null;
    plateHeight: number | null;
    coverage: number;
    contrast: number;
  };
}

export function PreviewSetup({
  productId, hasImage, onApplied,
}: {
  productId: string;
  hasImage: boolean;
  /** Called after the product and its fields have been written. */
  onApplied: () => void;
}) {
  const { push } = useToast();
  const previewTemplates = usePreviewTemplates();
  const [wanted, setWanted] = useState<boolean | null>(null);
  const [template, setTemplate] = useState('');
  const [presetLabel, setPresetLabel] = useState('');
  const [applied, setApplied] = useState(false);

  const { data: suggestion, isFetching, refetch } = useQuery({
    queryKey: ['preview-suggestion', productId],
    queryFn: () => api.get<Suggestion>(`/admin/products/${productId}/preview-suggestion`),
    // Only measured once the studio says the product has a preview at all.
    enabled: wanted === true && hasImage,
    staleTime: Infinity,
  });

  // The suggestion fills the controls; the studio can still change either.
  const chosenTemplate = template || suggestion?.template || '';
  const chosenPreset = presetLabel || PRESET_FOR_TEMPLATE[chosenTemplate] || '';

  const apply = useMutation({
    mutationFn: async () => {
      /*
       * The measured plate proportions are stored as the preview's own aspect,
       * so the drawn plate is the shape of the real one rather than the
       * template's generic rectangle. Colours go in as defaults, which a
       * customer's own colour choice still overrides.
       */
      const config: Record<string, unknown> = {};
      if (suggestion?.aspect) config.aspect = suggestion.aspect;
      if (suggestion?.plateColor || suggestion?.textColor) {
        config.defaults = {
          ...(suggestion.plateColor ? { plateColor: suggestion.plateColor } : {}),
          ...(suggestion.textColor ? { textColor: suggestion.textColor } : {}),
        };
      }

      await api.patch(`/admin/products/${productId}`, {
        livePreviewEnabled: true,
        livePreviewTemplate: chosenTemplate || null,
        ...(Object.keys(config).length ? { livePreviewConfig: config } : {}),
      });

      const preset = presetByLabel(chosenPreset);
      for (const field of preset?.fields ?? []) {
        await api.post(`/admin/products/${productId}/personalization`, {
          ...field, required: true, options: [], status: 'PUBLISHED',
        });
      }
    },
    onSuccess: () => {
      setApplied(true);
      push('Live preview set up', 'success');
      onApplied();
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not set that up', 'error'),
  });

  if (applied) {
    return (
      <div className="border border-stone-line bg-paper-off p-5">
        <p className="text-sm font-medium">Live preview is set up.</p>
        <p className="mt-1.5 text-xs text-ink-500">
          The fields and the plate are on the product now. Everything is editable later in
          Products → this product → Personalisation.
        </p>
      </div>
    );
  }

  if (wanted === null) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-600">
          A live preview lets the customer type their name and see it on the plate before they buy.
          It suits a made-to-order piece; a stock sign does not need one.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setWanted(true)} disabled={!hasImage}>
            Yes — work it out from the photo
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setWanted(false)}>
            No, it is made to a fixed design
          </Button>
        </div>
        {hasImage ? null : (
          <p className="text-xs text-ink-500">Add a photograph first and this can measure it.</p>
        )}
      </div>
    );
  }

  if (wanted === false) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-600">
          No live preview. The product is sold as photographed, and the customer is not asked for
          anything that has to be approved before it is made.
        </p>
        <Button size="sm" variant="ghost" onClick={() => setWanted(null)}>
          Change that
        </Button>
      </div>
    );
  }

  const detected = suggestion?.confidence === 'detected';

  return (
    <div className="space-y-5">
      {isFetching ? (
        <p className="text-sm text-ink-500">Measuring the photograph…</p>
      ) : suggestion ? (
        <>
          <div
            className={`border p-4 ${detected ? 'border-stone-line bg-paper-off' : 'border-state-warning/40 bg-state-warning/5'}`}
          >
            <div className="mb-2 flex items-center gap-2">
              <Badge tone={detected ? 'success' : 'neutral'}>
                {detected ? 'Measured from the photo' : 'Could not measure'}
              </Badge>
              {detected && suggestion.measured.plateWidth ? (
                <span className="text-2xs text-ink-400">
                  plate {suggestion.measured.plateWidth}×{suggestion.measured.plateHeight} ·{' '}
                  {Math.round(suggestion.measured.coverage * 100)}% of frame
                </span>
              ) : null}
            </div>
            <p className="text-xs leading-relaxed text-ink-600">{suggestion.reason}</p>
            {detected && suggestion.plateColor ? (
              <div className="mt-3 flex items-center gap-4 text-2xs text-ink-500">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-3.5 w-3.5 border border-stone-line"
                    style={{ background: suggestion.plateColor }}
                  />
                  plate {suggestion.plateColor}
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-3.5 w-3.5 border border-stone-line"
                    style={{ background: suggestion.textColor ?? '#fff' }}
                  />
                  writing {suggestion.textColor}
                </span>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Plate shape"
              value={chosenTemplate}
              onChange={(e) => setTemplate(e.target.value)}
              options={[{ value: '', label: 'Choose a shape…' }, ...previewTemplates.slice(1)]}
              hint={detected ? 'Worked out from the photo. Change it if it looks wrong.' : undefined}
            />
            <Select
              label="Fields to ask the customer for"
              value={chosenPreset}
              onChange={(e) => setPresetLabel(e.target.value)}
              options={[
                { value: '', label: 'None — I will add them myself' },
                ...PRESETS.map((p) => ({ value: p.label, label: p.label })),
              ]}
              hint="Each one is already wired to the right part of the plate."
            />
          </div>

          {chosenTemplate ? (
            <div>
              <p className="mb-2 text-xs font-medium text-ink-500">This is what the customer will see</p>
              <LivePreview
                template={chosenTemplate}
                slots={{}}
                config={{
                  ...(suggestion.aspect ? { aspect: suggestion.aspect } : {}),
                  ...(suggestion.plateColor || suggestion.textColor
                    ? {
                      defaults: {
                        plateColor: suggestion.plateColor ?? '#111111',
                        textColor: suggestion.textColor ?? '#F7F6F4',
                        fontFamily: 'grotesque',
                      },
                    }
                    : {}),
                }}
              />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-stone-line pt-4">
            <Button size="sm" variant="ghost" onClick={() => { setWanted(null); setTemplate(''); setPresetLabel(''); }}>
              Back
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void refetch()} disabled={isFetching}>
              Measure again
            </Button>
            <span className="flex-1" />
            <Button
              size="sm"
              loading={apply.isPending}
              disabled={!chosenTemplate}
              onClick={() => apply.mutate()}
            >
              Use this setup
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-500">Nothing to measure yet.</p>
      )}
    </div>
  );
}
