-- 육상 직원 연차 관리 + 결재 엔진 "참조(CC)" 기능

-- 1. 육상 직원 입사일 (연차 산정 기준)
ALTER TABLE users ADD COLUMN IF NOT EXISTS hire_date DATE;

-- 2. 결재 엔진 참조(CC) — 결재선과 별개로, 문서를 통보만 받는 사람/부서.
--    user_id 또는 org_unit_id 중 하나만 채워진다 (개인 참조 또는 부서 전체 참조).
CREATE TABLE IF NOT EXISTS approval_document_references (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES approval_documents(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  org_unit_id UUID REFERENCES org_units(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  CHECK ((user_id IS NOT NULL) <> (org_unit_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_approval_document_references_document ON approval_document_references(document_id);
CREATE INDEX IF NOT EXISTS idx_approval_document_references_user ON approval_document_references(user_id);
CREATE INDEX IF NOT EXISTS idx_approval_document_references_org_unit ON approval_document_references(org_unit_id);

ALTER TABLE approval_document_references ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_approval_document_references" ON approval_document_references;
CREATE POLICY "allow_all_approval_document_references" ON approval_document_references FOR ALL USING (true) WITH CHECK (true);

-- 3. 육상 직원 연차 신청 — 결재 문서(approval_documents)와 1:1로 연결되어,
--    결재 승인/반려 시 applyReferenceSideEffect()가 이 테이블의 status도 함께 동기화한다.
--    잔여 연차는 별도 잔액 테이블로 관리하지 않고 (입사일 기준 발생일수 - 승인된 신청일수 합) 로 그때그때 계산한다.
CREATE TABLE IF NOT EXISTS shore_leave_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days DECIMAL(4,1) NOT NULL CHECK (days > 0),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approval_document_id UUID REFERENCES approval_documents(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shore_leave_requests_user ON shore_leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_shore_leave_requests_status ON shore_leave_requests(status);

ALTER TABLE shore_leave_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_shore_leave_requests" ON shore_leave_requests;
CREATE POLICY "allow_all_shore_leave_requests" ON shore_leave_requests FOR ALL USING (true) WITH CHECK (true);

-- 4. "연차 신청" 결재 문서유형 시드
INSERT INTO approval_document_types (code, name, is_free_form)
SELECT 'LEAVE_REQUEST', '연차 신청', false
WHERE NOT EXISTS (SELECT 1 FROM approval_document_types WHERE code = 'LEAVE_REQUEST');
