-- 같은 증서 유형이라도 선원의 국적(자국 증서 발급 기준)에 따라 유효기간이 다른 경우가 있어,
-- 기본 유효기간(certificate_types.validity_period_months)에 대한 국적별 예외만 별도로 관리한다.
-- 대부분의 증서/국적 조합은 예외가 없으므로 이 테이블에 행이 없으면 그냥 기본값을 그대로 쓴다.
CREATE TABLE IF NOT EXISTS certificate_type_nationality_validity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  certificate_type_id UUID REFERENCES certificate_types(id) ON DELETE CASCADE NOT NULL,
  nationality_code TEXT REFERENCES nationalities(country_code) ON DELETE CASCADE NOT NULL,
  -- NULL이면 이 국적은 무기한(만료 없음)이라는 뜻 — certificate_types.validity_period_months와 동일한 규칙
  validity_period_months INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(certificate_type_id, nationality_code)
);
CREATE INDEX IF NOT EXISTS idx_cert_nationality_validity_type ON certificate_type_nationality_validity(certificate_type_id);

ALTER TABLE certificate_type_nationality_validity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_cert_nationality_validity" ON certificate_type_nationality_validity;
CREATE POLICY "allow_all_cert_nationality_validity" ON certificate_type_nationality_validity FOR ALL USING (true) WITH CHECK (true);
