import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { API_URL, ApiError, api, assetUrl, tokenStore } from '../../lib/api';
import type { Category, ContentStatus, Product } from '../../lib/types';
import { formatDate, formatPrice, toNumber } from '../../lib/format';
import { readCsvRows } from '../../lib/csv';
import { useToast } from '../../context/StoreProvider';
import {
  AdminCard, AdminPageHeader, AdminSearch, DataTable, StatusToggle,
} from '../../components/admin/AdminKit';
import {
  ArchiveIcon, Badge, Button, ButtonLink, CheckIcon, CloseIcon, ConfirmDialog, CopyIcon,
  DownloadIcon, EditIcon, EyeIcon, Input, Modal, Pagination, RefreshIcon, Select, StarIcon,
  TrashIcon, UploadIcon,
} from '../../components/ui';

/** How the import reads a spreadsheet's headings. */
const IMPORT_COLUMNS = {
  sku: 'SKU',
  name: 'Name',
  price: 'Price',
  compareAtPrice: 'Compare At',
  costPrice: 'Cost',
  stock: 'Stock',
  status: 'Status',
  featured: 'Featured',
};

interface ImportResult {
  summary: { created: number; updated: number; skipped: number };
  results: { row: number; sku: string; outcome: string; message?: string }[];
}

