import type { RejectionFeedback, Verdict } from '../types.js';

// Pure revision-planning logic, extracted from the orchestrator so the stop /
// regenerate decisions are unit-testable without an LLM or database.

export interface FlatBullet {
  section: string;
  text: string;
  sourceItemId: string;
}

export interface SeenVerdict {
  verdict: Verdict;
  justification: string;
}

// Claim hash: identical (section, text, sourceItemId) triples carry their
// prior verdict forward without a new verifier call — this is the cost guard.
export function claimHash(section: string, text: string, sourceItemId: string): string {
  return `${section}::${text.trim().replace(/\s+/g, ' ').toLowerCase()}::${sourceItemId}`;
}

export interface RevisionPlanInput {
  flat: FlatBullet[];
  verdicts: Map<string, SeenVerdict>;
  sanitizerDrops: RejectionFeedback[];
  partialAttemptedSections: ReadonlySet<string>;
}

export interface RevisionPlan {
  regenerateSections: string[];
  rejectionLog: RejectionFeedback[];
  partialAttemptedSections: string[];
  hasRegeneration: boolean;
}

// Decide which sections regenerate on the next pass and what feedback the
// generator receives:
// - UNSUPPORTED bullets always regenerate their section with the verifier's
//   justification as feedback.
// - PARTIAL bullets get exactly ONE rewrite attempt per section; afterwards a
//   persistent PARTIAL is accepted as-is.
// - Sanitizer-dropped fabrications always feed back regardless of verdicts.
export function planRevision(input: RevisionPlanInput): RevisionPlan {
  const sectionsToRegen = new Set<string>();
  const rejectionLog: RejectionFeedback[] = [];
  const attempted = new Set(input.partialAttemptedSections);

  for (const bullet of input.flat) {
    const v = input.verdicts.get(claimHash(bullet.section, bullet.text, bullet.sourceItemId));
    if (!v) continue;
    if (v.verdict === 'UNSUPPORTED') {
      sectionsToRegen.add(bullet.section);
      rejectionLog.push({ section: bullet.section, text: bullet.text, reason: v.justification });
    } else if (v.verdict === 'PARTIAL' && !attempted.has(bullet.section)) {
      sectionsToRegen.add(bullet.section);
      attempted.add(bullet.section);
      rejectionLog.push({
        section: bullet.section,
        text: bullet.text,
        reason: `PARTIAL — narrow the claim to what the cited source actually supports: ${v.justification}`,
      });
    }
    // Persistent PARTIAL after its one rewrite attempt is accepted as-is.
  }

  for (const drop of input.sanitizerDrops) {
    sectionsToRegen.add(drop.section);
    rejectionLog.push(drop);
  }

  const regenerateSections = [...sectionsToRegen];
  return {
    regenerateSections,
    rejectionLog,
    partialAttemptedSections: [...attempted],
    hasRegeneration: regenerateSections.length > 0,
  };
}

export function countVerdicts(flat: FlatBullet[], verdicts: Map<string, SeenVerdict>): {
  supported: number;
  partial: number;
  unsupported: number;
} {
  const counts = { supported: 0, partial: 0, unsupported: 0 };
  for (const bullet of flat) {
    const v = verdicts.get(claimHash(bullet.section, bullet.text, bullet.sourceItemId));
    if (!v) continue;
    if (v.verdict === 'SUPPORTED') counts.supported++;
    else if (v.verdict === 'PARTIAL') counts.partial++;
    else counts.unsupported++;
  }
  return counts;
}
