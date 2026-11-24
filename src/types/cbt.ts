export type UserRole = 'super_admin' | 'guru' | 'siswa';

export interface AuthUser {
  id: number;
  uid: string;
  username: string;
  name: string;
  email: string | null;
  role: UserRole;
  className: string;
}

export type QuestionType = 'pg' | 'isian' | 'benar_salah' | 'uraian';

export interface QuestionOption {
  key: string;
  text: string;
}

export interface QuestionItem {
  id: number;
  teacherId?: number;
  teacherName?: string;
  teacherUsername?: string;
  subject: string;
  type: QuestionType;
  prompt: string;
  imageData?: string | null;
  options: QuestionOption[];
  correctAnswer: string;
  points: number;
  difficulty: 'mudah' | 'sedang' | 'sulit';
  createdAt: string;
}

export interface ExamItem {
  id: number;
  teacherId?: number;
  teacherName?: string;
  teacherUsername?: string;
  title: string;
  subject: string;
  examCode: string;
  description: string;
  durationMinutes: number;
  startTime: string;
  endTime: string;
  questionCount: number;
  kkm: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  allowStudentViewResult: boolean;
  isPublished: boolean;
  requireFullscreen: boolean;
  detectTabSwitch: boolean;
  detectWindowBlur: boolean;
  blockCopyPaste: boolean;
  maxViolations: number;
  violationAction: 'suspend' | 'auto_submit';
  proctorPin: string;
  targetClasses: string[];
  questionIds: number[];
  sessionStats?: {
    total: number;
    inProgress: number;
    suspended: number;
    completed: number;
  };
}

export interface TeacherAccount {
  id: number;
  username: string;
  name: string;
  email: string | null;
  className: string;
  questionCount: number;
  examCount: number;
  createdAt: string;
}

export interface StudentAccount {
  id: number;
  username: string;
  name: string;
  email: string | null;
  className: string;
  accessPin?: string | null;
  createdAt: string;
}

export interface ResultSessionRow {
  id: number;
  examId: number;
  studentId: number;
  status: 'in_progress' | 'suspended' | 'submitted' | 'timed_out';
  startedAt: string;
  serverEndTime: string;
  submittedAt: string | null;
  violationCount: number;
  autoScore: number;
  essayScore: number;
  maxPossibleScore: number;
  finalScore: number;
  essayGraded: boolean;
  teacherNotes: string;
  durationSeconds: number;
  studentName: string;
  studentUsername: string;
  studentClass: string;
  examTitle: string;
  examCode: string;
  kkm: number;
  passedKkm: boolean;
}

export interface ViolationLogRow {
  id: number;
  sessionId: number;
  examId: number;
  studentId: number;
  violationType: string;
  description: string;
  actionTaken: string;
  occurredAt: string;
  studentName?: string;
  studentUsername?: string;
  studentClass?: string;
  examTitle?: string;
  examCode?: string;
}

export interface StudentExamQuestion {
  id: number;
  subject: string;
  type: QuestionType;
  prompt: string;
  imageData?: string | null;
  points: number;
  options: QuestionOption[];
}

export interface StudentAnswerDraft {
  questionId: number;
  answerText: string;
  isFlagged: boolean;
}

export interface ExamLookupResponse {
  exam: {
    id: number;
    title: string;
    subject: string;
    examCode: string;
    description: string;
    durationMinutes: number;
    startTime: string;
    endTime: string;
    questionCount: number;
    kkm: number;
    allowStudentViewResult: boolean;
    requireFullscreen: boolean;
    detectTabSwitch: boolean;
    detectWindowBlur: boolean;
    blockCopyPaste: boolean;
    maxViolations: number;
    violationAction: 'suspend' | 'auto_submit';
    targetClasses: string[];
  };
  availability: 'before_schedule' | 'after_schedule' | 'open';
  serverNow: string;
  existingSession: {
    id: number;
    status: 'in_progress' | 'suspended' | 'submitted' | 'timed_out';
    startedAt: string;
    serverEndTime: string;
    submittedAt: string | null;
    violationCount: number;
    finalScore: number | null;
    essayGraded: boolean;
  } | null;
}

export interface SchoolSettings {
  id: number;
  schoolName: string;
  examTheme: string;
  academicYear: string;
  footerText: string;
  updatedAt: string;
}

export interface PublicPortalInfo {
  schoolName: string;
  examTheme: string;
  academicYear: string;
  footerText: string;
  serverTime: string;
  stats: {
    studentCount: number;
    classCount: number;
    examCount: number;
    completedSessionCount: number;
  };
}
