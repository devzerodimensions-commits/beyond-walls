import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api';
import type { AdminCustomer } from '../../lib/types';
import { formatDate, formatPrice, relativeTime, statusMeta } from '../../lib/format';
import { useToast } from '../../context/StoreProvider';
import {
  AdminCard, AdminPageHeader, AdminSearch, DataTable, DefinitionList,
} from '../../components/admin/AdminKit';
import {
  Badge, Button, Checkbox, ConfirmDialog, EditIcon, Input, Modal, Pagination,
  PlusIcon, Select, TrashIcon,
} from '../../components/ui';

export default function AdminCustomers() {
  const queryClient = useQueryClient();
  const { push } = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminCustomer | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AdminCustomer | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['admin-customers', page, search, role],
    queryFn: () => api.list<AdminCustomer[]>('/admin/customers', { page, perPage: 25, search, role }),
    placeholderData: keepPreviousData,
  });

  const { data: detail } = useQuery({
    queryKey: ['admin-customer', viewing],
    queryFn: () => api.get<AdminCustomer>(`/admin/customers/${viewing}`),
    enabled: Boolean(viewing),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-customers'] });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown> & { id?: string }) => {
      const { id, ...body } = payload;
      return id ? api.patch(`/admin/customers/${id}`, body) : api.post('/admin/customers', body);
    },
    onSuccess: async () => {
      await invalidate();
      setEditing(null);
      setCreating(false);
      setErrors({});
      push('Saved', 'success');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        if (!Object.keys(err.fieldErrors).length) push(err.message, 'error');
      }
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/customers/${id}`),
    onSuccess: async () => {
      await invalidate();
      setDeleting(null);
      push('Customer removed', 'info');
    },
    onError: (err) => {
      push(err instanceof ApiError ? err.message : 'Could not delete', 'error');
      setDeleting(null);
    },
  });

  const customers = data?.data ?? [];

  return (
    <>
      <AdminPageHeader
        title="Customers"
        description="Accounts, order history and admin access."
        actions={
          <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => setCreating(true)}>
            Add user
          </Button>
        }
      />

      <AdminCard>
        <div className="mb-5 flex flex-wrap gap-3">
          <AdminSearch
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search by name, email or phone…"
            className="min-w-[240px] flex-1"
          />
          <Select
            value={role}
            onChange={(e) => { setRole(e.target.value); setPage(1); }}
            aria-label="Filter by role"
            className="w-auto min-w-[160px]"
            options={[
              { value: '', label: 'All roles' },
              { value: 'CUSTOMER', label: 'Customers' },
              { value: 'ADMIN', label: 'Admins' },
            ]}
          />
        </div>

        <DataTable
          rows={customers}
          loading={isLoading}
          emptyTitle="No customers yet"
          emptyDescription="Accounts appear here once people register or check out."
          columns={[
            {
              key: 'name',
              header: 'Customer',
              render: (customer) => (
                <button
                  type="button"
                  onClick={() => setViewing(customer.id)}
                  className="text-left"
                >
                  <p className="flex items-center gap-2 text-sm font-medium hover:underline">
                    {customer.name}
                    {customer.role === 'ADMIN' ? <Badge tone="dark">Admin</Badge> : null}
                    {!customer.isActive ? <Badge tone="danger">Disabled</Badge> : null}
                  </p>
                  <p className="text-2xs text-ink-400">{customer.email}</p>
                </button>
              ),
            },
            { key: 'phone', header: 'Phone', render: (c) => c.phone ?? '—' },
            {
              key: 'orders',
              header: 'Orders',
              render: (c) => <span className="tabular-nums">{c._count?.orders ?? 0}</span>,
            },
            {
              key: 'joined',
              header: 'Joined',
              render: (c) => <span className="text-2xs text-ink-400">{formatDate(c.createdAt)}</span>,
            },
            {
              key: 'lastSeen',
              header: 'Last sign-in',
              render: (c) => (
                <span className="text-2xs text-ink-400">
                  {c.lastLoginAt ? relativeTime(c.lastLoginAt) : 'Never'}
                </span>
              ),
            },
            {
              key: 'actions',
              header: '',
              className: 'text-right',
              render: (customer) => (
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(customer)}
                    className="p-1.5 text-ink-400 hover:text-ink"
                    aria-label="Edit"
                  >
                    <EditIcon size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(customer)}
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

        <Pagination page={page} totalPages={data?.meta?.totalPages ?? 1} onChange={setPage} />
      </AdminCard>

      {/* Detail */}
      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={detail?.name ?? 'Customer'} size="lg">
        {detail ? (
          <div className="space-y-6">
            <DefinitionList
              rows={[
                { label: 'Email', value: detail.email },
                { label: 'Phone', value: detail.phone ?? '—' },
                { label: 'Role', value: detail.role },
                { label: 'Status', value: detail.isActive ? 'Active' : 'Disabled' },
                { label: 'Joined', value: formatDate(detail.createdAt) },
                { label: 'Paid orders', value: String(detail.paidOrders ?? 0) },
                { label: 'Lifetime value', value: formatPrice(detail.lifetimeValue ?? 0) },
              ]}
            />

            {detail.orders?.length ? (
              <div>
                <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-architect text-ink-400">
                  Orders
                </p>
                <ul className="divide-y divide-stone-line border border-stone-line">
                  {detail.orders.map((order) => {
                    const meta = statusMeta(order.status);
                    return (
                      <li key={order.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <Link
                          to={`/admin/orders/${order.id}`}
                          onClick={() => setViewing(null)}
                          className="font-mono text-xs hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <div className="flex items-center gap-3">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          <span className="text-xs font-medium">{formatPrice(order.total)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-ink-400">No orders yet.</p>
            )}

            {detail.addresses?.length ? (
              <div>
                <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-architect text-ink-400">
                  Addresses
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {detail.addresses.map((address) => (
                    <address key={address.id} className="border border-stone-line p-3 text-xs not-italic leading-relaxed">
                      <span className="block font-medium">{address.fullName}</span>
                      {address.line1}
                      <br />
                      {address.city}, {address.state} {address.pincode}
                    </address>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* Edit / create */}
      <Modal
        open={Boolean(editing) || creating}
        onClose={() => { setEditing(null); setCreating(false); setErrors({}); }}
        title={editing ? `Edit ${editing.name}` : 'Add user'}
      >
        <CustomerForm
          customer={editing}
          errors={errors}
          saving={save.isPending}
          onCancel={() => { setEditing(null); setCreating(false); setErrors({}); }}
          onSubmit={(payload) => save.mutate({ ...payload, id: editing?.id })}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name}?`}
        message="If this customer has orders, the account is deactivated instead so order history is preserved."
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}

