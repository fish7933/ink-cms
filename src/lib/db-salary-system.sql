-- New Salary Management System
-- Run this in Supabase SQL Editor

BEGIN;

-- Drop old salary_tables if exists
DROP TABLE IF EXISTS salary_tables CASCADE;

-- Create salary components table (급여 구성 항목)
CREATE TABLE IF NOT EXISTS salary_components (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create salary templates table (급여 템플릿)
CREATE TABLE IF NOT EXISTS salary_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  rank TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create salary template items table (급여 템플릿 항목별 금액)
CREATE TABLE IF NOT EXISTS salary_template_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES salary_templates(id) ON DELETE CASCADE NOT NULL,
  component_id UUID REFERENCES salary_components(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(template_id, component_id)
);

-- Create ship salary assignments table (선박별 급여 템플릿 매칭)
CREATE TABLE IF NOT EXISTS ship_salary_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ship_id UUID REFERENCES ships(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES salary_templates(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(ship_id, template_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_salary_components_active ON salary_components(is_active);
CREATE INDEX IF NOT EXISTS idx_salary_templates_rank ON salary_templates(rank);
CREATE INDEX IF NOT EXISTS idx_salary_templates_active ON salary_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_salary_template_items_template ON salary_template_items(template_id);
CREATE INDEX IF NOT EXISTS idx_ship_salary_assignments_ship ON ship_salary_assignments(ship_id);
CREATE INDEX IF NOT EXISTS idx_ship_salary_assignments_template ON ship_salary_assignments(template_id);

-- Enable RLS
ALTER TABLE salary_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ship_salary_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "allow_all_salary_components" ON salary_components FOR ALL USING (true);
CREATE POLICY "allow_all_salary_templates" ON salary_templates FOR ALL USING (true);
CREATE POLICY "allow_all_salary_template_items" ON salary_template_items FOR ALL USING (true);
CREATE POLICY "allow_all_ship_salary_assignments" ON ship_salary_assignments FOR ALL USING (true);

-- Insert default salary components
INSERT INTO salary_components (name, description, display_order) VALUES
('기본급', '기본 월급여', 1),
('시간외 수당', '초과 근무 수당', 2),
('휴가비', '휴가 수당', 3),
('식비', '식사 보조비', 4),
('통신비', '통신 보조비', 5)
ON CONFLICT (name) DO NOTHING;

COMMIT;