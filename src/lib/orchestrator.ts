import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { claims, drafts, jobDescriptions, profiles, runs } from '../db/schema.js';
import type {
  GeneratedSection,
  ParsedJd,
  RejectionFeedback,
  StructuredProfile,
  Verdict,
} from '../types.js';
import { generateDraft } from './agents/generator.js';
import { verifyBullets, type VerifiedBullet } from './agents/verifier.js';
import { scoreDraft, type ScoreBreakdown } from './scoring/index.js';
import { getEmbeddingProvider } from './embed.js';
import { renderDraftText, renderJdText } from './profile/render.js';

const MAX_ITERATIONS = 4;
const MIN_SCORE_IMPROVEMENT = 2;

export type StopReason = 'clean' | 'score_plateau' | 'max_iterations';

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

interface SeenVerdict {
  verdict: Verdict;
  justification: string;
}

// Claim hash: identical (section, text, sourceItemId) triples carry their
// prior verdict forward without a new verifier call — this is the cost guard.
function claimHash(section: string, text: string, sourceItemId: string): string {
  return `${section}::${text.trim().toLowerCase()}::${sourceItemId}`;
}

// Plain readable state machine:
//   INIT -> (GENERATE -> SCORE -> VERIFY -> STOP-CHECK -> REVISE)* -> DONE
// Stops on whichever comes first (spec order): score plateau, 4 iterations,
// or a fully supported draft.
export async function runPipeline(profileId: string, jdId: string): Promise<RunResult> {
  // --- INIT -------------------------------------------------------------
  const [profileRow] = await db.select().from(profiles).where(eq(profiles.id, profileId));
  if (!profileRow) throw new Error(`Profile ${profileId} not found`);
  const [jdRow] = await db.select().from(jobDescriptions).where(eq(jobDescriptions.id, jdId));
  if (!jdRow) throw new Error(`Job description ${jdId} not found`);

  const profile = profileRow.structuredJson as unknown as StructuredProfile;
  const jd = jdRow.parsedJson as unknown as ParsedJd;
  const jdRaw = jdRow.rawText;
  const embedder = getEmbeddingProvider();

  const runId = nanoid();
  await db.insert(runs).values({ id: runId, profileId, jdId, status: 'running' });

  try {
    return await loop(runId, profileId, jdId, profile, jd, jdRaw, embedder);
  } catch (err) {
    await db.update(runs).set({ status: 'failed' }).where(eq(runs.id, runId));
    throw err;
  }
}

async function loop(
  runId: string,
  profileId: string,
  jdId: string,
  profile: StructuredProfile,
  jd: ParsedJd,
  jdRaw: string,
  embedder: ReturnType<typeof getEmbeddingProvider>,
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
    const generated = await generateDraft({
      jd,
      jdRawText: jdRaw,
      profile,
      iteration,
      previousScoreBreakdown: iteration > 1 ? (priorBreakdown as unknown as Record<string, unknown>) : undefined,
      rejections: iteration > 1 ? rejectionLog : undefined,
      keepSections: iteration > 1 ? keepSections : undefined,
      regenerateSections: iteration > 1 ? regenerateSections : undefined,
    });
    const sections = generated.sections;

    // --- SCORE ------------------------------------------------------------
    const draftText = renderDraftText(profile, sections);
    const score = await scoreDraft(draftText, jd, jdRaw, embedder);
    const draftId = nanoid();
    await db.insert(drafts).values({
      id: draftId,
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
      ? await verifyBullets({ bullets: toVerify, profile })
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
      const isCarried = !verified.some(
        (v) => claimHash(v.section, v.text, v.sourceItemId) === claimHash(bullet.section, bullet.text, bullet.sourceItemId),
      );
      if (isCarried) carriedOver++;
      claimRows.push({
        id: nanoid(),
        draftId,
        section: bullet.section,
        text: bullet.text,
        sourceItemId: bullet.sourceItemId,
        verdict: prior.verdict,
        justification: isCarried ? `${prior.justification} (carried over — bullet unchanged)` : prior.justification,
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

    const verdictCounts = { supported: 0, partial: 0, unsupported: 0 };
    for (const bullet of flat) {
      const v = seen.get(claimHash(bullet.section, bullet.text, bullet.sourceItemId));
      if (!v) continue;
      verdictCounts[v.verdict === 'SUPPORTED' ? 'supported' : v.verdict === 'PARTIAL' ? 'partial' : 'unsupported']++;
    }

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

    // --- STOP CHECKS (first match wins, spec order) ------------------------
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

    // --- REVISE -------------------------------------------------------------
    const nextRejections: RejectionFeedback[] = [];
    const sectionsToRegen = new Set<string>();

    for (const bullet of flat) {
      const v = seen.get(claimHash(bullet.section, bullet.text, bullet.sourceItemId));
      if (!v) continue;
      if (v.verdict === 'UNSUPPORTED') {
        sectionsToRegen.add(bullet.section);
        nextRejections.push({ section: bullet.section, text: bullet.text, reason: v.justification });
      } else if (v.verdict === 'PARTIAL' && !partialAttemptedSections.has(bullet.section)) {
        // PARTIAL bullets get exactly one rewrite attempt, per section.
        sectionsToRegen.add(bullet.section);
        partialAttemptedSections.add(bullet.section);
        nextRejections.push({
          section: bullet.section,
          text: bullet.text,
          reason: `PARTIAL — narrow the claim to what the cited source actually supports: ${v.justification}`,
        });
      }
      // Persistent PARTIAL after its one rewrite attempt is accepted as-is.
    }

    // Sanitizer-dropped fabrications always feed back, regardless of verdicts.
    for (const drop of generated.droppedUnresolved) {
      sectionsToRegen.add(drop.section);
      nextRejections.push(drop);
    }

    keepSections = sections.filter((s) => !sectionsToRegen.has(s.section));
    regenerateSections = [...sectionsToRegen];
    rejectionLog = nextRejections;
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
