CREATE INDEX `events_chat_topic_idx` ON `events` (`chat_id`,`topic_id`);--> statement-breakpoint
CREATE INDEX `paybacks_payment_idx` ON `paybacks` (`payment_id`);--> statement-breakpoint
CREATE INDEX `payments_event_created_idx` ON `payments` (`event_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `payments_user_idx` ON `payments` (`user_id`);