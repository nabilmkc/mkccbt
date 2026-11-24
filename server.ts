import './src/lib/env.ts';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import {
  autosaveStudentAnswers,
  createExam,
  createQuestion,
  createQuestionsBatch,
  createStudentAccount,
  createTeacherAccount,
  deleteExam,
  deleteQuestion,
  deleteStudentAccount,
  deleteStudentSession,
  deleteTeacherAccount,
  getPublicPortalInfo,
  getSchoolSettings,
  getStudentHistory,
  getStudentSessionResult,
  getTeacherDashboardData,
  getTeacherResults,
  getTeacherSessionDetail,
  getTeacherViolationLogs,
  getUserById,
  getUserByUsername,
  gradeSessionEssays,
  importStudentAccountsBatch,
  listStudentClasses,
  listStudents,
  listTeacherExams,
  listTeacherQuestions,
  listTeachers,
  lookupExamByCodeForStudent,
  recordStudentViolation,
  startOrResumeStudentSession,
  submitStudentExam,
  unlockSessionByTeacher,
  updateExam,
  updateQuestion,
  updateSchoolSettings,
  updateSuperAdminCredentials,
  verifyProctorPinAndUnlock,
} from './src/db/repository.ts';
import { getStorageDiagnostics } from './src/db/localStore.ts';
import { ensureSeeded } from './src/db/seed.ts';
import {
  issueCsrfToken,
  normalizeExamCode,
  sanitizeText,
  signSessionToken,
} from './src/lib/security.ts';
import {
  AuthRequest,
  requireAuth,
  requireCsrf,
  requireRole,
} from './src/middleware/auth.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    frameguard: false,
  })
);
app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    ...getStorageDiagnostics(),
    serverTime: new Date().toISOString(),
  });
});

app.use('/api', async (req: Request, _res: Response, next: NextFunction) => {
  if (req.path === '/health') return next();
  try {
    await ensureSeeded();
    return next();
  } catch (err) {
    return next(err);
  }
});

app.get('/api/public/portal-info', async (_req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const info = await getPublicPortalInfo();
    res.json(info);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal memuat info portal CBT.' });
  }
});

app.get('/api/auth/demo-info', async (_req: Request, res: Response) => {
  try {
    await ensureSeeded();
    res.json({
      ready: true,
      serverTime: new Date().toISOString(),
      demoCredentials: {
        teacher: { username: 'guru1', passwordHint: 'Guru123!' },
        student: {
          username: 'siswa01',
          pinHint: '123456',
          examCode: 'UJIAN2026',
        },
        proctorPinHint: '998877',
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal menyiapkan data demo.' });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const role =
      req.body?.role === 'super_admin'
        ? 'super_admin'
        : req.body?.role === 'guru'
        ? 'guru'
        : 'siswa';
    const username = sanitizeText(req.body?.username, 64).toLowerCase();
    const credential = sanitizeText(req.body?.credential, 128);
    const examCode = normalizeExamCode(req.body?.examCode || '');

    if (!username || !credential) {
      return res.status(400).json({
        error:
          role === 'siswa'
            ? 'Username/NIS dan PIN siswa wajib diisi.'
            : 'Username dan kata sandi wajib diisi.',
      });
    }

    const user = await getUserByUsername(username);
    const roleAllowed =
      user &&
      (role === 'siswa'
        ? user.role === 'siswa'
        : role === 'super_admin'
        ? user.role === 'super_admin'
        : user.role === 'guru' || user.role === 'super_admin');

    if (!user || !roleAllowed) {
      return res.status(401).json({
        error:
          role === 'siswa'
            ? 'Username/NIS atau PIN siswa tidak cocok.'
            : role === 'super_admin'
            ? 'Username atau kata sandi Super Admin salah.'
            : 'Username atau kata sandi guru salah.',
      });
    }

    if (!user.passwordHash) {
      return res.status(401).json({
        error: 'Akun ini terdaftar menggunakan Google Sign-In. Silakan masuk dengan Google.',
      });
    }

    const isMatch = await bcrypt.compare(credential, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        error:
          role === 'siswa'
            ? 'Username/NIS atau PIN siswa tidak cocok.'
            : role === 'super_admin'
            ? 'Username atau kata sandi Super Admin salah.'
            : 'Username atau kata sandi guru salah.',
      });
    }

    const resolvedRole: 'super_admin' | 'guru' | 'siswa' =
      user.role === 'super_admin'
        ? 'super_admin'
        : user.role === 'guru'
        ? 'guru'
        : 'siswa';

    const token = signSessionToken({
      userId: user.id,
      uid: user.uid,
      username: user.username,
      name: user.name,
      role: resolvedRole,
    });
    const csrfToken = issueCsrfToken(user.uid);

    let initialExamLookup: Awaited<
      ReturnType<typeof lookupExamByCodeForStudent>
    > | null = null;
    if (resolvedRole === 'siswa' && examCode) {
      try {
        initialExamLookup = await lookupExamByCodeForStudent(examCode, user.id);
      } catch (err: any) {
        return res.status(404).json({
          error: err.message || 'Kode ujian tidak ditemukan.',
        });
      }
    }

    res.json({
      token,
      csrfToken,
      user: {
        id: user.id,
        uid: user.uid,
        username: user.username,
        name: user.name,
        email: user.email,
        role: resolvedRole,
        className: user.className,
      },
      initialExamLookup,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message || 'Gagal melakukan otentikasi.' });
  }
});

app.post('/api/auth/firebase', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const user = req.authUser!;
    const csrfToken = issueCsrfToken(user.uid);
    res.json({
      csrfToken,
      user,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal memproses sesi Google.' });
  }
});

app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = req.authUser!;
  const csrfToken = issueCsrfToken(user.uid);
  res.json({ user, csrfToken });
});

