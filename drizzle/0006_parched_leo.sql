CREATE TABLE `project_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`role` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`used_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_invitations_token_hash_unique` ON `project_invitations` (`token_hash`);--> statement-breakpoint
CREATE TABLE `project_members` (
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_member_identity` ON `project_members` (`project_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `branches` ADD `created_by` text;--> statement-breakpoint
ALTER TABLE `proposals` ADD `author_id` text;--> statement-breakpoint
ALTER TABLE `proposals` ADD `merge_parent_id` text;--> statement-breakpoint
ALTER TABLE `revisions` ADD `author_id` text;--> statement-breakpoint
ALTER TABLE `revisions` ADD `merge_parent_id` text;--> statement-breakpoint
ALTER TABLE `turns` ADD `actor_id` text;