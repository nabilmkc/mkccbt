import { useEffect, useState } from 'react';
import { AlertTriangle, LockOpen, ShieldAlert } from 'lucide-react';
import { api, formatDateTime } from '../lib/api';
import { ExamItem, ViolationLogRow } from '../types/cbt';

const VIOLATION_TYPE_LABELS: Record<string, string> = {
  tab_switch: 'Pindah Tab / Halaman Tersembunyi',
  window_blur: 'Fokus Jendela Berpindah',
  fullscreen_exit: 'Keluar Mode Layar Penuh',
  blocked_shortcut: 'Pintasan Terlarang / Klik Kanan',
  proctor_unlock: 'Verifikasi Guru (Buka Penangguhan)',
};

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  warning: { label: 'Peringatan Tampil', cls: 'text-amber-700' },
  suspended: { label: 'Ujian Ditangguhkan', cls: 'text-red-700' },
  auto_submitted: { label: 'Dikirim Otomatis', cls: 'text-red-700' },
  unlocked_by_teacher: { label: 'Dibuka oleh Guru', cls: 'text-emerald-700' },
};

export function AuditLogView() {
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [logs, setLogs] = useState<ViolationLogRow[]>([]);
  const [examId, setExamId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async (filterExamId: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = filterExamId !== 'all' ? `?examId=${filterExamId}` : '';
      const res = await api.request<{
        exams: ExamItem[];
        logs: ViolationLogRow[];
      }>(`/api/teacher/violations${qs}`);
      setExams(res.exams);
      setLogs(res.logs);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat audit log pelanggaran.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs(examId);
  }, [examId]);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Audit Log Pelanggaran Exam Mode
          </h2>
          <p className="text-sm text-slate-500">
            Rekaman kronologis setiap aktivitas meninggalkan halaman ujian, keluar fullscreen, dan verifikasi guru.
          </p>
        </div>

        <select
          value={examId}
          onChange={(e) => setExamId(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
        >
          <option value="all">Semua Ujian</option>
          {exams.map((ex) => (
            <option key={ex.id} value={String(ex.id)}>
              {ex.examCode} — {ex.title}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Memuat catatan audit log...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <ShieldAlert className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm text-slate-600">
              Belum ada catatan pelanggaran pada ujian ini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Timestamp Server</th>
                  <th className="py-3 px-4">Siswa</th>
                  <th className="py-3 px-4">Ujian</th>
                  <th className="py-3 px-4">Jenis Aktivitas</th>
                  <th className="py-3 px-4">Keterangan</th>
                  <th className="py-3 px-4">Tindakan Sistem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const act = ACTION_LABELS[log.actionTaken] || {
                    label: log.actionTaken,
                    cls: 'text-slate-700',
                  };
                  const isUnlock = log.violationType === 'proctor_unlock';
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {formatDateTime(log.occurredAt)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {log.studentName}
                        </div>
                        <div className="text-xs text-slate-500">
                          @{log.studentUsername} · {log.studentClass}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-bold text-blue-700">
                          {log.examCode}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                          {isUnlock ? (
                            <LockOpen className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          )}
                          <span>
                            {VIOLATION_TYPE_LABELS[log.violationType] ||
                              log.violationType}
                          </span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-xs">
                        {log.description}
                      </td>
                      <td className={`py-3 px-4 text-xs font-semibold ${act.cls}`}>
                        {act.label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