// ================= SUPER ADMIN ROUTES =================

app.get(
  '/api/admin/school-settings',
  requireAuth,
  requireRole('super_admin'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const settings = await getSchoolSettings();
      res.json({ settings });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat pengaturan sekolah.' });
    }
  }
);

app.put(
  '/api/admin/school-settings',
  requireAuth,
  requireRole('super_admin'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const schoolName = sanitizeText(req.body?.schoolName, 120);
      const examTheme = sanitizeText(req.body?.examTheme, 120);
      const academicYear = sanitizeText(req.body?.academicYear || '', 80);

      if (!schoolName || schoolName.length < 2) {
        return res.status(400).json({ error: 'Nama sekolah wajib diisi (minimal 2 karakter).' });
      }
      if (!examTheme || examTheme.length < 2) {
        return res.status(400).json({ error: 'Tema ujian wajib diisi (minimal 2 karakter).' });
      }

      const settings = await updateSchoolSettings({
        schoolName,
        examTheme,
        academicYear,
      });
      res.json({ settings });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal menyimpan pengaturan sekolah.' });
    }
  }
);

app.get(
  '/api/admin/account',
  requireAuth,
  requireRole('super_admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const user = await getUserById(req.authUser!.id);
      if (!user || user.role !== 'super_admin') {
        return res.status(404).json({ error: 'Akun Super Admin tidak ditemukan.' });
      }
      res.json({
        account: {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          hasPassword: Boolean(user.passwordHash),
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat akun Super Admin.' });
    }
  }
);

app.put(
  '/api/admin/account',
  requireAuth,
  requireRole('super_admin'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const username = sanitizeText(req.body?.username, 40)
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '');
      const name = sanitizeText(req.body?.name || '', 100);
      const currentPassword = sanitizeText(req.body?.currentPassword || '', 128);
      const newPassword = sanitizeText(req.body?.newPassword || '', 64);

      if (!username || username.length < 3) {
        return res.status(400).json({
          error: 'Username Super Admin minimal 3 karakter (huruf, angka, titik, garis bawah, atau tanda hubung).',
        });
      }
      if (newPassword && newPassword.length < 6) {
        return res.status(400).json({
          error: 'Kata sandi baru minimal 6 karakter.',
        });
      }

      const updatedUser = await updateSuperAdminCredentials({
        userId: req.authUser!.id,
        username,
        name: name || undefined,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      });

      const token = signSessionToken({
        userId: updatedUser.id,
        uid: updatedUser.uid,
        username: updatedUser.username,
        name: updatedUser.name,
        role: updatedUser.role,
      });
      const csrfToken = issueCsrfToken(updatedUser.uid);

      res.json({
        user: updatedUser,
        token,
        csrfToken,
      });
    } catch (error: any) {
      const msg = error?.message || 'Gagal memperbarui akun Super Admin.';
      const status =
        msg.includes('sudah digunakan')
          ? 409
          : msg.includes('tidak cocok') || msg.includes('wajib diisi')
          ? 400
          : 500;
      res.status(status).json({ error: msg });
    }
  }
);

