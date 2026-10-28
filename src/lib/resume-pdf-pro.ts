import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { FinalResume, ResumeEntry, ResumeSection } from './final-resume';
import { clean } from './pdf-text';

// Standard resume layouts: single column, black on white, dates on the right,
// real bullets drawn as shapes (so no stray glyphs for ATS text extraction).
// Everything is scaled down automatically until it fits one page.

export type ProTemplate = 'professional' | 'compact' | 'executive';

interface Config {
  serif: boolean;
  base: number;
  name: number;
  head: number;
  lead: number;
  entryGap: number;
  sectionGap: number;
  center: boolean;
}

const CONFIG: Record<ProTemplate, Config> = {
  professional: { serif: true, base: 10.5, name: 26, head: 12.5, lead: 1.17, entryGap: 4, sectionGap: 8, center: true },
  compact: { serif: true, base: 9.6, name: 22, head: 11.5, lead: 1.12, entryGap: 2.5, sectionGap: 5, center: true },
  executive: { serif: false, base: 10, name: 23, head: 10.5, lead: 1.2, entryGap: 4, sectionGap: 9, center: false },
};

const W = 612; // US Letter
const H = 792;
const ML = 40;
const MR = 40;
const MT = 34;
const MB = 34;
const WIDTH = W - ML - MR;
const MIN_SCALE = 0.86;
const WORD_GAP = 0.06; // extra space width (em), closer to typeset spacing

interface Run {
  text: string;
  font: PDFFont;
}

// Break runs into lines at word boundaries, keeping each run's font.
function layoutRuns(runs: Run[], size: number, maxW: number): Run[][] {
  const lines: Run[][] = [[]];
  let w = 0;
  for (const run of runs) {
    for (const tok of clean(run.text).split(/(\s+)/)) {
      if (!tok) continue;
      const space = /^\s+$/.test(tok);
      const tw = run.font.widthOfTextAtSize(tok, size) + (space ? size * WORD_GAP : 0);
      if (!space && w + tw > maxW && lines[lines.length - 1].length > 0) {
        lines.push([]);
        w = 0;
      }
      const cur = lines[lines.length - 1];
      if (space && cur.length === 0) continue;
      cur.push({ text: tok, font: run.font });
      w += tw;
    }
  }
  return lines;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s/])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

