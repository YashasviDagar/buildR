import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { parsedJdSchema, type ParsedJd } from '../../types.js';

const MODEL_ID = 'gpt-4o-mini';

const SYSTEM_PROMPT = `You are a meticulous technical recruiter parsing a raw job description into structured data for an ATS resume optimization system.

Your job:
1. requiredSkills — the MUST-HAVE skills. Only put a skill here if the posting treats it as non-negotiable ("required", "must have", "you will need"). If a requirement is clearly optional or a bonus, it belongs in niceToHave, NOT here. This distinction directly feeds downstream scoring weights, so misclassifying a nice-to-have as required is a serious error.
2. keywords — recurring terms, technologies, domains, methodologies and tooling that appear in the posting but are not cleanly "skills" (e.g. "REST APIs", "CI/CD", "code review", "accessibility").
3. qualifications — education, years of experience, certifications, work authorization, and other non-skill requirements, kept as short verbatim-ish phrases.
4. experienceLevel — infer exactly one of: junior, mid, senior, lead. Use the stated years and responsibility language: 0-2 => junior, 2-5 => mid, 5-8 => senior, 8+ or staff/principal/architect/lead => lead. If genuinely uninferrable, use unknown.
5. niceToHave — explicitly optional items ("bonus", "plus", "preferred but not required", "nice to have").

Rules:
- Normalize skill casing to canonical lowercase form (e.g. "React.js" -> "react", "JavaScript" -> "javascript").
- Never invent requirements that are not in the text.
- Do not split one requirement into duplicates; merge near-identical items into one.
- Output ONLY the structured data.`;

export interface ParsedJdResult {
  parsed: ParsedJd;
}

// Single-shot JD parser. Not a loop: one generateObject call, temperature 0.
export async function parseJd(rawText: string): Promise<ParsedJdResult> {
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { object } = await generateObject({
    model: openai(MODEL_ID),
    schema: parsedJdSchema,
    system: SYSTEM_PROMPT,
    prompt: rawText,
    temperature: 0,
  });

  // The LLM classifies; the code enforces canonical form: lowercase, trimmed,
  // non-empty, deduped (case-insensitively), deterministic order.
  const canonicalize = (arr: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const term of arr) {
      const t = term.trim().toLowerCase();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  };

  const parsed: ParsedJd = {
    requiredSkills: canonicalize(object.requiredSkills),
    keywords: canonicalize(object.keywords).filter((k) => !object.requiredSkills.some((s) => s.toLowerCase() === k)),
    qualifications: canonicalize(object.qualifications),
    experienceLevel: object.experienceLevel,
    niceToHave: canonicalize(object.niceToHave).filter(
      (k) => !object.requiredSkills.some((s) => s.toLowerCase() === k),
    ),
  };
  return { parsed };
}
