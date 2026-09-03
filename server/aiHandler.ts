import { GoogleGenAI, Type } from "@google/genai";

export interface AiAskRequest {
  pageId: string;
  pageName: string;
  customContext?: string;
  businessSummary?: string;
  isOwnerOrAdmin: boolean;
  conversation?: Array<{ role: "user" | "model"; text: string }>;
  query?: string;
  /** Real owner-set preferences (tone, creativity, free-text style notes) from the AI Assistant's Config tab -- this is how the assistant "learns" the owner's voice/bidding style, applied to every request. */
  styleGuidance?: string;
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

const DEFAULT_GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash"];

function isUnavailableModelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /404|not found|not supported|unavailable/i.test(message);
}

async function generateContentWithFallback(ai: GoogleGenAI, request: any): Promise<any> {
  const configuredModel = process.env.GEMINI_MODEL?.trim();
  const models = [...new Set([configuredModel, ...DEFAULT_GEMINI_MODELS].filter(Boolean))] as string[];
  let lastError: unknown;

  for (const model of models) {
    try {
      return await ai.models.generateContent({ ...request, model });
    } catch (error) {
      lastError = error;
      if (!isUnavailableModelError(error)) throw error;
      console.warn(`Gemini model ${model} is unavailable; trying the next supported model.`);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("No configured Gemini model is available for this API key.");
}

function buildSystemInstruction(req: AiAskRequest): string {
  const redaction = req.isOwnerOrAdmin
    ? "The requester is an Owner/Admin — you may reference real dollar amounts and financial figures from the business summary below."
    : "The requester is NOT an Owner/Admin — do not reveal specific dollar amounts, revenue, balances, or other financial figures. Refer to them only in general, non-numeric terms.";

  return [
    "You are the OwnersLOCAL AI assistant, embedded in a business-operations app for local service businesses (plumbing, HVAC, electrical, etc.).",
    `The user is currently viewing the "${req.pageName}" (${req.pageId}) screen.`,
    redaction,
    req.businessSummary ? `Current business data summary for this screen:\n${req.businessSummary}` : "",
    req.customContext ? `Additional context: ${req.customContext}` : "",
    req.styleGuidance ? `Owner-set style preferences -- follow these: ${req.styleGuidance}` : "",
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

  const response = await generateContentWithFallback(ai, {
    contents: contents.length > 0 ? contents : [{ role: "user", parts: [{ text: "Give me an overview of this screen." }] }],
    config: { systemInstruction }
  });

  const text = response.text?.trim();
  if (!text) throw new Error("Gemini returned an empty response. Please retry the request.");
  return { text };
}

export interface ScanReceiptRequest {
  /** Base64-encoded image data, no data: URI prefix. */
  imageBase64: string;
  mimeType: string;
}

export interface ScannedLineItem {
  name: string | null;
  sku: string | null;
  barcode: string | null;
  quantity: number | null;
  unit: string | null;
  unitCost: number | null;
  category: string | null;
  manufacturer: string | null;
}

export interface ScanReceiptResponse {
  vendor: string | null;
  purchaseDate: string | null;
  /** One entry per distinct line item on the receipt/packing slip (or a
   *  single entry for a plain product label/barcode). */
  items: ScannedLineItem[];
  /** The receipt's own printed total (including tax), read directly rather
   *  than inferred from quantity × unitCost -- many receipts never print a
   *  clean per-unit price, so this is the number the logged expense should
   *  actually be based on. */
  total: number | null;
  /** True if the model could not confidently read a real inventory receipt/label from the image. */
  unreadable: boolean;
}

const LINE_ITEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, nullable: true },
    sku: { type: Type.STRING, nullable: true },
    barcode: { type: Type.STRING, nullable: true },
    quantity: { type: Type.NUMBER, nullable: true },
    unit: { type: Type.STRING, nullable: true },
    unitCost: { type: Type.NUMBER, nullable: true },
    category: { type: Type.STRING, nullable: true },
    manufacturer: { type: Type.STRING, nullable: true }
  }
};

const RECEIPT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    vendor: { type: Type.STRING, nullable: true },
    purchaseDate: { type: Type.STRING, nullable: true },
    items: { type: Type.ARRAY, items: LINE_ITEM_SCHEMA },
    total: { type: Type.NUMBER, nullable: true },
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
 *
 * Also handles a photo of the physical stock itself (a pile of lumber, a
 * stack of cardboard boxes, a shelf of supplies) with no text/label visible
 * at all -- there `items` holds a visual best-effort count per distinct item
 * type instead of an OCR read, and sku/barcode/unitCost/manufacturer stay
 * null since nothing legible backs them.
 */
