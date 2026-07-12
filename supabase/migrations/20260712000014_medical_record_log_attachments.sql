-- 치료 경과 로그 개별 항목에도 그때그때의 진단서/영수증 등 파일을 첨부할 수 있어야 한다.
ALTER TABLE medical_record_logs ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
