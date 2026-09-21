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

  const intro = get<string>('store.customOrderIntro', '');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set('type', 'CUSTOM_ORDER');

    // Fold the structured answers into the message, so nothing is lost.
    const requirement = String(form.get('requirement') ?? '');
    const size = String(form.get('size') ?? '');
    const material = String(form.get('material') ?? '');
    const details = String(form.get('details') ?? '');

    form.set('subject', requirement ? `Custom order — ${requirement}` : 'Custom order');
    form.set(
      'message',
      [
        requirement ? `Requirement: ${requirement}` : '',
        size ? `Size: ${size}` : '',
        material ? `Material: ${material}` : '',
        '',
        details,
      ]
        .filter((line) => line !== '')
        .join('\n'),
    );
    form.delete('requirement');
    form.delete('size');
    form.delete('material');
    form.delete('details');

    for (const file of files) form.append('attachments', file);

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
                <Input name="size" label="Size (if known)" placeholder="e.g. 12 × 6 inches" />
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
