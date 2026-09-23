# buildR — Implementation Plan

buildR is an agentic ATS resume optimization system. It takes a candidate's profile and a target job description, and produces an ATS-optimized resume through an iterative **generate → score → verify → revise** loop. Every generated claim must be traceable to something the candidate actually provided — a separate verifier agent rejects anything it can't ground, so buildR cannot fabricate skills or achievements.

## Locked decisions

| Decision | Choice |
|---|---|
| LLM provider | OpenAI `gpt-4o-mini` (all agents) + `text-embedding-3-small` (semantic similarity) |
| Verifier granularity | Batched — one verifier call per draft containing all new/changed bullets (preserves the separation constraint, ~10x cheaper than per-bullet calls) |
| Embeddings | Real provider embeddings in production; deterministic hash-vector mock under `NODE_ENV=test` so scoring tests are pure and offline |
| Database | Local SQLite file (`buildr.db`) via better-sqlite3 + Drizzle, migrations via drizzle-kit |

## Stack

- Node 20+, TypeScript throughout (no Python)
- Next.js App Router for UI + API routes
- better-sqlite3 + Drizzle ORM for storage
- Vercel AI SDK (`generateObject`) + Zod for all structured LLM outputs
- Tailwind + shadcn/ui for the frontend
- Recharts for score/iteration visualizations
- tsx for standalone scripts, Vitest for deterministic unit tests

## Repository layout

```
D:\buildR
├── src/
│   ├── db/
│   │   ├── schema.ts          # Drizzle tables
│   │   ├── client.ts          # better-sqlite3 + drizzle singleton
│   │   └── migrations/        # drizzle-kit output
│   ├── lib/
│   │   ├── profile/           # ingestion + stable ids
│   │   ├── agents/
│   │   │   ├── jd-parser.ts   # JD Parser Agent
│   │   │   ├── generator.ts   # Generator Agent
│   │   │   └── verifier.ts    # Verifier Agent
│   │   ├── scoring/           # pure, deterministic ATS scoring
│   │   │   ├── keyword.ts  structure.ts  parseability.ts  semantic.ts
│   │   │   ├── weights.ts     # must-have vs nice-to-have weights
│   │   │   └── index.ts       # combine + breakdown object
│   │   ├── orchestrator.ts    # plain readable state machine
│   │   ├── embed.ts           # embeddings w/ deterministic mock for tests
│   │   └── tokenize.ts        # stemmer + contact-info detector (shared, pure)
│   ├── app/                   # pages + API routes (frontend pass)
│   └── types.ts               # Zod schemas shared across modules
├── scripts/
│   ├── parse-jd.ts            # JD parser smoke CLI
│   ├── run-pipeline.ts        # full pipeline CLI
│   └── import-profile.ts      # profile ingest CLI
├── tests/                     # Vitest
├── drizzle.config.ts
└── .env.example               # OPENAI_API_KEY only — no secrets committed
```

## Data model (Drizzle schema)

Exactly five tables:

- **`profiles`** — `id` (nanoid/text pk), `raw_text` (nullable — may arrive as JSON directly), `structured_json`. JSON validated by Zod at write time: `{ education[], projects[], skills[], experience[] }`; **every item carries a stable `itemId`** (`edu_1`, `prj_3`, `skl_2`, `exp_4`) generated positionally at ingest so Generator→Verifier→claims references resolve across runs.
- **`job_descriptions`** — `id`, `raw_text`, `parsed_json` (Zod-validated: `requiredSkills[]`, `keywords[]`, `qualifications[]`, `experienceLevel`, `niceToHave[]`).
- **`drafts`** — `id`, `profile_id`, `jd_id`, `iteration`, `sections_json` (each bullet stored with its `sourceItemId`), `ats_score` (0–100), `score_breakdown_json`, `created_at`.
- **`claims`** — `id`, `draft_id`, `section`, `text`, `source_item_id`, `verdict` (`SUPPORTED | PARTIAL | UNSUPPORTED`, check-constrained), `justification`. Every verdict logged regardless of outcome — this is the evaluation dataset.
- **`runs`** — `id`, `profile_id`, `jd_id`, `final_iteration`, `converged` (bool), `final_score`.