export default function AdminProducts() {
  const queryClient = useQueryClient();
  const { push } = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [archiving, setArchiving] = useState<Product | null>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);

  const [orderBy, setOrderBy] = useState('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-products', page, search, status, categoryId, orderBy, order],
    queryFn: () =>
      api.list<Product[]>('/admin/products', {
        page, perPage: 25, search, status, categoryId, orderBy, order,
      }),
    placeholderData: keepPreviousData,
  });

  const { data: categories } = useQuery({
    queryKey: ['admin-categories-flat'],
    queryFn: () => api.get<Category[]>('/admin/categories-tree'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-products'] });

  const setStatusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: ContentStatus }) =>
      api.patch(`/admin/products/${id}/status`, { status: next }),
    onSuccess: async () => {
      await invalidate();
      push('Product status updated', 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Update failed', 'error'),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => api.post<Product>(`/admin/products/${id}/duplicate`),
    onSuccess: async (product) => {
      await invalidate();
      push(`Duplicated as "${product.name}"`, 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not duplicate', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/admin/products/${id}`),
    onSuccess: async () => {
      await invalidate();
      setDeleting(null);
      push('Product removed', 'info');
    },
    onError: (err) => {
      push(err instanceof ApiError ? err.message : 'Could not delete', 'error');
      setDeleting(null);
    },
  });

  const products = data?.data ?? [];
  const counts = (data?.meta as { counts?: Record<string, number> } | undefined)?.counts;

  // Ticks on rows that have been filtered away are invisible, and acting on
  // what nobody can see is how a bulk tool causes an accident.
  useEffect(() => {
    setSelected([]);
  }, [search, status, categoryId]);

  const isDelete = bulkAction === 'DELETE';
  const isDuplicate = bulkAction === 'DUPLICATE';

  /*
   * Applied one product at a time, through the endpoints a single product
   * already uses. Deleting therefore keeps its most important behaviour: a
   * product that appears on an order is archived instead of destroyed, so the
   * order it belongs to still knows what was bought.
   *
   * One failure does not stop the rest, and the first refusal is reported
   * verbatim because it explains itself.
   */
  const applyBulk = async () => {
    setConfirming(false);
    setApplying(true);

    const ids = [...selected];
    let done = 0;
    let firstProblem = '';

    for (const id of ids) {
      try {
        if (isDelete) await api.delete(`/admin/products/${id}`);
        else if (isDuplicate) await api.post(`/admin/products/${id}/duplicate`);
        else await api.patch(`/admin/products/${id}/status`, { status: bulkAction });
        done += 1;
      } catch (err) {
        if (!firstProblem) firstProblem = err instanceof ApiError ? err.message : 'Could not be updated';
      }
    }

    const skipped = ids.length - done;
    setSelected([]);
    setBulkAction('');
    await refetch();
    setApplying(false);

    if (!done) push(firstProblem || 'Nothing was changed', 'error');
    else if (skipped) push(`${done} done · ${skipped} skipped — ${firstProblem}`, 'info');
    else push(`${done} product${done === 1 ? '' : 's'} updated`, 'success');
  };

  const bulkSummary = () => {
    const count = `${selected.length} product${selected.length === 1 ? '' : 's'}`;
    if (isDelete) {
      return `Delete ${count}? Any that appear on an existing order are archived instead, so those orders keep their history. The rest, with their images, go for good.`;
    }
    if (isDuplicate) return `Duplicate ${count}? Each copy is created as a draft.`;
    if (bulkAction === 'PUBLISHED') return `Publish ${count}? They become visible in the shop immediately.`;
    if (bulkAction === 'DRAFT') return `Move ${count} to draft? They come off the shop until published again.`;
    return `Archive ${count}? They come off the shop and out of this list.`;
  };

  /*
   * Quick edit.
   *
   * The five things anyone actually changes from a list — name, SKU, price,
   * stock, status — edited where they are, instead of opening a page with
   * thirty other fields on it and coming back. Everything else stays on the
   * product page, because a row is the wrong place to write a description.
   *
   * It saves through the ordinary update endpoint, so publishing from here is
   * held to the same rule as publishing anywhere else.
   */
  const openQuickEdit = (product: Product) => {
    setQuickEditId(product.id);
    setDraft({
      name: product.name,
      sku: product.sku ?? '',
      price: product.price == null ? '' : String(toNumber(product.price) ?? ''),
      stock: String(product.stock ?? 0),
      status: product.status,
    });
  };

  const quickSave = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api.patch(`/admin/products/${id}`, {
        name: draft.name,
        // Blank means "no SKU", which is a real state — not a blank string.
        sku: draft.sku.trim() || null,
        price: draft.price.trim() === '' ? null : Number(draft.price),
        stock: Number(draft.stock || 0),
        status: draft.status,
      }),
    onSuccess: async () => {
      await invalidate();
      setQuickEditId(null);
      push('Product updated', 'success');
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not save', 'error'),
  });

  const toggleFeatured = useMutation({
    mutationFn: ({ id, featured }: { id: string; featured: boolean }) =>
      api.patch(`/admin/products/${id}`, { featured }),
    onSuccess: invalidate,
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not update', 'error'),
  });

  /** Downloads the catalogue as it is filtered, with the admin token attached. */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (categoryId) params.set('categoryId', categoryId);
      const response = await fetch(`${API_URL}/admin/products/export.csv?${params}`, {
        headers: { Authorization: `Bearer ${tokenStore.access ?? ''}` },
      });
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `beyond-walls-products-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      push('Export downloaded', 'success');
    } catch {
      push('Could not export products', 'error');
    } finally {
      setExporting(false);
    }
  };

  /*
   * Import.
   *
   * The file is read and matched to columns here, so the server is handed
   * clean rows rather than a blob it has to guess at, and a file with the
   * wrong headings is caught before anything is sent.
   */
  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const { rows, missing } = readCsvRows(await file.text(), IMPORT_COLUMNS);

      if (missing.includes('SKU')) {
        push('That file has no SKU column — SKU is how a row finds its product', 'error');
        return;
      }
      if (!rows.length) {
        push('That file has no rows', 'error');
        return;
      }

      // Blank cells are left out rather than sent as empty, so a column the
      // spreadsheet did not fill in does not wipe what is already stored.
      const payload = rows.map((row) => {
        const out: Record<string, unknown> = { sku: row.sku };
        if (row.name) out.name = row.name;
        if (row.price) out.price = row.price.replace(/[^0-9.]/g, '');
        if (row.compareAtPrice) out.compareAtPrice = row.compareAtPrice.replace(/[^0-9.]/g, '');
        if (row.costPrice) out.costPrice = row.costPrice.replace(/[^0-9.]/g, '');
        if (row.stock) out.stock = row.stock.replace(/[^0-9]/g, '');
        if (row.status) out.status = row.status.trim().toUpperCase();
        if (row.featured) out.featured = /^(yes|true|1)$/i.test(row.featured.trim());
        return out;
      });

      const result = await api.post<ImportResult>('/admin/products/import', { rows: payload });
      setImportResult(result);
      await invalidate();
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Could not read that file', 'error');
    } finally {
      setImporting(false);
    }
  };

  const statusTabs: { value: string; label: string; count?: number }[] = [
    { value: '', label: 'Live and draft', count: counts ? counts.PUBLISHED + counts.DRAFT : undefined },
    { value: 'PUBLISHED', label: 'Published', count: counts?.PUBLISHED },
    { value: 'DRAFT', label: 'Draft', count: counts?.DRAFT },
    { value: 'ARCHIVED', label: 'Archived', count: counts?.ARCHIVED },
  ];

  const categoryOptions = [
    { value: '', label: 'All categories' },
    ...(categories ?? []).flatMap((parent) => [
      { value: parent.id, label: parent.name },
      ...(parent.children ?? []).map((child) => ({ value: child.id, label: `— ${child.name}` })),
    ]),
  ];

  return (
    <>
      <AdminPageHeader
        title="Products"
        description="Every product, variant, personalisation field and image lives here."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="a-btn a-btn-secondary cursor-pointer text-xs">
              <UploadIcon size={14} />
              {importing ? 'Importing…' : 'Import'}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                disabled={importing}
                onChange={(e) => {
                  void importCsv(e.target.files?.[0]);
                  // Cleared so choosing the same file twice still fires.
                  e.target.value = '';
                }}
              />
            </label>
            <Button size="sm" variant="secondary" loading={exporting} onClick={() => void exportCsv()}>
              <DownloadIcon size={14} />
              Export
            </Button>
            <ButtonLink to="/admin/products/new" size="sm">
              Add product
            </ButtonLink>
          </div>
        }
      />

      {/* What the import did, row by row, so a bad line can be found and fixed. */}
      <Modal
        open={Boolean(importResult)}
        onClose={() => setImportResult(null)}
        title="Import finished"
        size="lg"
      >
        {importResult ? (
          <div className="space-y-4">
            <p className="text-sm">
              <strong>{importResult.summary.created}</strong> created ·{' '}
              <strong>{importResult.summary.updated}</strong> updated ·{' '}
              <strong>{importResult.summary.skipped}</strong> skipped
            </p>
            {importResult.summary.created ? (
              <p className="text-xs text-ink-500">
                New products are created as drafts. Review them, then publish.
              </p>
            ) : null}
            <div className="max-h-[45vh] overflow-y-auto border border-stone-line">
              <table className="admin-table w-full">
                <thead>
                  <tr><th>Row</th><th>SKU</th><th>Result</th><th>Detail</th></tr>
                </thead>
                <tbody>
                  {importResult.results.map((row) => (
                    <tr key={`${row.row}-${row.sku}`}>
                      <td className="text-2xs text-ink-400">{row.row}</td>
                      <td className="font-mono text-2xs">{row.sku || '—'}</td>
                      <td>
                        <Badge tone={row.outcome === 'skipped' ? 'danger' : 'success'}>
                          {row.outcome}
                        </Badge>
                      </td>
                      <td className="text-2xs text-ink-500">{row.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>

      <AdminCard>
        {/*
          Status as a row of counted links rather than a dropdown.

          The count is the point: "Draft 34" tells the studio there is a
          backlog, which a closed select never would, and archived products
          stop being a thing nobody knows exists.
        */}
        <div className="mb-4 flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-stone-line pb-3 text-sm">
          {statusTabs.map((tab, index) => (
            <span key={tab.value || 'all'} className="flex items-center">
              {index ? <span className="px-2 text-ink-300">|</span> : null}
              <button
                type="button"
                onClick={() => { setStatus(tab.value); setPage(1); }}
                className={clsx(
                  'transition-colors',
                  status === tab.value ? 'font-medium text-ink' : 'text-ink-500 hover:text-ink',
                )}
              >
                {tab.label}
                {tab.count === undefined ? null : (
                  <span className="ml-1 text-ink-400">({tab.count})</span>
                )}
              </button>
            </span>
          ))}
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AdminSearch value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by name or SKU…" />
          <Select
            value={categoryId}
            onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
            aria-label="Filter by category"
            options={categoryOptions}
          />
          <div className="flex items-center text-xs text-ink-400">
            {data?.meta?.total ?? 0} product{data?.meta?.total === 1 ? '' : 's'}
          </div>
        </div>

        {selected.length ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 border border-stone-line bg-paper-off px-4 py-3">
            <span className="text-sm font-medium">{selected.length} selected</span>
            <Select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value)}
              aria-label="Bulk action"
              className="w-auto min-w-[200px]"
              options={[
                { value: '', label: 'Bulk actions…' },
                { value: 'PUBLISHED', label: 'Publish' },
                { value: 'DRAFT', label: 'Move to draft' },
                { value: 'ARCHIVED', label: 'Archive' },
                { value: 'DUPLICATE', label: 'Duplicate' },
                { value: 'DELETE', label: 'Delete' },
              ]}
            />
            <Button
              size="sm"
              variant={isDelete ? 'danger' : 'primary'}
              disabled={!bulkAction}
              loading={applying}
              onClick={() => setConfirming(true)}
            >
              Apply
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        ) : null}

        <ConfirmDialog
          open={confirming}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void applyBulk()}
          title={isDelete ? 'Delete products' : 'Update products'}
          message={bulkSummary()}
          confirmLabel={isDelete ? 'Delete' : 'Apply'}
          tone={isDelete ? 'danger' : 'primary'}
        />

        <DataTable
          rows={products}
          loading={isLoading}
          emptyTitle="No products yet"
          emptyDescription="Add your first product to start building the catalogue."
          emptyAction={<ButtonLink to="/admin/products/new" size="sm">Add product</ButtonLink>}
          selection={{
            selected,
            onChange: setSelected,
            label: (product) => product.name,
          }}
          sort={{
            by: orderBy,
            dir: order,
            onChange: (by, dir) => { setOrderBy(by); setOrder(dir); setPage(1); },
          }}
          columns={[
            {
              key: 'featured',
              header: '★',
              width: '44px',
              render: (product) => (
                <button
                  type="button"
                  onClick={() => toggleFeatured.mutate({ id: product.id, featured: !product.featured })}
                  disabled={toggleFeatured.isPending}
                  title={product.featured ? 'Featured — click to unfeature' : 'Not featured'}
                  aria-pressed={product.featured}
                  className={clsx(
                    'p-1 transition-colors disabled:opacity-40',
                    product.featured ? 'text-state-warning' : 'text-ink-300 hover:text-ink',
                  )}
                >
                  <StarIcon size={16} className={product.featured ? 'fill-current' : undefined} />
                </button>
              ),
            },
            {
              key: 'product',
              header: 'Product',
              sortKey: 'name',
              render: (product) =>
                quickEditId === product.id ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      aria-label="Name"
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                    <Input
                      aria-label="SKU"
                      placeholder="SKU"
                      value={draft.sku}
                      onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <img
                      src={assetUrl(product.images?.[0]?.url)}
                      alt=""
                      className="h-11 w-11 shrink-0 border border-stone-line bg-paper-warm object-cover"
                    />
                    <div className="min-w-0">
                      <Link
                        to={`/admin/products/${product.id}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {product.name}
                      </Link>
                      <p className="truncate text-2xs text-ink-400">
                        {product.sku ? `${product.sku} · ` : ''}
                        {product.category?.name ?? 'Uncategorised'}
                      </p>
                    </div>
                  </div>
                ),
            },
            {
              key: 'price',
              header: 'Price',
              sortKey: 'price',
              render: (product) => {
                if (quickEditId === product.id) {
                  return (
                    <Input
                      aria-label="Price"
                      type="number"
                      min="0"
                      step="1"
                      value={draft.price}
                      onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                    />
                  );
                }
                const price = toNumber(product.price);
                return price !== null ? (
                  <span className="text-sm">{formatPrice(price)}</span>
                ) : (
                  <Badge tone="danger">No price</Badge>
                );
              },
            },
            {
              key: 'stock',
              header: 'Stock',
              sortKey: 'stock',
              render: (product) =>
                quickEditId === product.id ? (
                  <Input
                    aria-label="Stock"
                    type="number"
                    min="0"
                    step="1"
                    value={draft.stock}
                    onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
                  />
                ) : product.trackInventory ? (
                  <span
                    className={
                      product.stock === 0
                        ? 'text-state-danger'
                        : product.stock <= 5
                          ? 'text-state-warning'
                          : ''
                    }
                  >
                    {product.stock}
                  </span>
                ) : (
                  <span className="text-2xs text-ink-300">Not tracked</span>
                ),
            },
            {
              key: 'config',
              header: 'Setup',
              render: (product) => {
                const counts = (product as unknown as {
                  _count?: { variants: number; personalization: number };
                })._count;
                return (
                  <span className="flex flex-wrap gap-1">
                    {counts?.variants ? <Badge>{counts.variants} variants</Badge> : null}
                    {counts?.personalization ? (
                      <Badge>{counts.personalization} fields</Badge>
                    ) : null}
                    {product.featured ? <Badge tone="dark">Featured</Badge> : null}
                  </span>
                );
              },
            },
            {
              key: 'status',
              header: 'Status',
              sortKey: 'status',
              render: (product) =>
                quickEditId === product.id ? (
                  <Select
                    aria-label="Status"
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                    options={[
                      { value: 'DRAFT', label: 'Draft' },
                      { value: 'PUBLISHED', label: 'Published' },
                      { value: 'ARCHIVED', label: 'Archived' },
                    ]}
                  />
                ) : product.status === 'ARCHIVED' ? (
                  /*
                   * A label, not the toggle. The toggle only knows Draft and
                   * Live, so on an archived row it renders with neither half
                   * lit -- a control that looks broken. The way back is the
                   * restore button in the actions column.
                   */
                  <Badge>Archived</Badge>
                ) : (
                  <StatusToggle
                    status={product.status}
                    disabled={setStatusMutation.isPending}
                    onChange={(next) => setStatusMutation.mutate({ id: product.id, next })}
                  />
                ),
            },
            {
              key: 'updated',
              header: 'Updated',
              sortKey: 'updatedAt',
              render: (product) => (
                <span className="text-2xs text-ink-400">{formatDate(product.createdAt)}</span>
              ),
            },
            {
              key: 'actions',
              header: '',
              className: 'text-right',
              render: (product) =>
                quickEditId === product.id ? (
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => quickSave.mutate({ id: product.id })}
                      disabled={quickSave.isPending}
                      className="p-1.5 text-state-success transition-opacity hover:opacity-70 disabled:opacity-40"
                      title="Save"
                    >
                      <CheckIcon size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickEditId(null)}
                      className="p-1.5 text-ink-400 transition-colors hover:text-ink"
                      title="Cancel"
                    >
                      <CloseIcon size={16} />
                    </button>
                  </div>
                ) : (
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => openQuickEdit(product)}
                    className="p-1.5 text-ink-400 transition-colors hover:text-ink"
                    title="Quick edit"
                  >
                    <EditIcon size={15} />
                  </button>
                  {product.status === 'PUBLISHED' ? (
                    <a
                      href={`/product/${product.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 text-ink-400 transition-colors hover:text-ink"
                      title="View on the site"
                    >
                      <EyeIcon size={15} />
                    </a>
                  ) : null}
                  <Link
                    to={`/admin/products/${product.id}`}
                    className="p-1.5 text-ink-400 transition-colors hover:text-ink"
                    title="Open the full editor"
                  >
                    <EyeIcon size={15} className="hidden" />
                    <span className="text-xs">Edit</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => duplicate.mutate(product.id)}
                    disabled={duplicate.isPending}
                    className="p-1.5 text-ink-400 transition-colors hover:text-ink disabled:opacity-40"
                    title="Duplicate"
                  >
                    <CopyIcon size={15} />
                  </button>
                  {/*
                    Archive and restore are the same slot, because a product is
                    only ever in one of the two states. Archiving asks first --
                    it is reversible, but it takes the product off the shop and
                    out of the default list, so without a prompt it reads as
                    the row having vanished. Restoring comes back as a draft,
                    never straight to live: deciding it should be on the shop
                    again is a separate decision from deciding it still exists.
                  */}
                  {product.status === 'ARCHIVED' ? (
                    <button
                      type="button"
                      onClick={() => setStatusMutation.mutate({ id: product.id, next: 'DRAFT' })}
                      disabled={setStatusMutation.isPending}
                      className="p-1.5 text-ink-400 transition-colors hover:text-ink disabled:opacity-40"
                      title="Restore as a draft"
                    >
                      <RefreshIcon size={15} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setArchiving(product)}
                      className="p-1.5 text-ink-400 transition-colors hover:text-ink"
                      title="Archive"
                    >
                      <ArchiveIcon size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleting(product)}
                    className="p-1.5 text-ink-400 transition-colors hover:text-state-danger"
                    title="Delete"
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
              ),
            },
          ]}
        />

        <Pagination page={page} totalPages={data?.meta?.totalPages ?? 1} onChange={setPage} />
      </AdminCard>

      <ConfirmDialog
        open={Boolean(archiving)}
        title={`Archive "${archiving?.name}"?`}
        message="The product comes off the shop and out of this list. Nothing is lost — it moves to the Archived tab, where it can be restored at any time."
        confirmLabel="Archive product"
        loading={setStatusMutation.isPending}
        onCancel={() => setArchiving(null)}
        onConfirm={() => {
          if (!archiving) return;
          setStatusMutation.mutate({ id: archiving.id, next: 'ARCHIVED' });
          setArchiving(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete "${deleting?.name}"?`}
        message="This removes the product, its images, variants and personalisation fields. If it appears on any order it will be archived instead, so order history stays intact."
        confirmLabel="Delete product"
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
