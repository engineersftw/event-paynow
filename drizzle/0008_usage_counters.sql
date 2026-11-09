CREATE TABLE `usage_counters` (
	`day` text NOT NULL,
	`metric` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `metric`)
);