Indexes on `claims.draft_id` and `drafts.(profile_id, jd_id)`.

## Agents

### 1. JD Parser Agent — single-shot (`src/lib/agents/jd-parser.ts`)

- One `generateObject` call, gpt-4o-mini, temperature 0.
- System prompt: extract only what a well-qualified reader could; classify each skill/requirement as **must-have vs nice-to-have explicitly** (this split feeds ATS scoring weights); normalize skill aliases minimally (`react.js` → `react`); infer `experienceLevel` as `junior|mid|senior|lead|unknown` from phrases ("3+ years" → mid, "5–8 years" → senior).
- Output schema (Zod): `{ requiredSkills[], keywords[], qualifications[], experienceLevel, niceToHave[] }`.
- Guardrail: dedupe + lowercase-normalize in code after the call — LLM classifies, code enforces canonical form. Persisted to `job_descriptions.parsed_json`.
- CLI: `scripts/parse-jd.ts <jd.txt | --sample>` → insert row → print parsed JSON.

### 2. Profile ingestion (`src/lib/profile/`)

Two paths into one normalizer:

1. **JSON importer** — Zod-validated against the four typed sections; auto-assigns `itemId`s if absent; validates uniqueness.
2. **Raw-text route** — single-shot `generateObject` (temperature 0) structures freeform resume prose into the same schema.

Normalizer guarantees: stable ids, per-type required core fields (`title`/`org`/`highlights`, `skill_name`, …) so the Verifier has concrete content to check `sourceItemId` references against. Exposed as `POST /api/profiles` + `scripts/import-profile.ts`. No UI form in this pass.

### 3. Generator Agent (`src/lib/agents/generator.ts`)

- `generateObject`, gpt-4o-mini, temperature 0.2.
- Inputs: parsed JD, structured profile, and on passes ≥ 2: prior `score_breakdown` + rejection list `[{ section, text, reason }]` injected as a structured feedback block in the user message (never the system prompt).
- **Hard constraint (system prompt):** every bullet MUST carry a `sourceItemId` that exists in the provided profile item id list; if nothing in the profile supports a JD requirement, omit that requirement entirely — never invent. Metrics may only come from the source item.
- **Defensive code layer:** after generation, server-side validate every `sourceItemId` resolves to a real profile item. Non-resolving bullets are dropped and added to the rejection list — guardrail independent of the verifier.
- Output schema: `{ sections: [{ section, bullets: [{ text, sourceItemId }] }] }`, section names constrained to the profile's sections.
- Contact/header block generated deterministically in code, not by the LLM — gives the structure score a stable target.

### 4. ATS Scoring Module (`src/lib/scoring/`) — deterministic, not an LLM

Deliberate design choice: scoring is **pure deterministic code, not LLM-judged**, so scores are reproducible and auditable — same input, same score, every time. Each component is its own pure file with its own test file.

1. **`keyword.ts`** — coverage of JD `requiredSkills` (must weight) and `keywords` + `niceToHave` (nice weight), exact + stemmed match via a small Porter-lite stemmer; keywords already counted as required skills aren't double-counted.
2. **`structure.ts`** — presence/order of standard sections (contact → optional summary → experience → education → skills); contact detectable via regex (email + phone); hard penalty for markdown tables / multi-column artifacts / HTML.
3. **`parseability.ts`** — simulated ATS parse: drafts render to plain text deterministically; check pipe-column layouts, bullet-marker consistency, section headers against a canonical alias set, unparseable glyphs. Score = fraction of checks passed.
4. **`semantic.ts`** — cosine similarity between embedded draft text and JD text (`text-embedding-3-small` via `embed.ts`), rescaled 0–100.
5. **`weights.ts` + `index.ts`** — `total = 0.40·keywordMust + 0.15·keywordNice + 0.15·structure + 0.10·parseability + 0.20·semantic`; returns `{ total, breakdown }` with matched/missed must-have lists; breakdown persisted to `drafts.score_breakdown_json`.

