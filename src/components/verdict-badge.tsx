import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const variantByVerdict = {
  SUPPORTED: 'success',
  PARTIAL: 'warning',
  UNSUPPORTED: 'danger',
} as const;

export function VerdictBadge({ verdict, className }: { verdict: string; className?: string }) {
  return (
    <Badge variant={variantByVerdict[verdict as keyof typeof variantByVerdict] ?? 'default'} className={className}>
      {verdict}
    </Badge>
  );
}

export function VerdictDot({ verdict, className }: { verdict: string; className?: string }) {
  const color =
    verdict === 'SUPPORTED'
      ? 'bg-[var(--success)]'
      : verdict === 'PARTIAL'
        ? 'bg-[var(--warning)]'
        : 'bg-[var(--danger)]';
  return <span className={cn('inline-block h-2.5 w-2.5 rounded-full', color, className)} />;
}
