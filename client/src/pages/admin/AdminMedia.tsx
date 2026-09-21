import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import clsx from 'clsx';
import { ApiError, api, assetUrl } from '../../lib/api';
import type { MediaAsset } from '../../lib/types';
import { formatDate } from '../../lib/format';
import { useToast } from '../../context/StoreProvider';
import {
  AdminCard, AdminPageHeader, AdminSearch, MultiImageUpload,
} from '../../components/admin/AdminKit';
import {
  Button, ConfirmDialog, CopyIcon, Input, Modal, Pagination, Select, Skeleton, TrashIcon,
} from '../../components/ui';

const FOLDERS = [
  'products', 'categories', 'banners', 'gallery', 'personalization', 'logo', 'pages', 'testimonials', 'general',
];

export default function AdminMedia() {
  const queryClient = useQueryClient();
  const { push } = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('');
  const [uploadFolder, setUploadFolder] = useState('general');
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<MediaAsset | null>(null);
  const [deleting, setDeleting] = useState<MediaAsset | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-media', page, search, folder],
    queryFn: () => api.list<MediaAsset[]>('/admin/media', { page, perPage: 48, search, folder }),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-media'] });

  const upload = async (files: FileList) => {
    setUploading(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((file) => form.append('files', file));
      form.append('folder', uploadFolder);
      await api.upload('/admin/media', form);
      await invalidate();
      push(`${files.length} file${files.length === 1 ? '' : 's'} uploaded`, 'success');
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const updateAsset = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api.patch(`/admin/media/${id}`, payload),
    onSuccess: async () => {
      await invalidate();
      push('Saved', 'success');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/media/${id}`),
    onSuccess: async () => {
      await invalidate();
      setDeleting(null);
      setViewing(null);
      push('File deleted', 'info');
    },
    onError: (err) => {
      push(err instanceof ApiError ? err.message : 'Could not delete', 'error');
      setDeleting(null);
    },
  });

  const assets = data?.data ?? [];

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(assetUrl(url));
      push('URL copied', 'success');
    } catch {
      push('Could not copy the URL', 'error');
    }
  };

  const isImage = (mime: string) => mime.startsWith('image/');

  return (
    <>
      <AdminPageHeader
        title="Media"
        description="Every uploaded image and artwork file, reusable anywhere in the admin panel."
      />

      <AdminCard className="mb-6">
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <Select
            label="Upload into"
            value={uploadFolder}
            onChange={(e) => setUploadFolder(e.target.value)}
            options={FOLDERS.map((f) => ({ value: f, label: f }))}
          />
          <div className="flex items-end">
            <div className="w-full">
              <MultiImageUpload onUpload={(files) => void upload(files)} uploading={uploading} label="Upload files" />
            </div>
          </div>
        </div>
      </AdminCard>

      <AdminCard>
        <div className="mb-5 flex flex-wrap gap-3">
          <AdminSearch
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search by filename…"
            className="min-w-[240px] flex-1"
          />
          <Select
            value={folder}
            onChange={(e) => { setFolder(e.target.value); setPage(1); }}
            aria-label="Filter by folder"
            className="w-auto min-w-[160px]"
            options={[{ value: '', label: 'All folders' }, ...FOLDERS.map((f) => ({ value: f, label: f }))]}
          />
          <div className="flex items-center text-xs text-ink-400">
            {data?.meta?.total ?? 0} file{data?.meta?.total === 1 ? '' : 's'}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="aspect-square w-full" />
            ))}
          </div>
        ) : assets.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-400">
            No files yet. Upload something above.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {assets.map((asset) => (
              <figure key={asset.id} className="group relative border border-stone-line bg-paper-warm">
                <button
                  type="button"
                  onClick={() => setViewing(asset)}
                  className="block aspect-square w-full"
                  title={asset.filename}
                >
                  {isImage(asset.mimeType) ? (
                    <img
                      src={assetUrl(asset.url)}
                      alt={asset.alt ?? asset.filename}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-2xs uppercase text-ink-400">
                      {asset.filename.split('.').pop()}
                    </span>
                  )}
                </button>

                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-paper/95 px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="truncate text-[0.6rem] text-ink-400">{asset.folder}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => void copyUrl(asset.url)}
                      className="text-ink-400 hover:text-ink"
                      aria-label="Copy URL"
                    >
                      <CopyIcon size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(asset)}
                      className="text-ink-400 hover:text-state-danger"
                      aria-label="Delete"
                    >
                      <TrashIcon size={13} />
                    </button>
                  </div>
                </div>
              </figure>
            ))}
          </div>
        )}

        <Pagination page={page} totalPages={data?.meta?.totalPages ?? 1} onChange={setPage} />
      </AdminCard>

      {/* Detail */}
      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.filename} size="lg">
        {viewing ? (
          <div className="space-y-5">
            {isImage(viewing.mimeType) ? (
              <img
                src={assetUrl(viewing.url)}
                alt={viewing.alt ?? ''}
                className="max-h-[50vh] w-full bg-paper-warm object-contain"
              />
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Alt text"
                defaultValue={viewing.alt ?? ''}
                hint="Describes the image for screen readers and search engines."
                onBlur={(e) => updateAsset.mutate({ id: viewing.id, payload: { alt: e.target.value } })}
              />
              <Select
                label="Folder"
                defaultValue={viewing.folder}
                onChange={(e) => updateAsset.mutate({ id: viewing.id, payload: { folder: e.target.value } })}
                options={FOLDERS.map((f) => ({ value: f, label: f }))}
              />
            </div>

            <div className="border border-stone-line bg-paper-off p-3">
              <p className="mb-1 text-[0.6rem] uppercase tracking-architect text-ink-400">URL</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all font-mono text-2xs">{viewing.url}</code>
                <Button size="sm" variant="ghost" onClick={() => void copyUrl(viewing.url)}>
                  Copy
                </Button>
              </div>
            </div>

            <dl className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <dt className="text-ink-400">Type</dt>
                <dd>{viewing.mimeType}</dd>
              </div>
              <div>
                <dt className="text-ink-400">Size</dt>
                <dd>{viewing.size ? `${(viewing.size / 1024).toFixed(0)} KB` : '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-400">Uploaded</dt>
                <dd>{formatDate(viewing.createdAt)}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this file?"
        message="The file is removed from the server. If a product still uses it, the deletion is blocked."
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
