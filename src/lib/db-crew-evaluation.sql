-- 선원 평가 테이블
CREATE TABLE IF NOT EXISTS crew_evaluations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE NOT NULL,
  evaluation_period_start DATE NOT NULL,
  evaluation_period_end DATE NOT NULL,
  ship_id UUID REFERENCES ships(id) ON DELETE SET NULL,
  evaluator_name TEXT,
  evaluator_rank TEXT,
  professional_knowledge INTEGER CHECK (professional_knowledge BETWEEN 1 AND 5),
  work_performance INTEGER CHECK (work_performance BETWEEN 1 AND 5),
  safety_awareness INTEGER CHECK (safety_awareness BETWEEN 1 AND 5),
  teamwork INTEGER CHECK (teamwork BETWEEN 1 AND 5),
  leadership INTEGER CHECK (leadership BETWEEN 1 AND 5),
  communication INTEGER CHECK (communication BETWEEN 1 AND 5),
  discipline INTEGER CHECK (discipline BETWEEN 1 AND 5),
  reliability INTEGER CHECK (reliability BETWEEN 1 AND 5),
  overall_rating DECIMAL(3,1),
  strengths TEXT,
  areas_for_improvement TEXT,
  recommendation TEXT CHECK (recommendation IN ('highly_recommend', 'recommend', 'neutral', 'not_recommend')),
  comments TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted', 'acknowledged')) DEFAULT 'draft',
  acknowledged_by_crew BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evaluations_crew ON crew_evaluations(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_status ON crew_evaluations(status);
CREATE INDEX IF NOT EXISTS idx_evaluations_period ON crew_evaluations(evaluation_period_start, evaluation_period_end);

ALTER TABLE crew_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_evaluations" ON crew_evaluations FOR ALL USING (true) WITH CHECK (true);
