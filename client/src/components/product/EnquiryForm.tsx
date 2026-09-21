import { useState, type FormEvent } from 'react';
import { ApiError, request } from '../../lib/api';
import type { Product } from '../../lib/types';
import { useAuth, useToast } from '../../context/StoreProvider';
import { Button, Input, Modal, Textarea, UploadIcon, CloseIcon } from '../ui';

interface Props {
  open: boolean;
  onClose: () => void;
  product?: Product;
  type?: 'CONTACT' | 'CUSTOM_ORDER' | 'PRODUCT_ENQUIRY' | 'BULK_ORDER' | 'PRICE_REQUEST';
  title?: string;
}

/** Shared enquiry dialog used for price requests and product questions. */
export function EnquiryForm({ open, onClose, product, type = 'PRODUCT_ENQUIRY', title }: Props) {
  const { user } = useAuth();
  const { push } = useToast();

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [done, setDone] = useState(false);

  const heading =
    title ?? (type === 'PRICE_REQUEST' ? 'Request a price' : 'Ask about this product');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set('type', type);
    if (product) form.set('productId', product.id);
    for (const file of files) form.append('attachments', file);

    setSubmitting(true);
    setErrors({});
    try {
      await request('/enquiries', { method: 'POST', body: form });
      setDone(true);
      push('Thank you — we have received your enquiry.', 'success');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        if (!Object.keys(err.fieldErrors).length) push(err.message, 'error');
      } else {
        push('Could not send your enquiry. Please try again.', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    setDone(false);
    setFiles([]);
    setErrors({});
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={heading} size="md">
      {done ? (
        <div className="py-6 text-center">
          <h3 className="text-lg">Enquiry sent</h3>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-500">
            We have your details and will get back to you. You can also call us if it is urgent.
          </p>
          <Button className="mt-7" onClick={close}>
            Close
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {product ? (
            <div className="flex items-center gap-3 border border-stone-line bg-paper-off p-3">
              <span className="text-2xs uppercase tracking-architect text-ink-400">Regarding</span>
              <span className="text-sm font-medium">{product.name}</span>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="name" label="Your name" required defaultValue={user?.name ?? ''}
              error={errors.name} autoComplete="name"
            />
            <Input
              name="phone" label="Phone" type="tel" defaultValue={user?.phone ?? ''}
              error={errors.phone} autoComplete="tel"
            />
          </div>

          <Input
            name="email" label="Email" type="email" required defaultValue={user?.email ?? ''}
            error={errors.email} autoComplete="email"
          />

          {type === 'PRICE_REQUEST' || type === 'BULK_ORDER' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="quantity" label="Quantity needed" type="number" min={1} error={errors.quantity} />
              <Input name="budget" label="Budget (optional)" placeholder="e.g. under ₹2,000" error={errors.budget} />
            </div>
          ) : null}

          <Textarea
            name="message"
            label="Your message"
            required
            rows={4}
            placeholder={
              type === 'PRICE_REQUEST'
                ? 'Tell us the size, material and the text you need on it.'
                : 'What would you like to know?'
            }
            error={errors.message}
          />

          <FileList files={files} onChange={setFiles} />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Send enquiry
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function FileList({
  files, onChange, label = 'Attach artwork or reference (optional)', max = 6,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  label?: string;
  max?: number;
}) {
  return (
    <div>
      <span className="field-label">{label}</span>

      {files.length ? (
        <ul className="mb-2 space-y-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 border border-stone-line bg-paper px-3 py-2"
            >
              <span className="flex-1 truncate text-xs">{file.name}</span>
              <span className="text-2xs text-ink-300">{(file.size / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                className="text-ink-400 transition-colors hover:text-state-danger"
                aria-label={`Remove ${file.name}`}
              >
                <CloseIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {files.length < max ? (
        <label className="flex cursor-pointer items-center justify-center gap-2 border border-dashed border-stone-mute bg-paper px-4 py-5 text-center transition-colors hover:border-ink">
          <UploadIcon size={16} className="text-ink-300" />
          <span className="text-xs text-ink-500">Add files — JPG, PNG, WEBP, GIF, AVIF or PDF</span>
          <input
            type="file"
            multiple
            className="hidden"
            accept=".jpg,.jpeg,.png,.webp,.gif,.avif,.pdf"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              onChange([...files, ...picked].slice(0, max));
              e.target.value = '';
            }}
          />
        </label>
      ) : null}
    </div>
  );
}
