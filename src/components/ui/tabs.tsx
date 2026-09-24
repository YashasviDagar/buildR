'use client';

import * as React from 'react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem {
  value: string;
  label: string;
  content: React.ReactNode;
}

export function Tabs({ items, className }: { items: TabItem[]; className?: string }) {
  const [active, setActive] = useState(items[0]?.value);
  const current = items.find((i) => i.value === active) ?? items[0];
  return (
    <div className={className}>
      <div className="flex gap-1 border-b border-[var(--border)]">
        {items.map((item) => (
          <button
            key={item.value}
            onClick={() => setActive(item.value)}
            className={cn(
              'rounded-t-md px-4 py-2 text-sm',
              item.value === current?.value
                ? 'border-b-2 border-[var(--accent)] font-medium text-[var(--foreground)]'
                : 'text-[var(--muted)] hover:text-[var(--foreground)]',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="pt-4">{current?.content}</div>
    </div>
  );
}
