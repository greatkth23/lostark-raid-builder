CREATE TABLE IF NOT EXISTS `lostark_market_cache` (
	`item_key` text PRIMARY KEY NOT NULL,
	`item_id` integer NOT NULL,
	`name` text NOT NULL,
	`icon` text NOT NULL,
	`bundle_count` integer NOT NULL,
	`current_min_price` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lostark_market_cache_updated_idx` ON `lostark_market_cache` (`updated_at`);
