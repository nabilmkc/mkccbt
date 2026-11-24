import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarCheck,
  CheckCircle2,
  KeyRound,
  Lock,
  RefreshCw,
  User,
  Users,
} from 'lucide-react';
import studentIllustration from '../assets/images/student_cbt_illustration_1794757646794.jpg';
import { api } from '../lib/api';
import {
  AuthUser,
  ExamLookupResponse,
  PublicPortalInfo,
  UserRole,
} from '../types/cbt';

interface LoginViewProps {
  portalInfo: PublicPortalInfo | null;
  onRefreshPortalInfo: () => Promise<void>;
  onSuccess: (params: {
    user: AuthUser;
    token: string;
    csrfToken: string;
    initialExamLookup?: ExamLookupResponse | null;
  }) => void;
}

function formatPortalClock(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
}

function formatPortalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}, ${formatPortalClock(date)}`;
}

export function LoginView({
  portalInfo,
  onRefreshPortalInfo,
  onSuccess,
}: LoginViewProps) {
  const [role, setRole] = useState<UserRole>('siswa');
  const [username, setUsername] = useState('');
  const [credential, setCredential] = useState('');
  const [examCode, setExamCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  // Server-synced live clock
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (portalInfo?.serverTime) {
      const serverMs = new Date(portalInfo.serverTime).getTime();
      if (!Number.isNaN(serverMs)) {
        setServerOffsetMs(serverMs - Date.now());
      }
    }
  }, [portalInfo?.serverTime]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const currentClockDate = useMemo(
    () => new Date(nowMs + serverOffsetMs),
    [nowMs, serverOffsetMs]
  );

  const schoolName = portalInfo?.schoolName || 'SDN 09 SADANIANG';
  const examTheme = portalInfo?.examTheme || 'Tes Akhir Semester';
  const academicYear =
    portalInfo?.academicYear || 'Tahun Pelajaran 2026/2027';
  const footerText = portalInfo?.footerText || '© Fikrul MKC · MKC CBT';
  const stats = portalInfo?.stats || {
    studentCount: 0,
    classCount: 0,
    examCount: 0,
    completedSessionCount: 0,
  };

  const handleRoleSwitch = (nextRole: UserRole) => {
    setRole(nextRole);
    setError(null);
    setUsername('');
    setCredential('');
    setExamCode('');
  };

  const handleRefreshStatus = async () => {
    setRefreshingStatus(true);
    setStatusMessage(null);
    try {
      await onRefreshPortalInfo();
      setStatusMessage('Status CBT diperbarui.');
      window.setTimeout(() => setStatusMessage(null), 2500);
    } finally {
      setRefreshingStatus(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.request<{
        token: string;
        csrfToken: string;
        user: AuthUser;
        initialExamLookup?: ExamLookupResponse | null;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          role,
          username,
          credential,
          examCode: role === 'siswa' ? examCode : undefined,
        }),
      });
      onSuccess({
        user: res.user,
        token: res.token,
        csrfToken: res.csrfToken,
        initialExamLookup: res.initialExamLookup || null,
      });
    } catch (err: any) {
      setError(err.message || 'Gagal masuk. Periksa kembali data login Anda.');
    } finally {
      setLoading(false);
    }
  };

  const isStaffMode = role !== 'siswa';

  return (
    <div className="min-h-screen bg-white flex flex-col text-slate-900">
      {/* Top Emerald School Header */}
      <header className="bg-[#009b4d] text-white px-5 sm:px-10 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-white/95 p-0.5 flex items-center justify-center shrink-0 shadow-xs">
              <img
                src="/assets/aistudio/Kabupaten_mempawah_29057062.png"
                alt={`Logo ${schoolName}`}
                className="w-full h-full object-contain"
              />
            </div>
            <span className="font-display text-base sm:text-xl font-bold tracking-wide truncate">
              {schoolName}
            </span>
          </div>
          <div className="font-mono text-sm sm:text-base font-medium tabular-nums text-emerald-50 shrink-0">
            {formatPortalClock(currentClockDate)}
          </div>
        </div>
      </header>

      {/* Curved Warm-Accent Sub-Banner for Exam Theme */}
      <div className="relative overflow-hidden bg-[#f8f9fa] border-b border-slate-200/80">
        <svg
          aria-hidden="true"
          viewBox="0 0 1440 80"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          <path
            d="M0,0 L420,0 C340,55 180,75 0,72 Z"
            fill="#f5e3d1"
            opacity="0.7"
          />
          <path
            d="M780,0 L1440,0 L1440,76 C1220,76 960,55 780,0 Z"
            fill="#f5e3d1"
            opacity="0.6"
          />
        </svg>
        <div className="relative max-w-6xl mx-auto px-5 sm:px-10 py-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-base sm:text-lg font-bold text-[#1d63b8]">
            {examTheme}
          </p>
          {academicYear && (
            <p className="text-xs sm:text-sm font-medium text-slate-600">
              {academicYear}
            </p>
          )}
        </div>
      </div>

      {/* Main Split Workspace */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-5 sm:px-10 py-8 lg:py-12 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
        {/* Left: Illustration & Quiet Footer */}
        <section className="lg:col-span-6 space-y-6">
          <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
            {!imgFailed ? (
              <img
                src={studentIllustration}
                alt={`Ilustrasi peserta ujian ${schoolName}`}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-auto max-h-[380px] object-cover block"
              />
            ) : (
              <div className="aspect-[4/3] w-full bg-gradient-to-br from-emerald-50 via-white to-sky-50 flex flex-col items-center justify-center p-8 text-center">
                <img
                  src="/assets/aistudio/Kabupaten_mempawah_29057062.png"
                  alt={`Logo ${schoolName}`}
                  className="w-16 h-16 object-contain mb-3"
                />
                <p className="font-display text-lg font-bold text-slate-900">
                  {schoolName}
                </p>
                <p className="text-sm text-slate-600 mt-1">{examTheme}</p>
              </div>
            )}
          </div>

          <div className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{footerText}</span>
          </div>
        </section>

        {/* Right: Clean Login Form + Status CBT */}
        <section className="lg:col-span-6 space-y-6">
          <div className="space-y-5">
            {/* Top-right Role Switcher Link */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-900">
                  {role === 'siswa'
                    ? 'Login Siswa'
                    : role === 'super_admin'
                    ? 'Login Super Admin'
                    : 'Login Guru'}
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                  {role === 'siswa'
                    ? 'Masukan username dan PIN/password yang diberi dari sekolah'
                    : role === 'super_admin'
                    ? 'Kelola akun guru, bank soal menyeluruh, dan identitas sekolah'
                    : 'Masuk untuk mengelola bank soal, jadwal ujian, dan penilaian'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRoleSwitch(isStaffMode ? 'siswa' : 'guru')}
                className="text-sm font-semibold text-[#1d63b8] hover:text-blue-800 hover:underline whitespace-nowrap shrink-0 cursor-pointer self-start pt-1"
              >
                {isStaffMode ? 'Login Siswa' : 'Login Guru / Admin'}
              </button>
            </div>

            {/* Staff Sub-Tabs when in Guru / Admin Mode */}
            {isStaffMode && (
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg max-w-xs">
                <button
                  type="button"
                  onClick={() => handleRoleSwitch('guru')}
                  className={`py-1.5 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    role === 'guru'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Akun Guru
                </button>
                <button
                  type="button"
                  onClick={() => handleRoleSwitch('super_admin')}
                  className={`py-1.5 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    role === 'super_admin'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Super Admin
                </button>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="relative">
                <input
                  type="text"
                  required
                  aria-label="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={
                    role === 'siswa'
                      ? 'Username / NIS'
                      : role === 'super_admin'
                      ? 'Username Super Admin'
                      : 'Username Guru'
                  }
                  className="w-full pl-3.5 pr-10 py-2.5 rounded border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
                <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  aria-label={role === 'siswa' ? 'PIN atau Password' : 'Password'}
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  placeholder={role === 'siswa' ? 'Password / PIN' : 'Password'}
                  className="w-full pl-3.5 pr-10 py-2.5 rounded border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {role === 'siswa' && (
                <div className="relative">
                  <input
                    type="text"
                    aria-label="Kode Ujian (opsional)"
                    value={examCode}
                    onChange={(e) => setExamCode(e.target.value.toUpperCase())}
                    placeholder="Kode Ujian (opsional, bisa diisi setelah masuk)"
                    className="w-full pl-3.5 pr-10 py-2 rounded border border-slate-200 bg-slate-50/70 text-slate-900 text-sm font-mono uppercase placeholder:normal-case placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 focus:bg-white"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              )}

              <div className="flex items-center justify-between gap-4 pt-1">
                <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#009b4d] focus:ring-[#009b4d]"
                  />
                  <span>Show Password</span>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="px-9 py-2.5 bg-[#009b4d] hover:bg-[#008240] disabled:opacity-60 text-white font-semibold text-sm rounded transition-colors cursor-pointer whitespace-nowrap"
                >
                  {loading ? 'Memproses...' : 'Login'}
                </button>
              </div>
            </form>
          </div>

          {/* Live Status CBT Block */}
          <div className="pt-4 border-t border-slate-200 space-y-2.5 text-sm">
            <div className="text-slate-600 font-medium">Status CBT :</div>

            <div className="text-slate-800">
              <span className="font-semibold">Tanggal & Waktu: </span>
              <span className="font-semibold text-[#1d63b8] tabular-nums">
                {formatPortalDateTime(currentClockDate)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-slate-800">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  Peserta Terdaftar :{' '}
                  <strong className="text-[#1d63b8] tabular-nums">
                    {stats.studentCount}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  Jumlah Kelas :{' '}
                  <strong className="text-[#1d63b8] tabular-nums">
                    {stats.classCount}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  Jadwal Ujian :{' '}
                  <strong className="text-[#1d63b8] tabular-nums">
                    {stats.examCount}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  Ujian Selesai :{' '}
                  <strong className="text-[#009b4d] tabular-nums">
                    {stats.completedSessionCount}
                  </strong>
                </span>
              </div>
            </div>

            <div className="pt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleRefreshStatus}
                disabled={refreshingStatus}
                className="px-4 py-2 bg-[#2583c9] hover:bg-[#1b6da8] disabled:opacity-60 text-white text-xs font-semibold rounded transition-colors inline-flex items-center gap-2 uppercase tracking-wide cursor-pointer whitespace-nowrap"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${refreshingStatus ? 'animate-spin' : ''}`}
                />
                <span>PERBAHARUI STATUS</span>
              </button>
              {statusMessage && (
                <span className="text-xs font-medium text-[#009b4d]">
                  {statusMessage}
                </span>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
