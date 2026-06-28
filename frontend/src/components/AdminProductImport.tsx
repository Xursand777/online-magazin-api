import { useState, useRef, useCallback, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { adminBulkImportProducts } from '../api/endpoints';
import { toast } from '../utils/toast';

// ─────────────────────────────────────────────────────────────────────────────
//  Ommaviy mahsulot import (CSV / Excel)
//
//  Backend: POST /api/admin/bulk-import/ (AdminBulkImportView)
//  Ustunlar: name* + (price_usd | price)* , category_id, stock, description,
//            is_active, is_new, is_popular, discount_price_usd, discount_price,
//            cost_price, shelf_location.  (is_discount avtomatik.)
//
//  Phase 4.2 — shelf_location ixtiyoriy ustun (max 20 belgi). Bo'sh bo'lsa
//  default ''. Admin Excel'da 100+ mahsulotni polkalari bilan birga import
//  qila oladi (faqat admin/POS ko'radi, public API'da chiqmaydi).
//  Cheklov: 10MB, 50 000 satr.
//
//  Bu komponent — "professional ideal" UX:
//   1. Namuna shablon (CSV/Excel) yuklab olish
//   2. Drag&drop yoki tanlash
//   3. KLIENT tomonda parse → ustun aniqlash + jadval preview + validatsiya
//   4. Sozlamalar: avto-tarjima, standart kategoriya
//   5. Natija: yaratildi / o'tkazib yuborildi / xatolar (qator bilan)
// ─────────────────────────────────────────────────────────────────────────────

interface CategoryLite {
  id: number;
  name?: string | null;
  name_uz?: string | null;
}

interface ImportError {
  row: number;
  error: string;
}

interface ImportResult {
  created_count: number;
  skipped_count: number;
  total_processed: number;
  error_count: number;
  errors: ImportError[];
  warnings: string[];
}

interface ParsedFile {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

interface Validation {
  hasName: boolean;
  hasAnyPrice: boolean;
  missingName: number;
  missingPrice: number;
  unknown: string[];
  validCount: number;
  fatal: boolean;
  hasCategory: boolean;
}

// Backend qabul qiladigan barcha ustunlar (tartibda)
const TEMPLATE_HEADERS = [
  'name',
  'price_usd',
  'price',
  'category_id',
  'stock',
  'description',
  'is_active',
  'is_new',
  'is_popular',
  'discount_price_usd',
  'discount_price',
  'cost_price',
  // Phase 4.2 — do'kondagi polka manzili (admin/POS uchun). Max 20 belgi.
  'shelf_location',
] as const;

const TEMPLATE_EXAMPLE_ROWS: string[][] = [
  ['iPhone 16 Pro', '1099', '', '', '50', 'Apple smartfon', 'true', 'true', 'true', '', '', '950', '001-A'],
  ['Smartfon Samsung Galaxy A56', '', '12000000', '', '30', '', 'true', 'true', 'false', '', '11500000', '9800000', '002'],
];

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const PREVIEW_ROWS = 8;

// ─── Robust CSV parser (tirnoq ichidagi vergul/qator uziluvini hisobga oladi) ──
const parseCsv = (text: string): string[][] => {
  // BOM ni olib tashlaymiz
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',' || c === ';') { row.push(field); field = ''; }
      else if (c === '\r') { /* e'tiborsiz */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  // To'liq bo'sh qatorlarni tashlaymiz
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
};

// ─── Excel (.xlsx/.xls) ni exceljs orqali o'qish ──────────────────────────────
const parseExcel = async (file: File): Promise<string[][]> => {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow((row) => {
    // exceljs `row.values` 1-indeksli (0-element undefined)
    const vals = (row.values as unknown[]).slice(1).map((v) => {
      if (v == null) return '';
      if (typeof v === 'object' && v !== null && 'text' in (v as any)) return String((v as any).text);
      if (typeof v === 'object' && v !== null && 'result' in (v as any)) return String((v as any).result ?? '');
      return String(v);
    });
    rows.push(vals);
  });
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
};

const escapeCsvCell = (v: string) =>
  /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

const buildCsvTemplate = (): string => {
  const lines = [TEMPLATE_HEADERS.join(',')];
  for (const r of TEMPLATE_EXAMPLE_ROWS) lines.push(r.map(escapeCsvCell).join(','));
  return '﻿' + lines.join('\r\n'); // BOM — Excel kirillchani to'g'ri o'qiydi
};

const downloadBlob = (content: BlobPart, filename: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const fmtSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const categoryLabel = (c: CategoryLite) => c.name_uz || c.name || `#${c.id}`;

// ─────────────────────────────────────────────────────────────────────────────

const AdminProductImport = ({
  categories,
  onClose,
  onImported,
}: {
  categories: CategoryLite[];
  onClose: () => void;
  onImported: () => void;
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [translate, setTranslate] = useState(true);
  const [defaultCategory, setDefaultCategory] = useState('');

  const [result, setResult] = useState<ImportResult | null>(null);
  const [showAllErrors, setShowAllErrors] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // ── Fayl tanlanganda: tekshir + klient tomonda parse qil ──────────────────
  const handleFile = useCallback(async (f: File) => {
    setResult(null);
    setParseError(null);
    setParsed(null);

    const name = f.name.toLowerCase();
    const isCsv = name.endsWith('.csv');
    const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
    if (!isCsv && !isExcel) {
      setParseError('Faqat .csv, .xlsx yoki .xls fayl qabul qilinadi.');
      return;
    }
    if (f.size > MAX_SIZE) {
      setParseError(`Fayl hajmi ${fmtSize(f.size)}. Maksimal ruxsat: 10 MB.`);
      return;
    }

    setFile(f);
    setParsing(true);
    try {
      let matrix: string[][];
      if (isExcel) {
        matrix = await parseExcel(f);
      } else {
        matrix = parseCsv(await f.text());
      }
      if (matrix.length < 1) {
        setParseError('Fayl bo\'sh — sarlavha (header) qatori topilmadi.');
        setParsing(false);
        return;
      }
      const headers = matrix[0].map((h) => h.trim().toLowerCase());
      const rows = matrix.slice(1);
      setParsed({ headers, rows, totalRows: rows.length });
    } catch (e: any) {
      setParseError(`Faylni o'qib bo'lmadi: ${e?.message || e}`);
      setFile(null);
    } finally {
      setParsing(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  // ── Validatsiya (klient tomonda — yuborishdan oldin) ──────────────────────
  const validation = useMemo((): Validation | null => {
    if (!parsed) return null;
    const has = (col: string) => parsed.headers.includes(col);
    const nameIdx = parsed.headers.indexOf('name');
    const priceIdx = parsed.headers.indexOf('price');
    const priceUsdIdx = parsed.headers.indexOf('price_usd');

    const hasName = nameIdx !== -1;
    const hasAnyPrice = priceIdx !== -1 || priceUsdIdx !== -1;

    // Har bir qatorda majburiy maydonlar to'ldirilganmi
    let missingName = 0;
    let missingPrice = 0;
    for (const r of parsed.rows) {
      const nm = nameIdx !== -1 ? (r[nameIdx] || '').trim() : '';
      const pr = priceIdx !== -1 ? (r[priceIdx] || '').trim() : '';
      const pu = priceUsdIdx !== -1 ? (r[priceUsdIdx] || '').trim() : '';
      if (!nm) missingName++;
      if (!pr && !pu) missingPrice++;
    }

    // Notanish ustunlar (backend e'tiborsiz qoldiradi — ogohlantirish)
    const unknown = parsed.headers.filter(
      (h) => h && !TEMPLATE_HEADERS.includes(h as any),
    );

    const validCount = parsed.rows.length - Math.max(missingName, missingPrice);
    const fatal = !hasName || !hasAnyPrice;

    return {
      hasName, hasAnyPrice, missingName, missingPrice,
      unknown, validCount: Math.max(0, validCount), fatal,
      hasCategory: has('category_id'),
    };
  }, [parsed]);

  const importMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('file', file as File);
      fd.append('format', file!.name.toLowerCase().endsWith('.csv') ? 'csv' : 'excel');
      fd.append('translate', translate ? 'true' : 'false');
      if (defaultCategory) fd.append('default_category_id', defaultCategory);
      const res = await adminBulkImportProducts(fd);
      return res.data as ImportResult;
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.created_count > 0) {
        toast.success(`${data.created_count} ta mahsulot import qilindi!`);
        onImported();
      } else {
        toast.error('Hech narsa import qilinmadi — xatolarni tekshiring.');
      }
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error || e?.message || 'Import xatosi';
      // Backend 400 + result tanasi qaytarishi mumkin
      if (e?.response?.data?.created_count !== undefined) {
        setResult(e.response.data as ImportResult);
      }
      toast.error(msg);
    },
  });

  const resetFile = () => {
    setFile(null);
    setParsed(null);
    setParseError(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const bigImportWarning = !!parsed && translate && parsed.totalRows > 500;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-8">
      <div className="w-full max-w-3xl rounded-2xl bg-surface-container-lowest shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between rounded-t-2xl bg-primary px-6 py-4">
          <div className="flex items-center gap-2 text-on-primary">
            <span className="material-symbols-outlined">upload_file</span>
            <div>
              <h3 className="text-lg font-bold leading-tight">Ommaviy import (Excel / CSV)</h3>
              <p className="text-xs opacity-80">Bir faylda minglab mahsulot — bittalab kiritish shart emas</p>
            </div>
          </div>
          <button onClick={onClose} className="text-on-primary/70 hover:text-on-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* ─── NATIJA ko'rsatilsa, faqat shuni ko'rsatamiz ─── */}
          {result ? (
            <ImportResultView
              result={result}
              showAll={showAllErrors}
              onToggleErrors={() => setShowAllErrors((v) => !v)}
              onAgain={() => { resetFile(); setShowAllErrors(false); }}
              onClose={onClose}
            />
          ) : (
            <>
              {/* 1) Shablon */}
              <div className="rounded-xl border border-outline-variant bg-surface-container p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-primary">description</span>
                  <p className="text-sm font-semibold text-on-surface">1. Namuna shablonni yuklab oling</p>
                </div>
                <p className="mb-3 text-xs text-on-surface-variant">
                  To'g'ri ustunlar bilan tayyor fayl. To'ldiring va shu yerga yuklang.{' '}
                  <b>name</b> va (<b>price_usd</b> yoki <b>price</b>) — majburiy.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => downloadBlob(buildCsvTemplate(), 'mahsulot-shablon.csv', 'text/csv;charset=utf-8')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20"
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    CSV shablon
                  </button>
                  <button
                    type="button"
                    onClick={downloadExcelTemplate}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-1.5 text-xs font-bold text-[#16a34a] hover:bg-[#22c55e]/20"
                  >
                    <span className="material-symbols-outlined text-[16px]">table_view</span>
                    Excel shablon
                  </button>
                </div>
              </div>

              {/* 2) Fayl tanlash / drag&drop */}
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-on-surface">
                  <span className="material-symbols-outlined text-[20px] text-primary">cloud_upload</span>
                  2. Faylni yuklang
                </p>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => inputRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors ${
                    dragOver ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-primary/60 hover:bg-surface-container/40'
                  }`}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                  {parsing ? (
                    <><span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                    <p className="mt-1 text-sm text-on-surface-variant">O'qilmoqda...</p></>
                  ) : file ? (
                    <>
                      <span className="material-symbols-outlined text-3xl text-primary">task</span>
                      <p className="mt-1 text-sm font-semibold text-on-surface">{file.name}</p>
                      <p className="text-xs text-on-surface-variant">{fmtSize(file.size)}{parsed ? ` · ${parsed.totalRows} ta qator` : ''}</p>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); resetFile(); }}
                        className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-error hover:bg-error/10"
                      >
                        <span className="material-symbols-outlined text-[14px]">delete</span> Boshqa fayl
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-3xl text-on-surface-variant">upload</span>
                      <p className="mt-1 text-sm font-medium text-on-surface">Faylni shu yerga tashlang yoki bosing</p>
                      <p className="text-xs text-on-surface-variant">.csv, .xlsx, .xls — maks. 10 MB</p>
                    </>
                  )}
                </div>
                {parseError && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-error">
                    <span className="material-symbols-outlined text-[15px]">error</span>{parseError}
                  </p>
                )}
              </div>

              {/* Validatsiya + preview */}
              {parsed && validation && (
                <ImportPreview parsed={parsed} validation={validation} />
              )}

              {/* 3) Sozlamalar */}
              {parsed && (
                <div className="rounded-xl border border-outline-variant bg-surface-container p-4 space-y-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                    <span className="material-symbols-outlined text-[20px] text-primary">tune</span>
                    3. Sozlamalar
                  </p>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={translate}
                      onChange={(e) => setTranslate(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded accent-primary"
                    />
                    <span className="text-sm text-on-surface">
                      Avtomatik tarjima (Ruscha / Inglizcha)
                      <span className="block text-xs text-on-surface-variant">
                        Mahsulot nomi va tavsifi 3 tilga tarjima qilinadi.
                      </span>
                    </span>
                  </label>
                  {bigImportWarning && (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:border-amber-800/40 dark:text-amber-300">
                      <span className="material-symbols-outlined text-[16px]">warning</span>
                      <span>
                        {parsed.totalRows} ta qator + tarjima sekin bo'lishi mumkin (har biri uchun tarjima so'rovi).
                        Katta import uchun tarjimani <b>o'chirib</b> yuklang, keyin tarjimani alohida ishga tushiring — ancha tez.
                      </span>
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-on-surface-variant">
                      Standart kategoriya <span className="font-normal">(category_id bo'sh qatorlar uchun)</span>
                    </label>
                    <select
                      value={defaultCategory}
                      onChange={(e) => setDefaultCategory(e.target.value)}
                      className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="">— Yo'q (kategoriyasiz) —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{categoryLabel(c)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer (natija yo'q paytda) */}
        {!result && (
          <div className="flex gap-3 border-t border-outline-variant px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-outline-variant py-3 font-bold text-on-surface hover:bg-surface-container"
            >
              Bekor qilish
            </button>
            <button
              type="button"
              onClick={() => importMutation.mutate()}
              disabled={!file || !parsed || !!validation?.fatal || importMutation.isPending}
              className="flex-[1.5] rounded-xl bg-primary py-3 font-bold text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {importMutation.isPending ? (
                <><span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> Import qilinmoqda... (kuting)</>
              ) : (
                <><span className="material-symbols-outlined text-[18px]">upload</span>
                {validation ? `${validation.validCount} ta mahsulotni import qilish` : 'Import qilish'}</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Excel shablon — exceljs orqali (lazy)
const downloadExcelTemplate = async () => {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Mahsulotlar');
  ws.addRow([...TEMPLATE_HEADERS]);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
  for (const r of TEMPLATE_EXAMPLE_ROWS) ws.addRow(r);
  ws.columns.forEach((col) => { col.width = 18; });
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(buf, 'mahsulot-shablon.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
};

// ─── Preview + validatsiya ko'rinishi ─────────────────────────────────────────
const ImportPreview = ({
  parsed,
  validation,
}: {
  parsed: ParsedFile;
  validation: Validation;
}) => {
  const v = validation;
  return (
    <div className="rounded-xl border border-outline-variant overflow-hidden">
      {/* Validatsiya xulosasi */}
      <div className={`px-4 py-3 ${v.fatal ? 'bg-error-container/30' : 'bg-green-50 dark:bg-green-900/20'}`}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className={`flex items-center gap-1 font-bold ${v.fatal ? 'text-error' : 'text-green-700 dark:text-green-400'}`}>
            <span className="material-symbols-outlined text-[16px]">{v.fatal ? 'error' : 'check_circle'}</span>
            {v.fatal
              ? 'Majburiy ustun(lar) yetishmayapti'
              : `${v.validCount} ta qator import uchun tayyor`}
          </span>
          <span className="text-on-surface-variant">Jami: <b>{parsed.totalRows}</b> qator</span>
          {v.missingName > 0 && <span className="text-amber-600">name bo'sh: {v.missingName}</span>}
          {v.missingPrice > 0 && <span className="text-amber-600">narxsiz: {v.missingPrice}</span>}
        </div>
        {!v.hasName && <p className="mt-1 text-xs font-semibold text-error">• <code>name</code> ustuni topilmadi</p>}
        {!v.hasAnyPrice && <p className="mt-0.5 text-xs font-semibold text-error">• <code>price</code> yoki <code>price_usd</code> ustuni topilmadi</p>}
        {v.unknown.length > 0 && (
          <p className="mt-1 text-xs text-on-surface-variant">
            Notanish ustun(lar) e'tiborsiz qoldiriladi: {v.unknown.map((u: string) => <code key={u} className="mx-0.5">{u}</code>)}
          </p>
        )}
      </div>

      {/* Jadval preview (birinchi bir necha qator) */}
      <div className="max-h-60 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-surface-container">
            <tr>
              {parsed.headers.map((h, i) => (
                <th
                  key={i}
                  className={`whitespace-nowrap border-b border-outline-variant px-2.5 py-1.5 text-left font-bold ${
                    TEMPLATE_HEADERS.includes(h as any) ? 'text-on-surface' : 'text-on-surface-variant/60'
                  }`}
                >
                  {h || '—'}
                  {(h === 'name' || h === 'price' || h === 'price_usd') && (
                    <span className="ml-0.5 text-primary">*</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.rows.slice(0, PREVIEW_ROWS).map((r, ri) => (
              <tr key={ri} className="odd:bg-surface-container/30">
                {parsed.headers.map((_, ci) => (
                  <td key={ci} className="whitespace-nowrap border-b border-outline-variant/50 px-2.5 py-1 text-on-surface-variant">
                    {(r[ci] ?? '').slice(0, 30) || <span className="opacity-30">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {parsed.totalRows > PREVIEW_ROWS && (
        <div className="bg-surface-container px-3 py-1.5 text-center text-[11px] text-on-surface-variant">
          … va yana {parsed.totalRows - PREVIEW_ROWS} ta qator
        </div>
      )}
    </div>
  );
};

// ─── Natija ko'rinishi ────────────────────────────────────────────────────────
const ImportResultView = ({
  result,
  showAll,
  onToggleErrors,
  onAgain,
  onClose,
}: {
  result: ImportResult;
  showAll: boolean;
  onToggleErrors: () => void;
  onAgain: () => void;
  onClose: () => void;
}) => {
  const ok = result.created_count > 0;
  const errs = showAll ? result.errors : result.errors.slice(0, 10);
  return (
    <div className="space-y-4">
      <div className={`rounded-xl p-5 text-center ${ok ? 'bg-green-50 dark:bg-green-900/20' : 'bg-error-container/30'}`}>
        <span className={`material-symbols-outlined text-5xl ${ok ? 'text-green-600' : 'text-error'}`}>
          {ok ? 'check_circle' : 'cancel'}
        </span>
        <p className={`mt-1 text-lg font-bold ${ok ? 'text-green-700 dark:text-green-400' : 'text-error'}`}>
          {ok ? 'Import yakunlandi!' : 'Import amalga oshmadi'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatBox label="Yaratildi" value={result.created_count} tone="green" />
        <StatBox label="O'tkazildi" value={result.skipped_count} tone="amber" />
        <StatBox label="Xatolar" value={result.error_count} tone="red" />
      </div>

      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/40 dark:bg-amber-900/20">
          <p className="mb-1 text-xs font-bold text-amber-800 dark:text-amber-300">Ogohlantirishlar</p>
          <ul className="max-h-28 space-y-0.5 overflow-auto text-xs text-amber-700 dark:text-amber-400">
            {result.warnings.slice(0, 50).map((w, i) => <li key={i}>• {w}</li>)}
          </ul>
        </div>
      )}

      {result.errors.length > 0 && (
        <div className="rounded-lg border border-outline-variant">
          <div className="flex items-center justify-between border-b border-outline-variant px-3 py-2">
            <p className="text-xs font-bold text-error">Xatolar ({result.errors.length})</p>
            {result.errors.length > 10 && (
              <button onClick={onToggleErrors} className="text-xs font-semibold text-primary hover:underline">
                {showAll ? 'Kamroq' : `Hammasini ko'rsatish`}
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-auto">
            <table className="w-full text-xs">
              <tbody>
                {errs.map((e, i) => (
                  <tr key={i} className="border-b border-outline-variant/40">
                    <td className="w-16 px-3 py-1.5 font-mono font-bold text-on-surface-variant">#{e.row}</td>
                    <td className="px-3 py-1.5 text-on-surface">{e.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button onClick={onAgain} className="flex-1 rounded-xl border border-outline-variant py-3 font-bold text-on-surface hover:bg-surface-container">
          Yana import
        </button>
        <button onClick={onClose} className="flex-1 rounded-xl bg-primary py-3 font-bold text-on-primary hover:opacity-90">
          Yopish
        </button>
      </div>
    </div>
  );
};

const StatBox = ({ label, value, tone }: { label: string; value: number; tone: 'green' | 'amber' | 'red' }) => {
  const toneCls = {
    green: 'text-green-600',
    amber: 'text-amber-600',
    red: value > 0 ? 'text-error' : 'text-on-surface-variant',
  }[tone];
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container px-3 py-3 text-center">
      <div className={`text-2xl font-extrabold ${toneCls}`}>{value}</div>
      <div className="text-[11px] font-semibold uppercase text-on-surface-variant">{label}</div>
    </div>
  );
};

export default AdminProductImport;
