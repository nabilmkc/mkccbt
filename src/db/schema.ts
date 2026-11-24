import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  username: text('username').notNull().unique(),
  name: text('name').notNull(),
  email: text('email'),
  role: text('role').notNull().default('siswa'), // 'guru' | 'siswa'
  className: text('class_name').notNull().default(''),
  passwordHash: text('password_hash'),
  accessPin: text('access_pin'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const schoolSettings = pgTable('school_settings', {
  id: serial('id').primaryKey(),
  schoolName: text('school_name').notNull().default('SDN 09 SADANIANG'),
  examTheme: text('exam_theme').notNull().default('Tes Akhir Semester'),
  academicYear: text('academic_year').notNull().default('Tahun Pelajaran 2026/2027'),
  footerText: text('footer_text').notNull().default('© Fikrul MKC · MKC CBT'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const questions = pgTable('questions', {
  id: serial('id').primaryKey(),
  teacherId: integer('teacher_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  subject: text('subject').notNull(),
  type: text('type').notNull(), // 'pg' | 'isian' | 'benar_salah' | 'uraian'
  prompt: text('prompt').notNull(),
  imageData: text('image_data'),
  optionsJson: text('options_json'),
  correctAnswer: text('correct_answer').notNull(),
  points: integer('points').notNull().default(10),
  difficulty: text('difficulty').notNull().default('sedang'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const exams = pgTable('exams', {
  id: serial('id').primaryKey(),
  teacherId: integer('teacher_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  subject: text('subject').notNull(),
  examCode: text('exam_code').notNull().unique(),
  description: text('description').notNull().default(''),
  durationMinutes: integer('duration_minutes').notNull().default(60),
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time').notNull(),
  questionCount: integer('question_count').notNull().default(10),
  kkm: integer('kkm').notNull().default(75),
  shuffleQuestions: boolean('shuffle_questions').notNull().default(true),
  shuffleOptions: boolean('shuffle_options').notNull().default(true),
  allowStudentViewResult: boolean('allow_student_view_result').notNull().default(false),
  isPublished: boolean('is_published').notNull().default(true),
  requireFullscreen: boolean('require_fullscreen').notNull().default(true),
  detectTabSwitch: boolean('detect_tab_switch').notNull().default(true),
  detectWindowBlur: boolean('detect_window_blur').notNull().default(true),
  blockCopyPaste: boolean('block_copy_paste').notNull().default(true),
  maxViolations: integer('max_violations').notNull().default(3),
  violationAction: text('violation_action').notNull().default('suspend'), // 'suspend' | 'auto_submit'
  proctorPin: text('proctor_pin').notNull().default('123456'),
  targetClassesJson: text('target_classes_json').notNull().default('[]'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const examQuestions = pgTable('exam_questions', {
  id: serial('id').primaryKey(),
  examId: integer('exam_id')
    .references(() => exams.id, { onDelete: 'cascade' })
    .notNull(),
  questionId: integer('question_id')
    .references(() => questions.id, { onDelete: 'cascade' })
    .notNull(),
  orderIndex: integer('order_index').notNull().default(0),
});

export const examSessions = pgTable('exam_sessions', {
  id: serial('id').primaryKey(),
  examId: integer('exam_id')
    .references(() => exams.id, { onDelete: 'cascade' })
    .notNull(),
  studentId: integer('student_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  status: text('status').notNull().default('in_progress'), // 'in_progress' | 'suspended' | 'submitted' | 'timed_out'
  questionOrderJson: text('question_order_json').notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  serverEndTime: timestamp('server_end_time').notNull(),
  submittedAt: timestamp('submitted_at'),
  lastSavedAt: timestamp('last_saved_at').defaultNow().notNull(),
  violationCount: integer('violation_count').notNull().default(0),
  autoScore: integer('auto_score').notNull().default(0),
  essayScore: integer('essay_score').notNull().default(0),
  maxPossibleScore: integer('max_possible_score').notNull().default(100),
  finalScore: integer('final_score').notNull().default(0),
  essayGraded: boolean('essay_graded').notNull().default(false),
  teacherNotes: text('teacher_notes').notNull().default(''),
});

export const studentAnswers = pgTable('student_answers', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id')
    .references(() => examSessions.id, { onDelete: 'cascade' })
    .notNull(),
  questionId: integer('question_id')
    .references(() => questions.id, { onDelete: 'cascade' })
    .notNull(),
  answerText: text('answer_text').notNull().default(''),
  isFlagged: boolean('is_flagged').notNull().default(false),
  autoPoints: integer('auto_points').notNull().default(0),
  manualPoints: integer('manual_points').notNull().default(0),
  isCorrect: boolean('is_correct'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const violationLogs = pgTable('violation_logs', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id')
    .references(() => examSessions.id, { onDelete: 'cascade' })
    .notNull(),
  examId: integer('exam_id')
    .references(() => exams.id, { onDelete: 'cascade' })
    .notNull(),
  studentId: integer('student_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  violationType: text('violation_type').notNull(),
  description: text('description').notNull(),
  actionTaken: text('action_taken').notNull(),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  questions: many(questions),
  exams: many(exams),
  sessions: many(examSessions),
  violations: many(violationLogs),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  teacher: one(users, {
    fields: [questions.teacherId],
    references: [users.id],
  }),
  examLinks: many(examQuestions),
  answers: many(studentAnswers),
}));

export const examsRelations = relations(exams, ({ one, many }) => ({
  teacher: one(users, {
    fields: [exams.teacherId],
    references: [users.id],
  }),
  examQuestions: many(examQuestions),
  sessions: many(examSessions),
  violations: many(violationLogs),
}));

export const examQuestionsRelations = relations(examQuestions, ({ one }) => ({
  exam: one(exams, {
    fields: [examQuestions.examId],
    references: [exams.id],
  }),
  question: one(questions, {
    fields: [examQuestions.questionId],
    references: [questions.id],
  }),
}));

export const examSessionsRelations = relations(examSessions, ({ one, many }) => ({
  exam: one(exams, {
    fields: [examSessions.examId],
    references: [exams.id],
  }),
  student: one(users, {
    fields: [examSessions.studentId],
    references: [users.id],
  }),
  answers: many(studentAnswers),
  violations: many(violationLogs),
}));

export const studentAnswersRelations = relations(studentAnswers, ({ one }) => ({
  session: one(examSessions, {
    fields: [studentAnswers.sessionId],
    references: [examSessions.id],
  }),
  question: one(questions, {
    fields: [studentAnswers.questionId],
    references: [questions.id],
  }),
}));

export const violationLogsRelations = relations(violationLogs, ({ one }) => ({
  session: one(examSessions, {
    fields: [violationLogs.sessionId],
    references: [examSessions.id],
  }),
  exam: one(exams, {
    fields: [violationLogs.examId],
    references: [exams.id],
  }),
  student: one(users, {
    fields: [violationLogs.studentId],
    references: [users.id],
  }),
}));
