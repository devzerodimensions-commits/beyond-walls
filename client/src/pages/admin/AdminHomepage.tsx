import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ApiError, api, assetUrl } from '../../lib/api';
import type { Category, ContentStatus, HomeSection, Product, SectionType } from '../../lib/types';
import { useToast } from '../../context/StoreProvider';
import {
  AdminCard, AdminPageHeader, SortableList, StatusToggle, StringListEditor,
} from '../../components/admin/AdminKit';
import {
  Badge, Button, ConfirmDialog, EditIcon, Input, Modal, PlusIcon, Select,
  Skeleton, Textarea, TrashIcon,
} from '../../components/ui';

const SECTION_TYPES: { value: SectionType; label: string; hint: string }[] = [
  { value: 'HERO', label: 'Hero', hint: 'Full-width opener. Content comes from a HOME_HERO banner.' },
  { value: 'USP_STRIP', label: 'Value strip', hint: 'Three short points across a strip.' },
  { value: 'CATEGORY_GRID', label: 'Category grid', hint: 'Tiles linking to categories.' },
  { value: 'FEATURED_PRODUCTS', label: 'Featured products', hint: 'A row of products.' },
  { value: 'BANNER_SPLIT', label: 'Two-up banners', hint: 'Uses HOME_SPLIT banners.' },
  { value: 'BANNER_WIDE', label: 'Wide banner', hint: 'Uses a HOME_WIDE banner.' },
  { value: 'SHOP_BY_ATTRIBUTE', label: 'Shop by material / style / shape', hint: 'A browsable rail of one attribute group.' },
  { value: 'PERSONALISATION_DEMO', label: 'Live personalisation demo', hint: 'Lets visitors try the plate preview on the homepage.' },
  { value: 'GALLERY', label: 'Gallery', hint: 'Recent work images.' },
  { value: 'TESTIMONIALS', label: 'Testimonials', hint: 'Published testimonials only.' },
  { value: 'FAQ', label: 'FAQs', hint: 'Published FAQs, also used for FAQ schema.' },
  { value: 'CUSTOM_ORDER_CTA', label: 'Custom order call-to-action', hint: 'Dark panel with a button.' },
  { value: 'CTA', label: 'Call-to-action', hint: 'Dark panel with a button.' },
  { value: 'RICH_TEXT', label: 'Text block', hint: 'A centred paragraph.' },
];

interface SectionDraft {
  id?: string;
  key: string;
  type: SectionType;
  title: string;
  subtitle: string;
  bodyText: string;
  ctaLabel: string;
  ctaLink: string;
  status: ContentStatus;
  config: Record<string, unknown>;
}

const EMPTY: SectionDraft = {
  key: '', type: 'FEATURED_PRODUCTS', title: '', subtitle: '', bodyText: '',
  ctaLabel: '', ctaLink: '', status: 'DRAFT', config: { limit: 8 },
};

