import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api';
import type { AdminCustomer } from '../../lib/types';
import { formatDate, formatPrice, relativeTime, statusMeta } from '../../lib/format';
import { useAuth, useToast } from '../../context/StoreProvider';
import {
  AdminCard, AdminPageHeader, AdminSearch, DataTable, DefinitionList, type Column,
} from '../../components/admin/AdminKit';
import {
  Badge, Button, ButtonLink, Checkbox, ConfirmDialog, EditIcon, Input, Modal, Pagination,
  PlusIcon, TrashIcon,
} from '../../components/ui';

type DirectoryRole = 'CUSTOMER' | 'ADMIN';

const COPY = {
  CUSTOMER: {
    title: 'Customers',
    description: 'Shopper accounts, contact details and order history.',
    add: 'Add customer',
    emptyTitle: 'No customers yet',
    emptyDescription: 'Customer accounts appear here once people register or check out.',
  },
  ADMIN: {
    title: 'Admin users',
    description: 'People who can sign in to and manage this admin panel.',
    add: 'Add administrator',
    emptyTitle: 'No administrators found',
    emptyDescription: 'Add an administrator to give a trusted team member panel access.',
  },
} as const;

export default function AdminCustomers() {
  return <AdminUserDirectory role="CUSTOMER" />;
}

