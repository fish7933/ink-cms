-- 현금 시재(cash register)도 통장처럼 통화를 가질 수 있도록 한다 (외화 시재 대응).
ALTER TABLE accounting_cash_registers ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'KRW';
