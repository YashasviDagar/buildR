import { generateObject } from 'ai';
import { getChatModel } from '../llm';
import { z } from 'zod';
import { structuredProfileSchema, type StructuredProfile } from '../../types';
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
- education: degree, school, year.
- projects: name, short description, tech stack mentioned, key outcomes as highlights.
- skills: flat list of skills actually stated, each as its own item with an optional category.
- summary: one sentence in resume style WITHOUT the candidate's name or any pronoun, e.g. "Backend developer with 2 years of experience building REST APIs." Only from stated facts.
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
  return { profile };
}
