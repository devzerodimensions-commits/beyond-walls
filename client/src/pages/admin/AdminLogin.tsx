import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../context/StoreProvider';
import { Button, Input } from '../../components/ui';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { login, isAdmin, isLoading, isAuthenticated, logout } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && isAdmin) return <Navigate to="/admin" replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      if (user.role !== 'ADMIN') {
        // A customer account must not linger in an admin session.
        await logout();
        setError('This account does not have admin access.');
        return;
      }
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign you in.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <title>Admin sign in · Beyond Walls</title>
      </Helmet>

      <div className="flex min-h-screen items-center justify-center bg-ink px-5 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <span className="font-display text-lg font-semibold tracking-wider2 text-paper">
              BEYOND WALLS
            </span>
            <p className="mt-2 text-2xs uppercase tracking-wider2 text-paper/50">Admin panel</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-paper p-8">
            <h1 className="text-lg">Sign in</h1>
            <p className="mt-1.5 text-xs text-ink-400">
              Use your Beyond Walls admin account.
            </p>

            <div className="mt-6 space-y-4">
              <Input
                label="Email" type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                label="Password" type="password" required autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error ? (
              <p className="mt-4 border border-state-danger/30 bg-[#F9EDED] px-3 py-2.5 text-xs text-state-danger">
                {error}
              </p>
            ) : null}

            {isAuthenticated && !isAdmin ? (
              <p className="mt-4 text-xs text-ink-400">
                You are signed in as a customer.{' '}
                <button type="button" onClick={() => void logout()} className="link-underline">
                  Sign out
                </button>{' '}
                to use a different account.
              </p>
            ) : null}

            <Button type="submit" size="lg" fullWidth className="mt-6" loading={submitting}>
              Sign in
            </Button>
          </form>

          <p className="mt-6 text-center text-2xs text-paper/40">
            <Link to="/" className="link-underline">
              ← Back to the website
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
