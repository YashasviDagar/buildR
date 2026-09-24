import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db/client';
import { jobDescriptions } from '@/db/schema';
import { parseStoredJd } from '@/lib/run-payload';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function JdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = db.select().from(jobDescriptions).where(eq(jobDescriptions.id, id)).all();
  if (!row) {
    return <p className="text-sm text-[var(--danger)]">Job description {id} not found.</p>;
  }

  const parsed = parseStoredJd(row.parsedJson);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">Parsed job description</h1>
        <p className="mt-1 text-xs text-[var(--muted)]">
          JD id <span className="font-mono">{id}</span>
        </p>
      </div>

      <Card>
        <CardTitle className="mb-3">
          Required skills (must-have — weighted 0.40 in scoring)
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          {parsed.requiredSkills.map((s) => (
            <Badge key={s} variant="accent">
              {s}
            </Badge>
          ))}
          {parsed.requiredSkills.length === 0 && <span className="text-xs text-[var(--muted)]">none</span>}
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">Nice to have (weighted 0.15)</CardTitle>
        <div className="flex flex-wrap gap-2">
          {parsed.niceToHave.map((s) => (
            <Badge key={s} variant="outline">
              {s}
            </Badge>
          ))}
          {parsed.niceToHave.length === 0 && <span className="text-xs text-[var(--muted)]">none</span>}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Keywords</CardTitle>
          <div className="flex flex-wrap gap-2">
            {parsed.keywords.map((k) => (
              <Badge key={k}>{k}</Badge>
            ))}
            {parsed.keywords.length === 0 && <span className="text-xs text-[var(--muted)]">none</span>}
          </div>
        </Card>
        <Card>
          <CardTitle className="mb-3">Experience level</CardTitle>
          <Badge variant="success">{parsed.experienceLevel}</Badge>
        </Card>
      </div>

      {parsed.qualifications.length > 0 && (
        <Card>
          <CardTitle className="mb-3">Qualifications</CardTitle>
          <ul className="flex flex-col gap-1 text-sm">
            {parsed.qualifications.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </Card>
      )}

      <details className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <summary className="cursor-pointer text-sm text-[var(--muted)]">Raw job description text</summary>
        <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs leading-relaxed">{row.rawText}</pre>
      </details>

      <div className="text-xs text-[var(--muted)]">
        <Link href="/" className="text-[var(--accent)] hover:underline">
          back to dashboard
        </Link>
      </div>
    </div>
  );
}
