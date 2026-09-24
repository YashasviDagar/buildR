'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { structuredProfileSchema, type StructuredProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { SAMPLE_PROFILE_PATH_HINT } from './sample-hint';

export default function NewProfilePage() {
  const router = useRouter();
  const [jsonText, setJsonText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validation = useMemo(() => {
    if (!jsonText.trim()) return { ok: false, data: null as StructuredProfile | null, issues: [] as string[] };
    try {
      const parsed = JSON.parse(jsonText);
      const result = structuredProfileSchema.safeParse(parsed);
      if (result.success) return { ok: true, data: result.data, issues: [] };
      const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      return { ok: false, data: null, issues };
    } catch (err) {
      return { ok: false, data: null, issues: [`invalid JSON: ${(err as Error).message}`] };
    }
  }, [jsonText]);

  async function submit() {
    if (!validation.ok || !validation.data) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.data),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'import failed');
      router.push(`/profiles/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function loadSample() {
    fetch('/api/profiles/sample')
      .then((r) => r.json())
      .then((d) => {
        if (d.json) setJsonText(JSON.stringify(d.json, null, 2));
        else setError(d.error ?? 'sample unavailable');
      })
      .catch((err) => setError((err as Error).message));
  }

  const itemCount = validation.data
    ? validation.data.experience.length +
      validation.data.education.length +
      validation.data.projects.length +
      validation.data.skills.length
    : 0;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">Import profile</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Paste structured profile JSON ({SAMPLE_PROFILE_PATH_HINT}). Stable item ids are assigned automatically.
        </p>
      </div>

      <Tabs
        items={[
          {
            value: 'json',
            label: 'JSON import',
            content: (
              <div className="flex flex-col gap-3">
                <Textarea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  placeholder='{ "contact": { "name": "...", "email": "..." }, "experience": [...], ... }'
                />
                <div className="flex items-center gap-3">
                  <Button onClick={submit} disabled={!validation.ok || busy}>
                    {busy ? 'Importing…' : 'Import profile'}
                  </Button>
                  <Button variant="outline" onClick={loadSample}>
                    Load sample
                  </Button>
                  {validation.ok && (
                    <Badge variant="success">
                      valid — {itemCount} items
                    </Badge>
                  )}
                  {!validation.ok && jsonText.trim() && <Badge variant="danger">invalid</Badge>}
                </div>
                {validation.issues.length > 0 && (
                  <ul className="flex flex-col gap-1 text-xs text-[var(--danger)]">
                    {validation.issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                )}
                {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
              </div>
            ),
          },
          {
            value: 'format',
            label: 'Expected format',
            content: (
              <pre className="overflow-auto rounded-md border border-[var(--border)] bg-[var(--card)] p-4 text-xs leading-relaxed">
                {`{
  "contact": { "name": "", "email": "", "phone": "", "location": "", "links": [] },
  "summary": "optional",
  "experience": [{ "title": "", "org": "", "startDate": "", "endDate": "", "highlights": [] }],
  "education": [{ "degree": "", "school": "", "year": "" }],
  "projects": [{ "name": "", "description": "", "tech": [], "highlights": [] }],
  "skills": [{ "name": "", "category": "", "level": "" }]
}`}
              </pre>
            ),
          },
        ]}
      />
    </div>
  );
}
