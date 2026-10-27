import type { FinalResume, ResumeEntry, ResumeSection } from '../final-resume';
import type { StructuredProfile } from '../../types';

// Editable resume state for the builder UI. Pure data + pure converters so the
// same code feeds the live preview, the PDF export and the verification
// pipeline.

export interface ExperienceForm {
  id: string;
  title: string;
  org: string;
  startDate: string;
  endDate: string;
  current: boolean;
  location: string;
  description: string; // one bullet per line
}

export interface EducationForm {
  id: string;
  degree: string;
  school: string;
  year: string;
  details: string;
}

export interface ProjectForm {
  id: string;
  name: string;
  tech: string; // comma separated
  link: string;
  description: string; // one bullet per line
}

export interface BuilderState {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
  summary: string;
  experience: ExperienceForm[];
  education: EducationForm[];
  projects: ProjectForm[];
  skills: string[];
  jobDescription: string;
  photo: string; // PNG data URL, empty when none
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const emptyState = (): BuilderState => ({
  name: '',
  headline: '',
  email: '',
  phone: '',
  location: '',
  linkedin: '',
  website: '',
  summary: '',
  experience: [],
  education: [],
  projects: [],
  skills: [],
  jobDescription: '',
  photo: '',
});

export const emptyExperience = (): ExperienceForm => ({
  id: newId(),
  title: '',
  org: '',
  startDate: '',
  endDate: '',
  current: false,
  location: '',
  description: '',
});

export const emptyEducation = (): EducationForm => ({
  id: newId(),
  degree: '',
  school: '',
  year: '',
  details: '',
});

export const emptyProject = (): ProjectForm => ({
  id: newId(),
  name: '',
  tech: '',
  link: '',
  description: '',
});

export function toBullets(description: string): string[] {
  return description
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•]+\s*/, '').trim())
    .filter(Boolean);
}

function period(e: ExperienceForm): string | undefined {
  const end = e.current ? 'Present' : e.endDate.trim();
  const start = e.startDate.trim();
  if (!start && !end) return undefined;
  return [start, end].filter(Boolean).join(' - ');
}

// Builder state -> printable resume (used by the preview and the PDF).
export function stateToResume(s: BuilderState): FinalResume {
  const sections: ResumeSection[] = [];

  const experience: ResumeEntry[] = s.experience
    .filter((e) => e.title.trim() || e.org.trim())
    .map((e) => ({
      heading: [e.title.trim(), e.org.trim()].filter(Boolean).join(', '),
      meta: [period(e), e.location.trim()].filter(Boolean).join(' | ') || undefined,
      bullets: toBullets(e.description),
    }));
  if (experience.length > 0) sections.push({ title: 'PROFESSIONAL EXPERIENCE', entries: experience });

  const projects: ResumeEntry[] = s.projects
    .filter((p) => p.name.trim())
    .map((p) => ({
      heading: p.name.trim(),
      meta: p.tech.trim() ? `Tech: ${p.tech.trim()}` : undefined,
      bullets: toBullets(p.description),
    }));
  if (projects.length > 0) sections.push({ title: 'PROJECTS', entries: projects });

  const education: ResumeEntry[] = s.education
    .filter((e) => e.degree.trim() || e.school.trim())
    .map((e) => ({
      heading: [e.degree.trim(), e.school.trim()].filter(Boolean).join(', '),
      meta: [e.year.trim(), e.details.trim()].filter(Boolean).join(' | ') || undefined,
      bullets: [],
    }));
  if (education.length > 0) sections.push({ title: 'EDUCATION', entries: education });

  if (s.skills.length > 0) {
    sections.push({ title: 'SKILLS', entries: [], lines: [s.skills.join(', ')] });
  }

  return {
    name: s.name.trim() || 'Your Name',
    photo: s.photo || undefined,
    headline: s.headline.trim() || undefined,
    contact: [s.email, s.phone, s.location, s.linkedin, s.website]
      .map((x) => x.trim())
      .filter(Boolean),
    summary: s.summary.trim() || undefined,
    sections,
  };
}

