-- 직원 급여관리에 "직원 확인 → 지출결의서 결재 → 지급확정" 워크플로우를 추가한다.
-- status를 draft(작성중) -> pending_ack(직원 확인 대기) -> pending_approval(지출결의서
-- 결재 진행중) -> confirmed(승인 완료, 지급확정) 4단계로 확장한다.

-- 기존 CHECK 제약을 이름을 몰라도 안전하게 교체 (Postgres 자동 명명 규칙에 의존하지 않음)
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'employee_payroll_periods'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE employee_payroll_periods DROP CONSTRAINT %I', con_name);
  END IF;
END $$;
ALTER TABLE employee_payroll_periods ADD CONSTRAINT employee_payroll_periods_status_check
  CHECK (status IN ('draft', 'pending_ack', 'pending_approval', 'confirmed'));

-- 이 회차를 결재 상신한 지출결의서 문서 연결 (shore_leave_requests.approval_document_id와 동일한 패턴)
ALTER TABLE employee_payroll_periods ADD COLUMN IF NOT EXISTS approval_document_id UUID REFERENCES approval_documents(id) ON DELETE SET NULL;

-- 명세서 1건당 확인 상태는 1:1 관계라 별도 테이블 없이 employee_payslips에 직접 컬럼 추가
ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS ack_status TEXT NOT NULL DEFAULT 'pending' CHECK (ack_status IN ('pending', 'approved', 'disputed'));
ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS ack_comment TEXT;
ALTER TABLE employee_payslips ADD COLUMN IF NOT EXISTS ack_at TIMESTAMPTZ;
