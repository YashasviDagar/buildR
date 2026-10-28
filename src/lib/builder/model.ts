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
  year: string; // e.g. "July 2024 - May 2028"
  details: string; // e.g. "CGPA: 8.68"
}

export interface ProjectForm {
  id: string;
  name: string;
  tech: string; // comma separated
  role: string; // e.g. Founder & Developer
  link: string;
  dates: string;
  description: string; // one bullet per line
}

export interface SkillGroup {
  id: string;
  label: string; // e.g. "Languages"
  items: string; // comma separated
}

export interface AchievementForm {
  id: string;
  label: string; // e.g. "LeetCode"
  text: string;
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
  skillGroups: SkillGroup[];
  achievements: AchievementForm[];
  leadership: ExperienceForm[];
  educationFirst: boolean;
  jobDescription: string;
  photo: string; // PNG data URL, empty when none
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const SKILL_LABELS = [
  'Languages',
  'Frontend',
  'Backend',
  'Databases & Infra',
  'AI',
  'Developer Tools',
  'Coursework',
] as const;

// New resumes start with the usual groups so the user only fills in items.
export function defaultSkillGroups(): SkillGroup[] {
  return ['Languages', 'Frontend', 'Backend', 'Databases & Infra', 'Developer Tools'].map((label) => ({
    id: newId(),
    label,
    items: '',
  }));
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
  skillGroups: defaultSkillGroups(),
  achievements: [],
  leadership: [],
  educationFirst: false,
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
  role: '',
  link: '',
  dates: '',
  description: '',
});

export const emptySkillGroup = (): SkillGroup => ({ id: newId(), label: '', items: '' });
export const emptyAchievement = (): AchievementForm => ({ id: newId(), label: '', text: '' });

export function toBullets(description: string): string[] {
  return description
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•]+\s*/, '').trim())
    .filter(Boolean);
}

export function splitItems(items: string): string[] {
  return items
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function allSkills(s: BuilderState): string[] {
  return s.skillGroups.flatMap((g) => splitItems(g.items));
}

function period(e: ExperienceForm): string | undefined {
  const end = e.current ? 'Present' : e.endDate.trim();
  const start = e.startDate.trim();
  if (!start && !end) return undefined;
  return [start, end].filter(Boolean).join(' - ');
}

function experienceEntries(list: ExperienceForm[]): ResumeEntry[] {
  return list
    .filter((e) => e.title.trim() || e.org.trim())
    .map((e) => {
      const dates = period(e);
      const place = e.location.trim() || undefined;
      return {
        heading: [e.title.trim(), e.org.trim()].filter(Boolean).join(', '),
        meta: [dates, place].filter(Boolean).join(' | ') || undefined,
        parts: {
          primary: e.org.trim() || e.title.trim(),
          secondary: e.org.trim() ? e.title.trim() || undefined : undefined,
          dates,
          right: place,
        },
        bullets: toBullets(e.description),
      };
    });
}

// Builder state -> printable resume (used by the preview and the PDF).
export function stateToResume(s: BuilderState): FinalResume {
  const experience = experienceEntries(s.experience);
  const leadership = experienceEntries(s.leadership);

  const projects: ResumeEntry[] = s.projects
    .filter((p) => p.name.trim())
    .map((p) => ({
      heading: p.name.trim(),
      meta: p.tech.trim() ? `Tech: ${p.tech.trim()}` : undefined,
      parts: {
        primary: p.name.trim(),
        note: [(p.role ?? '').trim(), p.tech.trim()].filter(Boolean).join(' | ') || undefined,
        dates: (p.dates ?? '').trim() || undefined,
      },
      bullets: toBullets(p.description),
    }));

  const education: ResumeEntry[] = s.education
    .filter((e) => e.degree.trim() || e.school.trim())
    .map((e) => ({
      heading: [e.degree.trim(), e.school.trim()].filter(Boolean).join(', '),
      meta: [e.year.trim(), e.details.trim()].filter(Boolean).join(' | ') || undefined,
      parts: {
        primary: e.school.trim() || e.degree.trim(),
        secondary: e.school.trim() ? e.degree.trim() || undefined : undefined,
        dates: e.year.trim() || undefined,
        right: e.details.trim() || undefined,
      },
      bullets: [],
    }));

  const groups = s.skillGroups
    .map((g) => ({ label: g.label.trim(), text: splitItems(g.items).join(', ') }))
    .filter((g) => g.text);

  const achievements = s.achievements
    .map((a) => ({ label: a.label.trim(), text: a.text.trim() }))
    .filter((a) => a.text);

  const block = (title: string, entries: ResumeEntry[]): ResumeSection | null =>
    entries.length > 0 ? { title, entries } : null;

  const ordered: (ResumeSection | null)[] = s.educationFirst
    ? [
        block('EDUCATION', education),
        block('PROFESSIONAL EXPERIENCE', experience),
        block('PROJECTS', projects),
      ]
    : [
        block('PROFESSIONAL EXPERIENCE', experience),
        block('PROJECTS', projects),
        block('EDUCATION', education),
      ];

  const sections = ordered.filter((x): x is ResumeSection => x !== null);

  if (groups.length > 0) {
    sections.push({
      title: 'TECHNICAL SKILLS',
      entries: [],
      lines: groups.map((g) => (g.label ? `${g.label}: ${g.text}` : g.text)),
      labeled: groups,
    });
  }
  if (achievements.length > 0) {
    sections.push({
      title: 'CERTIFICATIONS & ACHIEVEMENTS',
      entries: [],
      lines: achievements.map((a) => (a.label ? `${a.label}: ${a.text}` : a.text)),
      labeled: achievements,
    });
  }
  const lead = block('LEADERSHIP / EXTRACURRICULAR', leadership);
  if (lead) sections.push(lead);

  return {
    name: s.name.trim() || 'Your Name',
    headline: s.headline.trim() || undefined,
    photo: s.photo || undefined,
    contact: [s.location, s.phone, s.email, s.linkedin, s.website].map((x) => x.trim()).filter(Boolean),
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
        tech: splitItems(p.tech),
        link: p.link.trim() || undefined,
        highlights: toBullets(p.description),
      })),
    skills: s.skillGroups.flatMap((g) =>
      splitItems(g.items).map((name) => ({ name, category: g.label.trim() || undefined })),
    ),
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

