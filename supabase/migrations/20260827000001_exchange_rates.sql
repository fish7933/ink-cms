-- 청구서 원화/현지통화 환산에 쓰이는 월별 환율 관리. 국적별 현지통화는 nationalities에
-- currency_code를 추가해 매핑해두고, 승선 중인 선원의 국적으로 그 달 필요한 통화를
-- 자동으로 산출한다(exchange-rate.service.ts). 현재 등록된 10개 국적을 실제 통화로 백필한다.
ALTER TABLE nationalities ADD COLUMN IF NOT EXISTS currency_code TEXT NULL;

UPDATE nationalities SET currency_code = CASE country_code
  WHEN 'CN' THEN 'CNY'
  WHEN 'ID' THEN 'IDR'
  WHEN 'MM' THEN 'MMK'
  WHEN 'TR' THEN 'TRY'
  WHEN 'BR' THEN 'BRL'
  WHEN 'AU' THEN 'AUD'
  WHEN 'MY' THEN 'MYR'
  WHEN 'LK' THEN 'LKR'
  WHEN 'PK' THEN 'PKR'
  WHEN 'KR' THEN 'KRW'
  ELSE currency_code
END
WHERE currency_code IS NULL;

CREATE TABLE IF NOT EXISTS management_fee_exchange_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  year_month TEXT NOT NULL, -- 'YYYY-MM'
  currency_code TEXT NOT NULL, -- 'KRW', 'IDR', 'MMK' 등
  rate_to_usd NUMERIC(12,4) NOT NULL, -- 1 USD 당 그 통화 금액
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE (year_month, currency_code)
);

CREATE INDEX IF NOT EXISTS idx_management_fee_exchange_rates_month ON management_fee_exchange_rates(year_month);

ALTER TABLE management_fee_exchange_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_management_fee_exchange_rates" ON management_fee_exchange_rates;
CREATE POLICY "allow_all_management_fee_exchange_rates" ON management_fee_exchange_rates FOR ALL USING (true);
