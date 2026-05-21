-- Create Supabase Auth users for existing users in the database
-- This script migrates existing users to Supabase Auth

-- Note: This script should be run using Supabase SQL Editor or via the Management API
-- It creates auth users with the same email and a default password

BEGIN;

-- Create auth users for each user in the users table
-- Password for all test accounts: password123

-- Ship Owner
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  id,
  'authenticated',
  'authenticated',
  email,
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('username', username, 'name', name, 'role', role),
  now(),
  now(),
  '',
  ''
FROM users
WHERE email = 'owner1@example.com'
ON CONFLICT (id) DO NOTHING;

-- Ship Manager
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  id,
  'authenticated',
  'authenticated',
  email,
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('username', username, 'name', name, 'role', role),
  now(),
  now(),
  '',
  ''
FROM users
WHERE email = 'manager1@example.com'
ON CONFLICT (id) DO NOTHING;

-- Manning Agency
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  id,
  'authenticated',
  'authenticated',
  email,
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('username', username, 'name', name, 'role', role),
  now(),
  now(),
  '',
  ''
FROM users
WHERE email = 'manning1@example.com'
ON CONFLICT (id) DO NOTHING;

-- Crew
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  id,
  'authenticated',
  'authenticated',
  email,
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('username', username, 'name', name, 'role', role),
  now(),
  now(),
  '',
  ''
FROM users
WHERE email = 'crew1@example.com'
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verify the created auth users
SELECT 
  u.id,
  u.email,
  u.email_confirmed_at,
  u.created_at,
  u.raw_user_meta_data->>'name' as name,
  u.raw_user_meta_data->>'role' as role
FROM auth.users u
WHERE u.email IN (
  'owner1@example.com',
  'manager1@example.com', 
  'manning1@example.com',
  'crew1@example.com'
)
ORDER BY u.email;