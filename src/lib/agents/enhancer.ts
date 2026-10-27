import { generateText } from 'ai';
import { getChatModel } from '../llm';

export type EnhanceKind = 'summary' | 'bullets';

const PROMPTS: Record<EnhanceKind, string> = {
  summary: `You polish the professional summary of a resume. Rewrite the text into 2-3 concise sentences in resume style: no pronouns ("I", "my"), no candidate name, correct grammar and spelling.`,
  bullets: `You polish resume bullet points. Rewrite each line as one concise, ATS-friendly bullet: start with a strong past-tense verb (present tense if the role is current), correct grammar and spelling, under 30 words, ending with a period. Keep one bullet per line, same order, no bullet symbols.`,
};

const RULES = `
HARD RULES:
- Use ONLY facts present in the text. Never add skills, tools, metrics, numbers, employers or outcomes that are not already there. If the text is vague, keep it modest instead of embellishing.
- Keep every number exactly as written.
- Output ONLY the rewritten text, with no preamble and no quotes.`;

export async function enhanceText(
  kind: EnhanceKind,
  text: string,
  context?: string,
): Promise<string> {
  const { text: out } = await generateText({
    model: getChatModel(),
    system: PROMPTS[kind] + RULES,
    prompt: context ? `Context (do not copy into output): ${context}\n\nText:\n${text}` : text,
    temperature: 0.2,
  });
  return out.trim().replace(/^["'`]+|["'`]+$/g, '');
}
