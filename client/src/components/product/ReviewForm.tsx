import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api';
import { useToast } from '../../context/StoreProvider';
import { Button, Input, Textarea } from '../ui';

/**
 * Where a customer writes a review, and where they are told they cannot.
 *
 * A rating is read as a promise from people who have actually had the thing,
 * and it feeds the stars Google puts beside the site. So the form is not open
 * to everyone: the server takes a review only from a signed-in customer whose
 * order for this piece has been delivered. Whether they qualify is asked
 * before anything is typed, because finding out after writing three
 * paragraphs is the version of this that makes people give up on a shop.
 *
 * Nothing written here reaches the page by being written. Every review waits
 * for the studio, and the wording says so rather than thanking someone for a
 * review that is not up -- a shop that says "thank you for your review" and
 * then shows nothing looks like a shop that bins the ones it dislikes.
 */

interface Eligibility {
  allowed: boolean;
  reason: string;
  alreadyReviewed: boolean;
}

/** One star, filled or outlined. Used for both the display and the control. */
function Star({ filled, size = 22 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ReviewForm({ slug }: { slug: string }) {
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sent, setSent] = useState(false);

  const { data: eligibility, isLoading } = useQuery({
    queryKey: ['review-eligibility', slug],
    queryFn: () => api.get<Eligibility>(`/catalog/products/${slug}/review-eligibility`),
    staleTime: 60_000,
  });

  const submit = useMutation({
    mutationFn: () => api.post(`/catalog/products/${slug}/reviews`, { rating, title, content }),
    onSuccess: async () => {
      setSent(true);
      setRating(0);
      setTitle('');
      setContent('');
      await queryClient.invalidateQueries({ queryKey: ['review-eligibility', slug] });
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Could not send that', 'error'),
  });

  // Nothing is shown while we do not yet know, rather than a form that may be
  // taken away a moment later.
  if (isLoading) return null;

  if (sent) {
    return (
      <div className="mt-8 border border-stone-line p-6">
        <p className="text-sm text-ink-600">
          Thank you. Your review has gone to the studio and will appear here once it has been read.
        </p>
      </div>
    );
  }

  if (!eligibility?.allowed) {
    return (
      <div className="mt-8 border border-dashed border-stone-line p-6">
        <p className="text-sm text-ink-500">
          {eligibility?.reason ?? 'Only customers who have received this piece can review it.'}
        </p>
      </div>
    );
  }

  return (
    <form
      className="mt-8 space-y-4 border border-stone-line p-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!rating) {
          push('Choose a rating first', 'error');
          return;
        }
        submit.mutate();
      }}
    >
      <p className="eyebrow text-ink">Write a review</p>

      <div>
        <span className="field-label">Your rating</span>
        <div className="mt-1 flex gap-1 text-ink">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`${star} star${star === 1 ? '' : 's'}`}
              aria-pressed={rating === star}
              onClick={() => setRating(star)}
              className={rating >= star ? 'text-ink' : 'text-ink-300 hover:text-ink-500'}
            >
              <Star filled={rating >= star} />
            </button>
          ))}
        </div>
      </div>

      <Input
        label="Title"
        value={title}
        placeholder="Optional"
        maxLength={120}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Textarea
        label="Your review"
        value={content}
        rows={4}
        required
        maxLength={2000}
        hint="How it looks in place, how it arrived, how it is wearing."
        onChange={(event) => setContent(event.target.value)}
      />

      <Button type="submit" size="sm" loading={submit.isPending}>
        Send for checking
      </Button>
      <p className="text-2xs text-ink-400">
        Reviews are read by the studio before they appear on the site.
      </p>
    </form>
  );
}
