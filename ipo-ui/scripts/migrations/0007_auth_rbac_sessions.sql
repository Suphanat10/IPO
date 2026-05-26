BEGIN;

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE admin_users
  DROP CONSTRAINT IF EXISTS admin_users_role_check;

ALTER TABLE admin_users
  ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('super_admin', 'admin', 'readonly', 'scraper'));

CREATE TABLE IF NOT EXISTS admin_roles (
  role text PRIMARY KEY,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_permissions (
  permission text PRIMARY KEY,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role text NOT NULL REFERENCES admin_roles(role) ON DELETE CASCADE,
  permission text NOT NULL REFERENCES admin_permissions(permission) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission)
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES admin_users(user_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id ON admin_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_active ON admin_sessions(user_id, expires_at)
  WHERE revoked_at IS NULL;

INSERT INTO admin_roles (role, description) VALUES
  ('super_admin', 'Full system administration including admin user management'),
  ('admin', 'IPO operations administration'),
  ('scraper', 'Can trigger and configure the upcoming IPO scraper'),
  ('readonly', 'Read-only access to admin data')
ON CONFLICT (role) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO admin_permissions (permission, description) VALUES
  ('ipos:read', 'Read IPO admin records'),
  ('ipos:write', 'Create and update IPO admin records'),
  ('ipos:delete', 'Cancel or delete IPO admin records'),
  ('validation:read', 'Read validation results'),
  ('validation:write', 'Run and resolve validation results'),
  ('builds:read', 'Read build runs'),
  ('builds:trigger', 'Trigger build runs'),
  ('scraper:trigger', 'Trigger upcoming IPO scraper'),
  ('admin_users:read', 'Read admin users'),
  ('admin_users:create', 'Create admin users'),
  ('admin_users:update', 'Update admin users'),
  ('admin_users:delete', 'Delete admin users')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO admin_role_permissions (role, permission)
SELECT 'super_admin', permission FROM admin_permissions
ON CONFLICT DO NOTHING;

INSERT INTO admin_role_permissions (role, permission) VALUES
  ('admin', 'ipos:read'),
  ('admin', 'ipos:write'),
  ('admin', 'ipos:delete'),
  ('admin', 'validation:read'),
  ('admin', 'validation:write'),
  ('admin', 'builds:read'),
  ('admin', 'builds:trigger'),
  ('admin', 'scraper:trigger'),
  ('scraper', 'ipos:read'),
  ('scraper', 'scraper:trigger'),
  ('readonly', 'ipos:read'),
  ('readonly', 'validation:read'),
  ('readonly', 'builds:read')
ON CONFLICT DO NOTHING;

UPDATE admin_users
SET role = 'super_admin'
WHERE user_id = (
  SELECT user_id
  FROM admin_users
  WHERE is_active = true
  ORDER BY created_at NULLS LAST, email NULLS LAST, user_id
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1
  FROM admin_users
  WHERE role = 'super_admin' AND is_active = true
);

COMMIT;
