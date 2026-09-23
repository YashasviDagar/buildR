import { z } from 'zod';

export const VERDICTS = ['SUPPORTED', 'PARTIAL', 'UNSUPPORTED'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const SECTION_NAMES = ['experience', 'projects', 'education', 'skills'] as const;
export type SectionName = (typeof SECTION_NAMES)[number];

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const contactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  location: z.string().optional(),
  links: z.array(z.string()).default([]),
});

export const experienceItemSchema = z.object({
  itemId: z.string().optional(),
  title: z.string().min(1),
  org: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  highlights: z.array(z.string()).default([]),
});

export const educationItemSchema = z.object({
  itemId: z.string().optional(),
  degree: z.string().min(1),
  school: z.string().min(1),
  year: z.string().optional(),
  details: z.string().optional(),
});

export const projectItemSchema = z.object({
  itemId: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  tech: z.array(z.string()).default([]),
  highlights: z.array(z.string()).default([]),
  link: z.string().optional(),
});

export const skillItemSchema = z.object({
  itemId: z.string().optional(),
  name: z.string().min(1),
  category: z.string().optional(),
  level: z.string().optional(),
});

export const structuredProfileSchema = z.object({
  contact: contactSchema,
  summary: z.string().optional(),
  experience: z.array(experienceItemSchema).default([]),
  education: z.array(educationItemSchema).default([]),
  projects: z.array(projectItemSchema).default([]),
  skills: z.array(skillItemSchema).default([]),
});

export type StructuredProfile = z.infer<typeof structuredProfileSchema>;
export type ExperienceItem = z.infer<typeof experienceItemSchema>;
export type EducationItem = z.infer<typeof educationItemSchema>;
export type ProjectItem = z.infer<typeof projectItemSchema>;
export type SkillItem = z.infer<typeof skillItemSchema>;

// Any profile item the generator/verifier can reference by itemId.
export type ProfileItem =
  | ({ kind: 'experience' } & ExperienceItem)
  | ({ kind: 'education' } & EducationItem)
  | ({ kind: 'project' } & ProjectItem)
  | ({ kind: 'skill' } & SkillItem);

// ---------------------------------------------------------------------------
// Job description
// ---------------------------------------------------------------------------

export const experienceLevelSchema = z.enum(['junior', 'mid', 'senior', 'lead', 'unknown']);
export type ExperienceLevel = z.infer<typeof experienceLevelSchema>;

export const parsedJdSchema = z.object({
  requiredSkills: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  qualifications: z.array(z.string()).default([]),
  experienceLevel: experienceLevelSchema.default('unknown'),
  niceToHave: z.array(z.string()).default([]),
});

export type ParsedJd = z.infer<typeof parsedJdSchema>;

// ---------------------------------------------------------------------------
// Generator / Verifier structured outputs
// ---------------------------------------------------------------------------

export const generatedBulletSchema = z.object({
  text: z.string().min(1),
  sourceItemId: z.string().min(1),
});

export type GeneratedBullet = z.infer<typeof generatedBulletSchema>;

export const generatedSectionSchema = z.object({
  section: z.string(),
  bullets: z.array(generatedBulletSchema),
});

export type GeneratedSection = z.infer<typeof generatedSectionSchema>;

export const generatorOutputSchema = z.object({
  sections: z.array(generatedSectionSchema),
});

export const verdictResultSchema = z.object({
  bulletIndex: z.number().int(),
  verdict: z.enum(VERDICTS),
  justification: z.string(),
});

export type VerdictResult = z.infer<typeof verdictResultSchema>;

export const verifierOutputSchema = z.object({
  results: z.array(verdictResultSchema),
});

// ---------------------------------------------------------------------------
// Rejection feedback fed back into the generator on revision passes
// ---------------------------------------------------------------------------

export interface RejectionFeedback {
  section: string;
  text: string;
  reason: string;
}
