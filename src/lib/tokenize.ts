const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'you', 'our', 'we', 'their', 'they',
]);

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitCamelCase(text: string): string {
  return text.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

// Porter-lite stemmer: deliberately simple, deterministic, good enough for
// ATS keyword matching where inflection differences are shallow. A single
// suffix rule applies, then a final trailing-'e' strip so "managed" and
// "manage" land on the same stem.
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
  else if (w.length > 4 && w.endsWith('sses')) w = w.slice(0, -2);
  else if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed') && !/[aeiou]{2}ed$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

export function stemTokens(text: string): string[] {
  return tokenize(text).map(stem);
}

// Check whether a keyword appears in text under exact or stemmed matching.
// Multi-word keywords require a contiguous stemmed n-gram match.
export function containsKeyword(text: string, keyword: string): boolean {
  const textTokens = stemTokens(text);
  const keywordTokens = tokenize(keyword).map(stem);
  if (keywordTokens.length === 0) return false;
  if (keywordTokens.length === 1) return textTokens.includes(keywordTokens[0]);
  outer: for (let i = 0; i <= textTokens.length - keywordTokens.length; i++) {
    for (let j = 0; j < keywordTokens.length; j++) {
      if (textTokens[i + j] !== keywordTokens[j]) continue outer;
    }
    return true;
  }
  return false;
}

// Stable stem-based signature used to dedupe keywords across lists.
export function keywordSignature(keyword: string): string {
  return stemTokens(keyword).join(' ');
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(?:\+\d{1,3}[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}/;

export function findEmail(text: string): string | null {
  return text.match(EMAIL_RE)?.[0] ?? null;
}

export function findPhone(text: string): string | null {
  return text.match(PHONE_RE)?.[0] ?? null;
}

// Detection of layout artifacts that break classic ATS parsers.
export function looksLikeTable(text: string): boolean {
  const lines = text.split(/\r?\n/);
  let pipeRowCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') || trimmed.includes('|') || /\t.*\t/.test(line)) {
      pipeRowCount++;
    }
  }
  return pipeRowCount >= 3;
}

export function hasHtmlTags(text: string): boolean {
  return /<\s*(table|tr|td|div|span|b|br|p)\b[^>]*>/i.test(text);
}
