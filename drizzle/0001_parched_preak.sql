CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`base_revision_id` text NOT NULL,
	`parent_proposal_id` text,
	`status` text NOT NULL,
	`model_json` text NOT NULL,
	`prompt` text NOT NULL,
	`answer` text NOT NULL,
	`summary_json` text NOT NULL,
	`accepted_revision_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `proposals_branch_status` ON `proposals` (`branch_id`,`status`);--> statement-breakpoint
ALTER TABLE `messages` ADD `proposal_id` text;--> statement-breakpoint
ALTER TABLE `turns` ADD `proposal_id` text;