app.get(
  '/api/admin/teachers',
  requireAuth,
  requireRole('super_admin'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const teachers = await listTeachers();
      res.json({ teachers });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat daftar akun guru.' });
    }
  }
);

app.post(
  '/api/admin/teachers',
  requireAuth,
  requireRole('super_admin'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const username = sanitizeText(req.body?.username, 40)
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '');
      const name = sanitizeText(req.body?.name, 100);
      const email = sanitizeText(req.body?.email || '', 120) || null;
      const className =
        sanitizeText(req.body?.className || '', 80) || 'Guru Mata Pelajaran';
      const password = sanitizeText(req.body?.password, 64);

      if (!username || username.length < 3) {
        return res.status(400).json({ error: 'Username guru minimal 3 karakter.' });
      }
      if (!name) {
        return res.status(400).json({ error: 'Nama lengkap guru wajib diisi.' });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Kata sandi guru minimal 6 karakter.' });
      }

      const teacher = await createTeacherAccount({
        username,
        name,
        email,
        className,
        password,
      });
      res.status(201).json({ teacher });
    } catch (error: any) {
      const status = error.message?.includes('sudah digunakan') ? 409 : 500;
      res.status(status).json({ error: error.message || 'Gagal menambahkan akun guru.' });
    }
  }
);

app.delete(
  '/api/admin/teachers/:id',
  requireAuth,
  requireRole('super_admin'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID guru tidak valid.' });
      }
      await deleteTeacherAccount(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal menghapus akun guru.' });
    }
  }
);

// ================= TEACHER & SUPER ADMIN ROUTES =================

app.get(
  '/api/teacher/dashboard',
  requireAuth,
  requireRole('guru', 'super_admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const isSuperAdmin = req.authUser!.role === 'super_admin';
      const data = await getTeacherDashboardData(req.authUser!.id, isSuperAdmin);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat dashboard.' });
    }
  }
);

app.get(
  '/api/teacher/students',
  requireAuth,
  requireRole('guru', 'super_admin'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const students = await listStudents();
      res.json({ students });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat daftar siswa.' });
    }
  }
);

app.get(
  '/api/teacher/classes',
  requireAuth,
  requireRole('guru', 'super_admin'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const classes = await listStudentClasses();
      res.json({ classes });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat daftar kelas.' });
    }
  }
);

app.post(
  '/api/teacher/students',
  requireAuth,
  requireRole('guru', 'super_admin'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const username = sanitizeText(req.body?.username, 40)
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '');
      const name = sanitizeText(req.body?.name, 100);
      const className = sanitizeText(req.body?.className, 50);
      const pin = sanitizeText(req.body?.pin, 32);

      if (!username || username.length < 3) {
        return res.status(400).json({ error: 'Username/NIS minimal 3 karakter.' });
      }
      if (!name) {
        return res.status(400).json({ error: 'Nama lengkap siswa wajib diisi.' });
      }
      if (!pin || pin.length < 4) {
        return res.status(400).json({ error: 'PIN siswa minimal 4 karakter.' });
      }

      const student = await createStudentAccount({
        username,
        name,
        className,
        pin,
      });
      res.status(201).json({ student });
    } catch (error: any) {
      const status = error.message?.includes('sudah terdaftar') ? 409 : 500;
      res.status(status).json({ error: error.message || 'Gagal membuat akun siswa.' });
    }
  }
);

app.post(
  '/api/teacher/students/import',
  requireAuth,
  requireRole('guru', 'super_admin'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const rawList = Array.isArray(req.body?.students) ? req.body.students : null;
      if (!rawList || rawList.length === 0) {
        return res
          .status(400)
          .json({ error: 'Daftar akun siswa untuk diimpor tidak boleh kosong.' });
      }
      if (rawList.length > 500) {
        return res
          .status(400)
          .json({ error: 'Maksimal 500 akun siswa dalam satu kali import.' });
      }

      const normalized = rawList.map((item: any, idx: number) => {
        const username = sanitizeText(item?.username, 40)
          .toLowerCase()
          .replace(/[^a-z0-9._-]/g, '');
        const name = sanitizeText(item?.name, 100);
        const className = sanitizeText(item?.className || 'Umum', 50) || 'Umum';
        const pin = sanitizeText(item?.pin, 32);

        if (!username || username.length < 3) {
          throw new Error(`Baris #${idx + 1}: Username/NIS minimal 3 karakter.`);
        }
        if (!name) {
          throw new Error(`Baris #${idx + 1}: Nama lengkap siswa wajib diisi.`);
        }
        if (!pin || pin.length < 4) {
          throw new Error(`Baris #${idx + 1}: PIN login minimal 4 karakter.`);
        }

        return { username, name, className, pin };
      });

      const result = await importStudentAccountsBatch(normalized);
      res.status(201).json(result);
    } catch (error: any) {
      const isBad = error.message?.includes('Baris #');
      res
        .status(isBad ? 400 : 500)
        .json({ error: error.message || 'Gagal mengimpor akun siswa.' });
    }
  }
);

