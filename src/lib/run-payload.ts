import { eq, desc, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { claims, drafts, jobDescriptions, profiles, runs } from '@/db/schema';
import type { GeneratedSection, ParsedJd, StructuredProfile, Verdict } from '@/types';
import type { ScoreBreakdown } from '@/lib/scoring/index';

export interface RunSummary {
  id: string;
  profileId: string;
  jdId: string;
  status: string;
  stopReason: string | null;
  finalIteration: number | null;
  converged: boolean | null;
  finalScore: number | null;
  createdAt: string;
}

export interface DraftPayload {
  id: string;
  iteration: number;
  score: number;
  scoreDelta: number | null;
  breakdown: ScoreBreakdown;
  sections: { section: string; bullets: { text: string; sourceItemId: string }[] }[];
}

export interface ClaimPayload {
  id: string;
  draftId: string;
  iteration: number;
  section: string;
  text: string;
  sourceItemId: string;
  verdict: Verdict;
  justification: string;
}

export interface RunPayload {
  run: RunSummary;
  profileName: string;
  jdTitle: string;
  drafts: DraftPayload[];
  claims: ClaimPayload[];
}

// JSON columns are stored as TEXT — always parse on read.
export function parseStoredProfile(json: string): StructuredProfile {
  return JSON.parse(json) as StructuredProfile;
}

export function parseStoredJd(json: string): ParsedJd {
  return JSON.parse(json) as ParsedJd;
}

export function listProfiles(): { id: string; name: string; itemCount: number; createdAt: string }[] {
  const rows = db.select().from(profiles).orderBy(desc(profiles.createdAt)).all();
  return rows.map((row) => {
    const parsed = parseStoredProfile(row.structuredJson);
    return {
      id: row.id,
      name: parsed.contact?.name ?? row.id,
      itemCount:
        (parsed.experience?.length ?? 0) +
        (parsed.education?.length ?? 0) +
        (parsed.projects?.length ?? 0) +
        (parsed.skills?.length ?? 0),
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export function listJds(): { id: string; title: string; createdAt: string }[] {
  const rows = db.select().from(jobDescriptions).orderBy(desc(jobDescriptions.createdAt)).all();
  return rows.map((row) => {
    const parsed = parseStoredJd(row.parsedJson);
    const firstSkill = parsed.requiredSkills?.[0];
    return {
      id: row.id,
      title: firstSkill ? `${parsed.experienceLevel} — ${firstSkill}+` : `JD ${row.id.slice(0, 6)}`,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export function listRuns(): RunSummary[] {
  const rows = db.select().from(runs).orderBy(desc(runs.createdAt)).all();
  return rows.map(serializeRun);
}

export function getRunPayload(runId: string): RunPayload | null {
  const [runRow] = db.select().from(runs).where(eq(runs.id, runId)).all();
  if (!runRow) return null;

  const draftRows = db
    .select()
    .from(drafts)
    .where(eq(drafts.runId, runRow.id))
    .orderBy(drafts.iteration)
    .all();

  const draftIds = draftRows.map((d) => d.id);
  const claimRows =
    draftIds.length > 0
      ? db.select().from(claims).where(inArray(claims.draftId, draftIds)).all()
      : [];

  let previousScore: number | null = null;
  const draftPayloads: DraftPayload[] = draftRows.map((d) => {
    const scoreDelta = previousScore === null ? null : Math.round((d.atsScore - previousScore) * 100) / 100;
    previousScore = d.atsScore;
    return {
      id: d.id,
      iteration: d.iteration,
      score: d.atsScore,
      scoreDelta,
      breakdown: JSON.parse(d.scoreBreakdownJson) as ScoreBreakdown,
      sections: JSON.parse(d.sectionsJson) as DraftPayload['sections'],
    };
  });

  return {
    run: serializeRun(runRow),
    profileName: (() => {
      const [p] = db.select().from(profiles).where(eq(profiles.id, runRow.profileId)).all();
      const parsed = p ? parseStoredProfile(p.structuredJson) : null;
      return parsed?.contact?.name ?? runRow.profileId;
    })(),
    jdTitle: (() => {
      const [j] = db.select().from(jobDescriptions).where(eq(jobDescriptions.id, runRow.jdId)).all();
      const parsed = j ? parseStoredJd(j.parsedJson) : null;
      return parsed?.requiredSkills?.length
        ? `${parsed.experienceLevel} — ${parsed.requiredSkills.slice(0, 3).join(', ')}`
        : runRow.jdId;
    })(),
    drafts: draftPayloads,
    claims: claimRows
      .map((c) => ({
        id: c.id,
        draftId: c.draftId,
        iteration: draftRows.find((d) => d.id === c.draftId)?.iteration ?? 0,
        section: c.section,
        text: c.text,
        sourceItemId: c.sourceItemId,
        verdict: c.verdict as Verdict,
        justification: c.justification,
      }))
      .sort((a, b) => a.iteration - b.iteration),
  };
}

function serializeRun(row: typeof runs.$inferSelect): RunSummary {
  return {
    id: row.id,
    profileId: row.profileId,
    jdId: row.jdId,
    status: row.status,
    stopReason: row.stopReason,
    finalIteration: row.finalIteration,
    converged: row.converged,
    finalScore: row.finalScore,
    createdAt: row.createdAt.toISOString(),
  };
}
