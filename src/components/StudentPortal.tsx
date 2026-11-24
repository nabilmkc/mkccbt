import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Flag,
  Lock,
  LogOut,
  Maximize2,
  Send,
  ShieldAlert,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { api, formatDateTime, formatDurationSeconds } from '../lib/api';
import {
  AuthUser,
  ExamLookupResponse,
  PublicPortalInfo,
  StudentAnswerDraft,
  StudentExamQuestion,
} from '../types/cbt';

type StudentStage =
  | 'code'
  | 'instructions'
  | 'exam'
  | 'finished';

interface StudentPortalProps {
  user: AuthUser;
  initialLookup: ExamLookupResponse | null;
  portalInfo?: PublicPortalInfo | null;
  onLogout: () => void;
}

interface StartedSessionPayload {
  session: {
    id: number;
    examId: number;
    status: 'in_progress' | 'suspended' | 'submitted' | 'timed_out';
    startedAt: string;
    serverEndTime: string;
    submittedAt: string | null;
    lastSavedAt: string;
    violationCount: number;
    finalScore: number | null;
    essayGraded: boolean;
  };
  examConfig: {
    id: number;
    title: string;
    subject: string;
    examCode: string;
    kkm: number;
    allowStudentViewResult: boolean;
    requireFullscreen: boolean;
    detectTabSwitch: boolean;
    detectWindowBlur: boolean;
    blockCopyPaste: boolean;
    maxViolations: number;
    violationAction: 'suspend' | 'auto_submit';
  };
  questions: StudentExamQuestion[];
  answers: Array<{
    questionId: number;
    answerText: string;
    isFlagged: boolean;
    updatedAt: string;
  }>;
  serverNow: string;
}

interface ResultPayload {
  session: {
    id: number;
    status: string;
    startedAt: string;
    submittedAt: string | null;
    violationCount: number;
    totalQuestions: number;
    answeredCount: number;
    allowStudentViewResult: boolean;
    finalScore: number | null;
    autoScore: number | null;
    essayScore: number | null;
    maxPossibleScore: number | null;
    kkm: number;
    passedKkm: boolean | null;
    essayGraded: boolean;
    teacherNotes: string;
  };
  exam: {
    id: number;
    title: string;
    subject: string;
    examCode: string;
  };
}

interface HistoryRow {
  id: number;
  examId: number;
  examTitle: string;
  subject: string;
  examCode: string;
  status: string;
  startedAt: string;
  submittedAt: string | null;
  violationCount: number;
  allowStudentViewResult: boolean;
  finalScore: number | null;
  kkm: number;
}

