CREATE TABLE `paybacks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ref` text NOT NULL,
	`payment_id` integer NOT NULL,
	`payer_type` text NOT NULL,
	`payer_value` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text NOT NULL CHECK(status IN ('pending', 'sent')),
	`qr_payload` text NOT NULL,
	`created_at` text NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paybacks_ref_unique` ON `paybacks` (`ref`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ref` text NOT NULL,
	`user_id` integer NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`payee_type` text NOT NULL,
	`payee_value` text NOT NULL,
	`status` text NOT NULL CHECK(status IN ('pending', 'received')),
	`source` text NOT NULL,
	`qr_payload` text NOT NULL,
	`created_at` text NOT NULL,
	`received_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_ref_unique` ON `payments` (`ref`);--> statement-breakpoint
CREATE TABLE `users` (
	`telegram_id` integer PRIMARY KEY NOT NULL,
	`payee_type` text NOT NULL,
	`payee_value` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
