import {
  forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes,
  type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useToast } from '../../context/StoreProvider';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-ink text-paper border border-ink hover:bg-ink-700 hover:border-ink-700 disabled:bg-ink-200 disabled:border-ink-200',
  secondary:
    'bg-transparent text-ink border border-ink hover:bg-ink hover:text-paper disabled:border-stone-mute disabled:text-ink-300 disabled:hover:bg-transparent disabled:hover:text-ink-300',
  ghost:
    'bg-transparent text-ink border border-transparent hover:bg-paper-warm disabled:text-ink-300',
  danger:
    'bg-state-danger text-paper border border-state-danger hover:bg-[#7f2222] disabled:opacity-50',
  link: 'bg-transparent border-none p-0 text-ink underline-offset-4 hover:underline disabled:text-ink-300',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-2 text-2xs tracking-architect',
  md: 'px-6 py-3 text-xs tracking-architect',
  lg: 'px-8 py-4 text-xs tracking-architect',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, fullWidth, icon, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-medium uppercase',
        'transition-all duration-200 ease-architect disabled:cursor-not-allowed',
        variant !== 'link' && SIZES[size],
        VARIANTS[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size={size === 'lg' ? 18 : 14} /> : icon}
      {children}
    </button>
  );
});

interface ButtonLinkProps {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
  icon?: ReactNode;
  external?: boolean;
}

