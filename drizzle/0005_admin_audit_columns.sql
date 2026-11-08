ALTER TABLE `paybacks` ADD `created_by` integer;--> statement-breakpoint
ALTER TABLE `paybacks` ADD `sent_by` integer;--> statement-breakpoint
ALTER TABLE `paybacks` ADD `cancelled_by` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `received_by` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `voided_by` integer;