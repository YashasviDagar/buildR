# Phase 6 — Frontend

## What was built

The complete Next.js App Router frontend on top of the Phase 1–5 backend:
dashboard, profile ingestion + viewer, JD parsing + viewer, and the run
detail page with live polling, Recharts visualizations, the claims log, and
an annotated resume preview.

## Routes

| Route | Type | What it does |
|---|---|---|
| `/` | server | Dashboard: recent runs with status badges, RunLauncher (profile + JD selects → `POST /api/runs` → redirect) |
| `/runs` | server | All-runs table (id, status badge, score, iterations, started) |
| `/runs/[id]` | server + client | The centerpiece — see below |
| `/profiles/new` | client | JSON import with **live Zod validation** (same `structuredProfileSchema` the DB enforces), sample loader, expected-format tab |
| `/profiles/[id]` | server | Structured viewer; every item shows its stable `itemId` badge (`exp_1`, `skl_7`…) — the traceability is visible |
| `/jds/new` | client | Paste raw JD → parser agent |
| `/jds/[id]` | server | Parsed viewer: required skills (accent badges, "weighted 0.40") vs nice-to-have (muted badges, "weighted 0.15"), keywords, experience level, qualifications, raw text in a `<details>` |

## Run detail page (`/runs/[id]`)

- **Polling:** client polls `GET /api/runs/[id]` every 1.5s while `status === 'running'`; stops at terminal state. No websockets needed — the orchestrator writes drafts/claims rows per iteration, so progress appears incrementally.
- **RunHeader** — status pill (running / failed / converged · stop-reason / hit-cap), final score.
- **Score line chart** — total ATS score per iteration + an iteration table (score, delta, S/P/U counts).
- **Verdict stacked bars** — SUPPORTED/PARTIAL/UNSUPPORTED per iteration; "generation N finally went clean" is visible at a glance.
- **Breakdown bar chart** — the five scoring components per iteration (must/nice keywords, structure, parseability, semantic).
- **Claims log** — filterable (All/SUPPORTED/PARTIAL/UNSUPPORTED with counts), expandable rows with full text + verifier justification; iteration/section/sourceItemId badges. This is the eval dataset, rendered.
- **KeywordCoveragePanel** — latest breakdown's matched (green) vs missed (red) must-have chips — explains score deltas instantly.
- **ResumePreview** — per-iteration resume rendering with verdict-colored bullet borders + `sourceItemId` badges + verdict badges; "show annotations" toggle switches to a clean ATS-style view.

## API routes (all `runtime = 'nodejs'`, `force-dynamic`)

| Route | Methods | Notes |
|---|---|---|
| `/api/profiles` | GET/POST | POST validates via `normalizeProfile` (same Zod schema as CLI) |
| `/api/profiles/sample` | GET | Serves `samples/profile-sample.json` to the import page |
| `/api/jds` | GET/POST | POST runs the JD parser agent |
| `/api/runs` | GET/POST | POST pre-creates the runs row, then `void runPipelineWithExistingRun(...)` fire-and-forget — the page can poll immediately, no race |
| `/api/runs/[id]` | GET | Full run payload (run + drafts + claims + profile/JD titles) |

Shared layer: `src/lib/run-payload.ts` builds the typed `RunPayload` used by both the API routes and server pages — one shape for CLI, API, and UI.

## UI primitives

`shadcn init` failed silently in this environment, so primitives are hand-rolled in shadcn style with the same API surface: `button`, `badge` (verdict variants), `card`, `input`/`textarea`, lightweight client `tabs` — plus `cn()` (clsx + tailwind-merge). Tailwind v4 via `@tailwindcss/postcss`. Verdict colors live in `verdict-badge.tsx` as the single theme point.

## Bugs found and fixed during this pass

1. **Stored JSON columns were cast without `JSON.parse`** (`run-payload.ts`, orchestrator, profile/JD viewers) — the API returned `itemCount: 0` and, critically, `runPipeline` would have handed the agents a raw *string* instead of the parsed profile. Fixed with `parseStoredProfile`/`parseStoredJd` helpers; verified live (`name: "Ananya Rao", itemCount: 12`).
2. **`.js` import suffixes** broke Next's webpack resolution (TypeScript bundler mode resolved them, webpack didn't) — stripped across all 42 files.
3. **Mismatched `</Card>` closing a `<details>`** in the JD viewer (SWC caught it; tsc had not).
4. **Missing React namespace imports** in card/input/tabs primitives caused a prerender crash (`React is not defined`).

## Verification done

- `npm run build` — 13 routes compiled, all green.
- `npm run vitest` — 72/72.
- `next start` smoke test: `/` 200, `/runs` 200, `/api/profiles` returns parsed names + item counts, `/profiles/[id]` renders `exp_1`…`skl_7` badges, missing run id renders a graceful not-found message.
- Junk test rows cleaned from `buildr.db`; one sample profile retained for demo.

## Not done here (needs `OPENAI_API_KEY`)

- A live run driven from the UI (the polling path is code-verified and the data plumbing is exercised by real DB reads, but no LLM run has fed it yet). Once a key exists: import profile → parse JD → Start run → watch the charts fill in live.
