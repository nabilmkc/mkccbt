import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  LockOpen,
  RotateCcw,
  Save,
  ShieldAlert,
  X,
} from 'lucide-react';
import { api, formatDateTime, formatDurationSeconds } from '../lib/api';
import { ExamItem, ResultSessionRow, ViolationLogRow } from '../types/cbt';

interface SessionDetailResponse {
  session: any;
  exam: ExamItem;
  student: { id: number; name: string; username: string; className: string } | null;
  items: Array<{
    questionId: number;
    type: string;
    prompt: string;
    imageData?: string | null;
    options: Array<{ key: string; text: string }>;
    correctAnswer: string;
    maxPoints: number;
    studentAnswer: string;
    isFlagged: boolean;
    autoPoints: number;
    manualPoints: number;
    isCorrect: boolean | null;
  }>;
  violations: ViolationLogRow[];
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  in_progress: { label: 'Sedang Mengerjakan', cls: 'text-blue-700' },
  suspended: { label: 'Ditangguhkan', cls: 'text-red-700' },
  submitted: { label: 'Selesai', cls: 'text-emerald-700' },
  timed_out: { label: 'Waktu Habis (Terkunci)', cls: 'text-amber-700' },
};

export function ResultsView() {
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [sessions, setSessions] = useState<ResultSessionRow[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [manualGrades, setManualGrades] = useState<Record<number, number>>({});
  const [teacherNotes, setTeacherNotes] = useState('');
  const [savingGrade, setSavingGrade] = useState(false);

  const loadResults = async (examIdParam?: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs =
        examIdParam && examIdParam !== 'all' ? `?examId=${examIdParam}` : '';
      const res = await api.request<{
        exams: ExamItem[];
        sessions: ResultSessionRow[];
      }>(`/api/teacher/results${qs}`);
      setExams(res.exams);
      setSessions(res.sessions);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data hasil ujian.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResults(selectedExamId);
  }, [selectedExamId]);

  const stats = useMemo(() => {
    const finished = sessions.filter(
      (s) => s.status === 'submitted' || s.status === 'timed_out'
    );
    if (finished.length === 0) {
      return { count: 0, avg: 0, max: 0, min: 0, passRate: 0 };
    }
    const scores = finished.map((s) => s.finalScore);
    const passed = finished.filter((s) => s.passedKkm).length;
    return {
      count: finished.length,
      avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      max: Math.max(...scores),
      min: Math.min(...scores),
      passRate: Math.round((passed / finished.length) * 100),
    };
  }, [sessions]);

  const openDetail = async (sessionId: number) => {
    setDetailLoading(true);
    try {
      const res = await api.request<SessionDetailResponse>(
        `/api/teacher/results/${sessionId}`
      );
      setDetail(res);
      const initialGrades: Record<number, number> = {};
      res.items.forEach((it) => {
        if (it.type === 'uraian') {
          initialGrades[it.questionId] = it.manualPoints || 0;
        }
      });
      setManualGrades(initialGrades);
      setTeacherNotes(res.session.teacherNotes || '');
    } catch (err: any) {
      setError(err.message || 'Gagal memuat lembar jawaban.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSaveGrades = async () => {
    if (!detail) return;
    setSavingGrade(true);
    try {
      const grades = Object.entries(manualGrades).map(([qId, pts]) => ({
        questionId: Number(qId),
        manualPoints: pts,
      }));
      await api.request(`/api/teacher/results/${detail.session.id}/grade`, {
        method: 'POST',
        body: JSON.stringify({ grades, teacherNotes }),
      });
      setDetail(null);
      await loadResults(selectedExamId);
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan nilai uraian.');
    } finally {
      setSavingGrade(false);
    }
  };

  const handleUnlock = async (sessionId: number) => {
    try {
      await api.request(`/api/teacher/results/${sessionId}/unlock`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await loadResults(selectedExamId);
    } catch (err: any) {
      setError(err.message || 'Gagal membuka penangguhan.');
    }
  };

  const handleResetAttempt = async (sessionId: number) => {
    try {
      await api.request(`/api/teacher/results/${sessionId}`, {
        method: 'DELETE',
      });
      await loadResults(selectedExamId);
    } catch (err: any) {
      setError(err.message || 'Gagal mereset sesi siswa.');
    }
  };

  const exportCsv = () => {
    const header = [
      'Username',
      'Nama Siswa',
      'Kelas',
      'Kode Ujian',
      'Judul Ujian',
      'Status',
      'Durasi (detik)',
      'Pelanggaran',
      'Nilai Akhir',
      'KKM',
      'Ketuntasan',
      'Waktu Selesai',
    ];
    const rows = sessions.map((s) => [
      s.studentUsername,
      `"${s.studentName.replaceAll('"', '""')}"`,
      `"${s.studentClass.replaceAll('"', '""')}"`,
      s.examCode,
      `"${s.examTitle.replaceAll('"', '""')}"`,
      STATUS_LABELS[s.status]?.label || s.status,
      s.durationSeconds,
      s.violationCount,
      s.finalScore,
      s.kkm,
      s.passedKkm ? 'Lulus KKM' : 'Belum Lulus',
      s.submittedAt ? formatDateTime(s.submittedAt) : '-',
    ]);
    const csvContent =
      [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hasil-cbt-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Hasil Ujian, Statistik & Koreksi Uraian
          </h2>
          <p className="text-sm text-slate-500">
            Pantau status pengerjaan, durasi, pelanggaran, nilai akhir, dan koreksi soal uraian.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
          >
            <option value="all">Semua Ujian</option>
            {exams.map((ex) => (
              <option key={ex.id} value={String(ex.id)}>
                {ex.examCode} — {ex.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportCsv}
            disabled={sessions.length === 0}
            className="px-3.5 py-2 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor CSV</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Peserta Selesai</span>
          <p className="font-display text-xl font-bold text-slate-900 tabular-nums mt-1">
            {stats.count}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Rata-rata Nilai</span>
          <p className="font-display text-xl font-bold text-blue-700 tabular-nums mt-1">
            {stats.avg}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Nilai Tertinggi</span>
          <p className="font-display text-xl font-bold text-emerald-700 tabular-nums mt-1">
            {stats.max}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Nilai Terendah</span>
          <p className="font-display text-xl font-bold text-slate-900 tabular-nums mt-1">
            {stats.min}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 col-span-2 lg:col-span-1">
          <span className="text-xs text-slate-500">Ketuntasan KKM</span>
          <p className="font-display text-xl font-bold text-slate-900 tabular-nums mt-1">
            {stats.passRate}%
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Memuat data hasil ujian...
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Belum ada peserta yang mengerjakan ujian ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Siswa</th>
                  <th className="py-3 px-4">Ujian</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Durasi</th>
                  <th className="py-3 px-4 text-right">Pelanggaran</th>
                  <th className="py-3 px-4 text-right">Nilai</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((s) => {
                  const st = STATUS_LABELS[s.status] || {
                    label: s.status,
                    cls: 'text-slate-700',
                  };
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {s.studentName}
                        </div>
                        <div className="text-xs text-slate-500">
                          @{s.studentUsername} · {s.studentClass}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-xs font-bold text-blue-700">
                          {s.examCode}
                        </div>
                        <div className="text-xs text-slate-600 max-w-xs truncate">
                          {s.examTitle}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className={`text-xs font-semibold ${st.cls}`}>
                          {st.label}
                        </div>
                        <div className="text-xs text-slate-400 tabular-nums">
                          {s.submittedAt
                            ? formatDateTime(s.submittedAt)
                            : `Mulai ${formatDateTime(s.startedAt)}`}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                        {formatDurationSeconds(s.durationSeconds)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        <span
                          className={`text-xs font-semibold ${
                            s.violationCount > 0 ? 'text-amber-700' : 'text-slate-600'
                          }`}
                        >
                          {s.violationCount}x
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        <div className="font-display font-bold text-slate-900">
                          {s.finalScore}
                        </div>
                        <div
                          className={`text-xs font-medium ${
                            s.passedKkm ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {s.passedKkm ? `Tuntas (>=${s.kkm})` : `Di bawah KKM (${s.kkm})`}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {s.status === 'suspended' && (
                            <button
                              type="button"
                              onClick={() => handleUnlock(s.id)}
                              title="Buka penangguhan ujian siswa"
                              className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-md text-xs font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <LockOpen className="w-3.5 h-3.5" />
                              <span>Buka</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openDetail(s.id)}
                            className="px-2.5 py-1.5 border border-slate-200 hover:border-blue-600 text-slate-700 rounded-md text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Koreksi</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResetAttempt(s.id)}
                            title="Reset percobaan siswa"
                            className="p-1.5 border border-red-200 hover:bg-red-50 text-red-700 rounded-md cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            {detailLoading || !detail ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Memuat lembar jawaban siswa...
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                  <div>
                    <h3 className="font-display text-lg font-bold text-slate-900">
                      Lembar Jawaban: {detail.student?.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      @{detail.student?.username} · {detail.exam.title} · Skor saat ini:{' '}
                      <strong className="text-blue-700">{detail.session.finalScore}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetail(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {detail.items.map((item, idx) => (
                    <div
                      key={item.questionId}
                      className="p-4 rounded-xl border border-slate-200 space-y-2.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-blue-700">
                          Soal #{idx + 1} · {item.type.toUpperCase()}
                        </span>
                        <span className="font-mono text-slate-500 tabular-nums">
                          Maks {item.maxPoints} poin
                        </span>
                      </div>
                      <p className="text-sm text-slate-900 whitespace-pre-wrap">
                        {item.prompt}
                      </p>

                      {item.imageData && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 flex justify-start">
                          <img
                            src={item.imageData}
                            alt={`Ilustrasi soal ${idx + 1}`}
                            referrerPolicy="no-referrer"
                            className="max-h-52 w-auto rounded object-contain"
                          />
                        </div>
                      )}

                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                        <div>
                          <span className="font-semibold text-slate-700">
                            Jawaban Siswa:{' '}
                          </span>
                          <span className="text-slate-900 whitespace-pre-wrap">
                            {item.studentAnswer || '(Kosong)'}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-700">
                            {item.type === 'uraian' ? 'Rubrik Guru: ' : 'Kunci: '}
                          </span>
                          <span className="text-slate-600">{item.correctAnswer}</span>
                        </div>
                      </div>

                      {item.type === 'uraian' ? (
                        <div className="flex items-center justify-between gap-4 pt-1">
                          <label className="text-xs font-semibold text-slate-700">
                            Beri Nilai Uraian (0 – {item.maxPoints}):
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={item.maxPoints}
                            value={manualGrades[item.questionId] ?? 0}
                            onChange={(e) =>
                              setManualGrades((prev) => ({
                                ...prev,
                                [item.questionId]: Number(e.target.value),
                              }))
                            }
                            className="w-24 px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          {item.isCorrect ? (
                            <span className="text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Benar (+{item.autoPoints} poin)
                            </span>
                          ) : (
                            <span className="text-red-700 flex items-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              Salah (0 poin)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan Guru untuk Siswa (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={teacherNotes}
                    onChange={(e) => setTeacherNotes(e.target.value)}
                    placeholder="Berikan umpan balik singkat..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setDetail(null)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg cursor-pointer"
                  >
                    Tutup
                  </button>
                  <button
                    type="button"
                    disabled={savingGrade}
                    onClick={handleSaveGrades}
                    className="px-5 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{savingGrade ? 'Menyimpan...' : 'Simpan Nilai & Catatan'}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
