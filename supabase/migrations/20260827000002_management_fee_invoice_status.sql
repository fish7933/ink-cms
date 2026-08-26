-- 청구서 임시저장(draft) 후 실제 엑셀 발행(issued) 상태를 구분하기 위해 status를 넓힌다.
ALTER TABLE management_fee_invoices DROP CONSTRAINT IF EXISTS management_fee_invoices_status_check;
ALTER TABLE management_fee_invoices ADD CONSTRAINT management_fee_invoices_status_check CHECK (status IN ('draft', 'issued'));
ALTER TABLE management_fee_invoices ADD COLUMN IF NOT EXISTS issued_at TIMESTAMP WITH TIME ZONE NULL;