// Builder state -> profile for the verification pipeline. Each bullet line
// becomes a highlight so it can be cited and checked individually.
export function stateToProfile(s: BuilderState): StructuredProfile {
  return {
    contact: {
      name: s.name.trim() || 'Candidate',
      email: s.email.trim(),
      phone: s.phone.trim() || undefined,
      location: s.location.trim() || undefined,
      links: [s.linkedin, s.website].map((x) => x.trim()).filter(Boolean),
    },
    summary: s.summary.trim() || undefined,
    experience: s.experience
      .filter((e) => e.title.trim())
      .map((e) => ({
        title: e.title.trim(),
        org: e.org.trim() || undefined,
        startDate: e.startDate.trim() || undefined,
        endDate: e.current ? 'Present' : e.endDate.trim() || undefined,
        location: e.location.trim() || undefined,
        highlights: toBullets(e.description),
      })),
    education: s.education
      .filter((e) => e.degree.trim() && e.school.trim())
      .map((e) => ({
        degree: e.degree.trim(),
        school: e.school.trim(),
        year: e.year.trim() || undefined,
        details: e.details.trim() || undefined,
      })),
    projects: s.projects
      .filter((p) => p.name.trim())
      .map((p) => ({
        name: p.name.trim(),
        tech: p.tech.split(',').map((t) => t.trim()).filter(Boolean),
        link: p.link.trim() || undefined,
        highlights: toBullets(p.description),
      })),
    skills: s.skills.map((name) => ({ name })),
  };
}

// Join lines, dropping blanks and repeats (the extractor sometimes copies a
// highlight into the description too).
function uniqueLines(lines: (string | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines) {
    const t = l?.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  // Drop a line that is just a fragment of another kept line.
  const norm = out.map((x) => x.toLowerCase().replace(/[.\s]+$/, ''));
  return out
    .filter((_, i) => !norm.some((o, j) => j !== i && o.length > norm[i].length && o.includes(norm[i])))
    .join('\n');
}

// Imported profile (from an uploaded resume) -> builder state.
export function profileToState(p: StructuredProfile, prev: BuilderState): BuilderState {
  const links = p.contact.links ?? [];
  return {
    ...prev,
    name: p.contact.name,
    headline: prev.headline || p.experience[0]?.title || '',
    email: p.contact.email,
    phone: p.contact.phone ?? '',
    location: p.contact.location ?? '',
    linkedin: links.find((l) => /linkedin/i.test(l)) ?? '',
    website: links.find((l) => !/linkedin/i.test(l)) ?? '',
    summary: p.summary ?? '',
    experience: p.experience.map((e) => ({
      id: newId(),
      title: e.title,
      org: e.org ?? '',
      startDate: e.startDate ?? '',
      endDate: /^(present|now|current)$/i.test(e.endDate ?? '') ? '' : e.endDate ?? '',
      current: !e.endDate || /^(present|now|current)$/i.test(e.endDate),
      location: e.location ?? '',
      description: uniqueLines([e.description, ...e.highlights]),
    })),
    education: p.education.map((e) => ({
      id: newId(),
      degree: e.degree,
      school: e.school,
      year: e.year ?? '',
      details: e.details ?? '',
    })),
    projects: p.projects.map((pr) => ({
      id: newId(),
      name: pr.name,
      tech: pr.tech.join(', '),
      link: pr.link ?? '',
      description: uniqueLines([pr.description, ...pr.highlights]),
    })),
    skills: p.skills.map((s) => s.name),
  };
}

export const TEMPLATES = [
  { id: 'classic', name: 'Classic', blurb: 'Clean, traditional layout with clear sections.' },
  { id: 'modern', name: 'Modern', blurb: 'Colored header band with bold section titles.' },
  { id: 'minimal', name: 'Minimal', blurb: 'Ultra-clean, puts your content front and center.' },
  { id: 'sidebar', name: 'Sidebar', blurb: 'Two columns with an optional profile photo.' },
] as const;
export type TemplateId = (typeof TEMPLATES)[number]['id'];

export const ACCENTS = [
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Purple', hex: '#9333ea' },
  { name: 'Green', hex: '#059669' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Teal', hex: '#0d9488' },
  { name: 'Pink', hex: '#db2777' },
  { name: 'Gray', hex: '#4b5563' },
  { name: 'Black', hex: '#111827' },
] as const;
