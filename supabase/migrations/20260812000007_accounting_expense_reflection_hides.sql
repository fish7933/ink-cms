-- 지출결의 반영 목록에서 아직 반영 안 된(미반영) 지출결의서를 목록에서 지울 수 있게 한다.
-- 결재문서/시행문 자체는 전혀 건드리지 않고, 이 반영 대기 목록에서만 감춘다(경리 담당자
-- 전체가 공유하는 목록이라 결재함의 개인별 숨김과 달리 사용자 구분 없이 전체에 적용됨).
-- 지운 문서는 "삭제됨" 필터에서 다시 확인하고 복원할 수 있다.
CREATE TABLE IF NOT EXISTS accounting_expense_reflection_hides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES approval_documents(id) ON DELETE CASCADE NOT NULL UNIQUE,
  hidden_by UUID REFERENCES users(id) ON DELETE SET NULL,
  hidden_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE accounting_expense_reflection_hides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_accounting_expense_reflection_hides" ON accounting_expense_reflection_hides;
CREATE POLICY "allow_all_accounting_expense_reflection_hides" ON accounting_expense_reflection_hides FOR ALL USING (true) WITH CHECK (true);
