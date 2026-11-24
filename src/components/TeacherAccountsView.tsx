import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Plus,
  Search,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import { api, formatDateTime } from '../lib/api';
import { TeacherAccount } from '../types/cbt';

export function TeacherAccountsView() {
  const [teachers, setTeachers] = useState<TeacherAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [className, setClassName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadTeachers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.request<{ teachers: TeacherAccount[] }>(
        '/api/admin/teachers'
      );
      setTeachers(res.teachers);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat daftar akun guru.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeachers();
  }, []);

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.username.toLowerCase().includes(q) ||
        t.className.toLowerCase().includes(q) ||
        (t.email || '').toLowerCase().includes(q)
    );
  }, [teachers, search]);

  const openModal = () => {
    setUsername('');
    setName('');
    setClassName('');
    setEmail('');
    setPassword('');
    setFormError(null);
    setModalOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const res = await api.request<{ teacher: TeacherAccount }>(
        '/api/admin/teachers',
        {
          method: 'POST',
          body: JSON.stringify({
            username,
            name,
            className,
            email,
            password,
          }),
        }
      );
      setTeachers((prev) => [res.teacher, ...prev]);
      setModalOpen(false);
      setNotice(
        `Akun guru "${res.teacher.name}" (@${res.teacher.username}) berhasil ditambahkan.`
      );
    } catch (err: any) {
      setFormError(err.message || 'Gagal menambahkan akun guru.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (teacher: TeacherAccount) => {
    setError(null);
    try {
      await api.request(`/api/admin/teachers/${teacher.id}`, {
        method: 'DELETE',
      });
      setTeachers((prev) => prev.filter((t) => t.id !== teacher.id));
      setNotice(`Akun guru @${teacher.username} berhasil dihapus.`);
    } catch (err: any) {
      setError(err.message || 'Gagal menghapus akun guru.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Manajemen Akun Guru (Super Admin)
          </h2>
          <p className="text-sm text-slate-500">
            Tambahkan dan kelola akun guru. Setiap guru hanya dapat melihat serta mengelola soal buatannya sendiri, sedangkan Super Admin dapat memantau seluruh soal di Bank Soal.
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Akun Guru</span>
        </button>
      </div>

      {notice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama guru, username, atau mata pelajaran..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <span className="text-xs font-medium text-slate-500 tabular-nums">
          Total {filteredTeachers.length} akun guru terdaftar
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Memuat daftar akun guru...
          </div>
        ) : filteredTeachers.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <UserCog className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm text-slate-600">
              {teachers.length === 0
                ? 'Belum ada akun guru terdaftar.'
                : 'Tidak ada akun guru yang sesuai dengan pencarian.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Nama Lengkap</th>
                  <th className="py-3 px-4">Bidang / Mapel</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4 text-center">Bank Soal</th>
                  <th className="py-3 px-4 text-center">Ujian</th>
                  <th className="py-3 px-4">Terdaftar</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTeachers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono text-xs font-bold text-blue-700">
                      @{t.username}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {t.name}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{t.className}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {t.email || '—'}
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-800 tabular-nums">
                      {t.questionCount}
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-800 tabular-nums">
                      {t.examCount}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 tabular-nums">
                      {formatDateTime(t.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(t)}
                        className="px-2.5 py-1.5 border border-red-200 hover:bg-red-50 text-red-700 rounded-md text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-bold text-slate-900">
                Tambah Akun Guru Baru
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Username Login Guru
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Contoh: guru_budi"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono lowercase"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Lengkap &amp; Gelar
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Drs. Budi Hartono, M.Pd."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bidang / Mata Pelajaran Pengampu
                </label>
                <input
                  type="text"
                  required
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="Contoh: Matematika Wajib"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email (Opsional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contoh@sekolah.sch.id"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kata Sandi Login (Minimal 6 Karakter)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi akun guru"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Akun Guru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
