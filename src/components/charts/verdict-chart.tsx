'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ClaimPayload, DraftPayload } from '@/lib/run-payload.js';

export function VerdictChart({
  drafts,
  claims,
}: {
  drafts: DraftPayload[];
  claims: ClaimPayload[];
}) {
  const data = drafts.map((d) => {
    const scoped = claims.filter((c) => c.draftId === d.id);
    return {
      iteration: `it ${d.iteration}`,
      supported: scoped.filter((c) => c.verdict === 'SUPPORTED').length,
      partial: scoped.filter((c) => c.verdict === 'PARTIAL').length,
      unsupported: scoped.filter((c) => c.verdict === 'UNSUPPORTED').length,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
        <XAxis dataKey="iteration" stroke="#6b7280" tick={{ fontSize: 12 }} tickLine={false} />
        <YAxis allowDecimals={false} stroke="#6b7280" tick={{ fontSize: 12 }} tickLine={false} />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="supported" stackId="v" name="SUPPORTED" fill="#10b981" isAnimationActive={false} />
        <Bar dataKey="partial" stackId="v" name="PARTIAL" fill="#f59e0b" isAnimationActive={false} />
        <Bar dataKey="unsupported" stackId="v" name="UNSUPPORTED" fill="#ef4444" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
