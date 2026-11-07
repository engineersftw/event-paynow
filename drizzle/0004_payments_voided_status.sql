-- Widen payments.status CHECK to allow 'voided'. SQLite cannot alter a CHECK, so rebuild.
CREATE TABLE `payments_new` (
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
	`payer_name` text
);
--> statement-breakpoint
INSERT INTO `payments_new` (`id`, `ref`, `user_id`, `description`, `amount_cents`, `payee_type`, `payee_value`, `status`, `source`, `qr_payload`, `created_at`, `received_at`, `event_id`, `payer_type`, `payer_value`, `payer_name`) SELECT `id`, `ref`, `user_id`, `description`, `amount_cents`, `payee_type`, `payee_value`, `status`, `source`, `qr_payload`, `created_at`, `received_at`, `event_id`, `payer_type`, `payer_value`, `payer_name` FROM `payments`;
--> statement-breakpoint
DROP TABLE `payments`;
--> statement-breakpoint
ALTER TABLE `payments_new` RENAME TO `payments`;
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_ref_unique` ON `payments` (`ref`);
