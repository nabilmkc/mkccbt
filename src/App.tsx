import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { AdminAccountSettingsView } from './components/AdminAccountSettingsView';
import { AuditLogView } from './components/AuditLogView';
import { ExamManagementView } from './components/ExamManagementView';
import { ExamModeSettingsView } from './components/ExamModeSettingsView';
import { LoginView } from './components/LoginView';
import { QuestionBankView } from './components/QuestionBankView';
import { ResultsView } from './components/ResultsView';
import { SchoolSettingsView } from './components/SchoolSettingsView';
import { StudentAccountsView } from './components/StudentAccountsView';
import { StudentPortal } from './components/StudentPortal';
import { TeacherAccountsView } from './components/TeacherAccountsView';
import { TeacherDashboard } from './components/TeacherDashboard';
import { TeacherLayout, TeacherTab } from './components/TeacherLayout';
import { api } from './lib/api';
import { auth, testFirestoreConnection } from './lib/firebase';
import { AuthUser, ExamLookupResponse, PublicPortalInfo } from './types/cbt';

const SESSION_KEY = 'sakaujian_session_v1';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initialLookup, setInitialLookup] = useState<ExamLookupResponse | null>(
    null
  );
  const [portalInfo, setPortalInfo] = useState<PublicPortalInfo | null>(null);
  const [teacherTab, setTeacherTab] = useState<TeacherTab>('dashboard');
  const [booting, setBooting] = useState(true);

  const loadPortalInfo = async () => {
    try {
      const info = await api.request<PublicPortalInfo>('/api/public/portal-info');
      setPortalInfo(info);
    } catch {
      // ignore fallback
    }
  };

  useEffect(() => {
    testFirestoreConnection();
    const restore = async () => {
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) {
          return;
        }
        const parsed = JSON.parse(raw) as { token: string; csrfToken: string };
        if (parsed.token && parsed.token.startsWith('cbt.')) {
          api.setCredentials(parsed.token, parsed.csrfToken);
          const me = await api.request<{ user: AuthUser; csrfToken: string }>(
            '/api/auth/me'
          );
          api.setCredentials(parsed.token, me.csrfToken);
          sessionStorage.setItem(
            SESSION_KEY,
            JSON.stringify({ token: parsed.token, csrfToken: me.csrfToken })
          );
          setUser(me.user);
        }
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
        api.setCredentials(null, null);
      } finally {
        setBooting(false);
      }
    };
    loadPortalInfo();
    restore();

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser && !sessionStorage.getItem(SESSION_KEY)) {
        try {
          const idToken = await fbUser.getIdToken();
          api.setCredentials(idToken, null);
          const me = await api.request<{ user: AuthUser; csrfToken: string }>(
            '/api/auth/me'
          );
          api.setCredentials(idToken, me.csrfToken);
          setUser(me.user);
        } catch {
          api.setCredentials(null, null);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const handleAuthSuccess = (params: {
    user: AuthUser;
    token: string;
    csrfToken: string;
    initialExamLookup?: ExamLookupResponse | null;
  }) => {
    api.setCredentials(params.token, params.csrfToken);
    if (params.token.startsWith('cbt.')) {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ token: params.token, csrfToken: params.csrfToken })
      );
    }
    setInitialLookup(params.initialExamLookup || null);
    setUser(params.user);
    setTeacherTab('dashboard');
  };

  const handleLogout = async () => {
    sessionStorage.removeItem(SESSION_KEY);
    api.setCredentials(null, null);
    setUser(null);
    setInitialLookup(null);
    try {
      await signOut(auth);
    } catch {
      // ignore if not signed in with Firebase
    }
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-500">
          Memuat sistem asesmen MKC CBT...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView
        portalInfo={portalInfo}
        onRefreshPortalInfo={loadPortalInfo}
        onSuccess={handleAuthSuccess}
      />
    );
  }

  if (user.role === 'siswa') {
    return (
      <StudentPortal
        user={user}
        initialLookup={initialLookup}
        portalInfo={portalInfo}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <TeacherLayout
      user={user}
      activeTab={teacherTab}
      onTabChange={setTeacherTab}
      onLogout={handleLogout}
    >
      {teacherTab === 'dashboard' && (
        <TeacherDashboard onNavigate={setTeacherTab} />
      )}
      {teacherTab === 'questions' && <QuestionBankView user={user} />}
      {teacherTab === 'exams' && <ExamManagementView />}
      {teacherTab === 'exam-mode' && <ExamModeSettingsView />}
      {teacherTab === 'results' && <ResultsView />}
      {teacherTab === 'audit-log' && <AuditLogView />}
      {teacherTab === 'teachers' && user.role === 'super_admin' && (
        <TeacherAccountsView />
      )}
      {teacherTab === 'school-settings' && user.role === 'super_admin' && (
        <SchoolSettingsView
          onUpdated={(settings) => {
            setPortalInfo((prev) =>
              prev
                ? {
                    ...prev,
                    schoolName: settings.schoolName,
                    examTheme: settings.examTheme,
                    academicYear: settings.academicYear,
                    footerText: settings.footerText,
                  }
                : null
            );
            loadPortalInfo();
          }}
        />
      )}
      {teacherTab === 'admin-account' && user.role === 'super_admin' && (
        <AdminAccountSettingsView
          user={user}
          onAccountUpdated={(updated) => {
            setUser(updated.user);
            const raw = sessionStorage.getItem(SESSION_KEY);
            if (raw || updated.token.startsWith('cbt.')) {
              api.setCredentials(updated.token, updated.csrfToken);
              sessionStorage.setItem(
                SESSION_KEY,
                JSON.stringify({
                  token: updated.token,
                  csrfToken: updated.csrfToken,
                })
              );
            }
          }}
        />
      )}
      {teacherTab === 'students' && <StudentAccountsView />}
    </TeacherLayout>
  );
}
