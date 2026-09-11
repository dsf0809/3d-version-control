CREATE TABLE `shares` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`allow_export` integer DEFAULT 0 NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shares_token_hash_unique` ON `shares` (`token_hash`);--> statement-breakpoint
ALTER TABLE `projects` ADD `dimension_locks` text DEFAULT '[]' NOT NULL;