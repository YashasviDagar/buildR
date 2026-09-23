import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db } from '@/db/client.js';
import { profiles } from '@/db/schema.js';
import { normalizeProfile } from '@/lib/profile/normalize.js';
import { listProfiles } from '@/lib/run-payload.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  let structured;
  try {
    structured = normalizeProfile(body);
  } catch (err) {
    return NextResponse.json({ error: `profile validation failed: ${(err as Error).message}` }, { status: 422 });
  }

  const id = nanoid();
  db.insert(profiles).values({ id, rawText: null, structuredJson: JSON.stringify(structured) }).run();
  return NextResponse.json({ id }, { status: 201 });
}
