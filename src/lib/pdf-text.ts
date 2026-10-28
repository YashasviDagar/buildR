import type { PDFFont } from 'pdf-lib';

// Shared text helpers for the PDF renderers.

// Standard PDF fonts only encode WinAnsi: map smart punctuation, drop the rest.
export function clean(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/→/g, '->')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E¡-ÿ]/g, '');
}

// Split a word wider than the column (long emails, URLs) by characters.
export function breakWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const parts: string[] = [];
  let chunk = '';
  for (const ch of word) {
    if (chunk && font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
      parts.push(chunk);
      chunk = ch;
    } else {
      chunk += ch;
    }
  }
  if (chunk) parts.push(chunk);
  return parts;
}

export function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of clean(text).split(/\s+/).filter(Boolean)) {
    const pieces = font.widthOfTextAtSize(word, size) > maxWidth ? breakWord(word, font, size, maxWidth) : [word];
    for (const piece of pieces) {
      const next = line ? `${line} ${piece}` : piece;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        line = next;
      } else {
        if (line) lines.push(line);
        line = piece;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}
