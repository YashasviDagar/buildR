import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { claims, drafts, jobDescriptions, profiles, runs } from '../db/schema';
import type {
  GeneratedSection,
  ParsedJd,
  RejectionFeedback,
  StructuredProfile,
} from '../types';
import { generateDraft, type GeneratorInput, type GeneratedDraft } from './agents/generator';
import { verifyBullets, type VerifierInput, type VerifiedBullet } from './agents/verifier';
import { scoreDraft, type ScoreBreakdown } from './scoring/index';
import { getEmbeddingProvider } from './embed';
import { renderDraftText } from './profile/render';
import {
  claimHash,
  countVerdicts,
  planRevision,
  type FlatBullet,
  type SeenVerdict,
} from './revision';

const MAX_ITERATIONS = 4;
const MIN_SCORE_IMPROVEMENT = 2;
const SECTION_ORDER = ['experience', 'projects', 'education', 'skills'];

export type StopReason =
  | 'clean'
  | 'score_plateau'
  | 'max_iterations'
  | 'nothing_to_revise';

export interface IterationRecord {
  iteration: number;
  draftId: string;
  score: number;
  scoreDelta: number;
  breakdown: ScoreBreakdown;
  verdictCounts: { supported: number; partial: number; unsupported: number };
  verifiedThisIteration: number;
  carriedOver: number;
}

export interface RunResult {
  runId: string;
  iterations: IterationRecord[];
  stopReason: StopReason;
  converged: boolean;
  finalScore: number;
  finalIteration: number;
}

// Injectable agent seam: production wiring uses the real LLM agents; tests
// inject scripted fakes so the full state machine runs offline.
export interface PipelineAgents {
  generate: (input: GeneratorInput) => Promise<GeneratedDraft>;
  verify: (input: VerifierInput) => Promise<VerifiedBullet[]>;
}

export const productionAgents: PipelineAgents = {
  generate: generateDraft,
  verify: verifyBullets,
};

// Plain readable state machine:
//   INIT -> (GENERATE -> SCORE -> VERIFY -> STOP-CHECK -> REVISE)* -> DONE
// Stops on whichever comes first (spec order): score plateau, 4 iterations,
// or a fully supported draft; plus a quality guard: nothing left to revise.
export async function runPipeline(
  profileId: string,
  jdId: string,
  runId?: string,
  agents: PipelineAgents = productionAgents,
): Promise<RunResult> {
  // --- INIT -------------------------------------------------------------
  const [profileRow] = await db.select().from(profiles).where(eq(profiles.id, profileId));
  if (!profileRow) throw new Error(`Profile ${profileId} not found`);
  const [jdRow] = await db.select().from(jobDescriptions).where(eq(jobDescriptions.id, jdId));
  if (!jdRow) throw new Error(`Job description ${jdId} not found`);

  const profile = JSON.parse(profileRow.structuredJson) as StructuredProfile;
  const jd = JSON.parse(jdRow.parsedJson) as ParsedJd;
  const jdRaw = jdRow.rawText;
  const embedder = getEmbeddingProvider();

  const id = runId ?? nanoid();
  await db.insert(runs).values({ id, profileId, jdId, status: 'running' });

  try {
    return await loop(id, profileId, jdId, profile, jd, jdRaw, embedder, agents);
  } catch (err) {
    // A crashed run never converged: persist the failure for the UI/eval.
    await db
      .update(runs)
      .set({ status: 'failed', converged: false })
      .where(eq(runs.id, id));
    throw err;
  }
}

