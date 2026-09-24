import { describe, expect, it } from 'vitest';
import { hashEmbeddingProvider, cosineSimilarity } from '../src/lib/embed';
import { semanticScore } from '../src/lib/scoring/semantic';

describe('cosineSimilarity (hand-computed vectors)', () => {
  it('identical unit vectors -> 1', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
  });

  it('orthogonal vectors -> 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('opposite vectors -> -1', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(-1);
  });

  it('known angle: [1,1] vs [1,0] -> sqrt(2)/2', () => {
    expect(cosineSimilarity([1, 1], [1, 0])).toBeCloseTo(Math.SQRT1_2);
  });

  it('zero vector -> 0 without NaN', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('hashEmbeddingProvider determinism', () => {
  it('same text twice -> identical vector', async () => {
    const [a, b] = await hashEmbeddingProvider.embed(['built apis with react', 'built apis with react']);
    expect(a).toEqual(b);
  });

  it('different texts -> different vectors', async () => {
    const [a, b] = await hashEmbeddingProvider.embed(['react frontend', 'kubernetes operator']);
    expect(a).not.toEqual(b);
  });

  it('vectors are unit-normalized', async () => {
    const [v] = await hashEmbeddingProvider.embed(['react react react typescript']);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1);
  });
});

describe('semanticScore', () => {
  it('closer texts score higher', async () => {
    const low = await semanticScore(
      'kubernetes helm operator rust',
      'react frontend with typescript',
      hashEmbeddingProvider,
    );
    const high = await semanticScore(
      'react frontend typescript',
      'react frontend with typescript and node',
      hashEmbeddingProvider,
    );
    expect(high).toBeGreaterThan(low);
  });

  it('is bounded 0-100', async () => {
    const result = await semanticScore('a', 'b', hashEmbeddingProvider);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });
});
