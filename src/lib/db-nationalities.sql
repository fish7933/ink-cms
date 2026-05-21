-- Nationalities Management for Crew Members
-- Major seafarer supplying countries

BEGIN;

-- Create nationalities table
CREATE TABLE IF NOT EXISTS nationalities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code TEXT UNIQUE NOT NULL,
  country_name_en TEXT NOT NULL,
  country_name_ko TEXT NOT NULL,
  region TEXT CHECK (region IN ('asia', 'europe', 'americas', 'africa', 'oceania')),
  is_major_supplier BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 999,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Insert major seafarer supplying countries
INSERT INTO nationalities (country_code, country_name_en, country_name_ko, region, is_major_supplier, display_order) VALUES
-- Asia (Major suppliers)
('PH', 'Philippines', '필리핀', 'asia', true, 1),
('CN', 'China', '중국', 'asia', true, 2),
('IN', 'India', '인도', 'asia', true, 3),
('ID', 'Indonesia', '인도네시아', 'asia', true, 4),
('KR', 'South Korea', '대한민국', 'asia', true, 5),
('MM', 'Myanmar', '미얀마', 'asia', true, 6),
('VN', 'Vietnam', '베트남', 'asia', true, 7),
('BD', 'Bangladesh', '방글라데시', 'asia', true, 8),
('TH', 'Thailand', '태국', 'asia', true, 9),
('JP', 'Japan', '일본', 'asia', true, 10),

-- Europe (Major suppliers)
('RU', 'Russia', '러시아', 'europe', true, 11),
('UA', 'Ukraine', '우크라이나', 'europe', true, 12),
('PL', 'Poland', '폴란드', 'europe', true, 13),
('RO', 'Romania', '루마니아', 'europe', true, 14),
('GR', 'Greece', '그리스', 'europe', true, 15),
('HR', 'Croatia', '크로아티아', 'europe', true, 16),
('BG', 'Bulgaria', '불가리아', 'europe', true, 17),
('TR', 'Turkey', '터키', 'europe', true, 18),

-- Americas
('US', 'United States', '미국', 'americas', false, 19),
('CA', 'Canada', '캐나다', 'americas', false, 20),
('BR', 'Brazil', '브라질', 'americas', false, 21),
('MX', 'Mexico', '멕시코', 'americas', false, 22),

-- Africa
('EG', 'Egypt', '이집트', 'africa', false, 23),
('ZA', 'South Africa', '남아프리카공화국', 'africa', false, 24),

-- Oceania
('AU', 'Australia', '호주', 'oceania', false, 25),
('NZ', 'New Zealand', '뉴질랜드', 'oceania', false, 26),

-- Additional Asian countries
('MY', 'Malaysia', '말레이시아', 'asia', false, 27),
('SG', 'Singapore', '싱가포르', 'asia', false, 28),
('LK', 'Sri Lanka', '스리랑카', 'asia', false, 29),
('PK', 'Pakistan', '파키스탄', 'asia', false, 30)
ON CONFLICT (country_code) DO NOTHING;

-- Create index
CREATE INDEX IF NOT EXISTS idx_nationalities_code ON nationalities(country_code);
CREATE INDEX IF NOT EXISTS idx_nationalities_active ON nationalities(is_active);
CREATE INDEX IF NOT EXISTS idx_nationalities_major ON nationalities(is_major_supplier);

-- Enable RLS
ALTER TABLE nationalities ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "allow_all_nationalities" ON nationalities FOR ALL USING (true);

COMMIT;