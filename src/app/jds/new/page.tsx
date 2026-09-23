'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';

export default function NewJdPage() {
  const router = useRouter();
  const [rawText, setRawText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!rawText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/jds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'parsing failed');
      router.push(`/jds/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">Parse job description</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Paste the raw job posting. The JD parser agent separates must-have skills from nice-to-haves —
          this split drives the ATS scoring weights.
        </p>
      </div>
      <Textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        placeholder="Paste the full job description text here…"
        className="min-h-[320px]"
      />
      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={!rawText.trim() || busy}>
          {busy ? 'Parsing with gpt-4o-mini…' : 'Parse JD'}
        </Button>
        {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      </div>
    </div>
  );
}
