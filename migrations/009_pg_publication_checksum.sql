-- Additive integrity checks for newly uploaded PDF and other publication media.
ALTER TABLE publication_media ADD COLUMN IF NOT EXISTS sha256 TEXT NOT NULL DEFAULT '';
ALTER TABLE publication_media_history ADD COLUMN IF NOT EXISTS sha256 TEXT NOT NULL DEFAULT '';
