import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import type { FinalResume, ResumeSection } from './final-resume';

// Text-only PDF using standard fonts. Templates change colors, alignment and
// heading style. The Sidebar template adds a second column; its main column
// is written first so text extraction reads summary and experience before the
// contact/skills sidebar.

const PAGE = { w: 595.28, h: 841.89 }; // A4
const MARGIN = 50;
const BAND_H = 96;
const SIDE_W = 142;
const PHOTO = 78;

export type PdfTemplate = 'classic' | 'modern' | 'minimal' | 'sidebar';
export interface PdfOptions {
  template?: PdfTemplate;
  accent?: string; // #rrggbb
}

// Helvetica only encodes WinAnsi: map smart punctuation, drop the rest.
function clean(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E¡-ÿ]/g, '');
}

// Split a word that is wider than the column (long emails, URLs) by characters.
function breakWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
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

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
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

function parseAccent(hex: string | undefined, fallback: RGB): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function buildResumePdf(
  resume: FinalResume,
  options: PdfOptions = {},
): Promise<Uint8Array> {
  const template = options.template ?? 'classic';
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.4, 0.4, 0.4);
  const accent = parseAccent(options.accent, ink);
  const white = rgb(1, 1, 1);
  const side = template === 'sidebar';

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${clean(resume.name)} - Resume`);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let photo: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null;
  if (resume.photo && (template === 'sidebar' || template === 'modern')) {
    try {
      photo = await pdf.embedPng(resume.photo.replace(/^data:image\/png;base64,/, ''));
    } catch {
      photo = null; // unreadable image: print the resume without it
    }
  }

  const firstPage = pdf.addPage([PAGE.w, PAGE.h]);
  let page: PDFPage = firstPage;
  let y = PAGE.h - MARGIN;
  let col = { x: MARGIN, w: PAGE.w - MARGIN * 2 };
  const mainX = MARGIN + SIDE_W + 26;
  let dividerOnNewPages = false;

  const drawDivider = (p: PDFPage, from: number) => {
    p.drawLine({
      start: { x: MARGIN + SIDE_W + 13, y: from },
      end: { x: MARGIN + SIDE_W + 13, y: MARGIN },
      thickness: 0.6,
      color: rgb(0.8, 0.8, 0.8),
    });
  };

  const ensure = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - MARGIN;
      if (dividerOnNewPages) drawDivider(page, PAGE.h - MARGIN);
    }
  };

  const draw = (
    text: string,
    opts: {
      font?: PDFFont;
      size?: number;
      indent?: number;
      align?: 'left' | 'center';
      gap?: number;
      marker?: boolean;
      color?: RGB;
    } = {},
  ) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10.5;
    const indent = opts.indent ?? 0;
    const color = opts.color ?? ink;
    const lead = size * 1.3;
    wrap(text, font, size, col.w - indent).forEach((line, i) => {
      ensure(lead);
      const w = font.widthOfTextAtSize(line, size);
      const x = opts.align === 'center' ? (PAGE.w - w) / 2 : col.x + indent;
      y -= lead;
      page.drawText(line, { x, y, size, font, color });
      if (opts.marker && i === 0) {
        page.drawText('-', { x: col.x + 3, y, size, font: regular, color });
      }
    });
    y -= opts.gap ?? 0;
  };

  const sectionHeading = (title: string) => {
    ensure(40);
    y -= 7;
    draw(title, { font: bold, size: side ? 10.5 : 11.5, color: template === 'minimal' ? ink : accent });
    if (template === 'classic' || template === 'modern') {
      page.drawLine({
        start: { x: col.x, y: y - 1 },
        end: { x: col.x + col.w, y: y - 1 },
        thickness: template === 'classic' ? 0.8 : 0.5,
        color: template === 'classic' ? accent : rgb(0.8, 0.8, 0.8),
      });
    }
    y -= 5;
  };

  const renderSection = (section: ResumeSection) => {
    sectionHeading(section.title);
    for (const entry of section.entries) {
      ensure(48);
      draw(entry.heading, { font: bold, size: 11 });
      if (entry.meta) draw(entry.meta, { size: 9.5, color: muted });
      for (const b of entry.bullets) draw(b, { indent: 14, marker: true, gap: 1.5 });
      y -= 5;
    }
    for (const l of section.lines ?? []) draw(l, { gap: 2 });
  };

  // --- header -------------------------------------------------------------
  const contactLine = resume.contact.join('  |  ');
  let sideTop = 0;

  if (template === 'modern') {
    page.drawRectangle({ x: 0, y: PAGE.h - BAND_H, width: PAGE.w, height: BAND_H, color: accent });
    let textX = MARGIN;
    if (photo) {
      page.drawImage(photo, { x: MARGIN, y: PAGE.h - BAND_H + 9, width: 78, height: 78 });
      textX = MARGIN + 92;
    }
    col = { x: textX, w: PAGE.w - MARGIN - textX };
    y = PAGE.h - 28;
    draw(resume.name, { font: bold, size: 22, color: white });
    if (resume.headline) draw(resume.headline, { size: 11, color: white });
    draw(contactLine, { size: 9, color: white });
    col = { x: MARGIN, w: PAGE.w - MARGIN * 2 };
    y = PAGE.h - BAND_H - 14;
  } else if (template === 'minimal') {
    draw(resume.name, { font: bold, size: 22, gap: 1 });
    if (resume.headline) draw(resume.headline, { size: 11, color: muted, gap: 1 });
    draw(contactLine, { size: 9.5, color: muted, gap: 8 });
  } else if (side) {
    let textX = MARGIN;
    if (photo) {
      page.drawImage(photo, { x: MARGIN, y: PAGE.h - MARGIN - PHOTO, width: PHOTO, height: PHOTO });
      textX = MARGIN + PHOTO + 18;
    }
    col = { x: textX, w: PAGE.w - MARGIN - textX };
    y = PAGE.h - MARGIN - (photo ? 14 : 0);
    draw(resume.name, { font: bold, size: 24, gap: 1 });
    if (resume.headline) draw(resume.headline.toUpperCase(), { size: 10, color: muted });
    sideTop = photo ? PAGE.h - MARGIN - PHOTO - 16 : y - 12;
  } else {
    draw(resume.name, { font: bold, size: 21, align: 'center', color: accent, gap: 1 });
    if (resume.headline) draw(resume.headline, { size: 11, align: 'center', color: muted, gap: 1 });
    draw(contactLine, { size: 9.5, align: 'center', gap: 6 });
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE.w - MARGIN, y },
      thickness: 1,
      color: accent,
    });
    y -= 4;
  }

  // --- body ---------------------------------------------------------------
  if (side) {
    const leftTitles = new Set(['EDUCATION', 'SKILLS']);
    const mainSections = resume.sections.filter((s) => !leftTitles.has(s.title));
    const leftSections = resume.sections.filter((s) => leftTitles.has(s.title));

    // Main column first (reading order), flowing across pages.
    col = { x: mainX, w: PAGE.w - MARGIN - mainX };
    y = sideTop;
    dividerOnNewPages = true;
    if (resume.summary) {
      sectionHeading('SUMMARY');
      draw(resume.summary, { gap: 4 });
    }
    mainSections.forEach(renderSection);
    dividerOnNewPages = false;

    // Sidebar on page 1.
    page = firstPage;
    drawDivider(firstPage, sideTop + 4);
    col = { x: MARGIN, w: SIDE_W };
    y = sideTop;
    if (resume.contact.length > 0) {
      sectionHeading('CONTACT');
      for (const c of resume.contact) draw(c, { size: 9.5, gap: 3 });
    }
    leftSections.forEach(renderSection);
  } else {
    if (resume.summary) {
      sectionHeading('SUMMARY');
      draw(resume.summary, { gap: 4 });
    }
    resume.sections.forEach(renderSection);
  }

  return pdf.save();
}
