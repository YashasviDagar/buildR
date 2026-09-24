import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[280px] w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm font-mono placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
