import { useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  Copy,
  Edit3,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api, formatDateTime } from '../lib/api';
import { ExamItem, QuestionItem } from '../types/cbt';

function toLocalDatetimeInput(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function ExamManagementView() {
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Informatika & Literasi Digital');
  const [examCode, setExamCode] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [kkm, setKkm] = useState(75);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [allowStudentViewResult, setAllowStudentViewResult] = useState(false);
  const [isPublished, setIsPublished] = useState(true);
  const [requireFullscreen, setRequireFullscreen] = useState(true);
  const [detectTabSwitch, setDetectTabSwitch] = useState(true);
  const [detectWindowBlur, setDetectWindowBlur] = useState(true);
  const [blockCopyPaste, setBlockCopyPaste] = useState(true);
  const [maxViolations, setMaxViolations] = useState(3);
  const [violationAction, setViolationAction] = useState<'suspend' | 'auto_submit'>('suspend');
  const [proctorPin, setProctorPin] = useState('998877');
  const [selectedQIds, setSelectedQIds] = useState<number[]>([]);
  const [targetClasses, setTargetClasses] = useState<string[]>([]);
  const [customClassInput, setCustomClassInput] = useState('');
  const [showAllBankSubjects, setShowAllBankSubjects] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [examRes, qRes, classRes] = await Promise.all([
        api.request<{ exams: ExamItem[] }>('/api/teacher/exams'),
        api.request<{ questions: QuestionItem[] }>('/api/teacher/questions'),
        api.request<{ classes: string[] }>('/api/teacher/classes'),
      ]);
      setExams(examRes.exams);
      setQuestions(qRes.questions);
      setAvailableClasses(classRes.classes || []);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat daftar ujian.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const bankSubjectOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const q of questions) {
      const normalized = (q.subject || '').trim();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [questions]);

  const modalSubjectOptions = useMemo(() => {
    const current = subject.trim();
    if (
      current &&
      !bankSubjectOptions.some((s) => s.name === current)
    ) {
      return [...bankSubjectOptions, { name: current, count: 0 }];
    }
    return bankSubjectOptions;
  }, [bankSubjectOptions, subject]);

  const modalQuestions = useMemo(() => {
    if (showAllBankSubjects || !subject.trim()) return questions;
    return questions.filter((q) => (q.subject || '').trim() === subject.trim());
  }, [questions, showAllBankSubjects, subject]);

  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = 'CBT';
    for (let i = 0; i < 5; i += 1) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    setExamCode(out);
  };

  const handleSubjectChange = (nextSubject: string) => {
    setSubject(nextSubject);
    const matchingIds = questions
      .filter((q) => (q.subject || '').trim() === nextSubject.trim())
      .map((q) => q.id);
    setSelectedQIds(matchingIds);
    setQuestionCount(Math.max(1, matchingIds.length));
  };

  const openCreateModal = () => {
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const initialSubject = bankSubjectOptions[0]?.name || '';
    const matchingIds = initialSubject
      ? questions
          .filter((q) => (q.subject || '').trim() === initialSubject)
          .map((q) => q.id)
      : [];

    setEditingId(null);
    setTitle('');
    setSubject(initialSubject);
    generateCode();
    setDescription('');
    setDurationMinutes(45);
    setStartTime(toLocalDatetimeInput(now));
    setEndTime(toLocalDatetimeInput(nextWeek));
    setSelectedQIds(matchingIds);
    setQuestionCount(Math.max(1, matchingIds.length));
    setShowAllBankSubjects(false);
    setKkm(75);
    setShuffleQuestions(true);
    setShuffleOptions(true);
    setAllowStudentViewResult(false);
    setIsPublished(true);
    setRequireFullscreen(true);
    setDetectTabSwitch(true);
    setDetectWindowBlur(true);
    setBlockCopyPaste(true);
    setMaxViolations(3);
    setViolationAction('suspend');
    setProctorPin('998877');
    setTargetClasses([]);
    setCustomClassInput('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (exam: ExamItem) => {
    setEditingId(exam.id);
    setTitle(exam.title);
    setSubject(exam.subject);
    setExamCode(exam.examCode);
    setDescription(exam.description);
    setDurationMinutes(exam.durationMinutes);
    setStartTime(toLocalDatetimeInput(exam.startTime));
    setEndTime(toLocalDatetimeInput(exam.endTime));
    setQuestionCount(exam.questionCount);
    setKkm(exam.kkm);
    setShuffleQuestions(exam.shuffleQuestions);
    setShuffleOptions(exam.shuffleOptions);
    setAllowStudentViewResult(exam.allowStudentViewResult);
    setIsPublished(exam.isPublished);
    setRequireFullscreen(exam.requireFullscreen);
    setDetectTabSwitch(exam.detectTabSwitch);
    setDetectWindowBlur(exam.detectWindowBlur);
    setBlockCopyPaste(exam.blockCopyPaste);
    setMaxViolations(exam.maxViolations);
    setViolationAction(exam.violationAction);
    setProctorPin(exam.proctorPin);
    setSelectedQIds(exam.questionIds || []);
    setShowAllBankSubjects(false);
    setTargetClasses(exam.targetClasses || []);
    setCustomClassInput('');
    setFormError(null);
    setModalOpen(true);
  };

  const toggleQuestion = (qId: number) => {
    setSelectedQIds((prev) =>
      prev.includes(qId) ? prev.filter((id) => id !== qId) : [...prev, qId]
    );
  };

  const toggleTargetClass = (cls: string) => {
    const normalized = cls.trim();
    if (!normalized) return;
    setTargetClasses((prev) => {
      const exists = prev.some((c) => c.toLowerCase() === normalized.toLowerCase());
      return exists
        ? prev.filter((c) => c.toLowerCase() !== normalized.toLowerCase())
        : [...prev, normalized];
    });
  };

  const handleAddCustomClass = () => {
    const clean = customClassInput.trim();
    if (!clean) return;
    if (!availableClasses.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      setAvailableClasses((prev) =>
        [...prev, clean].sort((a, b) => a.localeCompare(b, 'id'))
      );
    }
    if (!targetClasses.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      setTargetClasses((prev) => [...prev, clean]);
    }
    setCustomClassInput('');
  };

  const classOptions = Array.from(
    new Set([...availableClasses, ...targetClasses])
  ).sort((a, b) => a.localeCompare(b, 'id'));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const payload = {
        title,
        subject,
        examCode,
        description,
        durationMinutes,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        questionCount,
        kkm,
        shuffleQuestions,
        shuffleOptions,
        allowStudentViewResult,
        isPublished,
        requireFullscreen,
        detectTabSwitch,
        detectWindowBlur,
        blockCopyPaste,
        maxViolations,
        violationAction,
        proctorPin,
        questionIds: selectedQIds,
        targetClasses,
      };
      if (editingId) {
        await api.request(`/api/teacher/exams/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await api.request('/api/teacher/exams', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setModalOpen(false);
      await loadAll();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan ujian.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.request(`/api/teacher/exams/${id}`, { method: 'DELETE' });
      setExams((prev) => prev.filter((e) => e.id !== id));
    } catch (err: any) {
      setError(err.message || 'Gagal menghapus ujian.');
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1500);
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Manajemen Ujian & Jadwal
          </h2>
          <p className="text-sm text-slate-500">
            Atur kode ujian, jadwal aktif server, durasi, KKM, izin tampil nilai, dan pilihan soal.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Ujian Baru</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-36 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : exams.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <p className="text-sm text-slate-600">
            Belum ada ujian. Klik tombol Buat Ujian Baru untuk memulai.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            Buat Ujian Sekarang
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {exams.map((exam) => (
            <article
              key={exam.id}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
            >
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                    <span
                      className={`font-semibold ${
                        exam.isPublished ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {exam.isPublished ? 'Dipublikasikan' : 'Draf Terkunci'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{exam.subject}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {exam.allowStudentViewResult
                        ? 'Hasil Ditampilkan ke Siswa'
                        : 'Hasil Disembunyikan'}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    {exam.title}
                  </h3>
                  {exam.description && (
                    <p className="text-sm text-slate-600">{exam.description}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => copyCode(exam.examCode)}
                    className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-xs font-mono font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <span>{exam.examCode}</span>
                    <Copy className="w-3.5 h-3.5" />
                    {copiedCode === exam.examCode && (
                      <span className="font-sans font-medium text-emerald-700">Disalin</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(exam)}
                    className="px-3 py-2 border border-slate-200 hover:border-blue-600 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(exam.id)}
                    className="px-3 py-2 border border-red-200 hover:bg-red-50 text-red-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-3 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400 block">Kelas Peserta</span>
                  <span className="font-semibold text-slate-900">
                    {exam.targetClasses && exam.targetClasses.length > 0
                      ? exam.targetClasses.join(', ')
                      : 'Semua Kelas'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Durasi</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {exam.durationMinutes} Menit
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Soal / Bank</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {exam.questionCount} / {exam.questionIds?.length || 0}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">KKM</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {exam.kkm}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Batas Pelanggaran</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {exam.maxViolations}x ({exam.violationAction === 'suspend' ? 'Tangguhkan' : 'Kirim Otomatis'})
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block">Jadwal Aktif Server</span>
                  <span className="font-medium text-slate-800 tabular-nums">
                    {formatDateTime(exam.startTime)} — {formatDateTime(exam.endTime)}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-lg font-bold text-slate-900">
                {editingId ? 'Edit Konfigurasi Ujian' : 'Buat Ujian Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Judul Ujian
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Contoh: Penilaian Akhir Semester Matematika"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mata Pelajaran (dari Bank Soal)
                  </label>
                  <select
                    required
                    value={subject}
                    onChange={(e) => handleSubjectChange(e.target.value)}
                    disabled={modalSubjectOptions.length === 0}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    {modalSubjectOptions.length === 0 ? (
                      <option value="">
                        Belum ada mata pelajaran di Bank Soal
                      </option>
                    ) : (
                      modalSubjectOptions.map((subj) => (
                        <option key={subj.name} value={subj.name}>
                          {subj.name} ({subj.count} soal)
                        </option>
                      ))
                    )}
                  </select>
                  {bankSubjectOptions.length === 0 && (
                    <p className="text-xs text-amber-700 mt-1">
                      Tambahkan atau unggah soal terlebih dahulu di menu Bank Soal agar mata pelajaran muncul di sini.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kode Ujian Unik (Untuk Masuk Siswa)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={examCode}
                      onChange={(e) => setExamCode(e.target.value.toUpperCase())}
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono uppercase"
                    />
                    <button
                      type="button"
                      onClick={generateCode}
                      className="px-3 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Acak</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jadwal Mulai
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jadwal Selesai
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Durasi Pengerjaan (Menit)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={360}
                    required
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Jumlah Soal Tampil
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      required
                      value={questionCount}
                      onChange={(e) => setQuestionCount(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      KKM (0–100)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      required
                      value={kkm}
                      onChange={(e) => setKkm(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Instruksi Tambahan (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-700" />
                    <span className="text-xs font-bold text-slate-900">
                      Kelas yang Diujikan
                    </span>
                    <span className="text-xs font-semibold text-blue-700">
                      {targetClasses.length === 0
                        ? 'Semua Kelas (Terbuka)'
                        : `${targetClasses.length} Kelas Dipilih`}
                    </span>
                  </div>
                  {targetClasses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTargetClasses([])}
                      className="text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer"
                    >
                      Atur ke Semua Kelas
                    </button>
                  )}
                </div>

                <p className="text-xs text-slate-500">
                  Pilih satu atau lebih kelas untuk membatasi peserta ujian. Biarkan kosong jika ujian terbuka untuk semua kelas.
                </p>

                {classOptions.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {classOptions.map((cls) => {
                      const checked = targetClasses.some(
                        (c) => c.toLowerCase() === cls.toLowerCase()
                      );
                      return (
                        <button
                          key={cls}
                          type="button"
                          onClick={() => toggleTargetClass(cls)}
                          className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 text-left transition-colors cursor-pointer ${
                            checked
                              ? 'bg-blue-50 border-blue-600 text-blue-800'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-blue-400'
                          }`}
                        >
                          {checked ? (
                            <CheckSquare className="w-4 h-4 text-blue-700 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <span className="truncate">{cls}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    Belum ada data kelas dari akun siswa. Anda dapat menambahkan nama kelas secara manual di bawah ini.
                  </p>
                )}

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <input
                    type="text"
                    value={customClassInput}
                    onChange={(e) => setCustomClassInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomClass();
                      }
                    }}
                    placeholder="Tambah nama kelas lain (contoh: XI-RPL-1)"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomClass}
                    className="px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Kelas</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
                    className="w-4 h-4 text-blue-700"
                  />
                  <span className="font-medium text-slate-800">Publikasikan Ujian (Aktif)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowStudentViewResult}
                    onChange={(e) => setAllowStudentViewResult(e.target.checked)}
                    className="w-4 h-4 text-blue-700"
                  />
                  <span className="font-medium text-slate-800">Izinkan Siswa Melihat Nilai Akhir</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shuffleQuestions}
                    onChange={(e) => setShuffleQuestions(e.target.checked)}
                    className="w-4 h-4 text-blue-700"
                  />
                  <span className="font-medium text-slate-800">Acak Urutan Soal per Siswa</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shuffleOptions}
                    onChange={(e) => setShuffleOptions(e.target.checked)}
                    className="w-4 h-4 text-blue-700"
                  />
                  <span className="font-medium text-slate-800">Acak Opsi Pilihan Ganda</span>
                </label>
              </div>

              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-3">
                <h4 className="text-xs font-bold text-slate-900">
                  Pengaturan Exam Mode & Penanganan Pelanggaran
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requireFullscreen}
                      onChange={(e) => setRequireFullscreen(e.target.checked)}
                      className="w-4 h-4 text-blue-700"
                    />
                    <span>Wajib Fullscreen saat Mulai Ujian</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={detectTabSwitch}
                      onChange={(e) => setDetectTabSwitch(e.target.checked)}
                      className="w-4 h-4 text-blue-700"
                    />
                    <span>Deteksi Perpindahan Tab (Page Visibility)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={detectWindowBlur}
                      onChange={(e) => setDetectWindowBlur(e.target.checked)}
                      className="w-4 h-4 text-blue-700"
                    />
                    <span>Deteksi Pindah Aplikasi / Window Blur</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={blockCopyPaste}
                      onChange={(e) => setBlockCopyPaste(e.target.checked)}
                      className="w-4 h-4 text-blue-700"
                    />
                    <span>Blokir Copy, Paste & Klik Kanan</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Batas Pelanggaran
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={maxViolations}
                      onChange={(e) => setMaxViolations(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tindakan Otomatis
                    </label>
                    <select
                      value={violationAction}
                      onChange={(e) =>
                        setViolationAction(e.target.value as 'suspend' | 'auto_submit')
                      }
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
                    >
                      <option value="suspend">Tangguhkan & Minta Verifikasi Guru</option>
                      <option value="auto_submit">Kunci & Kirim Jawaban Otomatis</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      PIN Verifikasi Guru
                    </label>
                    <input
                      type="text"
                      required
                      minLength={4}
                      value={proctorPin}
                      onChange={(e) => setProctorPin(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Pilih Soal dari Bank Soal ({selectedQIds.length} dipilih)
                  </label>
                  <div className="flex items-center gap-3">
                    {questions.length > 0 && subject.trim() && (
                      <button
                        type="button"
                        onClick={() => setShowAllBankSubjects((prev) => !prev)}
                        className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                      >
                        {showAllBankSubjects
                          ? `Filter: ${subject}`
                          : 'Tampilkan Semua Mapel'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const visibleIds = modalQuestions.map((q) => q.id);
                        const allVisibleSelected =
                          visibleIds.length > 0 &&
                          visibleIds.every((id) => selectedQIds.includes(id));
                        if (allVisibleSelected) {
                          setSelectedQIds((prev) =>
                            prev.filter((id) => !visibleIds.includes(id))
                          );
                        } else {
                          setSelectedQIds((prev) =>
                            Array.from(new Set([...prev, ...visibleIds]))
                          );
                        }
                      }}
                      className="text-xs font-semibold text-blue-700 cursor-pointer"
                    >
                      {modalQuestions.length > 0 &&
                      modalQuestions.every((q) => selectedQIds.includes(q.id))
                        ? 'Kosongkan Pilihan'
                        : 'Pilih Semua Soal'}
                    </button>
                  </div>
                </div>

                <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {modalQuestions.length === 0 ? (
                    <div className="p-4 text-xs text-slate-500 text-center">
                      {questions.length === 0
                        ? 'Bank soal masih kosong. Tambahkan soal di menu Bank Soal terlebih dahulu.'
                        : `Belum ada soal untuk mata pelajaran "${subject}" di Bank Soal.`}
                    </div>
                  ) : (
                    modalQuestions.map((q) => {
                      const checked = selectedQIds.includes(q.id);
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => toggleQuestion(q.id)}
                          className="w-full px-3.5 py-2.5 text-left flex items-start gap-2.5 hover:bg-slate-50 cursor-pointer"
                        >
                          {checked ? (
                            <CheckSquare className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-slate-900 line-clamp-1">
                              {q.prompt}
                            </p>
                            <p className="text-xs text-slate-500">
                              {q.type.toUpperCase()} · {q.subject} · {q.points} poin
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Konfigurasi Ujian'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
