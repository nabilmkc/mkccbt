import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function cellBorders() {
  return {
    top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  };
}

export async function downloadWordTemplate(schoolName?: string): Promise<void> {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 900, right: 900, bottom: 900, left: 900 },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: (schoolName || 'MKC CBT DIGITAL').toUpperCase(),
                bold: true,
                size: 28,
                font: 'Calibri',
                color: '0F172A',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: 'TEMPLATE IMPORT BANK SOAL WORD (.DOCX)',
                bold: true,
                size: 24,
                font: 'Calibri',
                color: '1D4ED8',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            border: {
              bottom: {
                color: '1D4ED8',
                space: 6,
                style: BorderStyle.DOUBLE,
                size: 12,
              },
            },
            children: [
              new TextRun({
                text: 'Mendukung Pilihan Ganda, Benar / Salah, Isian Singkat, Uraian, serta Lampiran Gambar',
                size: 20,
                font: 'Calibri',
                color: '475569',
              }),
            ],
          }),
          new Paragraph({
            spacing: { before: 80, after: 80 },
            children: [
              new TextRun({
                text: 'Petunjuk Pengisian Template untuk Import Otomatis:',
                bold: true,
                size: 21,
                color: '0F172A',
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 50 },
            children: [
              new TextRun({
                text: '1. Jangan mengubah judul kolom pada baris header biru tabel di bawah ini.',
                size: 19,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 50 },
            children: [
              new TextRun({
                text: '2. Kolom "Tipe Soal" isi dengan: PG, Benar / Salah, Isian Singkat, atau Uraian.',
                size: 19,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 50 },
            children: [
              new TextRun({
                text: '3. Anda dapat menempelkan gambar/diagram langsung di dalam sel kolom "Rumusan Soal & Gambar". Gambar akan otomatis ikut terunggah saat file .docx di-import.',
                size: 19,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 50 },
            children: [
              new TextRun({
                text: '4. Untuk Pilihan Ganda (PG), tulis setiap opsi pada baris baru dengan awalan A., B., C., D. (dan E. bila perlu), lalu isi Kunci dengan huruf opsi (contoh: A).',
                size: 19,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 160 },
            children: [
              new TextRun({
                text: '5. Baris yang berlabel "(Contoh)" otomatis dikenali sistem dan dapat dilewati saat proses import. Isi mulai baris nomor 5 dst.',
                size: 19,
              }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  'No',
                  'Tipe Soal',
                  'Rumusan Soal & Gambar',
                  'Opsi Jawaban (Khusus PG)',
                  'Kunci / Rubrik',
                  'Bobot',
                ].map(
                  (heading) =>
                    new TableCell({
                      borders: cellBorders(),
                      shading: { type: ShadingType.CLEAR, fill: '1D4ED8' },
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [
                            new TextRun({
                              text: heading,
                              bold: true,
                              size: 19,
                              color: 'FFFFFF',
                            }),
                          ],
                        }),
                      ],
                    })
                ),
              }),
              ...[
                [
                  '1 (Contoh)',
                  'PG',
                  'Perangkat keras jaringan yang berfungsi meneruskan paket data antar segmen jaringan yang berbeda adalah...',
                  'A. Router\nB. Switch\nC. Hub\nD. Repeater',
                  'A',
                  '15',
                ],
                [
                  '2 (Contoh)',
                  'Benar / Salah',
                  'Protokol HTTPS mengenkripsi pertukaran data antara peramban (browser) dan server.',
                  '-',
                  'BENAR',
                  '10',
                ],
                [
                  '3 (Contoh)',
                  'Isian Singkat',
                  'Perintah SQL untuk menambahkan baris data baru ke dalam tabel adalah ____.',
                  '-',
                  'INSERT,INSERT INTO',
                  '15',
                ],
                [
                  '4 (Contoh)',
                  'Uraian',
                  'Jelaskan perbedaan antara Primary Key dan Foreign Key pada basis data relasional!',
                  '-',
                  'Primary key bernilai unik tiap baris; Foreign key merujuk primary key tabel lain.',
                  '20',
                ],
                ['5', 'PG', '', 'A. \nB. \nC. \nD. ', '', '10'],
                ['6', 'PG', '', 'A. \nB. \nC. \nD. ', '', '10'],
                ['7', 'Benar / Salah', '', '-', '', '10'],
                ['8', 'Isian Singkat', '', '-', '', '10'],
                ['9', 'Uraian', '', '-', '', '20'],
                ['10', 'PG', '', 'A. \nB. \nC. \nD. ', '', '10'],
              ].map(
                (row) =>
                  new TableRow({
                    children: row.map(
                      (cellText, colIdx) =>
                        new TableCell({
                          borders: cellBorders(),
                          shading: row[0].includes('Contoh')
                            ? { type: ShadingType.CLEAR, fill: 'F8FAFC' }
                            : undefined,
                          width: {
                            size:
                              colIdx === 0
                                ? 8
                                : colIdx === 1
                                ? 13
                                : colIdx === 2
                                ? 30
                                : colIdx === 3
                                ? 23
                                : colIdx === 4
                                ? 18
                                : 8,
                            type: WidthType.PERCENTAGE,
                          },
                          children: cellText.split('\n').map(
                            (line) =>
                              new Paragraph({
                                children: [new TextRun({ text: line, size: 19 })],
                              })
                          ),
                        })
                    ),
                  })
              ),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, 'Template_Bank_Soal_MKC_CBT.docx');
}
