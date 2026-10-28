'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import {
  ACCENTS,
  ACCENT_TEMPLATES,
  TEMPLATES,
  emptyAchievement,
  emptyEducation,
  emptyExperience,
  emptyProject,
  emptySkillGroup,
  SKILL_LABELS,
  emptyState,
  profileToState,
  splitItems,
  stateToProfile,
  stateToResume,
  toBullets,
  type BuilderState,
  type ExperienceForm,
  type TemplateId,
} from '@/lib/builder/model';
import { getResume, saveResume } from '@/lib/builder/storage';
import { buildResumePdf } from '@/lib/resume-pdf';
import type { StructuredProfile } from '@/types';

const STEPS = [
  'Personal',
  'Summary',
  'Experience',
  'Education',
  'Projects',
  'Skills',
  'Achievements',
  'Leadership',
  'Job match',
] as const;

async function api<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `request to ${url} failed`);
  return data as T;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
      {label}
      {children}
    </label>
  );
}

function EnhanceButton({ onClick, busy, disabled }: { onClick: () => void; busy: boolean; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="rounded-md bg-purple-500/15 px-2 py-1 text-[11px] font-medium text-purple-300 hover:bg-purple-500/25 disabled:opacity-40"
    >
      {busy ? 'Enhancing…' : '✨ Enhance with AI'}
    </button>
  );
}

