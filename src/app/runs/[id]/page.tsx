import { getRunPayload } from '@/lib/run-payload.js';
import { RunDetail } from '@/components/run-detail';

export const dynamic = 'force-dynamic';

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = getRunPayload(id);
  if (!payload) {
    return <p className="text-sm text-[var(--danger)]">Run {id} not found.</p>;
  }

  return (
    <div className="flex max-w-6xl flex-col gap-2">
      <p className="text-xs text-[var(--muted)]">
        {payload.profileName} → {payload.jdTitle}
      </p>
      <RunDetail initial={payload} runId={id} />
    </div>
  );
}
