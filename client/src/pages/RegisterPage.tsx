import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { Seo } from '../lib/seo';
import { useAuth, useSettings, useToast } from '../context/StoreProvider';
import { Button, Input } from '../components/ui';

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, isAuthenticated, isLoading } = useAuth();
  const { settings } = useSettings();
  const { push } = useToast();

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/account';

  if (!isLoading && isAuthenticated) return <Navigate to={from} replace />;

  const set = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setErrors({});

    if (form.password !== form.confirm) {
      setErrors({ confirm: 'Passwords do not match' });
      return;
    }

    setSubmitting(true);
    try {
      const user = await register({
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
      });
      push(`Welcome, ${user.name.split(' ')[0]}`, 'success');
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        if (!Object.keys(err.fieldErrors).length) setError(err.message);
      } else {
        setError('Could not create your account. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Seo settings={settings} title="Create an account" canonical="/register" noindex />

      <div className="container-site py-16 lg:py-24">
        <div className="mx-auto max-w-sm">
          <p className="eyebrow mb-4">Account</p>
          <h1 className="text-3xl">Create an account</h1>
          <p className="mt-3 text-sm text-ink-500">
            Keep your orders, addresses and wishlist in one place.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <Input
              label="Full name" required autoComplete="name" error={errors.name}
              value={form.name} onChange={(e) => set('name', e.target.value)}
            />
            <Input
              label="Email" type="email" required autoComplete="email" error={errors.email}
              value={form.email} onChange={(e) => set('email', e.target.value)}
            />
            <Input
              label="Phone (optional)" type="tel" autoComplete="tel" error={errors.phone}
              value={form.phone} onChange={(e) => set('phone', e.target.value)}
            />
            <Input
              label="Password" type="password" required autoComplete="new-password"
              hint="At least 8 characters" error={errors.password}
              value={form.password} onChange={(e) => set('password', e.target.value)}
            />
            <Input
              label="Confirm password" type="password" required autoComplete="new-password"
              error={errors.confirm}
              value={form.confirm} onChange={(e) => set('confirm', e.target.value)}
            />

            {error ? (
              <p className="border border-state-danger/30 bg-[#F9EDED] px-3 py-2.5 text-xs text-state-danger">
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" fullWidth loading={submitting}>
              Create account
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-500">
            Already have an account?{' '}
            <Link to="/login" state={location.state} className="link-underline font-medium text-ink">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
