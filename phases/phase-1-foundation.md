# Phase 1 — Foundation

## What was built

The scaffold and data layer for buildR: project configuration, dependency install,
the five-table Drizzle schema with generated + applied SQLite migrations, the shared
Zod schema module, and the pure text utilities that every later phase consumes.

## Files

| File | Purpose |
|---|---|
| `package.json` | Scripts (`db:generate`, `db:migrate`, `test`, `typecheck`, `import:profile`, `parse:jd`, `pipeline`) and deps: `ai`, `@ai-sdk/openai`, `zod`, `drizzle-orm`, `better-sqlite3`, `nanoid`, dev: `drizzle-kit`, `tsx`, `vitest`, `typescript` |
| `tsconfig.json` | Strict TypeScript, ES2022, bundler module resolution, no emit (typecheck only) |
| `vitest.config.ts` | Vitest runs `tests/**/*.test.ts` in node environment |
| `drizzle.config.ts` | SQLite dialect, schema at `src/db/schema.ts`, migrations out to `src/db/migrations`, db file `buildr.db` |
| `.gitignore` | Ignores `node_modules`, `buildr.db`, `.env` (real secrets are never committed) |
| `.env.example` | Template documenting `OPENAI_API_KEY` and optional `DATABASE_URL` |
| `src/db/schema.ts` | The five tables + row types |
| `src/db/client.ts` | better-sqlite3 + Drizzle singleton, WAL journal mode, path from `DATABASE_URL` or `./buildr.db` |
| `src/db/migrations/` | Generated migration `0000_volatile_mach_iv.sql` — applied to `buildr.db` |
| `src/types.ts` | Shared Zod schemas: structured profile (contact + education/projects/skills/experience with stable `itemId`s), parsed JD (requiredSkills/keywords/qualifications/experienceLevel/niceToHave), generator + verifier output schemas, verdict types |
| `src/lib/tokenize.ts` | Pure text utilities: normalize, Porter-lite `stem`, `tokenize`, `containsKeyword` (exact + stemmed contiguous n-gram match), `keywordSignature` for dedupe, email/phone regexes, `looksLikeTable`, `hasHtmlTags` |

## Data model detail

- `profiles(id, raw_text, structured_json, created_at)` — `structured_json` is
  Zod-validated JSON with stable per-item ids (`exp_1`, `prj_2`, `skl_3`, `edu_1`).
- `job_descriptions(id, raw_text, parsed_json, created_at)` — `parsed_json` holds
  the parser agent output.
- `drafts(id, profile_id, jd_id, iteration, sections_json, ats_score,
  score_breakdown_json, created_at)` — indexed on `(profile_id, jd_id)`.
- `claims(id, draft_id, section, text, source_item_id, verdict, justification,
  created_at)` — indexed on `draft_id`, with a CHECK constraint restricting
  `verdict` to `SUPPORTED | PARTIAL | UNSUPPORTED`.
- `runs(id, profile_id, jd_id, status, stop_reason, final_iteration, converged,
  final_score, created_at)` — `status`/`stop_reason` support future
  fire-and-forget run triggering from the UI.

## Verification done

- `npm install` clean (124 packages).
- `npx drizzle-kit generate` produced the migration; `npx drizzle-kit migrate`
  applied it to `buildr.db` (5 tables created).
- Git: one commit per file, `buildr.db` and `.env` excluded via `.gitignore`.

## Notes

- Node v24.13.0, npm 11.6.2 — meets the Node 20+ requirement.
- `structured_json` additionally carries a top-level `contact` block (name/email/
  phone) beyond the four spec'd sections; the deterministic contact header for
  drafts and the structure score both need it.
