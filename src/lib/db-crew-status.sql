-- Crew Status Management System
-- Manage crew member lifecycle status from registration to deployment

BEGIN;

-- Update crew_members table to add status and reviewer tracking
ALTER TABLE crew_members 
DROP COLUMN IF EXISTS status,
ADD COLUMN status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN (
  'registered',           -- 등록됨
  'under_review',        -- 검토중
  'sent_to_owner',       -- 선주 송부
  'owner_approved',      -- 선주 승인
  'owner_rejected',      -- 선주 거절
  'onboard',            -- 승선중
  'standby',            -- 하선 후 대기중
  'deployment_decided'   -- 승선 결정
)),
ADD COLUMN reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN review_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN sent_to_owner_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN owner_decision_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN owner_decision_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN current_ship_id UUID REFERENCES ships(id) ON DELETE SET NULL,
ADD COLUMN onboard_date DATE,
ADD COLUMN offboard_date DATE,
ADD COLUMN status_notes TEXT;

-- Create crew status history table for tracking all status changes
CREATE TABLE IF NOT EXISTS crew_status_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create index for status history
CREATE INDEX IF NOT EXISTS idx_crew_status_history_crew ON crew_status_history(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_crew_status_history_date ON crew_status_history(changed_at);

-- Create index for crew status queries
CREATE INDEX IF NOT EXISTS idx_crew_members_status ON crew_members(status);
CREATE INDEX IF NOT EXISTS idx_crew_members_reviewer ON crew_members(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_current_ship ON crew_members(current_ship_id);

-- Enable RLS
ALTER TABLE crew_status_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS "allow_all_crew_status_history" ON crew_status_history;
CREATE POLICY "allow_all_crew_status_history" ON crew_status_history FOR ALL USING (true);

-- Function to automatically log status changes
CREATE OR REPLACE FUNCTION log_crew_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO crew_status_history (crew_member_id, from_status, to_status, changed_by, notes)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.reviewer_id, NEW.status_notes);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic status logging
DROP TRIGGER IF EXISTS crew_status_change_trigger ON crew_members;
CREATE TRIGGER crew_status_change_trigger
  AFTER UPDATE ON crew_members
  FOR EACH ROW
  EXECUTE FUNCTION log_crew_status_change();

COMMIT;