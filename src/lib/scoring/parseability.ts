import { hasHtmlTags, looksLikeTable } from '../tokenize.js';
import { SECTION_ALIASES as SECTION_ALIASES_FALLBACK } from './structure.js';

export interface ParseabilityScore {
  score: number; // 0-100
  issues: string[];
}

// Simulated ATS plain-text parse. Drafts are structured JSON rendered to text
// deterministically, so these checks run over the exact string an ATS would see.
export function parseabilityScore(draftText: string): ParseabilityScore {
  const issues: string[] = [];
  const lines = draftText.split(/\r?\n/);
  let passed = 0;
  let total = 0;

  // 1. No table/column layout artifacts.
  total++;
  if (!looksLikeTable(draftText)) {
    passed++;
  } else {
    issues.push('pipe/tab column layout detected — ATS parsers misread columns');
  }

  // 2. No embedded HTML tags.
  total++;
  if (!hasHtmlTags(draftText)) {
    passed++;
  } else {
    issues.push('HTML tags present — not plain text');
  }

  // 3. Bullet markers consistent (at most one dominant marker style).
  total++;
  const markers = new Set<string>();
  for (const line of lines) {
    const m = line.trim().match(/^([-*•‣▪◦·])\s+/);
    if (m) markers.add(m[1]);
  }
  if (markers.size <= 1) {
    passed++;
  } else {
    issues.push(`mixed bullet markers: ${[...markers].join(' ')}`);
  }

  // 4. High proportion of plain ASCII lines.
  total++;
  const nonAsciiLines = lines.filter((line) => /[^\x00-\x7F]/.test(line) && line.trim().length > 0).length;
  const asciiRatio = lines.length === 0 ? 1 : 1 - nonAsciiLines / lines.length;
  if (asciiRatio >= 0.95) {
    passed++;
  } else {
    issues.push('more than 5% of lines contain non-ASCII glyphs');
  }

  // 5. At least one recognizable section header for the ATS to anchor on.
  total++;
  const headers = lines.map((line) => line.trim().replace(/[:\-–—]+$/, '').trim().toLowerCase());
  const hasHeader = headers.some((h) => SECTION_ALIASES_FALLBACK.some((s) => s.aliases.includes(h)));
  if (hasHeader) {
    passed++;
  } else {
    issues.push('no recognizable section header');
  }

  // 6. No suspiciously long single-line rows (column data squashed onto one line).
  total++;
  const longLines = lines.filter((line) => line.length > 400).length;
  if (longLines === 0) {
    passed++;
  } else {
    issues.push(`${longLines} line(s) exceed 400 chars — possible squashed columns`);
  }

  return { score: Math.round((passed / total) * 100), issues };
}
