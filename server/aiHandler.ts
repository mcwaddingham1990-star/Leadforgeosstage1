import { GoogleGenAI, Type } from "@google/genai";

export interface AiAskRequest {
  pageId: string;
  pageName: string;
  customContext?: string;
  businessSummary?: string;
  isOwnerOrAdmin: boolean;
  conversation?: Array<{ role: "user" | "model"; text: string }>;
  query?: string;
}

export interface AiAskResponse {
  text: string;
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

function buildSystemInstruction(req: AiAskRequest): string {
  const redaction = req.isOwnerOrAdmin
    ? "The requester is an Owner/Admin — you may reference real dollar amounts and financial figures from the business summary below."
    : "The requester is NOT an Owner/Admin — do not reveal specific dollar amounts, revenue, balances, or other financial figures. Refer to them only in general, non-numeric terms.";

  return [
    "You are the Owner'sLocal AI assistant, embedded in a business-operations app for local service businesses (plumbing, HVAC, electrical, etc.).",
    `The user is currently viewing the "${req.pageName}" (${req.pageId}) screen.`,
    redaction,
    req.businessSummary ? `Current business data summary for this screen:\n${req.businessSummary}` : "",
    req.customContext ? `Additional context: ${req.customContext}` : "",
    "Be concise, concrete, and reference the actual data provided rather than generic advice. Use markdown formatting (bold, bullet lists) sparingly for readability."
  ].filter(Boolean).join("\n\n");
}

export async function handleAiAsk(req: AiAskRequest): Promise<AiAskResponse> {
  const ai = getClient();
  const systemInstruction = buildSystemInstruction(req);

  const contents = [
    ...(req.conversation ?? []).map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }]
    })),
    ...(req.query ? [{ role: "user" as const, parts: [{ text: req.query }] }] : [])
  ];

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: contents.length > 0 ? contents : [{ role: "user", parts: [{ text: "Give me an overview of this screen." }] }],
    config: { systemInstruction }
  });

  return { text: response.text ?? "" };
}

export interface ScanReceiptRequest {
  /** Base64-encoded image data, no data: URI prefix. */
  imageBase64: string;
  mimeType: string;
}

export interface ScanReceiptResponse {
  name: string | null;
  vendor: string | null;
  sku: string | null;
  barcode: string | null;
  quantity: number | null;
  unit: string | null;
  unitCost: number | null;
  category: string | null;
  manufacturer: string | null;
  purchaseDate: string | null;
  /** True if the model could not confidently read a real inventory receipt/label from the image. */
  unreadable: boolean;
}

const RECEIPT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, nullable: true },
    vendor: { type: Type.STRING, nullable: true },
    sku: { type: Type.STRING, nullable: true },
    barcode: { type: Type.STRING, nullable: true },
    quantity: { type: Type.NUMBER, nullable: true },
    unit: { type: Type.STRING, nullable: true },
    unitCost: { type: Type.NUMBER, nullable: true },
    category: { type: Type.STRING, nullable: true },
    manufacturer: { type: Type.STRING, nullable: true },
    purchaseDate: { type: Type.STRING, nullable: true },
    unreadable: { type: Type.BOOLEAN }
  },
  required: ["unreadable"]
};

/**
 * Real OCR via Gemini's multimodal vision — replaces the old fake camera
 * scanner that ignored the captured photo entirely and returned one of two
 * hardcoded fixtures. Every field is nullable: the model is instructed to
 * leave a field null rather than guess/fabricate a value it can't actually
 * read from the image.
 */
export async function handleScanReceipt(req: ScanReceiptRequest): Promise<ScanReceiptResponse> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: req.imageBase64, mimeType: req.mimeType } },
          {
            text: [
              "This image is a photo of an inventory receipt, packing slip, or product label/barcode for a local service business (plumbing/HVAC/electrical supplies).",
              "Extract only what you can actually read in the image. Do not guess or fabricate values.",
              "If a field isn't visible or legible, set it to null. Set unreadable=true only if the image doesn't contain a legible receipt/label at all."
            ].join(" ")
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: RECEIPT_SCHEMA
    }
  });

  const raw = response.text ?? "{}";
  let parsed: Partial<ScanReceiptResponse>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { name: null, vendor: null, sku: null, barcode: null, quantity: null, unit: null, unitCost: null, category: null, manufacturer: null, purchaseDate: null, unreadable: true };
  }

  return {
    name: parsed.name ?? null,
    vendor: parsed.vendor ?? null,
    sku: parsed.sku ?? null,
    barcode: parsed.barcode ?? null,
    quantity: parsed.quantity ?? null,
    unit: parsed.unit ?? null,
    unitCost: parsed.unitCost ?? null,
    category: parsed.category ?? null,
    manufacturer: parsed.manufacturer ?? null,
    purchaseDate: parsed.purchaseDate ?? null,
    unreadable: parsed.unreadable ?? false
  };
}

export interface ScanFinancialDocumentRequest {
  /** Base64-encoded image data, no data: URI prefix. */
  imageBase64: string;
  mimeType: string;
}

export interface ScanFinancialDocumentResponse {
  documentType: "receipt" | "check" | "invoice" | "unknown";
  /** The vendor being paid (receipt/invoice) or the payer/payee named on a check. */
  counterpartyName: string | null;
  amount: number | null;
  date: string | null;
  /** True if the model could not confidently read a real financial document from the image. */
  unreadable: boolean;
}

const FINANCIAL_DOCUMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    documentType: { type: Type.STRING, enum: ["receipt", "check", "invoice", "unknown"] },
    counterpartyName: { type: Type.STRING, nullable: true },
    amount: { type: Type.NUMBER, nullable: true },
    date: { type: Type.STRING, nullable: true },
    unreadable: { type: Type.BOOLEAN }
  },
  required: ["documentType", "unreadable"]
};

/**
 * Real OCR via Gemini's multimodal vision for expense receipts and checks
 * (income). Shares the same "never fabricate, leave null instead" contract
 * as handleScanReceipt — this is a manual-entry ALTERNATIVE, not a
 * replacement: every field it returns is meant to prefill an editable form
 * the user confirms before anything is saved, and typing the same form in
 * by hand with no photo at all is an equally first-class path.
 */
export async function handleScanFinancialDocument(req: ScanFinancialDocumentRequest): Promise<ScanFinancialDocumentResponse> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: req.imageBase64, mimeType: req.mimeType } },
          {
            text: [
              "This image is a photo of a business financial document for a local service business: either an expense receipt/invoice (money paid out to a vendor) or a check (money received/income).",
              "Identify which it is, then extract only what you can actually read in the image. Do not guess or fabricate values.",
              "For a receipt/invoice: counterpartyName is the vendor/business being paid, amount is the total.",
              "For a check: counterpartyName is the payer (whoever wrote/signed the check, or the account holder name printed on it), amount is the dollar amount.",
              "If a field isn't visible or legible, set it to null. Set unreadable=true only if the image doesn't contain a legible financial document at all."
            ].join(" ")
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: FINANCIAL_DOCUMENT_SCHEMA
    }
  });

  const raw = response.text ?? "{}";
  let parsed: Partial<ScanFinancialDocumentResponse>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { documentType: "unknown", counterpartyName: null, amount: null, date: null, unreadable: true };
  }

  return {
    documentType: parsed.documentType ?? "unknown",
    counterpartyName: parsed.counterpartyName ?? null,
    amount: parsed.amount ?? null,
    date: parsed.date ?? null,
    unreadable: parsed.unreadable ?? false
  };
}
