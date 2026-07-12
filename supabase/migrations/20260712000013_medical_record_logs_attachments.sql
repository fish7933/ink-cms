-- 상병 기록은 한 번 등록하고 끝나는 게 아니라 치료가 진행되는 동안 계속 로그(진행 경과)를
-- 남기고, 진단서/청구서/영수증 등 파일을 계속 쌓아나갈 수 있어야 한다.
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS medical_record_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medical_record_id uuid NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_medical_record_logs_record ON medical_record_logs(medical_record_id);

ALTER TABLE medical_record_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "medical_record_logs_all" ON medical_record_logs FOR ALL USING (true) WITH CHECK (true);
