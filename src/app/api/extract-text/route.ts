import { NextResponse } from 'next/server';
import { extractText, getDocumentProxy } from 'unpdf';

export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024;

// Turns an uploaded resume (.pdf or .txt) into plain text for the profile parser.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no file uploaded' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file is larger than 5 MB' }, { status: 413 });
  }

  const name = file.name.toLowerCase();
  try {
    if (name.endsWith('.pdf')) {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const { text } = await extractText(pdf, { mergePages: true });
      if (!text.trim()) {
        return NextResponse.json(
          { error: 'no text found in this PDF (scanned image?). Paste the text instead.' },
          { status: 422 },
        );
      }
      return NextResponse.json({ text });
    }
    if (name.endsWith('.txt') || name.endsWith('.md')) {
      return NextResponse.json({ text: await file.text() });
    }
    return NextResponse.json({ error: 'upload a .pdf or .txt file' }, { status: 415 });
  } catch (err) {
    return NextResponse.json({ error: `could not read file: ${(err as Error).message}` }, { status: 422 });
  }
}
