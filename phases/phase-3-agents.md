# Phase 3 — Agents

## What was built

The three LLM agents (JD parser, generator, verifier) plus the profile
ingestion layer that produces the stable ids the agents exchange. All
structured output goes through the Vercel AI SDK `generateObject` + Zod; all
models are `gpt-4o-mini`.

## Files

| File | Purpose |
|---|---|
| `src/lib/profile/normalize.ts` | `normalizeProfile(input)` — Zod-validated normalizer that assigns stable unique `itemId`s (`exp_1`, `edu_2`, `prj_3`, `skl_4`; collision-safe even when the input already carries ids); `getProfileItem(profile, id)` used by the generator sanitizer and the verifier |
| `src/lib/profile/render.ts` | `renderProfileItemContent(item)` — the **verbatim** source-item text the verifier judges against; `renderDraftText(profile, sections)` — deterministic plain-text draft rendering (contact header generated in code, never by the LLM); `renderJdText(jd)` for semantic scoring |
| `src/lib/agents/jd-parser.ts` | Single-shot (not a loop) `generateObject` call, temperature 0. Prompt forces explicit must-have vs nice-to-have classification (this split feeds scoring weights), alias normalization (`react.js` → `react`), and level inference (junior/mid/senior/lead/unknown from phrasing like "3+ years"). Code-level canonicalization after the call: lowercase, trim, dedupe, and no keyword double-listed as a required skill. Output persisted later to `job_descriptions.parsed_json` |
| `src/lib/agents/generator.ts` | Goal-directed bullet writer. System prompt hard constraints: (1) every bullet must cite an existing `sourceItemId`; (2) omit JD requirements the profile cannot support instead of inventing; (3) metrics only if verbatim in the source; (4) tailor wording only where the source backs it. **Defensive code layer:** after generation every `sourceItemId` is validated against the profile — non-resolving bullets are dropped and returned as rejection feedback even before the verifier sees them; duplicate texts deduped. On revision passes the user prompt (never the system prompt) carries the prior score breakdown, the rejection list with justifications, the sections to regenerate, and keep-verbatim sections |
| `src/lib/agents/verifier.ts` | The core novelty. **Separate LLM call with a separate system prompt** — the function signature accepts only `{ bullets, profile }`, so generator reasoning/prompt cannot leak by construction. Batched: one call per draft, each bullet paired with its cited item's verbatim content. Strict rules: no charitable inference — a claimed metric/outcome absent from the source is UNSUPPORTED even if plausible; PARTIAL for scope overreach; SUPPORTED only when fully grounded. Code-level pre-check makes a nonexistent `sourceItemId` UNSUPPORTED without an LLM call. **Fail-safety:** a missing verdict is UNSUPPORTED ("verifier failed to return a verdict"), never a silent pass |

## Isolation guarantees (viva points)

1. Generator and verifier are separate `generateObject` calls with separate system prompts.
2. The verifier's TypeScript signature has no parameter that could carry generator context — it sees the finished bullet + the cited item's verbatim content only.
3. Verdicts are mapped back by `bulletIndex` (the LLM is never trusted with ids), and response completeness is enforced: a missing verdict degrades to UNSUPPORTED.

## Verification done

- `npx tsc --noEmit` clean across all modules.
- Agents are network-dependent (OpenAI), so behavior is exercised end-to-end in Phase 4's pipeline run rather than unit tests; the deterministic scoring around them is fully unit-tested in Phase 2.

## Notes

- Embedding provider landed in Phase 2 (`src/lib/embed.ts`) — real `text-embedding-3-small` path when `OPENAI_API_KEY` is set, deterministic hash fallback otherwise.
- Profile ingestion API route + CLI come with the Phase 4 scripts (`scripts/import-profile.ts`) since this pass has no frontend.