function groupSkills(skills: StructuredProfile['skills']): SkillGroup[] {
  const byLabel = new Map<string, string[]>();
  for (const sk of skills) {
    const label = sk.category?.trim() || '';
    byLabel.set(label, [...(byLabel.get(label) ?? []), sk.name]);
  }
  return [...byLabel.entries()].map(([label, names]) => ({ id: newId(), label, items: names.join(', ') }));
}

// Imported profile (from an uploaded resume) -> builder state.
function toExperienceForm(e: StructuredProfile['experience'][number]): ExperienceForm {
  const ongoing = !e.endDate || /^(present|now|current)$/i.test(e.endDate);
  return {
    id: newId(),
    title: e.title,
    org: e.org ?? '',
    startDate: e.startDate ?? '',
    endDate: ongoing ? '' : e.endDate ?? '',
    current: ongoing,
    location: e.location ?? '',
    description: uniqueLines([e.description, ...e.highlights]),
  };
}

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
    educationFirst: p.experience.length === 0,
    experience: p.experience.map(toExperienceForm),
    leadership: (p.leadership ?? []).map(toExperienceForm),
    achievements: (p.achievements ?? []).map((a) => ({
      id: newId(),
      label: a.label ?? '',
      text: a.text,
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
      role: pr.role ?? '',
      link: pr.link ?? '',
      dates: pr.dates ?? '',
      description: uniqueLines([pr.description, ...pr.highlights]),
    })),
    skillGroups: p.skills.length > 0 ? groupSkills(p.skills) : defaultSkillGroups(),
  };
}

export const TEMPLATES = [
  { id: 'professional', name: 'Professional', blurb: 'Serif, black and white, dates on the right. The recruiter standard.', group: 'Standard' },
  { id: 'compact', name: 'Compact', blurb: 'Same look, tighter spacing for long resumes.', group: 'Standard' },
  { id: 'executive', name: 'Executive', blurb: 'Clean sans-serif with left-aligned header.', group: 'Standard' },
  { id: 'minimal', name: 'Minimal', blurb: 'Ultra-clean, puts your content front and center.', group: 'Standard' },
  { id: 'modern', name: 'Modern', blurb: 'Colored header band, supports a photo.', group: 'Creative' },
  { id: 'sidebar', name: 'Sidebar', blurb: 'Two columns with an optional photo.', group: 'Creative' },
] as const;
export type TemplateId = (typeof TEMPLATES)[number]['id'];

// Standard templates are black and white; accent color only applies here.
export const ACCENT_TEMPLATES: TemplateId[] = ['modern', 'sidebar'];

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