export default function AdminHomepage() {
  const queryClient = useQueryClient();
  const { push } = useToast();

  const [editing, setEditing] = useState<SectionDraft | null>(null);
  const [deleting, setDeleting] = useState<HomeSection | null>(null);
  const [order, setOrder] = useState<HomeSection[]>([]);
  const [reorderMode, setReorderMode] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-home-sections'],
    queryFn: () => api.list<HomeSection[]>('/admin/home-sections', { perPage: 50 }),
  });

  useEffect(() => {
    if (data?.data) setOrder(data.data);
  }, [data]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-home-sections'] });
    await queryClient.invalidateQueries({ queryKey: ['home-sections'] });
  };

  const save = useMutation({
    mutationFn: (draft: SectionDraft) => {
      const payload = {
        key: draft.key || undefined,
        type: draft.type,
        title: draft.title || null,
        subtitle: draft.subtitle || null,
        bodyText: draft.bodyText || null,
        ctaLabel: draft.ctaLabel || null,
        ctaLink: draft.ctaLink || null,
        status: draft.status,
        config: draft.config,
      };
      return draft.id
        ? api.patch(`/admin/home-sections/${draft.id}`, payload)
        : api.post('/admin/home-sections', payload);
    },
    onSuccess: async () => {
      await invalidate();
      setEditing(null);
      push('Section saved', 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not save', 'error'),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) =>
      api.patch(`/admin/home-sections/${id}/status`, { status }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/home-sections/${id}`),
    onSuccess: async () => {
      await invalidate();
      setDeleting(null);
      push('Section removed', 'info');
    },
  });

  const reorder = useMutation({
    mutationFn: (items: HomeSection[]) =>
      api.post('/admin/home-sections/reorder', {
        items: items.map((item, index) => ({ id: item.id, sortOrder: index })),
      }),
    onSuccess: async () => {
      await invalidate();
      push('Order saved', 'success');
    },
  });

  const sections = data?.data ?? [];

  return (
    <>
      <AdminPageHeader
        title="Homepage"
        description="The homepage is a stack of sections. Add, reorder, publish or hide each one."
        actions={
          <>
            <Button
              size="sm"
              variant="secondary"
              loading={reorder.isPending}
              onClick={() => {
                if (reorderMode) reorder.mutate(order);
                setReorderMode(!reorderMode);
              }}
            >
              {reorderMode ? 'Save order' : 'Reorder'}
            </Button>
            <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => setEditing({ ...EMPTY })}>
              Add section
            </Button>
          </>
        }
      />

      <AdminCard>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : reorderMode ? (
          <SortableList
            items={order}
            onReorder={setOrder}
            renderItem={(section) => (
              <div className="flex items-center gap-3">
                <Badge>{section.type.replace(/_/g, ' ').toLowerCase()}</Badge>
                <span className="text-sm">{section.title || section.key}</span>
              </div>
            )}
          />
        ) : sections.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-400">
            No sections yet. Add one to start building the homepage.
          </p>
        ) : (
          <ul className="divide-y divide-stone-line border border-stone-line">
            {sections.map((section, index) => (
              <li key={section.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="w-6 font-mono text-2xs text-ink-300">{String(index + 1).padStart(2, '0')}</span>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {section.title || SECTION_TYPES.find((t) => t.value === section.type)?.label || section.key}
                    <Badge>{section.type.replace(/_/g, ' ').toLowerCase()}</Badge>
                  </p>
                  <p className="truncate text-2xs text-ink-400">
                    {section.subtitle || SECTION_TYPES.find((t) => t.value === section.type)?.hint}
                  </p>
                </div>

                <StatusToggle
                  status={section.status}
                  onChange={(status) => setStatus.mutate({ id: section.id, status })}
                />

                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        id: section.id,
                        key: section.key,
                        type: section.type,
                        title: section.title ?? '',
                        subtitle: section.subtitle ?? '',
                        bodyText: section.bodyText ?? '',
                        ctaLabel: section.ctaLabel ?? '',
                        ctaLink: section.ctaLink ?? '',
                        status: section.status,
                        config: (section.config ?? {}) as Record<string, unknown>,
                      })
                    }
                    className="p-1.5 text-ink-400 hover:text-ink"
                    aria-label="Edit section"
                  >
                    <EditIcon size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(section)}
                    className="p-1.5 text-ink-400 hover:text-state-danger"
                    aria-label="Delete section"
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit section' : 'Add section'}
        size="lg"
      >
        {editing ? (
          <SectionForm
            draft={editing}
            saving={save.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(draft) => save.mutate(draft)}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this section?"
        message="It will be removed from the homepage. The content it points at (products, banners, FAQs) is not deleted."
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}

function SectionForm({
  draft, saving, onSubmit, onCancel,
}: {
  draft: SectionDraft;
  saving: boolean;
  onSubmit: (draft: SectionDraft) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(draft);
  const typeInfo = SECTION_TYPES.find((t) => t.value === form.type);

  const setConfig = (key: string, value: unknown) =>
    setForm({ ...form, config: { ...form.config, [key]: value } });

  // Pickers for the section types that select specific records.
  const productsQuery = useQuery({
    queryKey: ['admin-products-picker'],
    queryFn: () => api.list<Product[]>('/admin/products', { perPage: 100, status: 'PUBLISHED' }),
    enabled: form.type === 'FEATURED_PRODUCTS',
  });

  const categoriesQuery = useQuery({
    queryKey: ['admin-categories-tree'],
    queryFn: () => api.get<Category[]>('/admin/categories-tree'),
    enabled: form.type === 'CATEGORY_GRID',
  });

  const selectedProductIds = (form.config.productIds as string[] | undefined) ?? [];
  const selectedCategoryIds = (form.config.categoryIds as string[] | undefined) ?? [];
  const uspItems = (form.config.items as { title: string; text: string }[] | undefined) ?? [];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="space-y-5"
    >
      <Select
        label="Section type"
        value={form.type}
        hint={typeInfo?.hint}
        onChange={(e) => setForm({ ...form, type: e.target.value as SectionType })}
        options={SECTION_TYPES.map((t) => ({ value: t.value, label: t.label }))}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Heading" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Input
          label="Section key" value={form.key}
          hint={form.id ? 'Used internally.' : 'Left blank, one is generated.'}
          disabled={Boolean(form.id)}
          onChange={(e) => setForm({ ...form, key: e.target.value })}
        />
        <Textarea
          label="Sub-heading" value={form.subtitle} rows={2} wrapClassName="sm:col-span-2"
          onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
        />
      </div>

      {['CTA', 'CUSTOM_ORDER_CTA', 'RICH_TEXT'].includes(form.type) ? (
        <Textarea
          label="Body text" value={form.bodyText} rows={3}
          onChange={(e) => setForm({ ...form, bodyText: e.target.value })}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Button label" value={form.ctaLabel} onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })} />
        <Input label="Button link" value={form.ctaLink} placeholder="/shop" onChange={(e) => setForm({ ...form, ctaLink: e.target.value })} />
      </div>

      {/* Type-specific configuration */}
      {['FEATURED_PRODUCTS', 'CATEGORY_GRID', 'GALLERY', 'TESTIMONIALS', 'FAQ'].includes(form.type) ? (
        <Input
          type="number"
          label="How many to show"
          value={String(form.config.limit ?? 8)}
          hint="Ignored when you hand-pick items below."
          onChange={(e) => setConfig('limit', Number(e.target.value))}
        />
      ) : null}

      {form.type === 'SHOP_BY_ATTRIBUTE' ? (
        <Input
          label="Attribute group slug"
          value={String(form.config.groupSlug ?? 'material')}
          placeholder="material"
          hint="Use the slug from Materials, styles & shapes — e.g. material, style, shape."
          onChange={(e) => setConfig('groupSlug', e.target.value)}
        />
      ) : null}

      {form.type === 'PERSONALISATION_DEMO' ? (
        <Input
          label="Product slug"
          value={String(form.config.productSlug ?? '')}
          placeholder="minimal-acrylic-name-plate"
          hint="Leave blank to use the first product that has live preview enabled."
          onChange={(e) => setConfig('productSlug', e.target.value)}
        />
      ) : null}

      {form.type === 'FAQ' ? (
        <Input
          label="FAQ group"
          value={String(form.config.group ?? '')}
          placeholder="General"
          hint="Leave blank to show every published FAQ."
          onChange={(e) => setConfig('group', e.target.value)}
        />
      ) : null}

      {form.type === 'USP_STRIP' ? (
        <div className="border border-stone-line p-4">
          <p className="field-label">Points</p>
          {uspItems.map((item, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} className="mb-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <input
                value={item.title} placeholder="Title" className="field"
                onChange={(e) => {
                  const next = [...uspItems];
                  next[index] = { ...next[index], title: e.target.value };
                  setConfig('items', next);
                }}
              />
              <input
                value={item.text} placeholder="Short description" className="field"
                onChange={(e) => {
                  const next = [...uspItems];
                  next[index] = { ...next[index], text: e.target.value };
                  setConfig('items', next);
                }}
              />
              <button
                type="button"
                onClick={() => setConfig('items', uspItems.filter((_, i) => i !== index))}
                className="px-2 text-ink-400 hover:text-state-danger"
                aria-label="Remove point"
              >
                <TrashIcon size={15} />
              </button>
            </div>
          ))}
          <Button
            type="button" size="sm" variant="ghost"
            onClick={() => setConfig('items', [...uspItems, { title: '', text: '' }])}
          >
            + Add point
          </Button>
        </div>
      ) : null}

      {form.type === 'FEATURED_PRODUCTS' ? (
        <div className="border border-stone-line p-4">
          <p className="field-label">Hand-pick products (optional)</p>
          <p className="mb-3 text-2xs text-ink-400">
            Leave all unselected to show featured products automatically.
          </p>
          <div className="grid max-h-60 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {(productsQuery.data?.data ?? []).map((product) => {
              const selected = selectedProductIds.includes(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() =>
                    setConfig(
                      'productIds',
                      selected
                        ? selectedProductIds.filter((pid) => pid !== product.id)
                        : [...selectedProductIds, product.id],
                    )
                  }
                  className={clsx(
                    'flex items-center gap-2.5 border p-2 text-left transition-colors',
                    selected ? 'border-ink bg-paper-warm' : 'border-stone-line hover:border-ink',
                  )}
                >
                  <img
                    src={assetUrl(product.images?.[0]?.url)}
                    alt=""
                    className="h-8 w-8 shrink-0 bg-paper-warm object-cover"
                  />
                  <span className="truncate text-xs">{product.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {form.type === 'CATEGORY_GRID' ? (
        <div className="border border-stone-line p-4">
          <p className="field-label">Hand-pick categories (optional)</p>
          <div className="flex flex-wrap gap-2">
            {(categoriesQuery.data ?? []).map((category) => {
              const selected = selectedCategoryIds.includes(category.id);
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() =>
                    setConfig(
                      'categoryIds',
                      selected
                        ? selectedCategoryIds.filter((cid) => cid !== category.id)
                        : [...selectedCategoryIds, category.id],
                    )
                  }
                  className={clsx(
                    'border px-3 py-2 text-xs transition-colors',
                    selected ? 'border-ink bg-ink text-paper' : 'border-stone-line hover:border-ink',
                  )}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {['HERO', 'BANNER_SPLIT', 'BANNER_WIDE'].includes(form.type) ? (
        <p className="border border-stone-line bg-paper-warm p-3 text-xs leading-relaxed text-ink-500">
          The imagery and copy for this section come from Banners. Create a banner with the matching
          placement, then publish it.
        </p>
      ) : null}

      <Select
        label="Status"
        value={form.status}
        onChange={(e) => setForm({ ...form, status: e.target.value as ContentStatus })}
        options={[
          { value: 'DRAFT', label: 'Draft (hidden)' },
          { value: 'PUBLISHED', label: 'Published (live)' },
        ]}
      />

      <div className="flex justify-end gap-2 border-t border-stone-line pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save section
        </Button>
      </div>
    </form>
  );
}