async function render(
  resume: FinalResume,
  template: ProTemplate,
  scale: number,
): Promise<{ bytes: Uint8Array; pages: number }> {
  const c = CONFIG[template];
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${clean(resume.name)} - Resume`);
  const R = await pdf.embedFont(c.serif ? StandardFonts.TimesRoman : StandardFonts.Helvetica);
  const B = await pdf.embedFont(c.serif ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold);
  const I = await pdf.embedFont(c.serif ? StandardFonts.TimesRomanItalic : StandardFonts.HelveticaOblique);
  const ink = rgb(0.05, 0.05, 0.05);

  const base = c.base * scale;
  const lead = base * c.lead;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - MT;

  const ensure = (needed: number) => {
    if (y - needed < MB) {
      page = pdf.addPage([W, H]);
      y = H - MT;
    }
  };

  const drawRuns = (line: Run[], x: number, size: number) => {
    let cx = x;
    for (const r of line) {
      page.drawText(r.text, { x: cx, y, size, font: r.font, color: ink });
      cx += r.font.widthOfTextAtSize(r.text, size) + (/^\s+$/.test(r.text) ? size * WORD_GAP : 0);
    }
  };

  // Left runs (wrapping) with optional right-aligned text on the first line.
  const row = (left: Run[], right?: { text: string; font: PDFFont }, size = base, indent = 0) => {
    const rightText = right ? clean(right.text) : '';
    const rightW = right && rightText ? right.font.widthOfTextAtSize(rightText, size) : 0;
    const maxW = WIDTH - indent - (rightW ? rightW + 10 : 0);
    layoutRuns(left, size, maxW).forEach((line, i) => {
      ensure(size * c.lead);
      y -= size * c.lead;
      drawRuns(line, ML + indent, size);
      if (i === 0 && right && rightW) {
        page.drawText(rightText, { x: W - MR - rightW, y, size, font: right.font, color: ink });
      }
    });
  };

  const bullet = (text: string) => {
    const indent = 15 * scale;
    layoutRuns([{ text, font: R }], base, WIDTH - indent).forEach((line, i) => {
      ensure(lead);
      y -= lead;
      if (i === 0) {
        page.drawCircle({ x: ML + indent - 8 * scale, y: y + base * 0.3, size: 1.5 * scale, color: ink });
      }
      drawRuns(line, ML + indent, base);
    });
  };

  const smallCaps = (title: string, x: number, size: number, font: PDFFont) => {
    let cx = x;
    for (const word of titleCase(clean(title)).split(' ')) {
      const first = word.charAt(0);
      const rest = word.slice(1).toUpperCase();
      page.drawText(first, { x: cx, y, size, font, color: ink });
      cx += font.widthOfTextAtSize(first, size);
      if (rest) {
        page.drawText(rest, { x: cx, y, size: size * 0.8, font, color: ink });
        cx += font.widthOfTextAtSize(rest, size * 0.8);
      }
      cx += font.widthOfTextAtSize(' ', size);
    }
  };

  const sectionHead = (title: string) => {
    const size = c.head * scale;
    ensure(size * 2.6 + 12);
    y -= c.sectionGap * scale;
    y -= size * 1.05;
    if (c.serif) smallCaps(title, ML, size, B);
    else page.drawText(clean(title).toUpperCase(), { x: ML, y, size, font: B, color: ink });
    y -= 3 * scale;
    page.drawLine({
      start: { x: ML, y },
      end: { x: W - MR, y },
      thickness: c.serif ? 0.7 : 1.1,
      color: ink,
    });
    y -= 1.5 * scale;
  };

  const entry = (e: ResumeEntry) => {
    const p = e.parts ?? { primary: e.heading, right: e.meta };
    ensure(lead * 3);
    const left: Run[] = [{ text: p.primary, font: B }];
    if (p.note) {
      left.push({ text: ' | ', font: R }, { text: p.note, font: I });
    }
    if (p.secondary) {
      row(left, p.dates ? { text: p.dates, font: B } : undefined);
      row([{ text: p.secondary, font: I }], p.right ? { text: p.right, font: I } : undefined);
    } else {
      const right = p.dates ?? p.right;
      row(left, right ? { text: right, font: p.dates ? B : I } : undefined);
    }
    for (const b of e.bullets) bullet(b);
    y -= c.entryGap * scale;
  };

  const section = (s: ResumeSection) => {
    sectionHead(s.title);
    if (s.labeled && s.labeled.length > 0) {
      for (const l of s.labeled) {
        row(
          l.label
            ? [
                { text: `${l.label}: `, font: B },
                { text: l.text, font: R },
              ]
            : [{ text: l.text, font: R }],
          undefined,
          base,
          8 * scale,
        );
      }
      y -= 1;
    }
    s.entries.forEach(entry);
    if (!s.labeled) for (const l of s.lines ?? []) row([{ text: l, font: R }], undefined, base, 8 * scale);
  };

  // --- header -------------------------------------------------------------
  const nameSize = c.name * scale;
  y -= nameSize * 0.95;
  if (c.center) {
    // Small-caps name, centered.
    const parts = clean(resume.name)
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => ({ first: w.charAt(0).toUpperCase(), rest: w.slice(1).toUpperCase() }));
    const total =
      parts.reduce(
        (sum, w) => sum + R.widthOfTextAtSize(w.first, nameSize) + R.widthOfTextAtSize(w.rest, nameSize * 0.8),
        0,
      ) +
      R.widthOfTextAtSize(' ', nameSize) * (parts.length - 1);
    let cx = (W - total) / 2;
    for (const w of parts) {
      page.drawText(w.first, { x: cx, y, size: nameSize, font: R, color: ink });
      cx += R.widthOfTextAtSize(w.first, nameSize);
      page.drawText(w.rest, { x: cx, y, size: nameSize * 0.8, font: R, color: ink });
      cx += R.widthOfTextAtSize(w.rest, nameSize * 0.8) + R.widthOfTextAtSize(' ', nameSize);
    }
  } else {
    page.drawText(clean(resume.name), { x: ML, y, size: nameSize, font: B, color: ink });
  }

  const centerLines = (text: string, font: PDFFont, size: number) => {
    layoutRuns([{ text, font }], size, WIDTH).forEach((line) => {
      y -= size * c.lead;
      const w = line.reduce((sum, r) => sum + r.font.widthOfTextAtSize(r.text, size), 0);
      drawRuns(line, c.center ? (W - w) / 2 : ML, size);
    });
  };
  if (resume.headline) {
    y -= 2 * scale;
    centerLines(resume.headline, I, base);
  }
  y -= 1.5 * scale;
  centerLines(resume.contact.join(' | '), R, base * 0.97);

  // --- body ---------------------------------------------------------------
  if (resume.summary) {
    sectionHead('Summary');
    row([{ text: resume.summary, font: R }]);
  }
  resume.sections.forEach(section);

  return { bytes: await pdf.save(), pages: pdf.getPageCount() };
}

// Render at full size; if it spills onto a second page, shrink gradually until
// it fits one page (never below a readable size).
export async function buildProPdf(resume: FinalResume, template: ProTemplate): Promise<Uint8Array> {
  const first = await render(resume, template, 1);
  if (first.pages === 1) return first.bytes;
  for (let scale = 0.96; scale >= MIN_SCALE - 0.001; scale -= 0.02) {
    const attempt = await render(resume, template, scale);
    if (attempt.pages === 1) return attempt.bytes;
  }
  return first.bytes;
}
