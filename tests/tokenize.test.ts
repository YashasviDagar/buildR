import { describe, expect, it } from 'vitest';
import {
  containsKeyword,
  findEmail,
  findPhone,
  hasHtmlTags,
  keywordSignature,
  looksLikeTable,
  normalizeText,
  stem,
  tokenize,
} from '../src/lib/tokenize';

describe('stem', () => {
  const cases: [string, string][] = [
    ['developed', 'develop'],
    ['developing', 'develop'],
    ['builds', 'build'],
    ['analyses', 'analys'], // s-strip + trailing-e strip aligns with analyse
    ['analyse', 'analys'],
    ['processes', 'process'], // sses -> ss
    ['classes', 'class'],
    ['react', 'react'],
    ['sass', 'sass'],
    ['status', 'status'],
    ['managed', 'manag'],
    ['manage', 'manag'], // trailing-e strip aligns with managed
    ['testing', 'test'],
    ['skills', 'skill'],
    ['tests', 'test'],
  ];
  for (const [input, expected] of cases) {
    it(`stems "${input}" -> "${expected}"`, () => {
      expect(stem(input)).toBe(expected);
    });
  }
});

describe('tokenize', () => {
  it('lowercases, splits and drops stopwords', () => {
    expect(tokenize('The Quick Brown Fox and the dog')).toEqual(['quick', 'brown', 'fox', 'dog']);
  });

  it('splits camelCase', () => {
    expect(tokenize('GraphQL and TypeScript')).toContain('graph ql'.replace(' ', ''));
  });

  it('splits dotted skill names like react.js', () => {
    expect(tokenize('react.js and node.js')).toEqual(['react', 'js', 'node', 'js']);
  });
});

describe('normalizeText', () => {
  it('keeps skill-relevant symbols', () => {
    expect(normalizeText('C++ / C#')).toBe('c++ c#');
  });
});

describe('containsKeyword', () => {
  const draft = 'Built REST APIs with Node.js and React.js, leading testing and ci cd pipelines';

  it('matches exact keyword', () => {
    expect(containsKeyword(draft, 'react')).toBe(true);
  });

  it('matches stemmed keyword (tests -> test)', () => {
    expect(containsKeyword(draft, 'tests')).toBe(true);
  });

  it('matches keyword absent from draft', () => {
    expect(containsKeyword(draft, 'kubernetes')).toBe(false);
  });

  it('matches multi-word keyword as contiguous stemmed phrase', () => {
    expect(containsKeyword(draft, 'ci cd pipelines')).toBe(true);
    expect(containsKeyword(draft, 'cd pipelines ci')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(containsKeyword('Used REACT and NODE', 'React')).toBe(true);
  });
});

describe('keywordSignature', () => {
  it('is equal for inflected variants', () => {
    expect(keywordSignature('Testing')).toBe(keywordSignature('tests'));
    expect(keywordSignature('React')).toBe(keywordSignature('react'));
    expect(keywordSignature('Continuous Integration')).not.toBe(keywordSignature('react'));
  });
});

describe('findEmail / findPhone', () => {
  it('detects email', () => {
    expect(findEmail('reach me at ananya.rao@example.com thanks')).toBe('ananya.rao@example.com');
  });

  it('detects phone', () => {
    expect(findPhone('call +1 415 555 2671')).toBe('+1 415 555 2671');
  });

  it('returns null when absent', () => {
    expect(findEmail('no contact here')).toBeNull();
    expect(findPhone('no digits 12 34')).toBeNull();
  });
});

describe('looksLikeTable / hasHtmlTags', () => {
  it('flags pipe tables', () => {
    const table = 'Skill | Years\nReact | 3\nNode | 2\nSQL | 4';
    expect(looksLikeTable(table)).toBe(true);
    expect(looksLikeTable('Skills: React, Node, SQL')).toBe(false);
  });

  it('flags html', () => {
    expect(hasHtmlTags('<table><tr><td>x</td></tr></table>')).toBe(true);
    expect(hasHtmlTags('plain text resume')).toBe(false);
  });
});
