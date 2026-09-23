// Scoring weights. Must-have skills count for much more than nice-to-haves —
// this is the payoff of the JD parser's explicit must/nice classification.
// Weights live in one place so they are easy to defend or adjust.
export const SCORE_WEIGHTS = {
  keywordMust: 0.4,
  keywordNice: 0.15,
  structure: 0.15,
  parseability: 0.1,
  semantic: 0.2,
} as const;

export type ScoreWeights = typeof SCORE_WEIGHTS;
