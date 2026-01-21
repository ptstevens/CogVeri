-- RBAC (Role-Based Access Control) System Migration
-- This creates a flexible permissions system with roles, permissions, and resource access

-- 1. Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  resource VARCHAR(100) NOT NULL, -- e.g., 'tasks', 'recordings', 'reviews'
  action VARCHAR(50) NOT NULL, -- e.g., 'view', 'create', 'update', 'delete', 'review'
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create roles table (extending existing roles)
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  level INTEGER DEFAULT 0, -- Hierarchy level: 0=lowest, higher=more access
  is_system BOOLEAN DEFAULT false, -- System roles can't be deleted
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create role_permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id)
);

-- 4. Create user_roles table (users can have multiple roles)
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE, -- Optional: temporary roles
  PRIMARY KEY (user_id, role_id)
);

-- 5. Create resource_access table for fine-grained access control
CREATE TABLE IF NOT EXISTS resource_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type VARCHAR(50) NOT NULL, -- 'task', 'project', 'team'
  resource_id UUID NOT NULL,
  access_level VARCHAR(20) NOT NULL, -- 'none', 'view', 'edit', 'admin'
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, resource_type, resource_id)
);

-- 6. Create team_members table for team-based access
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member', -- 'owner', 'manager', 'member', 'viewer'
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, user_id)
);

-- 7. Create audit_log table for tracking permission changes
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default permissions
INSERT INTO permissions (name, resource, action, description) VALUES
-- Task permissions
('tasks.view.all', 'tasks', 'view', 'View all tasks in the system'),
('tasks.view.assigned', 'tasks', 'view', 'View only assigned tasks'),
('tasks.view.team', 'tasks', 'view', 'View team tasks'),
('tasks.create', 'tasks', 'create', 'Create new tasks'),
('tasks.update.all', 'tasks', 'update', 'Update any task'),
('tasks.update.assigned', 'tasks', 'update', 'Update assigned tasks'),
('tasks.delete', 'tasks', 'delete', 'Delete tasks'),
('tasks.assign', 'tasks', 'assign', 'Assign tasks to users'),
('tasks.review', 'tasks', 'review', 'Review task submissions'),

-- Recording permissions
('recordings.view.all', 'recordings', 'view', 'View all recordings'),
('recordings.view.own', 'recordings', 'view', 'View own recordings'),
('recordings.view.team', 'recordings', 'view', 'View team recordings'),
('recordings.create', 'recordings', 'create', 'Create recordings'),
('recordings.delete', 'recordings', 'delete', 'Delete recordings'),
('recordings.download', 'recordings', 'download', 'Download recordings'),

-- Review permissions
('reviews.view.all', 'reviews', 'view', 'View all reviews'),
('reviews.view.assigned', 'reviews', 'view', 'View assigned reviews'),
('reviews.create', 'reviews', 'create', 'Create reviews'),
('reviews.update', 'reviews', 'update', 'Update reviews'),
('reviews.override', 'reviews', 'override', 'Override review decisions'),

-- User management permissions
('users.view', 'users', 'view', 'View user profiles'),
('users.create', 'users', 'create', 'Create new users'),
('users.update', 'users', 'update', 'Update user profiles'),
('users.delete', 'users', 'delete', 'Delete users'),
('users.manage.roles', 'users', 'manage_roles', 'Manage user roles'),

-- System permissions
('system.admin', 'system', 'admin', 'Full system administration'),
('system.settings', 'system', 'settings', 'Manage system settings'),
('system.audit', 'system', 'audit', 'View audit logs')
ON CONFLICT (name) DO NOTHING;

-- Insert default roles
INSERT INTO roles (name, display_name, description, level, is_system) VALUES
('super_admin', 'Super Administrator', 'Full system access', 100, true),
('admin', 'Administrator', 'Administrative access', 90, true),
('manager', 'Manager', 'Manage teams and assignments', 70, true),
('reviewer', 'Reviewer', 'Review submitted tasks', 50, true),
('employee', 'Employee', 'Regular user access', 30, true),
('viewer', 'Viewer', 'Read-only access', 10, true)
ON CONFLICT (name) DO NOTHING;

-- Assign permissions to roles
-- Super Admin gets everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- Admin gets most permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin'
AND p.name NOT IN ('system.admin')
ON CONFLICT DO NOTHING;

-- Manager permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'manager'
AND p.name IN (
  'tasks.view.all', 'tasks.create', 'tasks.update.all', 'tasks.assign',
  'recordings.view.team', 'reviews.view.assigned', 'users.view'
)
ON CONFLICT DO NOTHING;

-- Reviewer permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'reviewer'
AND p.name IN (
  'tasks.view.assigned', 'tasks.review', 'recordings.view.team',
  'reviews.view.assigned', 'reviews.create', 'reviews.update'
)
ON CONFLICT DO NOTHING;

-- Employee permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'employee'
AND p.name IN (
  'tasks.view.assigned', 'tasks.update.assigned',
  'recordings.view.own', 'recordings.create'
)
ON CONFLICT DO NOTHING;

-- Viewer permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'viewer'
AND p.name IN ('tasks.view.team', 'recordings.view.team')
ON CONFLICT DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_resource_access_user_resource ON resource_access(user_id, resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- Add role_id to users table if it doesn't exist (for backward compatibility)
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_role_id UUID REFERENCES roles(id);

-- Migrate existing user roles to the new system
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.role = r.name
ON CONFLICT DO NOTHING;

-- Update users with primary_role_id
UPDATE users u
SET primary_role_id = r.id
FROM roles r
WHERE u.role = r.name;