import { Link } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import { ApiError, request } from '../lib/api';
import { Seo } from '../lib/seo';
import { useAuth, useSettings, useToast } from '../context/StoreProvider';
import { FileList } from '../components/product/EnquiryForm';
import { Button, ButtonLink, CheckIcon, Input, Select, Textarea } from '../components/ui';

const REQUIREMENTS = [
  'Home nameplate',
  'Office nameplate / branding',
  'GST plate',
  'QR stand',
  'Desk plate',
  'Print',
  'Informative / safety sign',
  'Something else',
];

export default function CustomOrderPage() {
  const { settings, get } = useSettings();
  const { user } = useAuth();
  const { push } = useToast();

  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [size, setSize] = useState<CustomSize>({ width: '', height: '', unit: 'ft' });

  const intro = get<string>('store.customOrderIntro', '');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set('type', 'CUSTOM_ORDER');

    // Fold the structured answers into the message, so nothing is lost.
    const requirement = String(form.get('requirement') ?? '');
    const material = String(form.get('material') ?? '');
    const details = String(form.get('details') ?? '');

    form.set('subject', requirement ? `Custom order — ${requirement}` : 'Custom order');
    form.set(
      'message',
      [
        requirement ? `Requirement: ${requirement}` : '',
        `Size: ${describeSize(size)}`,
        material ? `Material: ${material}` : '',
        '',
        details,
      ]
        .filter((line) => line !== '')
        .join('\n'),
    );
    form.delete('requirement');
    form.delete('material');
    form.delete('details');

    for (const file of files) form.append('attachments', file);

    const sizeError = validateSize(size);
    if (sizeError) {
      setErrors({ size: sizeError });
      document.getElementById('custom-size')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitting(true);
    setErrors({});
    try {
      await request('/enquiries', { method: 'POST', body: form });
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        push(err.message, 'error');
      } else {
        push('Could not send your request. Please try again.', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Seo
        settings={settings}
        title="Custom order"
        description="Tell us what you need made — sizes, material and artwork — and we will come back to you with a quote."
        canonical="/custom-order"
      />

      <section className="border-b border-stone-line bg-paper">
        <div className="container-site py-12 lg:py-16">
          <p className="eyebrow mb-4">Made to your specification</p>
          <h1 className="max-w-2xl text-3xl lg:text-4xl">Start a custom order</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-500">
            {intro ||
              'Send us your requirement, sizes and artwork. We will review it and come back to you with a quote.'}
          </p>
        </div>
      </section>

      <div className="container-site py-12 lg:py-16">
        {done ? (
          <div className="mx-auto max-w-lg border border-state-success/30 bg-[#EDF5F1] p-10 text-center">
            <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-state-success text-paper">
              <CheckIcon size={22} />
            </span>
            <h2 className="text-xl">Request received</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-600">
              Thank you. We have your requirement and any files you attached, and we will get back to you.
            </p>
            <div className="mt-7 flex justify-center gap-3">
              <ButtonLink to="/shop" variant="secondary" size="sm">
                Browse the shop
              </ButtonLink>
              <Button size="sm" onClick={() => { setDone(false); setFiles([]); }}>
                Send another
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <form onSubmit={handleSubmit} className="space-y-6 lg:col-span-7 xl:col-span-8">
              <div className="grid gap-5 sm:grid-cols-2">
                <Input
                  name="name" label="Your name" required defaultValue={user?.name ?? ''}
                  error={errors.name} autoComplete="name"
                />
                <Input
                  name="phone" label="Phone" type="tel" required defaultValue={user?.phone ?? ''}
                  error={errors.phone} autoComplete="tel"
                />
                <Input
                  name="email" label="Email" type="email" required defaultValue={user?.email ?? ''}
                  error={errors.email} autoComplete="email"
                />
                <Input name="company" label="Company (optional)" error={errors.company} autoComplete="organization" />
              </div>

              <div className="rule" />

              <div className="grid gap-5 sm:grid-cols-2">
                <Select name="requirement" label="What do you need?" required>
                  <option value="">Choose one</option>
                  {REQUIREMENTS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
                <Input name="quantity" label="Quantity" type="number" min={1} defaultValue={1} error={errors.quantity} />
                <SizeFields
                  value={size}
                  onChange={setSize}
                  error={errors.size}
                  className="sm:col-span-2"
                />
                <Input name="material" label="Material (if known)" placeholder="e.g. acrylic, stainless steel" />
                <Input
                  name="budget" label="Budget (optional)" placeholder="Helps us suggest the right option"
                  wrapClassName="sm:col-span-2" error={errors.budget}
                />
              </div>

              <Textarea
                name="details"
                label="Tell us about the piece"
                required
                rows={6}
                placeholder="What should it say? Where will it go — indoors or outdoors? Any style or colour you have in mind?"
                error={errors.message}
              />

              <FileList files={files} onChange={setFiles} label="Attach artwork, logo or a reference photo" />

              <Button type="submit" size="lg" loading={submitting}>
                Send request
              </Button>

              <p className="text-2xs leading-relaxed text-ink-400">
                We use your details only to respond to this request.
              </p>
            </form>

            <aside className="lg:col-span-5 xl:col-span-4">
              <div className="border border-stone-line bg-paper p-7">
                <h2 className="text-xs font-semibold uppercase tracking-architect">How it works</h2>
                <ol className="mt-5 space-y-5">
                  {[
                    { title: 'Send your requirement', text: 'Fill in the form with sizes, material and artwork.' },
                    { title: 'We review and quote', text: 'We come back to you with options and a price.' },
                    { title: 'Approve the artwork', text: 'You confirm the final design before anything is made.' },
                    { title: 'We make it', text: 'Your piece goes into production and ships to you.' },
                  ].map((step, index) => (
                    <li key={step.title} className="flex gap-4">
                      <span className="font-mono text-2xs text-ink-300">0{index + 1}</span>
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-architect">{step.title}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-ink-500">{step.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="mt-7 border-t border-stone-line pt-5">
                  <p className="text-xs text-ink-500">Prefer to talk it through?</p>
                  <a
                    href={`tel:${get<string>('contact.phone', '').replace(/\s/g, '')}`}
                    className="link-underline mt-1 block text-sm font-medium"
                  >
                    {get<string>('contact.phone', '')}
                  </a>
                  <a
                    href={`mailto:${get<string>('contact.email', '')}`}
                    className="link-underline mt-1 block text-sm"
                  >
                    {get<string>('contact.email', '')}
                  </a>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}


// ---------------------------------------------------------------------------
// Size
// ---------------------------------------------------------------------------

export interface CustomSize {
  width: string;
  height: string;
  unit: 'ft' | 'in' | 'cm';
}

/**
 * Beyond Walls does not take custom work below two feet by two feet.
 *
 * Anything smaller is already in the catalogue and is quicker and cheaper to
 * buy there, so the form says so and points the way rather than collecting an
 * enquiry that will only be turned down.
 */
const MIN_FEET = 2;

const TO_FEET: Record<CustomSize['unit'], number> = {
  ft: 1,
  in: 1 / 12,
  cm: 1 / 30.48,
};

export function toFeet(value: string, unit: CustomSize['unit']): number | null {
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n * TO_FEET[unit];
}

/** Returns the reason a size cannot be accepted, or null when it is fine. */
export function validateSize(size: CustomSize): string | null {
  const w = toFeet(size.width, size.unit);
  const h = toFeet(size.height, size.unit);

  if (w === null || h === null) {
    return 'Enter the width and height you need.';
  }
  // Rounded, so 23.9 inches does not fail on a floating-point hair.
  const round = (n: number) => Math.round(n * 100) / 100;
  if (round(w) < MIN_FEET || round(h) < MIN_FEET) {
    return `Custom orders start at ${MIN_FEET} ft × ${MIN_FEET} ft. For anything smaller, the ready-made range is quicker and costs less.`;
  }
  return null;
}

export function describeSize(size: CustomSize): string {
  return `${size.width} × ${size.height} ${size.unit === 'ft' ? 'feet' : size.unit === 'in' ? 'inches' : 'cm'}`;
}

function SizeFields({
  value, onChange, error, className,
}: {
  value: CustomSize;
  onChange: (next: CustomSize) => void;
  error?: string;
  className?: string;
}) {
  const w = toFeet(value.width, value.unit);
  const h = toFeet(value.height, value.unit);
  const belowMinimum =
    w !== null && h !== null && (Math.round(w * 100) / 100 < MIN_FEET || Math.round(h * 100) / 100 < MIN_FEET);

  return (
    <div id="custom-size" className={className}>
      <span className="field-label" data-required>
        Size
      </span>

      <div className="flex items-start gap-2">
        <Input
          name="width"
          type="number"
          min={0}
          step="0.1"
          inputMode="decimal"
          placeholder="Width"
          aria-label="Width"
          value={value.width}
          onChange={(e) => onChange({ ...value, width: e.target.value })}
          wrapClassName="flex-1"
          className={belowMinimum ? 'field-error' : undefined}
        />
        <span className="pt-2.5 text-sm text-ink-400">×</span>
        <Input
          name="height"
          type="number"
          min={0}
          step="0.1"
          inputMode="decimal"
          placeholder="Height"
          aria-label="Height"
          value={value.height}
          onChange={(e) => onChange({ ...value, height: e.target.value })}
          wrapClassName="flex-1"
          className={belowMinimum ? 'field-error' : undefined}
        />
        <Select
          aria-label="Unit"
          value={value.unit}
          onChange={(e) => onChange({ ...value, unit: e.target.value as CustomSize['unit'] })}
          wrapClassName="w-28"
          options={[
            { value: 'ft', label: 'feet' },
            { value: 'in', label: 'inches' },
            { value: 'cm', label: 'cm' },
          ]}
        />
      </div>

      {error || belowMinimum ? (
        <p className="mt-2 border border-state-warning/40 bg-[#F8F3E6] px-3 py-2.5 text-xs leading-relaxed text-ink-700" role="alert">
          {error ?? `Custom orders start at ${MIN_FEET} ft × ${MIN_FEET} ft.`}{' '}
          <Link to="/shop" className="link-underline font-medium text-ink">
            Browse the ready-made range
          </Link>
          .
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-ink-400">
          Minimum {MIN_FEET} ft × {MIN_FEET} ft. Smaller pieces are in the ready-made range.
        </p>
      )}
    </div>
  );
}
