import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ApiError, api, assetUrl } from '../../lib/api';
import type { Category, ContentStatus, Product } from '../../lib/types';
import { formatDate, formatPrice, toNumber } from '../../lib/format';
import { useToast } from '../../context/StoreProvider';
import {
  AdminCard, AdminPageHeader, AdminSearch, DataTable, StatusToggle,
} from '../../components/admin/AdminKit';
import {
  Badge, Button, ButtonLink, ConfirmDialog, CopyIcon, EditIcon, EyeIcon,
  Pagination, Select, TrashIcon,
} from '../../components/ui';

export default function AdminProducts() {
  const queryClient = useQueryClient();
  const { push } = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [deleting, setDeleting] = useState<Product | null>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-products', page, search, status, categoryId],
    queryFn: () =>
      api.list<Product[]>('/admin/products', { page, perPage: 25, search, status, categoryId }),
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
          <ButtonLink to="/admin/products/new" size="sm">
            Add product
          </ButtonLink>
        }
      />

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
          columns={[
            {
              key: 'product',
              header: 'Product',
              render: (product) => (
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
              render: (product) => {
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
              render: (product) =>
                product.trackInventory ? (
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
              render: (product) => (
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
              render: (product) => (
                <span className="text-2xs text-ink-400">{formatDate(product.createdAt)}</span>
              ),
            },
            {
              key: 'actions',
              header: '',
              className: 'text-right',
              render: (product) => (
                <div className="flex items-center justify-end gap-1">
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
                    title="Edit"
                  >
                    <EditIcon size={15} />
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
