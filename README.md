# buildR

Agentic ATS resume optimization system. buildR takes a candidate's real profile and a target job description, and produces an ATS-optimized resume through an iterative **generate → score → verify → revise** loop. Every generated claim is traceable to something the candidate actually provided — a separate verifier agent rejects anything it can't ground, so buildR cannot fabricate skills or achievements.

## How it works

1. **JD Parser Agent** (single-shot) — parses a raw job description into must-have skills, nice-to-haves, keywords, qualifications, and experience level. The must-have/nice-to-have split feeds ATS scoring weights.
2. **Generator Agent** — writes resume bullets per section, tailored to the JD. Hard constraint: every bullet must cite a `sourceItemId` from the candidate's profile. If nothing in the profile supports a JD requirement, it omits the requirement rather than inventing experience.
3. **ATS Scoring Module** — deterministic code, not an LLM: keyword coverage (exact + stemmed), resume structure, simulated ATS parseability, and semantic similarity via embeddings, combined into a weighted total with a per-component breakdown. Same input → same score, always.
4. **Verifier Agent** — a separate LLM call with a separate system prompt that never sees the generator's reasoning. For each bullet it looks up the cited source item and judges SUPPORTED / PARTIAL / UNSUPPORTED. No charitable inference: a metric not present in the source is UNSUPPORTED even if plausible. Every verdict is logged to the `claims` table.
5. **Revision Loop** — UNSUPPORTED bullets are dropped and their sections regenerated with rejection reasons as feedback; PARTIAL bullets get one rewrite narrowing the claim to what's supported. Scoring and verification repeat (only new/changed bullets are re-verified). Stops on: score improvement < 2 points, 4 iterations, or zero unsupported/partial claims.

## Stack

- Node 20+, TypeScript
- Next.js App Router (UI + API routes)
- better-sqlite3 + Drizzle ORM (local SQLite: `buildr.db`)
- Vercel AI SDK (`generateObject`) + Zod for all structured LLM output
- OpenAI `gpt-4o-mini` (agents) + `text-embedding-3-small` (similarity)
- Tailwind + shadcn/ui, Recharts for visualizations
- tsx for scripts, Vitest for unit tests

## Setup

```bash
npm install
cp .env.example .env        # add your OPENAI_API_KEY
npx drizzle-kit generate    # create migrations
npx drizzle-kit migrate     # apply them (creates buildr.db)
```

## CLI usage

```bash
# Import a profile (JSON with education/projects/skills/experience, or --sample)
npx tsx scripts/import-profile.ts profile.json --sample

# Parse a job description
npx tsx scripts/parse-jd.ts jd.txt --sample

# Run the full pipeline: generate → score → verify → revise
npx tsx scripts/run-pipeline.ts <profileId> <jdId>
```

`run-pipeline.ts` prints iteration-by-iteration scores, per-claim verdicts (SUPPORTED / PARTIAL / UNSUPPORTED with justifications), the stop reason, and the final score.

## Tests

```bash
npx vitest
```

Scoring is covered by offline deterministic tests (a mock embedder stands in for the API under test).

## Development

```bash
npm run dev     # Next.js on http://localhost:3000
```

### UI walkthrough

1. **Import a profile** — `/profiles/new`: paste profile JSON (or load the sample); live Zod validation, stable item ids assigned on save.
2. **Parse a JD** — `/jds/new`: paste the posting; the parser agent splits must-have vs nice-to-have (this split drives the scoring weights).
3. **Start a run** — dashboard launcher: pick profile + JD, the loop runs fire-and-forget and the run page polls every 1.5s.
4. **Watch it** — `/runs/[id]` shows the score-per-iteration chart, verdict stacked bars, component breakdowns, the full claims log with verifier justifications, and an annotated resume preview (toggle annotations off for the clean ATS view).

Run phase reports live in `phases/` — one markdown file per completed phase describing what was built and how it was verified.

See `plan.md` for the full architecture, data model, agent specifications, and build order.
