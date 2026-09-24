import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db/client';
import { profiles } from '@/db/schema';
import type { StructuredProfile } from '@/types';
import { parseStoredProfile } from '@/lib/run-payload';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = db.select().from(profiles).where(eq(profiles.id, id)).all();
  if (!row) {
    return <p className="text-sm text-[var(--danger)]">Profile {id} not found.</p>;
  }

  const profile = parseStoredProfile(row.structuredJson);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">{profile.contact?.name ?? id}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {profile.contact?.email}
          {profile.contact?.phone ? ` · ${profile.contact.phone}` : ''}
          {profile.contact?.location ? ` · ${profile.contact.location}` : ''}
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Profile id <span className="font-mono">{id}</span> — every item below carries the stable id the
          generator cites and the verifier checks.
        </p>
      </div>

      {profile.summary && (
        <Card>
          <CardTitle className="mb-2">Summary</CardTitle>
          <p className="text-sm">{profile.summary}</p>
        </Card>
      )}

      <Section title="Experience" items={profile.experience.map((x) => ({ itemId: x.itemId!, label: x.title, detail: [x.org, x.startDate ? `${x.startDate} – ${x.endDate ?? 'present'}` : null].filter(Boolean).join(' · '), highlights: x.highlights }))} />
      <Section title="Projects" items={profile.projects.map((x) => ({ itemId: x.itemId!, label: x.name, detail: [x.tech.join(', ')].filter(Boolean).join(' · '), highlights: [...(x.description ? [x.description] : []), ...x.highlights] }))} />
      <Section title="Education" items={profile.education.map((x) => ({ itemId: x.itemId!, label: x.degree, detail: [x.school, x.year].filter(Boolean).join(' · '), highlights: x.details ? [x.details] : [] }))} />
      <Section title="Skills" items={profile.skills.map((x) => ({ itemId: x.itemId!, label: x.name, detail: [x.category, x.level].filter(Boolean).join(' · '), highlights: [] }))} />

      <div className="text-xs text-[var(--muted)]">
        <Link href="/" className="text-[var(--accent)] hover:underline">
          back to dashboard
        </Link>
      </div>
    </div>
  );
}

interface SectionItem {
  itemId: string;
  label: string;
  detail: string;
  highlights: string[];
}

function Section({ title, items }: { title: string; items: SectionItem[] }) {
  return (
    <Card>
      <CardTitle className="mb-3">
        {title} ({items.length})
      </CardTitle>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.itemId} className="border-l-2 border-[var(--accent)]/40 pl-3">
            <div className="flex items-center gap-2">
              <Badge variant="accent" className="font-mono">
                {item.itemId}
              </Badge>
              <span className="text-sm font-medium">{item.label}</span>
            </div>
            {item.detail && <div className="text-xs text-[var(--muted)]">{item.detail}</div>}
            {item.highlights.map((h, i) => (
              <div key={i} className="text-xs text-[var(--muted)]">
                - {h}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </Card>
  );
}