app.delete(
  '/api/teacher/students/:id',
  requireAuth,
  requireRole('guru', 'super_admin'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID siswa tidak valid.' });
      }
      await deleteStudentAccount(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal menghapus siswa.' });
    }
  }
);

app.get(
  '/api/teacher/questions',
  requireAuth,
  requireRole('guru', 'super_admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const isSuperAdmin = req.authUser!.role === 'super_admin';
      const items = await listTeacherQuestions(req.authUser!.id, isSuperAdmin);
      res.json({ questions: items });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat bank soal.' });
    }
  }
);

function parseQuestionPayload(body: any) {
  const subject = sanitizeText(body?.subject, 100);
  const type = body?.type;
  const prompt = sanitizeText(body?.prompt, 4000);
  const correctAnswer = sanitizeText(body?.correctAnswer, 2000);
  const points = Math.max(1, Math.min(100, Number(body?.points) || 10));
  const difficulty = ['mudah', 'sedang', 'sulit'].includes(body?.difficulty)
    ? body.difficulty
    : 'sedang';

  if (!subject) throw new Error('Mata pelajaran wajib diisi.');
  if (!['pg', 'isian', 'benar_salah', 'uraian'].includes(type)) {
    throw new Error('Tipe soal tidak valid.');
  }
  if (!prompt) throw new Error('Teks pertanyaan soal wajib diisi.');

  let options: Array<{ key: string; text: string }> | undefined;
  if (type === 'pg') {
    const rawOpts = Array.isArray(body?.options) ? body.options : [];
    const parsedOpts: Array<{ key: string; text: string }> = rawOpts
      .map((o: any) => ({
        key: sanitizeText(o?.key, 4).toUpperCase(),
        text: sanitizeText(o?.text, 1000),
      }))
      .filter((o: any) => o.key && o.text);
    if (parsedOpts.length < 2) {
      throw new Error('Soal Pilihan Ganda minimal memiliki 2 opsi jawaban.');
    }
    if (!parsedOpts.some((o) => o.key === correctAnswer.toUpperCase())) {
      throw new Error('Kunci jawaban PG harus sesuai dengan salah satu huruf opsi.');
    }
    options = parsedOpts;
  } else if (type === 'benar_salah') {
    const normalized = correctAnswer.toUpperCase();
    if (normalized !== 'BENAR' && normalized !== 'SALAH') {
      throw new Error('Kunci jawaban Benar-Salah harus BENAR atau SALAH.');
    }
  } else if (!correctAnswer) {
    throw new Error('Kunci jawaban / pedoman penskoran wajib diisi.');
  }

  const rawImage = typeof body?.imageData === 'string' ? body.imageData.trim() : '';
  let imageData: string | null = null;
  if (rawImage) {
    const isDataUrl = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(
      rawImage
    );
    const isHttpUrl = /^https?:\/\/.+/i.test(rawImage) && rawImage.length <= 2000;
    if (!isDataUrl && !isHttpUrl) {
      throw new Error('Format gambar tidak valid. Gunakan PNG, JPG, WEBP, GIF, atau URL gambar yang sah.');
    }
    if (isDataUrl && rawImage.length > 4 * 1024 * 1024) {
      throw new Error('Ukuran gambar terlalu besar (maksimal ~3 MB).');
    }
    imageData = rawImage;
  }

  return {
    subject,
    type: type as 'pg' | 'isian' | 'benar_salah' | 'uraian',
    prompt,
    imageData,
    options,
    correctAnswer:
      type === 'pg' || type === 'benar_salah'
        ? correctAnswer.toUpperCase()
        : correctAnswer,
    points,
    difficulty,
  };
}

