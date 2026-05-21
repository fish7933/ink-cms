-- Crew Recommendation and Approval System
-- This SQL creates tables for managing crew recommendations and approvals

BEGIN;

-- Create crew_recommendations table
CREATE TABLE IF NOT EXISTS app_5975fc7b1f_crew_recommendations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_application_id UUID REFERENCES app_5975fc7b1f_job_applications(id) ON DELETE CASCADE NOT NULL,
  crew_id UUID NOT NULL,
  ship_id UUID REFERENCES app_5975fc7b1f_ships(id) ON DELETE CASCADE NOT NULL,
  rank_id UUID REFERENCES app_5975fc7b1f_ranks(id) ON DELETE CASCADE NOT NULL,
  recommended_by UUID NOT NULL,
  recommendation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  proposed_salary DECIMAL(12, 2),
  proposed_join_date DATE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'internal_review', 'owner_review', 'approved', 'rejected', 'cancelled')) DEFAULT 'pending',
  internal_approval_status TEXT CHECK (internal_approval_status IN ('pending', 'approved', 'rejected')),
  owner_approval_status TEXT CHECK (owner_approval_status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create recommendation_approvals table for tracking approval history
CREATE TABLE IF NOT EXISTS app_5975fc7b1f_recommendation_approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recommendation_id UUID REFERENCES app_5975fc7b1f_crew_recommendations(id) ON DELETE CASCADE NOT NULL,
  approver_id UUID NOT NULL,
  approver_type TEXT NOT NULL CHECK (approver_type IN ('internal', 'owner')),
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected', 'pending')),
  comments TEXT,
  acted_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_crew_recommendations_job ON app_5975fc7b1f_crew_recommendations(job_application_id);
CREATE INDEX IF NOT EXISTS idx_crew_recommendations_crew ON app_5975fc7b1f_crew_recommendations(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_recommendations_ship ON app_5975fc7b1f_crew_recommendations(ship_id);
CREATE INDEX IF NOT EXISTS idx_crew_recommendations_status ON app_5975fc7b1f_crew_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_recommendation_approvals_rec ON app_5975fc7b1f_recommendation_approvals(recommendation_id);

-- Enable RLS
ALTER TABLE app_5975fc7b1f_crew_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_5975fc7b1f_recommendation_approvals ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "allow_all_crew_recommendations" ON app_5975fc7b1f_crew_recommendations FOR ALL USING (true);
CREATE POLICY "allow_all_recommendation_approvals" ON app_5975fc7b1f_recommendation_approvals FOR ALL USING (true);

COMMIT;