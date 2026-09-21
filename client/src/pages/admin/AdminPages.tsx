import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api';
import type { ContentStatus, Page } from '../../lib/types';
import { formatDate, renderMarkdown, slugify } from '../../lib/format';
import { useToast } from '../../context/StoreProvider';
import {
  AdminCard, AdminPageHeader, DataTable, ImageField, StatusToggle,
} from '../../components/admin/AdminKit';
import {
  Badge, Button, Checkbox, ConfirmDialog, EditIcon, EyeIcon, Input, Modal,
  PlusIcon, Select, Textarea, TrashIcon,
} from '../../components/ui';

interface PageDraft {
  id?: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  heroImage: string | null;
  status: ContentStatus;
  showInFooter: boolean;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
}

const EMPTY: PageDraft = {
  slug: '', title: '', excerpt: '', content: '', heroImage: null,
  status: 'DRAFT', showInFooter: true, seoTitle: '', seoDescription: '', seoKeywords: '',
};

export default function AdminPages() {
  const queryClient = useQueryClient();
  const { push } = useToast();

  const [editing, setEditing] = useState<PageDraft | null>(null);
  const [deleting, setDeleting] = useState<Page | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['admin-pages'],
    queryFn: () => api.list<Page[]>('/admin/pages', { perPage: 50 }),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-pages'] });
    await queryClient.invalidateQueries({ queryKey: ['site-settings'] });
  };

  const save = useMutation({
    mutationFn: (draft: PageDraft) => {
      const payload = {
        title: draft.title,
        slug: draft.slug || undefined,
        excerpt: draft.excerpt || null,
        content: draft.content,
        heroImage: draft.heroImage,
        status: draft.status,
        showInFooter: draft.showInFooter,
        seoTitle: draft.seoTitle || null,
        seoDescription: draft.seoDescription || null,
        seoKeywords: draft.seoKeywords || null,
      };
      return draft.id ? api.patch(`/admin/pages/${draft.id}`, payload) : api.post('/admin/pages', payload);
    },
    onSuccess: async () => {
      await invalidate();
      setEditing(null);
      setErrors({});
      push('Page saved', 'success');
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
      api.patch(`/admin/pages/${id}/status`, { status }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/pages/${id}`),
    onSuccess: async () => {
      await invalidate();
      setDeleting(null);
      push('Page deleted', 'info');
    },
  });

  const pages = data?.data ?? [];

  return (
    <>
      <AdminPageHeader
        title="Pages"
        description="About, contact and your policy pages. Drafts are not visible on the website."
        actions={
          <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => setEditing({ ...EMPTY })}>
            Add page
          </Button>
        }
      />

      <div className="mb-5 border border-stone-line bg-paper-warm px-5 py-3 text-xs leading-relaxed text-ink-500">
        Your shipping, returns, privacy and terms pages were created as <strong>drafts</strong> with a
        placeholder, because policy wording is a commitment to your customers and should be your own.
        Write each one, then switch it to Published.
      </div>

      <AdminCard>
        <DataTable
          rows={pages}
          loading={isLoading}
          emptyTitle="No pages yet"
          emptyDescription="Add an About page or a policy page."
          columns={[
            {
              key: 'page',
              header: 'Page',
              render: (page) => (
                <div>
                  <p className="text-sm font-medium">{page.title}</p>
                  <p className="font-mono text-2xs text-ink-400">/{page.slug}</p>
                </div>
              ),
            },
            {
              key: 'footer',
              header: 'Footer',
              render: (page) => (page.showInFooter ? <Badge>Shown</Badge> : null),
            },
            {
              key: 'status',
              header: 'Status',
              render: (page) => (
                <StatusToggle
                  status={page.status}
                  onChange={(status) => setStatus.mutate({ id: page.id, status })}
                />
              ),
            },
            {
              key: 'actions',
              header: '',
              className: 'text-right',
              render: (page) => (
                <div className="flex items-center justify-end gap-1">
                  {page.status === 'PUBLISHED' ? (
                    <a
                      href={`/${page.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 text-ink-400 hover:text-ink"
                      title="View"
                    >
                      <EyeIcon size={15} />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        id: page.id,
                        slug: page.slug,
                        title: page.title,
                        excerpt: page.excerpt ?? '',
                        content: page.content,
                        heroImage: page.heroImage ?? null,
                        status: page.status,
                        showInFooter: page.showInFooter,
                        seoTitle: page.seoTitle ?? '',
                        seoDescription: page.seoDescription ?? '',
                        seoKeywords: page.seoKeywords ?? '',
                      })
                    }
                    className="p-1.5 text-ink-400 hover:text-ink"
                    aria-label="Edit"
                  >
                    <EditIcon size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(page)}
                    className="p-1.5 text-ink-400 hover:text-state-danger"
                    aria-label="Delete"
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
              ),
            },
          ]}
        />
      </AdminCard>

      <Modal
        open={Boolean(editing)}
        onClose={() => { setEditing(null); setErrors({}); }}
        title={editing?.id ? `Edit ${editing.title}` : 'Add page'}
        size="xl"
      >
        {editing ? (
          <PageForm
            draft={editing}
            errors={errors}
            saving={save.isPending}
            onCancel={() => { setEditing(null); setErrors({}); }}
            onSubmit={(draft) => save.mutate(draft)}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete "${deleting?.title}"?`}
        message="The page and its URL are removed permanently."
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}

function PageForm({
  draft, errors, saving, onSubmit, onCancel,
}: {
  draft: PageDraft;
  errors: Record<string, string>;
  saving: boolean;
  onSubmit: (draft: PageDraft) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(draft);
  const [preview, setPreview] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(draft.id));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Title" required value={form.title} error={errors.title}
          onChange={(e) => {
            const title = e.target.value;
            setForm((prev) => ({ ...prev, title, slug: slugTouched ? prev.slug : slugify(title) }));
          }}
        />
        <Input
          label="URL slug" value={form.slug} error={errors.slug}
          hint={`/${form.slug || 'slug'}`}
          onChange={(e) => { setSlugTouched(true); setForm({ ...form, slug: slugify(e.target.value) }); }}
        />
        <Input
          label="Excerpt" value={form.excerpt} wrapClassName="sm:col-span-2"
          hint="One line shown under the page title."
          onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="field-label mb-0">Content</span>
          <button
            type="button"
            onClick={() => setPreview(!preview)}
            className="text-2xs uppercase tracking-architect text-ink-400 underline underline-offset-2 hover:text-ink"
          >
            {preview ? 'Edit' : 'Preview'}
          </button>
        </div>

        {preview ? (
          <div
            className="min-h-[300px] border border-stone-line bg-paper p-5 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(form.content) }}
          />
        ) : (
          <textarea
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={16}
            className="field font-mono text-xs leading-relaxed"
            placeholder={'## A heading\n\nA paragraph of text.\n\n- A list item\n- Another item\n\n**Bold** and *italic* work too.'}
          />
        )}
        <p className="mt-1.5 text-xs text-ink-400">
          Markdown-style formatting: ## headings, **bold**, *italic*, - lists, &gt; quotes, [links](/shop).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ImageField
          label="Hero image" value={form.heroImage} folder="pages"
          onChange={(url) => setForm({ ...form, heroImage: url })}
        />
        <div className="space-y-4">
          <Select
            label="Status" value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as ContentStatus })}
            options={[
              { value: 'DRAFT', label: 'Draft (hidden from the site)' },
              { value: 'PUBLISHED', label: 'Published (live)' },
            ]}
          />
          <Checkbox
            label="Show in the footer"
            checked={form.showInFooter}
            onChange={(v) => setForm({ ...form, showInFooter: v })}
          />
        </div>
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
          Save page
        </Button>
      </div>
    </form>
  );
}
