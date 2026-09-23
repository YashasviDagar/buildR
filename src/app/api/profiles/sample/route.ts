import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const raw = readFileSync(resolve(process.cwd(), 'samples/profile-sample.json'), 'utf8');
    return NextResponse.json({ json: JSON.parse(raw) });
  } catch (err) {
    return NextResponse.json({ error: `sample unavailable: ${(err as Error).message}` }, { status: 500 });
  }
}
