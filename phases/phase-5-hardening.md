# Phase 5 — Orchestrator Hardening

## What was built

Three robustness fixes to the revision loop, driven by the post-Phase-4 audit.
No behavior change for the happy path; the changes remove drift risk and
wasted LLM calls, and add offline test coverage for the loop's decision logic.

## Changes

### 1. Kept sections are merged in code, not by prompt obedience (`src/lib/orchestrator.ts`)
On revision passes the generator is now instructed to output **only** the
regenerated sections. The orchestrator then constructs the final draft with
`mergeSections()`: regenerated sections come from the generator output, kept
sections are the exact objects from the previous draft — a verbatim copy is
guaranteed by TypeScript rather than by hoping the LLM copies correctly.
`mergeSections` also restores canonical section order (`experience, projects,
education, skills`) deterministically.

### 2. New pure module `src/lib/revision.ts`
The revise-step decision logic was extracted into pure functions:
- `claimHash(section, text, sourceItemId)` — carry-forward key, whitespace/case-normalized; identical bullets never re-hit the verifier.
- `planRevision({flat, verdicts, sanitizerDrops, partialAttemptedSections})` — decides which sections regenerate and builds the rejection feedback: UNSUPPORTED always feeds back; PARTIAL gets exactly one rewrite attempt per section, then is accepted as-is; sanitizer-dropped fabrications always feed back. Pure: does not mutate its input set.
- `countVerdicts(flat, verdicts)` — S/P/U counting.

### 3. New stop reason `nothing_to_revise`
If the draft isn't clean (persistent accepted PARTIALs remain) but no section
is flagged for regeneration, the loop previously kept pointlessly re-calling
the generator until plateau/max-iterations. Now it stops immediately with
`nothing_to_revise`, counted as a quality stop → `converged: true`. This is a
deliberate 4th stop reason beside the spec's three — the spec's "one rewrite
attempt for PARTIAL" implies the draft stabilizes even if a PARTIAL persists.

### 4. Crash semantics
A run that throws now persists `status: 'failed'` **and** `converged: false`
(previously the row stayed `running` with `converged: null`).

## Tests

`tests/revision.test.ts` — 9 cases: claimHash normalization properties;
UNSUPPORTED regeneration + justification feedback; one-rewrite-attempt
behavior for PARTIAL; acceptance of persistent PARTIALs; sanitizer-drop
always feeding back; `hasRegeneration=false` for a fully supported draft;
input-set non-mutation; verdict counting including empty-verdict safety.
Full suite: **72/72 passing** (was 63).

## Verification done

- `npx tsc --noEmit` clean.
- `npx vitest run` → 72/72.
- One fix during test authoring: `claimHash` now collapses internal whitespace (`Built  X` ≡ `built x`).

## Still pending (needs OPENAI_API_KEY)

The live end-to-end pipeline run (Workstream B) remains blocked on an API key;
everything offline is verified.
