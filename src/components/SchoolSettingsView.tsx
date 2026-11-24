import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  RotateCcw,
  Save,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import { SchoolSettings } from '../types/cbt';

interface SchoolSettingsViewProps {
  onUpdated?: (settings: SchoolSettings) => void;
}

const LOCKED_FOOTER_TEXT = '© Fikrul MKC · MKC CBT';

export function SchoolSettingsView({ onUpdated }: SchoolSettingsViewProps) {
  const [schoolName, setSchoolName] = useState('SDN 09 SADANIANG');
  const [examTheme, setExamTheme] = useState('Tes Akhir Semester');
  const [academicYear, setAcademicYear] = useState('Tahun Pelajaran 2026/2027');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.request<{ settings: SchoolSettings }>(
        '/api/admin/school-settings'
      );
      setSchoolName(res.settings.schoolName);
      setExamTheme(res.settings.examTheme);
      setAcademicYear(res.settings.academicYear);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat pengaturan sekolah.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await api.request<{ settings: SchoolSettings }>(
        '/api/admin/school-settings',
        {
          method: 'PUT',
          body: JSON.stringify({
            schoolName,
            examTheme,
            academicYear,
          }),
        }
      );
      setSchoolName(res.settings.schoolName);
      setExamTheme(res.settings.examTheme);
      setAcademicYear(res.settings.academicYear);
      setSuccess(
        'Pengaturan nama sekolah dan tema ujian berhasil disimpan dan langsung aktif di halaman depan.'
      );
      onUpdated?.(res.settings);
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan pengaturan sekolah.');
    } finally {
      setSaving(false);
    }
  };

  const applyDefaults = () => {
    setSchoolName('SDN 09 SADANIANG');
    setExamTheme('Tes Akhir Semester');
    setAcademicYear('Tahun Pelajaran 2026/2027');
    setSuccess(null);
    setError(null);
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-slate-500">
        Memuat pengaturan sekolah...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Identitas Sekolah & Tema Ujian Portal
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Teks yang diatur di sini ditampilkan pada halaman depan login siswa, portal ujian, dan kartu peserta cetak.
            </p>
          </div>
          <button
            type="button"
            onClick={applyDefaults}
            className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Contoh Default</span>
          </button>
        </div>

        {/* Live Preview of Front Portal Header */}
        <div className="rounded-xl overflow-hidden border border-slate-200 bg-white">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Pratinjau Tampilan Header Halaman Depan</span>
            </span>
            <span className="font-mono text-slate-400">Live Preview</span>
          </div>
          <div className="bg-[#009b4d] text-white px-5 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-white/95 p-0.5 flex items-center justify-center shrink-0">
                <img
                  src="/assets/aistudio/Kabupaten_mempawah_29057062.png"
                  alt={`Logo ${schoolName || 'SEKOLAH'}`}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="font-display font-bold text-base sm:text-lg tracking-wide truncate">
                {schoolName || 'NAMA SEKOLAH'}
              </div>
            </div>
            <div className="font-mono text-xs sm:text-sm tabular-nums text-emerald-50 shrink-0">
              08.30.00
            </div>
          </div>
          <div className="px-5 py-2.5 bg-gradient-to-r from-[#f7ead9] via-[#f8fafc] to-[#f4e4d4] border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="font-display font-bold text-sm sm:text-base text-[#1d63b8]">
              {examTheme || 'Tema Ujian'}
            </div>
            {academicYear && (
              <div className="text-xs text-slate-600">{academicYear}</div>
            )}
          </div>
          <div className="px-5 py-2.5 bg-white text-xs text-slate-500 flex items-center justify-between">
            <span>{LOCKED_FOOTER_TEXT}</span>
            <span>Status CBT · Sinkronisasi Server Aktif</span>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Nama Sekolah <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="Contoh: SDN 09 SADANIANG"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Muncul di bilah atas hijau halaman login & portal siswa.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Tema / Nama Kegiatan Ujian <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={examTheme}
                onChange={(e) => setExamTheme(e.target.value)}
                placeholder="Contoh: Tes Akhir Semester"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
              <p className="text-xs text-slate-500 mt-1">
                Contoh lain: Penilaian Tengah Semester, Asesmen Sumatif Akhir Tahun, Try Out.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Tahun Pelajaran / Keterangan
              </label>
              <input
                type="text"
                maxLength={80}
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="Contoh: Tahun Pelajaran 2026/2027"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan Sekolah'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
