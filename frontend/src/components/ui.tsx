import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, Loader2, X } from 'lucide-react';
import type { RideStatus } from '../types';
import { statusLabel, statusTone } from '../lib/format';
import { fetchPrivateImage } from '../lib/api';
import { APP_NAME } from '../config';

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ */
/* Brand                                                               */
/* ------------------------------------------------------------------ */

export function BrandMark({ size = 36, rounded = 12 }: { size?: number; rounded?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={APP_NAME}
      style={{ borderRadius: rounded, display: 'block' }}
    >
      <rect width="64" height="64" rx="14" fill="#08211f" />
      <circle cx="46" cy="18" r="8" fill="#ffb020" />
      <g fill="none" stroke="#f7f3e8" strokeWidth="2.6" strokeLinecap="round">
        <circle cx="18" cy="44" r="6.6" />
        <circle cx="46" cy="44" r="6.6" />
        <path d="M18 44l12-12h11l5 12" />
        <path d="M30 32l-5 12" />
        <path d="M41 32l1-5" />
        <path d="M38 27h7" />
        <path d="M27 31h6" strokeWidth="3.4" />
      </g>
      <circle cx="18" cy="44" r="1.6" fill="#ffb020" />
    </svg>
  );
}

export function Wordmark({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  return (
    <span className="flex items-center gap-2">
      <BrandMark size={34} />
      <span
        className={cn(
          'font-display text-[22px] font-semibold tracking-tight',
          tone === 'light' ? 'text-cream' : 'text-ink',
        )}
      >
        {APP_NAME}<span className="text-mango">.</span>
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'ink' | 'outline' | 'ghost' | 'danger' | 'soft';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-mango text-ink hover:bg-mango-600 active:bg-mango-600 shadow-[0_10px_24px_-12px_rgba(255,176,32,0.9)]',
  ink: 'bg-ink text-cream hover:bg-ink-700 active:bg-ink-800',
  outline: 'border border-line bg-white text-ink hover:border-ink/25 hover:bg-cream',
  ghost: 'text-ink hover:bg-ink/[0.06]',
  danger: 'bg-danger text-white hover:bg-[#b93b3b]',
  soft: 'bg-mango-100 text-ink hover:bg-[#ffe7b4]',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[13px] rounded-xl gap-1.5',
  md: 'h-11 px-4 text-sm rounded-2xl gap-2',
  lg: 'h-[52px] px-5 text-[15px] rounded-2xl gap-2',
  xl: 'h-14 px-6 text-base rounded-2xl gap-2.5',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  block,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        block && 'w-full',
        className,
      )}
    >
      {loading ? <Loader2 size={18} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */

const controlClass =
  'w-full rounded-2xl border border-line bg-white px-3.5 text-[15px] text-ink placeholder:text-muted/70 transition focus:border-teal focus:ring-4 focus:ring-teal/10 disabled:bg-cream-200/60 disabled:text-muted';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, trailing, className, ...props },
  ref,
) {
  return (
    <span className="relative block">
      {icon ? (
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">
          {icon}
        </span>
      ) : null}
      <input
        {...props}
        ref={ref}
        className={cn(
          controlClass,
          'h-12',
          Boolean(icon) && 'pl-10',
          Boolean(trailing) && 'pr-11',
          className,
        )}
      />
      {trailing ? (
        <span className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</span>
      ) : null}
    </span>
  );
});

