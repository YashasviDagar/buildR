import Link from 'next/link';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RunLauncher } from '@/components/run-launcher';
import { listRuns } from '@/lib/run-payload.js';

export const dynamic = 'force-dynamic';

function statusBadge(status: string, converged: boolean | null, stopReason: string | null) {
  if (status === 'running') return <Badge variant="accent">running</Badge>;
  if (status === 'failed') return <Badge variant="danger">failed</Badge>;
  return converged ? (
    <Badge variant="success">converged{stopReason ? ` · ${stopReason}` : ''}</Badge>
  ) : (
    <Badge variant="warning">hit cap</Badge>
  );
}

export default function Dashboard() {
  const runList = listRuns();
  const recent = runList.slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">buildR</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Agentic ATS resume optimization — every claim traceable to the candidate&apos;s profile.
        </p>
      </div>

      <Card>
        <CardTitle className="mb-3">Start a new run</CardTitle>
        <RunLauncher />
      </Card>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--muted)]">Recent runs</h2>
          <Link href="/runs" className="text-xs text-[var(--accent)] hover:underline">
            view all
          </Link>
        </div>
        {recent.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--muted)]">
              No runs yet. Import a profile, parse a job description, then start a run.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((run) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm hover:border-[var(--accent)]"
              >
                <span className="font-mono text-xs">{run.id}</span>
                <span className="flex items-center gap-3">
                  {run.finalScore !== null && <Badge variant="outline">score {run.finalScore}</Badge>}
                  {statusBadge(run.status, run.converged, run.stopReason)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
