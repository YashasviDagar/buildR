import type { ParsedJd, GeneratedSection, ProfileItem, StructuredProfile } from '../../types.js';

// Render a single profile item verbatim — this exact string is what the
// verifier sees as the claimed source, so it must be complete and faithful.
export function renderProfileItemContent(item: ProfileItem): string {
  switch (item.kind) {
    case 'experience':
      return [
        `Experience: ${item.title}${item.org ? ` at ${item.org}` : ''}`,
        item.startDate || item.endDate ? `Period: ${item.startDate ?? '?'} - ${item.endDate ?? 'present'}` : null,
        item.location ? `Location: ${item.location}` : null,
        item.description ?? null,
        ...item.highlights.map((h) => `- ${h}`),
      ]
        .filter(Boolean)
        .join('\n');
    case 'education':
      return [
        `Education: ${item.degree}, ${item.school}`,
        item.year ? `Year: ${item.year}` : null,
        item.details ?? null,
      ]
        .filter(Boolean)
        .join('\n');
    case 'project':
      return [
        `Project: ${item.name}`,
        item.link ? `Link: ${item.link}` : null,
        item.tech.length > 0 ? `Tech: ${item.tech.join(', ')}` : null,
        item.description ?? null,
        ...item.highlights.map((h) => `- ${h}`),
      ]
        .filter(Boolean)
        .join('\n');
    case 'skill':
      return [
        `Skill: ${item.name}`,
        item.category ? `Category: ${item.category}` : null,
        item.level ? `Level: ${item.level}` : null,
      ]
        .filter(Boolean)
        .join('\n');
  }
}

// Deterministic plain-text rendering of a draft — the exact string the ATS
// scorer and the simulated parser see. Includes the deterministic contact
// header generated from profile contact data (not from the LLM).
export function renderDraftText(
  profile: StructuredProfile,
  sections: GeneratedSection[],
): string {
  const c = profile.contact;
  const header = [c.name, c.email, c.phone, c.location, ...c.links]
    .filter(Boolean)
    .join(' | ');

  const body = sections.map((section) => {
    const title = SECTION_TITLES[section.section] ?? titleize(section.section);
    const lines = section.bullets.map((b) => `- ${b.text}`);
    return `${title}\n${lines.join('\n')}`;
  });

  return [header, '', ...body.map((b) => b)].join('\n\n').trim();
}

const SECTION_TITLES: Record<string, string> = {
  experience: 'Professional Experience',
  projects: 'Projects',
  education: 'Education',
  skills: 'Technical Skills',
};

function titleize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Flatten the JD to the text used for semantic similarity.
export function renderJdText(jd: ParsedJd): string {
  return [
    `Required skills: ${jd.requiredSkills.join(', ')}`,
    `Keywords: ${jd.keywords.join(', ')}`,
    `Nice to have: ${jd.niceToHave.join(', ')}`,
    `Qualifications: ${jd.qualifications.join('; ')}`,
    `Experience level: ${jd.experienceLevel}`,
  ].join('\n');
}