function CustomerForm({
  customer, errors, saving, onSubmit, onCancel,
}: {
  customer: AdminCustomer | null;
  errors: Record<string, string>;
  saving: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    role: customer?.role ?? 'CUSTOMER',
    isActive: customer?.isActive ?? true,
    password: '',
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const payload: Record<string, unknown> = {
          name: form.name,
          phone: form.phone || null,
          role: form.role,
          isActive: form.isActive,
        };
        if (!customer) payload.email = form.email;
        if (form.password) payload.password = form.password;
        onSubmit(payload);
      }}
      className="space-y-5"
    >
      <Input
        label="Name" required value={form.name} error={errors.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <Input
        label="Email" type="email" required value={form.email} error={errors.email}
        disabled={Boolean(customer)}
        hint={customer ? 'The email on an existing account cannot be changed here.' : undefined}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />
      <Input
        label="Phone" type="tel" value={form.phone} error={errors.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
      />
      <Select
        label="Role" value={form.role} error={errors.role}
        hint="Admins can sign in to this panel."
        onChange={(e) => setForm({ ...form, role: e.target.value as 'CUSTOMER' | 'ADMIN' })}
        options={[
          { value: 'CUSTOMER', label: 'Customer' },
          { value: 'ADMIN', label: 'Admin' },
        ]}
      />
      <Input
        label={customer ? 'Set a new password (optional)' : 'Password'}
        type="password"
        required={!customer}
        value={form.password}
        error={errors.password}
        hint="At least 8 characters"
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />
      <Checkbox
        label="Account is active"
        checked={form.isActive}
        onChange={(v) => setForm({ ...form, isActive: v })}
      />

      <div className="flex justify-end gap-2 border-t border-stone-line pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save
        </Button>
      </div>
    </form>
  );
}
