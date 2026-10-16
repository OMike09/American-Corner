-- Additive per-account notification sounds. Never alter existing preferences or notifications.
CREATE TABLE IF NOT EXISTS notification_sound_preferences (
 user_id BIGINT PRIMARY KEY REFERENCES users(id),
 sound TEXT NOT NULL DEFAULT 'default',
 vibration INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL
);