// Fire-and-forget entrypoint for the UI: the runs row already exists (so the
// run detail page can poll immediately), the pipeline just fills it in.
export async function runPipelineWithExistingRun(
  runId: string,
  profileId: string,
  jdId: string,
  agents: PipelineAgents = productionAgents,
): Promise<RunResult> {
  const [profileRow] = await db.select().from(profiles).where(eq(profiles.id, profileId));
  if (!profileRow) throw new Error(`Profile ${profileId} not found`);
  const [jdRow] = await db.select().from(jobDescriptions).where(eq(jobDescriptions.id, jdId));
  if (!jdRow) throw new Error(`Job description ${jdId} not found`);

  const profile = JSON.parse(profileRow.structuredJson) as StructuredProfile;
  const jd = JSON.parse(jdRow.parsedJson) as ParsedJd;
  const jdRaw = jdRow.rawText;
  const embedder = getEmbeddingProvider();

  try {
    return await loop(runId, profileId, jdId, profile, jd, jdRaw, embedder, agents);
  } catch (err) {
    // A crashed run never converged: persist the failure for the UI/eval.
    await db
      .update(runs)
      .set({ status: 'failed', converged: false })
      .where(eq(runs.id, runId));
    throw err;
  }
}

// Merge regenerated sections with verbatim-kept sections in CODE, not by
// trusting the generator to copy. Canonical section order is preserved.
function mergeSections(
  regenerated: GeneratedSection[],
  kept: GeneratedSection[],
): GeneratedSection[] {
  const keptBySection = new Map(kept.map((s) => [s.section, s]));
  const merged: GeneratedSection[] = [];
  const sections = new Set([...SECTION_ORDER, ...regenerated.map((s) => s.section)]);
  for (const section of sections) {
    const fromRegen = regenerated.find((s) => s.section === section);
    if (fromRegen && fromRegen.bullets.length > 0) {
      merged.push(fromRegen);
      continue;
    }
    const keptSection = keptBySection.get(section);
    if (keptSection) merged.push(keptSection);
  }
  return merged;
}

