CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    created_at INTEGER DEFAULT (unixepoch()),
    expires_at INTEGER NOT NULL,
    note_content TEXT,
    max_views INTEGER NOT NULL DEFAULT 1,
    view_count INTEGER NOT NULL DEFAULT 0,
    file_count INTEGER NOT NULL DEFAULT 0,
    total_size INTEGER NOT NULL DEFAULT 0,
    finalized_at INTEGER,
    password_hash TEXT,
    deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_notes_expires_at ON notes (expires_at);
