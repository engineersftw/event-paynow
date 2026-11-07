CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ref` text NOT NULL,
	`chat_id` integer NOT NULL,
	`topic_id` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL,
	`payee_type` text NOT NULL,
	`payee_value` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL CHECK(status IN ('open', 'closed')),
	`created_at` text NOT NULL,
	`closed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_ref_unique` ON `events` (`ref`);--> statement-breakpoint
ALTER TABLE `payments` ADD `event_id` integer;