export function AdminUserDirectory({ role }: { role: DirectoryRole }) {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const { user } = useAuth();
  const copy = COPY[role];
  const isAdminDirectory = role === 'ADMIN';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminCustomer | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AdminCustomer | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const directoryKey = role === 'ADMIN' ? 'admin-users' : 'admin-customers';
  const { data, isLoading } = useQuery({
    queryKey: [directoryKey, page, search],
    queryFn: () => api.list<AdminCustomer[]>('/admin/customers', {
      page, perPage: 25, search, role,
    }),
    placeholderData: keepPreviousData,
  });

  const { data: detail } = useQuery({
    queryKey: ['admin-user', viewing],
    queryFn: () => api.get<AdminCustomer>(`/admin/customers/${viewing}`),
    enabled: Boolean(viewing),
  });

  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['admin-customers'] }),
    queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  ]);

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
      push(`${isAdminDirectory ? 'Administrator' : 'Customer'} saved`, 'success');
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
      push(`${isAdminDirectory ? 'Administrator' : 'Customer'} removed`, 'info');
    },
    onError: (err) => {
      push(err instanceof ApiError ? err.message : 'Could not delete account', 'error');
      setDeleting(null);
    },
  });

  const accounts = data?.data ?? [];
  const columns: Column<AdminCustomer>[] = [
    {
      key: 'name',
      header: isAdminDirectory ? 'Administrator' : 'Customer',
      render: (account) => (
        <button type="button" onClick={() => setViewing(account.id)} className="text-left">
          <p className="flex items-center gap-2 text-sm font-medium hover:underline">
            {account.name}
            {!account.isActive ? <Badge tone="danger">Disabled</Badge> : null}
          </p>
          <p className="text-2xs text-ink-400">{account.email}</p>
        </button>
      ),
    },
    { key: 'phone', header: 'Phone', render: (account) => account.phone ?? '—' },
    ...(!isAdminDirectory ? [{
      key: 'orders',
      header: 'Orders',
      render: (account: AdminCustomer) => <span className="tabular-nums">{account._count?.orders ?? 0}</span>,
    }] : []),
    {
      key: 'joined',
      header: 'Joined',
      render: (account) => <span className="text-2xs text-ink-400">{formatDate(account.createdAt)}</span>,
    },
    {
      key: 'lastSeen',
      header: 'Last sign-in',
      render: (account) => (
        <span className="text-2xs text-ink-400">
          {account.lastLoginAt ? relativeTime(account.lastLoginAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (account) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setEditing(account)}
            className="p-1.5 text-ink-400 hover:text-ink"
            aria-label={`Edit ${account.name}`}
          >
            <EditIcon size={15} />
          </button>
          {!(isAdminDirectory && account.id === user?.id) ? (
            <button
              type="button"
              onClick={() => setDeleting(account)}
              className="p-1.5 text-ink-400 hover:text-state-danger"
              aria-label={`Delete ${account.name}`}
            >
              <TrashIcon size={15} />
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <AdminPageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <div className="flex flex-wrap gap-2">
            {isAdminDirectory ? (
              <ButtonLink to="/admin/profile" size="sm" variant="secondary">My profile</ButtonLink>
            ) : null}
            <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => setCreating(true)}>
              {copy.add}
            </Button>
          </div>
        }
      />

      <AdminCard>
        <div className="mb-5">
          <AdminSearch
            value={search}
            onChange={(value) => { setSearch(value); setPage(1); }}
            placeholder={`Search ${isAdminDirectory ? 'administrators' : 'customers'} by name, email or phone…`}
            className="w-full"
          />
        </div>

        <DataTable
          rows={accounts}
          loading={isLoading}
          emptyTitle={copy.emptyTitle}
          emptyDescription={copy.emptyDescription}
          columns={columns}
        />

        <Pagination page={page} totalPages={data?.meta?.totalPages ?? 1} onChange={setPage} />
      </AdminCard>

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={detail?.name ?? (isAdminDirectory ? 'Administrator' : 'Customer')}
        size="lg"
      >
        {detail ? (
          <div className="space-y-6">
            <DefinitionList
              rows={[
                { label: 'Email', value: detail.email },
                { label: 'Phone', value: detail.phone ?? '—' },
                { label: 'Account type', value: isAdminDirectory ? 'Administrator' : 'Customer' },
                { label: 'Status', value: detail.isActive ? 'Active' : 'Disabled' },
                { label: 'Joined', value: formatDate(detail.createdAt) },
                ...(isAdminDirectory
                  ? [{ label: 'Last sign-in', value: detail.lastLoginAt ? relativeTime(detail.lastLoginAt) : 'Never' }]
                  : [
                    { label: 'Paid orders', value: String(detail.paidOrders ?? 0) },
                    { label: 'Lifetime value', value: formatPrice(detail.lifetimeValue ?? 0) },
                  ]),
              ]}
            />

            {!isAdminDirectory ? <CustomerCommerce detail={detail} onNavigate={() => setViewing(null)} /> : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(editing) || creating}
        onClose={() => { setEditing(null); setCreating(false); setErrors({}); }}
        title={editing ? `Edit ${editing.name}` : copy.add}
      >
        <AccountForm
          account={editing}
          role={role}
          lockActive={Boolean(isAdminDirectory && editing?.id === user?.id)}
          errors={errors}
          saving={save.isPending}
          onCancel={() => { setEditing(null); setCreating(false); setErrors({}); }}
          onSubmit={(payload) => save.mutate({ ...payload, id: editing?.id })}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name}?`}
        message={isAdminDirectory
          ? 'This person will immediately lose access to the admin panel. You cannot delete your own account or the last active administrator.'
          : 'If this customer has orders, the account is deactivated instead so order history is preserved.'}
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}

function CustomerCommerce({ detail, onNavigate }: { detail: AdminCustomer; onNavigate: () => void }) {
  return (
    <>
      {detail.orders?.length ? (
        <div>
          <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-architect text-ink-400">Orders</p>
          <ul className="divide-y divide-stone-line border border-stone-line">
            {detail.orders.map((order) => {
              const meta = statusMeta(order.status);
              return (
                <li key={order.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link
                    to={`/admin/orders/${order.id}`}
                    onClick={onNavigate}
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
      ) : <p className="text-sm text-ink-400">No orders yet.</p>}

      {detail.addresses?.length ? (
        <div>
          <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-architect text-ink-400">Addresses</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {detail.addresses.map((address) => (
              <address key={address.id} className="border border-stone-line p-3 text-xs not-italic leading-relaxed">
                <span className="block font-medium">{address.fullName}</span>
                {address.line1}<br />
                {address.city}, {address.state} {address.pincode}
              </address>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function AccountForm({ account, role, lockActive, errors, saving, onSubmit, onCancel }: {
  account: AdminCustomer | null;
  role: DirectoryRole;
  lockActive: boolean;
  errors: Record<string, string>;
  saving: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: account?.name ?? '',
    email: account?.email ?? '',
    phone: account?.phone ?? '',
    isActive: account?.isActive ?? true,
    password: '',
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const payload: Record<string, unknown> = {
          name: form.name,
          phone: form.phone || null,
          role,
          isActive: form.isActive,
        };
        if (!account) payload.email = form.email;
        if (form.password) payload.password = form.password;
        onSubmit(payload);
      }}
      className="space-y-5"
    >
      <div className="border border-stone-line bg-stone-canvas px-3 py-2 text-xs text-ink-500">
        Account type: <span className="font-semibold text-ink">{role === 'ADMIN' ? 'Administrator' : 'Customer'}</span>
      </div>
      <Input
        label="Name" required value={form.name} error={errors.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
      />
      <Input
        label="Email" type="email" required value={form.email} error={errors.email}
        disabled={Boolean(account)}
        hint={account ? 'The email on an existing account cannot be changed here.' : undefined}
        onChange={(event) => setForm({ ...form, email: event.target.value })}
      />
      <Input
        label="Phone" type="tel" value={form.phone} error={errors.phone}
        onChange={(event) => setForm({ ...form, phone: event.target.value })}
      />
      <Input
        label={account ? 'Set a new password (optional)' : 'Password'}
        type="password" required={!account} value={form.password} error={errors.password}
        hint="At least 8 characters"
        onChange={(event) => setForm({ ...form, password: event.target.value })}
      />
      <Checkbox
        label="Account is active" checked={form.isActive}
        disabled={lockActive}
        onChange={(value) => setForm({ ...form, isActive: value })}
      />
      {lockActive ? (
        <p className="text-xs text-ink-400">Your own administrator access cannot be disabled here.</p>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-stone-line pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>Save</Button>
      </div>
    </form>
  );
}
