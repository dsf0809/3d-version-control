CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`parent_branch_id` text,
	`fork_revision_id` text,
	`head_revision_id` text NOT NULL,
	`conversation_id` text,
	`lock_token` text,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `branches_project` ON `branches` (`project_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`turn_id` text,
	`ordinal` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`revision_id` text NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_branch_ordinal` ON `messages` (`branch_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`brief` text DEFAULT '' NOT NULL,
	`requirements` text DEFAULT '' NOT NULL,
	`active_branch_id` text NOT NULL,
	`selected_revision_id` text NOT NULL,
	`import_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_owner_updated` ON `projects` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_owner_import` ON `projects` (`owner_id`,`import_key`);--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`parent_id` text,
	`ordinal` integer NOT NULL,
	`model_json` text NOT NULL,
	`prompt` text NOT NULL,
	`answer` text DEFAULT '' NOT NULL,
	`summary_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `revisions_project_ordinal` ON `revisions` (`project_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `turns` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`base_revision_id` text NOT NULL,
	`prompt` text NOT NULL,
	`status` text NOT NULL,
	`result_json` text,
	`error` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `turns_branch` ON `turns` (`branch_id`);