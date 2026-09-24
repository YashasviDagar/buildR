'use client';

import { useState } from 'react';
import type { ClaimPayload, DraftPayload } from '@/lib/run-payload';
import { VerdictBadge, VerdictDot } from '@/components/verdict-badge';
import { Badge } from '@/components/ui/badge';

export function ClaimTable({
  claims,
  drafts,
}: {
  claims: ClaimPayload[];
  drafts: DraftPayload[];
}) {
  const [filter, setFilter] = useState<'all' | 'SUPPORTED' | 'PARTIAL' | 'UNSUPPORTED'>('all');
  const visible = claims.filter((c) => filter === 'all' || c.verdict === filter);

  const counts = {
    all: claims.length,
    SUPPORTED: claims.filter((c) => c.verdict === 'SUPPORTED').length,
    PARTIAL: claims.filter((c) => c.verdict === 'PARTIAL').length,
    UNSUPPORTED: claims.filter((c) => c.verdict === 'UNSUPPORTED').length,
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 text-xs">
        {(['all', 'SUPPORTED', 'PARTIAL', 'UNSUPPORTED'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 ${
              filter === f
                ? 'border-[var(--accent)] text-[var(--foreground)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">
          {claims.length === 0 ? 'No claims logged yet — waiting for verification.' : 'No claims match this filter.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((claim) => {
            const iteration = drafts.find((d) => d.id === claim.draftId)?.iteration ?? '?';
            return (
              <details
                key={claim.id}
                className="group rounded-md border border-[var(--border)] bg-[var(--card)] px-4 py-3"
              >
                <summary className="flex cursor-pointer items-center gap-3 text-sm">
                  <VerdictDot verdict={claim.verdict} />
                  <VerdictBadge verdict={claim.verdict} />
                  <Badge variant="outline" className="font-mono">
                    it {iteration} · {claim.section} · {claim.sourceItemId}
                  </Badge>
                  <span className="truncate text-[var(--foreground)]">
                    {claim.text.length > 90 ? claim.text.slice(0, 77) + '…' : claim.text}
                  </span>
                </summary>
                <div className="mt-3 flex flex-col gap-2 border-t border-[var(--border)] pt-3 text-xs">
                  <div className="text-[var(--foreground)]">{claim.text}</div>
                  <div className="text-[var(--muted)]">{claim.justification}</div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
