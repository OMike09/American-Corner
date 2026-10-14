-- Additive only. Existing track names and all dependent academic records remain untouched.
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS levels_json TEXT NOT NULL DEFAULT '["Licence","Master","Doctorat"]';
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS teacher_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE tracks ADD CONSTRAINT tracks_status_valid CHECK(status IN ('active','suspended','archived'));
