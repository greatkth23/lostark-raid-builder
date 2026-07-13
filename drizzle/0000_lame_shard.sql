CREATE TABLE `raid_group_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`raid_group_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`raid_group_id`) REFERENCES `raid_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `raid_group_sessions_group_idx` ON `raid_group_sessions` (`raid_group_id`);--> statement-breakpoint
CREATE INDEX `raid_group_sessions_expiry_idx` ON `raid_group_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `raid_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`data_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raid_groups_name_unique` ON `raid_groups` (`name`);