'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DraftPayload } from '@/lib/run-payload';

export function ScoreLineChart({ drafts }: { drafts: DraftPayload[] }) {
  if (drafts.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={drafts} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
        <XAxis dataKey="iteration" stroke="#6b7280" tick={{ fontSize: 12 }} tickLine={false} />
        <YAxis domain={[0, 100]} stroke="#6b7280" tick={{ fontSize: 12 }} tickLine={false} />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }}
          labelFormatter={(label) => `Iteration ${label}`}
        />
        <Line
          type="monotone"
          dataKey="score"
          name="ATS score"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
