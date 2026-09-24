'use client';

import { useState } from 'react';
import type { ClaimPayload, DraftPayload } from '@/lib/run-payload';
import { Badge } from '@/components/ui/badge';

const borderByVerdict: Record<string, string> = {
  SUPPORTED: 'border-l-[var(--success)]',
  PARTIAL: 'border-l-[var(--warning)]',
  UNSUPPORTED: 'border-l-[var(--danger)]',
};

export function ResumePreview({
  drafts,
  claims,
  contactName,
}: {
  drafts: DraftPayload[];
  claims: ClaimPayload[];
  contactName: string;
}) {
  const [iteration, setIteration] = useState<number | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);

  if (drafts.length === 0) {
    return <p className="text-xs text-[var(--muted)]">No draft yet — generation in progress…</p>;
  }

  const currentIteration = iteration ?? drafts[drafts.length - 1].iteration;
  const draft = drafts.find((d) => d.iteration === currentIteration) ?? drafts[0];
  const claimsForDraft = claims.filter((c) => c.draftId === draft.id);
  const verdictBySource = new Map(
    claimsForDraft
      .filter((c) => c.text.length > 0)
      .map((c) => [c.text.trim().toLowerCase(), c.verdict]),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-xs">
        <label className="text-[var(--muted)]">
          Iteration
          <select
            value={currentIteration}
            onChange={(e) => setIteration(Number(e.target.value))}
            className="ml-2 h-8 rounded-md border border-[var(--border)] bg-[var(--card)] px-2"
          >
            {drafts.map((d) => (
              <option key={d.iteration} value={d.iteration}>
                iteration {d.iteration} (score {d.score})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[var(--muted)]">
          <input
            type="checkbox"
            checked={showAnnotations}
            onChange={(e) => setShowAnnotations(e.target.checked)}
          />
          show annotations
        </label>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-sm">
        <div className="text-center">
          <div className="font-semibold">{contactName}</div>
          {!showAnnotations && <div className="text-xs text-[var(--muted)]">plain ATS-style view</div>}
        </div>
        <div className="mt-6 flex flex-col gap-5">
          {draft.sections.map((section) => (
            <div key={section.section}>
              <div className="mb-2 border-b border-[var(--border)] pb-1 text-sm font-semibold uppercase tracking-wide">
                {section.section}
              </div>
              <ul className="flex flex-col gap-2">
                {section.bullets.map((bullet, i) => {
                  const verdict = verdictBySource.get(bullet.text.trim().toLowerCase());
                  return (
                    <li
                      key={i}
                      className={`border-l-2 pl-3 text-sm ${
                        showAnnotations && verdict ? borderByVerdict[verdict] ?? 'border-l-transparent' : 'border-l-transparent'
                      }`}
                    >
                      {bullet.text}
                      {showAnnotations && (
                        <span className="ml-2 inline-flex items-center gap-1 align-middle">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {bullet.sourceItemId}
                          </Badge>
                          {verdict && (
                            <Badge
                              variant={
                                verdict === 'SUPPORTED' ? 'success' : verdict === 'PARTIAL' ? 'warning' : 'danger'
                              }
                              className="text-[10px]"
                            >
                              {verdict}
                            </Badge>
                          )}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
