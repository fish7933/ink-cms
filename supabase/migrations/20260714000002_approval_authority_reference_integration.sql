-- 채용/배승/계약/승진강등 4개 결재 도메인이 결재선(approval_lines)은 그대로 따르되,
-- 문서유형/전결규정관리(approval_document_types/approval_authority_limits)에 이미 있는
-- 전결(직급 기준 자동 종결)·참조(기본 참조부서) 규정도 함께 적용받도록 연동한다.
-- rotation_plan/dispatch_order 문서유형은 이전 세션에서 이미 등록돼 있으므로, 빠져 있던
-- 채용(crew_recommendation)/계약(crew_contract) 문서유형만 추가한다.
INSERT INTO approval_document_types (code, name, is_free_form)
VALUES
  ('crew_recommendation', '채용 결재', false),
  ('crew_contract', '계약 결재', false)
ON CONFLICT (code) DO NOTHING;

-- 결재선 기반 4개 도메인(crew_recommendation_approvals/rotation_plan_approvals/
-- crew_contract_approvals/dispatch_order_approvals)은 각자 다른 요청 테이블을 쓰므로,
-- approval_document_references처럼 document_id 단일 FK로 묶을 수 없어 domain+request_id로 구분한다.
CREATE TABLE IF NOT EXISTS approval_request_references (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  domain TEXT NOT NULL CHECK (domain IN ('crew_recommendation', 'rotation_plan', 'crew_contract', 'dispatch_order')),
  request_id UUID NOT NULL,
  org_unit_id UUID REFERENCES org_units(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approval_request_references_lookup ON approval_request_references(domain, request_id);

ALTER TABLE approval_request_references ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_approval_request_references" ON approval_request_references;
CREATE POLICY "allow_all_approval_request_references" ON approval_request_references FOR ALL USING (true) WITH CHECK (true);
