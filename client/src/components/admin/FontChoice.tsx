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
      {/*
        * What this setting now is.
        *
        * It used to be the answer to "which face was this cut in?", which a
        * photograph cannot say and nobody could check. Customers choose their
        * own lettering now, so this is the face their plate STARTS on -- the
        * one closest to the piece in the photograph, and the one most of them
        * will leave alone.
        */}
      <p className="mb-2 mt-1 text-2xs leading-relaxed text-ink-400">
        The face this product’s preview starts on. Pick the one closest to the real piece — a
        photograph cannot tell us which it was cut in. Customers can change it from the
        “Lettering” question under Personalisation, and the plate follows as they do.
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
