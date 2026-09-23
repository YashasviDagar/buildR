import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import type { ScoreBreakdown } from '@/lib/scoring/index.js';

export function KeywordCoveragePanel({ breakdown }: { breakdown?: ScoreBreakdown }) {
  if (!breakdown) {
    return (
      <Card>
        <CardTitle className="mb-3">Must-have keyword coverage</CardTitle>
        <p className="text-xs text-[var(--muted)]">waiting for the first score…</p>
      </Card>
    );
  }
  return (
    <Card>
      <CardTitle className="mb-3">Must-have keyword coverage</CardTitle>
      <div className="flex flex-col gap-3 text-xs">
        <div>
          <div className="mb-1 text-[var(--muted)]">Matched</div>
          <div className="flex flex-wrap gap-1.5">
            {breakdown.mustMatched.map((k) => (
              <Badge key={k} variant="success">
                {k}
              </Badge>
            ))}
            {breakdown.mustMatched.length === 0 && <span className="text-[var(--muted)]">none</span>}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[var(--muted)]">Missed (why the score is capped)</div>
          <div className="flex flex-wrap gap-1.5">
            {breakdown.mustMissed.map((k) => (
              <Badge key={k} variant="danger">
                {k}
              </Badge>
            ))}
            {breakdown.mustMissed.length === 0 && <span className="text-[var(--muted)]">none</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}