app.post(
  '/api/teacher/questions',
  requireAuth,
  requireRole('guru', 'super_admin'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const payload = parseQuestionPayload(req.body);
      const created = await createQuestion(req.authUser!.id, payload);
      res.status(201).json({ question: created });
    } catch (error: any) {
      const isValidation =
        error.message?.includes('wajib') ||
        error.message?.includes('minimal') ||
        error.message?.includes('valid') ||
        error.message?.includes('Kunci');
      res
        .status(isValidation ? 400 : 500)
        .json({ error: error.message || 'Gagal menambah soal.' });
    }
  }
);

app.post(
  '/api/teacher/questions/import',
  requireAuth,
  requireRole('guru', 'super_admin'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const rawItems = Array.isArray(req.body?.questions) ? req.body.questions : null;
      if (!rawItems || rawItems.length === 0) {
        return res
          .status(400)
          .json({ error: 'Daftar soal untuk diimpor tidak boleh kosong.' });
      }
      if (rawItems.length > 200) {
        return res
          .status(400)
          .json({ error: 'Maksimal 200 butir soal dalam satu kali import.' });
      }

      const validated = rawItems.map((item: any, idx: number) => {
        try {
          return parseQuestionPayload(item);
        } catch (err: any) {
          throw new Error(`Baris soal #${idx + 1}: ${err.message}`);
        }
      });

      const created = await createQuestionsBatch(req.authUser!.id, validated);
      res.status(201).json({
        importedCount: created.length,
        questions: created,
      });
    } catch (error: any) {
      const isValidation =
        error.message?.includes('Baris soal') ||
        error.message?.includes('wajib') ||
        error.message?.includes('minimal') ||
        error.message?.includes('valid') ||
        error.message?.includes('Kunci');
      res
        .status(isValidation ? 400 : 500)
        .json({ error: error.message || 'Gagal mengimpor soal.' });
    }
  }
);

app.put(
  '/api/teacher/questions/:id',
  requireAuth,
  requireRole('guru', 'super_admin'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID soal tidak valid.' });
      }
      const isSuperAdmin = req.authUser!.role === 'super_admin';
      const payload = parseQuestionPayload(req.body);
      const updated = await updateQuestion(req.authUser!.id, id, payload, isSuperAdmin);
      res.json({ question: updated });
    } catch (error: any) {
      const isValidation =
        error.message?.includes('wajib') ||
        error.message?.includes('minimal') ||
        error.message?.includes('valid') ||
        error.message?.includes('Kunci');
      res
        .status(isValidation ? 400 : 500)
        .json({ error: error.message || 'Gagal memperbarui soal.' });
    }
  }
);

app.delete(
  '/api/teacher/questions/:id',
  requireAuth,
  requireRole('guru', 'super_admin'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID soal tidak valid.' });
      }
      const isSuperAdmin = req.authUser!.role === 'super_admin';
      await deleteQuestion(req.authUser!.id, id, isSuperAdmin);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal menghapus soal.' });
    }
  }
);

