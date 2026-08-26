-- 선주 단위 월별 관리비 청구서 — 관리비 계산(management_fee_periods, 선박 단위)과 실비 기록을
-- 한 선주의 여러 선박에 걸쳐 모아 실제 청구서(엑셀)로 조립할 때 쓰는 상위 단위.
-- 문서번호는 사내 채번 규칙을 알 수 없어 자동 생성하지 않고 그대로 수기 입력한다.
-- 환율도 별도 환율 테이블이 없어(기존 송금 관리 화면도 건별 수기 입력 방식) 청구서 작성
-- 시점에 담당자가 직접 입력한다.
CREATE TABLE IF NOT EXISTS management_fee_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  year_month TEXT NOT NULL, -- 'YYYY-MM'
  doc_number TEXT NOT NULL DEFAULT '',
  exchange_rate NUMERIC(10,2) NOT NULL, -- USD 1 당 KRW
  usd_bank_account_id UUID REFERENCES accounting_bank_accounts(id) ON DELETE SET NULL,
  krw_bank_account_id UUID REFERENCES accounting_bank_accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE (owner_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_management_fee_invoices_owner ON management_fee_invoices(owner_id);

ALTER TABLE management_fee_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_management_fee_invoices" ON management_fee_invoices;
CREATE POLICY "allow_all_management_fee_invoices" ON management_fee_invoices FOR ALL USING (true);
