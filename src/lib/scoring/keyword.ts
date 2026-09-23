import type { ParsedJd } from '../../types.js';
import { containsKeyword, keywordSignature } from '../tokenize.js';

export interface KeywordCoverage {
  coverage: number; // 0-100
  matched: string[];
  missed: string[];
}

export interface KeywordScore {
  must: KeywordCoverage;
  nice: KeywordCoverage;
}

// Keyword coverage over the plain-text draft.
// must      = JD requiredSkills
// nice      = keywords + niceToHave, deduped against requiredSkills by stem
// signature so a term never counts on both lists.
export function keywordCoverage(draftText: string, jd: ParsedJd): KeywordScore {
  const must = scoreList(draftText, jd.requiredSkills);
  const mustSigs = new Set(must.matched.concat(must.missed).map(keywordSignature));
  const niceRaw = [...jd.keywords, ...jd.niceToHave].filter(
    (term) => !mustSigs.has(keywordSignature(term)),
  );
  const nice = scoreList(draftText, dedupeBySignature(niceRaw));
  return { must, nice };
}

function dedupeBySignature(terms: string[]): string[] {
  const seen = new Map<string, string>();
  for (const term of terms) {
    const sig = keywordSignature(term);
    if (!seen.has(sig)) seen.set(sig, term);
  }
  return [...seen.values()];
}

function scoreList(draftText: string, terms: string[]): KeywordCoverage {
  const matched: string[] = [];
  const missed: string[] = [];
  const unique = dedupeBySignature(terms);
  for (const term of unique) {
    (containsKeyword(draftText, term) ? matched : missed).push(term);
  }
  const coverage = unique.length === 0 ? 100 : (matched.length / unique.length) * 100;
  return { coverage: round2(coverage), matched, missed };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
