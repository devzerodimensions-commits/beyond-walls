import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { Seo } from '../lib/seo';
import { useSettings } from '../context/StoreProvider';
import { Button, CheckIcon, Input } from '../components/ui';

export default function ForgotPasswordPage() {
  const { settings } = useSettings();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post<{ message: string }>('/auth/forgot-password', { email });
      // The API answers identically whether or not the account exists, so the
      // page must not reveal anything either.
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the reset link.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Seo settings={settings} title="Reset your password" canonical="/forgot-password" noindex />

      <div className="container-site py-16 lg:py-24">
        <div className="mx-auto max-w-sm">
          {sent ? (
            <div className="border border-state-success/30 bg-[#EDF5F1] p-8 text-center">
              <span className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-state-success text-paper">
                <CheckIcon size={20} />
              </span>
              <h1 className="text-xl">Check your email</h1>
              <p className="mx-auto mt-3 text-sm leading-relaxed text-ink-600">
                If an account exists for <strong>{email}</strong>, we have sent a link to reset the
                password. It expires in 30 minutes.
              </p>
              <p className="mt-4 text-2xs text-ink-500">
                Nothing arrived? Check your spam folder, or{' '}
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="link-underline font-medium text-ink"
                >
                  try again
                </button>
                .
              </p>
            </div>
          ) : (
            <>
              <p className="eyebrow mb-4">Account</p>
              <h1 className="text-3xl">Reset your password</h1>
              <p className="mt-3 text-sm leading-relaxed text-ink-500">
                Enter your email address and we will send you a link to choose a new password.
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <Input
                  label="Email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />

                {error ? (
                  <p className="border border-state-danger/30 bg-[#F9EDED] px-3 py-2.5 text-xs text-state-danger">
                    {error}
                  </p>
                ) : null}

                <Button type="submit" size="lg" fullWidth loading={submitting}>
                  Send reset link
                </Button>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-xs text-ink-500">
            Remembered it?{' '}
            <Link to="/login" className="link-underline font-medium text-ink">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