async function loop(
  runId: string,
  profileId: string,
  jdId: string,
  profile: StructuredProfile,
  jd: ParsedJd,
  jdRaw: string,
  embedder: ReturnType<typeof getEmbeddingProvider>,
  agents: PipelineAgents,
): Promise<RunResult> {
  const seen = new Map<string, SeenVerdict>();
  const partialAttemptedSections = new Set<string>();
  const records: IterationRecord[] = [];

  let priorScore = 0;
  let priorBreakdown: ScoreBreakdown | undefined;
  let rejectionLog: RejectionFeedback[] = [];
  let keepSections: GeneratedSection[] = [];
  let regenerateSections: string[] = [];
  let iteration = 1;
  let stopReason: StopReason | null = null;
  let lastScore = 0;

  while (stopReason === null) {
    // --- GENERATE ---------------------------------------------------------
    // On iteration 1 the generator writes all sections. On later passes it
    // writes ONLY the sections flagged for regeneration; kept sections are
    // merged back in code (mergeSections) so verbatim copies are guaranteed.
    const generated = await agents.generate({
      jd,
      jdRawText: jdRaw,
      profile,
      iteration,
      previousScoreBreakdown: iteration > 1 ? (priorBreakdown as unknown as Record<string, unknown>) : undefined,
      rejections: iteration > 1 ? rejectionLog : undefined,
      keepSections: iteration > 1 ? keepSections : undefined,
      regenerateSections: iteration > 1 ? regenerateSections : undefined,
    });

    const regenOutput =
      iteration > 1 && regenerateSections.length > 0
        ? generated.sections.filter((s) => regenerateSections.includes(s.section))
        : generated.sections;
    const sections = iteration > 1 ? mergeSections(regenOutput, keepSections) : generated.sections;
    if (sections.length === 0) throw new Error('generator produced an empty draft');

    // --- SCORE ------------------------------------------------------------
    const draftText = renderDraftText(profile, sections);
    const score = await scoreDraft(draftText, jd, jdRaw, embedder);
    const draftId = nanoid();
    await db.insert(drafts).values({
      id: draftId,
      runId,
      profileId,
      jdId,
      iteration,
      sectionsJson: JSON.stringify(sections),
      atsScore: score.total,
      scoreBreakdownJson: JSON.stringify(score.breakdown),
    });

    // --- VERIFY (only new/changed bullets) ---------------------------------
    const flat = sections.flatMap((s) => s.bullets.map((b) => ({ section: s.section, ...b })));
    const toVerify = flat.filter((b) => !seen.has(claimHash(b.section, b.text, b.sourceItemId)));
    const verified: VerifiedBullet[] = toVerify.length
      ? await agents.verify({ bullets: toVerify, profile })
      : [];

    for (const v of verified) {
      seen.set(claimHash(v.section, v.text, v.sourceItemId), {
        verdict: v.verdict,
        justification: v.justification,
      });
    }

    // Log claims: newly verified + carried-over (with their prior verdict).
    let carriedOver = 0;
    const claimRows = [];
    for (const bullet of flat) {
      const prior = seen.get(claimHash(bullet.section, bullet.text, bullet.sourceItemId));
      if (!prior) continue;
      const isNew = verified.some(
        (v) =>
          v.section === bullet.section &&
          v.text === bullet.text &&
          v.sourceItemId === bullet.sourceItemId,
      );
      if (!isNew) carriedOver++;
      claimRows.push({
        id: nanoid(),
        draftId,
        section: bullet.section,
        text: bullet.text,
        sourceItemId: bullet.sourceItemId,
        verdict: prior.verdict,
        justification: isNew ? prior.justification : `${prior.justification} (carried over — bullet unchanged)`,
      });
    }
    for (const drop of generated.droppedUnresolved) {
      claimRows.push({
        id: nanoid(),
        draftId,
        section: drop.section,
        text: drop.text,
        sourceItemId: 'unresolved',
        verdict: 'UNSUPPORTED',
        justification: `dropped by generator sanitizer: ${drop.reason}`,
      });
    }
    if (claimRows.length > 0) await db.insert(claims).values(claimRows);

    const verdictCounts = countVerdicts(flat, seen);

    records.push({
      iteration,
      draftId,
      score: score.total,
      scoreDelta: Math.round((score.total - priorScore) * 100) / 100,
      breakdown: score.breakdown,
      verdictCounts,
      verifiedThisIteration: verified.length,
      carriedOver,
    });

    // --- STOP CHECKS (first match wins; spec order first, then guard) ------
    if (iteration >= 2 && score.total - priorScore < MIN_SCORE_IMPROVEMENT) {
      stopReason = 'score_plateau';
      lastScore = score.total;
      break;
    }
    if (iteration >= MAX_ITERATIONS) {
      stopReason = 'max_iterations';
      lastScore = score.total;
      break;
    }
    if (verdictCounts.unsupported === 0 && verdictCounts.partial === 0) {
      stopReason = 'clean';
      lastScore = score.total;
      break;
    }

    // --- REVISE (pure planning logic) ---------------------------------------
    const plan = planRevision({
      flat,
      verdicts: seen,
      sanitizerDrops: generated.droppedUnresolved,
      partialAttemptedSections,
    });

    // Guard: verdicts not clean but nothing to regenerate (e.g. only accepted
    // PARTIALs remain) — the draft is stable; iterating further would just
    // churn tokens. Treat as a quality stop.
    if (!plan.hasRegeneration) {
      stopReason = 'nothing_to_revise';
      lastScore = score.total;
      break;
    }

    partialAttemptedSections.clear();
    for (const s of plan.partialAttemptedSections) partialAttemptedSections.add(s);
    keepSections = sections.filter((s) => !plan.regenerateSections.includes(s.section));
    regenerateSections = plan.regenerateSections;
    rejectionLog = plan.rejectionLog;
    priorScore = score.total;
    priorBreakdown = score.breakdown;
    iteration++;
  }

  const converged = stopReason !== 'max_iterations';
  const finalScore = lastScore;
  await db
    .update(runs)
    .set({
      status: 'done',
      stopReason,
      finalIteration: iteration,
      converged,
      finalScore,
    })
    .where(eq(runs.id, runId));

  return { runId, iterations: records, stopReason, converged, finalScore, finalIteration: iteration };
}
