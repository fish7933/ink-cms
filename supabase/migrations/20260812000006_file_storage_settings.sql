-- 외부 S3 호환 저장소 연결 정보 (단일 행) — 지금은 저장만, 실제 업로드 라우팅은 추후.
CREATE TABLE IF NOT EXISTS file_storage_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 's3_compatible',
  endpoint_url TEXT,
  region TEXT,
  bucket TEXT,
  access_key_id TEXT,
  secret_access_key TEXT,
  path_style_access BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT false,
  memo TEXT,
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE file_storage_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_file_storage_settings ON file_storage_settings;
CREATE POLICY allow_all_file_storage_settings ON file_storage_settings FOR ALL USING (true) WITH CHECK (true);
