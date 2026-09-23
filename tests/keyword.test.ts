import { describe, expect, it } from 'vitest';
import { keywordCoverage } from '../src/lib/scoring/keyword.js';
import type { ParsedJd } from '../src/types.js';

const jd: ParsedJd = {
  requiredSkills: ['react', 'typescript', 'kubernetes'],
  keywords: ['rest apis', 'react', 'accessibility'],
  qualifications: ['5+ years frontend'],
  experienceLevel: 'senior',
  niceToHave: ['graphql'],
};

describe('keywordCoverage', () => {
  it('scores exact must-have matches', () => {
    const result = keywordCoverage('Built UIs in react and typescript', jd);
    expect(result.must.matched.sort()).toEqual(['react', 'typescript']);
    expect(result.must.missed).toEqual(['kubernetes']);
    expect(result.must.coverage).toBeCloseTo(66.67);
  });

  it('matches stems (apis matches api keyword)', () => {
    const result = keywordCoverage('Designed rest apis for the platform', jd);
    expect(result.must.matched).toEqual([]);
    expect(result.nice.matched).toEqual(['rest apis']);
  });

  it('does not double-count a nice keyword that is also a must-have', () => {
    const result = keywordCoverage('react only', jd);
    // 'react' appears in keywords but must be counted on the must list only
    expect(result.must.matched).toEqual(['react']);
    expect(result.nice.matched).toEqual([]);
  });

  it('reports missed terms with original casing preserved', () => {
    const result = keywordCoverage('nothing relevant here', jd);
    expect(result.nice.missed.sort()).toEqual(['accessibility', 'graphql']);
  });

  it('gives 100 coverage for an empty must list', () => {
    const result = keywordCoverage('anything', { ...jd, requiredSkills: [] });
    expect(result.must.coverage).toBe(100);
  });

  it('dedupes inflected duplicates within a list', () => {
    const result = keywordCoverage('wrote tests', { ...jd, requiredSkills: ['test', 'tests'] });
    expect(result.must.matched).toEqual(['test']);
    expect(result.must.coverage).toBe(100);
  });
});
