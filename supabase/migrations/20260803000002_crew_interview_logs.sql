-- 선원 면담 일지 — 매닝회사가 직접 면담할 때 기록. 가장 최근 면담의 승선 희망일이
-- crew_members.desired_embark_date에도 반영된다(애플리케이션 코드에서 처리).
CREATE TABLE crew_interview_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_member_id UUID NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  interview_date DATE NOT NULL,
  interviewer_name TEXT NOT NULL,
  desired_owner_id UUID REFERENCES companies(id),
  desired_fleet_id UUID REFERENCES fleets(id),
  desired_ship_id UUID REFERENCES ships(id),
  desired_embark_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crew_interview_logs_crew_member_id ON crew_interview_logs(crew_member_id);

ALTER TABLE crew_interview_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON crew_interview_logs FOR ALL USING (true) WITH CHECK (true);
