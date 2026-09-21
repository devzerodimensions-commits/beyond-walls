import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ApiError, api, assetUrl } from '../../lib/api';
import type { ContentStatus } from '../../lib/types';
import { formatDate, formatDateInput, truncate } from '../../lib/format';
import { useToast } from '../../context/StoreProvider';
import {
  AdminCard, AdminPageHeader, AdminSearch, DataTable, RenderField, SortableList,
  StatusToggle, type FieldDef,
} from '../../components/admin/AdminKit';
import {
  Badge, Button, ConfirmDialog, EditIcon, Modal, Pagination, PlusIcon, Select, TrashIcon,
} from '../../components/ui';

/**
 * One configurable screen drives every simple content resource, so each of them
 * gets the same Create / Edit / Delete / Draft / Publish / Reorder behaviour.
 */

type ResourceKey = 'banners' | 'gallery' | 'testimonials' | 'faqs' | 'coupons' | 'reviews' | 'nav-links';

interface ResourceConfig {
  endpoint: string;
  title: string;
  description: string;
  singular: string;
  fields: FieldDef[];
  /** Columns for the table view. */
  columns: { key: string; header: string; render: (row: Record<string, unknown>) => React.ReactNode }[];
  hasStatus: boolean;
  hasSortOrder: boolean;
  searchPlaceholder?: string;
  defaults?: Record<string, unknown>;
  /** Shown above the list — used where content must not be invented. */
  note?: string;
}

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const RESOURCES: Record<ResourceKey, ResourceConfig> = {
  banners: {
    endpoint: '/admin/banners',
    title: 'Banners',
    description: 'Hero and promotional banners. Placement decides where each one appears.',
    singular: 'banner',
    hasStatus: true,
    hasSortOrder: true,
    searchPlaceholder: 'Search banners…',
    defaults: { placement: 'HOME_HERO', status: 'DRAFT' },
    fields: [
      { key: 'eyebrow', label: 'Eyebrow (small label above the title)', type: 'text' },
      { key: 'title', label: 'Title', type: 'text', colSpan: 2 },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea', colSpan: 2 },
      { key: 'image', label: 'Image', type: 'image', folder: 'banners', colSpan: 2 },
      { key: 'mobileImage', label: 'Mobile image (optional)', type: 'image', folder: 'banners', colSpan: 2 },
      { key: 'link', label: 'Link', type: 'text', placeholder: '/shop' },
      { key: 'ctaLabel', label: 'Button label', type: 'text' },
      {
        key: 'placement', label: 'Placement', type: 'select',
        options: [
          { value: 'HOME_HERO', label: 'Homepage hero' },
          { value: 'HOME_SPLIT', label: 'Homepage split (two-up)' },
          { value: 'HOME_WIDE', label: 'Homepage wide' },
          { value: 'SHOP_TOP', label: 'Shop page top' },
          { value: 'CATEGORY_TOP', label: 'Category page top' },
          { value: 'ANNOUNCEMENT', label: 'Announcement' },
        ],
      },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
      { key: 'startsAt', label: 'Show from', type: 'date' },
      { key: 'endsAt', label: 'Show until', type: 'date' },
    ],
    columns: [
      {
        key: 'banner',
        header: 'Banner',
        render: (row) => (
          <div className="flex items-center gap-3">
            {row.image ? (
              <img src={assetUrl(String(row.image))} alt="" className="h-10 w-16 border border-stone-line object-cover" />
            ) : (
              <span className="flex h-10 w-16 items-center justify-center border border-dashed border-stone-line text-[0.55rem] text-ink-300">
                No image
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{String(row.title ?? 'Untitled')}</p>
              <p className="truncate text-2xs text-ink-400">{String(row.subtitle ?? '')}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'placement',
        header: 'Placement',
        render: (row) => <Badge>{String(row.placement).replace(/_/g, ' ').toLowerCase()}</Badge>,
      },
    ],
  },

  gallery: {
    endpoint: '/admin/gallery',
    title: 'Gallery',
    description: 'Photos of completed work, shown on the homepage and the gallery page.',
    singular: 'gallery item',
    hasStatus: true,
    hasSortOrder: true,
    defaults: { status: 'DRAFT' },
    fields: [
      { key: 'image', label: 'Image', type: 'image', folder: 'gallery', colSpan: 2, required: true },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'tag', label: 'Tag', type: 'text', hint: 'Used as a filter chip, e.g. Nameplates' },
      { key: 'caption', label: 'Caption', type: 'textarea', colSpan: 2 },
      { key: 'link', label: 'Link (optional)', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
    ],
    columns: [
      {
        key: 'item',
        header: 'Image',
        render: (row) => (
          <div className="flex items-center gap-3">
            <img src={assetUrl(String(row.image))} alt="" className="h-12 w-12 border border-stone-line object-cover" />
            <div>
              <p className="text-sm font-medium">{String(row.title ?? 'Untitled')}</p>
              <p className="text-2xs text-ink-400">{String(row.caption ?? '')}</p>
            </div>
          </div>
        ),
      },
      { key: 'tag', header: 'Tag', render: (row) => (row.tag ? <Badge>{String(row.tag)}</Badge> : null) },
    ],
  },

  testimonials: {
    endpoint: '/admin/testimonials',
    title: 'Testimonials',
    description: 'Customer quotes shown on the homepage.',
    singular: 'testimonial',
    hasStatus: true,
    hasSortOrder: true,
    defaults: { status: 'DRAFT', rating: 5 },
    note:
      'Nothing is pre-filled here — add only testimonials your customers have actually given you. The homepage section stays hidden until at least one is published.',
    fields: [
      { key: 'name', label: 'Customer name', type: 'text', required: true },
      { key: 'role', label: 'Role / company', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'rating', label: 'Rating (1–5)', type: 'number' },
      { key: 'content', label: 'What they said', type: 'textarea', colSpan: 2, required: true },
      { key: 'image', label: 'Photo (optional)', type: 'image', folder: 'testimonials', colSpan: 2 },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
    ],
    columns: [
      {
        key: 'person',
        header: 'Customer',
        render: (row) => (
          <div>
            <p className="text-sm font-medium">{String(row.name)}</p>
            <p className="text-2xs text-ink-400">{[row.role, row.location].filter(Boolean).join(' · ')}</p>
          </div>
        ),
      },
      {
        key: 'content',
        header: 'Quote',
        render: (row) => <span className="text-xs text-ink-500">{truncate(String(row.content ?? ''), 80)}</span>,
      },
      {
        key: 'rating',
        header: 'Rating',
        render: (row) => (row.rating ? <span>{'★'.repeat(Number(row.rating))}</span> : null),
      },
    ],
  },

  faqs: {
    endpoint: '/admin/faqs',
    title: 'FAQs',
    description: 'Answers shown on the homepage FAQ section and used for FAQ schema.',
    singular: 'FAQ',
    hasStatus: true,
    hasSortOrder: true,
    defaults: { status: 'PUBLISHED', group: 'General' },
    fields: [
      { key: 'question', label: 'Question', type: 'text', colSpan: 2, required: true },
      { key: 'answer', label: 'Answer', type: 'textarea', colSpan: 2, required: true },
      { key: 'group', label: 'Group', type: 'text', hint: 'e.g. General, Orders, Delivery' },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
    ],
    columns: [
      {
        key: 'question',
        header: 'Question',
        render: (row) => (
          <div>
            <p className="text-sm font-medium">{String(row.question)}</p>
            <p className="mt-0.5 text-2xs text-ink-400">{truncate(String(row.answer ?? ''), 90)}</p>
          </div>
        ),
      },
      { key: 'group', header: 'Group', render: (row) => <Badge>{String(row.group ?? 'General')}</Badge> },
    ],
  },

  coupons: {
    endpoint: '/admin/coupons',
    title: 'Coupons',
    description: 'Discount codes customers can apply at checkout.',
    singular: 'coupon',
    hasStatus: true,
    hasSortOrder: false,
    defaults: { status: 'DRAFT', type: 'PERCENT', value: 10 },
    note: 'No coupons are created for you — add only the offers you actually want to run.',
    fields: [
      { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'WELCOME10' },
      {
        key: 'type', label: 'Discount type', type: 'select',
        options: [
          { value: 'PERCENT', label: 'Percentage off' },
          { value: 'FIXED', label: 'Fixed amount off' },
          { value: 'FREE_SHIPPING', label: 'Free shipping' },
        ],
      },
      { key: 'value', label: 'Value (% or ₹)', type: 'number' },
      { key: 'maxDiscount', label: 'Maximum discount (₹)', type: 'number', hint: 'Caps a percentage discount.' },
      { key: 'minOrderValue', label: 'Minimum order (₹)', type: 'number' },
      { key: 'usageLimit', label: 'Total uses allowed', type: 'number', hint: 'Blank = unlimited' },
      { key: 'perUserLimit', label: 'Uses per customer', type: 'number' },
      { key: 'startsAt', label: 'Valid from', type: 'date' },
      { key: 'endsAt', label: 'Valid until', type: 'date' },
      { key: 'description', label: 'Internal note', type: 'textarea', colSpan: 2 },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
    ],
    columns: [
      {
        key: 'code',
        header: 'Code',
        render: (row) => (
          <div>
            <p className="font-mono text-sm font-medium">{String(row.code)}</p>
            <p className="text-2xs text-ink-400">{String(row.description ?? '')}</p>
          </div>
        ),
      },
      {
        key: 'value',
        header: 'Discount',
        render: (row) =>
          row.type === 'PERCENT'
            ? `${row.value}%`
            : row.type === 'FIXED'
              ? `₹${row.value}`
              : 'Free shipping',
      },
      {
        key: 'used',
        header: 'Used',
        render: (row) => `${row.usedCount ?? 0}${row.usageLimit ? ` / ${row.usageLimit}` : ''}`,
      },
      {
        key: 'window',
        header: 'Valid',
        render: (row) => (
          <span className="text-2xs text-ink-400">
            {row.startsAt ? formatDate(String(row.startsAt)) : 'Always'}
            {row.endsAt ? ` → ${formatDate(String(row.endsAt))}` : ''}
          </span>
        ),
      },
    ],
  },

  reviews: {
    endpoint: '/admin/reviews',
    title: 'Reviews',
    description: 'Moderate product reviews. Only published reviews appear on the site.',
    singular: 'review',
    hasStatus: true,
    hasSortOrder: false,
    defaults: { status: 'DRAFT', rating: 5 },
    note:
      'No reviews are seeded. Publish only genuine reviews — they feed the rating shown in Google results.',
    fields: [
      { key: 'authorName', label: 'Author name', type: 'text', required: true },
      { key: 'rating', label: 'Rating (1–5)', type: 'number', required: true },
      { key: 'title', label: 'Title', type: 'text', colSpan: 2 },
      { key: 'content', label: 'Review', type: 'textarea', colSpan: 2, required: true },
      { key: 'productId', label: 'Product', type: 'product', colSpan: 2, hint: 'Search for the product this review is about.' },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
    ],
    columns: [
      {
        key: 'review',
        header: 'Review',
        render: (row) => (
          <div>
            <p className="text-sm font-medium">
              {String(row.title || row.authorName)}{' '}
              <span className="text-ink-400">{'★'.repeat(Number(row.rating ?? 0))}</span>
            </p>
            <p className="text-2xs text-ink-400">{truncate(String(row.content ?? ''), 90)}</p>
          </div>
        ),
      },
      {
        key: 'product',
        header: 'Product',
        render: (row) => {
          const product = row.product as { name?: string } | undefined;
          return <span className="text-xs">{product?.name ?? '—'}</span>;
        },
      },
    ],
  },

  'nav-links': {
    endpoint: '/admin/nav-links',
    title: 'Navigation',
    description: 'The links in the header and footer menus.',
    singular: 'link',
    hasStatus: true,
    hasSortOrder: true,
    defaults: { status: 'PUBLISHED', group: 'header' },
    fields: [
      { key: 'label', label: 'Label', type: 'text', required: true },
      { key: 'href', label: 'Link', type: 'text', required: true, placeholder: '/shop' },
      {
        key: 'group', label: 'Menu', type: 'select',
        options: [
          { value: 'header', label: 'Header' },
          { value: 'footer', label: 'Footer' },
        ],
      },
      { key: 'openInNewTab', label: 'Open in a new tab', type: 'checkbox' },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
    ],
    columns: [
      {
        key: 'label',
        header: 'Link',
        render: (row) => (
          <div>
            <p className="text-sm font-medium">{String(row.label)}</p>
            <p className="font-mono text-2xs text-ink-400">{String(row.href)}</p>
          </div>
        ),
      },
      { key: 'group', header: 'Menu', render: (row) => <Badge>{String(row.group)}</Badge> },
    ],
  },
};

type Row = Record<string, unknown> & { id: string; status?: ContentStatus; sortOrder?: number };

export default function AdminContentLists({ resource }: { resource: ResourceKey }) {
  const config = RESOURCES[resource];
  const queryClient = useQueryClient();
  const { push } = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reorderMode, setReorderMode] = useState(false);

  const queryKey = ['admin-resource', resource, page, search, statusFilter];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.list<Row[]>(config.endpoint, { page, perPage: 50, search, status: statusFilter }),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-resource', resource] });

  const save = useMutation({
    mutationFn: (row: Row) => {
      const payload: Record<string, unknown> = {};
      for (const field of config.fields) payload[field.key] = row[field.key] ?? null;
      return row.id
        ? api.patch(`${config.endpoint}/${row.id}`, payload)
        : api.post(config.endpoint, payload);
    },
    onSuccess: async () => {
      await invalidate();
      setEditing(null);
      setErrors({});
      push('Saved', 'success');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        if (!Object.keys(err.fieldErrors).length) push(err.message, 'error');
      } else {
        push('Could not save', 'error');
      }
    },
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) =>
      api.patch(`${config.endpoint}/${id}/status`, { status }),
    onSuccess: async () => {
      await invalidate();
      push('Status updated', 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Update failed', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${config.endpoint}/${id}`),
    onSuccess: async () => {
      await invalidate();
      setDeleting(null);
      push('Deleted', 'info');
    },
    onError: (err) => {
      push(err instanceof ApiError ? err.message : 'Could not delete', 'error');
      setDeleting(null);
    },
  });

  const reorder = useMutation({
    mutationFn: (items: Row[]) =>
      api.post(`${config.endpoint}/reorder`, {
        items: items.map((item, index) => ({ id: item.id, sortOrder: index })),
      }),
    onSuccess: async () => {
      await invalidate();
      push('Order saved', 'success');
    },
  });

  const rows = data?.data ?? [];
  const [localOrder, setLocalOrder] = useState<Row[]>([]);
  const orderedRows = useMemo(
    () => (reorderMode && localOrder.length ? localOrder : rows),
    [reorderMode, localOrder, rows],
  );

  const openNew = () => {
    const blank: Row = { id: '' } as Row;
    for (const field of config.fields) blank[field.key] = config.defaults?.[field.key] ?? null;
    setEditing(blank);
  };

  return (
    <>
      <AdminPageHeader
        title={config.title}
        description={config.description}
        actions={
          <>
            {config.hasSortOrder ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (reorderMode && localOrder.length) reorder.mutate(localOrder);
                  setReorderMode(!reorderMode);
                  setLocalOrder(reorderMode ? [] : rows);
                }}
                loading={reorder.isPending}
              >
                {reorderMode ? 'Save order' : 'Reorder'}
              </Button>
            ) : null}
            <Button size="sm" icon={<PlusIcon size={14} />} onClick={openNew}>
              Add {config.singular}
            </Button>
          </>
        }
      />

      {config.note ? (
        <div className="mb-5 border border-stone-line bg-paper-warm px-5 py-3 text-xs leading-relaxed text-ink-500">
          {config.note}
        </div>
      ) : null}

      <AdminCard>
        <div className="mb-5 flex flex-wrap gap-3">
          <AdminSearch
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder={config.searchPlaceholder ?? 'Search…'}
            className="min-w-[220px] flex-1"
          />
          {config.hasStatus ? (
            <Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              aria-label="Filter by status"
              className="w-auto min-w-[160px]"
              options={[{ value: '', label: 'All statuses' }, ...STATUS_OPTIONS]}
            />
          ) : null}
        </div>

        {reorderMode ? (
          <SortableList
            items={orderedRows}
            onReorder={setLocalOrder}
            renderItem={(row) => (
              <div className="text-sm">
                {String(row.title ?? row.name ?? row.question ?? row.label ?? row.code ?? row.id)}
              </div>
            )}
          />
        ) : (
          <>
            <DataTable
              rows={rows}
              loading={isLoading}
              emptyTitle={`No ${config.title.toLowerCase()} yet`}
              emptyDescription={`Add your first ${config.singular}.`}
              emptyAction={
                <Button size="sm" onClick={openNew}>
                  Add {config.singular}
                </Button>
              }
              columns={[
                ...config.columns.map((column) => ({
                  key: column.key,
                  header: column.header,
                  render: (row: Row) => column.render(row),
                })),
                ...(config.hasStatus
                  ? [
                      {
                        key: 'status',
                        header: 'Status',
                        render: (row: Row) => (
                          <StatusToggle
                            status={(row.status ?? 'DRAFT') as ContentStatus}
                            disabled={setStatus.isPending}
                            onChange={(status) => setStatus.mutate({ id: row.id, status })}
                          />
                        ),
                      },
                    ]
                  : []),
                {
                  key: 'actions',
                  header: '',
                  render: (row: Row) => (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          // Dates arrive as ISO strings; the date input needs yyyy-mm-dd.
                          const prepared: Row = { ...row };
                          for (const field of config.fields) {
                            if (field.type === 'date' && prepared[field.key]) {
                              prepared[field.key] = formatDateInput(String(prepared[field.key]));
                            }
                          }
                          setEditing(prepared);
                        }}
                        className="p-1.5 text-ink-400 transition-colors hover:text-ink"
                        aria-label="Edit"
                      >
                        <EditIcon size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(row)}
                        className="p-1.5 text-ink-400 transition-colors hover:text-state-danger"
                        aria-label="Delete"
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  ),
                },
              ]}
            />
            <Pagination page={page} totalPages={data?.meta?.totalPages ?? 1} onChange={setPage} />
          </>
        )}
      </AdminCard>

      {/* Editor */}
      <Modal
        open={Boolean(editing)}
        onClose={() => { setEditing(null); setErrors({}); }}
        title={editing?.id ? `Edit ${config.singular}` : `Add ${config.singular}`}
        size="lg"
      >
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(editing);
            }}
            className="space-y-5"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              {config.fields.map((field) => (
                <RenderField
                  key={field.key}
                  field={field}
                  value={editing[field.key]}
                  error={errors[field.key]}
                  onChange={(value) => setEditing({ ...editing, [field.key]: value })}
                />
              ))}
            </div>

            <div className="flex justify-end gap-2 border-t border-stone-line pt-4">
              <Button type="button" variant="ghost" onClick={() => { setEditing(null); setErrors({}); }}>
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending}>
                Save
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete this ${config.singular}?`}
        message="This cannot be undone."
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
