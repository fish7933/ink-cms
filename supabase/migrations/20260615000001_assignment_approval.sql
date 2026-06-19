-- Assignment and Approval System
-- This SQL creates tables for assigning managers to owners/fleets/ships
-- and implementing approval workflow system

BEGIN;

-- Create assignments table for owner/fleet/ship managers
CREATE TABLE IF NOT EXISTS assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('owner', 'fleet', 'ship')),
  entity_id UUID NOT NULL, -- owner_id, fleet_id, or ship_id
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('owner_manager', 'fleet_manager', 'ship_manager', 'manning_manager')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(assignment_type, entity_id, user_id, role)
);

-- Create approval_lines table for defining approval workflow
CREATE TABLE IF NOT EXISTS approval_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  approval_type TEXT NOT NULL CHECK (approval_type IN ('hiring', 'salary_change', 'contract', 'general')),
  steps JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{order: 1, user_id: 'xxx', required: true}, ...]
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create approval_requests table for tracking approval requests
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  approval_line_id UUID REFERENCES approval_lines(id) ON DELETE CASCADE NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('hiring', 'salary_change', 'contract', 'general')),
  title TEXT NOT NULL,
  description TEXT,
  reference_id UUID, -- job_application_id, salary_table_id, etc.
  reference_type TEXT, -- 'job_application', 'salary_table', etc.
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL NOT NULL,
  current_step INTEGER DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create approval_actions table for tracking individual approval actions
CREATE TABLE IF NOT EXISTS approval_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  approval_request_id UUID REFERENCES approval_requests(id) ON DELETE CASCADE NOT NULL,
  step_order INTEGER NOT NULL,
  approver_id UUID REFERENCES users(id) ON DELETE SET NULL NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected', 'pending')),
  comments TEXT,
  acted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create fleets table if not exists (for fleet management)
CREATE TABLE IF NOT EXISTS fleets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Add fleet_id to ships table if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ships' AND column_name = 'fleet_id'
  ) THEN
    ALTER TABLE ships ADD COLUMN fleet_id UUID REFERENCES fleets(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_assignments_entity ON assignments(assignment_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_approval_lines_company ON approval_lines(company_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_line ON approval_requests(approval_line_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_actions_request ON approval_actions(approval_request_id);
CREATE INDEX IF NOT EXISTS idx_fleets_owner ON fleets(owner_id);
CREATE INDEX IF NOT EXISTS idx_ships_fleet ON ships(fleet_id);

-- Enable RLS
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleets ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all for now, can be refined later)
CREATE POLICY "allow_all_assignments" ON assignments FOR ALL USING (true);
CREATE POLICY "allow_all_approval_lines" ON approval_lines FOR ALL USING (true);
CREATE POLICY "allow_all_approval_requests" ON approval_requests FOR ALL USING (true);
CREATE POLICY "allow_all_approval_actions" ON approval_actions FOR ALL USING (true);
CREATE POLICY "allow_all_fleets" ON fleets FOR ALL USING (true);

COMMIT;