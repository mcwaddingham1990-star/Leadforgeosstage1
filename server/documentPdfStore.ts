import type { Request, Response } from "express";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAuthzDb } from "./authz";
import { MAX_INLINE_BASE64_LENGTH } from "../src/lib/firestoreDocumentLimits";

/**
 * PDFs too big to sit inline on a documents/{id} record (Firestore caps a
 * record at ~1 MiB) are stored here in ~900 KB pieces instead, and the
 * record carries `pdfChunked: true` in place of `pdfBase64`. Before this,
 * a large PDF was silently never saved -- so a customer could be sent a
 * signing link for a document that wasn't there.
 *
 * Only the server (admin SDK) touches this collection; the rules deny it to
 * clients by default. Each piece carries the businessId it belongs to and a
 * version, so a reader never mixes pieces from two different saves.
 */
export const PDF_CHUNK_COLLECTION = "document_pdf_chunks";
const CHUNK_LENGTH = MAX_INLINE_BASE64_LENGTH;
/** ~30 MB PDF. */
export const MAX_STORED_PDF_BASE64_LENGTH = 40_000_000;

const chunkId = (documentId: string, index: number) => `${documentId}__${index}`;

export function needsChunkedPdf(base64: string | undefined): boolean {
  return !!base64 && base64.length > MAX_INLINE_BASE64_LENGTH;
}

export async function writePdfChunks(db: Firestore, documentId: string, businessId: string, base64: string): Promise<void> {
  const count = Math.max(1, Math.ceil(base64.length / CHUNK_LENGTH));
  const version = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const updatedAt = new Date().toISOString();
  // Highest piece first, piece 0 last: piece 0 is what readers look at, so
  // they never see the new version until every piece of it is written.
  for (let index = count - 1; index >= 0; index--) {
    await db.collection(PDF_CHUNK_COLLECTION).doc(chunkId(documentId, index)).set({
      documentId,
      businessId,
      index,
      count,
      version,
      data: base64.slice(index * CHUNK_LENGTH, (index + 1) * CHUNK_LENGTH),
      updatedAt
    });
  }
}

/** The stored PDF, or "" when there is none (or it belongs to another business). */
export async function readPdfChunks(db: Firestore, documentId: string, businessId: string): Promise<string> {
  const first = await db.collection(PDF_CHUNK_COLLECTION).doc(chunkId(documentId, 0)).get();
  const head = first.data();
  if (!head || head.businessId !== businessId) return "";
  const count = Number(head.count) || 1;
  const parts: string[] = [String(head.data || "")];
  for (let index = 1; index < count; index++) {
    const snap = await db.collection(PDF_CHUNK_COLLECTION).doc(chunkId(documentId, index)).get();
    const piece = snap.data();
    if (!piece || piece.version !== head.version || piece.businessId !== businessId) {
      throw new Error(`PDF piece ${index} of ${documentId} is missing or from another save.`);
    }
    parts.push(String(piece.data || ""));
  }
  return parts.join("");
}

/** A documents/{id} record's PDF, whether inline or stored in pieces. */
export async function documentPdfBase64(db: Firestore, documentId: string, data: Record<string, any> | undefined): Promise<string> {
  if (!data) return "";
  // The flag wins: a record that moved from inline to pieces may still
  // carry an older inline copy.
  if (data.pdfChunked) return data.businessId ? readPdfChunks(db, documentId, String(data.businessId)) : "";
  return data.pdfBase64 ? String(data.pdfBase64) : "";
}

/**
 * Fields to write on a documents/{id} record for this PDF: inline when it
 * fits, otherwise stored in pieces first and only flagged on the record.
 */
export async function pdfFieldsForRecord(db: Firestore, documentId: string, businessId: string, base64: string): Promise<Record<string, unknown>> {
  if (!needsChunkedPdf(base64)) return { pdfBase64: base64, pdfChunked: false };
  await writePdfChunks(db, documentId, businessId, base64);
  return { pdfBase64: FieldValue.delete(), pdfChunked: true };
}

const validDocumentId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(id);

/** The record (if it exists yet) and stored pieces must both belong to the caller's business. */
async function ownedByCaller(db: Firestore, documentId: string, businessId: string): Promise<boolean> {
  const [record, head] = await Promise.all([
    db.collection("documents").doc(documentId).get(),
    db.collection(PDF_CHUNK_COLLECTION).doc(chunkId(documentId, 0)).get()
  ]);
  if (record.exists && record.data()?.businessId !== businessId) return false;
  if (head.exists && head.data()?.businessId !== businessId) return false;
  return true;
}

/** PUT /api/documents/:documentId/pdf  { pdfBase64 } */
export async function handlePutDocumentPdf(req: Request, res: Response) {
  const db = getAuthzDb();
  const caller = req.caller;
  const documentId = req.params.documentId;
  const pdfBase64 = typeof req.body?.pdfBase64 === "string" ? req.body.pdfBase64 : "";
  if (!db || !caller) { res.status(503).json({ error: "Document storage isn't configured on the server yet." }); return; }
  if (!validDocumentId(documentId)) { res.status(400).json({ error: "Invalid document id." }); return; }
  if (!pdfBase64 || !/^[A-Za-z0-9+/=]+$/.test(pdfBase64.slice(0, 1000))) { res.status(400).json({ error: "Missing PDF." }); return; }
  if (pdfBase64.length > MAX_STORED_PDF_BASE64_LENGTH) { res.status(413).json({ error: "This PDF is over 30 MB. Split it or reduce embedded photos." }); return; }
  try {
    if (!(await ownedByCaller(db, documentId, caller.businessId))) { res.status(403).json({ error: "That document belongs to another business." }); return; }
    await writePdfChunks(db, documentId, caller.businessId, pdfBase64);
    res.json({ ok: true });
  } catch (err) {
    console.error("Storing document PDF failed:", err);
    res.status(500).json({ error: "Couldn't save the PDF. Please try again." });
  }
}

/** GET /api/documents/:documentId/pdf */
export async function handleGetDocumentPdf(req: Request, res: Response) {
  const db = getAuthzDb();
  const caller = req.caller;
  const documentId = req.params.documentId;
  if (!db || !caller) { res.status(503).json({ error: "Document storage isn't configured on the server yet." }); return; }
  if (!validDocumentId(documentId)) { res.status(400).json({ error: "Invalid document id." }); return; }
  try {
    const pdfBase64 = await readPdfChunks(db, documentId, caller.businessId);
    if (!pdfBase64) { res.status(404).json({ error: "No saved PDF for this document." }); return; }
    res.json({ ok: true, pdfBase64 });
  } catch (err) {
    console.error("Reading document PDF failed:", err);
    res.status(500).json({ error: "Couldn't load the PDF. Please try again." });
  }
}