export function PasswordInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      className={className}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-cream"
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      }
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} className={cn(controlClass, 'min-h-[88px] resize-none py-3', className)} />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(controlClass, 'h-12 appearance-none pr-9', className)}>
      {children}
    </select>
  );
}

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, children, className }: FieldProps) {
  return (
    <label className={cn('block', className)}>
      {label ? (
        <span className="mb-1.5 flex items-center gap-1 text-[11.5px] font-semibold uppercase tracking-[0.13em] text-muted">
          {label}
          {required ? <span className="text-danger">*</span> : null}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="mt-1.5 block text-[12.5px] font-medium text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[12.5px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-40',
        checked ? 'bg-success' : 'bg-ink/20',
      )}
    >
      <span
        className={cn(
          'absolute h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex gap-1 overflow-x-auto rounded-2xl border border-line bg-white p-1 no-scrollbar',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-semibold transition-colors',
              size === 'sm' ? 'h-8 px-3 text-[12.5px]' : 'h-10 px-3.5 text-[13.5px]',
              active ? 'bg-ink text-cream' : 'text-muted hover:text-ink',
            )}
          >
            {option.label}
            {typeof option.count === 'number' ? (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10.5px] font-bold',
                  active ? 'bg-mango text-ink' : 'bg-cream-200 text-muted',
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'rounded-3xl border border-line/80 bg-white p-4 text-left shadow-[0_1px_0_rgba(8,33,31,0.03)]',
        onClick && 'w-full transition hover:border-ink/20 hover:shadow-lift',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Badge({
  children,
  tone = 'muted',
  className,
}: {
  children: ReactNode;
  tone?: 'muted' | 'mango' | 'teal' | 'success' | 'danger' | 'ink';
  className?: string;
}) {
  const tones = {
    muted: 'bg-cream-200 text-muted',
    mango: 'bg-mango-100 text-[#8a5c00]',
    teal: 'bg-teal-100 text-teal-700',
    success: 'bg-success-100 text-success',
    danger: 'bg-danger-100 text-danger',
    ink: 'bg-ink text-cream',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: RideStatus | string }) {
  const tone = statusTone(status);
  const toneMap = {
    mango: 'bg-mango-100 text-[#8a5c00]',
    teal: 'bg-teal-100 text-teal-700',
    success: 'bg-success-100 text-success',
    danger: 'bg-danger-100 text-danger',
    muted: 'bg-cream-200 text-muted',
  };
  const dot = {
    mango: 'bg-mango-600',
    teal: 'bg-teal',
    success: 'bg-success',
    danger: 'bg-danger',
    muted: 'bg-muted',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none',
        toneMap[tone],
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dot[tone])} />
      {statusLabel(status)}
    </span>
  );
}

export function Avatar({
  name,
  photoUrl,
  size = 44,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        className={cn('shrink-0 rounded-full object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-ink font-display font-semibold text-mango',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.34) }}
      aria-hidden="true"
    >
      {initials || 'A'}
    </span>
  );
}

/** Loads a protected upload (rider documents) with the bearer token. */
export function AuthImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setFailed(false);
    fetchPrivateImage(src)
      .then((value) => {
        objectUrl = value;
        if (!cancelled) setUrl(value);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (failed) {
    return (
      <span
        className={cn(
          'grid place-items-center rounded-xl bg-cream-200 text-[11px] text-muted',
          className,
        )}
      >
        Preview unavailable
      </span>
    );
  }
  if (!url) {
    return <span className={cn('animate-pulse rounded-xl bg-cream-200', className)} />;
  }
  return <img src={url} alt={alt} className={cn('object-cover', className)} />;
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('animate-spin text-teal', className)} />;
}

export function FullPageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-3 text-muted">
      <span className="relative grid h-12 w-12 place-items-center">
        <span className="absolute inset-0 rounded-full border-2 border-line" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-teal" />
      </span>
      <p className="text-[13px] font-medium">{label}</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn('block animate-pulse rounded-2xl bg-cream-200', className)} />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-line bg-white/60 px-6 py-10 text-center',
        className,
      )}
    >
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-cream text-teal">{icon}</span>
      <div>
        <p className="font-display text-[16px] font-semibold text-ink">{title}</p>
        {body ? <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-muted">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overlays                                                            */
/* ------------------------------------------------------------------ */

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'bottom',
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'bottom' | 'center';
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
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

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[70] flex justify-center',
        variant === 'bottom' ? 'items-end sm:items-center' : 'items-center',
      )}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Dialog'}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/55 backdrop-blur-[2px] animate-fade"
      />
      <div
        ref={panelRef}
        className={cn(
          'relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden bg-cream shadow-soft',
          variant === 'bottom'
            ? 'rounded-t-[28px] sm:max-w-lg sm:rounded-[28px]'
            : 'mx-4 max-w-md rounded-[28px]',
          'animate-slide-up sm:animate-rise',
          className,
        )}
      >
        {variant === 'bottom' ? (
          <span className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-ink/15 sm:hidden" />
        ) : null}
        {title ? (
          <div className="flex items-start gap-3 px-5 pb-3 pt-4">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-[19px] font-semibold text-ink">{title}</h2>
              {description ? (
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>
              ) : null}
            </div>
            <IconButton
              label="Close"
              onClick={onClose}
              className="shrink-0 bg-ink/[0.06] text-ink hover:bg-ink/[0.12]"
            >
              <X size={18} />
            </IconButton>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-1">{children}</div>
        {footer ? <div className="safe-bottom border-t border-line bg-cream px-5 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} variant="center" className="max-w-sm">
      <div className="pb-1 pt-5 sm:pt-2">
        <h2 className="font-display text-[19px] font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{body}</p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" block onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            block
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

export function SectionTitle({
  title,
  action,
  className,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <h2 className="font-display text-[15px] font-semibold text-ink">{title}</h2>
      {action}
    </div>
  );
}

export function DetailRow({
  label,
  value,
  strong,
  className,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 text-[13px]', className)}>
      <span className="text-muted">{label}</span>
      <span className={cn('text-right text-ink', strong ? 'font-semibold' : 'font-medium')}>
        {value}
      </span>
    </div>
  );
}
