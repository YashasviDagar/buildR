'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface ListItem {
  id: string;
  name?: string;
  title?: string;
}

export function RunLauncher() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ListItem[]>([]);
  const [jds, setJds] = useState<ListItem[]>([]);
  const [profileId, setProfileId] = useState('');
  const [jdId, setJdId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/profiles')
      .then((r) => r.json())
      .then((d) => {
        setProfiles(d.profiles ?? []);
        if (d.profiles?.length) setProfileId(d.profiles[0].id);
      })
      .catch(() => setError('failed to load profiles'));
    fetch('/api/jds')
      .then((r) => r.json())
      .then((d) => {
        setJds(d.jds ?? []);
        if (d.jds?.length) setJdId(d.jds[0].id);
      })
      .catch(() => setError('failed to load job descriptions'));
  }, []);

  async function launch() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, jdId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed to start run');
      router.push(`/runs/${data.runId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const empty = profiles.length === 0 || jds.length === 0;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
        Profile
        <select
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
        >
          {profiles.length === 0 && <option value="">no profiles yet</option>}
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
        Job description
        <select
          value={jdId}
          onChange={(e) => setJdId(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
        >
          {jds.length === 0 && <option value="">no JDs yet</option>}
          {jds.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
      </label>
      <Button onClick={launch} disabled={busy || empty}>
        {busy ? 'Starting…' : 'Start run'}
      </Button>
      {empty && (
        <p className="text-xs text-[var(--muted)]">
          Import a profile and parse a JD first — links in the sidebar.
        </p>
      )}
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
