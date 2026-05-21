-- Update Salary Management System - Fix RLS Policies
-- Run this in Supabase SQL Editor

BEGIN;

-- Drop existing RLS policies if they exist
DROP POLICY IF EXISTS "allow_all_salary_components" ON salary_components;
DROP POLICY IF EXISTS "allow_all_salary_templates" ON salary_templates;
DROP POLICY IF EXISTS "allow_all_salary_template_items" ON salary_template_items;
DROP POLICY IF EXISTS "allow_all_ship_salary_assignments" ON ship_salary_assignments;

-- Ensure RLS is enabled
ALTER TABLE salary_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ship_salary_assignments ENABLE ROW LEVEL SECURITY;

-- Create new RLS policies with full access
CREATE POLICY "allow_all_salary_components" ON salary_components 
  FOR ALL 
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_all_salary_templates" ON salary_templates 
  FOR ALL 
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_all_salary_template_items" ON salary_template_items 
  FOR ALL 
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_all_ship_salary_assignments" ON ship_salary_assignments 
  FOR ALL 
  USING (true)
  WITH CHECK (true);

-- Insert default salary components if not exists
INSERT INTO salary_components (name, description, display_order) VALUES
('기본급', '기본 월급여', 1),
('시간외 수당', '초과 근무 수당', 2),
('휴가비', '휴가 수당', 3),
('식비', '식사 보조비', 4),
('통신비', '통신 보조비', 5)
ON CONFLICT (name) DO NOTHING;

COMMIT;