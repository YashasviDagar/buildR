'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { RunPayload } from '@/lib/run-payload';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { ScoreLineChart } from '@/components/charts/score-line';
import { BreakdownChart } from '@/components/charts/breakdown-chart';
import { VerdictChart } from '@/components/charts/verdict-chart';
import { ClaimTable } from '@/components/claim-table';
import { ResumePreview } from '@/components/resume-preview';
import { KeywordCoveragePanel } from '@/components/keyword-coverage';

const POLL_MS = 1500;

export function RunDetail({ initial, runId }: { initial: RunPayload; runId: string }) {
  const [payload, setPayload] = useState<RunPayload>(initial);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (payload.run.status !== 'running') return;
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`poll failed (${res.status})`);
        const next = (await res.json()) as RunPayload;
        if (alive.current) setPayload(next);
      } catch (err) {
        if (alive.current) setError((err as Error).message);
      }
    }, POLL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [payload]);

  const { run, drafts, claims } = payload;
  const latest = drafts[drafts.length - 1];

  return (
    <div className="flex flex-col gap-6">
      {/* Run header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Run {run.id.slice(0, 8)}</h1>
        {run.status === 'running' && <Badge variant="accent">running — polling every {POLL_MS / 1000}s</Badge>}
        {run.status === 'failed' && <Badge variant="danger">failed</Badge>}
        {run.status === 'done' && run.converged && <Badge variant="success">converged · {run.stopReason}</Badge>}
        {run.status === 'done' && !run.converged && <Badge variant="warning">stopped at cap · {run.stopReason}</Badge>}
        {run.finalScore !== null && (
          <span className="text-sm text-[var(--muted)]">
            final score <span className="font-semibold text-[var(--foreground)]">{run.finalScore}</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-2">ATS score per iteration</CardTitle>
          <ScoreLineChart drafts={drafts} />
          {drafts.length > 0 && (
            <table className="mt-3 w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--muted)]">
                  <th className="py-1">it</th>
                  <th className="py-1">score</th>
                  <th className="py-1">delta</th>
                  <th className="py-1">S/P/U</th>
                  <th className="py-1">verified</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.id}>
                    <td className="py-1">{d.iteration}</td>
                    <td className="py-1 font-medium">{d.score}</td>
                    <td className="py-1">{d.scoreDelta ?? '—'}</td>
                    <td className="py-1">{claims.filter((c) => c.draftId === d.id && c.verdict === 'SUPPORTED').length}/
                      {claims.filter((c) => c.draftId === d.id && c.verdict === 'PARTIAL').length}/
                      {claims.filter((c) => c.draftId === d.id && c.verdict === 'UNSUPPORTED').length}</td>
                    <td className="py-1">{d.iteration === 1 ? 'all' : 'new only'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card>
          <CardTitle className="mb-2">Claim verdicts per iteration</CardTitle>
          <VerdictChart drafts={drafts} claims={claims} />
        </Card>
      </div>

      <Card>
        <CardTitle className="mb-2">Score components per iteration</CardTitle>
        <BreakdownChart drafts={drafts} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardTitle className="mb-3">Claims log (evaluation data)</CardTitle>
            <ClaimTable claims={claims} drafts={drafts} />
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <KeywordCoveragePanel breakdown={latest?.breakdown} />
          <Card>
            <CardTitle className="mb-2">Links</CardTitle>
            <div className="flex flex-col gap-1 text-xs">
              <Link href={`/profiles/${run.profileId}`} className="text-[var(--accent)] hover:underline">
                view profile {run.profileId.slice(0, 8)}
              </Link>
              <Link href={`/jds/${run.jdId}`} className="text-[var(--accent)] hover:underline">
                view JD {run.jdId.slice(0, 8)}
              </Link>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardTitle className="mb-3">Resume preview (with claim annotations)</CardTitle>
        <ResumePreview
          drafts={drafts}
          claims={claims}
          contactName={payload.profileName}
        />
      </Card>

      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
