CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`section` text NOT NULL,
	`text` text NOT NULL,
	`source_item_id` text NOT NULL,
	`verdict` text NOT NULL,
	`justification` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "claims_verdict_check" CHECK("claims"."verdict" IN ('SUPPORTED', 'PARTIAL', 'UNSUPPORTED'))
);
--> statement-breakpoint
CREATE INDEX `claims_draft_idx` ON `claims` (`draft_id`);--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`jd_id` text NOT NULL,
	`iteration` integer NOT NULL,
	`sections_json` text NOT NULL,
	`ats_score` real NOT NULL,
	`score_breakdown_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `drafts_profile_jd_idx` ON `drafts` (`profile_id`,`jd_id`);--> statement-breakpoint
CREATE TABLE `job_descriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`raw_text` text NOT NULL,
	`parsed_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`raw_text` text,
	`structured_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`jd_id` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`stop_reason` text,
	`final_iteration` integer,
	`converged` integer,
	`final_score` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `runs_profile_jd_idx` ON `runs` (`profile_id`,`jd_id`);