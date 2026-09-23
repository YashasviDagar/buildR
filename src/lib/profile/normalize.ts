import {
  structuredProfileSchema,
  type StructuredProfile,
} from '../../types.js';

// Normalize an incoming profile (user JSON or LLM output) into the canonical
// stored form: Zod-validated, every item carrying a stable unique itemId
// (exp_1, edu_2, prj_3, skl_4) that the generator cites and the verifier checks.
export function normalizeProfile(input: unknown): StructuredProfile {
  const parsed = structuredProfileSchema.parse(input);

  const counters = { exp: 0, edu: 0, prj: 0, skl: 0 };
  const seenIds = new Set<string>();
  const assign = (prefix: keyof typeof counters) => {
    let id: string;
    do {
      counters[prefix] += 1;
      id = `${prefix}_${counters[prefix]}`;
    } while (seenIds.has(id));
    seenIds.add(id);
    return id;
  };

  const claim = (existing: string | undefined, prefix: keyof typeof counters): string => {
    if (existing) {
      if (seenIds.has(existing)) return assign(prefix);
      seenIds.add(existing);
      return existing;
    }
    return assign(prefix);
  };

  const profile: StructuredProfile = {
    ...parsed,
    experience: parsed.experience.map((item) => ({ ...item, itemId: claim(item.itemId, 'exp') })),
    education: parsed.education.map((item) => ({ ...item, itemId: claim(item.itemId, 'edu') })),
    projects: parsed.projects.map((item) => ({ ...item, itemId: claim(item.itemId, 'prj') })),
    skills: parsed.skills.map((item) => ({ ...item, itemId: claim(item.itemId, 'skl') })),
  };
  return profile;
}

export function getProfileItem(profile: StructuredProfile, itemId: string) {
  const experience = profile.experience.find((x) => x.itemId === itemId);
  if (experience) return { kind: 'experience' as const, ...experience };
  const education = profile.education.find((x) => x.itemId === itemId);
  if (education) return { kind: 'education' as const, ...education };
  const project = profile.projects.find((x) => x.itemId === itemId);
  if (project) return { kind: 'project' as const, ...project };
  const skill = profile.skills.find((x) => x.itemId === itemId);
  if (skill) return { kind: 'skill' as const, ...skill };
  return null;
}
