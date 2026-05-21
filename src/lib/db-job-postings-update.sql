-- Update Job Postings System
-- Run this in Supabase SQL Editor

BEGIN;

-- Drop the old job_postings table if it exists
DROP TABLE IF EXISTS job_postings CASCADE;

-- Create updated job_postings table with new structure
CREATE TABLE IF NOT EXISTS job_postings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  fleet_id UUID REFERENCES fleets(id) ON DELETE SET NULL,
  ship_id UUID REFERENCES ships(id) ON DELETE CASCADE NOT NULL,
  rank_id UUID REFERENCES ranks(id) ON DELETE RESTRICT NOT NULL,
  positions_available INTEGER NOT NULL DEFAULT 1,
  embarkation_date DATE NOT NULL,
  contract_months INTEGER NOT NULL,
  salary_template_id UUID REFERENCES salary_templates(id) ON DELETE SET NULL,
  salary_amount DECIMAL(10,2),
  salary_currency TEXT NOT NULL DEFAULT 'USD',
  salary_components JSONB DEFAULT '[]'::jsonb,
  requirements TEXT,
  visible_to_agencies UUID[] DEFAULT ARRAY[]::UUID[],
  status TEXT NOT NULL CHECK (status IN ('active', 'filled', 'cancelled')) DEFAULT 'active',
  urgency TEXT NOT NULL CHECK (urgency IN ('urgent', 'normal')) DEFAULT 'normal',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_job_postings_company_id ON job_postings(company_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_fleet_id ON job_postings(fleet_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_ship_id ON job_postings(ship_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_rank_id ON job_postings(rank_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_status ON job_postings(status);
CREATE INDEX IF NOT EXISTS idx_job_postings_urgency ON job_postings(urgency);
CREATE INDEX IF NOT EXISTS idx_job_postings_embarkation_date ON job_postings(embarkation_date);

-- Enable RLS
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS "allow_all_jobs" ON job_postings;
CREATE POLICY "allow_all_jobs" ON job_postings 
  FOR ALL 
  USING (true)
  WITH CHECK (true);

-- Add company_id to salary_templates if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'salary_templates' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE salary_templates ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_salary_templates_company_id ON salary_templates(company_id);
  END IF;
END $$;

COMMIT;