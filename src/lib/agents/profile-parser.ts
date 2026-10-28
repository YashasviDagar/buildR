import { generateObject } from 'ai';
import { getChatModel } from '../llm';
import { z } from 'zod';
import { experienceItemSchema, structuredProfileSchema, type StructuredProfile } from '../../types';
import { normalizeProfile } from '../profile/normalize';


// LLM-facing schema: deliberately lenient (email as plain string) so the model
// can say "no email present" instead of hallucinating one to satisfy the
// format constraint. Strict validation happens afterwards in normalizeProfile.
const llmProfileSchema = structuredProfileSchema.extend({
  contact: structuredProfileSchema.shape.contact.extend({ email: z.string() }),
});

const SYSTEM_PROMPT = `You are a resume data extraction engine. You receive freeform resume text and must convert it into a structured profile JSON for an ATS resume optimization system.

Rules:
- Extract ONLY what the text actually says. Never invent employers, degrees, dates, skills, metrics or achievements. If the text is ambiguous, keep the ambiguity rather than guessing.
- If the email address is not present in the text, set contact.email to the empty string — do NOT invent one.
- experience: one entry per distinct role. Put the real accomplishments/achievements/duties into highlights, one phrase each, as close to verbatim as possible. Metrics (%, numbers, durations) must be copied exactly as written — never rounded or inflated.
- education: degree INCLUDING the field of study exactly as written ("b.tech information technology" -> degree "B.Tech Information Technology"), school, year.
- projects: name, short description, tech stack mentioned, key outcomes as highlights.
- skills: every skill actually stated, each as its own item. Set "category" to the group label used in the resume (for example a line "Languages: C++, Python" gives category "Languages" for C++ and for Python). Keep the resume's own group names ("Frontend", "Backend", "Databases & Infra", "Developer Tools"). If the skills are one plain list, leave category empty. Every group heading stays its own category, including "Coursework" and "AI"; never merge a group into another.
- achievements: certifications, awards, scholarships, ratings and rankings (for example "LeetCode: maximum rating of 1687"). Set "label" to the part before the colon when there is one (for example "Certification", "LeetCode", "HackerRank"), and "text" to the rest, copied as written. Include EVERY line under a heading like "Certifications", "Achievements", "Awards" or "Certifications & Achievements", one entry per line, including coding-platform ratings (LeetCode, Codeforces, HackerRank, CodeChef) and academic results. Do not stop after the certifications. Do NOT put these in skills or experience.
- leadership: clubs, committees, volunteering and extracurricular roles, as experience-style entries (title = the role, org = the organization, dates, highlights).
- projects: also fill "dates" when the resume shows a date or range next to the project, and "role" when the heading shows the candidate's role (for example "IYKYK Prints | Founder & Developer | Next.js" gives role "Founder & Developer"). Never put a role or title into highlights.
- education: put the date range in "year" (for example "July 2024 - May 2028") and a grade such as CGPA or a percentage in "details".
- summary: ONLY copy a summary or objective that the resume itself contains (tidied, without the name or pronouns). If the resume has no summary section, leave summary empty. Never write one yourself.
- Formatting cleanup (this is allowed and expected): fix capitalization and spelling of names, employers, schools, degrees and job titles ("priya sharma" -> "Priya Sharma"); write skills in their standard form ("python" -> "Python", "postgres" -> "PostgreSQL", "aws" -> "AWS"); write dates like "Jan 2023" and use "Present" for a current role (never "now" or "till date"). Never change facts while cleaning up.
- Output ONLY the structured data.`;

export interface ProfileParseResult {
  profile: StructuredProfile;
}

// Single-shot profile structuring: freeform resume prose -> normalized profile
// with stable item ids assigned by normalizeProfile afterwards.
export async function parseProfileFromText(rawText: string): Promise<ProfileParseResult> {
  const { object } = await generateObject({
    model: getChatModel(),
    schema: llmProfileSchema,
    system: SYSTEM_PROMPT,
    prompt: rawText,
    temperature: 0,
  });

  let profile: StructuredProfile;
  try {
    profile = normalizeProfile(object);
  } catch (err) {
    throw new Error(`extracted profile failed validation: ${(err as Error).message}`);
  }

  // The main call can run out of room and drop trailing list items, so
  // achievements and leadership get their own small call. Keep whichever
  // list is longer.
  try {
    const extra = await extractExtras(rawText);
    const achievements = extra.achievements.map((a) => ({ ...a, text: stripLinkLabel(a.text) }));
    if (achievements.length > (profile.achievements?.length ?? 0)) profile = { ...profile, achievements };
    if (extra.leadership.length > (profile.leadership?.length ?? 0)) profile = { ...profile, leadership: extra.leadership };
  } catch {
    // keep what the main call found
  }
  profile = {
    ...profile,
    achievements: profile.achievements?.map((a) => ({ ...a, text: stripLinkLabel(a.text) })),
  };
  return { profile };
}

// Right-aligned link labels in the source ("leetcode/profile") end up glued to the text.
function stripLinkLabel(text: string): string {
  return text.replace(/\s+[\w.-]+\/profile\s*$/i, '').trim();
}

const extrasSchema = z.object({
  achievements: z.array(z.object({ label: z.string().optional(), text: z.string().min(1) })),
  leadership: z.array(experienceItemSchema),
});

const EXTRAS_PROMPT = `From the resume text, extract two lists.

1) achievements: list EVERY entry in the sections for certifications, achievements, awards, scholarships, competitive-programming ratings and academic results (headings such as "Certifications & Achievements", "Achievements", "Awards", "Honors").
- One entry per line of the resume. Never skip or merge entries.
- "label" is the part before the colon (for example "Certification", "LeetCode", "Codeforces", "HackerRank", "Academics"); "text" is the rest, copied as written.
- Drop trailing profile-link words that are only link labels (for example "leetcode/profile").
- If there is no such section, return an empty list. Do not invent entries.

2) leadership: EVERY role under headings such as "Leadership", "Extracurricular", "Clubs", "Volunteering". One entry per role: title = the role (for example "Senior Core Member"), org = the organization, startDate and endDate as written (endDate "Present" for current roles), highlights = the bullet points copied as written. Do not invent entries.`;

async function extractExtras(rawText: string) {
  const { object } = await generateObject({
    model: getChatModel(),
    schema: extrasSchema,
    system: EXTRAS_PROMPT,
    prompt: rawText,
    temperature: 0,
  });
  return object;
}
