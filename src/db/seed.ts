import bcrypt from 'bcryptjs';
import { getStore, initStore, nextId, saveStore } from './localStore.ts';

let seedPromise: Promise<void> | null = null;

function ensureSchoolSettingsSeeded() {
  const store = getStore();
  if (store.schoolSettings.length === 0) {
    store.schoolSettings.push({
      id: nextId('schoolSettings'),
      schoolName: 'SDN 09 SADANIANG',
      examTheme: 'Tes Akhir Semester',
      academicYear: 'Tahun Pelajaran 2026/2027',
      footerText: '© Fikrul MKC · MKC CBT',
      updatedAt: new Date(),
    });
  }
}

async function ensureSuperAdminSeeded() {
  const store = getStore();
  const existingAdmin = store.users.find(
    (u) => u.role === 'super_admin' || u.username === 'webadmin'
  );
  if (!existingAdmin) {
    const adminPasswordHash = await bcrypt.hash('webadmin123', 10);
    store.users.push({
      id: nextId('users'),
      uid: 'local:super_admin:webadmin',
      username: 'webadmin',
      name: 'Super Admin MKC CBT',
      email: 'webadmin@mkccbt.local',
      role: 'super_admin',
      className: 'Administrator Sistem',
      passwordHash: adminPasswordHash,
      accessPin: null,
      createdAt: new Date(),
    });
  }
}