function parseExamPayload(body: any) {
  const title = sanitizeText(body?.title, 150);
  const subject = sanitizeText(body?.subject, 100);
  const examCode = normalizeExamCode(body?.examCode);
  const description = sanitizeText(body?.description || '', 1000);
  const durationMinutes = Math.max(1, Math.min(360, Number(body?.durationMinutes) || 60));
  const startTime = new Date(body?.startTime);
  const endTime = new Date(body?.endTime);
  const kkm = Math.max(0, Math.min(100, Number(body?.kkm) ?? 75));
  const questionIds: number[] = Array.isArray(body?.questionIds)
    ? body.questionIds
        .map((n: any) => Number(n))
        .filter((n: number) => Number.isInteger(n) && n > 0)
    : [];
  const questionCount = Math.max(
    1,
    Math.min(200, Number(body?.questionCount) || questionIds.length || 10)
  );
  const maxViolations = Math.max(1, Math.min(20, Number(body?.maxViolations) || 3));
  const violationAction =
    body?.violationAction === 'auto_submit' ? 'auto_submit' : 'suspend';
  const proctorPin = sanitizeText(body?.proctorPin || '123456', 16) || '123456';
  const targetClasses: string[] = Array.isArray(body?.targetClasses)
    ? Array.from(
        new Set(
          body.targetClasses
            .map((c: any) => sanitizeText(c, 50))
            .filter(Boolean)
        )
      )
    : [];

  if (!title) throw new Error('Judul ujian wajib diisi.');
  if (!subject) throw new Error('Mata pelajaran ujian wajib diisi.');
  if (!examCode || examCode.length < 4) {
    throw new Error('Kode ujian minimal 4 karakter alfanumerik.');
  }
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new Error('Jadwal mulai dan selesai harus berupa tanggal/waktu valid.');
  }
  if (endTime <= startTime) {
    throw new Error('Waktu selesai ujian harus lebih akhir dari waktu mulai.');
  }
  if (proctorPin.length < 4) {
    throw new Error('PIN verifikasi guru minimal 4 karakter.');
  }

  return {
    title,
    subject,
    examCode,
    description,
    durationMinutes,
    startTime,
    endTime,
    questionCount,
    kkm,
    shuffleQuestions: Boolean(body?.shuffleQuestions),
    shuffleOptions: Boolean(body?.shuffleOptions),
    allowStudentViewResult: Boolean(body?.allowStudentViewResult),
    isPublished: body?.isPublished !== false,
    requireFullscreen: body?.requireFullscreen !== false,
    detectTabSwitch: body?.detectTabSwitch !== false,
    detectWindowBlur: body?.detectWindowBlur !== false,
    blockCopyPaste: body?.blockCopyPaste !== false,
    maxViolations,
    violationAction: violationAction as 'suspend' | 'auto_submit',
    proctorPin,
    targetClasses,
    questionIds,
  };
}

app.get(
  '/api/teacher/exams',
  requireAuth,
  requireRole('guru', 'super_admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const isSuperAdmin = req.authUser!.role === 'super_admin';
      const items = await listTeacherExams(req.authUser!.id, isSuperAdmin);
      res.json({ exams: items });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat daftar ujian.' });
    }
  }
);

app.post(
  '/api/teacher/exams',
  requireAuth,
  requireRole('guru', 'super_admin'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const payload = parseExamPayload(req.body);
      const created = await createExam(req.authUser!.id, payload);
      res.status(201).json({ exam: created });
    } catch (error: any) {
      const isBadRequest =
        error.message?.includes('wajib') ||
        error.message?.includes('minimal') ||
        error.message?.includes('valid') ||
        error.message?.includes('Kode ujian') ||
        error.message?.includes('Waktu selesai');
      res
        .status(isBadRequest ? 400 : 500)
        .json({ error: error.message || 'Gagal membuat ujian.' });
    }
  }
);

app.put(
  '/api/teacher/exams/:id',
  requireAuth,
  requireRole('guru', 'super_admin'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID ujian tidak valid.' });
      }
      const isSuperAdmin = req.authUser!.role === 'super_admin';
      const payload = parseExamPayload(req.body);
      const updated = await updateExam(req.authUser!.id, id, payload, isSuperAdmin);
      res.json({ exam: updated });
    } catch (error: any) {
      const isBadRequest =
        error.message?.includes('wajib') ||
        error.message?.includes('minimal') ||
        error.message?.includes('valid') ||
        error.message?.includes('Kode ujian') ||
        error.message?.includes('Waktu selesai');
      res
        .status(isBadRequest ? 400 : 500)
        .json({ error: error.message || 'Gagal memperbarui ujian.' });
    }
  }
);

app.delete(
  '/api/teacher/exams/:id',
  requireAuth,
  requireRole('guru', 'super_admin'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID ujian tidak valid.' });
      }
      const isSuperAdmin = req.authUser!.role === 'super_admin';
      await deleteExam(req.authUser!.id, id, isSuperAdmin);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal menghapus ujian.' });
    }
  }
);

app.get(
  '/api/teacher/results',
  requireAuth,
  requireRole('guru', 'super_admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const isSuperAdmin = req.authUser!.role === 'super_admin';
      const examId = req.query.examId ? Number(req.query.examId) : undefined;
      const data = await getTeacherResults(
        req.authUser!.id,
        examId && Number.isInteger(examId) ? examId : undefined,
        isSuperAdmin
      );
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat hasil ujian.' });
    }
  }
);

app.get(
  '/api/teacher/results/:sessionId',
  requireAuth,
  requireRole('guru', 'super_admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const sessionId = Number(req.params.sessionId);
      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        return res.status(400).json({ error: 'ID sesi tidak valid.' });
      }
      const isSuperAdmin = req.authUser!.role === 'super_admin';
      const data = await getTeacherSessionDetail(
        req.authUser!.id,
        sessionId,
        isSuperAdmin
      );
      res.json(data);
    } catch (error: any) {
      res.status(404).json({ error: error.message || 'Sesi tidak ditemukan.' });
    }
  }
);

