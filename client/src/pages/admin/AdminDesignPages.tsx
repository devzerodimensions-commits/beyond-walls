import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ApiError, api } from '../../lib/api';
import type { ContentStatus } from '../../lib/types';
import { formatDate } from '../../lib/format';
import { useToast } from '../../context/StoreProvider';
import { AdminCard, AdminPageHeader } from '../../components/admin/AdminKit';
import {
  Badge, Button, ConfirmDialog, EditIcon, Input, Modal, PageLoader, Select, TrashIcon,
} from '../../components/ui';

/**
 * Design Pages.
 *
 * Every content page on the site in one list, each opening in the visual
 * builder. Replaces the separate Homepage and Pages screens: the homepage is a
 * page like any other now, so there is one place to edit any of them.
 */

interface PageRow {
  id: string;
  slug: string;
  title: string;
  path: string;
  status: ContentStatus;
  isSystem: boolean;
  showInFooter: boolean;
  sectionCount: number;
  updatedAt: string;
}

interface Layout {
  key: string;
  name: string;
  description: string;
  sections: string[];
}

export default function AdminDesignPages() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<PageRow | null>(null);

  const { data: pages, isLoading } = useQuery({
    queryKey: ['builder-pages'],
    queryFn: () => api.get<PageRow[]>('/admin/builder/pages'),
  });

  const { data: catalogue } = useQuery({
    queryKey: ['builder-widgets'],
    queryFn: () => api.get<{ layouts: Layout[] }>('/admin/builder/widgets'),
    staleTime: 5 * 60_000,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/pages/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['builder-pages'] });
      setDeleting(null);
      push('Page deleted', 'info');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not delete the page', 'error'),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) =>
      api.patch(`/admin/pages/${id}`, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['builder-pages'] });
      push('Page updated', 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not update the page', 'error'),
  });

  if (isLoading) return <PageLoader label="Loading your pages" />;

  return (
    <>
      <AdminPageHeader
        title="Design Pages"
        description="Every page on your site. Open one to change its words and pictures — no code."
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            Add new page
          </Button>
        }
      />

      <AdminCard
        title="All website pages"
        description="Choose a page and open the visual editor."
        actions={<span className="text-2xs text-ink-400">{pages?.length ?? 0} pages</span>}
      >
        <div className="-mx-5 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-line text-left">
                <th className="py-3 pl-5 pr-3 text-2xs uppercase tracking-architect text-ink-400 sm:pl-0">
                  Page name
                </th>
                <th className="px-3 py-3 text-2xs uppercase tracking-architect text-ink-400">
                  Web address
                </th>
                <th className="px-3 py-3 text-2xs uppercase tracking-architect text-ink-400">
                  Blocks
                </th>
                <th className="px-3 py-3 text-2xs uppercase tracking-architect text-ink-400">
                  Status
                </th>
                <th className="py-3 pl-3 pr-5 text-right text-2xs uppercase tracking-architect text-ink-400 sm:pr-0">
                  What do you want to do?
                </th>
              </tr>
            </thead>
            <tbody>
              {(pages ?? []).map((page) => (
                <tr key={page.id} className="border-b border-stone-line last:border-0">
                  <td className="py-4 pl-5 pr-3 sm:pl-0">
                    <p className="font-medium text-ink">{page.title}</p>
                    <p className="text-2xs text-ink-400">
                      {page.isSystem ? 'Part of the site structure' : 'Website page'}
                      {page.showInFooter ? ' · in the footer' : ''}
                    </p>
                  </td>
                  <td className="px-3 py-4">
                    <code className="font-mono text-xs text-ink-500">{page.path}</code>
                  </td>
                  <td className="px-3 py-4">
                    {page.sectionCount ? (
                      <span className="text-xs text-ink-500">{page.sectionCount}</span>
                    ) : (
                      <span className="text-xs text-state-warning">Empty</span>
                    )}
                  </td>
                  <td className="px-3 py-4">
                    <button
                      type="button"
                      onClick={() =>
                        setStatus.mutate({
                          id: page.id,
                          status: page.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED',
                        })
                      }
                      title={page.status === 'PUBLISHED' ? 'Unpublish this page' : 'Publish this page'}
                    >
                      <Badge tone={page.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                        {page.status.toLowerCase()}
                      </Badge>
                    </button>
                  </td>
                  <td className="py-4 pl-3 pr-5 text-right sm:pr-0">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        to={page.path}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 border border-stone-line px-3 py-1.5 text-2xs uppercase tracking-architect text-ink-600 transition-colors hover:border-ink hover:text-ink"
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/builder?page=${page.slug}`)}
                        className="inline-flex items-center gap-1.5 bg-ink px-3 py-1.5 text-2xs uppercase tracking-architect text-paper transition-opacity hover:opacity-85"
                      >
                        <EditIcon size={12} />
                        Edit page
                      </button>
                      {page.isSystem ? null : (
                        <button
                          type="button"
                          onClick={() => setDeleting(page)}
                          aria-label={`Delete ${page.title}`}
                          className="p-1.5 text-ink-400 hover:text-state-danger"
                        >
                          <TrashIcon size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>

      <AddPageDialog
        open={addOpen}
        layouts={catalogue?.layouts ?? []}
        onClose={() => setAddOpen(false)}
        onCreated={(slug) => navigate(`/admin/builder?page=${slug}`)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete "${deleting?.title}"?`}
        message={deleting?.sectionCount
            ? `This page and its ${deleting.sectionCount} block${deleting.sectionCount === 1 ? '' : 's'} will be removed. Anything linking to ${deleting.path} will stop working.`
            : `This page will be removed. Anything linking to ${deleting?.path} will stop working.`}
        confirmLabel="Delete page"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

/** Creating a page: a name, an address, and optionally a starting layout. */
function AddPageDialog({
  open, layouts, onClose, onCreated,
}: {
  open: boolean;
  layouts: Layout[];
  onClose: () => void;
  onCreated: (slug: string) => void;
}) {
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [layout, setLayout] = useState('');
  const [error, setError] = useState<string | null>(null);

  const suggested = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const create = useMutation({
    mutationFn: () =>
      api.post<{ slug: string }>('/admin/builder/pages', {
        title,
        slug: slug || undefined,
        layout: layout || undefined,
      }),
    onSuccess: async (page) => {
      await queryClient.invalidateQueries({ queryKey: ['builder-pages'] });
      push(`"${title}" created as a draft`, 'success');
      setTitle(''); setSlug(''); setLayout(''); setError(null);
      onClose();
      onCreated(page.slug);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not create the page'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Add a new page">
      <div className="space-y-5">
        <Input
          label="Page name"
          value={title}
          autoFocus
          placeholder="Our workshop"
          hint="Shown as the page's heading and in search results."
          onChange={(e) => setTitle(e.target.value)}
        />

        <Input
          label="Web address"
          value={slug}
          placeholder={suggested || 'our-workshop'}
          hint={`The page will live at /${slug || suggested || 'our-workshop'}. Leave blank to use the name.`}
          onChange={(e) => setSlug(e.target.value)}
        />

        <Select
          label="Start from a ready-made layout"
          value={layout}
          hint="Creates the usual blocks for that kind of page. You can change everything afterwards."
          onChange={(e) => setLayout(e.target.value)}
          options={[
            { value: '', label: 'Start with an empty page' },
            ...layouts.map((l) => ({ value: l.key, label: l.name })),
          ]}
        />

        {layout ? (
          <p className="border border-stone-line bg-paper-off p-3 text-xs leading-relaxed text-ink-500">
            {layouts.find((l) => l.key === layout)?.description}
          </p>
        ) : null}

        {error ? (
          <p className="border border-state-danger/30 bg-[#F9EDED] px-3 py-2.5 text-xs text-state-danger">
            {error}
          </p>
        ) : null}

        <p className="text-2xs leading-relaxed text-ink-400">
          New pages start as drafts, so nothing half-built is ever public. Publish it from the list
          when you are ready.
        </p>

        <div className={clsx('flex justify-end gap-2 border-t border-stone-line pt-5')}>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            loading={create.isPending}
            disabled={!title.trim()}
            onClick={() => create.mutate()}
          >
            Create and open editor
          </Button>
        </div>
      </div>
    </Modal>
  );
}
