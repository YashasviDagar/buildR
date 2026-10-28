import { emptyState, newId, type BuilderState, type TemplateId } from './model';

// Saved resumes live in this browser only (localStorage). Every access is
// wrapped: storage can be blocked, full or empty.

export interface SavedResume {
  id: string;
  title: string;
  updatedAt: number;
  state: BuilderState;
  template: TemplateId;
  accent: string;
  runId?: string; // last verification run, for the "how it was checked" link
}

const KEY = 'buildr.resumes.v2';

export function listResumes(): SavedResume[] {
  try {
    const raw = localStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as SavedResume[]) : [];
    return all.map(normalize).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

// Fill in fields added after a resume was saved, and map retired templates.
function normalize(r: SavedResume): SavedResume {
  const state = { ...emptyState(), ...r.state } as BuilderState & { skills?: string[] };
  if (state.skillGroups.every((g) => !g.items.trim()) && Array.isArray(state.skills) && state.skills.length > 0) {
    state.skillGroups = [{ id: newId(), label: '', items: state.skills.join(', ') }];
  }
  state.projects = state.projects.map((p) => ({ ...p, dates: p.dates ?? '', role: p.role ?? '', link: p.link ?? '', tech: p.tech ?? '' }));
  const template = (r.template as string) === 'classic' ? 'professional' : r.template;
  return { ...r, state, template };
}

function writeAll(all: SavedResume[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: the in-memory copy still works for this session
  }
}

export function getResume(id: string): SavedResume | null {
  return listResumes().find((r) => r.id === id) ?? null;
}

export function saveResume(r: SavedResume) {
  const others = listResumes().filter((x) => x.id !== r.id);
  writeAll([{ ...r, updatedAt: Date.now() }, ...others]);
}

export function deleteResume(id: string) {
  writeAll(listResumes().filter((r) => r.id !== id));
}

export function createResume(state?: BuilderState, title = 'My Resume'): SavedResume {
  const r: SavedResume = {
    id: newId(),
    title,
    updatedAt: Date.now(),
    state: state ?? emptyState(),
    template: 'professional',
    accent: '#2563eb',
  };
  saveResume(r);
  return r;
}
