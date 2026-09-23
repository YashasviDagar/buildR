import * as React from 'react';
import { cn } from '@/lib/utils';

const variants = {
  default: 'bg-[var(--accent)] text-white hover:opacity-90',
  outline: 'border border-[var(--border)] bg-transparent hover:bg-[var(--card)]',
  ghost: 'bg-transparent hover:bg-[var(--card)]',
  destructive: 'bg-[var(--danger)] text-white hover:opacity-90',
} as const;

const sizes = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 px-3 text-xs',
  lg: 'h-10 px-6',
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export function Button({ className, variant = 'default', size = 'default', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