export async function handleScanReceipt(req: ScanReceiptRequest): Promise<ScanReceiptResponse> {
  const ai = getClient();

  const response = await generateContentWithFallback(ai, {
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: req.imageBase64, mimeType: req.mimeType } },
          {
            text: [
              "This image is either (a) a photo of an inventory receipt, packing slip, or product label/barcode for a local service business (plumbing/HVAC/electrical supplies), or (b) a direct photo of physical stock/materials themselves -- e.g. a pile of lumber, a stack of cardboard boxes, a shelf of supplies -- with no text or label legible at all.",
              "Case (a): extract EACH distinct line item as its own entry in `items` (name, sku, barcode, quantity, unit, unitCost, category, manufacturer). If it's a single product label/barcode, return exactly one entry. Extract only what you can actually read -- do not guess or fabricate sku/barcode/cost values. Also read the receipt's printed total (including tax) into `total` (the number actually printed, not computed by summing items), and the vendor/store name and purchase date if visible.",
              "Case (b): there is no receipt/label to read, so instead visually identify each distinct type of item shown and give your best-effort count as its own entry in `items` (e.g. five cardboard boxes -> one entry, name \"Cardboard boxes\", quantity 5, unit \"boxes\"). Count discrete items when you can; for a non-discrete pile or stack, still give your best visual estimate of quantity with a fitting unit (e.g. \"pieces\", \"bundle\", \"boards\") rather than leaving quantity null -- only leave quantity null if a reasonable estimate truly isn't possible. Leave sku, barcode, unitCost, and manufacturer null (nothing legible backs them), and leave `vendor`, `purchaseDate`, and `total` null.",
              "If a field isn't visible, legible, or (for case b) visually determinable, set it to null. Set unreadable=true only if the image contains neither a legible receipt/label nor any identifiable physical stock at all."
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
    return { vendor: null, purchaseDate: null, items: [], total: null, unreadable: true };
  }

  const items = Array.isArray(parsed.items)
    ? parsed.items.map((item: Partial<ScannedLineItem>) => ({
        name: item?.name ?? null,
        sku: item?.sku ?? null,
        barcode: item?.barcode ?? null,
        quantity: item?.quantity ?? null,
        unit: item?.unit ?? null,
        unitCost: item?.unitCost ?? null,
        category: item?.category ?? null,
        manufacturer: item?.manufacturer ?? null
      }))
    : [];

  return {
    vendor: parsed.vendor ?? null,
    purchaseDate: parsed.purchaseDate ?? null,
    items,
    total: parsed.total ?? null,
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

export interface ScanBusinessRecordRequest {
  imageBase64: string;
  mimeType: string;
  preferredRecordType?: string;
}

export interface ScanBusinessRecordResponse {
  recordType: "bill" | "customer" | "lead" | "estimate" | "inventory" | "address" | "onboarding" | "material_expense" | "payroll" | "financial" | "unknown";
  confidence: number;
  fields: Record<string, string | number | boolean | null>;
  /** Populated only when recordType is material_expense or inventory and the
   *  photo is a receipt/packing slip with multiple distinct line items --
   *  one entry per item, so the client can offer a per-item review instead
   *  of collapsing everything into a single flat record. */
  items?: ScannedLineItem[];
  unreadable: boolean;
}

const BUSINESS_RECORD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    recordType: { type: Type.STRING, enum: ["bill", "customer", "lead", "estimate", "inventory", "address", "onboarding", "material_expense", "payroll", "financial", "unknown"] },
    confidence: { type: Type.NUMBER },
    fields: {
      type: Type.OBJECT,
      properties: {
        payee: { type: Type.STRING, nullable: true },
        serviceProvided: { type: Type.STRING, nullable: true },
        estimatedCost: { type: Type.NUMBER, nullable: true },
        totalCost: { type: Type.NUMBER, nullable: true },
        recurring: { type: Type.BOOLEAN, nullable: true },
        recurringDate: { type: Type.STRING, nullable: true },
        name: { type: Type.STRING, nullable: true },
        company: { type: Type.STRING, nullable: true },
        contact: { type: Type.STRING, nullable: true },
        phone: { type: Type.STRING, nullable: true },
        email: { type: Type.STRING, nullable: true },
        address: { type: Type.STRING, nullable: true },
        city: { type: Type.STRING, nullable: true },
        state: { type: Type.STRING, nullable: true },
        zip: { type: Type.STRING, nullable: true },
        description: { type: Type.STRING, nullable: true },
        amount: { type: Type.NUMBER, nullable: true },
        quantity: { type: Type.NUMBER, nullable: true },
        unitCost: { type: Type.NUMBER, nullable: true },
        category: { type: Type.STRING, nullable: true },
        dueDate: { type: Type.STRING, nullable: true },
        notes: { type: Type.STRING, nullable: true }
      }
    },
    items: { type: Type.ARRAY, items: LINE_ITEM_SCHEMA },
    unreadable: { type: Type.BOOLEAN }
  },
  required: ["recordType", "confidence", "fields", "unreadable"]
};

/** Universal paper-form intake. Nothing returned here is persisted directly;
 * the client always displays an editable review step first. */
export async function handleScanBusinessRecord(req: ScanBusinessRecordRequest): Promise<ScanBusinessRecordResponse> {
  const ai = getClient();
  const preferred = req.preferredRecordType?.trim();
  const response = await generateContentWithFallback(ai, {
    contents: [{ role: "user", parts: [
      { inlineData: { data: req.imageBase64, mimeType: req.mimeType } },
      { text: [
        "Classify this image. It is either a completed paper form, bill, invoice, receipt, customer sheet, lead sheet, estimate, inventory record, address form, onboarding sheet, material or operational expense, payroll record, other business financial record -- OR a direct photo of physical stock/materials themselves (e.g. a pile of lumber, a stack of cardboard boxes, a shelf of supplies) with no text or form visible at all.",
        "Use bill only for a service/provider obligation. Use material_expense for materials, equipment, fuel, tools, supplies, inventory purchases, and similar operational costs. Use payroll for wages, salaries, pay stubs, or payroll reports. Use financial only when none of those specific financial destinations applies. Use inventory both for a completed inventory record/form AND for a bare photo of physical stock with no text at all.",
        preferred ? `The user opened the scanner for ${preferred}; prefer that type only when the document supports it.` : "",
        "Extract only legible values. Never invent missing data. Use YYYY-MM-DD for dates. Put extracted values in the matching fields object and null for anything not visible.",
        "If recordType is material_expense or inventory and this is a receipt or packing slip with multiple distinct purchased items, also extract each one as its own entry in `items` (name, sku, barcode, quantity, unit, unitCost, category, manufacturer) and put the receipt's own printed total (including tax) into fields.totalCost -- read the total directly, don't compute it by summing items.",
        "If recordType is inventory and this is instead a bare photo of the physical stock/materials themselves (no receipt or label), visually identify each distinct type of item shown and give your best-effort count as its own entry in `items` (e.g. five cardboard boxes -> one entry, name \"Cardboard boxes\", quantity 5, unit \"boxes\"). Count discrete items when you can; for a non-discrete pile or stack, still give your best visual estimate of quantity with a fitting unit (e.g. \"pieces\", \"bundle\", \"boards\") rather than leaving quantity null. Leave sku, barcode, unitCost, and manufacturer null in that case, and leave fields.totalCost null too.",
        "Leave `items` empty only when this is neither a multi-item receipt/packing slip nor a bare photo of physical stock.",
        "Set unreadable=true only if the image contains neither a legible document/form nor any identifiable physical stock at all.",
        "This output will be shown to a human for correction before it can be saved."
      ].filter(Boolean).join(" ") }
    ] }],
    config: { responseMimeType: "application/json", responseSchema: BUSINESS_RECORD_SCHEMA }
  });
  try {
    const parsed = JSON.parse(response.text ?? "{}");
    const items = Array.isArray(parsed.items)
      ? parsed.items.map((item: Partial<ScannedLineItem>) => ({
          name: item?.name ?? null,
          sku: item?.sku ?? null,
          barcode: item?.barcode ?? null,
          quantity: item?.quantity ?? null,
          unit: item?.unit ?? null,
          unitCost: item?.unitCost ?? null,
          category: item?.category ?? null,
          manufacturer: item?.manufacturer ?? null
        }))
      : undefined;
    return {
      recordType: parsed.recordType ?? "unknown",
      confidence: Number(parsed.confidence) || 0,
      fields: parsed.fields && typeof parsed.fields === "object" ? parsed.fields : {},
      ...(items?.length ? { items } : {}),
      unreadable: parsed.unreadable ?? false
    };
  } catch {
    return { recordType: "unknown", confidence: 0, fields: {}, unreadable: true };
  }
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

  const response = await generateContentWithFallback(ai, {
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
