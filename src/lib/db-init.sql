-- This SQL should be run in Supabase SQL Editor
-- Copy and paste this entire content into Supabase Dashboard > SQL Editor > New Query

BEGIN;

-- Create companies table
CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('owner', 'manning')),
  country TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ship_owner', 'ship_manager', 'manning_agency', 'crew')),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create ships table
CREATE TABLE IF NOT EXISTS ships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  imo TEXT UNIQUE NOT NULL,
  dwt INTEGER NOT NULL,
  gt INTEGER NOT NULL,
  fleet_group TEXT,
  route TEXT,
  owner_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  rank_requirements JSONB DEFAULT '[]'::jsonb,
  crew_pattern TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create ranks table
CREATE TABLE IF NOT EXISTS ranks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('deck', 'engine', 'catering')),
  stcw_requirement TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create crew_members table with manning_agency_id
CREATE TABLE IF NOT EXISTS crew_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  nationality TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  rank TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  passport_no TEXT,
  seaman_book_no TEXT,
  experience JSONB DEFAULT '[]'::jsonb,
  certificates JSONB DEFAULT '[]'::jsonb,
  documents JSONB DEFAULT '[]'::jsonb,
  manning_agency_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create salary_tables table
CREATE TABLE IF NOT EXISTS salary_tables (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ship_id UUID REFERENCES ships(id) ON DELETE CASCADE,
  rank TEXT NOT NULL,
  onboard_salary DECIMAL(10,2) NOT NULL,
  leave_salary DECIMAL(10,2) NOT NULL,
  special_allowance DECIMAL(10,2),
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(ship_id, rank)
);

-- Create job_postings table
CREATE TABLE IF NOT EXISTS job_postings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ship_id UUID REFERENCES ships(id) ON DELETE CASCADE,
  rank TEXT NOT NULL,
  embarkation_date TEXT NOT NULL,
  contract_period TEXT NOT NULL,
  salary_range TEXT NOT NULL,
  special_requirements TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')) DEFAULT 'open',
  created_by UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create job_applications table
CREATE TABLE IF NOT EXISTS job_applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_posting_id UUID REFERENCES job_postings(id) ON DELETE CASCADE,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE,
  applied_by UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('received', 'under_review', 'rejected', 'sent_to_owner', 'accepted', 'declined')) DEFAULT 'received',
  comments TEXT,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_ships_owner_id ON ships(owner_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_user_id ON crew_members(user_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_manning_agency ON crew_members(manning_agency_id);
CREATE INDEX IF NOT EXISTS idx_salary_tables_ship_id ON salary_tables(ship_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_ship_id ON job_postings(ship_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_job_posting_id ON job_applications(job_posting_id);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ships ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranks ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "allow_all_users" ON users FOR ALL USING (true);
CREATE POLICY "allow_all_companies" ON companies FOR ALL USING (true);
CREATE POLICY "allow_all_ships" ON ships FOR ALL USING (true);
CREATE POLICY "allow_all_ranks" ON ranks FOR ALL USING (true);
CREATE POLICY "allow_all_crew" ON crew_members FOR ALL USING (true);
CREATE POLICY "allow_all_salaries" ON salary_tables FOR ALL USING (true);
CREATE POLICY "allow_all_jobs" ON job_postings FOR ALL USING (true);
CREATE POLICY "allow_all_applications" ON job_applications FOR ALL USING (true);

-- Insert initial data
INSERT INTO companies (id, name, type, country, contact_person, email, phone) VALUES
('c1000000-0000-0000-0000-000000000001'::uuid, '대한해운', 'owner', 'Korea', '김담당', 'contact@daehan.com', '+82-2-1234-5678'),
('c2000000-0000-0000-0000-000000000002'::uuid, '글로벌매닝', 'manning', 'Philippines', 'John Santos', 'john@globalmanning.com', '+63-2-987-6543')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, username, password, role, name, email, company_id) VALUES
('10000000-0000-0000-0000-000000000001'::uuid, 'owner1', 'password123', 'ship_owner', '김선주', 'owner@ship.com', 'c1000000-0000-0000-0000-000000000001'::uuid),
('20000000-0000-0000-0000-000000000002'::uuid, 'manager1', 'password123', 'ship_manager', '이관리', 'manager@ship.com', 'c1000000-0000-0000-0000-000000000001'::uuid),
('30000000-0000-0000-0000-000000000003'::uuid, 'manning1', 'password123', 'manning_agency', '박매닝', 'manning@agency.com', 'c2000000-0000-0000-0000-000000000002'::uuid),
('40000000-0000-0000-0000-000000000004'::uuid, 'crew1', 'password123', 'crew', '최선원', 'crew@sea.com', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO ranks (id, name, category, stcw_requirement) VALUES
('11111111-0000-0000-0000-000000000001'::uuid, 'Master', 'deck', 'STCW II/2'),
('22222222-0000-0000-0000-000000000002'::uuid, 'Chief Officer', 'deck', 'STCW II/2'),
('33333333-0000-0000-0000-000000000003'::uuid, 'Second Officer', 'deck', 'STCW II/1'),
('44444444-0000-0000-0000-000000000004'::uuid, 'Third Officer', 'deck', 'STCW II/1'),
('55555555-0000-0000-0000-000000000005'::uuid, 'Chief Engineer', 'engine', 'STCW III/2'),
('66666666-0000-0000-0000-000000000006'::uuid, 'Second Engineer', 'engine', 'STCW III/2'),
('77777777-0000-0000-0000-000000000007'::uuid, 'Third Engineer', 'engine', 'STCW III/1'),
('88888888-0000-0000-0000-000000000008'::uuid, 'Fourth Engineer', 'engine', 'STCW III/1'),
('99999999-0000-0000-0000-000000000009'::uuid, 'Chief Cook', 'catering', 'Basic Training')
ON CONFLICT (id) DO NOTHING;

COMMIT;