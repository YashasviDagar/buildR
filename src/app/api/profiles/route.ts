import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db } from '@/db/client';
import { profiles } from '@/db/schema';
import { normalizeProfile } from '@/lib/profile/normalize';
import { parseProfileFromText } from '@/lib/agents/profile-parser';
import { listProfiles } from '@/lib/run-payload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ profiles: listProfiles() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { rawText, structuredJson } = (body ?? {}) as {
    rawText?: string;
    structuredJson?: unknown;
  };

  // Path 1: freeform resume text -> LLM structuring agent.
  if (typeof rawText === 'string' && rawText.trim().length > 0) {
    let parsed: Awaited<ReturnType<typeof parseProfileFromText>>;
    try {
      parsed = await parseProfileFromText(rawText);
    } catch (err) {
      return NextResponse.json({ error: `profile extraction failed: ${(err as Error).message}` }, { status: 502 });
    }
    const id = nanoid();
    db.insert(profiles).values({ id, rawText, structuredJson: JSON.stringify(parsed.profile) }).run();
    return NextResponse.json({ id }, { status: 201 });
  }

  // Path 2: structured JSON import (same contract as the CLI).
  let structured;
  try {
    structured = normalizeProfile(structuredJson);
  } catch (err) {
    return NextResponse.json({ error: `profile validation failed: ${(err as Error).message}` }, { status: 422 });
  }

  const id = nanoid();
  db.insert(profiles).values({ id, rawText: null, structuredJson: JSON.stringify(structured) }).run();
  return NextResponse.json({ id }, { status: 201 });
}
