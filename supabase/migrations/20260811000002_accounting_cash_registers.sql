-- 현금관리(시재금) — 통장관리와 동일한 성격으로, 현금 거래를 특정 시재(현금함) 단위로
-- 구분해서 관리할 수 있게 한다. 기존 accounting_cash_transactions.payment_method='cash'
-- 거래에 어느 시재의 출납인지 연결하는 컬럼을 추가한다.

CREATE TABLE IF NOT EXISTS accounting_cash_registers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  holder_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  location TEXT,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  opening_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  memo TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE accounting_cash_transactions ADD COLUMN IF NOT EXISTS cash_register_id UUID REFERENCES accounting_cash_registers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_cash_transactions_cash_register ON accounting_cash_transactions(cash_register_id);

ALTER TABLE accounting_cash_registers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_accounting_cash_registers" ON accounting_cash_registers FOR ALL USING (true) WITH CHECK (true);
