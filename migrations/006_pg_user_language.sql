-- Per-account language preference, independent of temporary browser storage.
CREATE TABLE IF NOT EXISTS user_languages(user_id BIGINT PRIMARY KEY REFERENCES users(id) DEFERRABLE INITIALLY IMMEDIATE,language TEXT NOT NULL DEFAULT 'fr' CHECK(language IN ('fr','en')),updated_at TEXT NOT NULL);
