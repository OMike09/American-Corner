-- A teacher may select one of the specializations authorized by the department head.
CREATE TABLE IF NOT EXISTS teacher_primary_specialization(user_id BIGINT PRIMARY KEY REFERENCES users(id) DEFERRABLE INITIALLY IMMEDIATE,node_id BIGINT NOT NULL REFERENCES track_nodes(id) DEFERRABLE INITIALLY IMMEDIATE,updated_at TEXT NOT NULL);
