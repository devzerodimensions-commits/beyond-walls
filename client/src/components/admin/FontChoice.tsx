import { useState } from 'react';
import clsx from 'clsx';
import { PLATE_FONTS, fontStack } from '../product/LivePreview';

/**
 * Choosing the face the preview letters a plate in.
 *
 * This was a text box with a hidden datalist, so picking the right face meant
 * knowing to type "formal-script". A shopkeeper uploading a photograph of a
 * plate cut in a flowing script had no way to discover that the word existed,
 * and the preview went on drawing their piece in a plain sans -- the single
 * most obvious way a preview can fail to look like the product it is for.
 *
 * So the faces are shown rather than named: each tile is set in the face it
 * offers, which is the only description of a typeface anybody needs. The text
 * box is still here, folded away, because a studio with a licensed house font
 * can still name its own stack.
 *
 * A photograph carries no typeface -- there is no reading it off the picture
 * -- so this stays a choice somebody makes by eye. Showing the faces is what
 * makes that choice take a second.
 */
export function FontChoice({
  value, fallback, onChange,
}: {
  /** The product's own setting. Empty means it follows the design. */
  value: string;
  /** What the design uses when the product says nothing. */
  fallback: string;
  onChange: (value: string) => void;
}) {
  const known = PLATE_FONTS.some((face) => face.id === value);
  const [custom, setCustom] = useState(() => value !== '' && !known);

  const fallbackLabel = PLATE_FONTS.find((f) => f.id === fallback)?.label ?? fallback;

  return (
    <div className="sm:col-span-2">
      <p className="field-label">Lettering</p>
      <p className="mb-2 mt-1 text-2xs text-ink-400">
        Pick the face closest to the real piece — a photograph cannot tell us which one it was cut in.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => { setCustom(false); onChange(''); }}
          className={clsx(
            'border px-3 py-2.5 text-left transition-colors',
            value === '' && !custom
              ? 'border-ink bg-paper-off'
              : 'border-stone-line hover:border-ink-300',
          )}
        >
          <span className="block text-sm leading-tight text-ink" style={{ fontFamily: fontStack(fallback) }}>
            Abhay 104
          </span>
          <span className="mt-1 block text-2xs text-ink-400">
            From the design ({fallbackLabel})
          </span>
        </button>

        {PLATE_FONTS.map((face) => (
          <button
            key={face.id}
            type="button"
            onClick={() => { setCustom(false); onChange(face.id); }}
            title={face.note}
            className={clsx(
              'border px-3 py-2.5 text-left transition-colors',
              value === face.id && !custom
                ? 'border-ink bg-paper-off'
                : 'border-stone-line hover:border-ink-300',
            )}
          >
            <span className="block text-sm leading-tight text-ink" style={{ fontFamily: face.stack }}>
              Abhay 104
            </span>
            <span className="mt-1 block text-2xs text-ink-400">{face.label}</span>
          </button>
        ))}
      </div>

      {custom ? (
        <div className="mt-3">
          <input
            value={value}
            placeholder="e.g. &quot;Gotham&quot;, Helvetica, sans-serif"
            className="field w-full"
            onChange={(event) => onChange(event.target.value)}
          />
          <p className="mt-1 text-2xs text-ink-400">
            Any CSS font family or stack. It has to be installed on the customer&apos;s device or the
            preview falls back to the default face.
          </p>
        </div>
      ) : (
        <button
          type="button"
          className="mt-2 text-2xs text-ink-400 underline underline-offset-2 hover:text-ink"
          onClick={() => setCustom(true)}
        >
          Use our own font instead
        </button>
      )}
    </div>
  );
}
