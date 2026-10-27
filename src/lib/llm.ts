import './env';
import { createOpenAI } from '@ai-sdk/openai';

// Provider-agnostic chat model. Any OpenAI-compatible endpoint works
// (Groq, Gemini, Ollama, OpenAI) via LLM_BASE_URL / LLM_API_KEY / LLM_MODEL.
// Falls back to OPENAI_API_KEY + gpt-4o-mini when LLM_* vars are unset.
export function getChatModel() {
  const provider = createOpenAI({
    apiKey: process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY,
    baseURL: process.env.LLM_BASE_URL || undefined,
  });
  // .chat() = /chat/completions, which compatible providers implement
  // (the default Responses API is OpenAI-only).
  return provider.chat(process.env.LLM_MODEL || 'gpt-4o-mini');
}
