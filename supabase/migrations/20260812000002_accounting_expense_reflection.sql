-- 금전출납 거래가 어느 결재문서의 몇 번째 지출 항목에서 왔는지 추적 — 이 값이 있으면 "반영됨"
ALTER TABLE accounting_cash_transactions ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES approval_documents(id) ON DELETE SET NULL;
ALTER TABLE accounting_cash_transactions ADD COLUMN IF NOT EXISTS source_item_index INT;
CREATE UNIQUE INDEX IF NOT EXISTS accounting_cash_transactions_source_unique
  ON accounting_cash_transactions(source_document_id, source_item_index) WHERE source_document_id IS NOT NULL;

-- 직원 급여 지급계좌 (직원 급여 관리 > 직원별 급여표에서 입력, 지출결의서 적요 자동 생성에 사용)
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_bank_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_bank_account TEXT;
