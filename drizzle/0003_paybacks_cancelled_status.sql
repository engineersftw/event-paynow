-- Widen paybacks.status CHECK to allow 'cancelled'. SQLite cannot alter a CHECK, so rebuild.
CREATE TABLE `paybacks_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ref` text NOT NULL,
	`payment_id` integer NOT NULL,
	`payer_type` text NOT NULL,
	`payer_value` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text NOT NULL CHECK(status IN ('pending', 'sent', 'cancelled')),
	`qr_payload` text NOT NULL,
	`created_at` text NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
INSERT INTO `paybacks_new` (`id`, `ref`, `payment_id`, `payer_type`, `payer_value`, `amount_cents`, `status`, `qr_payload`, `created_at`, `sent_at`) SELECT `id`, `ref`, `payment_id`, `payer_type`, `payer_value`, `amount_cents`, `status`, `qr_payload`, `created_at`, `sent_at` FROM `paybacks`;
--> statement-breakpoint
DROP TABLE `paybacks`;
--> statement-breakpoint
ALTER TABLE `paybacks_new` RENAME TO `paybacks`;
--> statement-breakpoint
CREATE UNIQUE INDEX `paybacks_ref_unique` ON `paybacks` (`ref`);
