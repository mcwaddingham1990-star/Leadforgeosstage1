export interface GeneratedPdfDraft {
  filename: string;
  title: string;
  lines: string[];
  customerName: string;
  representativeName: string;
  sourceType: "Estimate" | "Invoice" | "Job" | "Customer";
  sourceId: string;
}
