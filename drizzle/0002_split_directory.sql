CREATE TABLE `split_claims` (
	`token` text PRIMARY KEY NOT NULL,
	`username` text,
	`user_id` integer,
	`name` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`description` text,
	`payload` text NOT NULL,
	`organiser` text NOT NULL,
	`chat_id` integer NOT NULL,
	`message_id` integer,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `split_contacts` (
	`username` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `split_contacts_user_id_unique` ON `split_contacts` (`user_id`);