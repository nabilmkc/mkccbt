import { ReactNode, useState } from 'react';
import {
  BarChart3,
  Building2,
  ClipboardList,
  Database,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldAlert,
  SlidersHorizontal,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { AuthUser } from '../types/cbt';

export type TeacherTab =
  | 'dashboard'
  | 'questions'
  | 'exams'
  | 'exam-mode'
  | 'results'
  | 'audit-log'
  | 'teachers'
  | 'school-settings'
  | 'admin-account'
  | 'students';

interface TeacherLayoutProps {
  user: AuthUser;
  activeTab: TeacherTab;
  onTabChange: (tab: TeacherTab) => void;
  onLogout: () => void;
  children: ReactNode;
}

const NAV_ITEMS: Array<{
  id: TeacherTab;
  label: string;
  icon: typeof LayoutDashboard;
  superAdminOnly?: boolean;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'questions', label: 'Bank Soal', icon: Database },
  { id: 'exams', label: 'Manajemen Ujian', icon: ClipboardList },
  { id: 'exam-mode', label: 'Pengaturan Exam Mode', icon: SlidersHorizontal },
  { id: 'results', label: 'Hasil & Penilaian', icon: BarChart3 },
  { id: 'audit-log', label: 'Audit Log Pelanggaran', icon: ShieldAlert },
  { id: 'teachers', label: 'Akun Guru', icon: UserCog, superAdminOnly: true },
  {
    id: 'school-settings',
    label: 'Pengaturan Sekolah',
    icon: Building2,
    superAdminOnly: true,
  },
  {
    id: 'admin-account',
    label: 'Pengaturan Super Admin',
    icon: KeyRound,
    superAdminOnly: true,
  },
  { id: 'students', label: 'Akun Siswa', icon: Users },
];

export function TeacherLayout({
  user,
  activeTab,
  onTabChange,
  onLogout,
  children,
}: TeacherLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isSuperAdmin = user.role === 'super_admin';
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.superAdminOnly || isSuperAdmin
  );
  const activeItem = visibleNavItems.find((i) => i.id === activeTab);

  const handleSelect = (tab: TeacherTab) => {
    onTabChange(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5 whitespace-nowrap">
            <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 p-0.5 flex items-center justify-center shrink-0">
              <img
                src="/assets/aistudio/Kabupaten_mempawah_29057062.png"
                alt="Logo Sekolah MKC CBT"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="font-display text-base font-bold text-slate-900 tracking-tight">
              MKC CBT
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
            aria-label="Tutup menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer text-left ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-700' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">
              {isSuperAdmin ? 'Super Admin' : 'Guru'} · @{user.username}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full py-2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar Sesi</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 sticky top-0 z-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline">
                {isSuperAdmin ? 'Panel Super Admin' : 'Panel Guru'}
              </span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-display font-semibold text-slate-900 truncate">
                {activeItem?.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onTabChange('exams')}
              className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Kelola Ujian
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