**Vitest coverage (graded):** table-driven stemmer tests; coverage scorer (exact/stem/mixed/miss); contact regex; table detection; cosine with hand-computed vectors; weighted total with mocked embedder; determinism test (same input twice → identical breakdown). All offline via the mock embedder.

### 5. Verifier Agent (`src/lib/agents/verifier.ts`) — the core novelty

- **Structurally separate call**: own `generateObject` invocation, own system prompt. Never sees the generator's reasoning or system prompt — the function signature accepts only `{ bullets: [{ text, sourceItemId }], profile }`, a TypeScript-level guarantee against context leakage.
- **Batched per draft**: one call per draft; each bullet listed with its claimed source item's **verbatim content** looked up from the profile by `sourceItemId`.
- System prompt forbids charitable inference: a claimed metric/outcome not present in the source item = UNSUPPORTED even if plausible; rewording that exceeds the source's stated scope = PARTIAL; fully backed = SUPPORTED.
- Output schema: `{ results: [{ bulletIndex, verdict, justification }] }` — results mapped back by index (LLM not trusted with ids); response length validated.
- **Logging:** every bullet, every iteration → `claims` row, regardless of outcome.
- **Fail-safety:** unparseable verifier response → bullets treated as UNSUPPORTED with justification "verifier failed to return verdict". Never silently pass.

### 6. Revision Loop — orchestration, not an agent (`src/lib/orchestrator.ts`)

Plain, readable state machine (`INIT → GENERATE → SCORE → VERIFY → { CONVERGED | REVISE → GENERATE … }`), no framework — explainable line by line.

```
load profile + JD from db (404 otherwise)
prevScore = 0, iteration = 1, rejectionLog = []

LOOP (max 4 iterations):
  A. GENERATE   generator.run(jd, profile, iteration>1 ? {prevBreakdown, rejectionLog} : null)
                → sanitize: drop bullets whose sourceItemId doesn't resolve (add to rejectionLog)
  B. SCORE      atsScore(draftAsText, jd, embeddingProvider) → persist drafts row
  C. VERIFY     verifier.verify(only new/changed bullets, profile)
                → persist claims rows; split supported / partial / unsupported
  D. STOP CHECKS (first match wins, spec order):
                   1. score improvement < 2 vs previous iteration → 'score_plateau'
                   2. iteration == 4                              → 'max_iterations'
                   3. zero UNSUPPORTED + zero PARTIAL             → 'clean'
  E. REVISE     unless stopped:
                  - UNSUPPORTED → their sections regenerate with rejection justifications as feedback
                  - PARTIAL     → exactly one rewrite attempt narrowing the claim to what's supported
                  - iteration++
persist runs row (final_iteration, converged, final_score)
```

Key decisions:

- **Incremental verification (cost):** keep a `seenBullets` set (hash of `text + sourceItemId`); verifier only receives new bullets, unchanged bullets carry prior verdicts forward — provable call-count reduction.
- **`converged` semantics:** `true` iff the loop stopped for a quality reason (`clean` or `score_plateau`), not the hard 4-iteration cap.
- Iteration-by-iteration state (scores, breakdowns, verdict counts, stop reason) returned from `runPipeline` for the CLI and later UI/eval harness.

## Frontend plan

Server-first Next.js App Router; pages read straight from SQLite via Drizzle in server components; mutations through thin API routes (same routes the CLIs use — one seam). No client state library; plain fetch + React polling for live runs.

### Routes

```
src/app/
├── layout.tsx                    # shell: sidebar nav (Profiles / JDs / Runs)
├── page.tsx                      # Dashboard: recent runs, quick actions, empty states
├── profiles/
│   ├── new/page.tsx              # JSON tab (live Zod validation) + raw-text tab
│   └── [id]/page.tsx             # structured viewer; copyable itemId badges
├── jds/
│   ├── new/page.tsx              # paste JD → parse
│   └── [id]/page.tsx             # must-have vs nice-to-have badge split, keywords, level
└── runs/
    ├── page.tsx                  # all runs table
    └── [id]/page.tsx             # run detail — the centerpiece
```

### Run detail page

