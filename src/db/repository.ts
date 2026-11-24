import bcrypt from 'bcryptjs';
import {
  getStore,
  nextId,
  saveStore,
  StoredExamSession,
} from './localStore.ts';

export interface QuestionOption {
  key: string;
  text: string;
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function parseOptions(optionsJson: string | null): QuestionOption[] {
  if (!optionsJson) return [];
  try {
    const parsed = JSON.parse(optionsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseTargetClasses(targetClassesJson: string | null | undefined): string[] {
  if (!targetClassesJson) return [];
  try {
    const parsed = JSON.parse(targetClassesJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((c) => String(c || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isStudentClassEligible(
  studentClass: string | null | undefined,
  targetClasses: string[]
): boolean {
  if (!targetClasses || targetClasses.length === 0) return true;
  const normalizedStudent = (studentClass || '').trim().toLowerCase();
  if (!normalizedStudent) return false;
  return targetClasses.some(
    (cls) => cls.trim().toLowerCase() === normalizedStudent
  );
}

export async function getUserById(id: number) {
  const store = getStore();
  return store.users.find((u) => u.id === id) || null;
}

export async function getUserByUsername(username: string) {
  const store = getStore();
  const target = username.toLowerCase();
  return store.users.find((u) => u.username === target) || null;
}

export async function updateSuperAdminCredentials(input: {
  userId: number;
  username: string;
  name?: string;
  currentPassword?: string;
  newPassword?: string;
}) {
  const store = getStore();
  const user = store.users.find(
    (u) => u.id === input.userId && u.role === 'super_admin'
  );
  if (!user) {
    throw new Error('Akun Super Admin tidak ditemukan.');
  }

  if (user.passwordHash) {
    if (!input.currentPassword) {
      throw new Error('Kata sandi saat ini wajib diisi untuk menyimpan perubahan.');
    }
    const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!valid) {
      throw new Error('Kata sandi saat ini tidak cocok.');
    }
  }

  const cleanUsername = input.username.toLowerCase().trim();
  const duplicate = store.users.find(
    (u) => u.id !== user.id && u.username.toLowerCase() === cleanUsername
  );
  if (duplicate) {
    throw new Error('Username sudah digunakan oleh akun lain.');
  }

  user.username = cleanUsername;
  if (input.name && input.name.trim()) {
    user.name = input.name.trim();
  }
  if (input.newPassword && input.newPassword.length > 0) {
    user.passwordHash = await bcrypt.hash(input.newPassword, 10);
  }

  await saveStore();

  return {
    id: user.id,
    uid: user.uid,
    username: user.username,
    name: user.name,
    email: user.email,
    role: 'super_admin' as const,
    className: user.className,
  };
}

export async function getOrCreateFirebaseUser(
  uid: string,
  email: string,
  name: string,
  defaultRole: 'super_admin' | 'guru' | 'siswa' = 'guru'
) {
  const store = getStore();
  const existing = store.users.find((u) => u.uid === uid);
  if (existing) {
    existing.email = email;
    existing.name = name;
    if (defaultRole === 'super_admin') {
      existing.role = 'super_admin';
    }
    await saveStore();
    return existing;
  }

  const baseUsername = (email.split('@')[0] || uid.slice(0, 8))
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
  const uniqueUsername = `${baseUsername}_${uid.slice(0, 5).toLowerCase()}`;

  const created = {
    id: nextId('users'),
    uid,
    username: uniqueUsername,
    name,
    email,
    role: defaultRole,
    className:
      defaultRole === 'super_admin'
        ? 'Administrator Sistem'
        : defaultRole === 'guru'
        ? 'Pengajar'
        : 'Umum',
    passwordHash: null,
    accessPin: null,
    createdAt: new Date(),
  };
  store.users.push(created);
  await saveStore();
  return created;
}

export async function listStudents() {
  const store = getStore();
  return store.users
    .filter((u) => u.role === 'siswa')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      email: u.email,
      className: u.className,
      accessPin: u.accessPin,
      createdAt: u.createdAt,
    }));
}

export async function listStudentClasses(): Promise<string[]> {
  const store = getStore();
  const unique = new Set<string>();
  for (const r of store.users) {
    if (r.role === 'siswa') {
      const clean = (r.className || '').trim();
      if (clean) unique.add(clean);
    }
  }
  return Array.from(unique).sort((a, b) => a.localeCompare(b, 'id'));
}

export async function createStudentAccount(input: {
  username: string;
  name: string;
  className: string;
  pin: string;
}) {
  const store = getStore();
  const cleanUsername = input.username.toLowerCase().trim();
  const existing = store.users.find((u) => u.username === cleanUsername);
  if (existing) {
    throw new Error('Username/NIS sudah terdaftar.');
  }
  const pinHash = await bcrypt.hash(input.pin, 10);
  const created = {
    id: nextId('users'),
    uid: `local:siswa:${cleanUsername}:${Date.now()}`,
    username: cleanUsername,
    name: input.name.trim(),
    email: null,
    role: 'siswa',
    className: input.className.trim() || 'Umum',
    passwordHash: pinHash,
    accessPin: input.pin,
    createdAt: new Date(),
  };
  store.users.push(created);
  await saveStore();
  return {
    id: created.id,
    username: created.username,
    name: created.name,
    email: created.email,
    className: created.className,
    accessPin: created.accessPin,
    createdAt: created.createdAt,
  };
}

export async function importStudentAccountsBatch(
  items: Array<{
    username: string;
    name: string;
    className: string;
    pin: string;
  }>
) {
  if (items.length === 0) {
    return { importedCount: 0, skippedUsernames: [] as string[], students: [] };
  }
  const store = getStore();
  const existingSet = new Set(
    store.users.map((r) => r.username.toLowerCase().trim())
  );

  const toInsert: Array<{
    username: string;
    name: string;
    className: string;
    pin: string;
  }> = [];
  const skippedUsernames: string[] = [];

  for (const item of items) {
    const cleanU = item.username.toLowerCase().trim();
    if (existingSet.has(cleanU)) {
      skippedUsernames.push(cleanU);
      continue;
    }
    existingSet.add(cleanU);
    toInsert.push({ ...item, username: cleanU });
  }

  if (toInsert.length === 0) {
    return {
      importedCount: 0,
      skippedUsernames,
      students: [],
    };
  }

  const now = new Date();
  const inserted = await Promise.all(
    toInsert.map(async (item, idx) => ({
      id: nextId('users'),
      uid: `local:siswa:${item.username}:${Date.now()}-${idx}`,
      username: item.username,
      name: item.name.trim(),
      email: null as string | null,
      role: 'siswa',
      className: item.className.trim() || 'Umum',
      passwordHash: await bcrypt.hash(item.pin, 8),
      accessPin: item.pin,
      createdAt: now,
    }))
  );

  store.users.push(...inserted);
  await saveStore();

  return {
    importedCount: inserted.length,
    skippedUsernames,
    students: inserted.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      email: u.email,
      className: u.className,
      accessPin: u.accessPin,
      createdAt: u.createdAt,
    })),
  };
}

export async function deleteStudentAccount(studentId: number) {
  const store = getStore();
  store.users = store.users.filter(
    (u) => !(u.id === studentId && u.role === 'siswa')
  );
  const removedSessionIds = new Set(
    store.examSessions.filter((s) => s.studentId === studentId).map((s) => s.id)
  );
  store.examSessions = store.examSessions.filter((s) => s.studentId !== studentId);
  store.studentAnswers = store.studentAnswers.filter(
    (a) => !removedSessionIds.has(a.sessionId)
  );
  store.violationLogs = store.violationLogs.filter((v) => v.studentId !== studentId);
  await saveStore();
}

export async function listTeachers() {
  const store = getStore();
  const teacherRows = store.users
    .filter((u) => u.role === 'guru')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return teacherRows.map((t) => ({
    id: t.id,
    username: t.username,
    name: t.name,
    email: t.email,
    className: t.className,
    createdAt: t.createdAt,
    questionCount: store.questions.filter((q) => q.teacherId === t.id).length,
    examCount: store.exams.filter((e) => e.teacherId === t.id).length,
  }));
}

export async function createTeacherAccount(input: {
  username: string;
  name: string;
  email?: string | null;
  className: string;
  password: string;
}) {
  const store = getStore();
  const cleanUsername = input.username.toLowerCase().trim();
  if (store.users.some((u) => u.username === cleanUsername)) {
    throw new Error('Username guru sudah digunakan oleh akun lain.');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const created = {
    id: nextId('users'),
    uid: `local:guru:${cleanUsername}:${Date.now()}`,
    username: cleanUsername,
    name: input.name.trim(),
    email: input.email?.trim() || null,
    role: 'guru',
    className: input.className.trim() || 'Guru Mata Pelajaran',
    passwordHash,
    accessPin: null,
    createdAt: new Date(),
  };
  store.users.push(created);
  await saveStore();

  return {
    id: created.id,
    username: created.username,
    name: created.name,
    email: created.email,
    className: created.className,
    createdAt: created.createdAt,
    questionCount: 0,
    examCount: 0,
  };
}

export async function deleteTeacherAccount(teacherId: number) {
  const store = getStore();
  const idx = store.users.findIndex((u) => u.id === teacherId && u.role === 'guru');
  if (idx === -1) {
    throw new Error('Akun guru tidak ditemukan.');
  }
  store.users.splice(idx, 1);
  await saveStore();
}

export async function listTeacherQuestions(teacherId: number, isSuperAdmin = false) {
  const store = getStore();
  const rows = (
    isSuperAdmin
      ? store.questions
      : store.questions.filter((q) => q.teacherId === teacherId)
  ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const creatorMap = new Map(store.users.map((u) => [u.id, u]));

  return rows.map((q) => {
    const creator = creatorMap.get(q.teacherId);
    return {
      ...q,
      teacherName: creator?.name || 'Guru',
      teacherUsername: creator?.username || '-',
      options: parseOptions(q.optionsJson),
    };
  });
}

export async function createQuestion(
  teacherId: number,
  input: {
    subject: string;
    type: 'pg' | 'isian' | 'benar_salah' | 'uraian';
    prompt: string;
    imageData?: string | null;
    options?: QuestionOption[];
    correctAnswer: string;
    points: number;
    difficulty: string;
  }
) {
  const store = getStore();
  const now = new Date();
  const created = {
    id: nextId('questions'),
    teacherId,
    subject: input.subject,
    type: input.type,
    prompt: input.prompt,
    imageData: input.imageData || null,
    optionsJson:
      input.type === 'pg' && input.options ? JSON.stringify(input.options) : null,
    correctAnswer: input.correctAnswer,
    points: input.points,
    difficulty: input.difficulty,
    createdAt: now,
    updatedAt: now,
  };
  store.questions.push(created);
  await saveStore();

  return {
    ...created,
    options: parseOptions(created.optionsJson),
  };
}

export async function createQuestionsBatch(
  teacherId: number,
  items: Array<{
    subject: string;
    type: 'pg' | 'isian' | 'benar_salah' | 'uraian';
    prompt: string;
    imageData?: string | null;
    options?: QuestionOption[];
    correctAnswer: string;
    points: number;
    difficulty: string;
  }>
) {
  if (items.length === 0) return [];
  const store = getStore();
  const now = new Date();

  const inserted = items.map((input) => ({
    id: nextId('questions'),
    teacherId,
    subject: input.subject,
    type: input.type,
    prompt: input.prompt,
    imageData: input.imageData || null,
    optionsJson:
      input.type === 'pg' && input.options ? JSON.stringify(input.options) : null,
    correctAnswer: input.correctAnswer,
    points: input.points,
    difficulty: input.difficulty,
    createdAt: now,
    updatedAt: now,
  }));

  store.questions.push(...inserted);
  await saveStore();

  return inserted.map((created) => ({
    ...created,
    options: parseOptions(created.optionsJson),
  }));
}

export async function updateQuestion(
  teacherId: number,
  questionId: number,
  input: {
    subject: string;
    type: 'pg' | 'isian' | 'benar_salah' | 'uraian';
    prompt: string;
    imageData?: string | null;
    options?: QuestionOption[];
    correctAnswer: string;
    points: number;
    difficulty: string;
  },
  isSuperAdmin = false
) {
  const store = getStore();
  const target = store.questions.find(
    (q) => q.id === questionId && (isSuperAdmin || q.teacherId === teacherId)
  );
  if (!target) {
    throw new Error('Soal tidak ditemukan atau Anda tidak memiliki akses.');
  }

  target.subject = input.subject;
  target.type = input.type;
  target.prompt = input.prompt;
  target.imageData = input.imageData ?? null;
  target.optionsJson =
    input.type === 'pg' && input.options ? JSON.stringify(input.options) : null;
  target.correctAnswer = input.correctAnswer;
  target.points = input.points;
  target.difficulty = input.difficulty;
  target.updatedAt = new Date();

  await saveStore();

  return {
    ...target,
    options: parseOptions(target.optionsJson),
  };
}

export async function deleteQuestion(
  teacherId: number,
  questionId: number,
  isSuperAdmin = false
) {
  const store = getStore();
  const target = store.questions.find(
    (q) => q.id === questionId && (isSuperAdmin || q.teacherId === teacherId)
  );
  if (!target) return;
  store.questions = store.questions.filter((q) => q.id !== questionId);
  store.examQuestions = store.examQuestions.filter(
    (eq) => eq.questionId !== questionId
  );
  await saveStore();
}

export async function listTeacherExams(teacherId: number, isSuperAdmin = false) {
  const store = getStore();
  const examRows = (
    isSuperAdmin
      ? store.exams
      : store.exams.filter((e) => e.teacherId === teacherId)
  ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const creatorMap = new Map(store.users.map((u) => [u.id, u]));

  return examRows.map((e) => {
    const qIds = store.examQuestions
      .filter((l) => l.examId === e.id)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((l) => l.questionId);
    const examSess = store.examSessions.filter((s) => s.examId === e.id);
    const creator = creatorMap.get(e.teacherId);
    return {
      ...e,
      teacherName: creator?.name || 'Guru',
      teacherUsername: creator?.username || '-',
      targetClasses: parseTargetClasses(e.targetClassesJson),
      questionIds: qIds,
      sessionStats: {
        total: examSess.length,
        inProgress: examSess.filter((s) => s.status === 'in_progress').length,
        suspended: examSess.filter((s) => s.status === 'suspended').length,
        completed: examSess.filter(
          (s) => s.status === 'submitted' || s.status === 'timed_out'
        ).length,
      },
    };
  });
}

export async function createExam(
  teacherId: number,
  input: {
    title: string;
    subject: string;
    examCode: string;
    description: string;
    durationMinutes: number;
    startTime: Date;
    endTime: Date;
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
  }
) {
  const store = getStore();
  if (store.exams.some((e) => e.examCode === input.examCode)) {
    throw new Error('Kode ujian sudah digunakan. Gunakan kode unik lain.');
  }

  const cleanTargetClasses = Array.from(
    new Set(input.targetClasses.map((c) => c.trim()).filter(Boolean))
  );

  const created = {
    id: nextId('exams'),
    teacherId,
    title: input.title,
    subject: input.subject,
    examCode: input.examCode,
    description: input.description,
    durationMinutes: input.durationMinutes,
    startTime: input.startTime,
    endTime: input.endTime,
    questionCount: input.questionCount,
    kkm: input.kkm,
    shuffleQuestions: input.shuffleQuestions,
    shuffleOptions: input.shuffleOptions,
    allowStudentViewResult: input.allowStudentViewResult,
    isPublished: input.isPublished,
    requireFullscreen: input.requireFullscreen,
    detectTabSwitch: input.detectTabSwitch,
    detectWindowBlur: input.detectWindowBlur,
    blockCopyPaste: input.blockCopyPaste,
    maxViolations: input.maxViolations,
    violationAction: input.violationAction,
    proctorPin: input.proctorPin,
    targetClassesJson: JSON.stringify(cleanTargetClasses),
    createdAt: new Date(),
  };

  store.exams.push(created);

  input.questionIds.forEach((qId, idx) => {
    store.examQuestions.push({
      id: nextId('examQuestions'),
      examId: created.id,
      questionId: qId,
      orderIndex: idx,
    });
  });

  await saveStore();

  return {
    ...created,
    targetClasses: cleanTargetClasses,
    questionIds: input.questionIds,
  };
}

export async function updateExam(
  teacherId: number,
  examId: number,
  input: {
    title: string;
    subject: string;
    examCode: string;
    description: string;
    durationMinutes: number;
    startTime: Date;
    endTime: Date;
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
  },
  isSuperAdmin = false
) {
  const store = getStore();
  const conflict = store.exams.find(
    (e) => e.examCode === input.examCode && e.id !== examId
  );
  if (conflict) {
    throw new Error('Kode ujian sudah digunakan oleh ujian lain.');
  }

  const target = store.exams.find(
    (e) => e.id === examId && (isSuperAdmin || e.teacherId === teacherId)
  );
  if (!target) {
    throw new Error('Ujian tidak ditemukan atau Anda tidak memiliki akses.');
  }

  const cleanTargetClasses = Array.from(
    new Set(input.targetClasses.map((c) => c.trim()).filter(Boolean))
  );

  target.title = input.title;
  target.subject = input.subject;
  target.examCode = input.examCode;
  target.description = input.description;
  target.durationMinutes = input.durationMinutes;
  target.startTime = input.startTime;
  target.endTime = input.endTime;
  target.questionCount = input.questionCount;
  target.kkm = input.kkm;
  target.shuffleQuestions = input.shuffleQuestions;
  target.shuffleOptions = input.shuffleOptions;
  target.allowStudentViewResult = input.allowStudentViewResult;
  target.isPublished = input.isPublished;
  target.requireFullscreen = input.requireFullscreen;
  target.detectTabSwitch = input.detectTabSwitch;
  target.detectWindowBlur = input.detectWindowBlur;
  target.blockCopyPaste = input.blockCopyPaste;
  target.maxViolations = input.maxViolations;
  target.violationAction = input.violationAction;
  target.proctorPin = input.proctorPin;
  target.targetClassesJson = JSON.stringify(cleanTargetClasses);

  store.examQuestions = store.examQuestions.filter((l) => l.examId !== examId);
  input.questionIds.forEach((qId, idx) => {
    store.examQuestions.push({
      id: nextId('examQuestions'),
      examId,
      questionId: qId,
      orderIndex: idx,
    });
  });

  await saveStore();

  return {
    ...target,
    targetClasses: cleanTargetClasses,
    questionIds: input.questionIds,
  };
}

export async function deleteExam(
  teacherId: number,
  examId: number,
  isSuperAdmin = false
) {
  const store = getStore();
  const target = store.exams.find(
    (e) => e.id === examId && (isSuperAdmin || e.teacherId === teacherId)
  );
  if (!target) return;

  store.exams = store.exams.filter((e) => e.id !== examId);
  store.examQuestions = store.examQuestions.filter((l) => l.examId !== examId);
  const removedSessionIds = new Set(
    store.examSessions.filter((s) => s.examId === examId).map((s) => s.id)
  );
  store.examSessions = store.examSessions.filter((s) => s.examId !== examId);
  store.studentAnswers = store.studentAnswers.filter(
    (a) => !removedSessionIds.has(a.sessionId)
  );
  store.violationLogs = store.violationLogs.filter((v) => v.examId !== examId);
  await saveStore();
}

export async function lookupExamByCodeForStudent(examCode: string, studentId: number) {
  const store = getStore();
  const exam = store.exams.find((e) => e.examCode === examCode);
  if (!exam || !exam.isPublished) {
    throw new Error('Kode ujian tidak ditemukan atau belum dipublikasikan oleh guru.');
  }

  const targetClasses = parseTargetClasses(exam.targetClassesJson);
  if (targetClasses.length > 0) {
    const student = store.users.find((u) => u.id === studentId);
    if (!isStudentClassEligible(student?.className, targetClasses)) {
      throw new Error(
        `Ujian ini khusus untuk kelas: ${targetClasses.join(', ')}. Kelas Anda (${
          student?.className || 'Belum diatur'
        }) tidak terdaftar untuk mengikuti ujian ini.`
      );
    }
  }

  const linkedQuestions = store.examQuestions.filter((l) => l.examId === exam.id);
  const existingSessions = store.examSessions
    .filter((s) => s.examId === exam.id && s.studentId === studentId)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  let existingSession = existingSessions[0] || null;
  const now = new Date();

  if (
    existingSession &&
    existingSession.status === 'in_progress' &&
    now >= existingSession.serverEndTime
  ) {
    existingSession = await finalizeAndGradeSession(existingSession.id, 'timed_out');
  }

  let availability: 'before_schedule' | 'after_schedule' | 'open' = 'open';
  if (now < exam.startTime) availability = 'before_schedule';
  else if (now > exam.endTime) availability = 'after_schedule';

  const effectiveCount =
    linkedQuestions.length > 0
      ? Math.min(exam.questionCount, linkedQuestions.length)
      : exam.questionCount;

  return {
    exam: {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      examCode: exam.examCode,
      description: exam.description,
      durationMinutes: exam.durationMinutes,
      startTime: exam.startTime,
      endTime: exam.endTime,
      questionCount: effectiveCount,
      kkm: exam.kkm,
      allowStudentViewResult: exam.allowStudentViewResult,
      requireFullscreen: exam.requireFullscreen,
      detectTabSwitch: exam.detectTabSwitch,
      detectWindowBlur: exam.detectWindowBlur,
      blockCopyPaste: exam.blockCopyPaste,
      maxViolations: exam.maxViolations,
      violationAction: exam.violationAction,
      targetClasses,
    },
    availability,
    serverNow: now.toISOString(),
    existingSession: existingSession
      ? {
          id: existingSession.id,
          status: existingSession.status,
          startedAt: existingSession.startedAt,
          serverEndTime: existingSession.serverEndTime,
          submittedAt: existingSession.submittedAt,
          violationCount: existingSession.violationCount,
          finalScore: exam.allowStudentViewResult ? existingSession.finalScore : null,
          essayGraded: existingSession.essayGraded,
        }
      : null,
  };
}

export async function startOrResumeStudentSession(examId: number, studentId: number) {
  const store = getStore();
  const exam = store.exams.find((e) => e.id === examId);
  if (!exam || !exam.isPublished) {
    throw new Error('Ujian tidak tersedia.');
  }

  const targetClasses = parseTargetClasses(exam.targetClassesJson);
  if (targetClasses.length > 0) {
    const student = store.users.find((u) => u.id === studentId);
    if (!isStudentClassEligible(student?.className, targetClasses)) {
      throw new Error(
        `Ujian ini khusus untuk kelas: ${targetClasses.join(', ')}. Kelas Anda (${
          student?.className || 'Belum diatur'
        }) tidak diizinkan mengakses ujian ini.`
      );
    }
  }

  const now = new Date();
  if (now < exam.startTime) {
    throw new Error('Ujian belum dapat dibuka sebelum jadwal dimulai.');
  }

  const existingRows = store.examSessions
    .filter((s) => s.examId === examId && s.studentId === studentId)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  let session: StoredExamSession | undefined = existingRows[0];

  if (!session) {
    if (now > exam.endTime) {
      throw new Error('Jadwal ujian telah berakhir.');
    }

    const links = store.examQuestions.filter((l) => l.examId === examId);
    let candidateIds = links
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((l) => l.questionId);

    if (candidateIds.length === 0) {
      candidateIds = store.questions
        .filter((q) => q.teacherId === exam.teacherId)
        .map((q) => q.id);
    }

    if (candidateIds.length === 0) {
      throw new Error('Ujian belum memiliki butir soal. Hubungi guru pengampu.');
    }

    if (exam.shuffleQuestions) {
      candidateIds = shuffleArray(candidateIds);
    }
    const selectedIds = candidateIds.slice(0, Math.max(1, exam.questionCount));
    const selectedQs = store.questions.filter((q) => selectedIds.includes(q.id));
    const maxPossibleScore = selectedQs.reduce((sum, q) => sum + q.points, 0);
    const durationEnd = new Date(now.getTime() + exam.durationMinutes * 60 * 1000);
    const serverEndTime = durationEnd < exam.endTime ? durationEnd : exam.endTime;

    session = {
      id: nextId('examSessions'),
      examId: exam.id,
      studentId,
      status: 'in_progress',
      questionOrderJson: JSON.stringify(selectedIds),
      startedAt: now,
      serverEndTime,
      submittedAt: null,
      lastSavedAt: now,
      violationCount: 0,
      autoScore: 0,
      essayScore: 0,
      maxPossibleScore,
      finalScore: 0,
      essayGraded: false,
      teacherNotes: '',
    };
    store.examSessions.push(session);
    await saveStore();
  } else if (session.status === 'in_progress' && now >= session.serverEndTime) {
    session = await finalizeAndGradeSession(session.id, 'timed_out');
  }

  const questionOrder: number[] = JSON.parse(session.questionOrderJson);
  const questionMap = new Map(store.questions.map((q) => [q.id, q]));
  const orderedQuestions = questionOrder
    .map((id) => questionMap.get(id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .map((q) => {
      let options = parseOptions(q.optionsJson);
      if (exam.shuffleOptions && options.length > 0) {
        options = shuffleArray(options);
      }
      return {
        id: q.id,
        subject: q.subject,
        type: q.type,
        prompt: q.prompt,
        imageData: q.imageData || null,
        points: q.points,
        options,
      };
    });

  const savedAnswers = store.studentAnswers.filter((a) => a.sessionId === session!.id);

  return {
    session: {
      id: session.id,
      examId: session.examId,
      status: session.status,
      startedAt: session.startedAt,
      serverEndTime: session.serverEndTime,
      submittedAt: session.submittedAt,
      lastSavedAt: session.lastSavedAt,
      violationCount: session.violationCount,
      finalScore: exam.allowStudentViewResult ? session.finalScore : null,
      essayGraded: session.essayGraded,
    },
    examConfig: {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      examCode: exam.examCode,
      kkm: exam.kkm,
      allowStudentViewResult: exam.allowStudentViewResult,
      requireFullscreen: exam.requireFullscreen,
      detectTabSwitch: exam.detectTabSwitch,
      detectWindowBlur: exam.detectWindowBlur,
      blockCopyPaste: exam.blockCopyPaste,
      maxViolations: exam.maxViolations,
      violationAction: exam.violationAction,
    },
    questions: orderedQuestions,
    answers: savedAnswers.map((a) => ({
      questionId: a.questionId,
      answerText: a.answerText,
      isFlagged: a.isFlagged,
      updatedAt: a.updatedAt,
    })),
    serverNow: now.toISOString(),
  };
}

function upsertAnswersBatchSync(
  sessionId: number,
  items: Array<{ questionId: number; answerText: string; isFlagged: boolean }>,
  now: Date
) {
  const store = getStore();
  const existingMap = new Map(
    store.studentAnswers
      .filter((a) => a.sessionId === sessionId)
      .map((a) => [a.questionId, a])
  );

  for (const item of items) {
    const current = existingMap.get(item.questionId);
    if (current) {
      current.answerText = item.answerText;
      current.isFlagged = item.isFlagged;
      current.updatedAt = now;
    } else {
      store.studentAnswers.push({
        id: nextId('studentAnswers'),
        sessionId,
        questionId: item.questionId,
        answerText: item.answerText,
        isFlagged: item.isFlagged,
        autoPoints: 0,
        manualPoints: 0,
        isCorrect: null,
        updatedAt: now,
      });
    }
  }
}

export async function autosaveStudentAnswers(
  sessionId: number,
  studentId: number,
  items: Array<{ questionId: number; answerText: string; isFlagged: boolean }>
) {
  const store = getStore();
  const session = store.examSessions.find(
    (s) => s.id === sessionId && s.studentId === studentId
  );
  if (!session) {
    throw new Error('Sesi ujian tidak ditemukan.');
  }

  const now = new Date();
  if (session.status === 'submitted' || session.status === 'timed_out') {
    return {
      locked: true,
      status: session.status,
      savedAt: session.lastSavedAt,
      serverNow: now.toISOString(),
    };
  }

  if (now >= session.serverEndTime) {
    upsertAnswersBatchSync(session.id, items, now);
    const finalized = await finalizeAndGradeSession(session.id, 'timed_out');
    return {
      locked: true,
      status: finalized.status,
      savedAt: now,
      serverNow: now.toISOString(),
    };
  }

  if (session.status === 'suspended') {
    return {
      locked: true,
      status: 'suspended',
      savedAt: session.lastSavedAt,
      serverNow: now.toISOString(),
    };
  }

  upsertAnswersBatchSync(session.id, items, now);
  session.lastSavedAt = now;
  await saveStore();

  return {
    locked: false,
    status: session.status,
    savedAt: now,
    serverNow: now.toISOString(),
  };
}

export async function recordStudentViolation(
  sessionId: number,
  studentId: number,
  input: {
    violationType: string;
    description: string;
  }
) {
  const store = getStore();
  const session = store.examSessions.find(
    (s) => s.id === sessionId && s.studentId === studentId
  );
  if (!session) {
    throw new Error('Sesi ujian tidak ditemukan.');
  }

  const exam = store.exams.find((e) => e.id === session.examId);
  if (!exam) {
    throw new Error('Data ujian tidak ditemukan.');
  }

  if (session.status === 'submitted' || session.status === 'timed_out') {
    return {
      status: session.status,
      violationCount: session.violationCount,
      maxViolations: exam.maxViolations,
      actionTaken: 'ignored_finished',
    };
  }

  const nextCount = session.violationCount + 1;
  let nextStatus = session.status;
  let actionTaken: 'warning' | 'suspended' | 'auto_submitted' = 'warning';

  if (nextCount >= exam.maxViolations) {
    if (exam.violationAction === 'auto_submit') {
      nextStatus = 'submitted';
      actionTaken = 'auto_submitted';
    } else {
      nextStatus = 'suspended';
      actionTaken = 'suspended';
    }
  }

  store.violationLogs.push({
    id: nextId('violationLogs'),
    sessionId: session.id,
    examId: exam.id,
    studentId,
    violationType: input.violationType,
    description: input.description,
    actionTaken,
    occurredAt: new Date(),
  });

  if (actionTaken === 'auto_submitted') {
    session.violationCount = nextCount;
    await finalizeAndGradeSession(session.id, 'submitted');
  } else {
    session.violationCount = nextCount;
    session.status = nextStatus;
    await saveStore();
  }

  return {
    status: nextStatus,
    violationCount: nextCount,
    maxViolations: exam.maxViolations,
    actionTaken,
  };
}

export async function verifyProctorPinAndUnlock(
  sessionId: number,
  studentId: number,
  pin: string
) {
  const store = getStore();
  const session = store.examSessions.find(
    (s) => s.id === sessionId && s.studentId === studentId
  );
  if (!session) {
    throw new Error('Sesi ujian tidak ditemukan.');
  }

  const exam = store.exams.find((e) => e.id === session.examId);
  if (!exam) {
    throw new Error('Data ujian tidak ditemukan.');
  }

  if (pin.trim() !== exam.proctorPin.trim()) {
    throw new Error('PIN verifikasi guru salah. Minta guru pengawas memasukkan PIN yang benar.');
  }

  const now = new Date();
  if (now >= session.serverEndTime) {
    const finalized = await finalizeAndGradeSession(session.id, 'timed_out');
    return {
      unlocked: false,
      status: finalized.status,
      message:
        'Waktu ujian telah habis saat penangguhan. Jawaban tersimpan telah dikirim otomatis.',
    };
  }

  session.status = 'in_progress';
  store.violationLogs.push({
    id: nextId('violationLogs'),
    sessionId: session.id,
    examId: exam.id,
    studentId,
    violationType: 'proctor_unlock',
    description: 'Penangguhan ujian dibuka oleh verifikasi PIN Guru Pengawas.',
    actionTaken: 'unlocked_by_teacher',
    occurredAt: now,
  });
  await saveStore();

  return {
    unlocked: true,
    status: 'in_progress',
    message: 'Verifikasi guru berhasil. Siswa dapat melanjutkan ujian.',
  };
}

export async function unlockSessionByTeacher(
  teacherId: number,
  sessionId: number,
  isSuperAdmin = false
) {
  const store = getStore();
  const session = store.examSessions.find((s) => s.id === sessionId);
  if (!session) throw new Error('Sesi tidak ditemukan.');

  const exam = store.exams.find(
    (e) => e.id === session.examId && (isSuperAdmin || e.teacherId === teacherId)
  );
  if (!exam) throw new Error('Anda tidak memiliki akses ke ujian ini.');

  const now = new Date();
  if (now >= session.serverEndTime) {
    return await finalizeAndGradeSession(session.id, 'timed_out');
  }

  session.status = 'in_progress';
  store.violationLogs.push({
    id: nextId('violationLogs'),
    sessionId: session.id,
    examId: exam.id,
    studentId: session.studentId,
    violationType: 'proctor_unlock',
    description: 'Penangguhan dibuka langsung melalui Dashboard Guru.',
    actionTaken: 'unlocked_by_teacher',
    occurredAt: now,
  });
  await saveStore();

  return session;
}

export async function finalizeAndGradeSession(
  sessionId: number,
  finalStatus: 'submitted' | 'timed_out'
) {
  const store = getStore();
  const session = store.examSessions.find((s) => s.id === sessionId);
  if (!session) throw new Error('Sesi ujian tidak ditemukan.');

  const questionOrder: number[] = JSON.parse(session.questionOrderJson);
  const questionMap = new Map(store.questions.map((q) => [q.id, q]));
  const answerMap = new Map(
    store.studentAnswers
      .filter((a) => a.sessionId === session.id)
      .map((a) => [a.questionId, a])
  );

  let autoScore = 0;
  let essayScore = 0;
  let maxPossibleScore = 0;
  let hasEssay = false;
  const now = new Date();

  for (const qId of questionOrder) {
    const q = questionMap.get(qId);
    if (!q) continue;
    maxPossibleScore += q.points;

    const ans = answerMap.get(qId);
    const rawAns = ans?.answerText?.trim() || '';

    if (q.type === 'uraian') {
      hasEssay = true;
      essayScore += ans?.manualPoints || 0;
      continue;
    }

    let isCorrect = false;
    if (q.type === 'pg' || q.type === 'benar_salah') {
      isCorrect = rawAns.toUpperCase() === q.correctAnswer.trim().toUpperCase();
    } else if (q.type === 'isian') {
      const accepted = q.correctAnswer
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      isCorrect = rawAns.length > 0 && accepted.includes(rawAns.toLowerCase());
    }

    const pts = isCorrect ? q.points : 0;
    autoScore += pts;

    if (ans) {
      ans.autoPoints = pts;
      ans.isCorrect = isCorrect;
    } else {
      store.studentAnswers.push({
        id: nextId('studentAnswers'),
        sessionId: session.id,
        questionId: qId,
        answerText: '',
        isFlagged: false,
        autoPoints: 0,
        manualPoints: 0,
        isCorrect: false,
        updatedAt: now,
      });
    }
  }

  const finalScore =
    maxPossibleScore > 0
      ? Math.round(((autoScore + essayScore) / maxPossibleScore) * 100)
      : 0;

  session.status = finalStatus;
  session.submittedAt = session.submittedAt || now;
  session.lastSavedAt = now;
  session.autoScore = autoScore;
  session.essayScore = essayScore;
  session.maxPossibleScore = maxPossibleScore;
  session.finalScore = finalScore;
  session.essayGraded = hasEssay ? session.essayGraded : true;

  await saveStore();
  return session;
}

export async function submitStudentExam(
  sessionId: number,
  studentId: number,
  finalAnswers?: Array<{ questionId: number; answerText: string; isFlagged: boolean }>
) {
  const store = getStore();
  const session = store.examSessions.find(
    (s) => s.id === sessionId && s.studentId === studentId
  );
  if (!session) throw new Error('Sesi ujian tidak ditemukan.');

  if (finalAnswers && finalAnswers.length > 0 && session.status === 'in_progress') {
    upsertAnswersBatchSync(session.id, finalAnswers, new Date());
  }

  if (session.status === 'submitted' || session.status === 'timed_out') {
    return await getStudentSessionResult(session.id, studentId);
  }

  const now = new Date();
  const targetStatus = now >= session.serverEndTime ? 'timed_out' : 'submitted';
  await finalizeAndGradeSession(session.id, targetStatus);
  return await getStudentSessionResult(session.id, studentId);
}

export async function getStudentSessionResult(sessionId: number, studentId: number) {
  const store = getStore();
  const session = store.examSessions.find(
    (s) => s.id === sessionId && s.studentId === studentId
  );
  if (!session) throw new Error('Sesi ujian tidak ditemukan.');

  const exam = store.exams.find((e) => e.id === session.examId);
  if (!exam) throw new Error('Data ujian tidak ditemukan.');

  const answers = store.studentAnswers.filter((a) => a.sessionId === session.id);
  const questionOrder: number[] = JSON.parse(session.questionOrderJson);
  const answeredCount = answers.filter((a) => a.answerText.trim().length > 0).length;

  return {
    session: {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt,
      submittedAt: session.submittedAt,
      violationCount: session.violationCount,
      totalQuestions: questionOrder.length,
      answeredCount,
      allowStudentViewResult: exam.allowStudentViewResult,
      finalScore: exam.allowStudentViewResult ? session.finalScore : null,
      autoScore: exam.allowStudentViewResult ? session.autoScore : null,
      essayScore: exam.allowStudentViewResult ? session.essayScore : null,
      maxPossibleScore: exam.allowStudentViewResult ? session.maxPossibleScore : null,
      kkm: exam.kkm,
      passedKkm: exam.allowStudentViewResult
        ? session.finalScore >= exam.kkm
        : null,
      essayGraded: session.essayGraded,
      teacherNotes: exam.allowStudentViewResult ? session.teacherNotes : '',
    },
    exam: {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      examCode: exam.examCode,
    },
  };
}

export async function getStudentHistory(studentId: number) {
  const store = getStore();
  const sessions = store.examSessions
    .filter((s) => s.studentId === studentId)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  const examMap = new Map(store.exams.map((e) => [e.id, e]));

  return sessions.map((s) => {
    const e = examMap.get(s.examId);
    return {
      id: s.id,
      examId: s.examId,
      examTitle: e?.title || 'Ujian',
      subject: e?.subject || '-',
      examCode: e?.examCode || '-',
      status: s.status,
      startedAt: s.startedAt,
      submittedAt: s.submittedAt,
      violationCount: s.violationCount,
      allowStudentViewResult: e?.allowStudentViewResult || false,
      finalScore: e?.allowStudentViewResult ? s.finalScore : null,
      kkm: e?.kkm || 75,
    };
  });
}

export async function getTeacherDashboardData(
  teacherId: number,
  isSuperAdmin = false
) {
  const store = getStore();
  const teacherExams = (
    isSuperAdmin
      ? store.exams
      : store.exams.filter((e) => e.teacherId === teacherId)
  ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const teacherQuestions = isSuperAdmin
    ? store.questions
    : store.questions.filter((q) => q.teacherId === teacherId);

  const studentRows = store.users.filter((u) => u.role === 'siswa');
  const examIdSet = new Set(teacherExams.map((e) => e.id));

  const sessions = store.examSessions
    .filter((s) => examIdSet.has(s.examId))
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  const violations = store.violationLogs
    .filter((v) => examIdSet.has(v.examId))
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const completedSessions = sessions.filter(
    (s) => s.status === 'submitted' || s.status === 'timed_out'
  );
  const avgScore =
    completedSessions.length > 0
      ? Math.round(
          completedSessions.reduce((acc, s) => acc + s.finalScore, 0) /
            completedSessions.length
        )
      : 0;

  const examMap = new Map(teacherExams.map((e) => [e.id, e]));
  const passedCount = completedSessions.filter((s) => {
    const ex = examMap.get(s.examId);
    return ex ? s.finalScore >= ex.kkm : false;
  }).length;

  const studentMap = new Map(studentRows.map((u) => [u.id, u]));

  return {
    stats: {
      totalExams: teacherExams.length,
      totalQuestions: teacherQuestions.length,
      totalStudents: studentRows.length,
      totalSessions: sessions.length,
      activeOrSuspended: sessions.filter(
        (s) => s.status === 'in_progress' || s.status === 'suspended'
      ).length,
      completedCount: completedSessions.length,
      averageScore: avgScore,
      passRate:
        completedSessions.length > 0
          ? Math.round((passedCount / completedSessions.length) * 100)
          : 0,
      totalViolations: violations.filter(
        (v) => v.violationType !== 'proctor_unlock'
      ).length,
    },
    recentExams: teacherExams.slice(0, 5),
    recentViolations: violations.slice(0, 8).map((v) => ({
      ...v,
      studentName: studentMap.get(v.studentId)?.name || 'Siswa',
      studentUsername: studentMap.get(v.studentId)?.username || '-',
      examTitle: examMap.get(v.examId)?.title || 'Ujian',
      examCode: examMap.get(v.examId)?.examCode || '-',
    })),
  };
}

export async function getTeacherResults(
  teacherId: number,
  examIdFilter?: number,
  isSuperAdmin = false
) {
  const store = getStore();
  const teacherExams = (
    isSuperAdmin
      ? store.exams
      : store.exams.filter((e) => e.teacherId === teacherId)
  ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const examIds = new Set(
    teacherExams
      .filter((e) => !examIdFilter || e.id === examIdFilter)
      .map((e) => e.id)
  );

  if (examIds.size === 0) {
    return { exams: teacherExams, sessions: [] };
  }

  const sessions = store.examSessions
    .filter((s) => examIds.has(s.examId))
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  const studentMap = new Map(store.users.map((s) => [s.id, s]));
  const examMap = new Map(teacherExams.map((e) => [e.id, e]));

  const enriched = sessions.map((s) => {
    const student = studentMap.get(s.studentId);
    const exam = examMap.get(s.examId);
    const endRef = s.submittedAt || new Date();
    const durationSeconds = Math.max(
      0,
      Math.floor((endRef.getTime() - s.startedAt.getTime()) / 1000)
    );

    return {
      ...s,
      durationSeconds,
      studentName: student?.name || 'Siswa',
      studentUsername: student?.username || '-',
      studentClass: student?.className || '-',
      examTitle: exam?.title || 'Ujian',
      examCode: exam?.examCode || '-',
      kkm: exam?.kkm || 75,
      passedKkm: s.finalScore >= (exam?.kkm || 75),
    };
  });

  return {
    exams: teacherExams,
    sessions: enriched,
  };
}

export async function getTeacherSessionDetail(
  teacherId: number,
  sessionId: number,
  isSuperAdmin = false
) {
  const store = getStore();
  const session = store.examSessions.find((s) => s.id === sessionId);
  if (!session) throw new Error('Sesi tidak ditemukan.');

  const exam = store.exams.find(
    (e) => e.id === session.examId && (isSuperAdmin || e.teacherId === teacherId)
  );
  if (!exam) throw new Error('Anda tidak memiliki akses ke sesi ini.');

  const student = store.users.find((u) => u.id === session.studentId);
  const qOrder: number[] = JSON.parse(session.questionOrderJson);
  const qMap = new Map(store.questions.map((q) => [q.id, q]));
  const ansMap = new Map(
    store.studentAnswers
      .filter((a) => a.sessionId === session.id)
      .map((a) => [a.questionId, a])
  );
  const logs = store.violationLogs
    .filter((v) => v.sessionId === session.id)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const items = qOrder
    .map((qId) => qMap.get(qId))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .map((q) => {
      const a = ansMap.get(q.id);
      return {
        questionId: q.id,
        type: q.type,
        prompt: q.prompt,
        imageData: q.imageData || null,
        options: parseOptions(q.optionsJson),
        correctAnswer: q.correctAnswer,
        maxPoints: q.points,
        studentAnswer: a?.answerText || '',
        isFlagged: a?.isFlagged || false,
        autoPoints: a?.autoPoints || 0,
        manualPoints: a?.manualPoints || 0,
        isCorrect: a?.isCorrect ?? null,
      };
    });

  return {
    session,
    exam,
    student: student
      ? {
          id: student.id,
          name: student.name,
          username: student.username,
          className: student.className,
        }
      : null,
    items,
    violations: logs,
  };
}

export async function gradeSessionEssays(
  teacherId: number,
  sessionId: number,
  grades: Array<{ questionId: number; manualPoints: number }>,
  teacherNotes: string,
  isSuperAdmin = false
) {
  const store = getStore();
  const session = store.examSessions.find((s) => s.id === sessionId);
  if (!session) throw new Error('Sesi tidak ditemukan.');

  const exam = store.exams.find(
    (e) => e.id === session.examId && (isSuperAdmin || e.teacherId === teacherId)
  );
  if (!exam) throw new Error('Anda tidak memiliki akses.');

  const qMap = new Map(store.questions.map((q) => [q.id, q]));
  const now = new Date();

  for (const item of grades) {
    const q = qMap.get(item.questionId);
    if (!q) continue;
    const boundedPoints = Math.max(0, Math.min(q.points, Math.round(item.manualPoints)));
    const existing = store.studentAnswers.find(
      (a) => a.sessionId === session.id && a.questionId === item.questionId
    );
    if (existing) {
      existing.manualPoints = boundedPoints;
      existing.isCorrect = boundedPoints > 0;
    } else {
      store.studentAnswers.push({
        id: nextId('studentAnswers'),
        sessionId: session.id,
        questionId: item.questionId,
        answerText: '',
        isFlagged: false,
        autoPoints: 0,
        manualPoints: boundedPoints,
        isCorrect: boundedPoints > 0,
        updatedAt: now,
      });
    }
  }

  const allAnswers = store.studentAnswers.filter((a) => a.sessionId === session.id);
  const autoScore = allAnswers.reduce((s, a) => s + a.autoPoints, 0);
  const essayScore = allAnswers.reduce((s, a) => s + a.manualPoints, 0);
  const finalScore =
    session.maxPossibleScore > 0
      ? Math.round(((autoScore + essayScore) / session.maxPossibleScore) * 100)
      : 0;

  session.autoScore = autoScore;
  session.essayScore = essayScore;
  session.finalScore = finalScore;
  session.essayGraded = true;
  session.teacherNotes = teacherNotes;

  await saveStore();
  return session;
}

export async function deleteStudentSession(
  teacherId: number,
  sessionId: number,
  isSuperAdmin = false
) {
  const store = getStore();
  const session = store.examSessions.find((s) => s.id === sessionId);
  if (!session) throw new Error('Sesi tidak ditemukan.');

  const exam = store.exams.find(
    (e) => e.id === session.examId && (isSuperAdmin || e.teacherId === teacherId)
  );
  if (!exam) throw new Error('Anda tidak memiliki akses.');

  store.examSessions = store.examSessions.filter((s) => s.id !== sessionId);
  store.studentAnswers = store.studentAnswers.filter((a) => a.sessionId !== sessionId);
  store.violationLogs = store.violationLogs.filter((v) => v.sessionId !== sessionId);
  await saveStore();
}

export async function getTeacherViolationLogs(
  teacherId: number,
  examIdFilter?: number,
  isSuperAdmin = false
) {
  const store = getStore();
  const teacherExams = (
    isSuperAdmin
      ? store.exams
      : store.exams.filter((e) => e.teacherId === teacherId)
  ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const examIds = new Set(
    teacherExams
      .filter((e) => !examIdFilter || e.id === examIdFilter)
      .map((e) => e.id)
  );

  if (examIds.size === 0) {
    return { exams: teacherExams, logs: [] };
  }

  const logs = store.violationLogs
    .filter((v) => examIds.has(v.examId))
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const studentMap = new Map(store.users.map((s) => [s.id, s]));
  const examMap = new Map(teacherExams.map((e) => [e.id, e]));

  return {
    exams: teacherExams,
    logs: logs.map((l) => ({
      ...l,
      studentName: studentMap.get(l.studentId)?.name || 'Siswa',
      studentUsername: studentMap.get(l.studentId)?.username || '-',
      studentClass: studentMap.get(l.studentId)?.className || '-',
      examTitle: examMap.get(l.examId)?.title || 'Ujian',
      examCode: examMap.get(l.examId)?.examCode || '-',
    })),
  };
}

const LOCKED_FOOTER_TEXT = '© Fikrul MKC · MKC CBT';

export async function getSchoolSettings() {
  const store = getStore();
  if (store.schoolSettings[0]) {
    store.schoolSettings[0].footerText = LOCKED_FOOTER_TEXT;
    return store.schoolSettings[0];
  }
  const created = {
    id: nextId('schoolSettings'),
    schoolName: 'SDN 09 SADANIANG',
    examTheme: 'Tes Akhir Semester',
    academicYear: 'Tahun Pelajaran 2026/2027',
    footerText: LOCKED_FOOTER_TEXT,
    updatedAt: new Date(),
  };
  store.schoolSettings.push(created);
  await saveStore();
  return created;
}

export async function updateSchoolSettings(input: {
  schoolName: string;
  examTheme: string;
  academicYear: string;
}) {
  const existing = await getSchoolSettings();
  existing.schoolName = input.schoolName.trim();
  existing.examTheme = input.examTheme.trim();
  existing.academicYear = input.academicYear.trim();
  existing.footerText = LOCKED_FOOTER_TEXT;
  existing.updatedAt = new Date();
  await saveStore();
  return existing;
}

export async function getPublicPortalInfo() {
  const store = getStore();
  const settings = await getSchoolSettings();
  const studentRows = store.users.filter((u) => u.role === 'siswa');
  const examCount = store.exams.filter((e) => e.isPublished).length;
  const completedCount = store.examSessions.filter(
    (s) => s.status === 'submitted' || s.status === 'timed_out'
  ).length;

  const classSet = new Set<string>();
  for (const s of studentRows) {
    const cls = (s.className || '').trim();
    if (cls) classSet.add(cls.toLowerCase());
  }

  return {
    schoolName: settings.schoolName,
    examTheme: settings.examTheme,
    academicYear: settings.academicYear,
    footerText: LOCKED_FOOTER_TEXT,
    updatedAt: settings.updatedAt,
    serverTime: new Date().toISOString(),
    stats: {
      studentCount: studentRows.length,
      classCount: classSet.size,
      examCount,
      completedSessionCount: completedCount,
    },
  };
}
