import { sqliteTable, text, real, integer, index, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const createdAt = () =>
  integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date());

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  rawText: text('raw_text'),
  structuredJson: text('structured_json').notNull(),
  createdAt: createdAt(),
});

export const jobDescriptions = sqliteTable('job_descriptions', {
  id: text('id').primaryKey(),
  rawText: text('raw_text').notNull(),
  parsedJson: text('parsed_json').notNull(),
  createdAt: createdAt(),
});

export const drafts = sqliteTable(
  'drafts',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id').notNull(),
    jdId: text('jd_id').notNull(),
    iteration: integer('iteration').notNull(),
    sectionsJson: text('sections_json').notNull(),
    atsScore: real('ats_score').notNull(),
    scoreBreakdownJson: text('score_breakdown_json').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('drafts_profile_jd_idx').on(t.profileId, t.jdId)],
);

export const claims = sqliteTable(
  'claims',
  {
    id: text('id').primaryKey(),
    draftId: text('draft_id').notNull(),
    section: text('section').notNull(),
    text: text('text').notNull(),
    sourceItemId: text('source_item_id').notNull(),
    verdict: text('verdict').notNull(),
    justification: text('justification').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('claims_draft_idx').on(t.draftId),
    check(
      'claims_verdict_check',
      sql`${t.verdict} IN ('SUPPORTED', 'PARTIAL', 'UNSUPPORTED')`,
    ),
  ],
);

export const runs = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id').notNull(),
    jdId: text('jd_id').notNull(),
    status: text('status').notNull().default('running'),
    stopReason: text('stop_reason'),
    finalIteration: integer('final_iteration'),
    converged: integer('converged', { mode: 'boolean' }),
    finalScore: real('final_score'),
    createdAt: createdAt(),
  },
  (t) => [index('runs_profile_jd_idx').on(t.profileId, t.jdId)],
);

export type ProfileRow = typeof profiles.$inferSelect;
export type JobDescriptionRow = typeof jobDescriptions.$inferSelect;
export type DraftRow = typeof drafts.$inferSelect;
export type ClaimRow = typeof claims.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
