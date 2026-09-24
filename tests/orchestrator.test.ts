import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { GeneratedSection, ParsedJd, StructuredProfile } from '../src/types';
import type { GeneratedDraft, GeneratorInput } from '../src/lib/agents/generator';
import type { VerifiedBullet, VerifierInput } from '../src/lib/agents/verifier';
import type { PipelineAgents } from '../src/lib/orchestrator';

// Each worker process gets its own temp db (vitest 'forks' pool isolates env).
const DB_PATH = path.join(os.tmpdir(), `buildr-orch-test-${process.pid}.db`);
process.env.DATABASE_URL = `file:${DB_PATH}`;

const PROFILE_ID = `profile-test-${process.pid}`;
const JD_ID = `jd-test-${process.pid}`;

const profile: StructuredProfile = {
  contact: { name: 'Test Candidate', email: 'test@example.com', phone: '+1 415 555 0000', location: '', links: [] },
  experience: [
    {
      itemId: 'exp_1',
      title: 'Engineer',
      org: 'Acme',
      startDate: '2022-01',
      endDate: 'present',
      highlights: [
        'Built the checkout flow in React and TypeScript',
        'Deployed services on kubernetes',
        'Wrote integration tests with Jest',
        'Containerized the app with Docker',
        'Built GraphQL APIs',
        'Used Redis for caching',
      ],
    },
  ],
  education: [{ itemId: 'edu_1', degree: 'B.Tech CS', school: 'State University', year: '2021' }],
  projects: [
    { itemId: 'prj_1', name: 'KubeDeploy', tech: ['kubernetes'], highlights: ['Deployed services on kubernetes'] },
  ],
  skills: [
    { itemId: 'skl_1', name: 'React' },
    { itemId: 'skl_2', name: 'TypeScript' },
  ],
};

// Seven must-haves so each newly grounded bullet moves must-coverage by ~14%,
// i.e. ~+5.7 score points — enough to keep the revision loop past the plateau
// check when a test needs multiple iterations.
const jd: ParsedJd = {
  requiredSkills: ['react', 'typescript', 'kubernetes', 'jest', 'docker', 'graphql', 'redis'],
  keywords: [],
  qualifications: [],
  experienceLevel: 'mid',
  niceToHave: [],
};

type DbModule = typeof import('../src/db/client');
type OrchestratorModule = typeof import('../src/lib/orchestrator');
type RunPayloadModule = typeof import('../src/lib/run-payload');

let dbm: DbModule;
let orch: OrchestratorModule;
let payload: RunPayloadModule;

const baseBullet = { text: 'Built the checkout flow in React and TypeScript', sourceItemId: 'exp_1' };
const fabricatedBullet = { text: 'Led a team of 12 engineers across 3 projects', sourceItemId: 'exp_1' };

