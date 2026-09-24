import { describe, expect, it } from 'vitest';
import { scoreDraft } from '../src/lib/scoring/index';
import { hashEmbeddingProvider } from '../src/lib/embed';
import { SCORE_WEIGHTS } from '../src/lib/scoring/weights';
import type { ParsedJd } from '../src/types';

const jd: ParsedJd = {
  requiredSkills: ['react', 'typescript'],
  keywords: ['rest apis'],
  qualifications: [],
  experienceLevel: 'senior',
  niceToHave: ['graphql'],
};

const jdRawText = 'Senior frontend engineer. Must have React and TypeScript. Nice to have GraphQL. REST APIs.';

const strongDraft = `Ananya Rao
ananya.rao@example.com | +1 415 555 2671

Professional Experience
- Built UIs in react and typescript with rest apis integration

Education
B.Tech Computer Science

Technical Skills
react, typescript, rest apis
`;

const weakDraft = `Ananya Rao
ananya.rao@example.com

Professional Experience
- Wrote some code
`;

describe('scoreDraft (weighted combination)', () => {
  it('strong draft scores much higher than weak draft', async () => {
    const strong = await scoreDraft(strongDraft, jd, jdRawText, hashEmbeddingProvider);
    const weak = await scoreDraft(weakDraft, jd, jdRawText, hashEmbeddingProvider);
    expect(strong.total).toBeGreaterThan(weak.total);
  });

  it('reports matched and missed must-haves in the breakdown', async () => {
    const strong = await scoreDraft(strongDraft, jd, jdRawText, hashEmbeddingProvider);
    expect(strong.breakdown.mustMatched.sort()).toEqual(['react', 'typescript']);
    expect(strong.breakdown.mustMissed).toEqual([]);
    const weak = await scoreDraft(weakDraft, jd, jdRawText, hashEmbeddingProvider);
    expect(weak.breakdown.mustMissed.sort()).toEqual(['react', 'typescript']);
  });

  it('weighted total matches manual computation from components', async () => {
    const { total, breakdown } = await scoreDraft(strongDraft, jd, jdRawText, hashEmbeddingProvider);
    const expected =
      SCORE_WEIGHTS.keywordMust * breakdown.keywordMust +
      SCORE_WEIGHTS.keywordNice * breakdown.keywordNice +
      SCORE_WEIGHTS.structure * breakdown.structure +
      SCORE_WEIGHTS.parseability * breakdown.parseability +
      SCORE_WEIGHTS.semantic * breakdown.semantic;
    expect(total).toBeCloseTo(expected, 1);
  });

  it('total is bounded 0-100', async () => {
    const strong = await scoreDraft(strongDraft, jd, jdRawText, hashEmbeddingProvider);
    const weak = await scoreDraft(weakDraft, jd, jdRawText, hashEmbeddingProvider);
    for (const t of [strong.total, weak.total]) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(100);
    }
  });

  it('is deterministic: identical inputs give identical breakdowns', async () => {
    const a = await scoreDraft(strongDraft, jd, jdRawText, hashEmbeddingProvider);
    const b = await scoreDraft(strongDraft, jd, jdRawText, hashEmbeddingProvider);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
