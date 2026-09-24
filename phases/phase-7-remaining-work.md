# Phase 7 — Remaining Work

## What was built

The three items left over from the end-of-pass audit: raw-text profile
ingestion, an offline integration test of the full orchestrator state machine,
and a data-model fix the test surfaced. GitHub push was also confirmed
(origin/main already matched local `main`).

## 1. Raw-text profile ingestion

- `src/lib/agents/profile-parser.ts` — single-shot `generateObject` (temperature 0) that converts freeform resume prose into a structured profile. **Anti-hallucination detail:** the LLM-facing schema deliberately relaxes `contact.email` to a plain string so the model can answer "no email present" instead of inventing one to satisfy the format constraint; strict validation (`z.string().email()`) runs afterwards in `normalizeProfile`, failing the ingest with a clear error.
- `POST /api/profiles` now accepts both `{ structuredJson }` and `{ rawText }`; the raw path stores the original text in `profiles.raw_text`.
- `scripts/import-profile.ts --raw <resume.txt>` — CLI path (needs API key).
- `/profiles/new` gains a third tab, "Paste resume text", wired to the raw path.

## 2. Orchestrator DI seam + offline integration tests

- `PipelineAgents` interface: `generate` + `verify` injectable; production wiring defaults to the real LLM agents (`productionAgents`).
- `tests/orchestrator.test.ts` — **the full revision loop now runs end-to-end in tests** with scripted mock agents against a fresh temp SQLite DB (migrations applied programmatically, deterministic hash embedder). Five scenarios, all passing:
  1. **Clean stop** — iteration 1 has a grounded + a fabricated bullet; verifier rejects the fabrication; the revision pass honors the rejection feedback, adds a grounded bullet citing a different source item → coverage jumps → zero unsupported → `clean`, `converged: true`. Asserts: 2 drafts scoped to the run, rejection feedback reached the generator on iteration 2, carried-over claims logged, runs row `done`/`clean`.
  2. **Score plateau** — revisions can't move the score → stops at iteration 2, `converged: true`.
  3. **`nothing_to_revise`** — a PARTIAL survives its one rewrite attempt (even with the score still improving) → accepted, loop stops without further generator calls.
  4. **Max iterations** — fabrication persists across 4 iterations while scores keep improving → `max_iterations`, `converged: false`.
  5. **Payload scoping** — `getRunPayload` returns the run's drafts/claims with the profile name resolved.
- This closes most of the "live run" risk: the state machine, stop ordering, verdict carry-forward, claims persistence, and payload plumbing are all exercised. What remains key-dependent is only the LLM boundary itself.

## 3. Bug found and fixed: drafts were not linked to runs

The integration test caught a real product bug: `drafts` had no `run_id`, so two runs on the same profile + JD pair would mix their drafts/claims in `getRunPayload` (and therefore in the UI). Fix:
- `drafts.run_id` column + `drafts_run_idx` index (migration `0001_complex_finance`, applied to `buildr.db`).
- Orchestrator stamps `runId` on every draft.
- `getRunPayload` filters drafts by `runId` — multiple runs over the same profile/JD are now properly isolated.

## Verification done

- `npx vitest run` → **77/77** (72 unit + 5 integration).
- `npx tsc --noEmit` clean.
- `npm run build` → all routes compiled.
- Git remote check: `origin/main` already at local `main` — everything is on GitHub.

## Still blocked on an `OPENAI_API_KEY`

Only the real-LLM boundary remains unverified: `parse-jd.ts`, the generator/verifier live calls, and a UI-driven live run. Command sequence when a key exists is documented in the root README.
