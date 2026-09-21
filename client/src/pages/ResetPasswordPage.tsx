import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api';
import { Seo } from '../lib/seo';
import { useSettings, useToast } from '../context/StoreProvider';
import { AlertIcon, Button, ButtonLink, Input, PageLoader } from '../components/ui';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { settings } = useSettings();
  const { push } = useToast();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Check the link before showing the form, so a stale link fails early.
  const { data: check, isLoading } = useQuery({
    queryKey: ['reset-token', token],
    queryFn: () => api.get<{ valid: boolean; email: string | null }>(`/auth/reset-password/${token}`),
    enabled: Boolean(token),
    retry: false,
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('The passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await api.post<{ message: string }>('/auth/reset-password', { token, password });
      push('Your password has been changed. Please sign in.', 'success');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset your password.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return <InvalidLink settings={settings} reason="This link is missing its token." />;
  }
  if (isLoading) return <PageLoader label="Checking your link" />;
  if (!check?.valid) {
    return (
      <InvalidLink
        settings={settings}
        reason="This reset link has expired or has already been used."
      />
    );
  }

  return (
    <>
      <Seo settings={settings} title="Choose a new password" noindex />

      <div className="container-site py-16 lg:py-24">
        <div className="mx-auto max-w-sm">
          <p className="eyebrow mb-4">Account</p>
          <h1 className="text-3xl">Choose a new password</h1>
          {check.email ? (
            <p className="mt-3 text-sm text-ink-500">
              Setting a new password for <strong>{check.email}</strong>.
            </p>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <Input
              label="New password"
              type="password"
              required
              autoComplete="new-password"
              hint="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              label="Confirm new password"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />

            {error ? (
              <p className="border border-state-danger/30 bg-[#F9EDED] px-3 py-2.5 text-xs text-state-danger">
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" fullWidth loading={submitting}>
              Save new password
            </Button>
          </form>

          <p className="mt-6 text-center text-2xs leading-relaxed text-ink-400">
            Changing your password signs you out everywhere else.
          </p>
        </div>
      </div>
    </>
  );
}

function InvalidLink({
  settings, reason,
}: {
  settings: Record<string, unknown>;
  reason: string;
}) {
  return (
    <>
      <Seo settings={settings} title="Reset link not valid" noindex />
      <div className="container-site py-20">
        <div className="mx-auto max-w-sm border border-state-warning/40 bg-[#F8F3E6] p-8 text-center">
          <span className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-state-warning text-paper">
            <AlertIcon size={20} />
          </span>
          <h1 className="text-xl">Link not valid</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">{reason}</p>
          <div className="mt-7 flex justify-center gap-3">
            <ButtonLink to="/forgot-password" size="sm">
              Request a new link
            </ButtonLink>
            <Link
              to="/login"
              className="inline-flex items-center px-4 py-2 text-2xs uppercase tracking-architect text-ink-500 hover:text-ink"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
