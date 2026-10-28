'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createResume, deleteResume, listResumes, type SavedResume } from '@/lib/builder/storage';
import { emptyState, profileToState } from '@/lib/builder/model';
import type { StructuredProfile } from '@/types';

function ago(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Dashboard() {
  const router = useRouter();
  const [resumes, setResumes] = useState<SavedResume[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResumes(listResumes());
    setReady(true);
  }, []);

  function create() {
    const r = createResume();
    router.push(`/builder/${r.id}`);
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/extract-text', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'could not read file');

      const parsed = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: data.text }),
      });
      const body = await parsed.json();
      if (!parsed.ok) throw new Error(body.error ?? 'could not understand the resume');

      const state = profileToState(body.profile as StructuredProfile, emptyState());
      const r = createResume(state, state.name ? `${state.name}'s Resume` : 'Imported Resume');
      router.push(`/builder/${r.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const tile =
    'flex h-40 w-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] text-sm transition hover:border-[var(--accent)]';

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Your resumes</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Build an ATS-friendly resume from scratch, or upload the one you have and let buildR clean it up.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <button onClick={create} className={tile} disabled={busy}>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500 text-2xl text-white">+</span>
          Create Resume
        </button>
        <label className={`${tile} cursor-pointer ${busy ? 'opacity-60' : ''}`}>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500 text-xl text-white">↑</span>
          {busy ? 'Reading your resume…' : 'Upload Existing'}
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            disabled={busy}
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </label>
      </div>

      {error && <p className="max-w-xl rounded-md bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

      {ready && resumes.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-6">
          <h2 className="text-sm font-semibold text-[var(--muted)]">Saved in this browser</h2>
          <div className="flex flex-wrap gap-4">
            {resumes.map((r) => (
              <div
                key={r.id}
                className="group relative flex h-40 w-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-center transition hover:border-[var(--accent)]"
                onClick={() => router.push(`/builder/${r.id}`)}
              >
                <span className="text-3xl">📄</span>
                <span className="line-clamp-2 text-sm font-medium">{r.title}</span>
                <span className="text-[10px] text-[var(--muted)]">Updated {ago(r.updatedAt)}</span>
                <button
                  aria-label={`Delete ${r.title}`}
                  className="absolute right-2 top-2 rounded p-1 text-xs text-[var(--muted)] hover:text-red-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${r.title}"? This cannot be undone.`)) {
                      deleteResume(r.id);
                      setResumes(listResumes());
                    }
                  }}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {ready && resumes.length === 0 && (
        <p className="text-sm text-[var(--muted)]">No resumes yet. Create one or upload your existing resume to start.</p>
      )}
    </div>
  );
}
