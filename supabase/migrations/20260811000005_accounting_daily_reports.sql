-- 자금일보: 매일 통장/카드/시재의 전일잔액-입금-출금-금일잔액을 요약해 결재로 상신하는 독립 기능.
CREATE TABLE IF NOT EXISTS accounting_daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'confirmed')),
  snapshot JSONB,
  approval_document_id UUID REFERENCES approval_documents(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE accounting_daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_accounting_daily_reports" ON accounting_daily_reports FOR ALL USING (true) WITH CHECK (true);

INSERT INTO approval_document_types (code, name, is_free_form)
SELECT 'DAILY_CASH_REPORT', '자금일보', false
WHERE NOT EXISTS (SELECT 1 FROM approval_document_types WHERE code = 'DAILY_CASH_REPORT');
