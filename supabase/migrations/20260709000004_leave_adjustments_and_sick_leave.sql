-- 1) 연차 수동 조정(관리자가 특별 부여하거나, 결재 없이 소급으로 사용 처리) 기록
CREATE TABLE IF NOT EXISTS shore_leave_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('grant', 'manual_use')),
  hours DECIMAL(6,1) NOT NULL CHECK (hours > 0),
  reason TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shore_leave_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_shore_leave_adjustments ON shore_leave_adjustments FOR ALL USING (true) WITH CHECK (true);

-- 2) 질병휴가 — 연차와 완전히 별도로 집계 (연차 잔여에서 차감하지 않음)
CREATE TABLE IF NOT EXISTS sick_leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  hours DECIMAL(6,1) NOT NULL CHECK (hours > 0),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approval_document_id UUID REFERENCES approval_documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sick_leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_sick_leave_requests ON sick_leave_requests FOR ALL USING (true) WITH CHECK (true);

INSERT INTO approval_document_types (code, name, is_free_form)
SELECT 'SICK_LEAVE_REQUEST', '질병휴가 신청', false
WHERE NOT EXISTS (SELECT 1 FROM approval_document_types WHERE code = 'SICK_LEAVE_REQUEST');
