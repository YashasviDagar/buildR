import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db } from '@/db/client.js';
import { jobDescriptions } from '@/db/schema.js';
import { parseJd } from '@/lib/agents/jd-parser.js';
import { listJds } from '@/lib/run-payload.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ jds: listJds() });
}

export async function POST(request: Request) {
  let body: { rawText?: string };
  try {
    body = (await request.json()) as { rawText?: string };
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const rawText = body.rawText?.trim();
  if (!rawText) {
    return NextResponse.json({ error: 'rawText is required' }, { status: 400 });
  }

  let parsed;
  try {
    ({ parsed } = await parseJd(rawText));
  } catch (err) {
    return NextResponse.json({ error: `jd parsing failed: ${(err as Error).message}` }, { status: 502 });
  }

  const id = nanoid();
  db.insert(jobDescriptions).values({ id, rawText, parsedJson: JSON.stringify(parsed) }).run();
  return NextResponse.json({ id, parsed }, { status: 201 });
}
