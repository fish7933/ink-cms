-- 휴가 관리 테이블
CREATE TABLE IF NOT EXISTS crew_leave_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE NOT NULL,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('annual', 'sick', 'special', 'unpaid', 'compensatory', 'maternity')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'cancelled')) DEFAULT 'draft',
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  ship_id UUID REFERENCES ships(id) ON DELETE SET NULL,
  return_date DATE,
  actual_return_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_crew ON crew_leave_requests(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON crew_leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON crew_leave_requests(start_date, end_date);

ALTER TABLE crew_leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_leave" ON crew_leave_requests FOR ALL USING (true) WITH CHECK (true);
