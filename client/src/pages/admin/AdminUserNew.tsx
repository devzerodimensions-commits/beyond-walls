import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminCard, AdminPageHeader } from '../../components/admin/AdminKit';
import { Button, ButtonLink, Checkbox, Input, Select } from '../../components/ui';
import { useToast } from '../../context/StoreProvider';
import { ApiError, api } from '../../lib/api';

type UserRole = 'CUSTOMER' | 'ADMIN';

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const values = new Uint8Array(14);
  window.crypto.getRandomValues(values);
  const random = Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
  return `Bw!9${random}`;
}

export default function AdminUserNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'CUSTOMER' as UserRole,
    isActive: true,
  });

  const create = useMutation({
    mutationFn: () => api.post('/admin/customers', {
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      password: form.password,
      role: form.role,
      isActive: form.isActive,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      push('User added', 'success');
      navigate('/admin/users');
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        if (!Object.keys(error.fieldErrors).length) push(error.message, 'error');
      }
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    create.mutate();
  };

  return (
    <>
      <AdminPageHeader
        title="Add user"
        description="Create a customer account or give a trusted team member administrator access."
        actions={<ButtonLink to="/admin/users" size="sm" variant="secondary">All users</ButtonLink>}
      />

      <AdminCard title="New user account" description="The email address is used as the login ID.">
        <form onSubmit={submit} className="max-w-2xl space-y-5">
          <Input
            label="Full name"
            required
            value={form.name}
            error={errors.name}
            autoComplete="name"
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <Input
            label="Email"
            type="email"
            required
            value={form.email}
            error={errors.email}
            autoComplete="email"
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <Input
            label="Phone"
            type="tel"
            value={form.phone}
            error={errors.phone}
            autoComplete="tel"
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />

          <div className="space-y-2">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              value={form.password}
              error={errors.password}
              autoComplete="new-password"
              hint="At least 8 characters. Share it securely with the user."
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setForm({ ...form, password: generatePassword() })}
              >
                Generate password
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? 'Hide password' : 'Show password'}
              </Button>
            </div>
          </div>

          <Select
            label="Role"
            required
            value={form.role}
            error={errors.role}
            hint="Administrators can manage products, orders, customers and website content."
            onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
            options={[
              { value: 'CUSTOMER', label: 'Customer' },
              { value: 'ADMIN', label: 'Administrator' },
            ]}
          />

          <Checkbox
            label="Account is active"
            checked={form.isActive}
            onChange={(value) => setForm({ ...form, isActive: value })}
          />

          <div className="flex flex-wrap gap-2 border-t border-stone-line pt-5">
            <Button type="submit" loading={create.isPending}>Add user</Button>
            <ButtonLink to="/admin/users" variant="ghost">Cancel</ButtonLink>
          </div>
        </form>
      </AdminCard>
    </>
  );
}
