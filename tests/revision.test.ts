import { describe, expect, it } from 'vitest';
import {
  claimHash,
  countVerdicts,
  planRevision,
  type FlatBullet,
  type SeenVerdict,
} from '../src/lib/revision.js';

function verdictsFrom(entries: [string, SeenVerdict['verdict'], string][]): Map<string, SeenVerdict> {
  const map = new Map<string, SeenVerdict>();
  for (const [hash, verdict, justification] of entries) {
    map.set(hash, { verdict, justification });
  }
  return map;
}

const b = (section: string, text: string, sourceItemId: string): FlatBullet => ({
  section,
  text,
  sourceItemId,
});

// Shared fixtures for planRevision and countVerdicts.
const flat: FlatBullet[] = [
  b('experience', 'supported bullet', 'exp_1'),
  b('experience', 'unsupported bullet', 'exp_1'),
  b('skills', 'first partial', 'skl_1'),
  b('projects', 'persistent partial', 'prj_1'),
];
const verdicts = verdictsFrom([
  [claimHash('experience', 'supported bullet', 'exp_1'), 'SUPPORTED', 'fully grounded'],
  [claimHash('experience', 'unsupported bullet', 'exp_1'), 'UNSUPPORTED', 'metric not in source'],
  [claimHash('skills', 'first partial', 'skl_1'), 'PARTIAL', 'overstates scope'],
  [claimHash('projects', 'persistent partial', 'prj_1'), 'PARTIAL', 'still overstates'],
]);

describe('claimHash', () => {
  it('is case/whitespace-insensitive on text, sensitive to source and section', () => {
    expect(claimHash('experience', 'Built  X ', 'exp_1')).toBe(claimHash('experience', 'built x', 'exp_1'));
    expect(claimHash('experience', 'x', 'exp_1')).not.toBe(claimHash('experience', 'x', 'exp_2'));
    expect(claimHash('experience', 'x', 'exp_1')).not.toBe(claimHash('skills', 'x', 'exp_1'));
  });
});

describe('planRevision', () => {
  it('regenerates sections containing unsupported bullets with their justification as feedback', () => {
    const plan = planRevision({ flat, verdicts, sanitizerDrops: [], partialAttemptedSections: new Set() });
    expect(plan.regenerateSections).toContain('experience');
    const rej = plan.rejectionLog.find((r) => r.text === 'unsupported bullet');
    expect(rej?.reason).toBe('metric not in source');
  });

  it('gives PARTIAL bullets exactly one rewrite attempt per section', () => {
    const plan = planRevision({ flat, verdicts, sanitizerDrops: [], partialAttemptedSections: new Set() });
    expect(plan.regenerateSections).toContain('skills');
    const rej = plan.rejectionLog.find((r) => r.text === 'first partial');
    expect(rej?.reason).toContain('PARTIAL — narrow the claim');
    expect(plan.partialAttemptedSections).toContain('skills');
  });

  it('accepts persistent PARTIALs after their one rewrite attempt', () => {
    const plan = planRevision({
      flat,
      verdicts,
      sanitizerDrops: [],
      partialAttemptedSections: new Set(['projects']),
    });
    expect(plan.regenerateSections).not.toContain('projects');
    expect(plan.rejectionLog.find((r) => r.text === 'persistent partial')).toBeUndefined();
  });

  it('always feeds back sanitizer-dropped fabrications regardless of verdicts', () => {
    const plan = planRevision({
      flat: [],
      verdicts: new Map(),
      sanitizerDrops: [{ section: 'skills', text: 'fabricated', reason: 'id does not exist' }],
      partialAttemptedSections: new Set(['skills']),
    });
    expect(plan.regenerateSections).toEqual(['skills']);
    expect(plan.rejectionLog[0].reason).toBe('id does not exist');
  });

  it('reports hasRegeneration=false and no feedback for a fully supported draft', () => {
    const supportedOnly: FlatBullet[] = [b('experience', 'good bullet', 'exp_1')];
    const plan = planRevision({
      flat: supportedOnly,
      verdicts: verdictsFrom([[claimHash('experience', 'good bullet', 'exp_1'), 'SUPPORTED', 'grounded']]),
      sanitizerDrops: [],
      partialAttemptedSections: new Set(),
    });
    expect(plan.hasRegeneration).toBe(false);
    expect(plan.rejectionLog).toEqual([]);
  });

  it('does not mutate the input partialAttemptedSections set', () => {
    const attempted = new Set(['skills']);
    planRevision({ flat, verdicts, sanitizerDrops: [], partialAttemptedSections: attempted });
    expect(attempted.has('skills')).toBe(true);
    expect(attempted.size).toBe(1);
  });
});

describe('countVerdicts', () => {
  it('counts supported/partial/unsupported over the draft bullets', () => {
    const counts = countVerdicts(flat, verdicts);
    expect(counts).toEqual({ supported: 1, partial: 2, unsupported: 1 });
  });

  it('ignores bullets without a verdict (should not happen but must not crash)', () => {
    const counts = countVerdicts([b('experience', 'unknown', 'exp_9')], new Map());
    expect(counts).toEqual({ supported: 0, partial: 0, unsupported: 0 });
  });
});
