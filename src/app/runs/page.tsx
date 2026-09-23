import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { listRuns } from '@/lib/run-payload.js';

export const dynamic = 'force-dynamic';

export default function RunsPage() {
  const runList = listRuns();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">All runs</h1>
      {runList.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No runs yet — start one from the dashboard.</p>
      ) : (
        <table className="text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
              <th className="py-2 pr-4">Run</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Score</th>
              <th className="py-2 pr-4">Iters</th>
              <th className="py-2">Started</th>
            </tr>
          </thead>
          <tbody>
            {runList.map((run) => (
              <tr key={run.id} className="border-b border-[var(--border)]/50">
                <td className="py-2 pr-4">
                  <Link href={`/runs/${run.id}`} className="font-mono text-xs text-[var(--accent)] hover:underline">
                    {run.id}
                  </Link>
                </td>
                <td className="py-2 pr-4">
                  {run.status === 'running' ? (
                    <Badge variant="accent">running</Badge>
                  ) : run.status === 'failed' ? (
                    <Badge variant="danger">failed</Badge>
                  ) : run.converged ? (
                    <Badge variant="success">{run.stopReason ?? 'done'}</Badge>
                  ) : (
                    <Badge variant="warning">max_iterations</Badge>
                  )}
                </td>
                <td className="py-2 pr-4">{run.finalScore ?? '—'}</td>
                <td className="py-2 pr-4">{run.finalIteration ?? '—'}</td>
                <td className="py-2 text-xs text-[var(--muted)]">{new Date(run.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
