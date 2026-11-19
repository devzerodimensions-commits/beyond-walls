import { useState } from 'react';
import type { PersonalizationField } from '../../lib/types';
import {
  LivePreview, buildPreviewSlots, previewScript, resolvePreviewConfig,
} from '../product/LivePreview';
import { PersonalizationForm } from '../product/PersonalizationForm';

/**
 * The product as a customer will meet it, before anyone else can.
 *
 * A draft cannot be opened on the shop -- that is the point of a draft -- so
 * the only way to see what a customer would be shown was to publish it and
 * look, which is exactly the wrong order for a piece that is cut to order
 * from whatever the preview promised. The editor's own previews do not close
 * the gap either: they draw the plate, but not the questions beside it, and a
 * preview is only right if the questions feeding it are.
 *
 * So this is not a mock-up of the product page. It is the product page's own
 * two halves -- the same questions component and the same preview component,
 * fed the same way -- so whatever is wrong here is wrong there too.
 */
export function CustomerPreview({
  fields, template, config,
}: {
  fields: PersonalizationField[];
  template: string | null;
  config: Record<string, unknown> | null;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const published = fields.filter((field) => field.status === 'PUBLISHED');
  const slots = buildPreviewSlots(published, values);
  const settings = resolvePreviewConfig(template, config);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <div className="flex items-baseline justify-between gap-3 border-b border-stone-line pb-2">
          <p className="eyebrow text-ink">Your plate</p>
          <p className="text-2xs text-ink-400">Updates as you type</p>
        </div>
        <LivePreview template={template} config={config} slots={slots} hideLabel />
        <p className="mt-3 text-2xs text-ink-400">
          Type in the questions beside this exactly as a customer would. Nothing here is saved.
        </p>
      </div>

      <div>
        <p className="eyebrow border-b border-stone-line pb-2 text-ink">Make it yours</p>
        {published.length ? (
          <div className="mt-4">
            <PersonalizationForm
              fields={published}
              values={values}
              palette={settings.palette}
              script={previewScript(settings)}
              onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
            />
          </div>
        ) : (
          <p className="mt-4 border border-dashed border-stone-line p-4 text-xs text-ink-400">
            No published questions yet, so a customer would be shown nothing to fill in. Add them on
            the Personalisation tab.
          </p>
        )}
      </div>
    </div>
  );
}
