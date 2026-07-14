-- 반려된 문서를 같은 결재라인으로 다시 상신할 수 있게 한다. 재상신 시 결재 단계
-- (approval_document_steps)는 다시 pending으로 초기화되어 반려 기록이 그 자리에서
-- 지워지므로, 반려 순간의 기록을 별도 이력 테이블에 남겨 재상신/재반려를 반복해도
-- 문서에 과거 반려 이력이 계속 보이게 한다.

ALTER TABLE approval_documents ADD COLUMN IF NOT EXISTS resubmit_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS approval_document_rejection_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES approval_documents(id) ON DELETE CASCADE NOT NULL,
  round INTEGER NOT NULL, -- 몇 차 상신에서 반려됐는지 (1부터 시작)
  rejected_step_order INTEGER NOT NULL,
  rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  rejected_by_name TEXT NOT NULL,
  rejected_by_label TEXT,
  comment TEXT NOT NULL,
  rejected_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approval_document_rejection_history_document ON approval_document_rejection_history(document_id);

ALTER TABLE approval_document_rejection_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_approval_document_rejection_history" ON approval_document_rejection_history;
CREATE POLICY "allow_all_approval_document_rejection_history" ON approval_document_rejection_history FOR ALL USING (true) WITH CHECK (true);