- **RunHeader** — final score, stop reason, converged indicator, iteration count, live "running…" pill.
- **Score line chart** (Recharts) — total ATS score vs iteration.
- **Breakdown bar chart** — grouped bars per iteration for the five scoring components.
- **Verdict stacked bar chart** — supported/partial/unsupported per iteration.
- **ClaimTable** — filterable by verdict; `sourceItemId` badge jumps to source item; expandable justifications.
- **ResumePreview** — rendered plain-text resume per iteration with verdict-colored annotations + "Show annotations" toggle.
- **KeywordCoveragePanel** — matched (green) vs missed (red) must-have chips.

Live behavior: the page polls `GET /api/runs/[id]` every 1.5s while the run is live; polling stops at terminal state. No websockets/SSE needed since the orchestrator is DB-backed.

### shadcn/ui inventory

`button card input textarea tabs badge table select dialog dropdown-menu tooltip collapse sonner progress separator skeleton form alert`

- `form` uses react-hook-form + zodResolver **reusing the same Zod schemas from `src/types.ts`** — one validation source across LLM schemas, API routes, and UI forms.
- `verdict-badge.tsx` — single source of truth for verdict colors.
- Recharts components are client components; everything else stays server components.

### API surface

| Route | Method | Purpose |
|---|---|---|
| `/api/profiles` | GET/POST | list / ingest (JSON or rawText) |
| `/api/jds` | GET/POST | list / parse + insert |
| `/api/runs` | GET/POST | list / start run (fire-and-forget, UI polls) |
| `/api/runs/[id]` | GET | run + drafts + claims joined, shaped for the page |

## CLIs

- `scripts/parse-jd.ts <jd.txt | --sample>` — parse → insert → print parsed JSON.
- `scripts/import-profile.ts <profile.json | --sample>` — insert with stable ids → print id map.
- `scripts/run-pipeline.ts <profileId> <jdId>` — full loop; prints per-iteration table (iteration, score, Δ, must-have coverage) and per-claim verdict log; final stop reason + converged status.

Built-in sample fixtures (realistic candidate profile + senior-frontend JD) so every script runs in a demo without user data.

## Build order

| # | Step | Verify |
|---|------|--------|
| 1 | Scaffold (init, deps, tsconfig, drizzle config, .env.example) | `tsc --noEmit` clean |
| 2 | Drizzle schema + migrations + `db/client.ts` | tables exist in db |
| 3 | Zod shared schemas + tokenize/stem utilities | unit tests pass |
| 4 | Scoring module + full Vitest suite | `vitest` green (offline, mock embedder) |
| 5 | Profile ingestion (normalizer + CLI + `/api/profiles`) | import sample, inspect `structured_json` |
| 6 | JD parser agent + CLI | parse sample JD, inspect `parsed_json` |
| 7 | Generator agent (feedback input + id-sanitize) | ad-hoc generation, all ids resolve |
| 8 | Verifier agent (batched, index-mapped) + real embedder path | ad-hoc verify of 3 seeded claims |
| 9 | Orchestrator state machine + runs/claims persistence | live run on samples |
| 10 | `run-pipeline.ts` CLI | end-to-end run prints iteration table + verdict log; determinism spot-check |
| 11 | shadcn init + app shell/layout | visual check, `tsc --noEmit` |
| 12 | Dashboard + runs list + RunLauncherDialog | create run via dialog |
| 13 | Profile pages | both ingest paths end-to-end |
| 14 | JD pages | parse sample JD through UI |
| 15 | Run detail: polling hook + header + tables | live-poll a real run |
| 16 | Recharts trio + KeywordCoveragePanel | numbers match `score_breakdown_json` |
| 17 | ResumePreview with annotations | spot-check against `claims` |

Steps 1–10 are this pass (backend + CLIs); 11–17 are the frontend pass. No evaluation harness yet.

## Risks pre-empted

- **Verifier index drift** — map results by index, validate response length.
- **sourceItemId hallucination** — post-generation sanitize before scoring/verification.
- **Scoring nondeterminism** — mock embedder in tests, fixed weights, no LLM in the score path.
- **Run cost creep** — incremental verification, changed-bullets-only re-verify, hard 4-iteration cap.
