import { findEmail, findPhone, looksLikeTable, stemTokens } from '../tokenize.js';

export interface StructureScore {
  score: number; // 0-100
  checks: { name: string; passed: boolean }[];
}

export const SECTION_ALIASES: { canonical: string; aliases: string[] }[] = [
  { canonical: 'experience', aliases: ['experience', 'work experience', 'professional experience', 'employment', 'employment history'] },
  { canonical: 'projects', aliases: ['projects', 'selected projects', 'personal projects'] },
  { canonical: 'education', aliases: ['education', 'academic background', 'academics'] },
  { canonical: 'skills', aliases: ['skills', 'technical skills', 'technologies', 'core skills'] },
];

const SECTION_PENALTY = 12;
const ORDER_PENALTY = 10;
const CONTACT_EMAIL_PENALTY = 15;
const CONTACT_PHONE_PENALTY = 8;
const TABLE_PENALTY = 25;

// Structure score: standard sections present, in canonical order, contact info
// detectable, and no table/column layouts that break ATS parsers.
export function structureScore(draftText: string): StructureScore {
  const checks: { name: string; passed: boolean }[] = [];

  // Find which canonical sections appear as line headers and in what order.
  const found: { canonical: string; lineIndex: number }[] = [];
  const lines = draftText.split(/\r?\n/);
  lines.forEach((line, i) => {
    const header = line.trim().replace(/[:\-–—]+$/, '').trim().toLowerCase();
    for (const section of SECTION_ALIASES) {
      if (section.aliases.includes(header) && !found.some((f) => f.canonical === section.canonical)) {
        found.push({ canonical: section.canonical, lineIndex: i });
      }
    }
  });

  const missing = SECTION_ALIASES.filter((s) => !found.some((f) => f.canonical === s.canonical));
  let score = 100;

  for (const section of missing) {
    score -= SECTION_PENALTY;
    checks.push({ name: `section-present:${section.canonical}`, passed: false });
  }
  for (const section of SECTION_ALIASES) {
    if (!missing.includes(section)) {
      checks.push({ name: `section-present:${section.canonical}`, passed: true });
    }
  }

  const ordered = found.slice().sort((a, b) => a.lineIndex - b.lineIndex).map((f) => f.canonical);
  const canonicalOrder = SECTION_ALIASES.map((s) => s.canonical).filter((c) => found.some((f) => f.canonical === c));
  const orderOk = ordered.join('|') === canonicalOrder.join('|');
  if (!orderOk) score -= ORDER_PENALTY;
  checks.push({ name: 'section-order', passed: orderOk });

  const emailOk = findEmail(draftText) !== null;
  const phoneOk = findPhone(draftText) !== null;
  if (!emailOk) score -= CONTACT_EMAIL_PENALTY;
  if (!phoneOk) score -= CONTACT_PHONE_PENALTY;
  checks.push({ name: 'contact-email', passed: emailOk });
  checks.push({ name: 'contact-phone', passed: phoneOk });

  const noTable = !looksLikeTable(draftText);
  if (!noTable) score -= TABLE_PENALTY;
  checks.push({ name: 'no-tables', passed: noTable });

  return { score: clamp(score), checks };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
