CREATE TABLE `lostark_api_usage` (
	`scope` text NOT NULL,
	`window_start` integer NOT NULL,
	`request_count` integer NOT NULL,
	PRIMARY KEY(`scope`, `window_start`)
);
--> statement-breakpoint
CREATE INDEX `lostark_api_usage_window_idx` ON `lostark_api_usage` (`window_start`);--> statement-breakpoint
CREATE TABLE `lostark_roster_cache` (
	`character_key` text PRIMARY KEY NOT NULL,
	`data_json` text NOT NULL,
	`expires_at` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lostark_roster_cache_expiry_idx` ON `lostark_roster_cache` (`expires_at`);