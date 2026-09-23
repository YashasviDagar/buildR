import type { EmbeddingProvider } from '../embed.js';
import { cosineSimilarity } from '../embed.js';

// Semantic similarity between draft and JD as cosine similarity of their
// embeddings, rescaled from [-1, 1] to [0, 100] (negatives clamp to 0).
export async function semanticScore(
  draftText: string,
  jdText: string,
  embedder: EmbeddingProvider,
): Promise<number> {
  const [draftVec, jdVec] = await embedder.embed([draftText, jdText]);
  const cos = cosineSimilarity(draftVec, jdVec);
  return round2(Math.max(0, cos) * 100);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