app.post(
  '/api/teacher/results/:sessionId/grade',
  requireAuth,
  requireRole('guru', 'super_admin'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const sessionId = Number(req.params.sessionId);
      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        return res.status(400).json({ error: 'ID sesi tidak valid.' });
      }
      const grades = Array.isArray(req.body?.grades)
        ? req.body.grades.map((g: any) => ({
            questionId: Number(g.questionId),
            manualPoints: Number(g.manualPoints) || 0,
          }))
        : [];
      const teacherNotes = sanitizeText(req.body?.teacherNotes || '', 1000);
      const isSuperAdmin = req.authUser!.role === 'super_admin';
      const updated = await gradeSessionEssays(
        req.authUser!.id,
        sessionId,
        grades,
        teacherNotes,
        isSuperAdmin
      );
      res.json({ session: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal menyimpan nilai uraian.' });
    }
  }
);

app.post(
  '/api/teacher/results/:sessionId/unlock',
  requireAuth,
  requireRole('guru', 'super_admin'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const sessionId = Number(req.params.sessionId);
      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        return res.status(400).json({ error: 'ID sesi tidak valid.' });
      }
      const isSuperAdmin = req.authUser!.role === 'super_admin';
      const updated = await unlockSessionByTeacher(
        req.authUser!.id,
        sessionId,
        isSuperAdmin
      );
      res.json({ session: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal membuka penangguhan.' });
    }
  }
);

app.delete(
  '/api/teacher/results/:sessionId',
  requireAuth,
  requireRole('guru', 'super_admin'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const sessionId = Number(req.params.sessionId);
      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        return res.status(400).json({ error: 'ID sesi tidak valid.' });
      }
      const isSuperAdmin = req.authUser!.role === 'super_admin';
      await deleteStudentSession(req.authUser!.id, sessionId, isSuperAdmin);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal mereset sesi siswa.' });
    }
  }
);

app.get(
  '/api/teacher/violations',
  requireAuth,
  requireRole('guru', 'super_admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const isSuperAdmin = req.authUser!.role === 'super_admin';
      const examId = req.query.examId ? Number(req.query.examId) : undefined;
      const data = await getTeacherViolationLogs(
        req.authUser!.id,
        examId && Number.isInteger(examId) ? examId : undefined,
        isSuperAdmin
      );
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat audit log.' });
    }
  }
);

// ================= STUDENT ROUTES =================

app.post(
  '/api/student/exam-lookup',
  requireAuth,
  requireRole('siswa'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const examCode = normalizeExamCode(req.body?.examCode);
      if (!examCode) {
        return res.status(400).json({ error: 'Masukkan kode ujian terlebih dahulu.' });
      }
      const data = await lookupExamByCodeForStudent(examCode, req.authUser!.id);
      res.json(data);
    } catch (error: any) {
      const status = error.message?.includes('khusus untuk kelas') ? 403 : 404;
      res.status(status).json({ error: error.message || 'Kode ujian tidak ditemukan.' });
    }
  }
);

app.get(
  '/api/student/history',
  requireAuth,
  requireRole('siswa'),
  async (req: AuthRequest, res: Response) => {
    try {
      const history = await getStudentHistory(req.authUser!.id);
      res.json({ history });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat riwayat ujian.' });
    }
  }
);

app.post(
  '/api/student/exams/:examId/start',
  requireAuth,
  requireRole('siswa'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const examId = Number(req.params.examId);
      if (!Number.isInteger(examId) || examId <= 0) {
        return res.status(400).json({ error: 'ID ujian tidak valid.' });
      }
      const data = await startOrResumeStudentSession(examId, req.authUser!.id);
      res.json(data);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Gagal memulai ujian.' });
    }
  }
);

app.post(
  '/api/student/sessions/:sessionId/autosave',
  requireAuth,
  requireRole('siswa'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const sessionId = Number(req.params.sessionId);
      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        return res.status(400).json({ error: 'ID sesi tidak valid.' });
      }
      const rawAnswers = Array.isArray(req.body?.answers) ? req.body.answers : [];
      const sanitized = rawAnswers
        .map((a: any) => ({
          questionId: Number(a?.questionId),
          answerText: sanitizeText(a?.answerText ?? '', 8000),
          isFlagged: Boolean(a?.isFlagged),
        }))
        .filter((a: any) => Number.isInteger(a.questionId) && a.questionId > 0);

      const result = await autosaveStudentAnswers(
        sessionId,
        req.authUser!.id,
        sanitized
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Gagal menyimpan jawaban.' });
    }
  }
);

