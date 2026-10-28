import { asc } from 'drizzle-orm';
import { db } from '../src/db/client';
import { claims, drafts, runs } from '../src/db/schema';

// Evaluation report built from the claims table: every verifier verdict from
// every run. Shows how the revision loop changes the share of unsupported or
// partial claims between the first draft and the final draft of each run.

const usage = `Usage: npx tsx scripts/eval-claims.ts

Prints verdict totals and, per finished run, the share of claims that were not
fully SUPPORTED in the first draft versus the final draft.`;

if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

type Counts = { SUPPORTED: number; PARTIAL: number; UNSUPPORTED: number };
const empty = (): Counts => ({ SUPPORTED: 0, PARTIAL: 0, UNSUPPORTED: 0 });
const total = (c: Counts) => c.SUPPORTED + c.PARTIAL + c.UNSUPPORTED;
const pct = (n: number, d: number) => (d === 0 ? '  n/a' : `${((100 * n) / d).toFixed(0).padStart(3)}%`);

const allRuns = db.select().from(runs).all().filter((r) => r.status === 'done');
const allDrafts = db.select().from(drafts).orderBy(asc(drafts.iteration)).all();
const allClaims = db.select().from(claims).all();

const countsByDraft = new Map<string, Counts>();
for (const c of allClaims) {
  const counts = countsByDraft.get(c.draftId) ?? empty();
  counts[c.verdict as keyof Counts]++;
  countsByDraft.set(c.draftId, counts);
}

const overall = empty();
for (const c of allClaims) overall[c.verdict as keyof Counts]++;

console.log(`Runs finished: ${allRuns.length}   Claims logged: ${allClaims.length}`);
console.log(
  `Overall verdicts: SUPPORTED ${overall.SUPPORTED}, PARTIAL ${overall.PARTIAL}, UNSUPPORTED ${overall.UNSUPPORTED}\n`,
);

console.log('run        rounds  first draft (not fully supported)   final draft (not fully supported)');
let firstBad = 0;
let firstAll = 0;
let lastBad = 0;
let lastAll = 0;
for (const run of allRuns) {
  const ds = allDrafts.filter((d) => d.runId === run.id);
  if (ds.length === 0) continue;
  const first = countsByDraft.get(ds[0].id) ?? empty();
  const last = countsByDraft.get(ds[ds.length - 1].id) ?? empty();
  const fb = first.PARTIAL + first.UNSUPPORTED;
  const lb = last.PARTIAL + last.UNSUPPORTED;
  firstBad += fb;
  firstAll += total(first);
  lastBad += lb;
  lastAll += total(last);
  console.log(
    `${run.id.slice(0, 8)}   ${String(ds.length).padStart(4)}    ${String(fb).padStart(3)}/${String(total(first)).padEnd(3)} ${pct(fb, total(first))}` +
      `                       ${String(lb).padStart(3)}/${String(total(last)).padEnd(3)} ${pct(lb, total(last))}`,
  );
}
console.log(
  `\nAll runs: ${pct(firstBad, firstAll).trim()} of first-draft claims were not fully supported; ` +
    `${pct(lastBad, lastAll).trim()} of final-draft claims.`,
);
console.log(
  'Note: the builder additionally drops UNSUPPORTED bullets and only applies fully SUPPORTED rewrites, so ' +
    'what reaches the resume is stricter than the final-draft figure.',
);
