-- 071_add_report_schedule_format.sql
ALTER TABLE report_schedules ADD COLUMN format VARCHAR(16) NOT NULL DEFAULT 'CSV';
