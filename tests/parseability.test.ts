import { describe, expect, it } from 'vitest';
import { parseabilityScore } from '../src/lib/scoring/parseability';

const cleanDraft = `Ananya Rao
ananya.rao@example.com | +1 415 555 2671

Professional Experience
Software Engineer, Bright Systems
- Built the checkout flow in React
- Wrote integration tests for payment APIs

Education
B.Tech, Computer Science, IIT Delhi
`;

describe('parseabilityScore', () => {
  it('clean draft scores 100 with no issues', () => {
    const result = parseabilityScore(cleanDraft);
    expect(result.score).toBe(100);
    expect(result.issues).toEqual([]);
  });

  it('flags pipe-column layouts', () => {
    const result = parseabilityScore(cleanDraft + '\nSkill | Years\nReact | 3\nNode | 4');
    expect(result.issues.some((i) => i.includes('column layout'))).toBe(true);
    expect(result.score).toBeLessThan(100);
  });

  it('flags html content', () => {
    const result = parseabilityScore(cleanDraft + '\n<b>bold claim</b>');
    expect(result.issues.some((i) => i.includes('HTML'))).toBe(true);
  });

  it('flags mixed bullet markers', () => {
    const mixed = cleanDraft.replace('- Wrote integration tests', '• Wrote integration tests');
    const result = parseabilityScore(mixed);
    expect(result.issues.some((i) => i.includes('mixed bullet markers'))).toBe(true);
  });

  it('flags non-ascii glyphs', () => {
    const weird = cleanDraft.replace('Built the checkout flow', 'Built ✓✓ the checkout flow');
    const result = parseabilityScore(weird);
    expect(result.issues.some((i) => i.includes('non-ASCII'))).toBe(true);
  });

  it('flags missing section header', () => {
    const noHeaders = 'Some bullet\nAnother bullet\nThird bullet';
    const result = parseabilityScore(noHeaders);
    expect(result.issues.some((i) => i.includes('section header'))).toBe(true);
  });

  it('flags extremely long lines', () => {
    const long = cleanDraft + '\n' + 'x'.repeat(500);
    const result = parseabilityScore(long);
    expect(result.issues.some((i) => i.includes('400 chars'))).toBe(true);
  });
});
