# Phase 2 — ATS Scoring Module

## What was built

The deterministic ATS scoring engine: five pure scoring components combined into
a weighted total with a full per-component breakdown. **This module contains no
LLM calls by design** — scoring is reproducible and auditable: same inputs plus
same embedder produce bit-identical output every time, unlike an LLM-judged
score which would drift between runs and cannot be unit-tested.

## Files

| File | Purpose |
|---|---|
| `src/lib/embed.ts` | Embedding seam: `EmbeddingProvider` interface, deterministic 256-dim FNV-hash bag-of-stems provider (offline, used in tests + as no-key fallback), OpenAI `text-embedding-3-small` provider, `cosineSimilarity`, `getEmbeddingProvider()` (picks hash under `NODE_ENV=test` or missing key) |
| `src/lib/scoring/weights.ts` | Single source of truth: `keywordMust 0.40, keywordNice 0.15, structure 0.15, parseability 0.10, semantic 0.20` — must-haves carry 2.7x the weight of nice-to-haves |
| `src/lib/scoring/keyword.ts` | Coverage of JD `requiredSkills` (must) and `keywords`+`niceToHave` (nice) via exact + stemmed contiguous n-gram matching; nice list is deduped against must list by stem signature so nothing double-counts; returns matched/missed lists with original casing |
| `src/lib/scoring/structure.ts` | Presence of the four canonical sections (experience/projects/education/skills, alias-tolerant headers), correct section order, detectable email + phone, hard penalty for pipe/tab table layouts |
| `src/lib/scoring/parseability.ts` | Simulated ATS parse over the rendered plain text: 6 checks (no pipe columns, no HTML, consistent bullet markers, ≥95% ASCII lines, recognizable section header, no >400-char squashed lines); score = passed/total; every failure emits a human-readable issue string |
| `src/lib/scoring/semantic.ts` | Cosine similarity of embedded draft vs embedded JD, clamped to [0, 100] |
| `src/lib/scoring/index.ts` | `scoreDraft(draftText, jd, jdRawText, embedder)` — combines via weights, returns `{ total, breakdown }` where breakdown includes component scores, must/nice matched+missed lists, and parse issues (persisted later to `drafts.score_breakdown_json`) |

## Tests (Vitest, all offline — hash embedder only)

`63 tests, 6 files, all passing`:

- `tests/tokenize.test.ts` — 30 table-driven stemmer cases, tokenize/normalize behavior, contact regexes, table/HTML detection
- `tests/keyword.test.ts` — exact/stemmed match, must/nice dedupe, empty-list handling, inflection dedupe
- `tests/structure.test.ts` — full resume passes all checks; missing section, missing email, pipe table, wrong order each penalized
- `tests/parseability.test.ts` — clean draft = 100; each of the 6 issue classes individually flagged
- `tests/semantic.test.ts` — hand-computed cosine vectors (identity/orthogonal/opposite/known-angle/zero), hash-embedder determinism + normalization, ordering property
- `tests/score.test.ts` — weighted total matches manual recomputation, bounds check, matched/missed reporting, **determinism test** (identical inputs → identical breakdown JSON)

## Notable fixes during development

- Stemmer gained a trailing-`e` strip so `managed`/`manage` share a stem.
- Normalizer now splits on `.` and `-` (`react.js` → `react js`, `ci-cd` → `ci cd`) while preserving `+`/`#` for `c++`/`c#`.
- Table detection counts any pipe-bearing line and triggers at ≥3 rows.

## Verification done

- `npx vitest run` → 63/63 green.
- Git: one commit per file; test-expectation fixes committed separately from the stemmer fix.
