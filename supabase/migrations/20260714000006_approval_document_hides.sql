-- 결재함의 "삭제"는 문서 자체를 지우는 게 아니라 그 사용자의 결재함 목록에서만
-- 안 보이게 감추는 개인별 숨김이다 — 다른 참여자(기안자/다른 결재자/참조자)의
-- 결재함이나 문서 자체(결재 이력 포함)에는 전혀 영향이 없다.
CREATE TABLE IF NOT EXISTS approval_document_hides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES approval_documents(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  hidden_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(document_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_approval_document_hides_user ON approval_document_hides(user_id);

ALTER TABLE approval_document_hides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_approval_document_hides" ON approval_document_hides;
CREATE POLICY "allow_all_approval_document_hides" ON approval_document_hides FOR ALL USING (true) WITH CHECK (true);
