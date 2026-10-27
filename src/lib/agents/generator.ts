import { generateObject } from 'ai';
import { getChatModel } from '../llm';
import {
  generatorOutputSchema,
  type GeneratedSection,
  type ParsedJd,
  type RejectionFeedback,
  type StructuredProfile,
} from '../../types';
import { getProfileItem, normalizeProfile } from '../profile/normalize';


const SYSTEM_PROMPT = `You are a resume writer working inside buildR, an ATS resume optimization system with strict claim traceability.

HARD CONSTRAINTS — violating any of these is a failure:
1. EVERY bullet you write MUST include a sourceItemId that references an item id that exists in the candidate profile provided to you (ids look like exp_1, prj_2, skl_3, edu_1). A bullet with no traceable source must NOT be written.
2. You may NOT invent skills, metrics, outcomes, employers, degrees or achievements. If nothing in the profile supports a JD requirement, OMIT that requirement entirely. An omitted requirement is correct behavior; a fabricated one is a critical error.
3. Metrics (percentages, durations, team sizes, dollar amounts) may appear ONLY if the cited source item contains them verbatim. Never invent or inflate a number.
4. Tailor wording toward the JD's required skills and keywords ONLY where the cited source genuinely backs them. Rephrasing is allowed; expanding the claim's scope is not.
5. Do not cite the same sourceItemId for a claim the source item does not cover.
6. Keep the exact scope of each source line: "helped build" stays "helped build" (never "built"), "worked with" never becomes "led". Do NOT add purposes, outcomes or qualities that are not in the source (for example "to ensure quality" or "to improve reliability").
7. Write one bullet for each highlight of the source item. Never drop a highlight, even a short one.

Style:
- Use correct grammar and spelling. Keep tense consistent: past tense for past roles and projects, present tense for the current role. No first-person pronouns. Every bullet is one complete sentence that starts with a capital letter and ends with a period.
- Write concise, ATS-friendly resume bullets in plain text (no markdown, no tables, no unicode symbols beyond standard ASCII).
- Start bullets with a strong past-tense verb.
- Keep each bullet under 30 words.

Output: JSON of exactly this shape, nothing else:
{"sections":[{"section":"experience","bullets":[{"text":"...","sourceItemId":"exp_1"}]}]}
"sections" is a plain array. "section" must be one of: experience, projects, education, skills (never an employer or project name). Group all bullets of a section together.`;

export interface GeneratorInput {
  jd: ParsedJd;
  jdRawText: string;
  profile: StructuredProfile;
  iteration: number;
  previousScoreBreakdown?: Record<string, unknown>;
  rejections?: RejectionFeedback[];
  keepSections?: GeneratedSection[];
  regenerateSections?: string[];
}

export interface GeneratedDraft {
  sections: GeneratedSection[];
  droppedUnresolved: RejectionFeedback[];
}

// Goal-directed generator: writes ATS-tailored bullets, each traceable to a
// profile item id. Defensive code layer afterwards: any bullet whose
// sourceItemId does not resolve in the profile is dropped here and reported as
// a rejection, independent of the verifier.
export async function generateDraft(input: GeneratorInput): Promise<GeneratedDraft> {
  const { object } = await generateObject({
    model: getChatModel(),
    schema: generatorOutputSchema,
    // Some free models wrap arrays as {"items":[...]}; unwrap before validating.
    experimental_repairText: async ({ text }) => {
      try {
        const o = JSON.parse(text);
        if (o?.sections && !Array.isArray(o.sections) && Array.isArray(o.sections.items)) {
          o.sections = o.sections.items;
        }
        return JSON.stringify(o);
      } catch {
        return null;
      }
    },
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(input),
    temperature: 0.2,
  });

  const validIds = new Set(allItemIds(input.profile));
  const droppedUnresolved: RejectionFeedback[] = [];
  const sections: GeneratedSection[] = [];

  for (const section of object.sections) {
    const seen = new Set<string>();
    const bullets = [];
    for (const bullet of section.bullets) {
      if (!validIds.has(bullet.sourceItemId)) {
        droppedUnresolved.push({
          section: section.section,
          text: bullet.text,
          reason: `sourceItemId "${bullet.sourceItemId}" does not exist in the candidate profile — likely a fabrication`,
        });
        continue;
      }
      const key = bullet.text.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      bullets.push({ text: bullet.text.trim(), sourceItemId: bullet.sourceItemId });
    }
    if (bullets.length > 0) sections.push({ section: section.section, bullets });
  }

  // Skills are listed, never narrated: rewriting "Skill: Python" into
  // "Utilized Python for backend services" invents claims the profile never
  // made. Built in code so the section is grounded by construction.
  if (input.profile.skills.length > 0) {
    const skillBullets = input.profile.skills
      .filter((sk) => sk.itemId)
      .map((sk) => ({ text: sk.name.trim(), sourceItemId: sk.itemId as string }));
    const rest = sections.filter((sec) => sec.section !== 'skills');
    return { sections: [...rest, { section: 'skills', bullets: skillBullets }], droppedUnresolved };
  }

  return { sections, droppedUnresolved };
}

function allItemIds(profile: StructuredProfile): string[] {
  return [
    ...profile.experience.map((x) => x.itemId).filter((x): x is string => Boolean(x)),
    ...profile.education.map((x) => x.itemId).filter((x): x is string => Boolean(x)),
    ...profile.projects.map((x) => x.itemId).filter((x): x is string => Boolean(x)),
    ...profile.skills.map((x) => x.itemId).filter((x): x is string => Boolean(x)),
  ];
}

function buildUserPrompt(input: GeneratorInput): string {
  const parts: string[] = [];

  parts.push(`## Target job description (raw)\n${input.jdRawText}`);
  parts.push(
    `## Parsed JD\n${JSON.stringify(
      {
        requiredSkills: input.jd.requiredSkills,
        keywords: input.jd.keywords,
        niceToHave: input.jd.niceToHave,
        qualifications: input.jd.qualifications,
        experienceLevel: input.jd.experienceLevel,
      },
      null,
      2,
    )}`,
  );

  parts.push(
    `## Candidate profile (the ONLY allowed source of claims)\n${JSON.stringify(input.profile, null, 2)}`,
  );

  if (input.previousScoreBreakdown && input.iteration > 1) {
    parts.push(
      `## Previous iteration score breakdown — improve the weak components\n${JSON.stringify(
        input.previousScoreBreakdown,
        null,
        2,
      )}`,
    );
  }

  if (input.rejections && input.rejections.length > 0) {
    parts.push(
      `## Rejected claims from the verifier — do NOT repeat these fabrications. Each bullet was rejected because the cited source item does not support it:\n${input.rejections
        .map((r, i) => `${i + 1}. [${r.section}] "${r.text}" — ${r.reason}`)
        .join('\n')}`,
    );
  }

  if (input.regenerateSections && input.regenerateSections.length > 0) {
    parts.push(
      `## Sections to REGENERATE (your output must contain ONLY these sections, fully rewritten): ${input.regenerateSections.join(', ')}`,
    );
    if (input.keepSections && input.keepSections.length > 0) {
      parts.push(
        `## Sections NOT to output (kept by the system as-is; shown only so you do not duplicate them):\n${JSON.stringify(input.keepSections, null, 2)}`,
      );
    }
  }

  const validIds = new Set(allItemIds(normalizeProfile(input.profile)));
  parts.push(
    `Valid sourceItemIds (cite ONLY these): ${[...validIds].join(', ')}`,
  );

  return parts.join('\n\n');
}

// Re-exported for orchestrator convenience.
export { getProfileItem };
