PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT,
  nickname TEXT,
  email TEXT,
  labels TEXT,
  banned INTEGER NOT NULL DEFAULT 0,
  allowed_device_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chromebooks (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  asset_tag TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  status_note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkouts (
  device_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  checkout_time TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  checkout_time TEXT NOT NULL,
  return_time TEXT NOT NULL,
  outcome TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS unreturned (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  checkout_time TEXT NOT NULL,
  flagged_time TEXT NOT NULL,
  reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_requests (
  token TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  device_id TEXT,
  verified_at TEXT
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  require_class INTEGER NOT NULL DEFAULT 1,
  allow_verification INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_student ON history (student_name);
CREATE INDEX IF NOT EXISTS idx_history_class ON history (class_name);
CREATE INDEX IF NOT EXISTS idx_unreturned_device ON unreturned (device_id);
CREATE INDEX IF NOT EXISTS idx_verification_student ON verification_requests (student_id);
CREATE INDEX IF NOT EXISTS idx_students_name ON students (last_name, first_name);

