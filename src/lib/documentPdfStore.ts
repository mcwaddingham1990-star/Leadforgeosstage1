import { authedFetch } from "./apiClient";
import { MAX_INLINE_BASE64_LENGTH } from "./firestoreDocumentLimits";

/**
 * Client side of server/documentPdfStore.ts. A document's PDF lives inline
 * on its record (`pdfBase64`) when it fits; bigger ones are uploaded to the
 * server in pieces and the record only carries `pdfChunked: true`.
 */

// PDFs this session already has, so reopening one doesn't re-download it.
const cache = new Map<string, string>();

export function pdfTooLargeForRecord(base64: string | undefined): boolean {
  return !!base64 && base64.length > MAX_INLINE_BASE64_LENGTH;
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => null) as { error?: string } | null;
  return new Error(body?.error || `${fallback} (${res.status})`);
}

/** Uploads a large PDF for a document. Throws if it wasn't saved. */
export async function uploadDocumentPdf(documentId: string, pdfBase64: string): Promise<void> {
  const res = await authedFetch(`/api/documents/${encodeURIComponent(documentId)}/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdfBase64 })
  });
  if (!res.ok) throw await errorFrom(res, "Couldn't save the PDF");
  cache.set(documentId, pdfBase64);
}

/**
 * Record fields for this PDF: inline when it fits, otherwise uploaded first
 * (throws if the upload fails, so nothing claims a PDF that isn't saved).
 */
export async function storeDocumentPdf(documentId: string, pdfBase64: string): Promise<{ pdfBase64: string; pdfChunked: boolean }> {
  if (!pdfTooLargeForRecord(pdfBase64)) {
    cache.set(documentId, pdfBase64);
    return { pdfBase64, pdfChunked: false };
  }
  await uploadDocumentPdf(documentId, pdfBase64);
  return { pdfBase64: "", pdfChunked: true };
}

/** A document's saved PDF, wherever it's stored; "" when it has none. */
export async function loadDocumentPdf(doc: { id: string; pdfBase64?: unknown; pdfChunked?: unknown } | null | undefined): Promise<string> {
  if (!doc) return "";
  if (!doc.pdfChunked) return typeof doc.pdfBase64 === "string" ? doc.pdfBase64 : "";
  const cached = cache.get(doc.id);
  if (cached) return cached;
  const res = await authedFetch(`/api/documents/${encodeURIComponent(doc.id)}/pdf`);
  if (!res.ok) throw await errorFrom(res, "Couldn't load the PDF");
  const body = await res.json() as { pdfBase64?: string };
  const pdfBase64 = body.pdfBase64 || "";
  if (pdfBase64) cache.set(doc.id, pdfBase64);
  return pdfBase64;
}

export function hasSavedPdf(doc: { pdfBase64?: unknown; pdfChunked?: unknown } | null | undefined): boolean {
  return !!doc && (!!doc.pdfBase64 || !!doc.pdfChunked);
}
