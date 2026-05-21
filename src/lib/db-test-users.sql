-- Test Users for Approval Workflow Testing
-- This script creates multiple test users for each role to test the approval workflow

BEGIN;

-- Create additional ship managers for approval workflow
INSERT INTO users (id, username, password, role, name, email, company_id) VALUES
('20000000-0000-0000-0000-000000000010'::uuid, 'manager2', 'password123', 'ship_manager', '김관리', 'manager2@ship.com', 'c1000000-0000-0000-0000-000000000001'::uuid),
('20000000-0000-0000-0000-000000000011'::uuid, 'manager3', 'password123', 'ship_manager', '박관리', 'manager3@ship.com', 'c1000000-0000-0000-0000-000000000001'::uuid),
('20000000-0000-0000-0000-000000000012'::uuid, 'manager4', 'password123', 'ship_manager', '최관리', 'manager4@ship.com', 'c1000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- Create additional ship owners
INSERT INTO users (id, username, password, role, name, email, company_id) VALUES
('10000000-0000-0000-0000-000000000010'::uuid, 'owner2', 'password123', 'ship_owner', '이선주', 'owner2@ship.com', 'c1000000-0000-0000-0000-000000000001'::uuid),
('10000000-0000-0000-0000-000000000011'::uuid, 'owner3', 'password123', 'ship_owner', '정선주', 'owner3@ship.com', 'c1000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- Create additional manning agency users
INSERT INTO users (id, username, password, role, name, email, company_id) VALUES
('30000000-0000-0000-0000-000000000010'::uuid, 'manning2', 'password123', 'manning_agency', '김매닝', 'manning2@agency.com', 'c2000000-0000-0000-0000-000000000002'::uuid),
('30000000-0000-0000-0000-000000000011'::uuid, 'manning3', 'password123', 'manning_agency', '이매닝', 'manning3@agency.com', 'c2000000-0000-0000-0000-000000000002'::uuid)
ON CONFLICT (id) DO NOTHING;

-- Create additional crew members
INSERT INTO users (id, username, password, role, name, email, company_id) VALUES
('40000000-0000-0000-0000-000000000010'::uuid, 'crew2', 'password123', 'crew', '박선원', 'crew2@sea.com', NULL),
('40000000-0000-0000-0000-000000000011'::uuid, 'crew3', 'password123', 'crew', '김선원', 'crew3@sea.com', NULL),
('40000000-0000-0000-0000-000000000012'::uuid, 'crew4', 'password123', 'crew', '이선원', 'crew4@sea.com', NULL)
ON CONFLICT (id) DO NOTHING;

-- Create a sample approval line for testing
INSERT INTO approval_lines (id, company_id, name, description, approval_type, steps, is_active, created_by) VALUES
('a0000000-0000-0000-0000-000000000001'::uuid, 
 'c1000000-0000-0000-0000-000000000001'::uuid,
 '선원 채용 3단계 결재선',
 '선원 채용시 사용하는 3단계 결재 프로세스',
 'hiring',
 '[
   {"order": 1, "user_id": "20000000-0000-0000-0000-000000000002", "required": true},
   {"order": 2, "user_id": "20000000-0000-0000-0000-000000000010", "required": true},
   {"order": 3, "user_id": "10000000-0000-0000-0000-000000000001", "required": true}
 ]'::jsonb,
 true,
 '20000000-0000-0000-0000-000000000002'::uuid)
ON CONFLICT (id) DO NOTHING;

COMMIT;