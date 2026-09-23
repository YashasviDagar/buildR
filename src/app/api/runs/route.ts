import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db } from '@/db/client.js';
import { runs } from '@/db/schema.js';
import { runPipelineWithExistingRun } from '@/lib/orchestrator.js';
import { listRuns } from '@/lib/run-payload.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ runs: listRuns() });
}

export async function POST(request: Request) {
  let body: { profileId?: string; jdId?: string };
  try {
    body = (await request.json()) as { profileId?: string; jdId?: string };
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { profileId, jdId } = body;
  if (!profileId || !jdId) {
    return NextResponse.json({ error: 'profileId and jdId are required' }, { status: 400 });
  }

  // Pre-create the run row so the detail page can poll immediately; the
  // pipeline runs fire-and-forget and fills it in.
  const runId = nanoid();
  db.insert(runs).values({ id: runId, profileId, jdId, status: 'running' }).run();
  void runPipelineWithExistingRun(runId, profileId, jdId).catch(() => undefined);

  return NextResponse.json({ runId }, { status: 202 });
}
