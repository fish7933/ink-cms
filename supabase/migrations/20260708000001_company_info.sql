-- 우리회사(선박관리사) 정보 관리: 회사명/주소/연락처/팩스번호
-- 단일 레코드(싱글턴)로 운용하며, 승선경력 "회사 배치" 기록의 선박관리사명 자동 채움에 사용됨

CREATE TABLE IF NOT EXISTS company_info (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  fax TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE company_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_company_info" ON company_info FOR ALL USING (true);

INSERT INTO company_info (name)
SELECT 'INK Co., Ltd.'
WHERE NOT EXISTS (SELECT 1 FROM company_info);

-- 기존 "회사 배치" 승선경력의 선박관리사 표기를 INK Co., Ltd.로 통일
UPDATE sea_service_records
SET ship_manager_name = 'INK Co., Ltd.', updated_at = NOW()
WHERE record_type = 'company_assignment';
