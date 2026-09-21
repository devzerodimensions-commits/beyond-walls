import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ApiError, api, assetUrl } from '../../lib/api';
import type { Category, ContentStatus } from '../../lib/types';
import { slugify } from '../../lib/format';
import { useToast } from '../../context/StoreProvider';
import {
  AdminCard, AdminPageHeader, ImageField, SortableList, StatusToggle,
} from '../../components/admin/AdminKit';
import {
  Badge, Button, Checkbox, ChevronDown, ConfirmDialog, EditIcon, Input, Modal,
  PlusIcon, Select, Skeleton, Textarea, TrashIcon,
} from '../../components/ui';

interface CategoryDraft {
  id?: string;
  name: string;
  slug: string;
  parentId: string;
  shortText: string;
  description: string;
  image: string | null;
  bannerImage: string | null;
  status: ContentStatus;
  featured: boolean;
  showInMenu: boolean;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
}

const EMPTY: CategoryDraft = {
  name: '', slug: '', parentId: '', shortText: '', description: '',
  image: null, bannerImage: null, status: 'DRAFT', featured: false, showInMenu: true,
  seoTitle: '', seoDescription: '', seoKeywords: '',
};

export default function AdminCategories() {
  const queryClient = useQueryClient();
  const { push } = useToast();

  const [editing, setEditing] = useState<CategoryDraft | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [reorderMode, setReorderMode] = useState(false);
  const [order, setOrder] = useState<Category[]>([]);

  const { data: tree, isLoading } = useQuery({
    queryKey: ['admin-categories-tree'],
    queryFn: () => api.get<Category[]>('/admin/categories-tree'),
  });

  useEffect(() => {
    if (tree) setOrder(tree);
  }, [tree]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-categories-tree'] });
    await queryClient.invalidateQueries({ queryKey: ['nav-categories'] });
  };

  const save = useMutation({
    mutationFn: (draft: CategoryDraft) => {
      const payload = {
        name: draft.name,
        slug: draft.slug || undefined,
        parentId: draft.parentId || null,
        shortText: draft.shortText || null,
        description: draft.description || null,
        image: draft.image,
        bannerImage: draft.bannerImage,
        status: draft.status,
        featured: draft.featured,
        showInMenu: draft.showInMenu,
        seoTitle: draft.seoTitle || null,
        seoDescription: draft.seoDescription || null,
        seoKeywords: draft.seoKeywords || null,
      };
      return draft.id
        ? api.patch(`/admin/categories/${draft.id}`, payload)
        : api.post('/admin/categories', payload);
    },
    onSuccess: async () => {
      await invalidate();
      setEditing(null);
      setErrors({});
      push('Category saved', 'success');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        push(err.message, 'error');
      }
    },
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) =>
      api.patch(`/admin/categories/${id}/status`, { status }),
    onSuccess: invalidate,
    onError: (err) => push(err instanceof ApiError ? err.message : 'Update failed', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/categories/${id}`),
    onSuccess: async () => {
      await invalidate();
      setDeleting(null);
      push('Category deleted', 'info');
    },
    onError: (err) => {
      push(err instanceof ApiError ? err.message : 'Could not delete', 'error');
      setDeleting(null);
    },
  });

  const reorder = useMutation({
    mutationFn: (items: Category[]) =>
      api.post('/admin/categories/reorder', {
        items: items.map((item, index) => ({ id: item.id, sortOrder: index })),
      }),
    onSuccess: async () => {
      await invalidate();
      push('Order saved', 'success');
    },
  });

  const toDraft = (category: Category): CategoryDraft => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    parentId: category.parentId ?? '',
    shortText: category.shortText ?? '',
    description: category.description ?? '',
    image: category.image ?? null,
    bannerImage: category.bannerImage ?? null,
    status: category.status,
    featured: category.featured,
    showInMenu: category.showInMenu,
    seoTitle: category.seoTitle ?? '',
    seoDescription: category.seoDescription ?? '',
    seoKeywords: category.seoKeywords ?? '',
  });

  const categories = tree ?? [];

  return (
    <>
      <AdminPageHeader
        title="Categories"
        description="The shop structure. Subcategories sit under a parent and appear in the menu and filters."
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
              Add category
            </Button>
          </>
        }
      />

      <AdminCard>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : reorderMode ? (
          <SortableList
            items={order}
            onReorder={setOrder}
            renderItem={(category) => <span className="text-sm">{category.name}</span>}
          />
        ) : categories.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-400">
            No categories yet. Add your first one to structure the shop.
          </p>
        ) : (
          <ul className="divide-y divide-stone-line border border-stone-line">
            {categories.map((parent) => (
              <li key={parent.id}>
                <CategoryRow
                  category={parent}
                  expanded={expanded.has(parent.id)}
                  onToggleExpand={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(parent.id)) next.delete(parent.id);
                      else next.add(parent.id);
                      return next;
                    })
                  }
                  onEdit={() => setEditing(toDraft(parent))}
                  onDelete={() => setDeleting(parent)}
                  onStatus={(status) => setStatus.mutate({ id: parent.id, status })}
                  onAddChild={() => setEditing({ ...EMPTY, parentId: parent.id })}
                />

                {expanded.has(parent.id) && parent.children?.length ? (
                  <ul className="divide-y divide-stone-line/60 border-t border-stone-line/60 bg-paper-off">
                    {parent.children.map((child) => (
                      <li key={child.id}>
                        <CategoryRow
                          category={child}
                          isChild
                          onEdit={() => setEditing(toDraft(child))}
                          onDelete={() => setDeleting(child)}
                          onStatus={(status) => setStatus.mutate({ id: child.id, status })}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      {/* Editor */}
      <Modal
        open={Boolean(editing)}
        onClose={() => { setEditing(null); setErrors({}); }}
        title={editing?.id ? 'Edit category' : 'Add category'}
        size="lg"
      >
        {editing ? (
          <CategoryForm
            draft={editing}
            parents={categories.filter((c) => c.id !== editing.id)}
            errors={errors}
            saving={save.isPending}
            onCancel={() => { setEditing(null); setErrors({}); }}
            onSubmit={(draft) => save.mutate(draft)}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete "${deleting?.name}"?`}
        message={
          deleting?._count?.products
            ? `${deleting._count.products} product(s) are in this category. They will be left without a category, not deleted.`
            : 'This category will be removed. Subcategories must be moved or deleted first.'
        }
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}

