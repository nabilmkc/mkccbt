import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Save,
  ShieldCheck,
  User,
} from 'lucide-react';
import { api } from '../lib/api';
import { AuthUser } from '../types/cbt';

interface AdminAccountSettingsViewProps {
  user: AuthUser;
  onAccountUpdated?: (payload: {
    user: AuthUser;
    token: string;
    csrfToken: string;
  }) => void;
}

export function AdminAccountSettingsView({
  user,
  onAccountUpdated,
}: AdminAccountSettingsViewProps) {
  const [username, setUsername] = useState(user.username);
  const [name, setName] = useState(user.name);
  const [hasPassword, setHasPassword] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const loadAccount = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.request<{
          account: {
            id: number;
            username: string;
            name: string;
            email: string | null;
            hasPassword: boolean;
          };
        }>('/api/admin/account');
        setUsername(res.account.username);
        setName(res.account.name);
        setHasPassword(res.account.hasPassword);
      } catch (err: any) {
        setError(err.message || 'Gagal memuat informasi akun Super Admin.');
      } finally {
        setLoading(false);
      }
    };
    loadAccount();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cleanUsername = username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');

    if (cleanUsername.length < 3) {
      setError('Username Super Admin minimal 3 karakter.');
      return;
    }

    if (hasPassword && !currentPassword) {
      setError('Masukkan kata sandi saat ini untuk memverifikasi perubahan.');
      return;
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        setError('Kata sandi baru minimal 6 karakter.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('Konfirmasi kata sandi baru tidak cocok.');
        return;
      }
    }

    setSaving(true);
    try {
      const res = await api.request<{
        user: AuthUser;
        token: string;
        csrfToken: string;
      }>('/api/admin/account', {
        method: 'PUT',
        body: JSON.stringify({
          username: cleanUsername,
          name: name.trim(),
          currentPassword,
          newPassword: newPassword || undefined,
        }),
      });

      setUsername(res.user.username);
      setName(res.user.name);
      setHasPassword(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(
        `Pengaturan akun Super Admin berhasil disimpan. Username aktif sekarang: @${res.user.username}.`
      );
      onAccountUpdated?.(res);
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan pengaturan akun Super Admin.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-slate-500">
        Memuat pengaturan akun Super Admin...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Pengaturan Akun Super Admin
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Ubah username login dan kata sandi Super Admin untuk akses panel administrasi.
            </p>
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
                Username Login Super Admin <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={40}
                  value={username}
                  onChange={(e) =>
                    setUsername(
                      e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '')
                    )
                  }
                  placeholder="Contoh: adminutama"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Hanya huruf kecil, angka, titik (.), garis bawah (_), atau tanda hubung (-).
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Nama Tampilan Super Admin
              </label>
              <input
                type="text"
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Super Admin MKC CBT"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 space-y-4">
            {hasPassword && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Kata Sandi Saat Ini <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Masukkan kata sandi Super Admin saat ini"
                    className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    aria-label={
                      showCurrentPassword
                        ? 'Sembunyikan kata sandi saat ini'
                        : 'Tampilkan kata sandi saat ini'
                    }
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Kata Sandi Baru (Opsional)
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    minLength={6}
                    maxLength={64}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-3.5 pr-10 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    aria-label={
                      showNewPassword
                        ? 'Sembunyikan kata sandi baru'
                        : 'Tampilkan kata sandi baru'
                    }
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Kosongkan jika hanya ingin mengganti username atau nama tampilan.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Konfirmasi Kata Sandi Baru
                </label>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  maxLength={64}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi kata sandi baru"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
