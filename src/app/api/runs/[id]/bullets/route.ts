import { NextResponse } from 'next/server';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { runs, drafts, claims, jobDescriptions } from '@/db/schema';
import { claimHash } from '@/lib/revision';
import type { GeneratedSection, ParsedJd } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Verified bullets of a finished run, keyed by profile item id (exp_1, prj_2…),
// with every bullet the verifier rejected already removed. The builder applies
// these back onto the user's experience and project entries.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [run] = db.select().from(runs).where(eq(runs.id, id)).all();
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });

  const [draft] = db
    .select()
    .from(drafts)
    .where(eq(drafts.runId, id))
    .orderBy(desc(drafts.iteration))
    .limit(1)
    .all();
  const [jdRow] = db.select().from(jobDescriptions).where(eq(jobDescriptions.id, run.jdId)).all();

  if (run.status === 'running') return NextResponse.json({ status: 'running' });
  if (run.status === 'failed' || !draft || !jdRow) return NextResponse.json({ status: 'failed' });

  const rejected = new Set(
    db
      .select()
      .from(claims)
      .where(and(eq(claims.draftId, draft.id), eq(claims.verdict, 'UNSUPPORTED')))
      .all()
      .map((c) => claimHash(c.section, c.text, c.sourceItemId)),
  );

  const bullets: Record<string, string[]> = {};
  let rejectedCount = 0;
  for (const section of JSON.parse(draft.sectionsJson) as GeneratedSection[]) {
    if (section.section !== 'experience' && section.section !== 'projects') continue;
    for (const b of section.bullets) {
      if (rejected.has(claimHash(section.section, b.text, b.sourceItemId))) {
        rejectedCount++;
        continue;
      }
      (bullets[b.sourceItemId] ??= []).push(b.text);
    }
  }

  const jd = JSON.parse(jdRow.parsedJson) as ParsedJd;
  return NextResponse.json({
    status: 'done',
    bullets,
    rejectedCount,
    jdSkills: [...jd.requiredSkills, ...jd.keywords, ...jd.niceToHave],
  });
}
