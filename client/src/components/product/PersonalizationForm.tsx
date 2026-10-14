import { useState } from 'react';
import clsx from 'clsx';
import type { PersonalizationField } from '../../lib/types';
import { api, assetUrl } from '../../lib/api';
import { formatPrice, toNumber } from '../../lib/format';
import { FieldWrap, Input, Select, Spinner, Textarea, UploadIcon, CloseIcon } from '../ui';
import { fontStack } from './LivePreview';

interface Props {
  fields: PersonalizationField[];
  values: Record<string, string>;
  errors?: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

/** Renders the admin-defined personalization fields for a product. */
/**
 * The three questions a customer is actually answering.
 *
 * Seven inputs in a flat column is a form. The same seven under these headings
 * is a decision with three parts, and somebody who has never bought a
 * nameplate can tell at a glance what is being asked of them.
 *
 * Which group a field belongs to is read from what the field does, not from a
 * list kept here, so a field added in the admin lands somewhere sensible
 * without anyone remembering to update this: anything that puts a colour or a
 * typeface on the plate is how it looks, anything else bound to the drawing is
 * what it says, and whatever is left is neither.
 */
const GROUPS = [
  { key: 'says', title: 'What it says', hint: 'Printed on the plate exactly as typed.' },
  { key: 'looks', title: 'How it looks', hint: undefined },
  { key: 'extra', title: 'Anything else', hint: undefined },
] as const;

function groupOf(field: PersonalizationField): (typeof GROUPS)[number]['key'] {
  if (field.type === 'COLOR' || field.type === 'FONT') return 'looks';
  return field.previewSlot ? 'says' : 'extra';
}

export function PersonalizationForm({ fields, values, errors = {}, onChange }: Props) {
  const active = fields.filter((f) => f.status === 'PUBLISHED').sort((a, b) => a.sortOrder - b.sortOrder);
  if (!active.length) return null;

  const input = (field: PersonalizationField) => (
    <PersonalizationInput
      key={field.id}
      field={field}
      value={values[field.key] ?? ''}
      error={errors[field.key]}
      onChange={(value) => onChange(field.key, value)}
    />
  );

  const grouped = GROUPS.map((group) => ({
    ...group,
    fields: active.filter((f) => groupOf(f) === group.key),
  })).filter((g) => g.fields.length);

  // One heading over one field is a label with extra steps.
  if (grouped.length < 2) return <div className="space-y-5">{active.map(input)}</div>;

  return (
    <div className="space-y-7">
      {grouped.map((group) => (
        <div key={group.key}>
          <div className="mb-3.5 flex items-baseline gap-2 border-b border-stone-line pb-2">
            <h3 className="text-2xs font-semibold uppercase tracking-architect text-ink">
              {group.title}
            </h3>
            {group.hint ? <p className="text-2xs text-ink-400">{group.hint}</p> : null}
          </div>
          <div className="space-y-5">{group.fields.map(input)}</div>
        </div>
      ))}
    </div>
  );
}

function priceSuffix(delta: number | string | undefined): string {
  const n = toNumber(delta ?? 0) ?? 0;
  if (n === 0) return '';
  return ` (+${formatPrice(n)})`;
}

function PersonalizationInput({
  field, value, error, onChange,
}: {
  field: PersonalizationField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const label = `${field.label}${priceSuffix(field.priceDelta)}`;
  // A published personalization field is part of the production brief. The
  // customer must answer every one before the item can enter the cart.
  const required = true;

  switch (field.type) {
    case 'TEXTAREA':
      return (
        <Textarea
          label={label}
          required={required}
          error={error}
          hint={field.helpText ?? undefined}
          placeholder={field.placeholder ?? ''}
          maxLength={field.maxLength ?? undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'SELECT':
      return (
        <Select
          label={label}
          required={required}
          error={error}
          hint={field.helpText ?? undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{field.placeholder || 'Choose an option'}</option>
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
              {priceSuffix(opt.priceDelta)}
            </option>
          ))}
        </Select>
      );

    case 'RADIO':
      return (
        <FieldWrap label={label} required={required} error={error} hint={field.helpText ?? undefined}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {field.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange(opt.value)}
                className={clsx(
                  'flex min-h-[2.5rem] items-center justify-center border px-3 py-2 text-center text-xs leading-tight transition-colors',
                  value === opt.value ? 'border-ink bg-ink text-paper' : 'border-stone-line hover:border-ink',
                )}
              >
                {opt.label}
                {priceSuffix(opt.priceDelta)}
              </button>
            ))}
          </div>
        </FieldWrap>
      );

