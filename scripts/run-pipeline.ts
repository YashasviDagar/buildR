import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { claims, drafts } from '../src/db/schema.js';
import { runPipeline } from '../src/lib/orchestrator.js';

const usage = `Usage: npx tsx scripts/run-pipeline.ts <profileId> <jdId>

Runs the full generate -> score -> verify -> revise loop and prints an
iteration-by-iteration report. Requires OPENAI_API_KEY (copy .env.example to .env).`;

const [profileId, jdId] = process.argv.slice(2);
if (!profileId || !jdId) {
  console.log(usage);
  process.exit(1);
}

const result = await runPipeline(profileId, jdId);

console.log(`\nRun ${result.runId}`);
console.log('='.repeat(72));
console.log('Iteration-by-iteration score:');
console.log('  it |   score |    delta | must-have % | claims S/P/U | verified/carried');
for (const it of result.iterations) {
  const v = it.verdictCounts;
  console.log(
    `  ${String(it.iteration).padStart(2)} | ${it.score.toFixed(2).padStart(7)} | ${it.scoreDelta.toFixed(2).padStart(8)} | ${String(it.breakdown.keywordMust).padStart(10)}% | ${v.supported}/${v.partial}/${v.unsupported} | ${it.verifiedThisIteration}/${it.carriedOver}`,
  );
}

console.log('\nClaim verdicts per iteration:');
for (const it of result.iterations) {
  const rows = db.select().from(claims).where(eq(claims.draftId, it.draftId)).all();
  console.log(`\n  Iteration ${it.iteration} (${rows.length} claims):`);
  for (const c of rows) {
    const text = c.text.length > 80 ? c.text.slice(0, 77) + '...' : c.text;
    console.log(`    [${c.verdict.padEnd(11)}] (${c.section}, ${c.sourceItemId}) ${text}`);
    console.log(`                 ${c.justification}`);
  }
}

console.log('\nLatest breakdown:');
const last = result.iterations[result.iterations.length - 1];
const b = last.breakdown;
console.log(`  keywordMust ${b.keywordMust}%  keywordNice ${b.keywordNice}%  structure ${b.structure}  parseability ${b.parseability}  semantic ${b.semantic}`);
if (b.mustMissed.length > 0) console.log(`  Missed must-haves: ${b.mustMissed.join(', ')}`);
if (b.mustMatched.length > 0) console.log(`  Matched must-haves: ${b.mustMatched.join(', ')}`);

console.log('\nResult:');
console.log(`  Stop reason:    ${result.stopReason}`);
console.log(`  Converged:      ${result.converged}`);
console.log(`  Final score:    ${result.finalScore}`);
console.log(`  Iterations:     ${result.finalIteration}`);
