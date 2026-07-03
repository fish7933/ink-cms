-- 교대지(항구) 참조 테이블 + 교대 계획의 기준 출국일/교대지 필드 추가
-- 항구가 목록에 없는 경우가 있으므로 port_text 자유 입력 폴백을 항상 병행한다.

CREATE TABLE IF NOT EXISTS ports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code TEXT,
  country_name TEXT NOT NULL,
  city_name TEXT NOT NULL,
  port_name TEXT NOT NULL,
  unlocode TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 999,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ports_active ON ports(is_active);
CREATE INDEX IF NOT EXISTS idx_ports_display_order ON ports(display_order);

ALTER TABLE ports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_ports" ON ports;
CREATE POLICY "allow_all_ports" ON ports FOR ALL TO public USING (true) WITH CHECK (true);

INSERT INTO ports (country_code, country_name, city_name, port_name, unlocode, display_order) VALUES
('KR', '대한민국', '부산', '부산항', 'KRPUS', 1),
('KR', '대한민국', '인천', '인천항', 'KRINC', 2),
('KR', '대한민국', '울산', '울산항', 'KRUSN', 3),
('KR', '대한민국', '여수/광양', '여수광양항', 'KRYOS', 4),
('KR', '대한민국', '평택/당진', '평택당진항', 'KRPTK', 5),
('KR', '대한민국', '목포', '목포항', 'KRMOK', 6),
('KR', '대한민국', '포항', '포항항', 'KRKPO', 7),
('KR', '대한민국', '군산', '군산항', 'KRKUV', 8),
('KR', '대한민국', '대산', '대산항', 'KRDSN', 9),
('KR', '대한민국', '동해/묵호', '동해묵호항', 'KRDHM', 10),
('SG', '싱가포르', 'Singapore', 'Port of Singapore', 'SGSIN', 11),
('CN', '중국', 'Shanghai', 'Port of Shanghai', 'CNSHA', 12),
('CN', '중국', 'Ningbo-Zhoushan', 'Port of Ningbo-Zhoushan', 'CNNGB', 13),
('CN', '중국', 'Shenzhen', 'Port of Shenzhen', 'CNSZX', 14),
('CN', '중국', 'Qingdao', 'Port of Qingdao', 'CNTAO', 15),
('CN', '중국', 'Tianjin', 'Port of Tianjin', 'CNTSN', 16),
('CN', '중국', 'Guangzhou', 'Port of Guangzhou', 'CNGZG', 17),
('CN', '중국', 'Dalian', 'Port of Dalian', 'CNDLC', 18),
('HK', '홍콩', 'Hong Kong', 'Port of Hong Kong', 'HKHKG', 19),
('TW', '대만', 'Kaohsiung', 'Port of Kaohsiung', 'TWKHH', 20),
('JP', '일본', 'Tokyo', 'Port of Tokyo', 'JPTYO', 21),
('JP', '일본', 'Yokohama', 'Port of Yokohama', 'JPYOK', 22),
('JP', '일본', 'Kobe', 'Port of Kobe', 'JPUKB', 23),
('JP', '일본', 'Nagoya', 'Port of Nagoya', 'JPNGO', 24),
('JP', '일본', 'Osaka', 'Port of Osaka', 'JPOSA', 25),
('VN', '베트남', 'Ho Chi Minh City', 'Cai Mep-Thi Vai / Saigon Port', 'VNSGN', 26),
('TH', '태국', 'Laem Chabang', 'Port of Laem Chabang', 'THLCH', 27),
('MY', '말레이시아', 'Port Klang', 'Port Klang', 'MYPKG', 28),
('PH', '필리핀', 'Manila', 'Port of Manila', 'PHMNL', 29),
('LK', '스리랑카', 'Colombo', 'Port of Colombo', 'LKCMB', 30),
('IN', '인도', 'Mumbai', 'Jawaharlal Nehru Port (Nhava Sheva)', 'INNSA', 31),
('AE', '아랍에미리트', 'Dubai', 'Jebel Ali Port', 'AEJEA', 32),
('SA', '사우디아라비아', 'Jeddah', 'Jeddah Islamic Port', 'SAJED', 33),
('NL', '네덜란드', 'Rotterdam', 'Port of Rotterdam', 'NLRTM', 34),
('BE', '벨기에', 'Antwerp', 'Port of Antwerp', 'BEANR', 35),
('DE', '독일', 'Hamburg', 'Port of Hamburg', 'DEHAM', 36),
('GB', '영국', 'Felixstowe', 'Port of Felixstowe', 'GBFXT', 37),
('GR', '그리스', 'Piraeus', 'Port of Piraeus', 'GRPIR', 38),
('ES', '스페인', 'Valencia', 'Port of Valencia', 'ESVLC', 39),
('US', '미국', 'Los Angeles', 'Port of Los Angeles', 'USLAX', 40),
('US', '미국', 'Long Beach', 'Port of Long Beach', 'USLGB', 41),
('US', '미국', 'New York/New Jersey', 'Port of New York and New Jersey', 'USNYC', 42),
('US', '미국', 'Houston', 'Port of Houston', 'USHOU', 43),
('US', '미국', 'Savannah', 'Port of Savannah', 'USSAV', 44),
('PA', '파나마', 'Panama City', 'Port of Panama (Balboa/Colon)', 'PAPTY', 45),
('BR', '브라질', 'Santos', 'Port of Santos', 'BRSSZ', 46),
('CA', '캐나다', 'Vancouver', 'Port of Vancouver', 'CAVAN', 47),
('AU', '호주', 'Melbourne', 'Port of Melbourne', 'AUMEL', 48)
ON CONFLICT DO NOTHING;

ALTER TABLE crew_rotation_plans
  ADD COLUMN IF NOT EXISTS base_departure_date DATE,
  ADD COLUMN IF NOT EXISTS port_id UUID REFERENCES ports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS port_text TEXT;

CREATE INDEX IF NOT EXISTS idx_rotation_plans_port ON crew_rotation_plans(port_id);