export default function BuilderPage() {
  const [s, setS] = useState<BuilderState>(emptyState);
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState<TemplateId>('professional');
  const [accent, setAccent] = useState<string>(ACCENTS[0].hex);
  const [panel, setPanel] = useState<'template' | 'accent' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [before, setBefore] = useState<BuilderState | null>(null);
  const [title, setTitle] = useState('My Resume');
  const [runId, setRunId] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(true);
  const [missing, setMissing] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const loaded = useRef(false);
  const params = useParams<{ id: string }>();
  const id = params.id;

  // Load this resume from the browser's saved list.
  useEffect(() => {
    const r = getResume(id);
    if (!r) {
      setMissing(true);
    } else {
      setS(r.state);
      setTemplate(r.template);
      setAccent(r.accent);
      setTitle(r.title);
      setRunId(r.runId);
    }
    loaded.current = true;
  }, [id]);

  // Autosave on every change.
  useEffect(() => {
    if (!loaded.current || missing) return;
    setSaved(false);
    const t = setTimeout(() => {
      saveResume({ id, title, updatedAt: Date.now(), state: s, template, accent, runId });
      setSaved(true);
    }, 400);
    return () => clearTimeout(t);
  }, [id, s, template, accent, title, runId, missing]);

  const resume = useMemo(() => stateToResume(s), [s]);

  // The preview is the real PDF, built in the browser, so it always matches
  // the download exactly.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const bytes = await buildResumePdf(resume, { template, accent });
        if (cancelled) return;
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
        setPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (err) {
        if (!cancelled) setError(`Preview failed: ${(err as Error).message}`);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [resume, template, accent]);

  const set = <K extends keyof BuilderState>(key: K, value: BuilderState[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));

  function fail(err: unknown) {
    setError((err as Error).message);
    setNotice(null);
  }

  async function enhance(
    kind: 'summary' | 'bullets',
    text: string,
    context: string,
    apply: (t: string) => void,
    key: string,
  ) {
    setBusy(key);
    setError(null);
    try {
      const { text: out } = await api<{ text: string }>('/api/enhance', { kind, text, context });
      apply(out);
    } catch (err) {
      fail(err);
    }
    setBusy(null);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    setBusy('import');
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/extract-text', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'could not read file');
      const { profile } = await api<{ profile: StructuredProfile }>('/api/profiles', { rawText: data.text });
      setS((prev) => profileToState(profile, prev));
      setNotice('Resume imported. Review each step and edit anything that looks off.');
      setStep(0);
    } catch (err) {
      fail(err);
    }
    setBusy(null);
  }

  // Crop to a centered circle (transparent corners) and shrink, so the saved
  // data stays small and the PDF needs no clipping logic.
  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('could not read that image'));
        el.src = URL.createObjectURL(file);
      });
      const size = 240;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('image processing is not available in this browser');
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      set('photo', canvas.toDataURL('image/png'));
    } catch (err) {
      fail(err);
    }
  }

  async function optimize() {
    setError(null);
    setNotice(null);
    if (!s.jobDescription.trim()) return fail(new Error('Paste the job description first.'));
    if (!/^\S+@\S+\.\S+$/.test(s.email.trim())) return fail(new Error('Add a valid email in the Personal step first.'));
    const exps = s.experience.filter((e) => e.title.trim());
    const projs = s.projects.filter((p) => p.name.trim());
    if (exps.length + projs.length === 0) return fail(new Error('Add at least one experience or project first.'));

    setBusy('optimize');
    try {
      const { id: profileId } = await api<{ id: string }>('/api/profiles', { structuredJson: stateToProfile(s) });
      const { id: jdId } = await api<{ id: string }>('/api/jds', { rawText: s.jobDescription });
      const { runId: newRunId } = await api<{ runId: string }>('/api/runs', { profileId, jdId });

      type Result = {
        status: 'running' | 'done' | 'failed';
        bullets?: Record<string, { text: string; verdict: string }[]>;
        rejectedCount?: number;
        jdSkills?: string[];
      };
      let result: Result = { status: 'running' };
      while (result.status === 'running') {
        await new Promise((r) => setTimeout(r, 2500));
        result = (await (await fetch(`/api/runs/${newRunId}/bullets`)).json()) as Result;
      }
      if (result.status !== 'done' || !result.bullets) throw new Error('Optimization failed. Please try again.');

      const bullets = result.bullets;
      const wanted = new Set((result.jdSkills ?? []).map((x) => x.toLowerCase()));

      // A rewrite is used only when every bullet is fully SUPPORTED and none of
      // the user's own lines would be lost. Otherwise their wording stays.
      const kept: string[] = [];
      let applied = 0;
      const pick = (itemId: string, original: string, label: string): string => {
        const list = bullets[itemId];
        const safe = list && list.length >= toBullets(original).length && list.every((b) => b.verdict === 'SUPPORTED');
        if (safe) {
          applied++;
          return list.map((b) => b.text).join('\n');
        }
        kept.push(label);
        return original;
      };

      // Built once from the current resume (not inside a state updater) so the
      // counts in the message are exact.
      const expIds = s.experience.filter((e) => e.title.trim()).map((e) => e.id);
      const projIds = s.projects.filter((p) => p.name.trim()).map((p) => p.id);
      const next: BuilderState = {
        ...s,
        experience: s.experience.map((e) => {
          const i = expIds.indexOf(e.id);
          return i >= 0 ? { ...e, description: pick(`exp_${i + 1}`, e.description, e.title) } : e;
        }),
        projects: s.projects.map((p) => {
          const i = projIds.indexOf(p.id);
          return i >= 0 ? { ...p, description: pick(`prj_${i + 1}`, p.description, p.name) } : p;
        }),
        // Job-relevant skills first inside each group.
        skillGroups: s.skillGroups.map((g) => ({
          ...g,
          items: splitItems(g.items)
            .sort((a, b) => Number(wanted.has(b.toLowerCase())) - Number(wanted.has(a.toLowerCase())))
            .join(', '),
        })),
      };
      setBefore(s);
      setRunId(newRunId);
      setS(next);
      setNotice(
        `Optimized for this job: ${applied} section(s) rewritten and fact-checked${
          kept.length ? `; kept your own wording for ${kept.join(', ')} because a rewrite could not be fully confirmed` : ''
        }. Your matching skills now come first.`,
      );
    } catch (err) {
      fail(err);
    }
    setBusy(null);
  }

  async function download() {
    setBusy('download');
    setError(null);
    try {
      const bytes = await buildResumePdf(resume, { template, accent });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(s.name || 'Resume').replace(/[^a-z0-9]+/gi, '_')}_Resume.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      fail(err);
    }
    setBusy(null);
  }

  const patch = <T extends { id: string }>(list: T[], itemId: string, p: Partial<T>) =>
    list.map((x) => (x.id === itemId ? { ...x, ...p } : x));

  // Shared editor for Experience and Leadership entries.
  const experienceEditor = (key: 'experience' | 'leadership', noun: string, titleLabel: string, orgLabel: string) => {
    const list = s[key];
    const update = (itemId: string, p: Partial<ExperienceForm>) => set(key, patch(list, itemId, p));
    return (
      <div className="flex flex-col gap-4">
        {list.map((e, i) => (
          <div key={e.id} className="flex flex-col gap-2 rounded-md border border-[var(--border)] p-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              {noun} #{i + 1}
              <button className="text-red-400" onClick={() => set(key, list.filter((x) => x.id !== e.id))}>
                Remove
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder={titleLabel} value={e.title} onChange={(ev) => update(e.id, { title: ev.target.value })} />
              <Input placeholder={orgLabel} value={e.org} onChange={(ev) => update(e.id, { org: ev.target.value })} />
              <Input placeholder="Start (Jun 2022)" value={e.startDate} onChange={(ev) => update(e.id, { startDate: ev.target.value })} />
              <Input placeholder="End (Dec 2024)" disabled={e.current} value={e.endDate} onChange={(ev) => update(e.id, { endDate: ev.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <input type="checkbox" checked={e.current} onChange={(ev) => update(e.id, { current: ev.target.checked })} />
              Currently here
            </label>
            <Input placeholder="Location (optional)" value={e.location} onChange={(ev) => update(e.id, { location: ev.target.value })} />
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">What you did (one point per line)</span>
              <EnhanceButton
                busy={busy === `${key}-${e.id}`}
                disabled={!e.description.trim()}
                onClick={() =>
                  void enhance(
                    'bullets',
                    e.description,
                    `${e.title} at ${e.org}${e.current ? ' (current role)' : ''}`,
                    (t) => update(e.id, { description: t }),
                    `${key}-${e.id}`,
                  )
                }
              />
            </div>
            <Textarea
              className="min-h-[110px] font-sans"
              value={e.description}
              onChange={(ev) => update(e.id, { description: ev.target.value })}
              placeholder={'Built REST APIs in Python and FastAPI\nCut response time from 800 ms to 350 ms with Redis caching'}
            />
          </div>
        ))}
        <Button variant="outline" onClick={() => set(key, [...list, emptyExperience()])}>
          + Add {noun.toLowerCase()}
        </Button>
      </div>
    );
  };

  const stepBody = (() => {
    switch (STEPS[step]) {
      case 'Personal':
        return (
          <div className="flex flex-col gap-3">
            <div className="rounded-md border border-dashed border-[var(--border)] p-3 text-xs">
              <p className="mb-2 font-medium text-[var(--foreground)]">Already have a resume?</p>
              <input type="file" accept=".pdf,.docx,.txt,.md" disabled={busy !== null} onChange={(e) => void importFile(e.target.files?.[0])} />
              <p className="mt-1 text-[var(--muted)]">
                {busy === 'import' ? 'Reading your resume…' : 'Upload a PDF, Word or text file and the form fills itself in.'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-[var(--border)] text-[10px] text-[var(--muted)] hover:bg-[var(--background)]">
                {s.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.photo} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  'Add photo'
                )}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => void uploadPhoto(e.target.files?.[0])} />
              </label>
              <div className="text-xs text-[var(--muted)]">
                {s.photo ? (
                  <button className="text-red-400" onClick={() => set('photo', '')}>
                    Remove photo
                  </button>
                ) : (
                  'Optional, only used by the Modern and Sidebar templates. Most ATS and recruiters prefer no photo.'
                )}
              </div>
            </div>
            <Field label="Full name *">
              <Input value={s.name} onChange={(e) => set('name', e.target.value)} placeholder="Briar Martin" />
            </Field>
            <Field label="Job title (shown under your name, optional)">
              <Input value={s.headline} onChange={(e) => set('headline', e.target.value)} placeholder="Web Developer" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email *">
                <Input value={s.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" />
              </Field>
              <Field label="Phone">
                <Input value={s.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98765 43210" />
              </Field>
              <Field label="Location">
                <Input value={s.location} onChange={(e) => set('location', e.target.value)} placeholder="Bangalore" />
              </Field>
              <Field label="LinkedIn">
                <Input value={s.linkedin} onChange={(e) => set('linkedin', e.target.value)} placeholder="linkedin.com/in/you" />
              </Field>
            </div>
            <Field label="Website / GitHub">
              <Input value={s.website} onChange={(e) => set('website', e.target.value)} placeholder="github.com/you" />
            </Field>
          </div>
        );
      case 'Summary':
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Optional. 2-3 sentences. Skip it if your resume is tight on space.</span>
              <EnhanceButton
                busy={busy === 'summary'}
                disabled={!s.summary.trim()}
                onClick={() => void enhance('summary', s.summary, `Job title: ${s.headline}`, (t) => set('summary', t), 'summary')}
              />
            </div>
            <Textarea
              className="min-h-[160px] font-sans"
              value={s.summary}
              onChange={(e) => set('summary', e.target.value)}
              placeholder="Backend developer with 3 years of experience building REST APIs…"
            />
          </div>
        );
      case 'Experience':
        return experienceEditor('experience', 'Experience', 'Job title', 'Company');
      case 'Education':
        return (
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <input type="checkbox" checked={s.educationFirst} onChange={(e) => set('educationFirst', e.target.checked)} />
              Show Education first (good for students and freshers)
            </label>
            {s.education.map((e, i) => (
              <div key={e.id} className="flex flex-col gap-2 rounded-md border border-[var(--border)] p-3">
                <div className="flex items-center justify-between text-xs font-semibold">
                  Education #{i + 1}
                  <button className="text-red-400" onClick={() => set('education', s.education.filter((x) => x.id !== e.id))}>
                    Remove
                  </button>
                </div>
                <Input placeholder="School / University" value={e.school} onChange={(ev) => set('education', patch(s.education, e.id, { school: ev.target.value }))} />
                <Input placeholder="Degree (B.Tech in Computer Science)" value={e.degree} onChange={(ev) => set('education', patch(s.education, e.id, { degree: ev.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Dates (July 2024 - May 2028)" value={e.year} onChange={(ev) => set('education', patch(s.education, e.id, { year: ev.target.value }))} />
                  <Input placeholder="CGPA / percentage (optional)" value={e.details} onChange={(ev) => set('education', patch(s.education, e.id, { details: ev.target.value }))} />
                </div>
              </div>
            ))}
            <Button variant="outline" onClick={() => set('education', [...s.education, emptyEducation()])}>
              + Add education
            </Button>
          </div>
        );
      case 'Projects':
        return (
          <div className="flex flex-col gap-4">
            {s.projects.map((p, i) => (
              <div key={p.id} className="flex flex-col gap-2 rounded-md border border-[var(--border)] p-3">
                <div className="flex items-center justify-between text-xs font-semibold">
                  Project #{i + 1}
                  <button className="text-red-400" onClick={() => set('projects', s.projects.filter((x) => x.id !== p.id))}>
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Project name" value={p.name} onChange={(ev) => set('projects', patch(s.projects, p.id, { name: ev.target.value }))} />
                  <Input placeholder="Dates (2026 or May 2026 - Present)" value={p.dates} onChange={(ev) => set('projects', patch(s.projects, p.id, { dates: ev.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Your role (optional)" value={p.role ?? ''} onChange={(ev) => set('projects', patch(s.projects, p.id, { role: ev.target.value }))} />
                  <Input placeholder="Tech used (comma separated)" value={p.tech} onChange={(ev) => set('projects', patch(s.projects, p.id, { tech: ev.target.value }))} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--muted)]">What you built (one point per line)</span>
                  <EnhanceButton
                    busy={busy === `prj-${p.id}`}
                    disabled={!p.description.trim()}
                    onClick={() =>
                      void enhance('bullets', p.description, `Project: ${p.name}`, (t) => set('projects', patch(s.projects, p.id, { description: t })), `prj-${p.id}`)
                    }
                  />
                </div>
                <Textarea
                  className="min-h-[100px] font-sans"
                  value={p.description}
                  onChange={(ev) => set('projects', patch(s.projects, p.id, { description: ev.target.value }))}
                  placeholder="Describe your project…"
                />
              </div>
            ))}
            <Button variant="outline" onClick={() => set('projects', [...s.projects, emptyProject()])}>
              + Add project
            </Button>
          </div>
        );
      case 'Skills':
        return (
          <div className="flex flex-col gap-3">
            {s.skillGroups.map((g) => (
              <div key={g.id} className="flex flex-col gap-2 rounded-md border border-[var(--border)] p-3">
                <div className="flex items-center gap-2">
                  <Input
                    className="w-44"
                    placeholder="Group (Languages)"
                    value={g.label}
                    onChange={(ev) => set('skillGroups', patch(s.skillGroups, g.id, { label: ev.target.value }))}
                  />
                  <button className="ml-auto text-xs text-red-400" onClick={() => set('skillGroups', s.skillGroups.filter((x) => x.id !== g.id))}>
                    Remove
                  </button>
                </div>
                <Input
                  placeholder="e.g. C++, JavaScript, Python (comma separated)"
                  value={g.items}
                  onChange={(ev) => set('skillGroups', patch(s.skillGroups, g.id, { items: ev.target.value }))}
                />
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              {SKILL_LABELS.filter((l) => !s.skillGroups.some((g) => g.label.trim().toLowerCase() === l.toLowerCase())).map((l) => (
                <button
                  key={l}
                  type="button"
                  className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)]"
                  onClick={() => set('skillGroups', [...s.skillGroups, { ...emptySkillGroup(), label: l }])}
                >
                  + {l}
                </button>
              ))}
              <button
                type="button"
                className="rounded-full border border-dashed border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] hover:border-[var(--accent)]"
                onClick={() => set('skillGroups', [...s.skillGroups, emptySkillGroup()])}
              >
                + Custom group
              </button>
            </div>
            <p className="rounded-md bg-blue-500/10 p-3 text-xs text-blue-200">
              <b>Tip:</b> group skills like Languages, Frontend, Backend, Databases, Tools. Recruiters scan these lines
              quickly, and ATS match the exact words.
            </p>
          </div>
        );
      case 'Achievements':
        return (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-[var(--muted)]">Certifications, competitive-programming ratings, awards, scholarships.</p>
            {s.achievements.map((a) => (
              <div key={a.id} className="flex flex-col gap-2 rounded-md border border-[var(--border)] p-3">
                <div className="flex items-center gap-2">
                  <Input
                    className="w-44"
                    placeholder="Label (LeetCode)"
                    value={a.label}
                    onChange={(ev) => set('achievements', patch(s.achievements, a.id, { label: ev.target.value }))}
                  />
                  <button className="ml-auto text-xs text-red-400" onClick={() => set('achievements', s.achievements.filter((x) => x.id !== a.id))}>
                    Remove
                  </button>
                </div>
                <Input
                  placeholder="Maximum rating of 1687; solved 315+ problems."
                  value={a.text}
                  onChange={(ev) => set('achievements', patch(s.achievements, a.id, { text: ev.target.value }))}
                />
              </div>
            ))}
            <Button variant="outline" onClick={() => set('achievements', [...s.achievements, emptyAchievement()])}>
              + Add achievement
            </Button>
          </div>
        );
      case 'Leadership':
        return (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-[var(--muted)]">Clubs, committees, volunteering. Shown after your achievements.</p>
            {experienceEditor('leadership', 'Role', 'Role (Senior Core Member)', 'Organization')}
          </div>
        );
      case 'Job match':
        return (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-[var(--muted)]">
              Paste the job posting. buildR rewrites your experience and project points to match it, and a separate
              checker removes anything your own text does not support. Nothing is invented.
            </p>
            <Textarea
              className="min-h-[200px] font-sans"
              value={s.jobDescription}
              onChange={(e) => set('jobDescription', e.target.value)}
              placeholder="Paste the full job description here"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void optimize()} disabled={busy !== null}>
                {busy === 'optimize' ? 'Optimizing (about a minute)…' : 'Optimize for this job'}
              </Button>
              {before && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setS(before);
                    setBefore(null);
                    setNotice('Reverted to your version before optimizing.');
                  }}
                >
                  Undo optimization
                </Button>
              )}
            </div>
          </div>
        );
    }
  })();

  if (missing) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p>This resume was not found in this browser.</p>
        <Link href="/" className="text-[var(--accent)] underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const usesAccent = ACCENT_TEMPLATES.includes(template);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
            &larr; Back to Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Resume name"
              className="rounded-md border border-transparent bg-transparent px-1 text-xl font-bold hover:border-[var(--border)] focus:border-[var(--accent)] focus:outline-none"
            />
            <span className="text-xs text-[var(--muted)]">{saved ? 'Saved' : 'Saving…'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm('Clear everything in this resume?')) {
                setS(emptyState());
                setBefore(null);
                setStep(0);
              }
            }}
          >
            Clear
          </Button>
          <Button onClick={() => void download()} disabled={busy !== null}>
            {busy === 'download' ? 'Creating PDF…' : 'Download PDF'}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="h-1 w-full overflow-hidden rounded bg-[var(--border)]">
            <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>

          <div className="relative flex flex-wrap items-center gap-2">
            <button className="rounded-md bg-blue-500/15 px-3 py-1 text-xs text-blue-300" onClick={() => setPanel(panel === 'template' ? null : 'template')}>
              ▦ Template: {TEMPLATES.find((t) => t.id === template)?.name}
            </button>
            <button
              className="rounded-md bg-purple-500/15 px-3 py-1 text-xs text-purple-300 disabled:opacity-40"
              disabled={!usesAccent}
              title={usesAccent ? '' : 'Standard templates are black and white. Accent color applies to Modern and Sidebar.'}
              onClick={() => setPanel(panel === 'accent' ? null : 'accent')}
            >
              ◐ Accent
            </button>
            <div className="ml-auto flex items-center gap-1 text-xs">
              <button className="px-2 py-1 disabled:opacity-30" disabled={step === 0} onClick={() => setStep(step - 1)}>
                ‹ Previous
              </button>
              <button className="px-2 py-1 disabled:opacity-30" disabled={step === STEPS.length - 1} onClick={() => setStep(step + 1)}>
                Next ›
              </button>
            </div>

            {panel === 'template' && (
              <div className="absolute left-0 top-9 z-10 flex w-80 flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 shadow-xl">
                {(['Standard', 'Creative'] as const).map((group) => (
                  <div key={group} className="flex flex-col gap-1">
                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{group}</div>
                    {TEMPLATES.filter((t) => t.group === group).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setTemplate(t.id);
                          setPanel(null);
                        }}
                        className={`rounded-md border p-2 text-left text-xs ${template === t.id ? 'border-blue-400 bg-blue-500/10' : 'border-[var(--border)]'}`}
                      >
                        <div className="font-semibold">{t.name}</div>
                        <div className="text-[var(--muted)]">{t.blurb}</div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {panel === 'accent' && usesAccent && (
              <div className="absolute left-32 top-9 z-10 grid w-60 grid-cols-4 gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 shadow-xl">
                {ACCENTS.map((a) => (
                  <button
                    key={a.hex}
                    onClick={() => {
                      setAccent(a.hex);
                      setPanel(null);
                    }}
                    className="flex flex-col items-center gap-1 text-[10px]"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: a.hex }}>
                      {accent === a.hex ? '✓' : ''}
                    </span>
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1 text-[11px]">
            {STEPS.map((name, i) => (
              <button
                key={name}
                onClick={() => setStep(i)}
                className={`rounded-full px-2.5 py-1 ${i === step ? 'bg-[var(--accent)] text-white' : 'bg-[var(--background)] text-[var(--muted)]'}`}
              >
                {name}
              </button>
            ))}
          </div>

          <div>
            <h2 className="mb-2 text-base font-semibold">{STEPS[step]}</h2>
            {stepBody}
          </div>

          {error && <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-300">{error}</p>}
          {notice && <p className="rounded-md bg-green-500/10 p-2 text-xs text-green-300">{notice}</p>}
          {runId && (
            <Link href={`/runs/${runId}`} className="text-xs text-[var(--accent)] hover:underline">
              See how the last optimization was checked
            </Link>
          )}
        </div>

        {/* Live preview: the actual PDF, fitted to the screen height. */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div
            className="mx-auto overflow-hidden rounded-md bg-white shadow-lg"
            style={{ height: 'calc(100vh - 130px)', maxWidth: 'calc((100vh - 130px) * 0.78)' }}
          >
            {pdfUrl ? (
              <iframe
                title="Resume preview"
                src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                className="h-full w-full border-0"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-gray-400">Building preview…</div>
            )}
          </div>
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="mt-1 block text-center text-[11px] text-[var(--muted)] hover:underline">
              Open preview in a new tab
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
