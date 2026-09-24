import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import {
  verifierOutputSchema,
  type ProfileItem,
  type StructuredProfile,
  type VerdictResult,
} from '../../types';
import { getProfileItem } from '../profile/normalize';
import { renderProfileItemContent } from '../profile/render';

const MODEL_ID = 'gpt-4o-mini';

// SEPARATE SYSTEM PROMPT — deliberately shares nothing with the generator's
// prompt. The verifier must judge each bullet only against the cited source
// item's verbatim content; it never sees the generator's instructions,
// reasoning, the JD, or the ATS score.
const SYSTEM_PROMPT = `You are an independent claim verifier for a resume system. You will receive a list of resume bullets. Each bullet cites a sourceItemId; for each bullet you are given the VERBATIM content of that cited source item from the candidate's own profile.

Your task: judge each bullet STRICTLY against its cited source item.

Verdicts:
- SUPPORTED — every specific claim in the bullet (skill, action, employer, degree, metric, outcome) is present in or directly and explicitly stated by the cited source item.
- PARTIAL — the core claim is grounded, but the bullet overstates or extends beyond what the source item explicitly says (e.g. claims leadership, a metric, an outcome, or a technology the source only implies or mentions in a different context).
- UNSUPPORTED — the bullet asserts something the cited source item does not contain, or the claim contradicts the source.

STRICT RULES:
- NO charitable inference. If the bullet claims a metric or outcome (e.g. "reduced load time by 40%") that is not present verbatim or near-verbatim in the source item, that is UNSUPPORTED even if it is plausible.
- You may not use outside knowledge to justify a claim. Only the provided source item text counts.
- Do not consider whether a claim is plausible or impressive. Only whether it is grounded in the cited source.
- Justification must cite the specific words in the source item that support or fail to support the claim, in one or two sentences.

Output: exactly one result per input bullet, identified by its bulletIndex (0-based, matching the order given).`;

export interface VerifyBulletInput {
  section: string;
  text: string;
  sourceItemId: string;
}

export interface VerifierInput {
  bullets: VerifyBulletInput[];
  profile: StructuredProfile;
}

export interface VerifiedBullet extends VerifyBulletInput {
  verdict: VerdictResult['verdict'];
  justification: string;
}

interface LlmBullet {
  bulletIndex: number;
  bulletText: string;
  claimedSourceItemId: string;
  citedSourceItemVerbatimContent: string;
}

// Separate LLM call (never shares a call or context with the generator).
// Batched: one call per draft containing all bullets needing verification.
export async function verifyBullets(input: VerifierInput): Promise<VerifiedBullet[]> {
  if (input.bullets.length === 0) return [];

  // Code-level pre-check: a bullet citing a nonexistent item is UNSUPPORTED
  // without spending an LLM call.
  const codeVerdicts = new Map<number, { verdict: VerdictResult['verdict']; justification: string }>();
  const llmPayload: LlmBullet[] = [];

  input.bullets.forEach((bullet, index) => {
    const item = getProfileItem(input.profile, bullet.sourceItemId);
    if (item === null) {
      codeVerdicts.set(index, {
        verdict: 'UNSUPPORTED',
        justification: `sourceItemId "${bullet.sourceItemId}" does not exist in the candidate profile — nothing to ground this claim on`,
      });
    } else {
      llmPayload.push({
        bulletIndex: index,
        bulletText: bullet.text,
        claimedSourceItemId: bullet.sourceItemId,
        citedSourceItemVerbatimContent: renderProfileItemContent(item as ProfileItem),
      });
    }
  });

  if (llmPayload.length > 0) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const userPayload = {
      instructions:
        'Each bullet includes its claimed sourceItemId and the verbatim content of that profile item. Judge ONLY against that content.',
      bullets: llmPayload,
    };

    const { object } = await generateObject({
      model: openai(MODEL_ID),
      schema: verifierOutputSchema,
      system: SYSTEM_PROMPT,
      prompt: JSON.stringify(userPayload, null, 2),
      temperature: 0,
    });

    for (const r of object.results) {
      codeVerdicts.set(r.bulletIndex, { verdict: r.verdict, justification: r.justification });
    }
  }

  // Fail-safety: any bullet the verifier did not return a verdict for is
  // UNSUPPORTED, never silently passed.
  return input.bullets.map((bullet, index) => {
    const verdict = codeVerdicts.get(index) ?? {
      verdict: 'UNSUPPORTED' as const,
      justification: 'verifier failed to return a verdict for this bullet',
    };
    return { ...bullet, ...verdict };
  });
}