export function StudentPortal({
  user,
  initialLookup,
  portalInfo,
  onLogout,
}: StudentPortalProps) {
  const [stage, setStage] = useState<StudentStage>(
    initialLookup ? 'instructions' : 'code'
  );
  const [examCodeInput, setExamCodeInput] = useState(
    initialLookup?.exam.examCode || ''
  );
  const [lookupData, setLookupData] = useState<ExamLookupResponse | null>(
    initialLookup
  );
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const [sessionData, setSessionData] = useState<StartedSessionPayload | null>(null);
  const [answersMap, setAnswersMap] = useState<Record<number, StudentAnswerDraft>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [startingExam, setStartingExam] = useState(false);

  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'offline'>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  const [violationCount, setViolationCount] = useState(0);
  const [sessionStatus, setSessionStatus] = useState<
    'in_progress' | 'suspended' | 'submitted' | 'timed_out'
  >('in_progress');
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [warningReason, setWarningReason] = useState('');

  const [proctorPin, setProctorPin] = useState('');
  const [proctorError, setProctorError] = useState<string | null>(null);
  const [proctorLoading, setProctorLoading] = useState(false);

  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultData, setResultData] = useState<ResultPayload | null>(null);

  const answersRef = useRef(answersMap);
  answersRef.current = answersMap;
  const lastViolationAtRef = useRef<number>(0);
  const autoSubmittedRef = useRef<boolean>(false);
  const saveTimerRef = useRef<number | null>(null);
  const questionCardRef = useRef<HTMLElement | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.request<{ history: HistoryRow[] }>(
        '/api/student/history'
      );
      setHistory(res.history);
    } catch {
      // ignore non-critical history error
    }
  }, []);

  useEffect(() => {
    if (stage === 'code') {
      loadHistory();
    }
  }, [stage, loadHistory]);

  const handleLookup = async (e?: React.FormEvent, codeOverride?: string) => {
    e?.preventDefault();
    const code = (codeOverride ?? examCodeInput).trim().toUpperCase();
    if (!code) return;
    setLookupLoading(true);
    setLookupError(null);
    try {
      const res = await api.request<ExamLookupResponse>(
        '/api/student/exam-lookup',
        {
          method: 'POST',
          body: JSON.stringify({ examCode: code }),
        }
      );
      setLookupData(res);
      setExamCodeInput(res.exam.examCode);

      if (
        res.existingSession &&
        (res.existingSession.status === 'submitted' ||
          res.existingSession.status === 'timed_out')
      ) {
        const resultRes = await api.request<ResultPayload>(
          `/api/student/sessions/${res.existingSession.id}/result`
        );
        setResultData(resultRes);
        setStage('finished');
      } else {
        setStage('instructions');
      }
    } catch (err: any) {
      setLookupError(err.message || 'Kode ujian tidak ditemukan.');
    } finally {
      setLookupLoading(false);
    }
  };

  const requestFullscreenSafe = async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Browser or iframe may block programmatic fullscreen in some policies
    }
  };

  const exitFullscreenSafe = async () => {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  };

  const handleStartExam = async () => {
    if (!lookupData) return;
    setStartingExam(true);
    setLookupError(null);

    if (lookupData.exam.requireFullscreen) {
      await requestFullscreenSafe();
    }

    try {
      const res = await api.request<StartedSessionPayload>(
        `/api/student/exams/${lookupData.exam.id}/start`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      if (
        res.session.status === 'submitted' ||
        res.session.status === 'timed_out'
      ) {
        const resultRes = await api.request<ResultPayload>(
          `/api/student/sessions/${res.session.id}/result`
        );
        setResultData(resultRes);
        setStage('finished');
        return;
      }

      const initialMap: Record<number, StudentAnswerDraft> = {};
      res.questions.forEach((q) => {
        initialMap[q.id] = {
          questionId: q.id,
          answerText: '',
          isFlagged: false,
        };
      });
      res.answers.forEach((a) => {
        initialMap[a.questionId] = {
          questionId: a.questionId,
          answerText: a.answerText,
          isFlagged: a.isFlagged,
        };
      });

      // Recover unsent offline draft if present in localStorage
      const draftKey = `sakaujian_draft_${res.session.id}`;
      try {
        const rawLocal = localStorage.getItem(draftKey);
        if (rawLocal) {
          const parsedLocal = JSON.parse(rawLocal) as Record<
            string,
            StudentAnswerDraft
          >;
          Object.values(parsedLocal).forEach((item) => {
            if (
              initialMap[item.questionId] &&
              !initialMap[item.questionId].answerText &&
              item.answerText
            ) {
              initialMap[item.questionId] = item;
            }
          });
        }
      } catch {
        // ignore storage error
      }

      const offset = new Date(res.serverNow).getTime() - Date.now();
      setServerOffsetMs(offset);
      const endMs = new Date(res.session.serverEndTime).getTime();
      setRemainingSeconds(
        Math.max(0, Math.floor((endMs - (Date.now() + offset)) / 1000))
      );

      setSessionData(res);
      setAnswersMap(initialMap);
      setCurrentIdx(0);
      setViolationCount(res.session.violationCount);
      setSessionStatus(res.session.status);
      setLastSavedTime(res.session.lastSavedAt);
      setSaveStatus('saved');
      autoSubmittedRef.current = false;
      setStage('exam');
    } catch (err: any) {
      setLookupError(err.message || 'Gagal memulai sesi ujian.');
    } finally {
      setStartingExam(false);
    }
  };

  const syncAnswersToServer = useCallback(
    async (sessionId: number, currentMap: Record<number, StudentAnswerDraft>) => {
      const payload = Object.values(currentMap);
      try {
        localStorage.setItem(
          `sakaujian_draft_${sessionId}`,
          JSON.stringify(currentMap)
        );
      } catch {
        // ignore quota errors
      }

      if (!navigator.onLine) {
        setSaveStatus('offline');
        return;
      }

      setSaveStatus('saving');
      try {
        const res = await api.request<{
          locked: boolean;
          status: 'in_progress' | 'suspended' | 'submitted' | 'timed_out';
          savedAt: string;
          serverNow: string;
        }>(`/api/student/sessions/${sessionId}/autosave`, {
          method: 'POST',
          body: JSON.stringify({ answers: payload }),
        });
        setSaveStatus('saved');
        setLastSavedTime(res.savedAt);
        setServerOffsetMs(new Date(res.serverNow).getTime() - Date.now());

        if (res.status === 'submitted' || res.status === 'timed_out') {
          setSessionStatus(res.status);
          const resultRes = await api.request<ResultPayload>(
            `/api/student/sessions/${sessionId}/result`
          );
          localStorage.removeItem(`sakaujian_draft_${sessionId}`);
          setResultData(resultRes);
          await exitFullscreenSafe();
          setStage('finished');
        } else if (res.status === 'suspended') {
          setSessionStatus('suspended');
        }
      } catch {
        setSaveStatus('offline');
      }
    },
    []
  );

  const handleAnswerChange = (
    questionId: number,
    patch: Partial<StudentAnswerDraft>
  ) => {
    if (!sessionData || sessionStatus !== 'in_progress') return;
    setAnswersMap((prev) => {
      const next: Record<number, StudentAnswerDraft> = {
        ...prev,
        [questionId]: {
          ...(prev[questionId] || {
            questionId,
            answerText: '',
            isFlagged: false,
          }),
          ...patch,
        },
      };
      try {
        localStorage.setItem(
          `sakaujian_draft_${sessionData.session.id}`,
          JSON.stringify(next)
        );
      } catch {
        // ignore
      }
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        syncAnswersToServer(sessionData.session.id, next);
      }, 600);
      return next;
    });
  };

  const handleFinalizeSubmit = useCallback(async () => {
    if (!sessionData || submitting) return;
    setSubmitting(true);
    try {
      const payload = Object.values(answersRef.current);
      const res = await api.request<ResultPayload>(
        `/api/student/sessions/${sessionData.session.id}/submit`,
        {
          method: 'POST',
          body: JSON.stringify({ answers: payload }),
        }
      );
      localStorage.removeItem(`sakaujian_draft_${sessionData.session.id}`);
      setConfirmSubmitOpen(false);
      setResultData(res);
      await exitFullscreenSafe();
      setStage('finished');
    } catch (err: any) {
      setLookupError(err.message || 'Gagal mengirim jawaban ujian.');
    } finally {
      setSubmitting(false);
    }
  }, [sessionData, submitting]);

  // Server-synchronized countdown timer + periodic autosave
  useEffect(() => {
    if (stage !== 'exam' || !sessionData) return;

    const endMs = new Date(sessionData.session.serverEndTime).getTime();
    const tick = window.setInterval(() => {
      const nowServer = Date.now() + serverOffsetMs;
      const secs = Math.max(0, Math.floor((endMs - nowServer) / 1000));
      setRemainingSeconds(secs);
      if (secs <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        handleFinalizeSubmit();
      }
    }, 1000);

    const periodicSave = window.setInterval(() => {
      if (sessionStatus === 'in_progress') {
        syncAnswersToServer(sessionData.session.id, answersRef.current);
      }
    }, 15000);

    const handleOnline = () => {
      syncAnswersToServer(sessionData.session.id, answersRef.current);
    };
    window.addEventListener('online', handleOnline);

    return () => {
      window.clearInterval(tick);
      window.clearInterval(periodicSave);
      window.removeEventListener('online', handleOnline);
    };
  }, [
    stage,
    sessionData,
    serverOffsetMs,
    sessionStatus,
    syncAnswersToServer,
    handleFinalizeSubmit,
  ]);

  // Violation reporting helper (debounced to prevent double-counting single focus loss)
  const reportViolation = useCallback(
    async (violationType: string, description: string) => {
      if (
        stage !== 'exam' ||
        !sessionData ||
        sessionStatus !== 'in_progress'
      ) {
        return;
      }

      const now = Date.now();
      if (now - lastViolationAtRef.current < 1500) {
        return;
      }
      lastViolationAtRef.current = now;

      setWarningReason(description);
      setWarningModalOpen(true);

      try {
        const res = await api.request<{
          status: 'in_progress' | 'suspended' | 'submitted' | 'timed_out';
          violationCount: number;
          maxViolations: number;
          actionTaken: string;
        }>(`/api/student/sessions/${sessionData.session.id}/violations`, {
          method: 'POST',
          body: JSON.stringify({ violationType, description }),
        });

        setViolationCount(res.violationCount);
        setSessionStatus(res.status);

        if (res.status === 'submitted' || res.status === 'timed_out') {
          setWarningModalOpen(false);
          const resultRes = await api.request<ResultPayload>(
            `/api/student/sessions/${sessionData.session.id}/result`
          );
          localStorage.removeItem(`sakaujian_draft_${sessionData.session.id}`);
          setResultData(resultRes);
          await exitFullscreenSafe();
          setStage('finished');
        }
      } catch {
        // Keep local warning visible even if network momentarily drops
      }
    },
    [stage, sessionData, sessionStatus]
  );

  // Exam Mode listeners: Page Visibility API, blur/focus, fullscreenchange, copy/paste, navigation guard
  useEffect(() => {
    if (stage !== 'exam' || !sessionData) return;
    const cfg = sessionData.examConfig;

    const onVisibilityChange = () => {
      if (cfg.detectTabSwitch && document.hidden) {
        reportViolation(
          'tab_switch',
          'Siswa berpindah tab atau meminimalkan halaman ujian (Page Visibility).'
        );
      }
    };

    const onWindowBlur = () => {
      if (cfg.detectWindowBlur && !document.hidden) {
        reportViolation(
          'window_blur',
          'Fokus jendela ujian berpindah ke jendela atau aplikasi lain.'
        );
      }
    };

    const onFullscreenChange = () => {
      if (cfg.requireFullscreen && !document.fullscreenElement) {
        reportViolation(
          'fullscreen_exit',
          'Siswa keluar dari mode layar penuh (Fullscreen) saat ujian berlangsung.'
        );
      }
    };

    const onBlockClipboard = (e: ClipboardEvent | MouseEvent) => {
      if (cfg.blockCopyPaste) {
        e.preventDefault();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!cfg.blockCopyPaste) return;
      const key = e.key.toLowerCase();
      if (
        (e.ctrlKey || e.metaKey) &&
        ['c', 'v', 'x', 'u', 'p', 's'].includes(key)
      ) {
        e.preventDefault();
      }
      if (e.key === 'F12') {
        e.preventDefault();
      }
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.history.pushState(null, '', window.location.href);
    const onPopState = () => {
      window.history.pushState(null, '', window.location.href);
      reportViolation(
        'tab_switch',
        'Mencoba melakukan navigasi kembali di peramban saat ujian berlangsung.'
      );
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('copy', onBlockClipboard as EventListener);
    document.addEventListener('cut', onBlockClipboard as EventListener);
    document.addEventListener('paste', onBlockClipboard as EventListener);
    document.addEventListener('contextmenu', onBlockClipboard as EventListener);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('copy', onBlockClipboard as EventListener);
      document.removeEventListener('cut', onBlockClipboard as EventListener);
      document.removeEventListener('paste', onBlockClipboard as EventListener);
      document.removeEventListener('contextmenu', onBlockClipboard as EventListener);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
    };
  }, [stage, sessionData, reportViolation]);

  const handleReturnToExam = async () => {
    setWarningModalOpen(false);
    if (sessionData?.examConfig.requireFullscreen) {
      await requestFullscreenSafe();
    }
  };

  const handleVerifyProctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionData) return;
    setProctorLoading(true);
    setProctorError(null);
    try {
      const res = await api.request<{
        unlocked: boolean;
        status: 'in_progress' | 'suspended' | 'submitted' | 'timed_out';
        message: string;
      }>(`/api/student/sessions/${sessionData.session.id}/verify-proctor`, {
        method: 'POST',
        body: JSON.stringify({ pin: proctorPin }),
      });

      setProctorPin('');
      if (res.unlocked) {
        setSessionStatus('in_progress');
        setWarningModalOpen(false);
        if (sessionData.examConfig.requireFullscreen) {
          await requestFullscreenSafe();
        }
      } else {
        const resultRes = await api.request<ResultPayload>(
          `/api/student/sessions/${sessionData.session.id}/result`
        );
        setResultData(resultRes);
        await exitFullscreenSafe();
        setStage('finished');
      }
    } catch (err: any) {
      setProctorError(err.message || 'PIN verifikasi guru salah.');
    } finally {
      setProctorLoading(false);
    }
  };

  const handleCheckUnlockStatus = async () => {
    if (!sessionData) return;
    try {
      const res = await api.request<StartedSessionPayload>(
        `/api/student/exams/${sessionData.examConfig.id}/start`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );
      setSessionStatus(res.session.status);
      if (res.session.status === 'in_progress') {
        setWarningModalOpen(false);
        if (sessionData.examConfig.requireFullscreen) {
          await requestFullscreenSafe();
        }
      }
    } catch {
      // ignore
    }
  };

  const summaryCounts = useMemo(() => {
    if (!sessionData) return { total: 0, answered: 0, flagged: 0, unanswered: 0 };
    const total = sessionData.questions.length;
    let answered = 0;
    let flagged = 0;
    sessionData.questions.forEach((q) => {
      const d = answersMap[q.id];
      if (d?.answerText?.trim()) answered += 1;
      if (d?.isFlagged) flagged += 1;
    });
    return {
      total,
      answered,
      flagged,
      unanswered: total - answered,
    };
  }, [sessionData, answersMap]);

  const goToQuestion = useCallback(
    (index: number) => {
      if (!sessionData || sessionData.questions.length === 0) return;
      const clamped = Math.max(
        0,
        Math.min(sessionData.questions.length - 1, index)
      );
      setCurrentIdx(clamped);
      window.requestAnimationFrame(() => {
        questionCardRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    },
    [sessionData]
  );

  // =================== STAGE 1: KODE UJIAN ===================
  if (stage === 'code') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-[#009b4d] text-white px-4 sm:px-6 py-3.5">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-white/95 p-0.5 flex items-center justify-center shrink-0 shadow-xs">
                <img
                  src="/assets/aistudio/Kabupaten_mempawah_29057062.png"
                  alt={`Logo ${portalInfo?.schoolName || 'MKC CBT'}`}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <div className="font-display font-bold text-white truncate">
                  {portalInfo?.schoolName || 'MKC CBT'}
                </div>
                {portalInfo?.examTheme && (
                  <div className="text-xs text-emerald-100 truncate">
                    {portalInfo.examTheme}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm shrink-0">
              <span className="hidden sm:inline text-emerald-50">
                {user.name} · {user.className}
              </span>
              <button
                type="button"
                onClick={onLogout}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/25 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 space-y-6">
          <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5">
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-bold text-slate-900">
                Masukkan Kode Ujian
              </h1>
              <p className="text-sm text-slate-600">
                Halo <strong>{user.name}</strong>, masukkan kode ujian yang diberikan guru untuk melihat instruksi dan memulai asesmen.
              </p>
            </div>

            {lookupError && (
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {lookupError}
              </div>
            )}

            <form
              onSubmit={(e) => handleLookup(e)}
              className="flex flex-col sm:flex-row gap-3"
            >
              <input
                type="text"
                required
                value={examCodeInput}
                onChange={(e) => setExamCodeInput(e.target.value.toUpperCase())}
                placeholder="Contoh: UJIAN2026"
                className="flex-1 px-4 py-3 rounded-lg border border-slate-300 font-mono text-base uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                disabled={lookupLoading}
                className="px-6 py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-semibold text-sm rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                {lookupLoading ? 'Memeriksa...' : 'Buka Ujian'}
              </button>
            </form>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Riwayat Ujian Anda
              </h2>
            </div>
            {history.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Anda belum memiliki riwayat sesi ujian.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {h.examTitle}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                        Kode: <span className="font-mono font-bold text-blue-700">{h.examCode}</span> · {formatDateTime(h.startedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-semibold text-slate-700">
                        {h.status === 'in_progress'
                          ? 'Berlangsung'
                          : h.status === 'suspended'
                          ? 'Ditangguhkan'
                          : 'Selesai'}
                      </span>
                      {h.allowStudentViewResult && h.finalScore !== null && (
                        <span className="font-display font-bold text-sm text-blue-700 tabular-nums">
                          Nilai: {h.finalScore}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleLookup(undefined, h.examCode)}
                        className="px-3 py-1.5 border border-slate-200 hover:border-blue-600 rounded-md font-semibold text-slate-700 cursor-pointer"
                      >
                        Buka
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  // =================== STAGE 2: INSTRUKSI ===================
  if (stage === 'instructions' && lookupData) {
    const ex = lookupData.exam;
    const isOpen = lookupData.availability === 'open';
    const isResuming = lookupData.existingSession !== null;

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStage('code')}
              className="text-sm font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Ganti Kode Ujian</span>
            </button>
            <span className="text-xs text-slate-500 font-medium">
              {user.name} · @{user.username}
            </span>
          </div>
        </header>

        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="space-y-2 border-b border-slate-200 pb-5">
              <div className="text-xs font-semibold text-blue-700">
                {ex.subject} · Kode Ujian {ex.examCode}
              </div>
              <h1 className="font-display text-2xl font-bold text-slate-900">
                {ex.title}
              </h1>
              {ex.targetClasses && ex.targetClasses.length > 0 && (
                <p className="text-xs font-medium text-slate-600">
                  Kelas Peserta: <span className="text-slate-900 font-semibold">{ex.targetClasses.join(', ')}</span>
                </p>
              )}
              {ex.description && (
                <p className="text-sm text-slate-600">{ex.description}</p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-xs text-slate-500 block">Durasi Ujian</span>
                <strong className="font-display text-base text-slate-900 tabular-nums">
                  {ex.durationMinutes} Menit
                </strong>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-xs text-slate-500 block">Jumlah Soal</span>
                <strong className="font-display text-base text-slate-900 tabular-nums">
                  {ex.questionCount} Soal
                </strong>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-xs text-slate-500 block">Nilai KKM</span>
                <strong className="font-display text-base text-slate-900 tabular-nums">
                  {ex.kkm}
                </strong>
              </div>
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-xs text-slate-500 block">Batas Pelanggaran</span>
                <strong className="font-display text-base text-slate-900 tabular-nums">
                  {ex.maxViolations}x
                </strong>
              </div>
            </div>

            <div className="space-y-3 text-sm text-slate-700">
              <h2 className="font-display font-semibold text-slate-900">
                Tata Tertib & Ketentuan Exam Mode
              </h2>
              <ul className="space-y-2 list-disc pl-5 text-slate-600">
                <li>
                  Saat menekan <strong>MULAI UJIAN</strong>, halaman otomatis masuk mode layar penuh (Fullscreen).
                </li>
                <li>
                  Dilarang berpindah tab, membuka aplikasi lain, atau keluar dari mode layar penuh selama ujian berlangsung. Setiap pelanggaran dicatat beserta waktu kejadian.
                </li>
                <li>
                  Jika pelanggaran melebihi batas ({ex.maxViolations}x), ujian akan{' '}
                  <strong>
                    {ex.violationAction === 'suspend'
                      ? 'ditangguhkan hingga diverifikasi oleh guru pengawas'
                      : 'dikunci dan jawaban dikirim otomatis'}
                  </strong>
                  . Jawaban yang sudah diisi tetap aman tersimpan.
                </li>
                <li>
                  Timer berjalan mengikuti <strong>waktu server</strong>. Apabila waktu habis, ujian terkunci dan jawaban terkirim otomatis.
                </li>
                <li>
                  <strong>Privasi terjaga:</strong> Aplikasi tidak mengakses kamera, mikrofon, atau data pribadi di perangkat Anda.
                </li>
              </ul>
            </div>

            {!isOpen && (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
                {lookupData.availability === 'before_schedule'
                  ? `Ujian belum dapat dibuka sebelum jadwal mulai (${formatDateTime(ex.startTime)}).`
                  : `Jadwal pelaksanaan ujian telah berakhir (${formatDateTime(ex.endTime)}).`}
              </div>
            )}

            {lookupError && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {lookupError}
              </div>
            )}

            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Jadwal aktif: {formatDateTime(ex.startTime)} – {formatDateTime(ex.endTime)}
              </p>
              <button
                type="button"
                disabled={!isOpen || startingExam}
                onClick={handleStartExam}
                className="px-6 py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
                <span>
                  {startingExam
                    ? 'Menyiapkan Ruang Ujian...'
                    : isResuming
                    ? 'LANJUTKAN UJIAN'
                    : 'MULAI UJIAN'}
                </span>
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // =================== STAGE 4: SELESAI ===================
  if (stage === 'finished' && resultData) {
    const s = resultData.session;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900">
                Ujian Selesai & Jawaban Terkirim
              </h1>
              <p className="text-sm text-slate-500">{resultData.exam.title}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500 block">Status Pengiriman</span>
              <strong className="text-emerald-700 font-semibold">
                {s.status === 'timed_out' ? 'Terkunci Otomatis (Waktu Habis)' : 'Terkirim Resmi'}
              </strong>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500 block">Waktu Selesai</span>
              <strong className="text-slate-900 font-medium tabular-nums">
                {formatDateTime(s.submittedAt)}
              </strong>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500 block">Soal Terjawab</span>
              <strong className="text-slate-900 font-semibold tabular-nums">
                {s.answeredCount} / {s.totalQuestions}
              </strong>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500 block">Catatan Pelanggaran</span>
              <strong className="text-slate-900 font-semibold tabular-nums">
                {s.violationCount}x
              </strong>
            </div>
          </div>

          {s.allowStudentViewResult ? (
            <div className="p-5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2 text-center">
              <span className="text-xs font-semibold text-blue-800">
                Nilai Akhir Anda
              </span>
              <div className="font-display text-4xl font-extrabold text-blue-700 tabular-nums">
                {s.finalScore ?? 0}
              </div>
              <p
                className={`text-sm font-semibold ${
                  s.passedKkm ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {s.passedKkm
                  ? `Tuntas / Memenuhi KKM (${s.kkm})`
                  : `Belum Mencapai KKM (${s.kkm})`}
              </p>
              {!s.essayGraded && (
                <p className="text-xs text-slate-600">
                  Catatan: Soal uraian masih menunggu koreksi manual oleh guru.
                </p>
              )}
              {s.teacherNotes && (
                <p className="text-xs text-slate-700 pt-2 border-t border-blue-200">
                  Catatan Guru: {s.teacherNotes}
                </p>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600 text-center">
              Hasil nilai tidak ditampilkan secara langsung. Silakan menunggu publikasi nilai resmi dari guru pengampu.
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setStage('code');
                setLookupData(null);
                setSessionData(null);
              }}
              className="flex-1 py-2.5 px-4 border border-slate-300 hover:bg-slate-50 text-slate-800 text-sm font-semibold rounded-lg cursor-pointer"
            >
              Kembali ke Daftar Kode Ujian
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg cursor-pointer"
            >
              Keluar Akun
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =================== STAGE 3: EXAM MODE & SOAL ===================
  if (!sessionData) return null;
  const activeQuestion = sessionData.questions[currentIdx];
  const activeDraft = activeQuestion
    ? answersMap[activeQuestion.id] || {
        questionId: activeQuestion.id,
        answerText: '',
        isFlagged: false,
      }
    : null;
  const isCriticalTime = remainingSeconds <= 300;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col select-none">
      {/* Top Exam Bar */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-sm sm:text-base font-bold text-slate-900 truncate">
              {sessionData.examConfig.title}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {user.name} · Kode {sessionData.examConfig.examCode}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-600">
              {saveStatus === 'offline' ? (
                <span className="text-amber-700 font-semibold flex items-center gap-1">
                  <WifiOff className="w-3.5 h-3.5" />
                  Tersimpan lokal (Offline)
                </span>
              ) : saveStatus === 'saving' ? (
                <span>Menyimpan...</span>
              ) : (
                <span className="text-emerald-700 font-medium">
                  Tersimpan otomatis{lastSavedTime ? ` · ${formatDateTime(lastSavedTime).split(',')[1] || ''}` : ''}
                </span>
              )}
            </div>

            <div className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 tabular-nums">
              Pelanggaran: {violationCount}/{sessionData.examConfig.maxViolations}
            </div>

            <div
              className={`px-3.5 py-1.5 rounded-lg font-mono text-sm font-bold tabular-nums flex items-center gap-1.5 border ${
                isCriticalTime
                  ? 'bg-red-50 border-red-300 text-red-700'
                  : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{formatDurationSeconds(remainingSeconds)}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Exam Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Mobile & Tablet Quick Number Picker (Always visible at top above question) */}
        <section
          aria-label="Pilih nomor soal"
          className="lg:hidden bg-white border border-slate-200 rounded-xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold text-slate-900">
              Pilih Nomor Soal
            </h2>
            <span className="text-xs text-slate-500 tabular-nums">
              Terjawab {summaryCounts.answered}/{summaryCounts.total}
            </span>
          </div>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
            {sessionData.questions.map((q, idx) => {
              const d = answersMap[q.id];
              const isAnswered = Boolean(d?.answerText?.trim());
              const isFlagged = Boolean(d?.isFlagged);
              const isActive = idx === currentIdx;

              let btnCls = 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50';
              if (isFlagged) {
                btnCls = 'bg-amber-50 border-amber-400 text-amber-900';
              } else if (isAnswered) {
                btnCls = 'bg-blue-700 border-blue-700 text-white';
              }

              return (
                <button
                  key={q.id}
                  type="button"
                  aria-label={`Pilih soal nomor ${idx + 1}`}
                  aria-current={isActive ? 'step' : undefined}
                  onClick={() => goToQuestion(idx)}
                  className={`h-9 rounded-lg border font-mono text-xs font-bold tabular-nums transition-colors cursor-pointer ${btnCls} ${
                    isActive ? 'ring-2 ring-blue-600 ring-offset-2' : ''
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </section>

        {/* Question Card */}
        <section
          ref={questionCardRef}
          className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 sm:p-7 scroll-mt-20"
        >
          {activeQuestion && activeDraft && (
            <div key={activeQuestion.id} className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="text-sm font-semibold text-blue-700 tabular-nums">
                  Soal Nomor {currentIdx + 1} dari {sessionData.questions.length}
                </div>
                <div className="text-xs text-slate-500 tabular-nums">
                  Bobot {activeQuestion.points} poin
                </div>
              </div>

              <div className="text-base text-slate-900 leading-relaxed whitespace-pre-wrap select-text">
                {activeQuestion.prompt}
              </div>

              {activeQuestion.imageData && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex justify-center">
                  <img
                    src={activeQuestion.imageData}
                    alt={`Gambar ilustrasi soal nomor ${currentIdx + 1}`}
                    referrerPolicy="no-referrer"
                    className="max-h-80 w-auto rounded-lg object-contain"
                  />
                </div>
              )}

              {activeQuestion.type === 'pg' && (
                <div className="space-y-2.5">
                  {activeQuestion.options.map((opt) => {
                    const selected = activeDraft.answerText === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() =>
                          handleAnswerChange(activeQuestion.id, {
                            answerText: opt.key,
                          })
                        }
                        className={`w-full text-left p-4 rounded-xl border transition-colors flex items-start gap-3 cursor-pointer ${
                          selected
                            ? 'bg-blue-50 border-blue-600 text-blue-950'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <span
                          className={`w-7 h-7 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                            selected
                              ? 'bg-blue-700 text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {opt.key}
                        </span>
                        <span className="text-sm leading-relaxed pt-0.5">
                          {opt.text}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {activeQuestion.type === 'benar_salah' && (
                <div className="grid grid-cols-2 gap-3">
                  {(['BENAR', 'SALAH'] as const).map((choice) => {
                    const selected = activeDraft.answerText === choice;
                    return (
                      <button
                        key={choice}
                        type="button"
                        onClick={() =>
                          handleAnswerChange(activeQuestion.id, {
                            answerText: choice,
                          })
                        }
                        className={`p-4 rounded-xl border font-semibold text-sm transition-colors cursor-pointer ${
                          selected
                            ? 'bg-blue-700 border-blue-700 text-white'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        {choice}
                      </button>
                    );
                  })}
                </div>
              )}

              {activeQuestion.type === 'isian' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Ketik Jawaban Singkat Anda:
                  </label>
                  <input
                    type="text"
                    value={activeDraft.answerText}
                    onChange={(e) =>
                      handleAnswerChange(activeQuestion.id, {
                        answerText: e.target.value,
                      })
                    }
                    placeholder="Tulis jawaban singkat di sini..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 select-text"
                  />
                </div>
              )}

              {activeQuestion.type === 'uraian' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Ketik Jawaban Uraian Anda:
                  </label>
                  <textarea
                    rows={6}
                    value={activeDraft.answerText}
                    onChange={(e) =>
                      handleAnswerChange(activeQuestion.id, {
                        answerText: e.target.value,
                      })
                    }
                    placeholder="Jelaskan jawaban Anda secara lengkap dan jelas..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 select-text"
                  />
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={currentIdx === 0}
                  onClick={() => goToQuestion(currentIdx - 1)}
                  className="px-4 py-2.5 border border-slate-300 disabled:opacity-40 hover:bg-slate-50 rounded-lg text-sm font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Sebelumnya</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleAnswerChange(activeQuestion.id, {
                      isFlagged: !activeDraft.isFlagged,
                    })
                  }
                  className={`px-4 py-2.5 rounded-lg border text-sm font-semibold flex items-center gap-1.5 cursor-pointer ${
                    activeDraft.isFlagged
                      ? 'bg-amber-50 border-amber-400 text-amber-800'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Flag className="w-4 h-4" />
                  <span>{activeDraft.isFlagged ? 'Ditandai Ragu-ragu' : 'Ragu-ragu'}</span>
                </button>

                {currentIdx < sessionData.questions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => goToQuestion(currentIdx + 1)}
                    className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Berikutnya</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmSubmitOpen(true)}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Kirim Jawaban</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Navigation Sidebar */}
        <aside className="lg:col-span-4 lg:sticky lg:top-20 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="hidden lg:block space-y-1">
            <h2 className="font-display text-sm font-bold text-slate-900">
              Pilih Nomor Soal
            </h2>
            <p className="text-xs text-slate-500 tabular-nums">
              Klik nomor mana saja untuk dikerjakan lebih dulu · Terjawab {summaryCounts.answered} dari {summaryCounts.total} soal
            </p>
          </div>

          <div className="hidden lg:grid grid-cols-5 gap-2">
            {sessionData.questions.map((q, idx) => {
              const d = answersMap[q.id];
              const isAnswered = Boolean(d?.answerText?.trim());
              const isFlagged = Boolean(d?.isFlagged);
              const isActive = idx === currentIdx;

              let btnCls = 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50';
              if (isFlagged) {
                btnCls = 'bg-amber-50 border-amber-400 text-amber-900';
              } else if (isAnswered) {
                btnCls = 'bg-blue-700 border-blue-700 text-white';
              }

              return (
                <button
                  key={q.id}
                  type="button"
                  aria-label={`Pilih soal nomor ${idx + 1}`}
                  aria-current={isActive ? 'step' : undefined}
                  onClick={() => goToQuestion(idx)}
                  className={`h-10 rounded-lg border font-mono text-xs font-bold tabular-nums transition-colors cursor-pointer ${btnCls} ${
                    isActive ? 'ring-2 ring-blue-600 ring-offset-2' : ''
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs text-slate-600 lg:pt-2 lg:border-t lg:border-slate-100">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-blue-700 inline-block" />
              <span>Terjawab</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-100 border border-amber-400 inline-block" />
              <span>Ragu-ragu</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-white border border-slate-300 inline-block" />
              <span>Kosong</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setConfirmSubmitOpen(true)}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Selesai & Kirim Jawaban</span>
          </button>
        </aside>
      </main>

      {/* Modal Peringatan Pelanggaran */}
      {warningModalOpen && sessionStatus === 'in_progress' && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 flex items-center justify-center p-4">
          <div className="bg-white border border-amber-300 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-base font-bold text-slate-900">
                  Peringatan Exam Mode
                </h3>
                <p className="text-sm font-medium text-amber-900">
                  Terdeteksi aktivitas meninggalkan halaman ujian. Silakan kembali ke ujian
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
              <p>Detail: {warningReason}</p>
              <p className="font-semibold text-slate-900 tabular-nums">
                Pelanggaran ke-{violationCount} dari batas maksimal{' '}
                {sessionData.examConfig.maxViolations}x.
              </p>
              <p className="text-emerald-700">
                Jawaban Anda tetap aman tersimpan dan tidak dihapus.
              </p>
            </div>

            <button
              type="button"
              onClick={handleReturnToExam}
              className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg cursor-pointer"
            >
              Kembali ke Ujian
            </button>
          </div>
        </div>
      )}

      {/* Overlay Ujian Ditangguhkan (Verifikasi Guru) */}
      {sessionStatus === 'suspended' && (
        <div className="fixed inset-0 z-50 bg-slate-900/85 flex items-center justify-center p-4">
          <div className="bg-white border border-red-300 rounded-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-red-900">
                  Ujian Ditangguhkan
                </h3>
                <p className="text-sm text-slate-600 mt-0.5">
                  Anda telah melewati batas pelanggaran ({violationCount}/
                  {sessionData.examConfig.maxViolations}). Jawaban tersimpan aman. Minta verifikasi guru pengawas untuk melanjutkan ujian.
                </p>
              </div>
            </div>

            {proctorError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {proctorError}
              </div>
            )}

            <form onSubmit={handleVerifyProctor} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  PIN Verifikasi Guru Pengawas
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={proctorPin}
                    onChange={(e) => setProctorPin(e.target.value)}
                    placeholder="Masukkan PIN guru"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono pr-10"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>
              <button
                type="submit"
                disabled={proctorLoading}
                className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {proctorLoading ? 'Memverifikasi...' : 'Verifikasi Guru & Lanjutkan'}
                </span>
              </button>
            </form>

            <button
              type="button"
              onClick={handleCheckUnlockStatus}
              className="w-full py-2 px-4 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
            >
              Cek Jika Guru Sudah Membuka dari Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Kirim */}
      {confirmSubmitOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-5">
            <div className="space-y-1">
              <h3 className="font-display text-lg font-bold text-slate-900">
                Konfirmasi Pengiriman Jawaban
              </h3>
              <p className="text-sm text-slate-600">
                Setelah dikirim, Anda tidak dapat mengubah jawaban kembali.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <div className="font-display text-lg font-bold text-blue-700 tabular-nums">
                  {summaryCounts.answered}
                </div>
                <div className="text-slate-600">Terjawab</div>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="font-display text-lg font-bold text-amber-700 tabular-nums">
                  {summaryCounts.flagged}
                </div>
                <div className="text-slate-600">Ragu-ragu</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="font-display text-lg font-bold text-slate-800 tabular-nums">
                  {summaryCounts.unanswered}
                </div>
                <div className="text-slate-600">Kosong</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(false)}
                className="flex-1 py-2.5 px-4 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg cursor-pointer"
              >
                Periksa Kembali
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleFinalizeSubmit}
                className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg cursor-pointer"
              >
                {submitting ? 'Mengirim...' : 'Ya, Kirim Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
