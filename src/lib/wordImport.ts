import JSZip from 'jszip';
import { QuestionOption, QuestionType } from '../types/cbt';

export interface ParsedImportedQuestion {
  tempId: string;
  rowLabel: string;
  isExample: boolean;
  subject: string;
  hasExplicitSubject?: boolean;
  type: QuestionType;
  prompt: string;
  imageData: string | null;
  options: QuestionOption[];
  correctAnswer: string;
  points: number;
  difficulty: 'mudah' | 'sedang' | 'sulit';
  validationError: string | null;
}

export interface WordImportParseResult {
  questions: ParsedImportedQuestion[];
  detectedFormat: 'table' | 'paragraph';
  exampleCount: number;
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

async function compressExtractedImage(
  bytes: Uint8Array,
  ext: string
): Promise<string | null> {
  const mime = MIME_BY_EXT[ext.toLowerCase()];
  if (!mime) return null;

  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy], { type: mime });
  const objectUrl = URL.createObjectURL(blob);

  try {
    if (mime === 'image/gif' && bytes.byteLength <= 1.5 * 1024 * 1024) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Gagal membaca GIF'));
        reader.readAsDataURL(blob);
      });
    }

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Gambar Word tidak valid'));
      el.src = objectUrl;
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
    if (!ctx) return null;

    if (mime !== 'image/png' && mime !== 'image/webp') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);

    const outMime = mime === 'image/png' ? 'image/png' : 'image/jpeg';
    return canvas.toDataURL(outMime, 0.86);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getElementsByLocalName(root: Element | Document, localName: string): Element[] {
  const result: Element[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 1) {
      const el = node as Element;
      if (el.localName === localName) result.push(el);
    }
    for (let i = 0; i < node.childNodes.length; i += 1) {
      walk(node.childNodes[i]);
    }
  };
  walk(root);
  return result;
}

function getDirectChildrenByLocalName(parent: Element, localName: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < parent.childNodes.length; i += 1) {
    const child = parent.childNodes[i];
    if (child.nodeType === 1 && (child as Element).localName === localName) {
      out.push(child as Element);
    }
  }
  return out;
}

function extractParagraphText(pEl: Element): string {
  let out = '';
  const walk = (node: Node) => {
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (el.localName === 't' || el.localName === 'delText') {
      out += el.textContent || '';
      return;
    }
    if (el.localName === 'br' || el.localName === 'cr') {
      out += '\n';
      return;
    }
    if (el.localName === 'tab') {
      out += ' ';
      return;
    }
    if (el.localName === 'noBreakHyphen') {
      out += '-';
      return;
    }
    for (let i = 0; i < el.childNodes.length; i += 1) {
      walk(el.childNodes[i]);
    }
  };
  walk(pEl);
  return out;
}

function findEmbedRelIds(container: Element): string[] {
  const ids: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (el.localName === 'blip') {
      for (let i = 0; i < el.attributes.length; i += 1) {
        const attr = el.attributes[i];
        if (attr.localName === 'embed' && attr.value) {
          ids.push(attr.value);
        }
      }
    } else if (el.localName === 'imagedata') {
      for (let i = 0; i < el.attributes.length; i += 1) {
        const attr = el.attributes[i];
        if (attr.localName === 'id' && attr.value) {
          ids.push(attr.value);
        }
      }
    }
    for (let i = 0; i < el.childNodes.length; i += 1) {
      walk(el.childNodes[i]);
    }
  };
  walk(container);
  return ids;
}

async function resolveFirstImageFromRelIds(
  relIds: string[],
  relMap: Map<string, string>,
  zip: JSZip,
  mediaCache: Map<string, string | null>
): Promise<string | null> {
  for (const rId of relIds) {
    const target = relMap.get(rId);
    if (!target) continue;
    const cleanedTarget = target.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
    const normalizedPath = cleanedTarget.startsWith('/')
      ? cleanedTarget.slice(1)
      : cleanedTarget.startsWith('word/')
      ? cleanedTarget
      : `word/${cleanedTarget}`;

    if (mediaCache.has(normalizedPath)) {
      const cached = mediaCache.get(normalizedPath) || null;
      if (cached) return cached;
      continue;
    }

    const zipEntry = zip.file(normalizedPath);
    if (!zipEntry) {
      mediaCache.set(normalizedPath, null);
      continue;
    }

    const ext = normalizedPath.split('.').pop()?.toLowerCase() || '';
    const bytes = await zipEntry.async('uint8array');
    const compressed = await compressExtractedImage(bytes, ext);
    mediaCache.set(normalizedPath, compressed);
    if (compressed) return compressed;
  }
  return null;
}

