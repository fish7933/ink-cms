-- 결재함의 참조함(내가 참조로 지정된 문서) 배지에 "미열람" 개수를 보여주기 위한 열람 기록.
-- approval_document_references는 user_id 또는 org_unit_id(부서 전체 참조) 단위로 저장되므로
-- 부서 참조 1건을 여러 사람이 공유할 수 있다 — 그래서 열람 여부는 문서+사용자 단위로 별도 기록한다.
CREATE TABLE IF NOT EXISTS approval_document_reference_reads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES approval_documents(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(document_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_approval_document_reference_reads_user ON approval_document_reference_reads(user_id);

ALTER TABLE approval_document_reference_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_approval_document_reference_reads" ON approval_document_reference_reads;
CREATE POLICY "allow_all_approval_document_reference_reads" ON approval_document_reference_reads FOR ALL USING (true) WITH CHECK (true);
