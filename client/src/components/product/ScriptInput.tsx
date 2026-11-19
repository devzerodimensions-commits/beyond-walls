import { useEffect, useRef, useState } from 'react';
import { Input } from '../ui';
import { fontStack } from './LivePreview';
import { hasLatin, toDevanagari } from '../../lib/devanagari';

/**
 * The name field on a product whose lettering is Devanagari.
 *
 * A plate cut in Devanagari has to be ordered in Devanagari -- what the
 * customer types is what gets cut -- and most of the people buying one have no
 * Devanagari keyboard. Asked to type कुलकर्णी, they type Kulkarni, and the
 * studio ends up with a Marathi nameplate reading in English.
 *
 * So they type Kulkarni and are shown कुलकर्णी underneath, and that is what is
 * stored. The conversion is a first guess and is never silent: the Devanagari
 * sits in the open, in the plate's own face, with Edit beside it. Roman
 * spelling genuinely cannot say whether a "t" is त or ट -- Patel is पटेल,
 * Mitra is मित्र -- so some names will come back a letter wrong, and the only
 * honest design is one where the customer sees that before they pay rather
 * than when the metal arrives. Anyone who does have a Devanagari keyboard can
 * type straight into it and nothing here gets in their way.
 *
 * It runs in the browser. A customer's name is the most personal thing on the
 * order and has no business being sent to a third party to be spelled.
 */
export function ScriptInput({
  label, required, error, hint, placeholder, maxLength, value, onChange,
}: {
  label: string;
  required: boolean;
  error?: string;
  hint?: string;
  placeholder?: string;
  maxLength?: number;
  value: string;
  onChange: (value: string) => void;
}) {
  /*
   * Direct means they are typing the Devanagari themselves -- either because
   * they pressed Edit, or because they arrived with a value already in it and
   * there is no Roman draft left to re-derive it from.
   */
  const [direct, setDirect] = useState(() => value.trim() !== '' && !hasLatin(value));
  const [roman, setRoman] = useState(() => (hasLatin(value) ? value : ''));

  /*
   * A field can arrive already filled -- the admin sets a default answer, and
   * duplicating a product carries it across. If that default is in Roman it
   * would sit in the box untouched and be cut as Roman, which is the single
   * thing this component exists to stop. So it is converted once on arrival,
   * exactly as if the customer had typed it, and shown for approval like any
   * other guess.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (!direct && hasLatin(value)) onChange(toDevanagari(value));
    // Arrival only: afterwards the customer owns the field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typeRoman = (next: string) => {
    const converted = toDevanagari(next);
    // The limit belongs to what gets cut, not to what they type to get there.
    if (maxLength && converted.length > maxLength) return;
    setRoman(next);
    onChange(converted);
  };

  if (direct) {
    return (
      <div>
        <Input
          label={label}
          required={required}
          error={error}
          hint={hint}
          placeholder={placeholder}
          maxLength={maxLength}
          value={value}
          style={{ fontFamily: fontStack('devanagari') }}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <button
            type="button"
            className="text-2xs text-ink-400 underline underline-offset-2 hover:text-ink"
            onClick={() => { setRoman(''); setDirect(false); }}
          >
            Type it in English instead
          </button>
          {maxLength ? (
            <span className="text-2xs text-ink-300">{value.length}/{maxLength}</span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Input
        label={label}
        required={required}
        error={error}
        hint={hint ?? 'Type the name in English — we convert it below.'}
        placeholder={placeholder || 'Kulkarni'}
        value={roman}
        onChange={(e) => typeRoman(e.target.value)}
      />
      {value ? (
        <div className="mt-1.5 flex items-center justify-between gap-3 border-l-2 border-stone-line bg-paper-off px-3 py-2">
          <div className="min-w-0">
            <p className="text-2xs uppercase tracking-architect text-ink-400">On the plate</p>
            <p
              className="truncate text-lg leading-snug text-ink"
              style={{ fontFamily: fontStack('devanagari') }}
            >
              {value}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-2xs text-ink-500 underline underline-offset-2 hover:text-ink"
            onClick={() => setDirect(true)}
          >
            Edit
          </button>
        </div>
      ) : null}
    </div>
  );
}
