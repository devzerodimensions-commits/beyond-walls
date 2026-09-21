import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { Seo } from '../lib/seo';
import { useAuth, useSettings, useToast } from '../context/StoreProvider';
import { Button, Input } from '../components/ui';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading } = useAuth();
  const { settings } = useSettings();
  const { push } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/account';

  if (!isLoading && isAuthenticated) return <Navigate to={from} replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      push(`Welcome back, ${user.name.split(' ')[0]}`, 'success');
      navigate(user.role === 'ADMIN' && from === '/account' ? '/admin' : from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign you in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Seo settings={settings} title="Sign in" canonical="/login" noindex />

      <div className="container-site py-16 lg:py-24">
        <div className="mx-auto max-w-sm">
          <p className="eyebrow mb-4">Account</p>
          <h1 className="text-3xl">Sign in</h1>
          <p className="mt-3 text-sm text-ink-500">
            Access your orders, addresses and wishlist.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <Input
              label="Email" type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
            <div>
              <Input
                label="Password" type="password" required autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
              <Link
                to="/forgot-password"
                className="link-underline mt-2 inline-block text-2xs uppercase tracking-architect text-ink-400"
              >
                Forgot your password?
              </Link>
            </div>

            {error ? (
              <p className="border border-state-danger/30 bg-[#F9EDED] px-3 py-2.5 text-xs text-state-danger">
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" fullWidth loading={submitting}>
              Sign in
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-500">
            New here?{' '}
            <Link to="/register" state={location.state} className="link-underline font-medium text-ink">
              Create an account
            </Link>
          </p>

          <p className="mt-3 text-center text-2xs text-ink-400">
            You can also{' '}
            <Link to="/checkout" className="link-underline">
              check out as a guest
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