app.post(
  '/api/student/sessions/:sessionId/violations',
  requireAuth,
  requireRole('siswa'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const sessionId = Number(req.params.sessionId);
      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        return res.status(400).json({ error: 'ID sesi tidak valid.' });
      }
      const violationType = sanitizeText(req.body?.violationType, 40) || 'tab_switch';
      const description = sanitizeText(
        req.body?.description || 'Terdeteksi aktivitas meninggalkan halaman ujian.',
        500
      );
      const result = await recordStudentViolation(sessionId, req.authUser!.id, {
        violationType,
        description,
      });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Gagal mencatat pelanggaran.' });
    }
  }
);

app.post(
  '/api/student/sessions/:sessionId/verify-proctor',
  requireAuth,
  requireRole('siswa'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const sessionId = Number(req.params.sessionId);
      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        return res.status(400).json({ error: 'ID sesi tidak valid.' });
      }
      const pin = sanitizeText(req.body?.pin, 20);
      if (!pin) {
        return res.status(400).json({ error: 'Masukkan PIN verifikasi guru.' });
      }
      const result = await verifyProctorPinAndUnlock(
        sessionId,
        req.authUser!.id,
        pin
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Verifikasi PIN guru gagal.' });
    }
  }
);

app.post(
  '/api/student/sessions/:sessionId/submit',
  requireAuth,
  requireRole('siswa'),
  requireCsrf,
  async (req: AuthRequest, res: Response) => {
    try {
      const sessionId = Number(req.params.sessionId);
      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        return res.status(400).json({ error: 'ID sesi tidak valid.' });
      }
      const rawAnswers = Array.isArray(req.body?.answers) ? req.body.answers : [];
      const sanitized = rawAnswers
        .map((a: any) => ({
          questionId: Number(a?.questionId),
          answerText: sanitizeText(a?.answerText ?? '', 8000),
          isFlagged: Boolean(a?.isFlagged),
        }))
        .filter((a: any) => Number.isInteger(a.questionId) && a.questionId > 0);

      const result = await submitStudentExam(
        sessionId,
        req.authUser!.id,
        sanitized
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Gagal mengirim jawaban ujian.' });
    }
  }
);

app.get(
  '/api/student/sessions/:sessionId/result',
  requireAuth,
  requireRole('siswa'),
  async (req: AuthRequest, res: Response) => {
    try {
      const sessionId = Number(req.params.sessionId);
      if (!Number.isInteger(sessionId) || sessionId <= 0) {
        return res.status(400).json({ error: 'ID sesi tidak valid.' });
      }
      const result = await getStudentSessionResult(sessionId, req.authUser!.id);
      res.json(result);
    } catch (error: any) {
      res.status(404).json({ error: error.message || 'Hasil tidak ditemukan.' });
    }
  }
);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled API error:', err);
  if (res.headersSent) return;
  res.status(err?.status || 500).json({
    error: err?.message || 'Terjadi kesalahan internal pada server CBT.',
  });
});

async function startServer() {
  const isDevMode =
    process.env.NODE_ENV !== 'production' &&
    !process.env.VERCEL &&
    !process.env.CBT_BUNDLED;

  if (isDevMode) {
    const vitePkg = 'vite';
    const { createServer: createViteServer } = await import(vitePkg);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const baseDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
    const distCandidates = [
      path.resolve(process.cwd(), 'dist'),
      path.resolve(baseDir, 'dist'),
      path.resolve(baseDir, '..', 'dist'),
    ];
    const distPath =
      distCandidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) ||
      distCandidates[0];

    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint API tidak ditemukan.' });
      }
      const indexHtml = path.join(distPath, 'index.html');
      if (!fs.existsSync(indexHtml)) {
        return res
          .status(500)
          .send(
            'Build frontend (dist/index.html) tidak ditemukan. Jalankan "npm run build" terlebih dahulu.'
          );
      }
      return res.sendFile(indexHtml);
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`MKC CBT Server listening on http://${HOST}:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export { app };
export default app;

