ALTER TABLE shore_leave_requests ADD COLUMN IF NOT EXISTS remaining_hours_after NUMERIC;
ALTER TABLE shore_leave_requests ADD COLUMN IF NOT EXISTS leave_year_start_date DATE;