export function ButtonLink({
  to, variant = 'primary', size = 'md', fullWidth, className, children, icon, external,
}: ButtonLinkProps) {
  const classes = clsx(
    'inline-flex items-center justify-center gap-2 font-medium uppercase',
    'transition-all duration-200 ease-architect',
    variant !== 'link' && SIZES[size],
    VARIANTS[variant],
    fullWidth && 'w-full',
    className,
  );

  if (external) {
    return (
      <a href={to} className={classes} target="_blank" rel="noreferrer noopener">
        {icon}
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={classes}>
      {icon}
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Spinner / loading
// ---------------------------------------------------------------------------

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={clsx('animate-spin', className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-ink-400">
      <Spinner size={22} />
      <span className="eyebrow">{label}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} />;
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

interface FieldWrapProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
  htmlFor?: string;
}

/**
 * The required asterisk is drawn by CSS (`.field-label[data-required]`), not by
 * a node inside the label. As markup it would become part of the field's
 * accessible name — screen readers would announce "Phone star" — and it would
 * break any tool that looks a field up by its label. The control's own
 * `required` attribute carries the actual meaning.
 */
export function FieldWrap({ label, error, hint, required, className, children, htmlFor }: FieldWrapProps) {
  return (
    <div className={className}>
      {label ? (
        <label className="field-label" htmlFor={htmlFor} data-required={required || undefined}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-state-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  wrapClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, wrapClassName, className, id, required, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  return (
    <FieldWrap label={label} error={error} hint={hint} required={required} className={wrapClassName} htmlFor={inputId}>
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={clsx('field', error && 'field-error', className)}
        {...props}
      />
    </FieldWrap>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  wrapClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, wrapClassName, className, id, required, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  return (
    <FieldWrap label={label} error={error} hint={hint} required={required} className={wrapClassName} htmlFor={inputId}>
      <textarea
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={clsx('field min-h-[110px] resize-y', error && 'field-error', className)}
        {...props}
      />
    </FieldWrap>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  wrapClassName?: string;
  options?: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, wrapClassName, className, options, children, id, required, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  return (
    <FieldWrap label={label} error={error} hint={hint} required={required} className={wrapClassName} htmlFor={inputId}>
      <div className="relative">
        <select
          ref={ref}
          id={inputId}
          required={required}
          className={clsx('field appearance-none pr-9', error && 'field-error', className)}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
          width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </div>
    </FieldWrap>
  );
});

export function Checkbox({
  label, checked, onChange, hint, disabled, name,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <label className={clsx('flex cursor-pointer items-start gap-2.5', disabled && 'cursor-not-allowed opacity-60')}>
      <input
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer appearance-none border border-ink-300 bg-paper
                   transition-colors checked:border-ink checked:bg-ink
                   checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22white%22><path d=%22M6.2 11.3 3.4 8.5l1-1 1.8 1.8 4.4-4.4 1 1z%22/></svg>')]
                   checked:bg-center checked:bg-no-repeat disabled:cursor-not-allowed"
      />
      <span className="text-sm leading-snug text-ink-700">
        {label}
        {hint ? <span className="mt-0.5 block text-xs text-ink-400">{hint}</span> : null}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

const TONES = {
  neutral: 'bg-paper-warm text-ink-600 border-stone-line',
  info: 'bg-[#EEF3F7] text-state-info border-[#CFE0EC]',
  success: 'bg-[#EDF5F1] text-state-success border-[#CBE3D8]',
  warning: 'bg-[#F8F3E6] text-state-warning border-[#EADFC2]',
  danger: 'bg-[#F9EDED] text-state-danger border-[#EBCFCF]',
  dark: 'bg-ink text-paper border-ink',
} as const;

export function Badge({
  children, tone = 'neutral', className,
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 border px-2 py-0.5 text-2xs font-medium uppercase tracking-architect',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Modal / Drawer
// ---------------------------------------------------------------------------

export function Modal({
  open, onClose, title, children, footer, size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-ink/40 backdrop-blur-[2px]"
      />
      <div
        className={clsx(
          'relative max-h-[92vh] w-full overflow-hidden bg-paper shadow-panel animate-fade-up',
          'flex flex-col sm:m-4',
          widths[size],
        )}
      >
        {title ? (
          <div className="flex items-center justify-between border-b border-stone-line px-6 py-4">
            <h3 className="text-base font-medium">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-ink-400 transition-colors hover:text-ink"
              aria-label="Close dialog"
            >
              <CloseIcon />
            </button>
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="border-t border-stone-line bg-paper-off px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Drawer({
  open, onClose, title, children, footer, side = 'right', width = 'max-w-md',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  side?: 'right' | 'left';
  width?: string;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-ink/40 backdrop-blur-[2px]"
      />
      <div
        className={clsx(
          'absolute top-0 flex h-full w-full flex-col bg-paper shadow-panel animate-slide-in-right',
          side === 'right' ? 'right-0' : 'left-0',
          width,
        )}
      >
        <div className="flex items-center justify-between border-b border-stone-line px-5 py-4">
          <h3 className="text-xs font-medium uppercase tracking-architect">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-ink-400 transition-colors hover:text-ink"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer ? <div className="border-t border-stone-line bg-paper-off px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state, pagination, toasts
// ---------------------------------------------------------------------------

export function EmptyState({
  title, description, action, icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center border border-dashed border-stone-line bg-paper px-6 py-16 text-center">
      {icon ? <div className="mb-4 text-ink-300">{icon}</div> : null}
      <h3 className="text-base font-medium text-ink">{title}</h3>
      {description ? <p className="mt-2 max-w-sm text-sm text-ink-400">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function Pagination({
  page, totalPages, onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  // Window of pages around the current one, with ellipses.
  const pages: (number | 'gap')[] = [];
  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== 'gap') pages.push('gap');
  }

  return (
    <nav className="flex items-center justify-center gap-1.5 py-10" aria-label="Pagination">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="border border-stone-line px-3 py-2 text-2xs uppercase tracking-architect transition-colors hover:border-ink disabled:opacity-30 disabled:hover:border-stone-line"
      >
        Prev
      </button>
      {pages.map((p, i) =>
        p === 'gap' ? (
          // eslint-disable-next-line react/no-array-index-key
          <span key={`gap-${i}`} className="px-2 text-ink-300">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={clsx(
              'min-w-[38px] border px-3 py-2 text-2xs transition-colors',
              p === page
                ? 'border-ink bg-ink text-paper'
                : 'border-stone-line hover:border-ink',
            )}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="border border-stone-line px-3 py-2 text-2xs uppercase tracking-architect transition-colors hover:border-ink disabled:opacity-30 disabled:hover:border-stone-line"
      >
        Next
      </button>
    </nav>
  );
}

export function ToastViewport() {
  const { toasts, dismiss } = useToast();
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[90] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={clsx(
            'pointer-events-auto flex items-start gap-3 border px-4 py-3 text-sm shadow-lift animate-fade-up',
            toast.tone === 'success' && 'border-[#CBE3D8] bg-[#EDF5F1] text-state-success',
            toast.tone === 'error' && 'border-[#EBCFCF] bg-[#F9EDED] text-state-danger',
            toast.tone === 'info' && 'border-stone-line bg-ink text-paper',
          )}
        >
          <span className="flex-1 leading-snug">{toast.message}</span>
          {toast.action ? (
            <Link to={toast.action.href} className="shrink-0 font-medium underline underline-offset-2">
              {toast.action.label}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
            aria-label="Dismiss"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Confirmation dialog for destructive admin actions. */
export function ConfirmDialog({
  open, title, message, confirmLabel = 'Delete', onConfirm, onCancel, loading, tone = 'danger',
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  tone?: 'danger' | 'primary';
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone} size="sm" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-ink-600">{message}</p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Icons (inline so there is no icon-font dependency)
// ---------------------------------------------------------------------------

type IconProps = { size?: number; className?: string };

const icon = (path: ReactNode, viewBox = '0 0 24 24') =>
  function Icon({ size = 18, className }: IconProps) {
    return (
      <svg
        width={size} height={size} viewBox={viewBox} fill="none"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        className={className} aria-hidden="true"
      >
        {path}
      </svg>
    );
  };

export const CloseIcon = icon(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);
export const SearchIcon = icon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></>);
export const CartIcon = icon(
  <><path d="M6 6h15l-1.5 9h-12z" /><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M6 6 5 3H2" /></>,
);
export const HeartIcon = icon(
  <path d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7 2.7C19 15.6 12 20 12 20Z" />,
);
export const UserIcon = icon(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></>);
export const MenuIcon = icon(<><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>);
export const ChevronRight = icon(<path d="m9 5 7 7-7 7" />);
export const ChevronLeft = icon(<path d="m15 5-7 7 7 7" />);
export const ChevronDown = icon(<path d="m5 9 7 7 7-7" />);
export const PlusIcon = icon(<><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const MinusIcon = icon(<path d="M5 12h14" />);
export const TrashIcon = icon(
  <><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7" /><path d="M10 11v5" /><path d="M14 11v5" /></>,
);
export const EditIcon = icon(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m14 5 4 4" /></>);
export const CheckIcon = icon(<path d="m5 12 5 5L19 7" />);
export const ExternalIcon = icon(<><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>);
export const FilterIcon = icon(<><path d="M4 6h16" /><path d="M7 12h10" /><path d="M10 18h4" /></>);
export const GridIcon = icon(<><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></>);
export const UploadIcon = icon(<><path d="M12 16V5" /><path d="m7 10 5-5 5 5" /><path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1" /></>);
export const PhoneIcon = icon(<path d="M5 4h3l2 5-2 1a12 12 0 0 0 6 6l1-2 5 2v3a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z" />);
export const MailIcon = icon(<><rect x="3" y="5" width="18" height="14" /><path d="m3 6 9 7 9-7" /></>);
export const PinIcon = icon(<><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></>);
export const ClockIcon = icon(<><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5l3 1.5" /></>);
export const DragIcon = icon(<><circle cx="9" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="18" r="1" /></>);
export const ArrowRight = icon(<><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>);
export const ArrowLeft = icon(<><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></>);
export const CopyIcon = icon(<><rect x="9" y="9" width="11" height="11" /><path d="M5 15V5a1 1 0 0 1 1-1h9" /></>);
export const EyeIcon = icon(<><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="2.6" /></>);
export const AlertIcon = icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5" /><path d="M12 16.2v.1" /></>);
export const RefreshIcon = icon(<><path d="M20 12a8 8 0 1 1-2.5-5.8" /><path d="M20 4v5h-5" /></>);

/** Sticky element that keeps focus inside a panel while it is open. */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active || !ref.current) return undefined;
    const node = ref.current;
    const focusables = node.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusables[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener('keydown', onKey);
    return () => node.removeEventListener('keydown', onKey);
  }, [active]);

  return ref;
}
