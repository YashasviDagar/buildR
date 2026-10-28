import { describe, expect, it } from 'vitest';
import { buildFinalResume } from '../src/lib/final-resume';
import { buildResumePdf } from '../src/lib/resume-pdf';
import type { GeneratedSection, ParsedJd, StructuredProfile } from '../src/types';

const profile: StructuredProfile = {
  contact: { name: 'Test User', email: 'test@example.com', links: [] },
  experience: [
    {
      itemId: 'exp_1',
      title: 'Engineer',
      org: 'Acme',
      startDate: '2020',
      highlights: [],
    },
  ],
  education: [{ itemId: 'edu_1', degree: 'B.Sc. CS', school: 'State University', year: '2019' }],
  projects: [],
  skills: [
    { itemId: 'skl_1', name: 'Go' },
    { itemId: 'skl_2', name: 'Python' },
  ],
};

const jd: ParsedJd = {
  requiredSkills: ['python'],
  keywords: [],
  qualifications: [],
  experienceLevel: 'mid',
  niceToHave: [],
};

const sections: GeneratedSection[] = [
  {
    section: 'experience',
    bullets: [
      { text: 'Built a billing API.', sourceItemId: 'exp_1' },
      { text: 'Led a team of 40 engineers.', sourceItemId: 'exp_1' },
    ],
  },
];

describe('buildFinalResume', () => {
  it('drops rejected bullets and keeps verified ones', () => {
    const resume = buildFinalResume(
      profile,
      jd,
      sections,
      (_s, text) => text.startsWith('Led a team'),
    );
    const exp = resume.sections.find((s) => s.title === 'PROFESSIONAL EXPERIENCE');
    expect(exp?.entries[0].bullets).toEqual(['Built a billing API.']);
    expect(exp?.entries[0].heading).toBe('Engineer, Acme');
    expect(exp?.entries[0].meta).toBe('2020 - Present');
  });

  it('omits an entry whose bullets were all rejected', () => {
    const resume = buildFinalResume(profile, jd, sections, () => true);
    expect(resume.sections.find((s) => s.title === 'PROFESSIONAL EXPERIENCE')).toBeUndefined();
  });

  it('lists JD-relevant skills first and takes education from the profile', () => {
    const resume = buildFinalResume(profile, jd, sections, () => false);
    expect(resume.sections.find((s) => s.title === 'SKILLS')?.lines).toEqual(['Skills: Python, Go']);
    expect(resume.sections.find((s) => s.title === 'EDUCATION')?.entries[0].heading).toBe(
      'B.Sc. CS, State University',
    );
  });
});

describe('buildResumePdf', () => {
  it('produces a valid PDF even with non-Latin characters in the text', async () => {
    const resume = buildFinalResume(profile, jd, sections, () => false);
    resume.name = 'Tést “User” — 中';
    const bytes = await buildResumePdf(resume);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
  });
});

import { emptyState, stateToResume, toBullets } from '../src/lib/builder/model';

describe('builder model', () => {
  it('splits a description into clean bullets', () => {
    expect(toBullets('- Built an API\n\n* Wrote tests\n  Deployed it ')).toEqual([
      'Built an API',
      'Wrote tests',
      'Deployed it',
    ]);
  });

  it('turns form state into a printable resume and skips empty entries', () => {
    const s = emptyState();
    s.name = 'Test User';
    s.email = 't@example.com';
    s.experience = [
      { id: 'a', title: 'Engineer', org: 'Acme', startDate: 'Jan 2022', endDate: '', current: true, location: '', description: '- Built things' },
      { id: 'b', title: '', org: '', startDate: '', endDate: '', current: false, location: '', description: '' },
    ];
    s.skillGroups = [{ id: 's', label: 'Languages', items: 'Go, Python' }];
    const r = stateToResume(s);
    expect(r.sections.map((x) => x.title)).toEqual(['PROFESSIONAL EXPERIENCE', 'TECHNICAL SKILLS']);
    expect(r.sections[0].entries).toHaveLength(1);
    expect(r.sections[0].entries[0].meta).toBe('Jan 2022 - Present');
    expect(r.sections[1].lines).toEqual(['Languages: Go, Python']);
  });
});

import { profileToState } from '../src/lib/builder/model';

describe('profileToState', () => {
  it('drops duplicate and fragment lines when merging description and highlights', () => {
    const state = profileToState(
      {
        contact: { name: 'A B', email: 'a@b.co', links: [] },
        experience: [],
        education: [],
        skills: [],
        projects: [
          {
            name: 'App',
            tech: [],
            description: 'Shows forecast using OpenWeather API',
            highlights: ['Built a weather app in React that shows forecast using OpenWeather API', 'Deployed on Netlify'],
          },
        ],
      },
      emptyState(),
    );
    expect(state.projects[0].description.split('\n')).toEqual([
      'Built a weather app in React that shows forecast using OpenWeather API',
      'Deployed on Netlify',
    ]);
  });
});

describe('standard templates', () => {
  it('shrinks a long resume to one page and keeps text extractable', async () => {
    const s = emptyState();
    s.name = 'Long Resume';
    s.email = 'l@example.com';
    s.experience = Array.from({ length: 5 }, (_, i) => ({
      id: `e${i}`,
      title: 'Engineer',
      org: `Company ${i}`,
      startDate: '2020',
      endDate: '2021',
      current: false,
      location: '',
      description: Array.from({ length: 4 }, (_, j) => `Built feature number ${j} that improved the product for many users and reduced costs.`).join('\n'),
    }));
    const resume = stateToResume(s);
    for (const t of ['professional', 'compact', 'executive'] as const) {
      const bytes = await buildResumePdf(resume, { template: t });
      expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    }
  });
});

describe('profileToState extras', () => {
  it('keeps skill groups, achievements, leadership, project role and dates from an upload', () => {
    const state = profileToState(
      {
        contact: { name: 'A B', email: 'a@b.co', links: [] },
        experience: [],
        education: [{ degree: 'B.Tech', school: 'VIT', year: 'July 2024 - May 2028', details: 'CGPA: 8.68' }],
        projects: [{ name: 'App', tech: ['Next.js'], highlights: ['Built it'], role: 'Founder', dates: '2026' }],
        skills: [
          { name: 'C++', category: 'Languages' },
          { name: 'Python', category: 'Languages' },
          { name: 'React', category: 'Frontend' },
        ],
        achievements: [{ label: 'LeetCode', text: 'Rating 1687.' }],
        leadership: [{ title: 'Core Member', org: 'SAE', startDate: 'March 2025', endDate: 'Present', highlights: ['Planned events'] }],
      },
      emptyState(),
    );
    expect(state.skillGroups.map((g) => [g.label, g.items])).toEqual([
      ['Languages', 'C++, Python'],
      ['Frontend', 'React'],
    ]);
    expect(state.achievements[0]).toMatchObject({ label: 'LeetCode', text: 'Rating 1687.' });
    expect(state.leadership[0]).toMatchObject({ org: 'SAE', current: true });
    expect(state.projects[0]).toMatchObject({ role: 'Founder', dates: '2026' });
    expect(state.educationFirst).toBe(true);

    const resume = stateToResume(state);
    const titles = resume.sections.map((s) => s.title);
    expect(titles).toContain('CERTIFICATIONS & ACHIEVEMENTS');
    expect(titles).toContain('LEADERSHIP / EXTRACURRICULAR');
    expect(resume.sections.find((s) => s.title === 'PROJECTS')?.entries[0].parts?.note).toBe('Founder | Next.js');
  });
});
