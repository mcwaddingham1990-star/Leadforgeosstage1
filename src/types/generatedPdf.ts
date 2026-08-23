export interface GeneratedPdfDraft {
  filename: string;
  title: string;
  lines: string[];
  customerName: string;
  representativeName: string;
  sourceType: "Estimate" | "Invoice" | "Job" | "Customer";
  sourceId: string;
  /** Real, already-built PDF bytes (base64) -- e.g. from src/lib/pdfExport.ts.
   * When present, the PDF Editor opens with this real document loaded
   * (via initialPdfBase64) instead of a plain-text draft, and no signature
   * fields are pre-seeded -- generating the PDF never requires signing. */
  pdfBase64?: string;
}
