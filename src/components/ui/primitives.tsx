import type { ReactNode } from 'react';

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function Card({
  children, className, padded = true, as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return (
    <Tag
      className={cn('rounded-xl border', padded && 'p-5', className)}
      style={{ background: 'var(--surface-1)', boxShadow: 'var(--shadow-sm)' }}
    >
      {children}
    </Tag>
  );
}

export type StatusTone = 'good' | 'warning' | 'serious' | 'critical' | 'neutral' | 'accent';

const TONE_VARS: Record<StatusTone, { fg: string; bg: string }> = {
  good: { fg: 'var(--status-good)', bg: 'var(--status-good-soft)' },
  warning: { fg: 'var(--status-warning)', bg: 'var(--status-warning-soft)' },
  serious: { fg: 'var(--status-serious)', bg: 'var(--status-serious-soft)' },
  critical: { fg: 'var(--status-critical)', bg: 'var(--status-critical-soft)' },
  neutral: { fg: 'var(--text-secondary)', bg: 'var(--surface-2)' },
  accent: { fg: 'var(--accent)', bg: 'var(--accent-soft)' },
};

/**
 * Status is never carried by colour alone — every badge ships an icon or a
 * text label alongside the hue.
 */
export function Badge({
  children, tone = 'neutral', icon, className,
}: {
  children: ReactNode;
  tone?: StatusTone;
  icon?: ReactNode;
  className?: string;
}) {
  const vars = TONE_VARS[tone];
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', className)}
      style={{ color: tone === 'neutral' ? 'var(--text-secondary)' : vars.fg, background: vars.bg }}
    >
      {icon}
      {children}
    </span>
  );
}

export function StatusIcon({ tone }: { tone: StatusTone }) {
  const common = { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true as const };
  if (tone === 'good') {
    return (
      <svg {...common} fill="none"><path d="M2.5 6.5 5 9l4.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    );
  }
  if (tone === 'critical') {
    return (
      <svg {...common} fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
    );
  }
  if (tone === 'warning' || tone === 'serious') {
    return (
      <svg {...common} fill="none"><path d="M6 2v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="6" cy="9.5" r="1" fill="currentColor" /></svg>
    );
  }
  return <svg {...common} fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

export function Button({
  children, variant = 'primary', size = 'md', type = 'button', className, ...rest
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizes = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
  };
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--text-primary)', color: 'var(--text-inverse)' },
    secondary: { background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)' },
    ghost: { background: 'transparent', color: 'var(--text-secondary)' },
  };
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all',
        'disabled:cursor-not-allowed disabled:opacity-55 active:scale-[0.985]',
        sizes[size],
        className,
      )}
      style={styles[variant]}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Field({
  label, hint, error, children, required,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-1.5 text-sm font-medium">
        {label}
        {required && <span style={{ color: 'var(--status-critical)' }} aria-hidden>*</span>}
        {hint && <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>{hint}</span>}
      </span>
      {children}
      {error && (
        <span className="mt-1 block text-xs" style={{ color: 'var(--status-critical)' }} role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]';

export const inputStyle: React.CSSProperties = {
  background: 'var(--surface-0)',
  color: 'var(--text-primary)',
};

export function SectionHeading({
  eyebrow, title, description, id,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  id?: string;
}) {
  return (
    <div className="mb-5" id={id}>
      {eyebrow && (
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {eyebrow}
        </p>
      )}
      <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
      {description && (
        <p className="mt-1.5 max-w-2xl text-sm" style={{ color: 'var(--text-secondary)' }}>{description}</p>
      )}
    </div>
  );
}

/** Marks any figure we could not measure, rather than silently omitting it. */
export function NotMeasured({ reason }: { reason: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs"
      style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
      title={reason}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.6" />
      </svg>
      Not measured
    </span>
  );
}
