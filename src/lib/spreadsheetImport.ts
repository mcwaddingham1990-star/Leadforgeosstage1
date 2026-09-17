// Shared "upload your existing spreadsheet (or a tabular PDF export) and
// have it autopopulate" engine, used by every bulk-import flow (Customers,
// Roster invites, Scheduling/Jobs). One real business's export column order
// almost never matches another's, so this matches columns by fuzzy header
// name instead of requiring an exact template -- the same job LeadsPage's
// existing CSV importer already did by hand; this generalizes that pattern
// so every page gets it instead of re-deriving it.
import { parseCsv } from "./csv";

export interface ImportFieldSpec<K extends string = string> {
  key: K;
  label: string;
  /** Header names (any casing/punctuation) this field should match, e.g. ["Company Name", "Business", "Company"]. */
  aliases: string[];
  required?: boolean;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Best-effort column -> field mapping by header name. Returns, per column index, the matched field key (or null if nothing matched) so the caller can still offer a manual override UI for anything guessed wrong. */
export function autoMapHeaders<K extends string>(headers: string[], fields: ImportFieldSpec<K>[]): Array<K | null> {
  const used = new Set<K>();
  return headers.map(header => {
    const norm = normalizeHeader(header);
    if (!norm) return null;
    // Exact alias match first (highest confidence).
    for (const field of fields) {
      if (used.has(field.key)) continue;
      if (field.aliases.some(alias => normalizeHeader(alias) === norm)) {
        used.add(field.key);
        return field.key;
      }
    }
    // Fall back to a substring match (e.g. header "Customer Phone Number" vs alias "phone").
    for (const field of fields) {
      if (used.has(field.key)) continue;
      if (field.aliases.some(alias => {
        const a = normalizeHeader(alias);
        return a.length >= 3 && (norm.includes(a) || a.includes(norm));
      })) {
        used.add(field.key);
        return field.key;
      }
    }
    return null;
  });
}

export interface ParsedSheet<K extends string = string> {
  headers: string[];
  rows: string[][];
  /** headers[i] -> columnMap[i], the auto-detected field for that column (editable by the user before commit). */
  columnMap: Array<K | null>;
}

function detectDelimiter(firstLine: string): string {
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
}

/** Parses raw delimited text (CSV, TSV, or a pasted Excel selection) and auto-maps its header row to the given field schema. */
export function parseSheet<K extends string>(text: string, fields: ImportFieldSpec<K>[]): ParsedSheet<K> {
  const delimiter = detectDelimiter(text.split(/\r?\n/)[0] || "");
  const table = parseCsv(text, delimiter);
  if (!table.length) return { headers: [], rows: [], columnMap: [] };
  const [headerRow, ...dataRows] = table;
  const headers = headerRow.map(h => h.trim());
  return { headers, rows: dataRows.filter(r => r.some(c => c.trim() !== "")), columnMap: autoMapHeaders(headers, fields) };
}

/** Reads a mapped row into a plain object keyed by field, given the sheet's current column map (post any manual user correction). */
export function readRow<K extends string>(row: string[], columnMap: Array<K | null>): Partial<Record<K, string>> {
  const record: Partial<Record<K, string>> = {};
  columnMap.forEach((key, idx) => {
    if (key && row[idx] !== undefined) record[key] = row[idx].trim();
  });
  return record;
}

/**
 * Best-effort table reconstruction from a PDF's real text layer -- reads
 * actual embedded text via pdf.js (same library/worker SelfieSaveEditor
 * already uses to render PDFs), then rebuilds rows/columns from each text
 * item's real x/y position: items on close-together y are one row, items
 * separated by a wide x gap are different columns. Works well for PDFs
 * that started life as a spreadsheet/report export (aligned columns, real
 * whitespace between them). Does NOT do OCR -- a scanned photo of paper
 * records has no text layer at all and will come back empty; that's a
 * genuinely different (much bigger, AI-vision) problem this doesn't claim
 * to solve.
 */
export async function extractPdfTableText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfWorkerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  const Y_TOLERANCE = 3; // points -- items within this band count as the same row
  const COLUMN_GAP = 10; // points -- an x-gap at least this wide is a new column, not a word-space

  const lines: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const items = (content.items as any[]).filter(item => typeof item.str === "string" && item.str.trim() !== "");

    const rows = new Map<number, Array<{ x: number; endX: number; str: string }>>();
    for (const item of items) {
      const x = item.transform[4];
      const y = item.transform[5];
      const width = item.width ?? item.str.length * (item.height || 8) * 0.5;
      let bucketKey = y;
      for (const existingKey of rows.keys()) {
        if (Math.abs(existingKey - y) <= Y_TOLERANCE) { bucketKey = existingKey; break; }
      }
      if (!rows.has(bucketKey)) rows.set(bucketKey, []);
      rows.get(bucketKey)!.push({ x, endX: x + width, str: item.str });
    }

    const orderedRowKeys = Array.from(rows.keys()).sort((a, b) => b - a); // PDF y grows upward -- read top to bottom
    for (const key of orderedRowKeys) {
      const cells = rows.get(key)!.sort((a, b) => a.x - b.x);
      let line = "";
      let prevEnd: number | null = null;
      for (const cell of cells) {
        if (prevEnd === null) {
          line = cell.str;
        } else {
          const gap = cell.x - prevEnd;
          line += (gap >= COLUMN_GAP ? "\t" : " ") + cell.str;
        }
        prevEnd = cell.endX;
      }
      lines.push(line);
    }
  }
  return lines.join("\n");
}
