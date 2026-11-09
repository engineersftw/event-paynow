CREATE TABLE `users` (
	`telegram_id` integer PRIMARY KEY NOT NULL,
	`payee_type` text NOT NULL,
	`payee_value` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
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
	`closed_at` text,
	`default_amount_cents` integer
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ref` text NOT NULL,
	`user_id` integer NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`payee_type` text NOT NULL,
	`payee_value` text NOT NULL,
	`status` text NOT NULL CHECK(status IN ('pending', 'received', 'voided')),
	`source` text NOT NULL,
	`qr_payload` text NOT NULL,
	`created_at` text NOT NULL,
	`received_at` text,
	`event_id` integer,
	`payer_type` text,
	`payer_value` text,
	`payer_name` text,
	`received_by` integer,
	`voided_by` integer,
	`checked_in_at` text,
	`checked_in_by` integer
);
--> statement-breakpoint
CREATE TABLE `paybacks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ref` text NOT NULL,
	`payment_id` integer NOT NULL,
	`payer_type` text NOT NULL,
	`payer_value` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text NOT NULL CHECK(status IN ('pending', 'sent', 'cancelled')),
	`qr_payload` text NOT NULL,
	`created_at` text NOT NULL,
	`sent_at` text,
	`created_by` integer,
	`sent_by` integer,
	`cancelled_by` integer
);
--> statement-breakpoint
CREATE TABLE `usage_counters` (
	`day` text NOT NULL,
	`metric` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `metric`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_ref_unique` ON `events` (`ref`);
--> statement-breakpoint
CREATE UNIQUE INDEX `paybacks_ref_unique` ON `paybacks` (`ref`);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_ref_unique` ON `payments` (`ref`);