function normalizeQuestionType(raw: string): QuestionType {
  const val = raw.toLowerCase().trim();
  if (val.includes('benar') || val === 'b-s' || val === 'bs' || val.includes('b/s')) {
    return 'benar_salah';
  }
  if (val.includes('isian') || val.includes('short')) {
    return 'isian';
  }
  if (val.includes('uraian') || val.includes('esai') || val.includes('essay')) {
    return 'uraian';
  }
  return 'pg';
}

function parsePgOptions(rawText: string): QuestionOption[] {
  const cleaned = rawText.replace(/\r/g, '').trim();
  if (!cleaned || cleaned === '-') return [];

  const lines = cleaned
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed: QuestionOption[] = [];
  const lineOptionRegex = /^\(?([A-Ea-e])\s*[.):\-]\s*(.+)$/;

  for (const line of lines) {
    const m = line.match(lineOptionRegex);
    if (m) {
      parsed.push({
        key: m[1].toUpperCase(),
        text: m[2].trim(),
      });
    } else if (parsed.length > 0 && !/^\(?[A-Ea-e]\s*[.):\-]?$/.test(line)) {
      parsed[parsed.length - 1].text = `${parsed[parsed.length - 1].text} ${line}`.trim();
    }
  }

  if (parsed.length === 0) {
    const inlineMatches = [
      ...cleaned.matchAll(
        /(?:^|\s)\(?([A-Ea-e])\s*[.)]\s*([^A-Ea-e].*?)(?=(?:\s+\(?[A-Ea-e]\s*[.)]\s)|$)/g
      ),
    ];
    for (const m of inlineMatches) {
      if (m[2]?.trim()) {
        parsed.push({
          key: m[1].toUpperCase(),
          text: m[2].trim(),
        });
      }
    }
  }

  const seen = new Set<string>();
  return parsed.filter((o) => {
    if (seen.has(o.key) || !o.text) return false;
    seen.add(o.key);
    return true;
  });
}

function normalizeAnswerKey(rawKey: string, type: QuestionType): string {
  const trimmed = rawKey.trim();
  if (!trimmed || trimmed === '-') return '';

  if (type === 'pg') {
    const stripped = trimmed
      .replace(/^(?:kunci(?:\s*jawaban)?|jawaban)\s*[:=]\s*/i, '')
      .trim();
    const letterMatch = stripped.match(/^\(?([A-Ea-e])\)?[.):\s]*$/);
    if (letterMatch) return letterMatch[1].toUpperCase();
    return stripped.toUpperCase();
  }

  if (type === 'benar_salah') {
    const upper = trimmed
      .replace(/^(?:kunci(?:\s*jawaban)?|jawaban)\s*[:=]\s*/i, '')
      .replace(/[.)]+$/, '')
      .trim()
      .toUpperCase();
    if (upper === 'B' || upper === 'TRUE' || upper === 'YA' || upper === 'BENAR') {
      return 'BENAR';
    }
    if (upper === 'S' || upper === 'FALSE' || upper === 'TIDAK' || upper === 'SALAH') {
      return 'SALAH';
    }
    return upper;
  }

  if (type === 'uraian') {
    return trimmed.replace(/^(?:rubrik|pedoman(?:\s*penskoran)?)\s*[:=]\s*/i, '').trim();
  }

  return trimmed.replace(/^(?:kunci(?:\s*jawaban)?|jawaban)\s*[:=]\s*/i, '').trim();
}

