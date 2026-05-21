-- Certificate Types Management
-- Manage various certificate categories and types

BEGIN;

-- Create certificate_types table
CREATE TABLE IF NOT EXISTS certificate_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('stcw', 'national', 'medical', 'safety', 'technical', 'other')),
  type_code TEXT UNIQUE NOT NULL,
  type_name_en TEXT NOT NULL,
  type_name_ko TEXT NOT NULL,
  description TEXT,
  validity_period_months INTEGER,
  is_mandatory BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 999,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Insert default certificate types
INSERT INTO certificate_types (category, type_code, type_name_en, type_name_ko, description, validity_period_months, is_mandatory, display_order) VALUES
-- STCW Certificates
('stcw', 'STCW_COC', 'Certificate of Competency', 'STCW 적격증명서', 'STCW 국제협약 적격증명서', 60, true, 1),
('stcw', 'STCW_COP', 'Certificate of Proficiency', 'STCW 능력증명서', 'STCW 국제협약 능력증명서', 60, true, 2),
('stcw', 'STCW_BST', 'Basic Safety Training', 'STCW 기본안전교육', 'STCW 기본안전교육 수료증', null, true, 3),
('stcw', 'STCW_AFF', 'Advanced Fire Fighting', 'STCW 상급소화교육', 'STCW 상급소화교육 수료증', 60, true, 4),
('stcw', 'STCW_PSC', 'Proficiency in Survival Craft', 'STCW 구명정 조종', 'STCW 구명정 및 구조정 조종 수료증', 60, true, 5),
('stcw', 'STCW_MFA', 'Medical First Aid', 'STCW 응급처치', 'STCW 응급처치 수료증', 60, true, 6),
('stcw', 'STCW_MC', 'Medical Care', 'STCW 의료관리', 'STCW 의료관리 수료증', 60, false, 7),

-- National Certificates (Korea)
('national', 'KR_SEAMAN_BOOK', 'Korean Seaman Book', '한국 선원수첩', '대한민국 선원수첩', 60, true, 10),
('national', 'KR_PASSPORT', 'Korean Passport', '한국 여권', '대한민국 여권', 120, true, 11),
('national', 'KR_COC', 'Korean Certificate of Competency', '한국 해기사면허', '대한민국 해기사 면허증', null, true, 12),

-- Flag State Certificates
('national', 'FLAG_COC', 'Flag State Certificate of Competency', '기국 적격증명서', '기국 발행 적격증명서', 60, true, 20),
('national', 'FLAG_ENDORSEMENT', 'Flag State Endorsement', '기국 인증서', '기국 인증서', 60, true, 21),

-- Medical Certificates
('medical', 'MEDICAL_EXAM', 'Medical Examination Certificate', '건강검진증서', '선원 건강검진 증명서', 24, true, 30),
('medical', 'YELLOW_FEVER', 'Yellow Fever Vaccination', '황열병 예방접종', '황열병 예방접종 증명서', 120, false, 31),
('medical', 'COVID_VAC', 'COVID-19 Vaccination', '코로나19 예방접종', '코로나19 예방접종 증명서', 12, false, 32),

-- Safety Certificates
('safety', 'BBCHP_KOREA', 'BBCHP Korea Certificate', 'BBCHP 한국증서', 'BBCHP 한국 안전교육 수료증', 24, false, 40),
('safety', 'ISM_CODE', 'ISM Code Training', 'ISM 교육', 'ISM Code 교육 수료증', 60, false, 41),
('safety', 'ISPS_CODE', 'ISPS Code Training', 'ISPS 교육', 'ISPS Code 교육 수료증', 60, false, 42),
('safety', 'SSO', 'Ship Security Officer', '선박보안책임자', '선박보안책임자 교육 수료증', 60, false, 43),

-- Technical Certificates
('technical', 'ECDIS', 'ECDIS Training', 'ECDIS 교육', '전자해도표시장치 교육 수료증', 60, false, 50),
('technical', 'ARPA', 'ARPA Training', 'ARPA 교육', '자동레이더 표적추적장치 교육 수료증', 60, false, 51),
('technical', 'GMDSS', 'GMDSS Training', 'GMDSS 교육', '전세계해상조난안전제도 교육 수료증', 60, false, 52),
('technical', 'TANKER_BASIC', 'Basic Tanker Training', '탱커 기본교육', '탱커선 기본교육 수료증', 60, false, 53),
('technical', 'TANKER_ADVANCED', 'Advanced Tanker Training', '탱커 상급교육', '탱커선 상급교육 수료증', 60, false, 54),

-- Other
('other', 'PASSPORT_FOREIGN', 'Foreign Passport', '외국 여권', '외국 여권', 120, true, 60),
('other', 'VISA', 'Visa', '비자', '입국 비자', 12, false, 61),
('other', 'SEAMAN_BOOK_FOREIGN', 'Foreign Seaman Book', '외국 선원수첩', '외국 선원수첩', 60, false, 62)
ON CONFLICT (type_code) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_certificate_types_category ON certificate_types(category);
CREATE INDEX IF NOT EXISTS idx_certificate_types_code ON certificate_types(type_code);
CREATE INDEX IF NOT EXISTS idx_certificate_types_active ON certificate_types(is_active);
CREATE INDEX IF NOT EXISTS idx_certificate_types_mandatory ON certificate_types(is_mandatory);

-- Enable RLS
ALTER TABLE certificate_types ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS "allow_all_certificate_types" ON certificate_types;
CREATE POLICY "allow_all_certificate_types" ON certificate_types FOR ALL USING (true);

COMMIT;