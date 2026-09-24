ALTER TABLE `drafts` ADD `run_id` text;--> statement-breakpoint
CREATE INDEX `drafts_run_idx` ON `drafts` (`run_id`);