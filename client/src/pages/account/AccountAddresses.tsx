import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api';
import type { Address } from '../../lib/types';
import { useToast } from '../../context/StoreProvider';
import {
  Badge, Button, Checkbox, ConfirmDialog, EditIcon, EmptyState, Input, Modal,
  PinIcon, PlusIcon, Select, Skeleton, TrashIcon,
} from '../../components/ui';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const EMPTY: Address = {
  fullName: '', phone: '', line1: '', line2: '', landmark: '',
  city: '', state: 'Gujarat', pincode: '', country: 'India', isDefault: false,
};

export default function AccountAddresses() {
  const queryClient = useQueryClient();
  const { push } = useToast();

  const [editing, setEditing] = useState<Address | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: addresses, isLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api.get<Address[]>('/addresses'),
  });

  const save = useMutation({
    mutationFn: (address: Address) =>
      address.id
        ? api.patch<Address>(`/addresses/${address.id}`, address)
        : api.post<Address>('/addresses', address),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['addresses'] });
      setEditing(null);
      setErrors({});
      push('Address saved', 'success');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        if (!Object.keys(err.fieldErrors).length) push(err.message, 'error');
      }
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/addresses/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['addresses'] });
      setDeleting(null);
      push('Address removed', 'info');
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  const list = addresses ?? [];

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-architect">Saved addresses</h2>
        <Button size="sm" variant="secondary" icon={<PlusIcon size={14} />} onClick={() => setEditing({ ...EMPTY })}>
          Add address
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<PinIcon size={30} />}
          title="No saved addresses"
          description="Save an address to check out faster next time."
          action={<Button size="sm" onClick={() => setEditing({ ...EMPTY })}>Add an address</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((address) => (
            <div key={address.id} className="relative border border-stone-line bg-paper p-5">
              {address.isDefault ? (
                <Badge tone="dark" className="absolute right-4 top-4">
                  Default
                </Badge>
              ) : null}

              <p className="text-sm font-medium">{address.fullName}</p>
              <address className="mt-2 text-xs not-italic leading-relaxed text-ink-500">
                {address.line1}
                {address.line2 ? <><br />{address.line2}</> : null}
                {address.landmark ? <><br />{address.landmark}</> : null}
                <br />
                {address.city}, {address.state} {address.pincode}
                <br />
                {address.phone}
              </address>

              <div className="mt-4 flex gap-3 border-t border-stone-line pt-3">
                <button
                  type="button"
                  onClick={() => setEditing({ ...address })}
                  className="flex items-center gap-1.5 text-2xs uppercase tracking-architect text-ink-500 hover:text-ink"
                >
                  <EditIcon size={13} /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(address)}
                  className="flex items-center gap-1.5 text-2xs uppercase tracking-architect text-ink-400 hover:text-state-danger"
                >
                  <TrashIcon size={13} /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor */}
      <Modal
        open={Boolean(editing)}
        onClose={() => { setEditing(null); setErrors({}); }}
        title={editing?.id ? 'Edit address' : 'Add an address'}
      >
        {editing ? (
          <AddressForm
            value={editing}
            errors={errors}
            saving={save.isPending}
            onCancel={() => { setEditing(null); setErrors({}); }}
            onSubmit={(address) => save.mutate(address)}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Remove this address?"
        message="This address will be deleted from your account. Orders already placed are not affected."
        confirmLabel="Remove"
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting?.id && remove.mutate(deleting.id)}
      />
    </>
  );
}

function AddressForm({
  value, errors, saving, onSubmit, onCancel,
}: {
  value: Address;
  errors: Record<string, string>;
  saving: boolean;
  onSubmit: (address: Address) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Address>(value);
  const set = (key: keyof Address, next: string | boolean) => setForm({ ...form, [key]: next });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Recipient name" required value={form.fullName} error={errors.fullName}
          onChange={(e) => set('fullName', e.target.value)}
        />
        <Input
          label="Phone" type="tel" required value={form.phone} error={errors.phone}
          onChange={(e) => set('phone', e.target.value)}
        />
        <Input
          label="Address line 1" required value={form.line1} error={errors.line1}
          wrapClassName="sm:col-span-2" onChange={(e) => set('line1', e.target.value)}
        />
        <Input
          label="Address line 2" value={form.line2 ?? ''} wrapClassName="sm:col-span-2"
          onChange={(e) => set('line2', e.target.value)}
        />
        <Input label="Landmark" value={form.landmark ?? ''} onChange={(e) => set('landmark', e.target.value)} />
        <Input
          label="PIN code" required value={form.pincode} maxLength={6} inputMode="numeric"
          error={errors.pincode}
          onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))}
        />
        <Input label="City" required value={form.city} error={errors.city} onChange={(e) => set('city', e.target.value)} />
        <Select
          label="State" required value={form.state} error={errors.state}
          onChange={(e) => set('state', e.target.value)}
          options={INDIAN_STATES.map((s) => ({ value: s, label: s }))}
        />
      </div>

      <Checkbox
        label="Make this my default address"
        checked={Boolean(form.isDefault)}
        onChange={(checked) => set('isDefault', checked)}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save address
        </Button>
      </div>
    </form>
  );
}
