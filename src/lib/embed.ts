import { embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { stemTokens, tokenize } from './tokenize.js';

export interface EmbeddingProvider {
  name: string;
  embed(texts: string[]): Promise<number[][]>;
}

const DIMENSIONS = 256;

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// Deterministic hash-based embedder: token-stem bag-of-words projected into a
// fixed vector. Offline and reproducible — used in tests (NODE_ENV=test) and as
// a fallback when no API key is configured, so scoring never crashes.
export const hashEmbeddingProvider: EmbeddingProvider = {
  name: 'hash-mock',
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vec = new Array<number>(DIMENSIONS).fill(0);
      const tokens = stemTokens(text);
      if (tokens.length === 0) return vec;
      for (const token of tokens) {
        vec[fnv1a(token) % DIMENSIONS] += 1;
      }
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      return norm > 0 ? vec.map((v) => v / norm) : vec;
    });
  },
};

let openAiProvider: EmbeddingProvider | null = null;

function getOpenAiEmbeddingProvider(): EmbeddingProvider {
  if (!openAiProvider) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = openai.embedding('text-embedding-3-small');
    openAiProvider = {
      name: 'openai-text-embedding-3-small',
      async embed(texts: string[]) {
        const { embeddings } = await embedMany({ model, values: texts });
        return embeddings;
      },
    };
  }
  return openAiProvider;
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (process.env.NODE_ENV === 'test') return hashEmbeddingProvider;
  if (!process.env.OPENAI_API_KEY) return hashEmbeddingProvider;
  return getOpenAiEmbeddingProvider();
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Re-exported so scoring code never imports the tokenizer directly.
export { tokenize };
