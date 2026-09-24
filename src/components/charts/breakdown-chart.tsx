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
import type { DraftPayload } from '@/lib/run-payload';

const SERIES = [
  { key: 'keywordMust', name: 'must keywords', color: '#3b82f6' },
  { key: 'keywordNice', name: 'nice keywords', color: '#60a5fa' },
  { key: 'structure', name: 'structure', color: '#10b981' },
  { key: 'parseability', name: 'parseability', color: '#a78bfa' },
  { key: 'semantic', name: 'semantic', color: '#f59e0b' },
] as const;

export function BreakdownChart({ drafts }: { drafts: DraftPayload[] }) {
  if (drafts.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={drafts} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
        <XAxis dataKey="iteration" stroke="#6b7280" tick={{ fontSize: 12 }} tickLine={false} />
        <YAxis domain={[0, 100]} stroke="#6b7280" tick={{ fontSize: 12 }} tickLine={false} />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }}
          labelFormatter={(label) => `Iteration ${label}`}
        />
        {SERIES.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
