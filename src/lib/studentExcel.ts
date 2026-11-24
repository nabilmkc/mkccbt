import * as XLSX from 'xlsx';

export interface ParsedImportedStudent {
  tempId: string;
  rowNumber: number;
  isExample: boolean;
  username: string;
  name: string;
  className: string;
  pin: string;
  validationError: string | null;
}

export function downloadStudentExcelTemplate(): void {
  const wb = XLSX.utils.book_new();

  const dataRows = [
    ['Username / NIS', 'Nama Lengkap', 'Kelas', 'PIN Login'],
    ['contoh_1001', 'Siti Rahmawati (Contoh)', 'XII IPA 1', '123456'],
    ['contoh_1002', 'Bagus Pratama (Contoh)', 'XII IPA 2', '654321'],
    ['', '', '', ''],
    ['', '', '', ''],
  ];

  const wsData = XLSX.utils.aoa_to_sheet(dataRows);
  wsData['!cols'] = [
    { wch: 22 },
    { wch: 30 },
    { wch: 18 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsData, 'Data Siswa');

  const guideRows = [
    ['PETUNJUK PENGISIAN TEMPLATE IMPORT AKUN SISWA MKC CBT'],
    [''],
    ['1. Isi data siswa pada sheet "Data Siswa" dengan tetap mempertahankan 4 kolom header di baris 1.'],
    ['2. Username / NIS: Minimal 3 karakter (huruf kecil, angka, titik, garis bawah, atau strip). Harus unik per siswa.'],
    ['3. Nama Lengkap: Nama lengkap siswa yang akan tampil pada kartu ujian dan hasil nilai.'],
    ['4. Kelas: Nama kelas siswa (misal: XII IPA 1, X TJKT 2). Digunakan untuk filter kelas saat membuat ujian.'],
    ['5. PIN Login: Minimal 4 karakter (angka atau huruf, misal: 123456). Disimpan terenkripsi dan tampil di Kartu Ujian.'],
    ['6. Baris contoh dengan awalan "contoh_" atau teks "(Contoh)" otomatis dikenali dan bisa dilewati saat import.'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);
  wsGuide['!cols'] = [{ wch: 95 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Petunjuk');

  XLSX.writeFile(wb, 'Template_Akun_Siswa_MKC_CBT.xlsx');
}

function findHeaderIdx(headers: string[], keywords: string[], fallback: number): number {
  for (const kw of keywords) {
    const idx = headers.findIndex((h) => h.includes(kw));
    if (idx >= 0) return idx;
  }
  return fallback;
}

export async function parseStudentExcelFile(
  file: File
): Promise<ParsedImportedStudent[]> {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls') && !lower.endsWith('.csv')) {
    throw new Error('Format file harus Excel (.xlsx, .xls) atau CSV (.csv).');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Ukuran file maksimal 10 MB.');
  }

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase().includes('data')) ||
    wb.SheetNames.find((n) => !n.toLowerCase().includes('petunjuk')) ||
    wb.SheetNames[0];

  if (!sheetName) {
    throw new Error('File Excel tidak memiliki worksheet yang dapat dibaca.');
  }

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    raw: false,
  });

  if (rows.length < 2) {
    throw new Error('File Excel kosong atau belum memiliki baris data siswa.');
  }

  // Locate header row (first row containing username/nis or nama)
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i += 1) {
    const line = (rows[i] || []).map((c) => String(c || '').toLowerCase());
    if (
      line.some((h) => h.includes('username') || h.includes('nis')) &&
      line.some((h) => h.includes('nama'))
    ) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = (rows[headerRowIdx] || []).map((c) =>
    String(c || '')
      .toLowerCase()
      .trim()
  );

  const colUser = findHeaderIdx(headers, ['username', 'nis', 'akun'], 0);
  const colName = findHeaderIdx(headers, ['nama lengkap', 'nama', 'name'], 1);
  const colClass = findHeaderIdx(headers, ['kelas', 'rombel', 'class'], 2);
  const colPin = findHeaderIdx(headers, ['pin', 'password', 'sandi'], 3);

  const parsed: ParsedImportedStudent[] = [];
  const seenInFile = new Set<string>();

  for (let r = headerRowIdx + 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const rawUser = String(row[colUser] ?? '').trim();
    const rawName = String(row[colName] ?? '').trim();
    const rawClass = String(row[colClass] ?? '').trim();
    const rawPin = String(row[colPin] ?? '').trim();

    if (!rawUser && !rawName && !rawClass && !rawPin) {
      continue;
    }

    const cleanUsername = rawUser.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const isExample =
      cleanUsername.startsWith('contoh_') ||
      rawName.toLowerCase().includes('(contoh)');

    let validationError: string | null = null;
    if (!cleanUsername || cleanUsername.length < 3) {
      validationError = 'Username/NIS minimal 3 karakter alfanumerik.';
    } else if (!rawName) {
      validationError = 'Nama lengkap wajib diisi.';
    } else if (!rawPin || rawPin.length < 4) {
      validationError = 'PIN login minimal 4 karakter.';
    } else if (seenInFile.has(cleanUsername)) {
      validationError = 'Username duplikat di dalam file Excel.';
    }

    if (cleanUsername) {
      seenInFile.add(cleanUsername);
    }

    parsed.push({
      tempId: `stu-${r}-${Math.random().toString(36).slice(2, 6)}`,
      rowNumber: r + 1,
      isExample,
      username: cleanUsername || rawUser,
      name: rawName,
      className: rawClass || 'Umum',
      pin: rawPin,
      validationError,
    });
  }

  if (parsed.length === 0) {
    throw new Error('Tidak ditemukan baris data siswa pada file Excel.');
  }

  return parsed;
}
