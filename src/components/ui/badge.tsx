import { cn } from '@/lib/utils';

const variants = {
  default: 'bg-[var(--card)] text-[var(--foreground)] border-[var(--border)]',
  outline: 'bg-transparent border-[var(--border)] text-[var(--muted)]',
  success: 'bg-[var(--success)]/15 border-[var(--success)] text-[var(--success)]',
  warning: 'bg-[var(--warning)]/15 border-[var(--warning)] text-[var(--warning)]',
  danger: 'bg-[var(--danger)]/15 border-[var(--danger)] text-[var(--danger)]',
  accent: 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)]',
} as const;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variants;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
