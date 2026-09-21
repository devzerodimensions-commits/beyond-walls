import { useEffect, useRef, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ApiError, api, assetUrl, request } from '../../lib/api';
import type { MediaAsset, ContentStatus } from '../../lib/types';
import { statusMeta } from '../../lib/format';
import { useToast } from '../../context/StoreProvider';
import {
  Badge, Button, CloseIcon, DragIcon, Input, Modal, Select, Spinner, Skeleton,
  UploadIcon, EmptyState, SearchIcon,
} from '../ui';

// ---------------------------------------------------------------------------
// Page chrome
// ---------------------------------------------------------------------------

export function AdminPageHeader({
  title, description, actions, breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: { label: string; to: string };
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {breadcrumb ? (
          <Link
            to={breadcrumb.to}
            className="link-underline mb-2 inline-block text-2xs uppercase tracking-architect text-ink-400"
          >
            ← {breadcrumb.label}
          </Link>
        ) : null}
        <h1 className="text-2xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function AdminCard({
  title, description, children, actions, className, id,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={clsx('border border-stone-line bg-paper', className)}>
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-line px-5 py-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-architect">{title}</h2>
            {description ? <p className="mt-1 text-xs text-ink-400">{description}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatusBadge({ status }: { status: ContentStatus | string }) {
  const meta = statusMeta(status);
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/** Draft ⇄ Published toggle used across every admin list. */
export function StatusToggle({
  status, onChange, disabled,
}: {
  status: ContentStatus;
  onChange: (status: ContentStatus) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex border border-stone-line">
      {(['DRAFT', 'PUBLISHED'] as const).map((value) => (
        <button
          key={value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value)}
          className={clsx(
            'px-3 py-1.5 text-[0.6rem] font-medium uppercase tracking-architect transition-colors',
            status === value
              ? value === 'PUBLISHED'
                ? 'bg-state-success text-paper'
                : 'bg-ink-200 text-ink-700'
              : 'text-ink-400 hover:text-ink',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          {value === 'PUBLISHED' ? 'Live' : 'Draft'}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  width?: string;
}

export function DataTable<T extends { id: string }>({
  columns, rows, loading, emptyTitle = 'Nothing here yet', emptyDescription, emptyAction, skeletonRows = 6,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  skeletonRows?: number;
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-1">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.className} style={column.width ? { width: column.width } : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key} className={column.className}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminSearch({
  value, onChange, placeholder = 'Search…', className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={clsx('relative', className)}>
      <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field pl-9"
        aria-label={placeholder}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink"
          aria-label="Clear search"
        >
          <CloseIcon size={14} />
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reorderable list (drag & drop, with keyboard fallback)
// ---------------------------------------------------------------------------

export function SortableList<T extends { id: string }>({
  items, onReorder, renderItem, disabled,
}: {
  items: T[];
  onReorder: (ordered: T[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
  disabled?: boolean;
}) {
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  };

  return (
    <ul className="divide-y divide-stone-line border border-stone-line">
      {items.map((item, index) => (
        <li
          key={item.id}
          draggable={!disabled}
          onDragStart={() => {
            dragIndex.current = index;
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOverIndex(index);
          }}
          onDragLeave={() => setOverIndex(null)}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex.current !== null) move(dragIndex.current, index);
            dragIndex.current = null;
            setOverIndex(null);
          }}
          className={clsx(
            'flex items-center gap-3 bg-paper px-4 py-3 transition-colors',
            overIndex === index && 'bg-paper-warm',
          )}
        >
          {!disabled ? (
            <span className="flex flex-col">
              <button
                type="button"
                onClick={() => move(index, index - 1)}
                disabled={index === 0}
                className="px-1 text-ink-300 hover:text-ink disabled:opacity-25"
                aria-label="Move up"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(index, index + 1)}
                disabled={index === items.length - 1}
                className="px-1 text-ink-300 hover:text-ink disabled:opacity-25"
                aria-label="Move down"
              >
                ▼
              </button>
            </span>
          ) : null}
          <DragIcon size={15} className="shrink-0 cursor-grab text-ink-200" />
          <div className="min-w-0 flex-1">{renderItem(item, index)}</div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Product picker
// ---------------------------------------------------------------------------

interface PickableProduct {
  id: string;
  name: string;
  slug: string;
  status: ContentStatus;
  images?: { url: string; alt?: string | null }[];
}

/**
 * Search-as-you-type product selector.
 *
 * Replaces asking an admin to paste a product id out of the URL bar: the id is
 * still what gets stored, but it is never typed by hand, so a review can no
 * longer be attached to the wrong product by a mistyped character.
 */
export function ProductPicker({
  label, value, onChange, hint, allowEmpty = true,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (productId: string | null) => void;
  hint?: string;
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  // What is currently attached, so the field reads as a name, not an id.
  const { data: selected } = useQuery({
    queryKey: ['admin-product-pick', value],
    queryFn: () => api.get<PickableProduct>(`/admin/products/${value}`),
    enabled: Boolean(value),
    staleTime: 60_000,
  });

  const { data: results, isFetching } = useQuery({
    queryKey: ['admin-product-search', search],
    queryFn: () =>
      api.get<PickableProduct[]>('/admin/products', {
        search: search || undefined,
        perPage: 8,
      }),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      <span className="field-label">{label}</span>

      {value && selected ? (
        <div className="flex items-center gap-3 border border-stone-line bg-paper px-3 py-2.5">
          {selected.images?.[0] ? (
            <img
              src={assetUrl(selected.images[0].url)}
              alt=""
              className="h-9 w-9 shrink-0 border border-stone-line object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selected.name}</p>
            <p className="truncate text-2xs text-ink-400">/{selected.slug}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-2xs uppercase tracking-architect text-ink-500 hover:text-ink"
          >
            Change
          </button>
          {allowEmpty ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label="Remove product"
              className="text-ink-400 hover:text-state-danger"
            >
              <CloseIcon size={14} />
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 border border-dashed border-stone-line bg-paper px-3 py-2.5 text-left text-sm text-ink-400 hover:border-ink-300 hover:text-ink-600"
        >
          <SearchIcon size={14} />
          Search for a product…
        </button>
      )}

      {open ? (
        <div className="absolute z-30 mt-1 w-full border border-stone-line bg-paper shadow-lift">
          <div className="border-b border-stone-line p-2">
            <Input
              autoFocus
              value={search}
              placeholder="Type a product name…"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {isFetching && !results?.length ? (
              <li className="px-3 py-4 text-center text-xs text-ink-400">Searching…</li>
            ) : null}
            {!isFetching && !results?.length ? (
              <li className="px-3 py-4 text-center text-xs text-ink-400">
                No products match “{search}”.
              </li>
            ) : null}
            {(results ?? []).map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => { onChange(product.id); setOpen(false); setSearch(''); }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-stone-50"
                >
                  {product.images?.[0] ? (
                    <img
                      src={assetUrl(product.images[0].url)}
                      alt=""
                      className="h-8 w-8 shrink-0 border border-stone-line object-cover"
                    />
                  ) : (
                    <span className="h-8 w-8 shrink-0 border border-dashed border-stone-line" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{product.name}</span>
                    <span className="block truncate text-2xs text-ink-400">/{product.slug}</span>
                  </span>
                  <Badge tone={product.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                    {product.status.toLowerCase()}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hint ? <p className="mt-1.5 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Media picker
// ---------------------------------------------------------------------------

/** Single-image field with upload + media-library picker. */
export function ImageField({
  label, value, onChange, folder = 'general', hint,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  folder?: string;
  hint?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { push } = useToast();

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('files', file);
      form.append('folder', folder);
      const assets = await api.upload<MediaAsset[]>('/admin/media', form);
      onChange(assets[0]?.url ?? null);
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <span className="field-label">{label}</span>

      {value ? (
        <div className="flex items-center gap-3 border border-stone-line bg-paper p-3">
          <img src={assetUrl(value)} alt="" className="h-16 w-16 border border-stone-line object-contain" />
          <span className="flex-1 truncate text-xs text-ink-500">{value.split('/').pop()}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => setPickerOpen(true)}>
            Change
          </Button>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="p-1 text-ink-400 transition-colors hover:text-state-danger"
            aria-label="Remove image"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <label
            className={clsx(
              'flex flex-1 cursor-pointer items-center justify-center gap-2 border border-dashed border-stone-mute',
              'bg-paper px-4 py-5 text-center transition-colors hover:border-ink',
              uploading && 'pointer-events-none opacity-60',
            )}
          >
            {uploading ? <Spinner size={16} /> : <UploadIcon size={16} className="text-ink-300" />}
            <span className="text-xs text-ink-500">{uploading ? 'Uploading…' : 'Upload'}</span>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.gif,.avif"
              className="hidden"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </label>
          <Button type="button" variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
            Media library
          </Button>
        </div>
      )}

      {hint ? <p className="mt-1.5 text-xs text-ink-400">{hint}</p> : null}

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(url) => {
          onChange(url);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

export function MediaPicker({
  open, onClose, onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .list<MediaAsset[]>('/admin/media', { perPage: 60, search })
      .then((result) => setAssets(result.data))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, [open, search]);

  return (
    <Modal open={open} onClose={onClose} title="Media library" size="lg">
      <AdminSearch value={search} onChange={setSearch} placeholder="Search files…" className="mb-4" />

      {loading ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={i} className="aspect-square w-full" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-400">
          No files yet. Upload one from Admin → Media.
        </p>
      ) : (
        <div className="grid max-h-[55vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-5">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => onPick(asset.url)}
              className="group aspect-square overflow-hidden border border-stone-line bg-paper-warm transition-colors hover:border-ink"
              title={asset.filename}
            >
              <img
                src={assetUrl(asset.url)}
                alt={asset.alt ?? asset.filename}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** Multi-image uploader used on the product editor. */
export function MultiImageUpload({
  onUpload, uploading, label = 'Upload images',
}: {
  onUpload: (files: FileList) => void;
  uploading: boolean;
  label?: string;
}) {
  return (
    <label
      className={clsx(
        'flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-stone-mute',
        'bg-paper px-4 py-8 text-center transition-colors hover:border-ink',
        uploading && 'pointer-events-none opacity-60',
      )}
    >
      {uploading ? <Spinner size={20} /> : <UploadIcon size={20} className="text-ink-300" />}
      <span className="text-xs text-ink-600">{uploading ? 'Uploading…' : label}</span>
      <span className="text-2xs text-ink-300">JPG, PNG, WEBP, GIF or AVIF — up to 12 at a time</span>
      <input
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.gif,.avif"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onUpload(e.target.files);
          e.target.value = '';
        }}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Two-column label/value grid used in detail panels. */
export function DefinitionList({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-stone-line/70">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-4 py-2.5 text-sm">
          <dt className="shrink-0 text-ink-400">{row.label}</dt>
          <dd className="text-right text-ink-700">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A repeatable string list editor (features, applications, USP items…). */
export function StringListEditor({
  label, values, onChange, placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    onChange([...values, value]);
    setDraft('');
  };

  return (
    <div>
      <span className="field-label">{label}</span>

      {values.length ? (
        <ul className="mb-2 space-y-1.5">
          {values.map((value, index) => (
            <li
              key={`${value}-${index}`}
              className="flex items-center gap-2 border border-stone-line bg-paper px-3 py-2"
            >
              <span className="flex-1 text-xs">{value}</span>
              <button
                type="button"
                onClick={() => onChange(values.filter((_, i) => i !== index))}
                className="text-ink-300 transition-colors hover:text-state-danger"
                aria-label={`Remove ${value}`}
              >
                <CloseIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder ?? 'Type and press Enter'}
          className="field flex-1"
        />
        <Button type="button" variant="secondary" size="sm" onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}

/** Simple generic field renderer used by the generic resource editor. */
export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'image' | 'date' | 'color' | 'product';
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  required?: boolean;
  folder?: string;
  colSpan?: 1 | 2;
}

export function RenderField({
  field, value, onChange, error,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}) {
  const span = field.colSpan === 2 ? 'sm:col-span-2' : '';

  switch (field.type) {
    case 'textarea':
      return (
        <div className={span}>
          <span className="field-label">{field.label}</span>
          <textarea
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={5}
            className={clsx('field min-h-[110px] resize-y', error && 'field-error')}
          />
          {error ? <p className="mt-1.5 text-xs text-state-danger">{error}</p> : null}
          {!error && field.hint ? <p className="mt-1.5 text-xs text-ink-400">{field.hint}</p> : null}
        </div>
      );

    case 'select':
      return (
        <Select
          label={field.label}
          value={String(value ?? '')}
          error={error}
          hint={field.hint}
          wrapClassName={span}
          onChange={(e) => onChange(e.target.value)}
          options={field.options ?? []}
        />
      );

    case 'checkbox':
      return (
        <label className={clsx('flex cursor-pointer items-center gap-2.5 pt-6', span)}>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 shrink-0 cursor-pointer appearance-none border border-ink-300 bg-paper checked:border-ink checked:bg-ink
                       checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22white%22><path d=%22M6.2 11.3 3.4 8.5l1-1 1.8 1.8 4.4-4.4 1 1z%22/></svg>')] checked:bg-center checked:bg-no-repeat"
          />
          <span className="text-sm text-ink-700">{field.label}</span>
        </label>
      );

    case 'product':
      return (
        <div className={span}>
          <ProductPicker
            label={field.label}
            value={value as string | null}
            onChange={onChange}
            hint={field.hint}
            allowEmpty={!field.required}
          />
        </div>
      );

    case 'image':
      return (
        <div className={span}>
          <ImageField
            label={field.label}
            value={value as string | null}
            onChange={onChange}
            folder={field.folder}
            hint={field.hint}
          />
        </div>
      );

    case 'number':
      return (
        <Input
          type="number"
          label={field.label}
          value={value === null || value === undefined ? '' : String(value)}
          error={error}
          hint={field.hint}
          placeholder={field.placeholder}
          wrapClassName={span}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );

    case 'date':
      return (
        <Input
          type="date"
          label={field.label}
          value={value ? String(value).slice(0, 10) : ''}
          error={error}
          hint={field.hint}
          wrapClassName={span}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );

    case 'color':
      return (
        <div className={span}>
          <span className="field-label">{field.label}</span>
          <div className="flex gap-2">
            <input
              type="color"
              value={String(value ?? '#111111')}
              onChange={(e) => onChange(e.target.value)}
              className="h-10 w-14 cursor-pointer border border-stone-line bg-paper p-1"
            />
            <input
              value={String(value ?? '')}
              onChange={(e) => onChange(e.target.value)}
              placeholder="#111111"
              className="field flex-1"
            />
          </div>
        </div>
      );

    default:
      return (
        <Input
          label={field.label}
          value={String(value ?? '')}
          error={error}
          hint={field.hint}
          placeholder={field.placeholder}
          required={field.required}
          wrapClassName={span}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

/** Shared save helper that surfaces field errors consistently. */
export async function saveResource<T>(
  path: string,
  body: unknown,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<T> {
  const response = await request<T>(path, { method, body });
  return response.data;
}
