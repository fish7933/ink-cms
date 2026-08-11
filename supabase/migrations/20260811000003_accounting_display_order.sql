-- 통장/카드/시재 목록에 사용자가 관리할 수 있는 표시 순서를 추가한다 — 이 순서가 자금일보에도 그대로 반영된다.

ALTER TABLE accounting_bank_accounts ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;
ALTER TABLE accounting_cards ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;
ALTER TABLE accounting_cash_registers ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;

-- 기존 행은 생성 순서를 초기 표시 순서로 백필
WITH ordered AS (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn FROM accounting_bank_accounts)
UPDATE accounting_bank_accounts a SET display_order = ordered.rn FROM ordered WHERE a.id = ordered.id;

WITH ordered AS (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn FROM accounting_cards)
UPDATE accounting_cards a SET display_order = ordered.rn FROM ordered WHERE a.id = ordered.id;

WITH ordered AS (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn FROM accounting_cash_registers)
UPDATE accounting_cash_registers a SET display_order = ordered.rn FROM ordered WHERE a.id = ordered.id;
