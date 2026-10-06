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
  Button, ConfirmDialog, CopyIcon, Input, Modal, Pagination, RefreshIcon, Select, Skeleton,
  TrashIcon,
} from '../../components/ui';

/** The two shelves the library has. */
const SHELVES = [
  ['library', 'Library'],
  ['trash', 'Trash'],
] as const;

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
  /** Which shelf is on screen: the library, or what has been thrown away. */
  const [view, setView] = useState<'library' | 'trash'>('library');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emptying, setEmptying] = useState(false);

  const trashed = view === 'trash';

  const { data, isLoading } = useQuery({
    queryKey: ['admin-media', page, search, folder, view],
    queryFn: () =>
      api.list<MediaAsset[]>('/admin/media', {
        page, perPage: 48, search, folder, trashed: trashed ? '1' : '',
      }),
    placeholderData: keepPreviousData,
  });

  /** Nothing stays selected across a change of shelf, page or filter. */
  const clearSelection = () => setSelected(new Set());
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
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

  /*
   * A file still used somewhere is refused by name, and everything else in the
   * selection still moves. Telling someone "3 of 40 are in use" and doing
   * nothing would leave them to find which three.
   */
  const bulk = useMutation({
    mutationFn: ({ action, ids }: { action: 'trash' | 'restore' | 'destroy'; ids: string[] }) =>
      api.post<{ moved?: number; restored?: number; destroyed?: number; blocked?: string[] }>(
        `/admin/media/${action}`,
        { ids },
      ),
    onSuccess: async (result, { action }) => {
      await invalidate();
      clearSelection();
      setEmptying(false);

      const n = result.moved ?? result.restored ?? result.destroyed ?? 0;
      const word = action === 'trash' ? 'moved to the trash' : action === 'restore' ? 'restored' : 'deleted for good';
      if (n) push(`${n} file${n === 1 ? '' : 's'} ${word}`, action === 'destroy' ? 'info' : 'success');

      if (result.blocked?.length) {
        push(
          `Still in use, so left alone: ${result.blocked.slice(0, 3).join(', ')}` +
            (result.blocked.length > 3 ? ` and ${result.blocked.length - 3} more` : ''),
          'error',
        );
      }
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'That did not work', 'error'),
  });

  const act = (action: 'trash' | 'restore' | 'destroy', ids: string[]) => {
    if (ids.length) bulk.mutate({ action, ids });
  };

  const assets = data?.data ?? [];
  const allOnPageSelected = assets.length > 0 && assets.every((a) => selected.has(a.id));
  const trashCount = (data?.meta as { trashCount?: number } | undefined)?.trashCount ?? 0;

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

          {/*
            Library or trash. The count sits on the tab, so a full trash is not
            something you have to go looking for.
          */}
          <div
            className="flex rounded-[var(--a-radius-sm)] p-0.5"
            style={{ background: 'var(--a-sunken)', border: '1px solid var(--a-line)' }}
          >
            {SHELVES.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => { setView(key); setPage(1); clearSelection(); }}
                aria-pressed={view === key}
                className={clsx(
                  'rounded-[6px] px-3 py-1.5 text-xs font-medium transition-all',
                  view === key
                    ? 'bg-paper text-ink shadow-[var(--a-shadow)]'
                    : 'text-[color:var(--a-faint)] hover:text-ink',
                )}
              >
                {label}
                {key === 'trash' && trashCount ? ' (' + trashCount + ')' : ''}
              </button>
            ))}
          </div>
        </div>

        {/* What is selected, and what can be done with it. */}
        {assets.length ? (
          <div
            className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--a-radius-sm)] px-3 py-2"
            style={{ background: selected.size ? 'var(--a-accent-soft)' : 'var(--a-sunken)' }}
          >
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={allOnPageSelected}
                onChange={() =>
                  setSelected(allOnPageSelected ? new Set() : new Set(assets.map((a) => a.id)))
                }
                className="h-4 w-4 cursor-pointer"
              />
              {allOnPageSelected ? 'Clear' : 'Select all on this page'}
            </label>

            <span className="text-xs" style={{ color: 'var(--a-muted)' }}>
              {selected.size
                ? selected.size + ' selected'
                : 'Tick files to act on several at once'}
            </span>

            <div className="flex-1" />

            {selected.size ? (
              <div className="flex flex-wrap gap-2">
                {trashed ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={bulk.isPending}
                      onClick={() => act('restore', [...selected])}
                    >
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={bulk.isPending}
                      onClick={() => setEmptying(true)}
                    >
                      Delete permanently
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={bulk.isPending}
                    onClick={() => act('trash', [...selected])}
                  >
                    <TrashIcon size={13} />
                    Move to trash
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {isLoading ? (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="aspect-square w-full" />
            ))}
          </div>
        ) : assets.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-400">
            {trashed ? 'The trash is empty.' : 'No files yet. Upload something above.'}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {assets.map((asset) => (
              <figure
                key={asset.id}
                className={clsx(
                  'group relative border bg-paper-warm transition-colors',
                  selected.has(asset.id)
                    ? 'border-[color:var(--a-accent)]'
                    : 'border-stone-line',
                )}
              >
                {/* Appears on hover, and stays on while ticked. */}
                <label
                  className={clsx(
                    'absolute left-1.5 top-1.5 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-opacity',
                    selected.has(asset.id)
                      ? 'opacity-100'
                      : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100',
                  )}
                  style={{ background: 'var(--a-surface)', border: '1px solid var(--a-line)' }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(asset.id)}
                    onChange={() => toggle(asset.id)}
                    aria-label={'Select ' + asset.filename}
                    className="h-3.5 w-3.5 cursor-pointer"
                  />
                </label>

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

                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-[color:var(--a-surface)] px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="truncate text-[0.6rem] text-ink-500">{asset.folder}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => void copyUrl(asset.url)}
                      className="text-ink-400 hover:text-ink"
                      aria-label="Copy URL"
                    >
                      <CopyIcon size={13} />
                    </button>
                    {trashed ? (
                      <button
                        type="button"
                        onClick={() => act('restore', [asset.id])}
                        className="text-ink-400 hover:text-ink"
                        aria-label={'Restore ' + asset.filename}
                      >
                        <RefreshIcon size={13} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => act('trash', [asset.id])}
                        className="text-ink-400 hover:text-state-danger"
                        aria-label={'Move ' + asset.filename + ' to the trash'}
                      >
                        <TrashIcon size={13} />
                      </button>
                    )}
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

            <div className="flex justify-end border-t border-stone-line pt-4">
              {trashed ? (
                <Button
                  variant="secondary"
                  loading={bulk.isPending}
                  onClick={() => { act('restore', [viewing.id]); setViewing(null); }}
                >
                  <RefreshIcon size={14} />
                  Restore
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  loading={bulk.isPending}
                  onClick={() => { act('trash', [viewing.id]); setViewing(null); }}
                >
                  <TrashIcon size={14} />
                  Move to trash
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/*
        The only step that cannot be undone, so it is the only one that asks.
        Moving to the trash and restoring are both reversible and go straight
        through.
      */}
      <ConfirmDialog
        open={emptying}
        title={'Delete ' + selected.size + ' file' + (selected.size === 1 ? '' : 's') + ' for good?'}
        message="The files are removed from the server and cannot be recovered. Anything still used somewhere on the site is left alone."
        confirmLabel="Delete permanently"
        tone="danger"
        loading={bulk.isPending}
        onCancel={() => setEmptying(false)}
        onConfirm={() => act('destroy', [...selected])}
      />
    </>
  );
}
