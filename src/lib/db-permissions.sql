BEGIN;

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  resource TEXT NOT NULL,
  can_view BOOLEAN DEFAULT false,
  can_create BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id, resource)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS permissions_user_id_idx ON permissions(user_id);
CREATE INDEX IF NOT EXISTS permissions_resource_idx ON permissions(resource);

-- Enable Row Level Security
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own permissions
CREATE POLICY "allow_view_own_permissions" ON permissions
  FOR SELECT
  USING (true);

-- Allow ship_manager to manage all permissions
CREATE POLICY "allow_manager_manage_permissions" ON permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'ship_manager'
    )
  );

-- Function to initialize permissions based on role
CREATE OR REPLACE FUNCTION initialize_user_permissions()
RETURNS TRIGGER AS $$
BEGIN
  -- Ship Manager - Full access to all resources
  IF NEW.role = 'ship_manager' THEN
    INSERT INTO permissions (user_id, resource, can_view, can_create, can_edit, can_delete) VALUES
      (NEW.id, 'companies', true, true, true, true),
      (NEW.id, 'ships', true, true, true, true),
      (NEW.id, 'crew', true, true, true, true),
      (NEW.id, 'ranks', true, true, true, true),
      (NEW.id, 'salary_components', true, true, true, true),
      (NEW.id, 'salary_templates', true, true, true, true),
      (NEW.id, 'salary_mappings', true, true, true, true),
      (NEW.id, 'jobs', true, true, true, true)
    ON CONFLICT (user_id, resource) DO UPDATE SET
      can_view = EXCLUDED.can_view,
      can_create = EXCLUDED.can_create,
      can_edit = EXCLUDED.can_edit,
      can_delete = EXCLUDED.can_delete,
      updated_at = NOW();
  
  -- Ship Owner - Read-only access to ships and related data
  ELSIF NEW.role = 'ship_owner' THEN
    INSERT INTO permissions (user_id, resource, can_view, can_create, can_edit, can_delete) VALUES
      (NEW.id, 'companies', false, false, false, false),
      (NEW.id, 'ships', true, false, false, false),
      (NEW.id, 'crew', true, false, false, false),
      (NEW.id, 'ranks', true, false, false, false),
      (NEW.id, 'salary_components', true, false, false, false),
      (NEW.id, 'salary_templates', true, false, false, false),
      (NEW.id, 'salary_mappings', true, false, false, false),
      (NEW.id, 'jobs', true, false, false, false)
    ON CONFLICT (user_id, resource) DO UPDATE SET
      can_view = EXCLUDED.can_view,
      can_create = EXCLUDED.can_create,
      can_edit = EXCLUDED.can_edit,
      can_delete = EXCLUDED.can_delete,
      updated_at = NOW();
  
  -- Manning Company - View ships/salaries, create job applications
  ELSIF NEW.role = 'manning_company' THEN
    INSERT INTO permissions (user_id, resource, can_view, can_create, can_edit, can_delete) VALUES
      (NEW.id, 'companies', false, false, false, false),
      (NEW.id, 'ships', true, false, false, false),
      (NEW.id, 'crew', true, false, false, false),
      (NEW.id, 'ranks', true, false, false, false),
      (NEW.id, 'salary_components', true, false, false, false),
      (NEW.id, 'salary_templates', true, false, false, false),
      (NEW.id, 'salary_mappings', true, false, false, false),
      (NEW.id, 'jobs', true, true, false, false)
    ON CONFLICT (user_id, resource) DO UPDATE SET
      can_view = EXCLUDED.can_view,
      can_create = EXCLUDED.can_create,
      can_edit = EXCLUDED.can_edit,
      can_delete = EXCLUDED.can_delete,
      updated_at = NOW();
  
  -- Crew - View own job applications only
  ELSIF NEW.role = 'crew' THEN
    INSERT INTO permissions (user_id, resource, can_view, can_create, can_edit, can_delete) VALUES
      (NEW.id, 'companies', false, false, false, false),
      (NEW.id, 'ships', false, false, false, false),
      (NEW.id, 'crew', false, false, false, false),
      (NEW.id, 'ranks', false, false, false, false),
      (NEW.id, 'salary_components', false, false, false, false),
      (NEW.id, 'salary_templates', false, false, false, false),
      (NEW.id, 'salary_mappings', false, false, false, false),
      (NEW.id, 'jobs', true, true, false, false)
    ON CONFLICT (user_id, resource) DO UPDATE SET
      can_view = EXCLUDED.can_view,
      can_create = EXCLUDED.can_create,
      can_edit = EXCLUDED.can_edit,
      can_delete = EXCLUDED.can_delete,
      updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-initialize permissions on user creation
DROP TRIGGER IF EXISTS trigger_initialize_permissions ON users;
CREATE TRIGGER trigger_initialize_permissions
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION initialize_user_permissions();

-- Initialize permissions for existing users
INSERT INTO permissions (user_id, resource, can_view, can_create, can_edit, can_delete)
SELECT 
  u.id,
  r.resource,
  CASE 
    WHEN u.role = 'ship_manager' THEN true
    WHEN u.role = 'ship_owner' AND r.resource != 'companies' THEN true
    WHEN u.role = 'manning_company' AND r.resource IN ('ships', 'crew', 'ranks', 'salary_components', 'salary_templates', 'salary_mappings', 'jobs') THEN true
    WHEN u.role = 'crew' AND r.resource = 'jobs' THEN true
    ELSE false
  END as can_view,
  CASE 
    WHEN u.role = 'ship_manager' THEN true
    WHEN u.role = 'manning_company' AND r.resource = 'jobs' THEN true
    WHEN u.role = 'crew' AND r.resource = 'jobs' THEN true
    ELSE false
  END as can_create,
  CASE 
    WHEN u.role = 'ship_manager' THEN true
    ELSE false
  END as can_edit,
  CASE 
    WHEN u.role = 'ship_manager' THEN true
    ELSE false
  END as can_delete
FROM users u
CROSS JOIN (
  VALUES 
    ('companies'),
    ('ships'),
    ('crew'),
    ('ranks'),
    ('salary_components'),
    ('salary_templates'),
    ('salary_mappings'),
    ('jobs')
) AS r(resource)
ON CONFLICT (user_id, resource) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete,
  updated_at = NOW();

COMMIT;