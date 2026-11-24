-- Skema SQL PostgreSQL untuk Aplikasi MKC CBT
-- Dapat dijalankan manual pada PostgreSQL atau dikelola otomatis via Drizzle Kit (npx drizzle-kit push)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'siswa', -- 'guru' | 'siswa'
  class_name TEXT NOT NULL DEFAULT '',
  password_hash TEXT,
  access_pin TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  type TEXT NOT NULL, -- 'pg' | 'isian' | 'benar_salah' | 'uraian'
  prompt TEXT NOT NULL,
  image_data TEXT,
  options_json TEXT,
  correct_answer TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 10,
  difficulty TEXT NOT NULL DEFAULT 'sedang',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exams (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  exam_code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  question_count INTEGER NOT NULL DEFAULT 10,
  kkm INTEGER NOT NULL DEFAULT 75,
  shuffle_questions BOOLEAN NOT NULL DEFAULT TRUE,
  shuffle_options BOOLEAN NOT NULL DEFAULT TRUE,
  allow_student_view_result BOOLEAN NOT NULL DEFAULT FALSE,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  require_fullscreen BOOLEAN NOT NULL DEFAULT TRUE,
  detect_tab_switch BOOLEAN NOT NULL DEFAULT TRUE,
  detect_window_blur BOOLEAN NOT NULL DEFAULT TRUE,
  block_copy_paste BOOLEAN NOT NULL DEFAULT TRUE,
  max_violations INTEGER NOT NULL DEFAULT 3,
  violation_action TEXT NOT NULL DEFAULT 'suspend', -- 'suspend' | 'auto_submit'
  proctor_pin TEXT NOT NULL DEFAULT '123456',
  target_classes_json TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_questions (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS exam_sessions (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress' | 'suspended' | 'submitted' | 'timed_out'
  question_order_json TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  server_end_time TIMESTAMP NOT NULL,
  submitted_at TIMESTAMP,
  last_saved_at TIMESTAMP NOT NULL DEFAULT NOW(),
  violation_count INTEGER NOT NULL DEFAULT 0,
  auto_score INTEGER NOT NULL DEFAULT 0,
  essay_score INTEGER NOT NULL DEFAULT 0,
  max_possible_score INTEGER NOT NULL DEFAULT 100,
  final_score INTEGER NOT NULL DEFAULT 0,
  essay_graded BOOLEAN NOT NULL DEFAULT FALSE,
  teacher_notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS student_answers (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL DEFAULT '',
  is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  auto_points INTEGER NOT NULL DEFAULT 0,
  manual_points INTEGER NOT NULL DEFAULT 0,
  is_correct BOOLEAN,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS violation_logs (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  violation_type TEXT NOT NULL,
  description TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW()
);
