import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  Download,
  Edit3,
  FileSpreadsheet,
  ImagePlus,
  Plus,
  Search,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { downloadWordTemplate } from '../lib/wordTemplate';
import { ParsedImportedQuestion, parseWordDocxFile } from '../lib/wordImport';
import { AuthUser, QuestionItem, QuestionOption, QuestionType } from '../types/cbt';

const TYPE_LABELS: Record<QuestionType, string> = {
  pg: 'Pilihan Ganda',
  isian: 'Isian Singkat',
  benar_salah: 'Benar / Salah',
  uraian: 'Uraian / Esai',
};

const DEFAULT_OPTIONS: QuestionOption[] = [
  { key: 'A', text: '' },
  { key: 'B', text: '' },
  { key: 'C', text: '' },
  { key: 'D', text: '' },
];

async function compressImageFile(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
    throw new Error('Format gambar harus PNG, JPG, WEBP, atau GIF.');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Ukuran file gambar maksimal 8 MB.');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });

  if (file.type === 'image/gif' && file.size <= 1.5 * 1024 * 1024) {
    return dataUrl;
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('File gambar tidak dapat diproses.'));
    el.src = dataUrl;
  });

  const maxW = 1200;
  const maxH = 900;
  const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
  const w = Math.max(1, Math.round(img.naturalWidth * ratio));
  const h = Math.max(1, Math.round(img.naturalHeight * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);

  const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return canvas.toDataURL(outputType, 0.86);
}

