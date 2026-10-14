-- Additive PDF metadata. File bytes continue to live in file_blobs, never a temporary directory.
ALTER TABLE publication_media ADD COLUMN IF NOT EXISTS filename TEXT NOT NULL DEFAULT '';
ALTER TABLE publication_media ADD COLUMN IF NOT EXISTS document_class TEXT NOT NULL DEFAULT '';
ALTER TABLE publication_media_history ADD COLUMN IF NOT EXISTS filename TEXT NOT NULL DEFAULT '';
ALTER TABLE publication_media_history ADD COLUMN IF NOT EXISTS document_class TEXT NOT NULL DEFAULT '';
