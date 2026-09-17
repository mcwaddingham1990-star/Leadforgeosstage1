import React, { useMemo, useState } from "react";
import { Upload, X, AlertTriangle, CheckCircle, FileText } from "lucide-react";
import { parseSheet, readRow, extractPdfTableText, type ImportFieldSpec, type ParsedSheet } from "../lib/spreadsheetImport";

interface BulkImportModalProps<K extends string> {
  title: string;
  /** One line explaining what this import creates, shown under the title (e.g. "Creates real customer records -- any column order works."). */
  description: string;
  fields: ImportFieldSpec<K>[];
  /** Called once with every successfully-mapped row when the user hits Confirm. Return value (or thrown error) isn't awaited here -- the caller owns its own success/error notification. */
  onConfirm: (rows: Array<Partial<Record<K, string>>>) => void;
  onClose: () => void;
  confirmLabel?: string;
}

/**
 * Generic "upload your existing spreadsheet and have it autopopulate" modal
 * -- accepts a CSV/TSV file, a pasted block of spreadsheet cells, or a PDF
 * (real text-layer extraction, see extractPdfTableText), auto-matches
 * columns to the caller's field schema by header name, and lets the user
 * fix any column it guessed wrong before committing. Every page that needs
 * a bulk import (Customers, Roster invites, Scheduling/Jobs) uses this same
 * component instead of hand-rolling its own file input + preview table.
 */
export function BulkImportModal<K extends string>({ title, description, fields, onConfirm, onClose, confirmLabel }: BulkImportModalProps<K>) {
  const [sheet, setSheet] = useState<ParsedSheet<K> | null>(null);
  const [columnMap, setColumnMap] = useState<Array<K | null>>([]);
  const [error, setError] = useState<string | null>(null);
  const [isReadingPdf, setIsReadingPdf] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const loadText = (text: string) => {
    const parsed = parseSheet<K>(text, fields);
    if (!parsed.headers.length) {
      setError("Couldn't find any rows -- make sure the first line is a header row.");
      setSheet(null);
      return;
    }
    setSheet(parsed);
    setColumnMap(parsed.columnMap);
    setError(null);
  };

  const handleFile = async (file: File) => {
    setError(null);
    if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
      setIsReadingPdf(true);
      try {
        const text = await extractPdfTableText(file);
        if (!text.trim()) {
          setError("Couldn't find any real text in that PDF -- this works on PDFs exported from a spreadsheet/report (real text layer), not a scanned photo of paper records.");
        } else {
          loadText(text);
        }
      } catch {
        setError("Couldn't read that PDF. Try exporting it as a CSV instead if your source software offers that.");
      } finally {
        setIsReadingPdf(false);
      }
      return;
    }
    const text = await file.text();
    loadText(text);
  };

  const requiredMissing = useMemo(() => {
    if (!sheet) return [];
    return fields.filter(f => f.required && !columnMap.includes(f.key));
  }, [fields, columnMap, sheet]);

  const mappedRows = useMemo(() => {
    if (!sheet) return [];
    return sheet.rows.map(row => readRow(row, columnMap));
  }, [sheet, columnMap]);

  const canConfirm = !!sheet && sheet.rows.length > 0 && requiredMissing.length === 0;

  return (
    <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-white" />
            <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">{title}</h3>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-[#1F3557]">
          <p className="text-[11px] text-[#5E7393] leading-relaxed">{description} Column order doesn't matter -- headers are matched automatically, and you can fix any column below before importing.</p>

          <div className="relative border-2 border-dashed border-[#9EC8EF] hover:border-[#315C9F] bg-[#EAF5FF]/30 hover:bg-[#EAF5FF]/50 rounded-2xl p-6 transition-colors text-center cursor-pointer">
            <input
              type="file"
              accept=".csv,.tsv,.txt,.pdf"
              onChange={e => { const file = e.target.files?.[0]; if (file) void handleFile(file); }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-8 h-8 text-[#315C9F]" />
              <p className="text-xs font-extrabold">{isReadingPdf ? "Reading PDF…" : "Click to select or drag & drop a file"}</p>
              <p className="text-[10px] text-[#5E7393]">CSV, TSV, or PDF (from a spreadsheet/report export)</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-[#5E7393]">Or paste rows copied from a spreadsheet</label>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              rows={3}
              placeholder="Paste header row + data rows here…"
              className="w-full text-[11px] font-mono border border-[#9EC8EF] rounded-xl px-3 py-2 focus:outline-none focus:border-[#315C9F]"
            />
            {pasteText.trim() && (
              <button type="button" onClick={() => loadText(pasteText)} className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] text-[10.5px] font-bold rounded-xl cursor-pointer">
                Parse pasted rows
              </button>
            )}
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl flex items-center gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="font-semibold">{error}</span>
            </div>
          )}

          {sheet && sheet.headers.length > 0 && (
            <div className="space-y-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#5E7393] block mb-1.5">Column mapping ({sheet.rows.length} row{sheet.rows.length === 1 ? "" : "s"} found)</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {sheet.headers.map((header, idx) => (
                    <div key={idx} className="bg-[#EAF5FF]/40 border border-[#9EC8EF]/30 rounded-xl p-2 space-y-1">
                      <p className="text-[9px] font-bold text-[#5E7393] truncate" title={header}>{header || `Column ${idx + 1}`}</p>
                      <select
                        value={columnMap[idx] || ""}
                        onChange={e => {
                          const next = [...columnMap];
                          next[idx] = (e.target.value || null) as K | null;
                          setColumnMap(next);
                        }}
                        className="w-full text-[10px] font-bold bg-white border border-[#9EC8EF] rounded-lg px-1.5 py-1 focus:outline-none"
                      >
                        <option value="">Ignore this column</option>
                        {fields.map(f => <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {requiredMissing.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl flex items-center gap-2 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="font-semibold">Map a column to: {requiredMissing.map(f => f.label).join(", ")} before importing.</span>
                </div>
              )}

              <div>
                <span className="text-[10px] uppercase font-bold text-[#5E7393] block mb-1.5">Preview (first {Math.min(5, mappedRows.length)} of {mappedRows.length})</span>
                <div className="border border-[#9EC8EF]/40 rounded-xl overflow-hidden max-h-48 overflow-y-auto divide-y divide-[#9EC8EF]/20 bg-slate-50">
                  {mappedRows.slice(0, 5).map((row, idx) => (
                    <div key={idx} className="p-2 text-[10.5px] flex flex-wrap gap-x-3 gap-y-0.5">
                      {fields.filter(f => row[f.key]).map(f => (
                        <span key={f.key}><span className="font-bold text-[#5E7393]">{f.label}:</span> {row[f.key]}</span>
                      ))}
                      {!fields.some(f => row[f.key]) && <span className="text-[#5E7393] italic">No mapped fields on this row -- will be skipped.</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-50 border-t border-[#9EC8EF]/40 px-6 py-4 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => { onConfirm(mappedRows.filter(row => fields.some(f => row[f.key]))); onClose(); }}
            className={`px-4 py-2 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1 ${canConfirm ? "bg-[#315C9F] hover:bg-[#1F3557]" : "bg-slate-300 cursor-not-allowed"}`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            {confirmLabel || `Import (${mappedRows.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BulkImportModal;
