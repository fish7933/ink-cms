-- 범용 결재 엔진: 특정 기능(선원추천)에 종속되지 않고 어떤 "건"이든 조직도 기반
-- 결재라인 + 전결규정을 태울 수 있는 공통 구조. 첫 사용처는 자유 기안서(문서 결재).
-- crew_recommendation_approvals 계열은 그대로 두고 완전히 별도로 추가한다.

CREATE TABLE IF NOT EXISTS approval_document_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_free_form BOOLEAN NOT NULL DEFAULT true, -- 향후 시스템 연동형(급여템플릿 변경 등) 문서유형을 위해 예약
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 전결규정: 문서유형당 "이 직급 이상이면 여기서 결재 종결" 1건만 단순 지정
CREATE TABLE IF NOT EXISTS approval_authority_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_type_id UUID REFERENCES approval_document_types(id) ON DELETE CASCADE NOT NULL UNIQUE,
  position_id UUID REFERENCES shore_positions(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_type_id UUID REFERENCES approval_document_types(id) ON DELETE RESTRICT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  reference_type TEXT, -- 향후 시스템 연동형 문서를 위해 예약 (지금은 항상 NULL)
  reference_id UUID,
  org_unit_id UUID REFERENCES org_units(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  current_step INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL NOT NULL,
  requester_comment TEXT,
  final_comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_approval_documents_created_by ON approval_documents(created_by);
CREATE INDEX IF NOT EXISTS idx_approval_documents_status ON approval_documents(status);

-- 문서 전용 결재 단계 — approval_line_steps처럼 재사용되는 템플릿이 아니라
-- 문서 1건에 소속된 구체적인 행이라, 이 행 자체가 결재 기록이 되고 별도
-- 액션 로그 테이블이 필요 없다.
CREATE TABLE IF NOT EXISTS approval_document_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES approval_documents(id) ON DELETE CASCADE NOT NULL,
  step_order INTEGER NOT NULL,
  approver_id UUID REFERENCES users(id) ON DELETE SET NULL NOT NULL,
  approver_name TEXT NOT NULL,
  approver_label TEXT, -- "해무1팀 · 부장" 같은 표시용 레이블
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  comment TEXT,
  acted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(document_id, step_order)
);
CREATE INDEX IF NOT EXISTS idx_approval_document_steps_document ON approval_document_steps(document_id);
CREATE INDEX IF NOT EXISTS idx_approval_document_steps_approver ON approval_document_steps(approver_id, status);

ALTER TABLE approval_document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_authority_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_document_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_approval_document_types" ON approval_document_types;
CREATE POLICY "allow_all_approval_document_types" ON approval_document_types FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_approval_authority_limits" ON approval_authority_limits;
CREATE POLICY "allow_all_approval_authority_limits" ON approval_authority_limits FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_approval_documents" ON approval_documents;
CREATE POLICY "allow_all_approval_documents" ON approval_documents FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_approval_document_steps" ON approval_document_steps;
CREATE POLICY "allow_all_approval_document_steps" ON approval_document_steps FOR ALL USING (true) WITH CHECK (true);
