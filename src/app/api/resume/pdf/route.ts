import { NextResponse } from 'next/server';
import { buildResumePdf, type PdfTemplate } from '@/lib/resume-pdf';
import type { FinalResume } from '@/lib/final-resume';

export const runtime = 'nodejs';

// Renders the builder's current resume to a downloadable PDF.
export async function POST(request: Request) {
  let body: { resume?: FinalResume; template?: PdfTemplate; accent?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.resume || typeof body.resume.name !== 'string' || !Array.isArray(body.resume.sections)) {
    return NextResponse.json({ error: 'resume is required' }, { status: 400 });
  }
  const template = ['classic', 'modern', 'minimal', 'sidebar'].includes(body.template ?? '')
    ? (body.template as PdfTemplate)
    : 'classic';

  const bytes = await buildResumePdf(body.resume, { template, accent: body.accent });
  const fileName = `${body.resume.name.replace(/[^a-z0-9]+/gi, '_')}_Resume.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
