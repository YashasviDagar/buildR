import { NextResponse } from 'next/server';
import { enhanceText, type EnhanceKind } from '@/lib/agents/enhancer';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { kind?: EnhanceKind; text?: string; context?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  if (body.kind !== 'summary' && body.kind !== 'bullets') {
    return NextResponse.json({ error: 'kind must be summary or bullets' }, { status: 400 });
  }
  try {
    return NextResponse.json({ text: await enhanceText(body.kind, text, body.context) });
  } catch (err) {
    return NextResponse.json({ error: `enhance failed: ${(err as Error).message}` }, { status: 502 });
  }
}