async function runSeed() {
  await initStore();
  const store = getStore();
  const hadUsers = store.users.length;
  const hadSettings = store.schoolSettings.length;

  await ensureSuperAdminSeeded();
  ensureSchoolSettingsSeeded();

  const nonAdminUsers = store.users.filter((u) => u.role === 'guru');
  if (nonAdminUsers.length > 0 || store.users.length > 1) {
    if (store.users.length !== hadUsers || store.schoolSettings.length !== hadSettings) {
      await saveStore();
    }
    return;
  }

  const teacherPasswordHash = await bcrypt.hash('Guru123!', 10);
  const studentPinHash = await bcrypt.hash('123456', 10);
  const now = new Date();

  const teacher = {
    id: nextId('users'),
    uid: 'local:guru:guru1',
    username: 'guru1',
    name: 'Ibu Sari Wulandari, S.Pd.',
    email: 'sari.wulandari@sekolah.sch.id',
    role: 'guru',
    className: 'Pengajar Informatika & Matematika',
    passwordHash: teacherPasswordHash,
    accessPin: null,
    createdAt: now,
  };
  store.users.push(teacher);

  store.users.push(
    {
      id: nextId('users'),
      uid: 'local:siswa:siswa01',
      username: 'siswa01',
      name: 'Ahmad Fauzi',
      email: 'ahmad.fauzi@siswa.sch.id',
      role: 'siswa',
      className: 'XII IPA 1',
      passwordHash: studentPinHash,
      accessPin: '123456',
      createdAt: now,
    },
    {
      id: nextId('users'),
      uid: 'local:siswa:siswa02',
      username: 'siswa02',
      name: 'Nadia Putri Pratama',
      email: 'nadia.putri@siswa.sch.id',
      role: 'siswa',
      className: 'XII IPA 1',
      passwordHash: studentPinHash,
      accessPin: '123456',
      createdAt: now,
    },
    {
      id: nextId('users'),
      uid: 'local:siswa:siswa03',
      username: 'siswa03',
      name: 'Budi Santoso',
      email: 'budi.santoso@siswa.sch.id',
      role: 'siswa',
      className: 'XII IPA 2',
      passwordHash: studentPinHash,
      accessPin: '123456',
      createdAt: now,
    }
  );

  const sampleQuestionPayloads = [
    {
      subject: 'Informatika & Literasi Digital',
      type: 'pg',
      prompt:
        'Dalam sistem basis data relasional (SQL), perintah yang digunakan untuk mengambil data tertentu dari tabel berdasarkan kondisi tertentu adalah...',
      optionsJson: JSON.stringify([
        { key: 'A', text: 'SELECT ... FROM ... WHERE ...' },
        { key: 'B', text: 'INSERT INTO ... VALUES ...' },
        { key: 'C', text: 'ALTER TABLE ... ADD COLUMN ...' },
        { key: 'D', text: 'DROP TABLE ... IF EXISTS ...' },
      ]),
      correctAnswer: 'A',
      points: 15,
      difficulty: 'mudah',
    },
    {
      subject: 'Informatika & Literasi Digital',
      type: 'pg',
      prompt:
        'Mengapa aplikasi ujian berbasis komputer (CBT) menggunakan timer yang disinkronkan dengan waktu server dibandingkan hanya mengandalkan jam perangkat siswa?',
      optionsJson: JSON.stringify([
        {
          key: 'A',
          text: 'Agar tampilan jam pada layar siswa memiliki animasi lebih cepat',
        },
        {
          key: 'B',
          text: 'Untuk mencegah manipulasi waktu ujian apabila siswa mengubah jam lokal pada perangkatnya',
        },
        {
          key: 'C',
          text: 'Supaya browser tidak memerlukan koneksi internet selama ujian berlangsung',
        },
        {
          key: 'D',
          text: 'Karena HTML tidak mendukung perhitungan mundur di sisi klien',
        },
      ]),
      correctAnswer: 'B',
      points: 15,
      difficulty: 'sedang',
    },
    {
      subject: 'Informatika & Literasi Digital',
      type: 'benar_salah',
      prompt:
        'Pernyataan: Browser web standar dapat mengunci sistem operasi perangkat siswa 100% tanpa bantuan aplikasi kiosk atau perangkat terkelola (managed device).',
      optionsJson: null,
      correctAnswer: 'SALAH',
      points: 15,
      difficulty: 'sedang',
    },
    {
      subject: 'Informatika & Literasi Digital',
      type: 'benar_salah',
      prompt:
        'Pernyataan: Prepared statement atau parameterized query membantu melindungi aplikasi dari serangan injeksi kueri.',
      optionsJson: null,
      correctAnswer: 'BENAR',
      points: 15,
      difficulty: 'mudah',
    },
    {
      subject: 'Informatika & Literasi Digital',
      type: 'isian',
      prompt:
        'Singkatan dari mekanisme keamanan web yang mencegah situs eksternal mengirimkan permintaan berbahaya atas nama sesi pengguna yang sedang login adalah ____ (4 huruf).',
      optionsJson: null,
      correctAnswer: 'CSRF,XSRF',
      points: 20,
      difficulty: 'sedang',
    },
    {
      subject: 'Informatika & Literasi Digital',
      type: 'uraian',
      prompt:
        'Jelaskan dua manfaat fitur autosave berkala pada aplikasi asesmen digital bagi siswa yang mengalami gangguan jaringan internet di sekolah.',
      optionsJson: null,
      correctAnswer:
        'Rubrik: (1) Jawaban tersimpan bertahap di server sehingga progres tidak hilang saat koneksi terputus; (2) Jawaban dapat dipulihkan otomatis saat koneksi kembali tanpa mengulang dari awal.',
      points: 20,
      difficulty: 'sulit',
    },
  ];

  const createdQuestions = sampleQuestionPayloads.map((q) => {
    const item = {
      id: nextId('questions'),
      teacherId: teacher.id,
      subject: q.subject,
      type: q.type,
      prompt: q.prompt,
      imageData: null,
      optionsJson: q.optionsJson,
      correctAnswer: q.correctAnswer,
      points: q.points,
      difficulty: q.difficulty,
      createdAt: now,
      updatedAt: now,
    };
    store.questions.push(item);
    return item;
  });

  const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const endTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const exam = {
    id: nextId('exams'),
    teacherId: teacher.id,
    title: 'Penilaian Tengah Semester — Informatika & Keamanan Digital',
    subject: 'Informatika & Literasi Digital',
    examCode: 'UJIAN2026',
    description:
      'Asesmen digital berbasis CBT dengan pemantauan Exam Mode, autosave berkala, dan sinkronisasi waktu server.',
    durationMinutes: 45,
    startTime,
    endTime,
    questionCount: createdQuestions.length,
    kkm: 75,
    shuffleQuestions: false,
    shuffleOptions: false,
    allowStudentViewResult: true,
    isPublished: true,
    requireFullscreen: true,
    detectTabSwitch: true,
    detectWindowBlur: true,
    blockCopyPaste: true,
    maxViolations: 3,
    violationAction: 'suspend',
    proctorPin: '998877',
    targetClassesJson: '[]',
    createdAt: now,
  };
  store.exams.push(exam);

  createdQuestions.forEach((q, idx) => {
    store.examQuestions.push({
      id: nextId('examQuestions'),
      examId: exam.id,
      questionId: q.id,
      orderIndex: idx,
    });
  });

  await saveStore();
}

export async function ensureSeeded(): Promise<void> {
  await initStore();
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      console.error('Database seed failed:', err);
      throw new Error('Gagal menyiapkan data awal aplikasi.', { cause: err });
    });
  }
  return seedPromise;
}
