import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import type { Order } from '../lib/types';
import { Seo } from '../lib/seo';
import { useSettings } from '../context/StoreProvider';
import { Button, Input } from '../components/ui';

export default function TrackOrderPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Verify the pair before navigating, so a wrong combination reports here.
      const order = await api.get<Order>(`/orders/${orderNumber.trim()}`, { email: email.trim() });
      navigate(`/order/${order.orderNumber}?email=${encodeURIComponent(email.trim())}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'We could not find that order. Check the details and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Seo settings={settings} title="Track an order" canonical="/track-order" noindex />

      <div className="container-site py-16 lg:py-22">
        <div className="mx-auto max-w-md">
          <p className="eyebrow mb-4">Order status</p>
          <h1 className="text-3xl">Track an order</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            Enter your order number and the email address you used, and we will show you where it is.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <Input
              label="Order number"
              required
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
              placeholder="BW240101ABCDE"
              className="uppercase"
            />
            <Input
              label="Email address"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            {error ? <p className="text-xs text-state-danger">{error}</p> : null}
            <Button type="submit" size="lg" fullWidth loading={loading}>
              Find my order
            </Button>
          </form>

          <p className="mt-6 text-2xs leading-relaxed text-ink-400">
            Signed in with an account? Your orders are listed under{' '}
            <a href="/account/orders" className="link-underline">
              My orders
            </a>
            .
          </p>
        </div>
      </div>
    </>
  );
}
