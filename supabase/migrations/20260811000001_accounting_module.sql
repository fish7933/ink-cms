-- 경리 프로그램(통장관리/카드관리/금전출납) 1단계 — 자금일보/지출결의서 연동은 이후 단계에서 진행.

-- 1. 통장관리
CREATE TABLE IF NOT EXISTS accounting_bank_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_name TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  account_type TEXT,
  currency TEXT NOT NULL DEFAULT 'KRW',
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  opening_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  memo TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. 카드관리
CREATE TABLE IF NOT EXISTS accounting_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_name TEXT NOT NULL,
  issuer TEXT NOT NULL,
  card_number_last4 TEXT,
  card_type TEXT,
  linked_bank_account_id UUID REFERENCES accounting_bank_accounts(id) ON DELETE SET NULL,
  holder_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  credit_limit DECIMAL(14,2),
  expiry_date TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  memo TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. 금전출납 분류(계정과목) — 하선사유(sign_off_reasons)와 동일한 관리형 목록 패턴
CREATE TABLE IF NOT EXISTS accounting_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense')),
  is_system BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. 금전출납부 — 핵심 거래 원장
CREATE TABLE IF NOT EXISTS accounting_cash_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_date DATE NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('bank_account', 'card', 'cash')),
  bank_account_id UUID REFERENCES accounting_bank_accounts(id) ON DELETE SET NULL,
  card_id UUID REFERENCES accounting_cards(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense')),
  category_id UUID REFERENCES accounting_categories(id) ON DELETE SET NULL,
  counterparty TEXT,
  description TEXT,
  amount DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'KRW',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_accounting_cash_transactions_date ON accounting_cash_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_accounting_cash_transactions_bank_account ON accounting_cash_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_accounting_cash_transactions_card ON accounting_cash_transactions(card_id);

ALTER TABLE accounting_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_cash_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_accounting_bank_accounts" ON accounting_bank_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_accounting_cards" ON accounting_cards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_accounting_categories" ON accounting_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_accounting_cash_transactions" ON accounting_cash_transactions FOR ALL USING (true) WITH CHECK (true);

-- 기본 분류 시드
INSERT INTO accounting_categories (name, transaction_type, is_system, display_order) VALUES
  ('급여', 'expense', true, 1),
  ('임차료', 'expense', true, 2),
  ('통신비', 'expense', true, 3),
  ('소모품비', 'expense', true, 4),
  ('세금과공과', 'expense', true, 5),
  ('접대비', 'expense', true, 6),
  ('여비교통비', 'expense', true, 7),
  ('수수료', 'expense', true, 8),
  ('기타', 'expense', true, 9),
  ('매출', 'income', true, 1),
  ('이자수익', 'income', true, 2),
  ('기타수입', 'income', true, 3);
