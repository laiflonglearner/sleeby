CREATE TABLE `tracking_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp_utc` text NOT NULL,
	`supersedes_id` text,
	`data_json` text NOT NULL,
	FOREIGN KEY (`supersedes_id`) REFERENCES `tracking_settings`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tracking_settings_json_check" CHECK(json_valid("tracking_settings"."data_json"))
) WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX `tracking_settings_parent_idx` ON `tracking_settings` (`supersedes_id`);--> statement-breakpoint
CREATE INDEX `habit_entries_parent_idx` ON `habit_entries` (`supersedes_id`);--> statement-breakpoint
CREATE INDEX `nights_parent_idx` ON `nights` (`supersedes_id`);
--> statement-breakpoint
CREATE TRIGGER tracking_settings_no_update BEFORE UPDATE ON tracking_settings BEGIN SELECT RAISE(ABORT, 'immutable-settings'); END;
--> statement-breakpoint
CREATE TRIGGER tracking_settings_no_delete BEFORE DELETE ON tracking_settings BEGIN SELECT RAISE(ABORT, 'immutable-settings'); END;
--> statement-breakpoint
CREATE TRIGGER tracking_settings_no_replace BEFORE INSERT ON tracking_settings WHEN EXISTS (SELECT 1 FROM tracking_settings WHERE id = NEW.id) BEGIN SELECT RAISE(ABORT, 'immutable-settings'); END;
