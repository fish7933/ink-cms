-- src/lib/db-crew-extended.sql에 정의만 되어 있고 실제로는 한 번도 적용되지 않았던
-- 선원 확장 기록 테이블들을 백필한다 (crew_certificates/crew_assignments는 이미 라이브에 존재,
-- sea_service_records/training_records/medical_records/crew_salary_records는 누락 상태였음 —
-- "승선 경력" 탭이 항상 비어 있던 원인).

CREATE TABLE IF NOT EXISTS sea_service_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('pre_company', 'company_assignment')),
  ship_name TEXT NOT NULL,
  ship_type TEXT,
  flag TEXT,
  gross_tonnage INTEGER,
  engine_power INTEGER,
  rank TEXT NOT NULL,
  sign_on_date DATE NOT NULL,
  sign_off_date DATE,
  sign_off_reason TEXT,
  port_of_sign_on TEXT,
  port_of_sign_off TEXT,
  assignment_id UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS training_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE NOT NULL,
  training_name TEXT NOT NULL,
  training_type TEXT CHECK (training_type IN ('safety', 'technical', 'management', 'certification', 'other')),
  training_provider TEXT,
  training_location TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  duration_hours INTEGER,
  certificate_issued BOOLEAN DEFAULT false,
  certificate_number TEXT,
  certificate_expiry DATE,
  result TEXT CHECK (result IN ('passed', 'failed', 'in_progress')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS medical_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE NOT NULL,
  record_date DATE NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('injury', 'illness', 'checkup', 'vaccination', 'other')),
  diagnosis TEXT NOT NULL,
  treatment TEXT,
  doctor_name TEXT,
  hospital_clinic TEXT,
  location TEXT,
  ship_name TEXT,
  days_off_duty INTEGER DEFAULT 0,
  fitness_status TEXT CHECK (fitness_status IN ('fit', 'fit_with_restrictions', 'unfit', 'pending')),
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS crew_salary_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE NOT NULL,
  payment_period_start DATE NOT NULL,
  payment_period_end DATE NOT NULL,
  payment_date DATE NOT NULL,
  basic_salary DECIMAL(10,2) NOT NULL,
  overtime_pay DECIMAL(10,2) DEFAULT 0,
  allowances DECIMAL(10,2) DEFAULT 0,
  bonuses DECIMAL(10,2) DEFAULT 0,
  deductions DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  net_salary DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_method TEXT CHECK (payment_method IN ('bank_transfer', 'cash', 'check', 'other')),
  bank_name TEXT,
  account_number TEXT,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('pending', 'paid', 'cancelled')) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sea_service_crew ON sea_service_records(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_sea_service_type ON sea_service_records(record_type);
CREATE INDEX IF NOT EXISTS idx_training_crew ON training_records(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_medical_crew ON medical_records(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_medical_date ON medical_records(record_date);
CREATE INDEX IF NOT EXISTS idx_salary_crew ON crew_salary_records(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_salary_period ON crew_salary_records(payment_period_start, payment_period_end);

ALTER TABLE sea_service_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_salary_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_sea_service" ON sea_service_records;
CREATE POLICY "allow_all_sea_service" ON sea_service_records FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_training" ON training_records;
CREATE POLICY "allow_all_training" ON training_records FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_medical" ON medical_records;
CREATE POLICY "allow_all_medical" ON medical_records FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_salary_records" ON crew_salary_records;
CREATE POLICY "allow_all_salary_records" ON crew_salary_records FOR ALL USING (true);

-- 계약 관리: 선주/플릿/국적 정보도 함께 남길 수 있도록 확장 (교대 발령 실행 시 자동 생성용)
ALTER TABLE crew_contracts
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fleet_id UUID REFERENCES fleets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nationality TEXT;
