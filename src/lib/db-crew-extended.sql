-- Extended Crew Information Management System
-- Bio-data, Certificates, Sea Service, Training, Medical, Salary records

BEGIN;

-- Update crew_members table with bio-data fields
ALTER TABLE crew_members 
ADD COLUMN IF NOT EXISTS height DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS weight DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS blood_type TEXT,
ADD COLUMN IF NOT EXISTS shoe_size TEXT,
ADD COLUMN IF NOT EXISTS coverall_size TEXT,
ADD COLUMN IF NOT EXISTS place_of_birth TEXT,
ADD COLUMN IF NOT EXISTS next_of_kin TEXT,
ADD COLUMN IF NOT EXISTS next_of_kin_relationship TEXT,
ADD COLUMN IF NOT EXISTS next_of_kin_contact TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
ADD COLUMN IF NOT EXISTS join_company_date DATE,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'on_leave', 'resigned', 'terminated'));

-- Create certificates table
CREATE TABLE IF NOT EXISTS crew_certificates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE NOT NULL,
  certificate_type TEXT NOT NULL CHECK (certificate_type IN (
    'stcw_national', 'stcw_flag', 'bbchp_korea', 'medical', 'ism', 'passport', 'seaman_book', 'other'
  )),
  certificate_name TEXT NOT NULL,
  certificate_number TEXT,
  issue_date DATE,
  expiry_date DATE,
  issuing_authority TEXT,
  document_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create sea service records table (승선 기록)
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
  assignment_id UUID, -- Reference to company assignment if applicable
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create training records table (교육훈련)
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

-- Create medical records table (상병 기록)
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

-- Create salary records table (급여 기록)
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

-- Create crew assignments table (승/하선 발령)
CREATE TABLE IF NOT EXISTS crew_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE NOT NULL,
  ship_id UUID REFERENCES ships(id) ON DELETE CASCADE NOT NULL,
  rank TEXT NOT NULL,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('sign_on', 'sign_off', 'transfer')),
  assignment_date DATE NOT NULL,
  effective_date DATE NOT NULL,
  port TEXT,
  reason TEXT,
  contract_start_date DATE,
  contract_end_date DATE,
  salary_amount DECIMAL(10,2),
  salary_currency TEXT DEFAULT 'USD',
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approval_date DATE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending_approval', 'approved', 'cancelled')) DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_crew_certificates_crew ON crew_certificates(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_crew_certificates_type ON crew_certificates(certificate_type);
CREATE INDEX IF NOT EXISTS idx_crew_certificates_expiry ON crew_certificates(expiry_date);
CREATE INDEX IF NOT EXISTS idx_sea_service_crew ON sea_service_records(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_sea_service_type ON sea_service_records(record_type);
CREATE INDEX IF NOT EXISTS idx_training_crew ON training_records(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_medical_crew ON medical_records(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_medical_date ON medical_records(record_date);
CREATE INDEX IF NOT EXISTS idx_salary_crew ON crew_salary_records(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_salary_period ON crew_salary_records(payment_period_start, payment_period_end);
CREATE INDEX IF NOT EXISTS idx_assignments_crew ON crew_assignments(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_assignments_ship ON crew_assignments(ship_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON crew_assignments(status);

-- Enable RLS
ALTER TABLE crew_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sea_service_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_salary_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "allow_all_crew_certificates" ON crew_certificates FOR ALL USING (true);
CREATE POLICY "allow_all_sea_service" ON sea_service_records FOR ALL USING (true);
CREATE POLICY "allow_all_training" ON training_records FOR ALL USING (true);
CREATE POLICY "allow_all_medical" ON medical_records FOR ALL USING (true);
CREATE POLICY "allow_all_salary_records" ON crew_salary_records FOR ALL USING (true);
CREATE POLICY "allow_all_assignments" ON crew_assignments FOR ALL USING (true);

COMMIT;