    case 'CHECKBOX':
      return (
        <FieldWrap error={error} hint={field.helpText ?? undefined}>
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              required
              checked={value === 'yes'}
              onChange={(e) => onChange(e.target.checked ? 'yes' : '')}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer appearance-none border border-ink-300 bg-paper checked:border-ink checked:bg-ink"
            />
            <span className="text-sm text-ink-700">
              {label} <span aria-hidden="true" className="text-state-danger">*</span>
            </span>
          </label>
        </FieldWrap>
      );

    case 'COLOR':
      return (
        <FieldWrap label={label} required={required} error={error} hint={field.helpText ?? undefined}>
          <div className="flex flex-wrap gap-2.5">
            {field.options.map((opt) => {
              const selected = value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.label}
                  aria-label={opt.label}
                  aria-pressed={selected}
                  onClick={() => onChange(opt.value)}
                  className={clsx(
                    'flex items-center gap-2 border px-3 py-2 text-xs transition-colors',
                    selected ? 'border-ink' : 'border-stone-line hover:border-ink-300',
                  )}
                >
                  <span
                    className="h-4 w-4 border border-ink-100"
                    style={{ backgroundColor: opt.hex ?? opt.value }}
                  />
                  {opt.label}
                  {priceSuffix(opt.priceDelta)}
                </button>
              );
            })}
          </div>
        </FieldWrap>
      );

    case 'FONT':
      return (
        <FieldWrap label={label} required={required} error={error} hint={field.helpText ?? undefined}>
          <div className="grid grid-cols-3 gap-2">
            {field.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange(opt.value)}
                className={clsx(
                  'flex min-h-[2.5rem] items-center justify-center border px-2 py-2 text-center text-sm leading-tight transition-colors',
                  value === opt.value ? 'border-ink bg-ink text-paper' : 'border-stone-line hover:border-ink',
                )}
                // Each choice is set in the face it produces, so the customer
                // is choosing by eye rather than by name.
                style={{ fontFamily: fontStack(opt.value) }}
              >
                {opt.label}
                {priceSuffix(opt.priceDelta)}
              </button>
            ))}
          </div>
        </FieldWrap>
      );

    case 'IMAGE_UPLOAD':
    case 'FILE_UPLOAD':
      return (
        <FileField field={field} value={value} error={error} onChange={onChange} label={label} />
      );

    case 'NUMBER':
      return (
        <Input
          type="number"
          label={label}
          required={required}
          error={error}
          hint={field.helpText ?? undefined}
          placeholder={field.placeholder ?? ''}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'DATE':
      return (
        <Input
          type="date"
          label={label}
          required={required}
          error={error}
          hint={field.helpText ?? undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'GSTIN':
      return (
        <Input
          label={label}
          required={required}
          error={error}
          hint={field.helpText ?? '15-character GSTIN, e.g. 24AAAAA0000A1Z5'}
          placeholder={field.placeholder ?? '24AAAAA0000A1Z5'}
          value={value}
          maxLength={15}
          className="uppercase"
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
      );

    case 'URL':
      return (
        <Input
          type="url"
          label={label}
          required={required}
          error={error}
          hint={field.helpText ?? 'Include https://'}
          placeholder={field.placeholder ?? 'https://'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'EMAIL':
      return (
        <Input
          type="email" label={label} required={required} error={error}
          hint={field.helpText ?? undefined} placeholder={field.placeholder ?? ''}
          value={value} onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'PHONE':
      return (
        <Input
          type="tel" label={label} required={required} error={error}
          hint={field.helpText ?? undefined} placeholder={field.placeholder ?? ''}
          value={value} onChange={(e) => onChange(e.target.value)}
        />
      );

    default:
      return (
        <div>
          <Input
            label={label}
            required={required}
            error={error}
            hint={field.helpText ?? undefined}
            placeholder={field.placeholder ?? ''}
            maxLength={field.maxLength ?? undefined}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.maxLength ? (
            <p className="mt-1 text-right text-2xs text-ink-300">
              {value.length}/{field.maxLength}
            </p>
          ) : null}
        </div>
      );
  }
}

/** Uploads artwork immediately and stores the resulting URL as the field value. */
function FileField({
  field, value, error, onChange, label,
}: {
  field: PersonalizationField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('attachments', file);
      form.append('folder', 'personalization');
      // The enquiry endpoint doubles as the customer-facing upload endpoint;
      // here we use the dedicated artwork upload route.
      const result = await api.upload<{ url: string }[]>('/uploads/artwork', form);
      onChange(result[0]?.url ?? '');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const isImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(value);

  return (
    <FieldWrap label={label} required error={error ?? uploadError ?? undefined} hint={field.helpText ?? undefined}>
      {value ? (
        <div className="flex items-center gap-3 border border-stone-line bg-paper p-3">
          {isImage ? (
            <img src={assetUrl(value)} alt="" className="h-14 w-14 border border-stone-line object-contain" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center border border-stone-line bg-paper-warm text-2xs uppercase text-ink-400">
              File
            </div>
          )}
          <span className="flex-1 truncate text-xs text-ink-500">{value.split('/').pop()}</span>
          <button
            type="button"
            onClick={() => onChange('')}
            className="p-1 text-ink-400 transition-colors hover:text-state-danger"
            aria-label="Remove file"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      ) : (
        <label
          className={clsx(
            'flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-stone-mute',
            'bg-paper px-4 py-7 text-center transition-colors hover:border-ink',
            uploading && 'pointer-events-none opacity-60',
          )}
        >
          {uploading ? <Spinner size={18} /> : <UploadIcon size={20} className="text-ink-300" />}
          <span className="text-xs text-ink-500">
            {uploading ? 'Uploading…' : 'Click to upload, or drag a file here'}
          </span>
          <span className="text-2xs text-ink-300">
            {field.type === 'IMAGE_UPLOAD' ? 'JPG, PNG, WEBP, GIF or AVIF' : 'JPG, PNG, WEBP, GIF, AVIF or PDF'}
          </span>
          <input
            type="file"
            className="hidden"
            // Must match the server's allow-list: SVG is refused because it can
            // carry script, and AI/EPS/PSD/CDR are not accepted at all.
            accept={field.type === 'IMAGE_UPLOAD' ? '.jpg,.jpeg,.png,.webp,.gif,.avif' : '.jpg,.jpeg,.png,.webp,.gif,.avif,.pdf'}
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </label>
      )}
    </FieldWrap>
  );
}

/** Seeds the form with each field's configured default. */
export function defaultPersonalizationValues(fields: PersonalizationField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    if (field.status !== 'PUBLISHED') continue;
    out[field.key] = field.defaultValue ?? '';
  }
  return out;
}

/** Client-side mirror of the server's validation, for immediate feedback. */
export function validatePersonalizationValues(
  fields: PersonalizationField[],
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (field.status !== 'PUBLISHED') continue;
    const value = (values[field.key] ?? '').trim();

    if (!value) {
      errors[field.key] = `${field.label} is required`;
      continue;
    }
    if (field.maxLength && value.length > field.maxLength) {
      errors[field.key] = `Use ${field.maxLength} characters or fewer`;
    }
    if (field.minLength && value.length < field.minLength) {
      errors[field.key] = `Use at least ${field.minLength} characters`;
    }
    if (field.type === 'GSTIN' && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(value)) {
      errors[field.key] = 'Enter a valid 15-character GSTIN';
    }
    if (field.type === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors[field.key] = 'Enter a valid email address';
    }
    if (field.type === 'URL') {
      try {
        // eslint-disable-next-line no-new
        new URL(value);
      } catch {
        errors[field.key] = 'Enter a valid URL including https://';
      }
    }
  }

  return errors;
}

/** Sum of the price deltas the current selection adds. */
export function personalizationCost(
  fields: PersonalizationField[],
  values: Record<string, string>,
): number {
  let total = 0;
  for (const field of fields) {
    if (field.status !== 'PUBLISHED') continue;
    const value = values[field.key];
    if (!value) continue;

    total += toNumber(field.priceDelta) ?? 0;
    if (['SELECT', 'RADIO', 'COLOR', 'FONT'].includes(field.type)) {
      const option = field.options.find((o) => o.value === value);
      if (option?.priceDelta) total += toNumber(option.priceDelta) ?? 0;
    }
  }
  return total;
}
