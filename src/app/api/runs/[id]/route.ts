import { NextResponse } from 'next/server';
import { getRunPayload } from '@/lib/run-payload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const payload = getRunPayload(id);
  if (!payload) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }
  return NextResponse.json(payload);
}