describe('orchestrator integration (offline, scripted agents)', () => {
  beforeAll(async () => {
    dbm = await import('../src/db/client');
    orch = await import('../src/lib/orchestrator');
    payload = await import('../src/lib/run-payload');
    // Fresh temp database: apply the generated migrations, then seed fixtures.
    const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
    migrate(dbm.db, { migrationsFolder: path.resolve(process.cwd(), 'src/db/migrations') });
    await dbm.db.insert(dbm.schema.profiles).values({ id: PROFILE_ID, rawText: null, structuredJson: JSON.stringify(profile) }).run();
    await dbm.db.insert(dbm.schema.jobDescriptions).values({ id: JD_ID, rawText: 'test jd', parsedJson: JSON.stringify(jd) }).run();
  });

  afterAll(async () => {
    // Best-effort cleanup; the file lives in the OS temp dir anyway.
    try {
      fs.rmSync(DB_PATH, { force: true });
    } catch {
      /* ignore */
    }
  });

  it('runs generate -> score -> verify -> revise to a clean stop', async () => {
    // Iteration 1: grounded bullet + a fabricated leadership claim.
    // Iteration 2 (experience regenerated only): fabrication dropped honoring
    // the rejection feedback; grounded kubernetes bullet added citing prj_1.
    const generateCalls: GeneratorInput[] = [];
    const verifyCalls: VerifierInput[] = [];
    const agents: PipelineAgents = {
      async generate(input: GeneratorInput): Promise<GeneratedDraft> {
        generateCalls.push(input);
        return {
          sections:
            input.iteration === 1
              ? [
                  {
                    section: 'experience',
                    bullets: [baseBullet, fabricatedBullet],
                  },
                ]
              : [
                  {
                    section: 'experience',
                    bullets: [baseBullet, { text: 'Deployed services on kubernetes', sourceItemId: 'prj_1' }],
                  },
                ],
          droppedUnresolved: [],
        };
      },
      async verify(input: VerifierInput): Promise<VerifiedBullet[]> {
        verifyCalls.push(input);
        return input.bullets.map((b) => ({
          ...b,
          verdict: /Led a team/.test(b.text) ? 'UNSUPPORTED' : 'SUPPORTED',
          justification: /Led a team/.test(b.text)
            ? 'source item contains no leadership claim'
            : 'fully grounded in the source item',
        }));
      },
    };

    const result = await orch.runPipeline(PROFILE_ID, JD_ID, undefined, agents);

    expect(result.iterations).toHaveLength(2);
    expect(result.stopReason).toBe('clean');
    expect(result.converged).toBe(true);
    expect(result.iterations[1].score - result.iterations[0].score).toBeGreaterThanOrEqual(2);

    // Verifier ran twice: all bullets in it1, only the new one in it2.
    expect(verifyCalls.length).toBe(2);

    // Iteration 2's generator received the rejection feedback.
    const feedback = generateCalls[1].rejections ?? [];
    expect(feedback.some((r) => r.text.includes('Led a team'))).toBe(true);

    // DB assertions: 2 drafts scoped to THIS run, done run, claims logged
    // with carried-over marks.
    const draftRows = dbm.db.select().from(dbm.schema.drafts).all().filter((d) => d.runId === result.runId);
    expect(draftRows).toHaveLength(2);

    const claimRows = dbm.db.select().from(dbm.schema.claims).all().filter((c) => draftRows.some((d) => d.id === c.draftId));
    const carried = claimRows.filter((c) => c.justification.includes('carried over'));
    expect(carried.length).toBeGreaterThan(0);

    const [runRow] = dbm.db.select().from(dbm.schema.runs).all().filter((r) => r.id === result.runId);
    expect(runRow?.status).toBe('done');
    expect(runRow?.converged).toBe(true);
    expect(runRow?.stopReason).toBe('clean');
  });

  it('stops on score plateau with converged=true when revision cannot move the score', async () => {
    // Same two bullets every iteration; the fabricated one never improves ->
    // improvement is 0 at iteration 2 -> plateau (first spec stop).
    const agents: PipelineAgents = {
      async generate() {
        return { sections: [{ section: 'experience', bullets: [baseBullet, fabricatedBullet] }], droppedUnresolved: [] };
      },
      async verify(input) {
        return input.bullets.map((b) => ({
          ...b,
          verdict: /Led a team/.test(b.text) ? 'UNSUPPORTED' : 'SUPPORTED',
          justification: 'as before',
        }));
      },
    };
    const result = await orch.runPipeline(PROFILE_ID, JD_ID, undefined, agents);
    expect(result.stopReason).toBe('score_plateau');
    expect(result.converged).toBe(true);
  });

  it('stops with nothing_to_revise when only an accepted PARTIAL remains', async () => {
    // it1: grounded bullet + a PARTIAL ("Improved performance" — vague).
    // it2: rewrite is keyword-rich (score jumps) but still PARTIAL; the
    // section already had its one rewrite attempt -> nothing_to_revise.
    const generateCalls: GeneratorInput[] = [];
    const agents: PipelineAgents = {
      async generate(input: GeneratorInput) {
        generateCalls.push(input);
        return {
          sections: [
            {
              section: 'experience',
              bullets:
                input.iteration === 1
                  ? [baseBullet, { text: 'Improved performance of the app', sourceItemId: 'exp_1' }]
                  : [baseBullet, { text: 'Improved performance on kubernetes', sourceItemId: 'exp_1' }],
            },
          ],
          droppedUnresolved: [],
        };
      },
      async verify(input) {
        return input.bullets.map((b) =>
          /Improved performance/.test(b.text)
            ? { ...b, verdict: 'PARTIAL', justification: 'source mentions performance only in passing' }
            : { ...b, verdict: 'SUPPORTED', justification: 'grounded' },
        );
      },
    };
    const result = await orch.runPipeline(PROFILE_ID, JD_ID, undefined, agents);
    expect(result.stopReason).toBe('nothing_to_revise');
    expect(result.converged).toBe(true);
    expect(generateCalls).toHaveLength(2);
  });

  it('hits max_iterations with converged=false when fabrication persists', async () => {
    // Each iteration adds one more grounded must-have (score keeps improving
    // past the plateau) while the same fabricated leadership claim persists.
    const grounded = [
      { text: 'Built the checkout flow in React and TypeScript', sourceItemId: 'exp_1' },
      { text: 'Wrote integration tests with Jest', sourceItemId: 'exp_1' },
      { text: 'Containerized the app with Docker', sourceItemId: 'exp_1' },
      { text: 'Built GraphQL APIs', sourceItemId: 'exp_1' },
    ];
    const agents: PipelineAgents = {
      async generate(input: GeneratorInput) {
        // exactly one NEW grounded bullet per iteration (it1:1 ... it4:4)
        const count = input.iteration;
        return {
          sections: [
            {
              section: 'experience',
              bullets: [...grounded.slice(0, count), fabricatedBullet],
            },
          ],
          droppedUnresolved: [],
        };
      },
      async verify(input) {
        return input.bullets.map((b) => ({
          ...b,
          verdict: /Led a team/.test(b.text) ? 'UNSUPPORTED' : 'SUPPORTED',
          justification: 'mock',
        }));
      },
    };
    const result = await orch.runPipeline(PROFILE_ID, JD_ID, undefined, agents);
    expect(result.stopReason).toBe('max_iterations');
    expect(result.converged).toBe(false);
    expect(result.finalIteration).toBe(4);
  });

  it('payload builder exposes drafts and claims for the run', async () => {
    const runs = dbm.db.select().from(dbm.schema.runs).all().filter((r) => r.status === 'done');
    expect(runs.length).toBeGreaterThan(0);
    const p = payload.getRunPayload(runs[0].id);
    expect(p).not.toBeNull();
    expect(p!.drafts.length).toBeGreaterThan(0);
    expect(p!.claims.length).toBeGreaterThan(0);
    expect(p!.profileName).toBe('Test Candidate');
  });
});
