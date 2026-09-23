import { describe, expect, it } from 'vitest';
import { structureScore } from '../src/lib/scoring/structure.js';

const fullResume = `
Ananya Rao
ananya.rao@example.com | +1 415 555 2671

Professional Experience
Software Engineer, Bright Systems (2023-2025)
- Built the checkout flow in React

Projects
- Checkout Revamp: rebuilt cart with React and TypeScript

Education
B.Tech, Computer Science, IIT Delhi, 2022

Technical Skills
React, TypeScript, Node.js, SQL
`;

describe('structureScore', () => {
  it('full resume passes all checks', () => {
    const result = structureScore(fullResume);
    expect(result.score).toBe(100);
    for (const check of result.checks) {
      expect(check.passed, check.name).toBe(true);
    }
  });

  it('penalizes a missing section', () => {
    const noEducation = fullResume.replace(/Education[\s\S]*Skills/, 'Technical Skills');
    const result = structureScore(noEducation);
    expect(result.checks.find((c) => c.name === 'section-present:education')?.passed).toBe(false);
    expect(result.score).toBeLessThan(100);
  });

  it('penalizes missing contact email', () => {
    const noEmail = fullResume.replace('ananya.rao@example.com | ', '');
    const result = structureScore(noEmail);
    expect(result.checks.find((c) => c.name === 'contact-email')?.passed).toBe(false);
  });

  it('hard-penalizes a pipe table layout', () => {
    const tabled = fullResume.replace('Technical Skills\nReact, TypeScript, Node.js, SQL', 'Technical Skills\nSkill | Years\nReact | 3\nTypeScript | 3\nNode.js | 4');
    const result = structureScore(tabled);
    expect(result.checks.find((c) => c.name === 'no-tables')?.passed).toBe(false);
    expect(result.score).toBeLessThanOrEqual(75);
  });

  it('penalizes wrong section order', () => {
    const wrongOrder = `Ananya Rao
ananya.rao@example.com | +1 415 555 2671

Technical Skills
React, TypeScript

Education
B.Tech, Computer Science, IIT Delhi, 2022

Professional Experience
Software Engineer, Bright Systems
- Built the checkout flow in React`;
    const result = structureScore(wrongOrder);
    expect(result.checks.find((c) => c.name === 'section-order')?.passed).toBe(false);
  });
});
