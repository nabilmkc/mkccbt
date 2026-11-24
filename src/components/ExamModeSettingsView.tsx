import { useEffect, useState } from 'react';
import { CheckCircle2, Info, Save, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { ExamItem } from '../types/cbt';

export function ExamModeSettingsView() {
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [requireFullscreen, setRequireFullscreen] = useState(true);
  const [detectTabSwitch, setDetectTabSwitch] = useState(true);
  const [detectWindowBlur, setDetectWindowBlur] = useState(true);
  const [blockCopyPaste, setBlockCopyPaste] = useState(true);
  const [maxViolations, setMaxViolations] = useState(3);
  const [violationAction, setViolationAction] = useState<'suspend' | 'auto_submit'>('suspend');
  const [proctorPin, setProctorPin] = useState('998877');
  const [allowStudentViewResult, setAllowStudentViewResult] = useState(false);

  const loadExams = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.request<{ exams: ExamItem[] }>('/api/teacher/exams');
      setExams(res.exams);
      if (res.exams.length > 0) {
        selectExam(res.exams[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat pengaturan Exam Mode.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, []);

  const selectExam = (exam: ExamItem) => {
    setSelectedId(exam.id);
    setRequireFullscreen(exam.requireFullscreen);
    setDetectTabSwitch(exam.detectTabSwitch);
    setDetectWindowBlur(exam.detectWindowBlur);
    setBlockCopyPaste(exam.blockCopyPaste);
    setMaxViolations(exam.maxViolations);
    setViolationAction(exam.violationAction);
    setProctorPin(exam.proctorPin);
    setAllowStudentViewResult(exam.allowStudentViewResult);
    setSavedMessage(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const current = exams.find((x) => x.id === selectedId);
    if (!current) return;
    setSaving(true);
    setSavedMessage(null);
    setError(null);
    try {
      await api.request(`/api/teacher/exams/${current.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...current,
          requireFullscreen,
          detectTabSwitch,
          detectWindowBlur,
          blockCopyPaste,
          maxViolations,
          violationAction,
          proctorPin,
          allowStudentViewResult,
        }),
      });
      setSavedMessage('Pengaturan Exam Mode berhasil disimpan ke database SQL.');
      const res = await api.request<{ exams: ExamItem[] }>('/api/teacher/exams');
      setExams(res.exams);
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-5 flex items-start gap-3.5">
        <Info className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
        <div className="text-sm text-slate-700 space-y-1">
          <p className="font-semibold text-slate-900">
            Catatan Arsitektur Keamanan & Keterbatasan Browser
          </p>
          <p>
            Web browser tidak dapat menjamin penguncian perangkat 100% (misalnya shortcut sistem operasi tingkat rendah atau multi-layar eksternal).
            Gunakan perangkat terkelola (kiosk / Chromebook Managed / Safe Exam Browser) untuk penguncian tingkat perangkat.
            Aplikasi ini tidak menggunakan kamera/mikrofon dan tidak mengambil data pribadi tanpa persetujuan.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
      ) : exams.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-600">
          Belum ada ujian. Silakan buat ujian pada menu Manajemen Ujian terlebih dahulu.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 font-display text-sm font-semibold text-slate-900">
              Pilih Ujian
            </div>
            <div className="divide-y divide-slate-100">
              {exams.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => selectExam(ex)}
                  className={`w-full px-4 py-3 text-left transition-colors cursor-pointer ${
                    selectedId === ex.id
                      ? 'bg-blue-50 text-blue-900'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <p className="text-sm font-semibold truncate">{ex.title}</p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {ex.examCode} · Batas {ex.maxViolations}x
                  </p>
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleSave}
            className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
          >
            <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3">
              <ShieldCheck className="w-5 h-5 text-blue-700" />
              <h2 className="font-display text-base font-bold text-slate-900">
                Konfigurasi Kiosk & Exam Mode
              </h2>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
            {savedMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{savedMessage}</span>
              </div>
            )}

            <div className="space-y-3 text-sm">
              <label className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={requireFullscreen}
                  onChange={(e) => setRequireFullscreen(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-blue-700"
                />
                <div>
                  <div className="font-semibold text-slate-900">
                    Aktifkan Fullscreen Wajib saat Mulai Ujian
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Layar otomatis masuk mode penuh saat siswa menekan MULAI UJIAN. Keluar dari fullscreen dicatat sebagai pelanggaran.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={detectTabSwitch}
                  onChange={(e) => setDetectTabSwitch(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-blue-700"
                />
                <div>
                  <div className="font-semibold text-slate-900">
                    Deteksi Perpindahan Tab (Page Visibility API)
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Mencatat timestamp ke server dan menampilkan peringatan saat tab ujian tidak lagi terlihat.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={detectWindowBlur}
                  onChange={(e) => setDetectWindowBlur(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-blue-700"
                />
                <div>
                  <div className="font-semibold text-slate-900">
                    Deteksi Blur / Perpindahan Window
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Mendeteksi saat fokus jendela berpindah ke aplikasi atau jendela lain.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={blockCopyPaste}
                  onChange={(e) => setBlockCopyPaste(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-blue-700"
                />
                <div>
                  <div className="font-semibold text-slate-900">
                    Cegah Salin-Tempel, Klik Kanan, dan Pintasan Navigasi
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Menonaktifkan copy/cut/paste, klik kanan, serta mencegah navigasi keluar halaman tanpa konfirmasi.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={allowStudentViewResult}
                  onChange={(e) => setAllowStudentViewResult(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-blue-700"
                />
                <div>
                  <div className="font-semibold text-slate-900">
                    Izinkan Siswa Melihat Nilai Setelah Selesai
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Jika nonaktif, siswa hanya menerima konfirmasi pengiriman berhasil dan menunggu publikasi nilai dari guru.
                  </p>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Batas Maksimal Pelanggaran
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={maxViolations}
                  onChange={(e) => setMaxViolations(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tindakan Melewati Batas
                </label>
                <select
                  value={violationAction}
                  onChange={(e) =>
                    setViolationAction(e.target.value as 'suspend' | 'auto_submit')
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  <option value="suspend">Tangguhkan Ujian (Verifikasi Guru)</option>
                  <option value="auto_submit">Kunci & Kirim Otomatis</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  PIN Verifikasi Pengawas
                </label>
                <input
                  type="text"
                  required
                  minLength={4}
                  value={proctorPin}
                  onChange={(e) => setProctorPin(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan Exam Mode'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
