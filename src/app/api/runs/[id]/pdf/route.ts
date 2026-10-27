import { NextResponse } from 'next/server';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { runs, drafts, claims, profiles, jobDescriptions } from '@/db/schema';
import { buildFinalResume } from '@/lib/final-resume';
import { buildResumePdf } from '@/lib/resume-pdf';
import { claimHash } from '@/lib/revision';
import type { GeneratedSection, ParsedJd, StructuredProfile } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [run] = db.select().from(runs).where(eq(runs.id, id)).all();
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });
  if (run.status !== 'done') {
    return NextResponse.json({ error: 'run has not finished yet' }, { status: 409 });
  }

  const [draft] = db
    .select()
    .from(drafts)
    .where(eq(drafts.runId, id))
    .orderBy(desc(drafts.iteration))
    .limit(1)
    .all();
  const [profileRow] = db.select().from(profiles).where(eq(profiles.id, run.profileId)).all();
  const [jdRow] = db.select().from(jobDescriptions).where(eq(jobDescriptions.id, run.jdId)).all();
  if (!draft || !profileRow || !jdRow) {
    return NextResponse.json({ error: 'run data missing' }, { status: 404 });
  }

  // Drop every bullet the verifier rejected in the final draft.
  const rejected = new Set(
    db
      .select()
      .from(claims)
      .where(and(eq(claims.draftId, draft.id), eq(claims.verdict, 'UNSUPPORTED')))
      .all()
      .map((c) => claimHash(c.section, c.text, c.sourceItemId)),
  );

  const profile = JSON.parse(profileRow.structuredJson) as StructuredProfile;
  const resume = buildFinalResume(
    profile,
    JSON.parse(jdRow.parsedJson) as ParsedJd,
    JSON.parse(draft.sectionsJson) as GeneratedSection[],
    (section, text, sourceItemId) => rejected.has(claimHash(section, text, sourceItemId)),
  );
  const bytes = await buildResumePdf(resume);
  const fileName = `${profile.contact.name.replace(/[^a-z0-9]+/gi, '_')}_Resume.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