export function QuestionBankView({ user }: { user: AuthUser }) {
  const isSuperAdmin = user.role === 'super_admin';
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | QuestionType>('all');
  const [teacherFilter, setTeacherFilter] = useState<string>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [subject, setSubject] = useState('Informatika & Literasi Digital');
  const [type, setType] = useState<QuestionType>('pg');
  const [prompt, setPrompt] = useState('');
  const [imageData, setImageData] = useState<string>('');
  const [imageUrlInput, setImageUrlInput] = useState<string>('');
  const [imageProcessing, setImageProcessing] = useState(false);
  const [options, setOptions] = useState<QuestionOption[]>(DEFAULT_OPTIONS);
  const [correctAnswer, setCorrectAnswer] = useState('A');
  const [points, setPoints] = useState(10);
  const [difficulty, setDifficulty] = useState<'mudah' | 'sedang' | 'sulit'>('sedang');

  // Word Import & Template Modal state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importSubject, setImportSubject] = useState(
    'Informatika & Literasi Digital'
  );
  const [importDifficulty, setImportDifficulty] = useState<
    'mudah' | 'sedang' | 'sulit'
  >('sedang');
  const [skipExamples, setSkipExamples] = useState(true);
  const [importFileName, setImportFileName] = useState('');
  const [parsingWord, setParsingWord] = useState(false);
  const [importingWord, setImportingWord] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedImportedQuestion[]>([]);
  const [selectedImportIds, setSelectedImportIds] = useState<string[]>([]);
  const [rawImportFile, setRawImportFile] = useState<File | null>(null);

  const loadQuestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.request<{ questions: QuestionItem[] }>(
        '/api/teacher/questions'
      );
      setQuestions(res.questions);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat bank soal.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  const teacherOptions = useMemo(() => {
    const map = new Map<number, { id: number; name: string; username: string }>();
    for (const q of questions) {
      if (q.teacherId) {
        map.set(q.teacherId, {
          id: q.teacherId,
          name: q.teacherName || 'Guru',
          username: q.teacherUsername || '-',
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [questions]);

  const questionsByTeacher = useMemo(() => {
    if (!isSuperAdmin || teacherFilter === 'all') return questions;
    return questions.filter((q) => String(q.teacherId) === teacherFilter);
  }, [questions, isSuperAdmin, teacherFilter]);

  const subjectOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const q of questionsByTeacher) {
      const normalized = (q.subject || '').trim();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [questionsByTeacher]);

  const allKnownSubjects = useMemo(() => {
    const set = new Set<string>();
    for (const q of questions) {
      const normalized = (q.subject || '').trim();
      if (normalized) set.add(normalized);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [questions]);

  useEffect(() => {
    if (
      subjectFilter !== 'all' &&
      !subjectOptions.some((s) => s.name === subjectFilter)
    ) {
      setSubjectFilter('all');
    }
  }, [subjectFilter, subjectOptions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return questions.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (
        isSuperAdmin &&
        teacherFilter !== 'all' &&
        String(item.teacherId) !== teacherFilter
      ) {
        return false;
      }
      if (
        subjectFilter !== 'all' &&
        (item.subject || '').trim() !== subjectFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        item.prompt.toLowerCase().includes(q) ||
        item.subject.toLowerCase().includes(q) ||
        (item.teacherName || '').toLowerCase().includes(q) ||
        (item.teacherUsername || '').toLowerCase().includes(q)
      );
    });
  }, [questions, search, subjectFilter, typeFilter, isSuperAdmin, teacherFilter]);

  const openCreateModal = () => {
    setEditingId(null);
    setSubject(
      subjectFilter !== 'all' ? subjectFilter : 'Informatika & Literasi Digital'
    );
    setType('pg');
    setPrompt('');
    setImageData('');
    setImageUrlInput('');
    setOptions([
      { key: 'A', text: '' },
      { key: 'B', text: '' },
      { key: 'C', text: '' },
      { key: 'D', text: '' },
    ]);
    setCorrectAnswer('A');
    setPoints(10);
    setDifficulty('sedang');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (item: QuestionItem) => {
    setEditingId(item.id);
    setSubject(item.subject);
    setType(item.type);
    setPrompt(item.prompt);
    const img = item.imageData || '';
    setImageData(img);
    setImageUrlInput(img.startsWith('http') ? img : '');
    setOptions(
      item.options.length > 0
        ? item.options
        : [
            { key: 'A', text: '' },
            { key: 'B', text: '' },
            { key: 'C', text: '' },
            { key: 'D', text: '' },
          ]
    );
    setCorrectAnswer(item.correctAnswer);
    setPoints(item.points);
    setDifficulty(item.difficulty);
    setFormError(null);
    setModalOpen(true);
  };

  const handleTypeChange = (nextType: QuestionType) => {
    setType(nextType);
    if (nextType === 'pg') setCorrectAnswer('A');
    else if (nextType === 'benar_salah') setCorrectAnswer('BENAR');
    else setCorrectAnswer('');
  };

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError(null);
    setImageProcessing(true);
    try {
      const compressed = await compressImageFile(file);
      setImageData(compressed);
      setImageUrlInput('');
    } catch (err: any) {
      setFormError(err.message || 'Gagal mengunggah gambar.');
    } finally {
      setImageProcessing(false);
      e.target.value = '';
    }
  };

  const handleApplyImageUrl = () => {
    const url = imageUrlInput.trim();
    if (!url) {
      setImageData('');
      return;
    }
    if (!/^https?:\/\/.+/i.test(url)) {
      setFormError('URL gambar harus diawali dengan http:// atau https://');
      return;
    }
    setFormError(null);
    setImageData(url);
  };

  const handleOptionChange = (idx: number, text: string) => {
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, text } : o)));
  };

  const handleAddOption = () => {
    const keys = ['A', 'B', 'C', 'D', 'E'];
    if (options.length >= keys.length) return;
    setOptions((prev) => [...prev, { key: keys[prev.length], text: '' }]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const payload = {
        subject,
        type,
        prompt,
        imageData: imageData || null,
        options: type === 'pg' ? options : undefined,
        correctAnswer,
        points,
        difficulty,
      };
      if (editingId) {
        await api.request(`/api/teacher/questions/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await api.request('/api/teacher/questions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setModalOpen(false);
      await loadQuestions();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan soal.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.request(`/api/teacher/questions/${id}`, { method: 'DELETE' });
      setQuestions((prev) => prev.filter((q) => q.id !== id));
    } catch (err: any) {
      setError(err.message || 'Gagal menghapus soal.');
    }
  };

  const openImportModal = () => {
    setImportError(null);
    setImportFileName('');
    setRawImportFile(null);
    setParsedItems([]);
    setSelectedImportIds([]);
    if (subjectFilter !== 'all') {
      setImportSubject(subjectFilter);
    }
    setImportModalOpen(true);
  };

  const handleDownloadTemplate = async () => {
    try {
      await downloadWordTemplate();
    } catch (err: any) {
      setError(err.message || 'Gagal mengunduh template Word.');
    }
  };

  const processSelectedWordFile = async (
    file: File,
    subj: string,
    diff: 'mudah' | 'sedang' | 'sulit',
    shouldSkipExamples: boolean
  ) => {
    setImportError(null);
    setParsingWord(true);
    try {
      const result = await parseWordDocxFile(file, {
        subject: subj,
        difficulty: diff,
      });
      setParsedItems(result.questions);
      const autoSelected = result.questions
        .filter((item) => !item.validationError && (!shouldSkipExamples || !item.isExample))
        .map((item) => item.tempId);
      setSelectedImportIds(autoSelected);
    } catch (err: any) {
      setParsedItems([]);
      setSelectedImportIds([]);
      setImportError(err.message || 'Gagal membaca file Word (.docx).');
    } finally {
      setParsingWord(false);
    }
  };

  const handleWordFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setRawImportFile(file);
    setImportFileName(file.name);
    await processSelectedWordFile(file, importSubject, importDifficulty, skipExamples);
  };

  const handleToggleSkipExamples = (nextSkip: boolean) => {
    setSkipExamples(nextSkip);
    if (parsedItems.length > 0) {
      setSelectedImportIds(
        parsedItems
          .filter((item) => !item.validationError && (!nextSkip || !item.isExample))
          .map((item) => item.tempId)
      );
    }
  };

  const toggleImportItem = (tempId: string) => {
    setSelectedImportIds((prev) =>
      prev.includes(tempId) ? prev.filter((id) => id !== tempId) : [...prev, tempId]
    );
  };

  const visibleImportItems = useMemo(() => {
    if (!skipExamples) return parsedItems;
    return parsedItems.filter((item) => !item.isExample);
  }, [parsedItems, skipExamples]);

  const handleConfirmImport = async () => {
    const chosen = parsedItems.filter(
      (item) => selectedImportIds.includes(item.tempId) && !item.validationError
    );
    if (chosen.length === 0) {
      setImportError('Pilih minimal 1 butir soal yang valid untuk diimpor.');
      return;
    }

    setImportError(null);
    setImportingWord(true);
    try {
      const mappedQuestions = chosen.map((item) => ({
        subject: item.hasExplicitSubject
          ? item.subject
          : importSubject.trim() || item.subject,
        type: item.type,
        prompt: item.prompt,
        imageData: item.imageData,
        options: item.type === 'pg' ? item.options : undefined,
        correctAnswer: item.correctAnswer,
        points: item.points,
        difficulty: importDifficulty,
      }));
      const res = await api.request<{ importedCount: number }>(
        '/api/teacher/questions/import',
        {
          method: 'POST',
          body: JSON.stringify({
            questions: mappedQuestions,
          }),
        }
      );
      const importedSubjects = Array.from(
        new Set(mappedQuestions.map((q) => q.subject.trim()).filter(Boolean))
      );
      if (
        subjectFilter !== 'all' &&
        !importedSubjects.includes(subjectFilter)
      ) {
        setSubjectFilter(
          importedSubjects.length === 1 ? importedSubjects[0] : 'all'
        );
      }
      setImportModalOpen(false);
      setImportSuccess(
        `Berhasil mengimpor ${res.importedCount} butir soal dari Word ke Bank Soal.`
      );
      await loadQuestions();
    } catch (err: any) {
      setImportError(err.message || 'Gagal mengimpor soal ke database.');
    } finally {
      setImportingWord(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            {isSuperAdmin ? 'Bank Soal Semua Guru (Super Admin)' : 'Bank Soal Saya'}
          </h2>
          <p className="text-sm text-slate-500">
            {isSuperAdmin
              ? 'Mode Super Admin: Menampilkan seluruh butir soal yang ditambahkan oleh semua akun guru maupun admin, lengkap dengan lampiran gambar dan import Word (.docx).'
              : 'Menampilkan khusus soal yang Anda ketik atau impor sendiri. Kelola Pilihan Ganda, Isian, Benar/Salah, Uraian, gambar, dan import Word (.docx).'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-blue-700" />
            <span>Template Word (.docx)</span>
          </button>
          <button
            type="button"
            onClick={openImportModal}
            className="px-3.5 py-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Import Word (.docx)</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Soal</span>
          </button>
        </div>
      </div>

      {importSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{importSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportSuccess(null)}
            className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row gap-3 flex-1 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                isSuperAdmin
                  ? 'Cari isi soal, mapel, atau nama guru...'
                  : 'Cari isi soal atau mata pelajaran...'
              }
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <select
            aria-label="Pilih Mata Pelajaran"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 min-w-[210px]"
          >
            <option value="all">
              Semua Mata Pelajaran ({questionsByTeacher.length} soal)
            </option>
            {subjectOptions.map((subj) => (
              <option key={subj.name} value={subj.name}>
                {subj.name} ({subj.count} soal)
              </option>
            ))}
          </select>

          {isSuperAdmin && (
            <select
              aria-label="Filter Guru"
              value={teacherFilter}
              onChange={(e) => setTeacherFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">Semua Guru ({questions.length} soal)</option>
              {teacherOptions.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name} (@{t.username})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {(['all', 'pg', 'benar_salah', 'isian', 'uraian'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                typeFilter === t
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t === 'all' ? 'Semua Tipe' : TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <p className="text-sm text-slate-600">
            Tidak ada soal yang sesuai dengan filter saat ini.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            Buat Soal Baru
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((q, index) => (
            <article
              key={q.id}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 tabular-nums">
                  <span className="font-semibold text-blue-700">
                    Soal #{index + 1}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-slate-800">{TYPE_LABELS[q.type]}</span>
                  <span aria-hidden="true">·</span>
                  <span>{q.subject}</span>
                  <span aria-hidden="true">·</span>
                  <span>Bobot {q.points} poin</span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">{q.difficulty}</span>
                  {isSuperAdmin && q.teacherName && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-700 font-medium">
                        Pembuat: {q.teacherName} (@{q.teacherUsername})
                      </span>
                    </>
                  )}
                  {q.imageData && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-blue-700 font-medium">Dengan Gambar</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditModal(q)}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:border-blue-600 rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(q.id)}
                    className="px-2.5 py-1.5 text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                </div>
              </div>

              <p className="text-sm text-slate-900 leading-relaxed whitespace-pre-wrap">
                {q.prompt}
              </p>

              {q.imageData && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 inline-block">
                  <img
                    src={q.imageData}
                    alt={`Gambar soal nomor ${index + 1}`}
                    referrerPolicy="no-referrer"
                    className="max-h-56 w-auto rounded object-contain"
                  />
                </div>
              )}

              {q.type === 'pg' && q.options.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {q.options.map((opt) => {
                    const isKey = opt.key === q.correctAnswer;
                    return (
                      <div
                        key={opt.key}
                        className={`px-3 py-2 rounded-lg border text-xs flex items-center gap-2 ${
                          isKey
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <span className="font-mono font-bold">{opt.key}.</span>
                        <span>{opt.text}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {q.type !== 'pg' && (
                <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <span className="font-semibold text-slate-800">
                    {q.type === 'uraian' ? 'Pedoman / Rubrik: ' : 'Kunci Jawaban: '}
                  </span>
                  <span>{q.correctAnswer}</span>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Modal Tambah / Edit Soal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-lg font-bold text-slate-900">
                {editingId ? 'Edit Butir Soal' : 'Tambah Soal Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mata Pelajaran
                  </label>
                  <input
                    type="text"
                    required
                    list="bank-soal-subject-list"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                  <datalist id="bank-soal-subject-list">
                    {allKnownSubjects.map((subj) => (
                      <option key={subj} value={subj} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tipe Soal
                  </label>
                  <select
                    value={type}
                    onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="pg">Pilihan Ganda (PG)</option>
                    <option value="benar_salah">Benar / Salah</option>
                    <option value="isian">Isian Singkat</option>
                    <option value="uraian">Uraian / Esai</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pertanyaan / Pernyataan Soal
                </label>
                <textarea
                  required
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Tuliskan teks soal dengan jelas..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              {/* Lampiran Gambar Soal */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <ImagePlus className="w-4 h-4 text-blue-700" />
                    <span>Gambar Soal (Opsional — PNG, JPG, WEBP, GIF)</span>
                  </label>
                  {imageData && (
                    <button
                      type="button"
                      onClick={() => {
                        setImageData('');
                        setImageUrlInput('');
                      }}
                      className="text-xs font-semibold text-red-700 hover:underline cursor-pointer"
                    >
                      Hapus Gambar
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <label className="px-3.5 py-2 bg-white hover:bg-blue-50 border border-slate-300 hover:border-blue-500 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer text-center whitespace-nowrap">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    {imageProcessing ? 'Memproses Gambar...' : 'Unggah File Gambar'}
                  </label>

                  <div className="flex-1 flex gap-2">
                    <input
                      type="url"
                      value={imageUrlInput}
                      onChange={(e) => setImageUrlInput(e.target.value)}
                      placeholder="Atau tempel tautan gambar https://..."
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleApplyImageUrl}
                      className="px-3 py-2 bg-white border border-slate-300 hover:border-blue-600 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      Pakai URL
                    </button>
                  </div>
                </div>

                {imageData && (
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5 flex justify-center">
                    <img
                      src={imageData}
                      alt="Pratinjau gambar soal"
                      referrerPolicy="no-referrer"
                      className="max-h-52 w-auto rounded object-contain"
                    />
                  </div>
                )}
              </div>

              {type === 'pg' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">
                      Opsi Pilihan Ganda & Pilih Kunci Jawaban
                    </label>
                    {options.length < 5 && (
                      <button
                        type="button"
                        onClick={handleAddOption}
                        className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                      >
                        + Tambah Opsi E
                      </button>
                    )}
                  </div>
                  {options.map((opt, idx) => (
                    <div key={opt.key} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="pgKey"
                        checked={correctAnswer === opt.key}
                        onChange={() => setCorrectAnswer(opt.key)}
                        aria-label={`Kunci ${opt.key}`}
                        className="w-4 h-4 text-blue-700 cursor-pointer"
                      />
                      <span className="w-6 text-xs font-mono font-bold text-slate-700">
                        {opt.key}.
                      </span>
                      <input
                        type="text"
                        required
                        value={opt.text}
                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                        placeholder={`Isi pilihan ${opt.key}`}
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}

              {type === 'benar_salah' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Kunci Jawaban Benar / Salah
                  </label>
                  <div className="flex gap-3">
                    {(['BENAR', 'SALAH'] as const).map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setCorrectAnswer(val)}
                        className={`px-4 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                          correctAnswer === val
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {type === 'isian' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kunci Jawaban Isian Singkat (pisahkan variasi dengan koma, tidak peka huruf besar/kecil)
                  </label>
                  <input
                    type="text"
                    required
                    value={correctAnswer}
                    onChange={(e) => setCorrectAnswer(e.target.value)}
                    placeholder="Contoh: jakarta,dki jakarta"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              )}

              {type === 'uraian' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rubrik / Pedoman Penilaian Guru
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={correctAnswer}
                    onChange={(e) => setCorrectAnswer(e.target.value)}
                    placeholder="Tuliskan poin-poin kunci untuk acuan koreksi manual guru..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Bobot Poin
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={points}
                    onChange={(e) => setPoints(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tingkat Kesulitan
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) =>
                      setDifficulty(e.target.value as 'mudah' | 'sedang' | 'sulit')
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="mudah">Mudah</option>
                    <option value="sedang">Sedang</option>
                    <option value="sulit">Sulit</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving || imageProcessing}
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Soal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Import Soal dari Word (.docx) */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-700" />
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Import Soal dari Template Word (.docx)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-700 space-y-1">
                <p className="font-bold text-slate-900">
                  Gunakan Template Bank Soal MKC CBT (.docx)
                </p>
                <p>
                  Unduh template, isi tabel soal beserta gambar di dalam kolom &ldquo;Rumusan Soal &amp; Gambar&rdquo;, lalu unggah kembali di bawah ini.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-blue-300 text-blue-800 text-xs font-semibold rounded-lg flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Template (.docx)</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mata Pelajaran Default
                </label>
                <input
                  type="text"
                  list="bank-soal-subject-list-import"
                  value={importSubject}
                  onChange={(e) => setImportSubject(e.target.value)}
                  placeholder="Contoh: Matematika Wajib"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
                <datalist id="bank-soal-subject-list-import">
                  {allKnownSubjects.map((subj) => (
                    <option key={subj} value={subj} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tingkat Kesulitan Default
                </label>
                <select
                  value={importDifficulty}
                  onChange={(e) =>
                    setImportDifficulty(
                      e.target.value as 'mudah' | 'sedang' | 'sulit'
                    )
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  <option value="mudah">Mudah</option>
                  <option value="sedang">Sedang</option>
                  <option value="sulit">Sulit</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block border-2 border-dashed border-slate-300 hover:border-blue-600 bg-slate-50 hover:bg-blue-50/40 rounded-xl p-6 text-center cursor-pointer transition-colors">
                <input
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleWordFileUpload}
                  className="hidden"
                />
                <Upload className="w-7 h-7 text-blue-700 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-900">
                  {parsingWord
                    ? 'Membaca & mengekstrak soal beserta gambar...'
                    : importFileName
                    ? `File dipilih: ${importFileName}`
                    : 'Klik untuk memilih file Word (.docx)'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Mendukung file template tabel MKC CBT dan gambar tertanam (PNG, JPG, WEBP, GIF) hingga 20 MB.
                </p>
              </label>

              {rawImportFile && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipExamples}
                      onChange={(e) => handleToggleSkipExamples(e.target.checked)}
                      className="w-4 h-4 text-blue-700"
                    />
                    <span>Lewati baris contoh bawaan template berlabel &ldquo;(Contoh)&rdquo;</span>
                  </label>
                  <span>
                    Terpilih untuk diimpor:{' '}
                    <strong className="text-blue-700 tabular-nums">
                      {
                        parsedItems.filter(
                          (item) =>
                            selectedImportIds.includes(item.tempId) &&
                            !item.validationError
                        ).length
                      }{' '}
                      soal
                    </strong>
                  </span>
                </div>
              )}
            </div>

            {importError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{importError}</span>
              </div>
            )}

            {parsedItems.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Pratinjau Soal Hasil Pembacaan ({visibleImportItems.length} baris)
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      const validIds = visibleImportItems
                        .filter((i) => !i.validationError)
                        .map((i) => i.tempId);
                      const allSelected =
                        validIds.length > 0 &&
                        validIds.every((id) => selectedImportIds.includes(id));
                      setSelectedImportIds(allSelected ? [] : validIds);
                    }}
                    className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                  >
                    Pilih / Kosongkan Semua Valid
                  </button>
                </div>

                {visibleImportItems.length === 0 ? (
                  <div className="p-5 rounded-xl border border-slate-200 bg-slate-50 text-center text-xs text-slate-600">
                    Semua baris di file ini merupakan baris contoh template. Nonaktifkan centang &ldquo;Lewati baris contoh&rdquo; di atas jika ingin menguji import dengan baris contoh, atau isi soal baru pada baris ke-5 dst di file Word Anda.
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-200">
                    {visibleImportItems.map((item) => {
                      const isChecked = selectedImportIds.includes(item.tempId);
                      const hasErr = Boolean(item.validationError);
                      return (
                        <div
                          key={item.tempId}
                          className={`p-3.5 space-y-2 ${
                            hasErr ? 'bg-red-50/50' : 'bg-white'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <button
                              type="button"
                              disabled={hasErr}
                              onClick={() => toggleImportItem(item.tempId)}
                              className="mt-0.5 disabled:opacity-40 cursor-pointer"
                              aria-label={`Pilih ${item.rowLabel}`}
                            >
                              {isChecked && !hasErr ? (
                                <CheckSquare className="w-4 h-4 text-blue-700" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400" />
                              )}
                            </button>
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span className="font-semibold text-blue-700">
                                  {item.rowLabel}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-semibold text-slate-800">
                                  {TYPE_LABELS[item.type]}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="text-slate-700 font-medium">
                                  {item.hasExplicitSubject
                                    ? item.subject
                                    : importSubject.trim() || item.subject}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>Bobot {item.points} poin</span>
                                {item.imageData && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="text-blue-700 font-medium">
                                      Gambar Terdeteksi
                                    </span>
                                  </>
                                )}
                              </div>

                              <p className="text-xs text-slate-900 whitespace-pre-wrap">
                                {item.prompt}
                              </p>

                              {item.imageData && (
                                <img
                                  src={item.imageData}
                                  alt={`Lampiran ${item.rowLabel}`}
                                  className="max-h-32 w-auto rounded border border-slate-200 bg-slate-50 object-contain"
                                />
                              )}

                              {item.type === 'pg' && item.options.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                                  {item.options.map((opt) => (
                                    <div
                                      key={opt.key}
                                      className={`px-2 py-1 rounded border text-xs ${
                                        opt.key === item.correctAnswer
                                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                                          : 'bg-slate-50 border-slate-200 text-slate-700'
                                      }`}
                                    >
                                      {opt.key}. {opt.text}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {item.correctAnswer && (
                                <p className="text-xs text-slate-600">
                                  <strong className="text-slate-800">
                                    {item.type === 'uraian' ? 'Rubrik:' : 'Kunci:'}
                                  </strong>{' '}
                                  <span className="font-semibold text-emerald-700">
                                    {item.correctAnswer}
                                  </span>
                                </p>
                              )}

                              {item.validationError && (
                                <p className="text-xs font-medium text-red-700 flex items-center gap-1">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>{item.validationError}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={
                  importingWord ||
                  parsingWord ||
                  parsedItems.filter(
                    (item) =>
                      selectedImportIds.includes(item.tempId) &&
                      !item.validationError
                  ).length === 0
                }
                onClick={handleConfirmImport}
                className="px-5 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg cursor-pointer"
              >
                {importingWord
                  ? 'Mengimpor ke Database...'
                  : `Import ${
                      parsedItems.filter(
                        (item) =>
                          selectedImportIds.includes(item.tempId) &&
                          !item.validationError
                      ).length
                    } Soal Terpilih`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