function CategoryRow({
  category, isChild, expanded, onToggleExpand, onEdit, onDelete, onStatus, onAddChild,
}: {
  category: Category;
  isChild?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatus: (status: ContentStatus) => void;
  onAddChild?: () => void;
}) {
  return (
    <div className={clsx('flex flex-wrap items-center gap-3 px-4 py-3', isChild && 'pl-12')}>
      {!isChild && category.children?.length ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className="p-1 text-ink-400 hover:text-ink"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          aria-expanded={expanded}
        >
          <ChevronDown size={14} className={clsx('transition-transform', expanded && 'rotate-180')} />
        </button>
      ) : (
        <span className="w-6" />
      )}

      {category.image ? (
        <img src={assetUrl(category.image)} alt="" className="h-9 w-9 border border-stone-line object-cover" />
      ) : (
        <span className="h-9 w-9 border border-dashed border-stone-line" />
      )}

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {category.name}
          {category.featured ? <Badge tone="dark">Featured</Badge> : null}
          {!category.showInMenu ? <Badge>Hidden in menu</Badge> : null}
          {category.children?.length ? <Badge>{category.children.length} sub</Badge> : null}
        </p>
        <p className="font-mono text-2xs text-ink-400">
          /shop/{category.slug}
          {category._count?.products !== undefined ? ` · ${category._count.products} products` : ''}
        </p>
      </div>

      <StatusToggle status={category.status} onChange={onStatus} />

      <div className="flex gap-1">
        {onAddChild ? (
          <button
            type="button"
            onClick={onAddChild}
            className="p-1.5 text-ink-400 hover:text-ink"
            title="Add subcategory"
          >
            <PlusIcon size={15} />
          </button>
        ) : null}
        <button type="button" onClick={onEdit} className="p-1.5 text-ink-400 hover:text-ink" aria-label="Edit">
          <EditIcon size={15} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 text-ink-400 hover:text-state-danger"
          aria-label="Delete"
        >
          <TrashIcon size={15} />
        </button>
      </div>
    </div>
  );
}

function CategoryForm({
  draft, parents, errors, saving, onSubmit, onCancel,
}: {
  draft: CategoryDraft;
  parents: Category[];
  errors: Record<string, string>;
  saving: boolean;
  onSubmit: (draft: CategoryDraft) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(draft);
  const [slugTouched, setSlugTouched] = useState(Boolean(draft.id));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="space-y-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label="Name" required value={form.name} error={errors.name}
          onChange={(e) => {
            const name = e.target.value;
            setForm((prev) => ({ ...prev, name, slug: slugTouched ? prev.slug : slugify(name) }));
          }}
        />
        <Input
          label="URL slug" value={form.slug} error={errors.slug}
          hint={`/shop/${form.slug || 'slug'}`}
          onChange={(e) => { setSlugTouched(true); setForm({ ...form, slug: slugify(e.target.value) }); }}
        />
        <Select
          label="Parent category" value={form.parentId}
          hint="Leave as none for a top-level category."
          onChange={(e) => setForm({ ...form, parentId: e.target.value })}
          options={[
            { value: '', label: 'None (top level)' },
            ...parents.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
        <Select
          label="Status" value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as ContentStatus })}
          options={[
            { value: 'DRAFT', label: 'Draft' },
            { value: 'PUBLISHED', label: 'Published' },
            { value: 'ARCHIVED', label: 'Archived' },
          ]}
        />
        <Input
          label="Short text" value={form.shortText} wrapClassName="sm:col-span-2"
          hint="One line shown on the category tile and in the menu."
          onChange={(e) => setForm({ ...form, shortText: e.target.value })}
        />
        <Textarea
          label="Description" value={form.description} rows={4} wrapClassName="sm:col-span-2"
          hint="Shown at the top of the category page and below the product grid."
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <ImageField
          label="Tile image" value={form.image} folder="categories"
          onChange={(url) => setForm({ ...form, image: url })}
        />
        <ImageField
          label="Banner image" value={form.bannerImage} folder="categories"
          onChange={(url) => setForm({ ...form, bannerImage: url })}
        />
      </div>

      <div className="flex flex-wrap gap-6">
        <Checkbox label="Featured" checked={form.featured} onChange={(v) => setForm({ ...form, featured: v })} />
        <Checkbox label="Show in menu" checked={form.showInMenu} onChange={(v) => setForm({ ...form, showInMenu: v })} />
      </div>

      <details className="border border-stone-line p-4">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-architect">SEO</summary>
        <div className="mt-4 space-y-4">
          <Input label="Page title" value={form.seoTitle} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} />
          <Textarea
            label="Meta description" value={form.seoDescription} rows={2}
            onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
          />
          <Input label="Keywords" value={form.seoKeywords} onChange={(e) => setForm({ ...form, seoKeywords: e.target.value })} />
        </div>
      </details>

      <div className="flex justify-end gap-2 border-t border-stone-line pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save category
        </Button>
      </div>
    </form>
  );
}
