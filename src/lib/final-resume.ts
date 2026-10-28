import type { GeneratedSection, ParsedJd, StructuredProfile } from '../types';

// Turns a verified draft into the structure that gets printed on the PDF.
// Layout facts (employer, dates, degree, school) come straight from the
// profile in code, never from the LLM. Only bullets the verifier did not
// reject are kept.

// Structured layout used by the standard templates: bold primary line with
// dates on the right, italic secondary line with a right-hand detail.
export interface EntryParts {
  primary: string;
  secondary?: string;
  note?: string; // italic text after the primary (e.g. tech stack)
  dates?: string;
  right?: string;
}

export interface ResumeEntry {
  heading: string;
  meta?: string;
  parts?: EntryParts;
  bullets: string[];
}

export interface ResumeSection {
  title: string;
  entries: ResumeEntry[];
  lines?: string[];
  labeled?: { label: string; text: string }[];
}

export interface FinalResume {
  name: string;
  headline?: string;
  photo?: string; // PNG data URL
  contact: string[];
  summary?: string;
  sections: ResumeSection[];
}

export type IsRejected = (section: string, text: string, sourceItemId: string) => boolean;

function bulletsFor(
  sections: GeneratedSection[],
  sectionName: string,
  itemId: string | undefined,
  isRejected: IsRejected,
): string[] {
  if (!itemId) return [];
  return sections
    .filter((s) => s.section === sectionName)
    .flatMap((s) => s.bullets)
    .filter((b) => b.sourceItemId === itemId && !isRejected(sectionName, b.text, b.sourceItemId))
    .map((b) => b.text.trim());
}

function period(start?: string, end?: string): string | undefined {
  if (!start && !end) return undefined;
  return `${start ?? ''} - ${end ?? 'Present'}`.trim();
}

export function buildFinalResume(
  profile: StructuredProfile,
  jd: ParsedJd,
  sections: GeneratedSection[],
  isRejected: IsRejected,
): FinalResume {
  const c = profile.contact;
  const out: ResumeSection[] = [];

  const experience: ResumeEntry[] = [];
  for (const item of profile.experience) {
    const bullets = bulletsFor(sections, 'experience', item.itemId, isRejected);
    if (bullets.length === 0) continue;
    experience.push({
      heading: [item.title, item.org].filter(Boolean).join(', '),
      meta: [period(item.startDate, item.endDate), item.location].filter(Boolean).join(' | ') || undefined,
      bullets,
    });
  }
  if (experience.length > 0) out.push({ title: 'PROFESSIONAL EXPERIENCE', entries: experience });

  const projects: ResumeEntry[] = [];
  for (const item of profile.projects) {
    const bullets = bulletsFor(sections, 'projects', item.itemId, isRejected);
    if (bullets.length === 0) continue;
    projects.push({
      heading: item.name,
      meta: item.tech.length > 0 ? `Tech: ${item.tech.join(', ')}` : undefined,
      bullets,
    });
  }
  if (projects.length > 0) out.push({ title: 'PROJECTS', entries: projects });

  const education: ResumeEntry[] = profile.education.map((e) => ({
    heading: `${e.degree}, ${e.school}`,
    meta: [e.year, e.details].filter(Boolean).join(' | ') || undefined,
    bullets: [],
  }));
  if (education.length > 0) out.push({ title: 'EDUCATION', entries: education });

  // Skills: plain list, JD-relevant skills first, grouped by category if given.
  const wanted = new Set(
    [...jd.requiredSkills, ...jd.keywords, ...jd.niceToHave].map((s) => s.toLowerCase()),
  );
  const keptSkills = profile.skills.filter(
    (sk) => !isRejected('skills', sk.name.trim(), sk.itemId ?? ''),
  );
  const ordered = [...keptSkills].sort(
    (a, b) => Number(wanted.has(b.name.toLowerCase())) - Number(wanted.has(a.name.toLowerCase())),
  );
  if (ordered.length > 0) {
    const byCategory = new Map<string, string[]>();
    for (const sk of ordered) {
      const key = sk.category?.trim() || 'Skills';
      byCategory.set(key, [...(byCategory.get(key) ?? []), sk.name]);
    }
    out.push({
      title: 'SKILLS',
      entries: [],
      lines: [...byCategory.entries()].map(([cat, names]) => `${cat}: ${names.join(', ')}`),
    });
  }

  return {
    name: c.name,
    contact: [c.email, c.phone, c.location, ...c.links].filter((x): x is string => Boolean(x)),
    summary: profile.summary?.trim() || undefined,
    sections: out,
  };
}
