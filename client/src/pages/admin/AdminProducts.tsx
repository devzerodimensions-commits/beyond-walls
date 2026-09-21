import { useState } from 'react';
import { Link } from 'react-router-dom';
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

  const { data, isLoading } = useQuery({
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
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AdminSearch value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by name or SKU…" />
          <Select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            aria-label="Filter by status"
            options={[
              { value: '', label: 'All statuses' },
              { value: 'PUBLISHED', label: 'Published' },
              { value: 'DRAFT', label: 'Draft' },
              { value: 'ARCHIVED', label: 'Archived' },
            ]}
          />
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

        <DataTable
          rows={products}
          loading={isLoading}
          emptyTitle="No products yet"
          emptyDescription="Add your first product to start building the catalogue."
          emptyAction={<ButtonLink to="/admin/products/new" size="sm">Add product</ButtonLink>}
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