function validateParsedQuestion(item: {
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  correctAnswer: string;
}): string | null {
  if (!item.prompt.trim()) {
    return 'Rumusan soal masih kosong.';
  }
  if (item.type === 'pg') {
    if (item.options.length < 2) {
      return 'Soal PG minimal memiliki 2 opsi jawaban (A., B., ...).';
    }
    const key = item.correctAnswer.trim().toUpperCase();
    if (!item.options.some((o) => o.key === key)) {
      return 'Kunci jawaban PG harus sesuai dengan salah satu huruf opsi (A–E).';
    }
  } else if (item.type === 'benar_salah') {
    const ans = item.correctAnswer.trim().toUpperCase();
    if (ans !== 'BENAR' && ans !== 'SALAH') {
      return 'Kunci jawaban Benar/Salah harus BENAR atau SALAH.';
    }
  } else if (!item.correctAnswer.trim()) {
    return 'Kunci jawaban / rubrik penilaian wajib diisi.';
  }
  return null;
}

function cleanPromptText(raw: string): string {
  return raw
    .replace(/\[Tempel gambar di sini jika ada\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findColumnByPriority(
  headers: string[],
  keywords: string[],
  usedCols: Set<number>,
  fallback: number | null
): number | null {
  // Check each keyword in strict priority order across all unassigned columns
  for (const kw of keywords) {
    const idx = headers.findIndex(
      (h, colIdx) => !usedCols.has(colIdx) && h.includes(kw)
    );
    if (idx >= 0) {
      usedCols.add(idx);
      return idx;
    }
  }
  if (fallback !== null && fallback < headers.length && !usedCols.has(fallback)) {
    usedCols.add(fallback);
    return fallback;
  }
  return null;
}

export async function parseWordDocxFile(
  file: File,
  defaults: {
    subject: string;
    difficulty: 'mudah' | 'sedang' | 'sulit';
  }
): Promise<WordImportParseResult> {
  if (!file.name.toLowerCase().endsWith('.docx')) {
    throw new Error('File harus berformat Microsoft Word (.docx).');
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('Ukuran file Word maksimal 20 MB.');
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error(
      'File .docx tidak dapat dibuka. Pastikan file tidak rusak atau terenkripsi password.'
    );
  }

  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    throw new Error(
      'Struktur dokumen Word (.docx) tidak valid (word/document.xml tidak ditemukan).'
    );
  }

  const parser = new DOMParser();
  const docXmlText = await docXmlFile.async('string');
  const docXml = parser.parseFromString(docXmlText, 'application/xml');

  const relMap = new Map<string, string>();
  const relsFile = zip.file('word/_rels/document.xml.rels');
  if (relsFile) {
    const relsXml = parser.parseFromString(
      await relsFile.async('string'),
      'application/xml'
    );
    const relEls = getElementsByLocalName(relsXml, 'Relationship');
    for (const rel of relEls) {
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target');
      const type = rel.getAttribute('Type') || '';
      if (
        id &&
        target &&
        (type.includes('/image') ||
          /\.(png|jpe?g|gif|webp|bmp)$/i.test(target))
      ) {
        relMap.set(id, target);
      }
    }
  }

  const mediaCache = new Map<string, string | null>();
  const tables = getElementsByLocalName(docXml, 'tbl');

  const parsedQuestions: ParsedImportedQuestion[] = [];
  let exampleCount = 0;

  for (const tbl of tables) {
    const rows = getDirectChildrenByLocalName(tbl, 'tr');
    if (rows.length < 2) continue;

    const headerCells = getDirectChildrenByLocalName(rows[0], 'tc');
    if (headerCells.length < 4) continue;

    const headers = headerCells.map((cell) =>
      getElementsByLocalName(cell, 'p')
        .map(extractParagraphText)
        .join(' ')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
    );

    const hasQuestionHeaders =
      headers.some(
        (h) =>
          h.includes('rumusan') ||
          h.includes('pertanyaan') ||
          h.includes('soal')
      ) &&
      headers.some(
        (h) =>
          h.includes('kunci') || h.includes('rubrik') || h.includes('jawaban')
      );

    if (!hasQuestionHeaders && headerCells.length < 5) continue;

    // Assign columns in exact priority order so "Tipe Soal" never steals "Rumusan Soal"
    // and "Opsi Jawaban" never steals "Kunci / Rubrik"
    const usedCols = new Set<number>();
    const colNo = findColumnByPriority(headers, ['no', 'nomor'], usedCols, 0);
    const colType = findColumnByPriority(headers, ['tipe', 'jenis'], usedCols, 1);
    const colSubject = findColumnByPriority(
      headers,
      ['mata pelajaran', 'mapel', 'subject'],
      usedCols,
      null
    );
    const colPrompt = findColumnByPriority(
      headers,
      ['rumusan', 'pertanyaan', 'butir soal', 'teks soal', 'soal'],
      usedCols,
      2
    );
    const colOptions = findColumnByPriority(
      headers,
      ['opsi', 'pilihan'],
      usedCols,
      3
    );
    const colKey = findColumnByPriority(
      headers,
      ['kunci', 'rubrik', 'pedoman', 'jawaban'],
      usedCols,
      4
    );
    const colPoints = findColumnByPriority(
      headers,
      ['bobot', 'poin', 'skor'],
      usedCols,
      5
    );

    for (let r = 1; r < rows.length; r += 1) {
      const cells = getDirectChildrenByLocalName(rows[r], 'tc');
      if (cells.length < 3) continue;

      const getCellText = (idx: number | null) => {
        if (idx === null || idx < 0 || idx >= cells.length) return '';
        const cell = cells[idx];
        return getElementsByLocalName(cell, 'p')
          .map(extractParagraphText)
          .join('\n')
          .trim();
      };

      const rawNo = getCellText(colNo);
      const rawType = getCellText(colType);
      const rawSubject = getCellText(colSubject);
      const promptCell =
        colPrompt !== null && colPrompt < cells.length ? cells[colPrompt] : null;
      const rawPrompt = cleanPromptText(getCellText(colPrompt));
      const rawOptions = getCellText(colOptions);
      const rawKey = getCellText(colKey);
      const rawPoints = getCellText(colPoints);

      const promptRelIds = promptCell ? findEmbedRelIds(promptCell) : [];
      const rowRelIds =
        promptRelIds.length > 0 ? promptRelIds : findEmbedRelIds(rows[r]);
      const imageData = await resolveFirstImageFromRelIds(
        rowRelIds,
        relMap,
        zip,
        mediaCache
      );

      const type = normalizeQuestionType(rawType);
      const options = type === 'pg' ? parsePgOptions(rawOptions) : [];
      const normalizedKey = normalizeAnswerKey(rawKey, type);

      // Skip empty template rows where teacher hasn't typed a prompt, image, or key
      const hasMeaningfulOptions = options.length > 0;
      if (!rawPrompt && !imageData && !normalizedKey && !hasMeaningfulOptions) {
        continue;
      }

      const isExample = rawNo.toLowerCase().includes('contoh');
      if (isExample) exampleCount += 1;

      const parsedPoints = Math.max(
        1,
        Math.min(100, parseInt(rawPoints.replace(/[^\d]/g, ''), 10) || 10)
      );

      const finalPrompt =
        rawPrompt || (imageData ? 'Perhatikan gambar berikut.' : '');

      const validationError = validateParsedQuestion({
        type,
        prompt: finalPrompt,
        options,
        correctAnswer: normalizedKey,
      });

      parsedQuestions.push({
        tempId: `tbl-${parsedQuestions.length + 1}-${r}-${Math.random()
          .toString(36)
          .slice(2, 7)}`,
        rowLabel: rawNo || `Baris ${r}`,
        isExample,
        subject: rawSubject || defaults.subject.trim() || 'Umum',
        hasExplicitSubject: Boolean(rawSubject.trim()),
        type,
        prompt: finalPrompt,
        imageData,
        options,
        correctAnswer: normalizedKey,
        points: parsedPoints,
        difficulty: defaults.difficulty,
        validationError,
      });
    }
  }

  if (parsedQuestions.length > 0) {
    return {
      questions: parsedQuestions,
      detectedFormat: 'table',
      exampleCount,
    };
  }

  // Fallback parser for regular numbered Word documents (1. ..., A. ..., Kunci: A)
  const bodyEl = getElementsByLocalName(docXml, 'body')[0];
  if (bodyEl) {
    const paragraphs = getDirectChildrenByLocalName(bodyEl, 'p');
    let current: {
      promptLines: string[];
      options: QuestionOption[];
      imageData: string | null;
      correctAnswer: string;
      type: QuestionType | null;
      points: number;
      rowLabel: string;
    } | null = null;

    const flushCurrent = () => {
      if (!current) return;
      const promptText = cleanPromptText(current.promptLines.join('\n'));
      if (!promptText && !current.imageData) {
        current = null;
        return;
      }
      const type: QuestionType =
        current.type ||
        (current.options.length >= 2
          ? 'pg'
          : current.correctAnswer.toUpperCase() === 'BENAR' ||
            current.correctAnswer.toUpperCase() === 'SALAH'
          ? 'benar_salah'
          : 'isian');

      const finalKey = normalizeAnswerKey(current.correctAnswer, type);

      const validationError = validateParsedQuestion({
        type,
        prompt: promptText,
        options: current.options,
        correctAnswer: finalKey,
      });

      parsedQuestions.push({
        tempId: `para-${parsedQuestions.length + 1}`,
        rowLabel: current.rowLabel,
        isExample: false,
        subject: defaults.subject.trim() || 'Umum',
        hasExplicitSubject: false,
        type,
        prompt: promptText,
        imageData: current.imageData,
        options: type === 'pg' ? current.options : [],
        correctAnswer: finalKey,
        points: current.points,
        difficulty: defaults.difficulty,
        validationError,
      });
      current = null;
    };

    for (const p of paragraphs) {
      const text = extractParagraphText(p).trim();
      const relIds = findEmbedRelIds(p);
      const pImage =
        relIds.length > 0
          ? await resolveFirstImageFromRelIds(relIds, relMap, zip, mediaCache)
          : null;

      const qStart = text.match(/^(\d{1,3})\s*[.)]\s+(.+)$/);
      if (qStart) {
        flushCurrent();
        current = {
          rowLabel: `No ${qStart[1]}`,
          promptLines: [qStart[2].trim()],
          options: [],
          imageData: pImage,
          correctAnswer: '',
          type: null,
          points: 10,
        };
        continue;
      }

      if (!current) continue;

      if (pImage && !current.imageData) {
        current.imageData = pImage;
      }

      if (!text) continue;

      const optMatch = text.match(/^\(?([A-Ea-e])\s*[.):]\s+(.+)$/);
      if (optMatch) {
        current.options.push({
          key: optMatch[1].toUpperCase(),
          text: optMatch[2].trim(),
        });
        continue;
      }

      const keyMatch = text.match(
        /^(?:Kunci\s*Jawaban|Kunci|Jawaban|Rubrik)\s*[:=]\s*(.+)$/i
      );
      if (keyMatch) {
        current.correctAnswer = keyMatch[1].trim();
        continue;
      }

      const typeMatch = text.match(/^(?:Tipe\s*Soal|Tipe)\s*[:=]\s*(.+)$/i);
      if (typeMatch) {
        current.type = normalizeQuestionType(typeMatch[1]);
        continue;
      }

      const ptsMatch = text.match(/^(?:Bobot|Poin)\s*[:=]\s*(\d+)/i);
      if (ptsMatch) {
        current.points = Math.max(1, Math.min(100, Number(ptsMatch[1]) || 10));
        continue;
      }

      current.promptLines.push(text);
    }

    flushCurrent();
  }

  if (parsedQuestions.length === 0) {
    throw new Error(
      'Tidak ditemukan butir soal yang terisi di dokumen Word. Pastikan Anda menggunakan Template Bank Soal (.docx) atau format soal bernomor yang valid.'
    );
  }

  return {
    questions: parsedQuestions,
    detectedFormat: 'paragraph',
    exampleCount,
  };
}
