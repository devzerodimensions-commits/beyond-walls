import type { BusinessHour, PersonalizationEntry } from './types';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrPrecise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Money for display. Whole rupees unless there are paise. */
export function formatPrice(value: string | number | null | undefined): string {
  const n = toNumber(value);
  if (n === null) return '';
  return Number.isInteger(n) ? inr.format(n) : inrPrecise.format(n);
}

export function formatPriceExact(value: string | number | null | undefined): string {
  const n = toNumber(value);
  if (n === null) return '';
  return inrPrecise.format(n);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

export function formatDate(value: string | Date | null | undefined, withTime = false): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function formatDateInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function relativeTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

/** "10:00" -> "10:00 AM" */
export function formatTime(value: string | null): string {
  if (!value) return '';
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h)) return value;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${suffix}`;
}

/**
 * Collapses a weekly schedule into readable lines, merging consecutive days
 * that share the same hours: "Monday – Saturday  10 AM – 8 PM".
 */
export function summariseHours(schedule: BusinessHour[]): { days: string; hours: string }[] {
  if (!Array.isArray(schedule) || !schedule.length) return [];

  const groups: { days: string[]; hours: string }[] = [];
  for (const entry of schedule) {
    const hours = entry.closed ? 'Closed' : `${formatTime(entry.open)} – ${formatTime(entry.close)}`;
    const last = groups[groups.length - 1];
    if (last && last.hours === hours) last.days.push(entry.day);
    else groups.push({ days: [entry.day], hours });
  }

  return groups.map((group) => ({
    days:
      group.days.length === 1
        ? group.days[0]
        : `${group.days[0]} – ${group.days[group.days.length - 1]}`,
    hours: group.hours,
  }));
}

/** Is the studio open right now, per the configured schedule? */
export function isOpenNow(schedule: BusinessHour[]): boolean | null {
  if (!Array.isArray(schedule) || !schedule.length) return null;
  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const today = schedule.find((s) => s.day === dayName);
  if (!today || today.closed || !today.open || !today.close) return false;

  const [oh, om] = today.open.split(':').map(Number);
  const [ch, cm] = today.close.split(':').map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= oh * 60 + (om || 0) && minutes < ch * 60 + (cm || 0);
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/** Order / payment status → human label + tone for badges. */
export function statusMeta(status: string): { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' } {
  const map: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
    PENDING: { label: 'Pending', tone: 'warning' },
    CONFIRMED: { label: 'Confirmed', tone: 'info' },
    IN_PRODUCTION: { label: 'In production', tone: 'info' },
    READY_TO_SHIP: { label: 'Ready to ship', tone: 'info' },
    SHIPPED: { label: 'Shipped', tone: 'info' },
    DELIVERED: { label: 'Delivered', tone: 'success' },
    CANCELLED: { label: 'Cancelled', tone: 'danger' },
    REFUNDED: { label: 'Refunded', tone: 'neutral' },
    AUTHORIZED: { label: 'Authorised', tone: 'warning' },
    PAID: { label: 'Paid', tone: 'success' },
    FAILED: { label: 'Failed', tone: 'danger' },
    PARTIALLY_REFUNDED: { label: 'Part refunded', tone: 'neutral' },
    DRAFT: { label: 'Draft', tone: 'warning' },
    PUBLISHED: { label: 'Published', tone: 'success' },
    ARCHIVED: { label: 'Archived', tone: 'neutral' },
    NEW: { label: 'New', tone: 'warning' },
    IN_PROGRESS: { label: 'In progress', tone: 'info' },
    QUOTED: { label: 'Quoted', tone: 'info' },
    CLOSED: { label: 'Closed', tone: 'neutral' },
    SPAM: { label: 'Spam', tone: 'danger' },
  };
  return map[status] ?? { label: status.replace(/_/g, ' ').toLowerCase(), tone: 'neutral' };
}

/** One-line description of a cart/order line's customisation. */
export function describePersonalization(entries: PersonalizationEntry[] | undefined): string {
  if (!entries?.length) return '';
  return entries
    .filter((e) => e.value)
    .map((e) => `${e.label}: ${e.displayValue ?? e.value}`)
    .join(' · ');
}

/**
 * Minimal markdown for admin-authored page content: headings, bold, italics,
 * links, lists, blockquotes and paragraphs. Escapes HTML first so admin copy
 * cannot inject markup.
 */
export function renderMarkdown(source: string): string {
  const escaped = source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = escaped.split('\n');
  const html: string[] = [];
  let inList = false;
  let inQuote = false;

  const inline = (text: string) =>
    text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(
        /\[(.+?)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g,
        '<a href="$2" class="link-underline font-medium">$1</a>',
      );

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };
  const closeQuote = () => {
    if (inQuote) {
      html.push('</blockquote>');
      inQuote = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      closeList();
      closeQuote();
      continue;
    }

    if (line.startsWith('&gt; ')) {
      closeList();
      if (!inQuote) {
        html.push('<blockquote class="border-l-2 border-ink-200 pl-4 italic text-ink-500">');
        inQuote = true;
      }
      html.push(`<p>${inline(line.slice(5))}</p>`);
      continue;
    }
    closeQuote();

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length + 1; // # -> h2, so the page <h1> stays unique
      const sizes = ['', '', 'text-2xl mt-10 mb-3', 'text-xl mt-8 mb-2', 'text-lg mt-6 mb-2', 'text-base mt-4 mb-2'];
      html.push(`<h${level} class="${sizes[level] ?? ''} font-display">${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        html.push('<ul class="my-4 list-disc space-y-1.5 pl-5">');
        inList = true;
      }
      html.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    closeList();

    if (/^---+$/.test(line)) {
      html.push('<hr class="my-8 border-stone-line" />');
      continue;
    }

    html.push(`<p class="my-4 leading-relaxed">${inline(line)}</p>`);
  }

  closeList();
  closeQuote();
  return html.join('\n');
}

export function truncate(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
