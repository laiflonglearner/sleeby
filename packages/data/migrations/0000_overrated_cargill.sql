CREATE TABLE `derived_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`algorithm_version` integer NOT NULL,
	`input_fingerprint` text NOT NULL,
	`data_json` text NOT NULL,
	CONSTRAINT "derived_cache_json_check" CHECK(json_valid("derived_cache"."data_json"))
);
--> statement-breakpoint
CREATE TABLE `habit_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp_utc` text NOT NULL,
	`day_key` text NOT NULL,
	`boundary_minutes` integer NOT NULL,
	`supersedes_id` text,
	`data_json` text NOT NULL,
	FOREIGN KEY (`supersedes_id`) REFERENCES `habit_entries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "habit_entries_boundary_check" CHECK("habit_entries"."boundary_minutes" BETWEEN 0 AND 1439),
	CONSTRAINT "habit_entries_json_check" CHECK(json_valid("habit_entries"."data_json"))
);
--> statement-breakpoint
CREATE INDEX `habit_entries_day_idx` ON `habit_entries` (`day_key`,`timestamp_utc`);--> statement-breakpoint
CREATE TABLE `import_cursors` (
	`source` text PRIMARY KEY NOT NULL,
	`cursor` text,
	`updated_at_utc` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nights` (
	`id` text PRIMARY KEY NOT NULL,
	`night_key` text NOT NULL,
	`boundary_minutes` integer NOT NULL,
	`supersedes_id` text,
	`data_json` text NOT NULL,
	FOREIGN KEY (`supersedes_id`) REFERENCES `nights`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "nights_boundary_check" CHECK("nights"."boundary_minutes" BETWEEN 0 AND 1439),
	CONSTRAINT "nights_json_check" CHECK(json_valid("nights"."data_json"))
);
--> statement-breakpoint
CREATE INDEX `nights_key_idx` ON `nights` (`night_key`);--> statement-breakpoint
CREATE TABLE `raw_records` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`source` text NOT NULL,
	`origin` text NOT NULL,
	`external_id` text,
	`last_modified_utc` text NOT NULL,
	`start_utc` text NOT NULL,
	`end_utc` text NOT NULL,
	`day_key` text,
	`boundary_minutes` integer,
	`data_json` text NOT NULL,
	CONSTRAINT "raw_records_boundary_check" CHECK(("raw_records"."day_key" IS NULL AND "raw_records"."boundary_minutes" IS NULL) OR ("raw_records"."day_key" IS NOT NULL AND "raw_records"."boundary_minutes" IS NOT NULL AND "raw_records"."boundary_minutes" BETWEEN 0 AND 1439)),
	CONSTRAINT "raw_records_json_check" CHECK(json_valid("raw_records"."data_json"))
);
--> statement-breakpoint
CREATE INDEX `raw_records_time_idx` ON `raw_records` (`start_utc`,`id`);--> statement-breakpoint
CREATE INDEX `raw_records_origin_type_idx` ON `raw_records` (`origin`,`type`,`start_utc`);--> statement-breakpoint
CREATE INDEX `raw_records_external_idx` ON `raw_records` (`source`,`origin`,`external_id`,`last_modified_utc`);--> statement-breakpoint
CREATE INDEX `raw_records_day_idx` ON `raw_records` (`day_key`,`type`);--> statement-breakpoint
CREATE TABLE `record_selections` (
	`record_id` text PRIMARY KEY NOT NULL,
	`logical_session_id` text NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`superseded_by` text,
	`selected_at_utc` text NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `raw_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`superseded_by`) REFERENCES `raw_records`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "record_selections_status_check" CHECK(("record_selections"."status" = 'primary' AND "record_selections"."superseded_by" IS NULL) OR ("record_selections"."status" = 'suppressed' AND "record_selections"."superseded_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `record_selections_session_idx` ON `record_selections` (`logical_session_id`);--> statement-breakpoint
CREATE TABLE `source_tombstones` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`origin` text NOT NULL,
	`external_id` text NOT NULL,
	`observed_at_utc` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `source_tombstones_external_idx` ON `source_tombstones` (`source`,`origin`,`external_id`);--> statement-breakpoint
CREATE TABLE `subjective_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp_utc` text NOT NULL,
	`night_key` text NOT NULL,
	`boundary_minutes` integer NOT NULL,
	`supersedes_id` text,
	`data_json` text NOT NULL,
	FOREIGN KEY (`supersedes_id`) REFERENCES `subjective_reports`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "subjective_reports_boundary_check" CHECK("subjective_reports"."boundary_minutes" BETWEEN 0 AND 1439),
	CONSTRAINT "subjective_reports_json_check" CHECK(json_valid("subjective_reports"."data_json"))
);
--> statement-breakpoint
CREATE INDEX `subjective_reports_night_idx` ON `subjective_reports` (`night_key`,`timestamp_utc`);
