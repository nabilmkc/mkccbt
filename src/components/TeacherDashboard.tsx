import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Database,
  GraduationCap,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { api, formatDateTime } from '../lib/api';
import { ExamItem, ViolationLogRow } from '../types/cbt';
import { TeacherTab } from './TeacherLayout';

interface DashboardResponse {
  stats: {
    totalExams: number;
    totalQuestions: number;
    totalStudents: number;
    totalSessions: number;
    activeOrSuspended: number;
    completedCount: number;
    averageScore: number;
    passRate: number;
    totalViolations: number;
  };
  recentExams: ExamItem[];
  recentViolations: ViolationLogRow[];
}

export function TeacherDashboard({
  onNavigate,
}: {
  onNavigate: (tab: TeacherTab) => void;
}) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.request<DashboardResponse>('/api/teacher/dashboard');
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700 flex items-center justify-between">
        <span>{error || 'Data dashboard tidak tersedia.'}</span>
        <button
          type="button"
          onClick={load}
          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 rounded-lg font-semibold cursor-pointer"
        >
          Muat Ulang
        </button>
      </div>
    );
  }

  const { stats } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Ujian & Bank Soal</span>
            <ClipboardList className="w-4 h-4 text-blue-700" />
          </div>
          <div className="font-display text-2xl font-bold text-slate-900 tabular-nums">
            {stats.totalExams} Ujian
          </div>
          <p className="text-xs text-slate-500 tabular-nums">
            {stats.totalQuestions} butir soal · {stats.totalStudents} siswa terdaftar
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Partisipasi Selesai</span>
            <Users className="w-4 h-4 text-blue-700" />
          </div>
          <div className="font-display text-2xl font-bold text-slate-900 tabular-nums">
            {stats.completedCount} / {stats.totalSessions}
          </div>
          <p className="text-xs text-slate-500 tabular-nums">
            {stats.activeOrSuspended} sesi sedang berjalan / ditangguhkan
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Rata-rata & Kelulusan KKM</span>
            <GraduationCap className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-display text-2xl font-bold text-slate-900 tabular-nums">
            {stats.averageScore}
          </div>
          <p className="text-xs text-emerald-700 font-medium tabular-nums flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{stats.passRate}% peserta tuntas KKM</span>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Pelanggaran Exam Mode</span>
            <ShieldAlert className="w-4 h-4 text-amber-600" />
          </div>
          <div className="font-display text-2xl font-bold text-slate-900 tabular-nums">
            {stats.totalViolations}
          </div>
          <p className="text-xs text-slate-500">
            Tercatat dengan timestamp server
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Daftar Ujian Terbaru
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('exams')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
            >
              <span>Semua Ujian</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {data.recentExams.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <Database className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm text-slate-600">
                Belum ada ujian yang dibuat. Mulai dengan menambahkan soal dan membuat jadwal ujian.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('exams')}
                className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Buat Ujian Pertama
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentExams.map((exam) => (
                <div
                  key={exam.id}
                  className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/70"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {exam.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      Kode: <span className="font-mono font-semibold text-blue-700">{exam.examCode}</span> · {exam.subject} · {exam.durationMinutes} menit · KKM {exam.kkm}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs">
                    <span
                      className={`font-semibold ${
                        exam.isPublished ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {exam.isPublished ? 'Aktif' : 'Draf'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate('results')}
                      className="px-2.5 py-1.5 border border-slate-200 hover:border-blue-600 rounded-md text-slate-700 font-medium cursor-pointer"
                    >
                      Lihat Hasil
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Aktivitas Pelanggaran Terbaru
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('audit-log')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
            >
              <span>Audit Log</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {data.recentViolations.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Belum ada pelanggaran Exam Mode yang tercatat.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentViolations.map((v) => (
                <div key={v.id} className="px-5 py-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 truncate">
                      {v.studentName} ({v.examCode})
                    </span>
                    <span className="text-xs text-slate-400 tabular-nums shrink-0">
                      {formatDateTime(v.occurredAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>{v.description}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
