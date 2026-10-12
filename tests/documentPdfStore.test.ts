import { describe, expect, it } from "vitest";
import { documentPdfBase64, pdfFieldsForRecord, readPdfChunks, writePdfChunks } from "../server/documentPdfStore";

// Just enough of the admin Firestore API for the chunk store.
function fakeDb() {
  const rows = new Map<string, any>();
  const db: any = {
    rows,
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: rows.has(`${name}/${id}`), data: () => rows.get(`${name}/${id}`) }),
        set: async (value: any) => { rows.set(`${name}/${id}`, value); }
      })
    })
  };
  return db;
}

describe("document PDF chunk store", () => {
  const big = "QUJD".repeat(600_000); // 2.4M chars of base64 -> 3 pieces

  it("round-trips a PDF too big for one record", async () => {
    const db = fakeDb();
    await writePdfChunks(db, "doc1", "biz@a.com", big);
    expect([...db.rows.keys()].filter((k: string) => k.startsWith("document_pdf_chunks/")).length).toBe(3);
    expect(await readPdfChunks(db, "doc1", "biz@a.com")).toBe(big);
  });

  it("never returns another business's PDF", async () => {
    const db = fakeDb();
    await writePdfChunks(db, "doc1", "biz@a.com", big);
    expect(await readPdfChunks(db, "doc1", "other@b.com")).toBe("");
  });

  it("keeps small PDFs inline and flags big ones on the record", async () => {
    const db = fakeDb();
    expect(await pdfFieldsForRecord(db, "small", "biz@a.com", "QUJD")).toEqual({ pdfBase64: "QUJD", pdfChunked: false });
    const fields = await pdfFieldsForRecord(db, "doc2", "biz@a.com", big);
    expect(fields.pdfChunked).toBe(true);
    expect(await documentPdfBase64(db, "doc2", { businessId: "biz@a.com", pdfChunked: true, pdfBase64: "stale" })).toBe(big);
    expect(await documentPdfBase64(db, "small", { businessId: "biz@a.com", pdfBase64: "QUJD" })).toBe("QUJD");
  });
});
