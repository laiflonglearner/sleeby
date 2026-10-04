-- Changes to source data are explicit append-only revisions, never hidden updates.
CREATE TRIGGER raw_records_no_update BEFORE UPDATE ON raw_records BEGIN SELECT RAISE(ABORT, 'immutable-raw-record'); END;
--> statement-breakpoint
CREATE TRIGGER raw_records_no_delete BEFORE DELETE ON raw_records BEGIN SELECT RAISE(ABORT, 'immutable-raw-record'); END;
--> statement-breakpoint
-- SQLite REPLACE can skip delete triggers when recursive_triggers is disabled.
CREATE TRIGGER raw_records_no_replace BEFORE INSERT ON raw_records WHEN EXISTS (SELECT 1 FROM raw_records WHERE id = NEW.id) BEGIN SELECT RAISE(ABORT, 'immutable-raw-record'); END;
--> statement-breakpoint
CREATE TRIGGER habit_entries_no_update BEFORE UPDATE ON habit_entries BEGIN SELECT RAISE(ABORT, 'immutable-habit-entry'); END;
--> statement-breakpoint
CREATE TRIGGER habit_entries_no_delete BEFORE DELETE ON habit_entries BEGIN SELECT RAISE(ABORT, 'immutable-habit-entry'); END;
--> statement-breakpoint
CREATE TRIGGER habit_entries_no_replace BEFORE INSERT ON habit_entries WHEN EXISTS (SELECT 1 FROM habit_entries WHERE id = NEW.id) BEGIN SELECT RAISE(ABORT, 'immutable-habit-entry'); END;
--> statement-breakpoint
CREATE TRIGGER nights_no_update BEFORE UPDATE ON nights BEGIN SELECT RAISE(ABORT, 'immutable-night'); END;
--> statement-breakpoint
CREATE TRIGGER nights_no_delete BEFORE DELETE ON nights BEGIN SELECT RAISE(ABORT, 'immutable-night'); END;
--> statement-breakpoint
CREATE TRIGGER nights_no_replace BEFORE INSERT ON nights WHEN EXISTS (SELECT 1 FROM nights WHERE id = NEW.id) BEGIN SELECT RAISE(ABORT, 'immutable-night'); END;
--> statement-breakpoint
CREATE TRIGGER subjective_reports_no_update BEFORE UPDATE ON subjective_reports BEGIN SELECT RAISE(ABORT, 'immutable-subjective-report'); END;
--> statement-breakpoint
CREATE TRIGGER subjective_reports_no_delete BEFORE DELETE ON subjective_reports BEGIN SELECT RAISE(ABORT, 'immutable-subjective-report'); END;
--> statement-breakpoint
CREATE TRIGGER subjective_reports_no_replace BEFORE INSERT ON subjective_reports WHEN EXISTS (SELECT 1 FROM subjective_reports WHERE id = NEW.id) BEGIN SELECT RAISE(ABORT, 'immutable-subjective-report'); END;
--> statement-breakpoint
CREATE TRIGGER source_tombstones_no_update BEFORE UPDATE ON source_tombstones BEGIN SELECT RAISE(ABORT, 'immutable-source-tombstone'); END;
--> statement-breakpoint
CREATE TRIGGER source_tombstones_no_delete BEFORE DELETE ON source_tombstones BEGIN SELECT RAISE(ABORT, 'immutable-source-tombstone'); END;
--> statement-breakpoint
CREATE TRIGGER source_tombstones_no_replace BEFORE INSERT ON source_tombstones WHEN EXISTS (SELECT 1 FROM source_tombstones WHERE id = NEW.id) BEGIN SELECT RAISE(ABORT, 'immutable-source-tombstone'); END;
