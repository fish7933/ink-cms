-- Fix crew rotation assignments to allow optional on-signing crew
-- This allows disembarkation-only assignments (crew leaving without replacement)

BEGIN;

-- Make on_crew_id and on_rank_id nullable to support disembarkation-only assignments
ALTER TABLE crew_rotation_assignments 
  ALTER COLUMN on_crew_id DROP NOT NULL,
  ALTER COLUMN on_rank_id DROP NOT NULL;

-- Add constraint to ensure at least one crew (off or on) is specified
ALTER TABLE crew_rotation_assignments
  ADD CONSTRAINT check_at_least_one_crew 
  CHECK (off_crew_id IS NOT NULL OR on_crew_id IS NOT NULL);

-- Update the execute_rotation_plan function to handle optional on-signing crew
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
    -- Complete the off-signing crew's current embarkation record (if exists)
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
    
    -- Create new embarkation record for on-signing crew (if exists)
    IF assignment_record.on_crew_id IS NOT NULL THEN
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
    END IF;
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