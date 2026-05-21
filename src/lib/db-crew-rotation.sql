-- Crew Rotation (Embarkation/Disembarkation) System
-- Manage crew member rotation assignments with approval workflow

BEGIN;

-- Create embarkation records table to track all crew boarding/disembarking history
CREATE TABLE IF NOT EXISTS crew_embarkation_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE NOT NULL,
  ship_id UUID REFERENCES ships(id) ON DELETE CASCADE NOT NULL,
  rank_id UUID REFERENCES ranks(id) ON DELETE SET NULL NOT NULL,
  embark_date DATE NOT NULL,
  disembark_date DATE,
  contract_months INTEGER,
  salary_template_id UUID,
  salary_amount DECIMAL(12,2),
  salary_currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create crew rotation plans table (draft plans before approval)
CREATE TABLE IF NOT EXISTS crew_rotation_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ship_id UUID REFERENCES ships(id) ON DELETE CASCADE NOT NULL,
  owner_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  fleet_id UUID REFERENCES fleets(id) ON DELETE SET NULL,
  plan_name TEXT NOT NULL,
  rotation_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'executed')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  approval_request_id UUID,
  executed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);

-- Create crew rotation assignments table (individual crew assignments in a plan)
CREATE TABLE IF NOT EXISTS crew_rotation_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rotation_plan_id UUID REFERENCES crew_rotation_plans(id) ON DELETE CASCADE NOT NULL,
  
  -- Off-signing crew (disembarking)
  off_crew_id UUID REFERENCES crew_members(id) ON DELETE SET NULL,
  off_rank_id UUID REFERENCES ranks(id) ON DELETE SET NULL,
  
  -- On-signing crew (embarking)
  on_crew_id UUID REFERENCES crew_members(id) ON DELETE SET NULL NOT NULL,
  on_rank_id UUID REFERENCES ranks(id) ON DELETE SET NULL NOT NULL,
  
  contract_months INTEGER,
  salary_template_id UUID,
  salary_amount DECIMAL(12,2),
  salary_currency TEXT DEFAULT 'USD',
  
  embark_date DATE NOT NULL,
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_embarkation_records_crew ON crew_embarkation_records(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_embarkation_records_ship ON crew_embarkation_records(ship_id);
CREATE INDEX IF NOT EXISTS idx_embarkation_records_status ON crew_embarkation_records(status);
CREATE INDEX IF NOT EXISTS idx_embarkation_records_dates ON crew_embarkation_records(embark_date, disembark_date);

CREATE INDEX IF NOT EXISTS idx_rotation_plans_ship ON crew_rotation_plans(ship_id);
CREATE INDEX IF NOT EXISTS idx_rotation_plans_status ON crew_rotation_plans(status);
CREATE INDEX IF NOT EXISTS idx_rotation_plans_created_by ON crew_rotation_plans(created_by);
CREATE INDEX IF NOT EXISTS idx_rotation_plans_owner ON crew_rotation_plans(owner_id);

CREATE INDEX IF NOT EXISTS idx_rotation_assignments_plan ON crew_rotation_assignments(rotation_plan_id);
CREATE INDEX IF NOT EXISTS idx_rotation_assignments_off_crew ON crew_rotation_assignments(off_crew_id);
CREATE INDEX IF NOT EXISTS idx_rotation_assignments_on_crew ON crew_rotation_assignments(on_crew_id);

-- Enable RLS
ALTER TABLE crew_embarkation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_rotation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_rotation_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "allow_all_embarkation_records" ON crew_embarkation_records;
CREATE POLICY "allow_all_embarkation_records" ON crew_embarkation_records FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_all_rotation_plans" ON crew_rotation_plans;
CREATE POLICY "allow_all_rotation_plans" ON crew_rotation_plans FOR ALL USING (true);

DROP POLICY IF EXISTS "allow_all_rotation_assignments" ON crew_rotation_assignments;
CREATE POLICY "allow_all_rotation_assignments" ON crew_rotation_assignments FOR ALL USING (true);

-- Function to update crew member status when embarkation record is created/updated
CREATE OR REPLACE FUNCTION update_crew_status_on_embarkation()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    -- When embarking (active record with no disembark date)
    IF NEW.status = 'active' AND NEW.disembark_date IS NULL THEN
      UPDATE crew_members 
      SET 
        status = 'on_board',
        current_ship_id = NEW.ship_id,
        onboard_date = NEW.embark_date,
        updated_at = NOW()
      WHERE id = NEW.crew_member_id;
    
    -- When disembarking (record completed)
    ELSIF NEW.status = 'completed' AND NEW.disembark_date IS NOT NULL THEN
      UPDATE crew_members 
      SET 
        status = 'standby',
        current_ship_id = NULL,
        offboard_date = NEW.disembark_date,
        updated_at = NOW()
      WHERE id = NEW.crew_member_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic crew status update
DROP TRIGGER IF EXISTS embarkation_status_update_trigger ON crew_embarkation_records;
CREATE TRIGGER embarkation_status_update_trigger
  AFTER INSERT OR UPDATE ON crew_embarkation_records
  FOR EACH ROW
  EXECUTE FUNCTION update_crew_status_on_embarkation();

-- Function to execute approved rotation plan
CREATE OR REPLACE FUNCTION execute_rotation_plan(plan_id UUID)
RETURNS VOID AS $$
DECLARE
  assignment_record RECORD;
  plan_record RECORD;
BEGIN
  -- Get plan details
  SELECT * INTO plan_record FROM crew_rotation_plans WHERE id = plan_id;
  
  IF plan_record.status != 'approved' THEN
    RAISE EXCEPTION 'Plan must be approved before execution';
  END IF;
  
  -- Process each assignment in the plan
  FOR assignment_record IN 
    SELECT * FROM crew_rotation_assignments WHERE rotation_plan_id = plan_id
  LOOP
    -- Complete the off-signing crew's current embarkation record
    IF assignment_record.off_crew_id IS NOT NULL THEN
      UPDATE crew_embarkation_records
      SET 
        disembark_date = assignment_record.embark_date,
        status = 'completed',
        updated_at = NOW()
      WHERE crew_member_id = assignment_record.off_crew_id
        AND ship_id = plan_record.ship_id
        AND status = 'active'
        AND disembark_date IS NULL;
    END IF;
    
    -- Create new embarkation record for on-signing crew
    INSERT INTO crew_embarkation_records (
      crew_member_id,
      ship_id,
      rank_id,
      embark_date,
      contract_months,
      salary_template_id,
      salary_amount,
      salary_currency,
      status,
      notes
    ) VALUES (
      assignment_record.on_crew_id,
      plan_record.ship_id,
      assignment_record.on_rank_id,
      assignment_record.embark_date,
      assignment_record.contract_months,
      assignment_record.salary_template_id,
      assignment_record.salary_amount,
      assignment_record.salary_currency,
      'active',
      assignment_record.notes
    );
  END LOOP;
  
  -- Update plan status
  UPDATE crew_rotation_plans
  SET 
    status = 'executed',
    executed_at = NOW(),
    updated_at = NOW()
  WHERE id = plan_id;
END;
$$ LANGUAGE plpgsql;

COMMIT;