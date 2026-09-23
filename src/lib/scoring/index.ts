import type { ParsedJd } from '../../types.js';
import type { EmbeddingProvider } from '../embed.js';
import { keywordCoverage, round2 } from './keyword.js';
import { structureScore } from './structure.js';
import { parseabilityScore } from './parseability.js';
import { semanticScore } from './semantic.js';
import { SCORE_WEIGHTS } from './weights.js';

export interface ScoreBreakdown {
  keywordMust: number;
  keywordNice: number;
  structure: number;
  parseability: number;
  semantic: number;
  mustMatched: string[];
  mustMissed: string[];
  niceMatched: string[];
  niceMissed: string[];
  parseIssues: string[];
}

export interface DraftScore {
  total: number; // 0-100 weighted
  breakdown: ScoreBreakdown;
}

// Deterministic, auditable ATS score. Same inputs + same embedder => same
// output, always. No LLM in the score path by design.
export async function scoreDraft(
  draftText: string,
  jd: ParsedJd,
  jdRawText: string,
  embedder: EmbeddingProvider,
): Promise<DraftScore> {
  const kw = keywordCoverage(draftText, jd);
  const structure = structureScore(draftText);
  const parseability = parseabilityScore(draftText);
  const semantic = await semanticScore(draftText, jdRawText, embedder);

  const w = SCORE_WEIGHTS;
  const total =
    w.keywordMust * kw.must.coverage +
    w.keywordNice * kw.nice.coverage +
    w.structure * structure.score +
    w.parseability * parseability.score +
    w.semantic * semantic;

  return {
    total: round2(total),
    breakdown: {
      keywordMust: kw.must.coverage,
      keywordNice: kw.nice.coverage,
      structure: structure.score,
      parseability: parseability.score,
      semantic,
      mustMatched: kw.must.matched,
      mustMissed: kw.must.missed,
      niceMatched: kw.nice.matched,
      niceMissed: kw.nice.missed,
      parseIssues: parseability.issues,
    },
  };
}
