# Phase 4 — Orchestrator + CLI

## What was built

The revision-loop orchestrator (plain readable state machine) and the three
CLIs that smoke-test the system end to end, plus sample fixtures.

## Files

| File | Purpose |
|---|---|
| `src/lib/orchestrator.ts` | `runPipeline(profileId, jdId)` — the full loop |
| `scripts/import-profile.ts` | Profile ingestion CLI (JSON → `profiles.structured_json` with stable ids) |
| `scripts/parse-jd.ts` | JD parser smoke CLI |
| `scripts/run-pipeline.ts` | Full pipeline CLI with iteration table + verdict report |
| `scripts/sample-paths.ts` | Shared sample fixture paths |
| `samples/profile-sample.json` | Demo candidate (frontend engineer, 3 yrs, React/TS — deliberately lacks several JD must-haves so the revision loop has real work to do) |
| `samples/jd-senior-frontend.txt` | Demo senior-frontend JD (must: React, TypeScript, performance, CI/CD, testing; nice: GraphQL, mentoring) |

## Orchestrator — the state machine, line by line

```
INIT      load profile + JD rows from SQLite (error if missing), create runs row (status 'running')
LOOP      max 4 iterations; while no stop reason:
  GENERATE  generateDraft(jd, profile, + on iteration>1: prior breakdown, rejection log,
            keep-verbatim sections, regenerate-list)
            → generator output is sanitized in code: any bullet whose sourceItemId
              does not resolve in the profile is dropped immediately and pushed
              into the rejection log for the next pass
  SCORE     renderDraftText -> scoreDraft (deterministic) -> drafts row inserted
  VERIFY    only bullets whose claimHash (section::text::sourceItemId) is unseen go
            to the verifier; unchanged bullets carry their prior verdict forward
            and get a claims row marked "(carried over — bullet unchanged)" so the
            claims table stays complete per draft
            every verdict (new, carried, sanitizer-drop) is logged to claims
  STOP-CHECK  first match wins, spec order:
              1. iteration >= 2 AND score improvement < 2  -> 'score_plateau'
              2. iteration >= 4                            -> 'max_iterations'
              3. zero UNSUPPORTED and zero PARTIAL claims  -> 'clean'
  REVISE    sections containing UNSUPPORTED bullets regenerate with the verifier's
            justification as feedback; PARTIAL bullets get exactly ONE rewrite
            attempt per section (tracked in partialAttemptedSections) after which
            a persistent PARTIAL is accepted as-is; sanitizer drops always feed back
DONE      runs row updated: status 'done', stop_reason, final_iteration,
          converged (= stopReason !== 'max_iterations'), final_score
          (on any thrown error the run row is marked 'failed' and rethrown)
```

Cost decisions implemented:
- `seen` map keyed by claim hash — re-verification only for genuinely new/changed bullets (verifier call count drops per iteration).
- One rewrite attempt per section for PARTIAL, preventing an LLM from gaming the loop by endlessly rewording.
- Claims logged regardless of outcome — the table is the evaluation dataset.

## CLI usage

```bash
npm run import:profile -- samples/profile-sample.json   # or: -- --sample
npm run parse:jd -- samples/jd-senior-frontend.txt      # or: -- --sample
npm run pipeline -- <profileId> <jdId>
```

`run-pipeline.ts` prints: per-iteration table (score, delta, must-have %,
S/P/U counts, verified/carried counts), every claim verdict with its
justification, the final breakdown with matched/missed must-haves, and the
stop reason + converged flag.

## Verification done

- `npx tsc --noEmit` clean.
- `npx vitest run` — 63/63 passing.
- `scripts/import-profile.ts --sample` verified live: profile inserted with `exp_1..exp_2, edu_1, prj_1..prj_2, skl_1..skl_7` stable ids.
- **Fixed during testing:** an infinite loop in the profile id assigner (counter keys didn't match item prefixes, so `undefined + 1 = NaN` looped forever). Caught by the CLI smoke run.
- The LLM-dependent steps (parse-jd, run-pipeline) require `OPENAI_API_KEY`; no key was available in this build environment, so those two CLIs were executed only up to the network boundary. Run them with a key to see the full loop live — instructions are in the root README.

## Notes

- `drafts` rows are written per iteration before claims, so a crashed run leaves a recoverable partial history.
- The runs row is created as `running` first — this is what will let the future UI fire-and-forget + poll.
