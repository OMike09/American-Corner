-- Additive: retain all existing notification, teacher, pathway and media rows.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS opened_at TEXT;
ALTER TABLE department_teachers ADD COLUMN IF NOT EXISTS academic_title TEXT NOT NULL DEFAULT '';
ALTER TABLE department_teachers ADD COLUMN IF NOT EXISTS professional_status TEXT NOT NULL DEFAULT '';
ALTER TABLE department_teachers ADD COLUMN IF NOT EXISTS contact_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE department_teachers ADD COLUMN IF NOT EXISTS contact_email TEXT NOT NULL DEFAULT '';
ALTER TABLE department_teachers ADD COLUMN IF NOT EXISTS other_contact TEXT NOT NULL DEFAULT '';
ALTER TABLE department_teachers ADD COLUMN IF NOT EXISTS pathway_selections_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE track_nodes ADD COLUMN IF NOT EXISTS allowed_cycles_json TEXT NOT NULL DEFAULT '["Licence","Master","Doctorat"]';
ALTER TABLE track_nodes ADD COLUMN IF NOT EXISTS source_url TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id,created_at DESC,id DESC);
