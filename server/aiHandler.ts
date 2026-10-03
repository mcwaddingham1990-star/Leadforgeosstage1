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

// ---------------------------------------------------------------------------
// No Tap Info Entry: spoken job updates and job photos -> structured fields
// that the client shows on a Review & Save screen before anything is written.
// ---------------------------------------------------------------------------

export interface JobEntryContext {
  jobTitle?: string;
  customer?: string;
  jobDescription?: string;
  jobStatus?: string;
  assignedEmployee?: string;
  /** Speaker's local date and weekday, e.g. "2026-10-03 (Saturday)", so "Tuesday" resolves to a real date. */
  today: string;
  /** Inventory the business tracks, so spoken materials can be matched to real items. */
  inventory?: Array<{ id: string; name: string; unit?: string }>;
}

export interface JobVoiceEntryRequest {
  context: JobEntryContext;
  /** Live speech-recognition text, when the browser provided it. */
  transcript?: string;
  /** Otherwise the recording itself (base64, no data: prefix). */
  audioBase64?: string;
  mimeType?: string;
}

export interface JobVoiceEntryResponse {
  transcript: string;
  workPerformed: string | null;
  jobNotes: string | null;
  progressSummary: string | null;
  materials: Array<{ name: string; quantity: number | null; unit: string | null; inventoryId: string | null }>;
  followUps: Array<{ description: string; date: string | null; time: string | null; kind: "appointment" | "task" }>;
  customerRequests: string[];
  changeOrders: Array<{ description: string; amount: number | null; customerApproved: boolean }>;
  partsToOrder: Array<{ name: string; quantity: number | null }>;
  issues: Array<{ description: string; kind: "callback" | "warranty" | "complaint" | "damage" | "safety" | "other" }>;
  jobFinished: boolean;
}

const VOICE_ENTRY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transcript: { type: Type.STRING },
    workPerformed: { type: Type.STRING, nullable: true },
    jobNotes: { type: Type.STRING, nullable: true },
    progressSummary: { type: Type.STRING, nullable: true },
    materials: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      name: { type: Type.STRING }, quantity: { type: Type.NUMBER, nullable: true }, unit: { type: Type.STRING, nullable: true }, inventoryId: { type: Type.STRING, nullable: true }
    }, required: ["name"] } },
    followUps: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      description: { type: Type.STRING }, date: { type: Type.STRING, nullable: true }, time: { type: Type.STRING, nullable: true }, kind: { type: Type.STRING, enum: ["appointment", "task"] }
    }, required: ["description", "kind"] } },
    customerRequests: { type: Type.ARRAY, items: { type: Type.STRING } },
    changeOrders: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      description: { type: Type.STRING }, amount: { type: Type.NUMBER, nullable: true }, customerApproved: { type: Type.BOOLEAN }
    }, required: ["description", "customerApproved"] } },
    partsToOrder: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      name: { type: Type.STRING }, quantity: { type: Type.NUMBER, nullable: true }
    }, required: ["name"] } },
    issues: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      description: { type: Type.STRING }, kind: { type: Type.STRING, enum: ["callback", "warranty", "complaint", "damage", "safety", "other"] }
    }, required: ["description", "kind"] } },
    jobFinished: { type: Type.BOOLEAN }
  },
  required: ["transcript", "materials", "followUps", "customerRequests", "changeOrders", "partsToOrder", "issues", "jobFinished"]
};

const describeJob = (c: JobEntryContext) => [
  `Today is ${c.today}.`,
  `Job: ${c.jobTitle || "Service job"} for ${c.customer || "the customer"}.`,
  c.jobDescription ? `Job description: ${c.jobDescription.slice(0, 600)}` : "",
  c.jobStatus ? `Current job status: ${c.jobStatus}.` : "",
  c.assignedEmployee ? `Assigned technician: ${c.assignedEmployee}.` : "",
].filter(Boolean).join(" ");

/**
 * Turns a technician's spoken update ("finished the upstairs bathroom, used
 * six feet of PEX, she approved another $180, come back Tuesday...") into
 * the fields Owner'sLOCAL already has. Nothing here is saved: the client
 * shows every extracted item for review first.
 */
export async function handleJobVoiceEntry(req: JobVoiceEntryRequest): Promise<JobVoiceEntryResponse> {
  const ai = getClient();
  const transcript = (req.transcript || "").trim();
  if (!transcript && !req.audioBase64) throw new Error("Nothing was recorded.");
  const inventory = (req.context.inventory || []).slice(0, 400).map(i => `${i.id} | ${i.name}${i.unit ? ` (${i.unit})` : ""}`).join("\n");
  const instructions = [
    "You turn a field technician's spoken job update into structured data for a home-service business app.",
    describeJob(req.context),
    req.audioBase64 ? "First transcribe the attached recording word for word into `transcript`." : "The technician's words are in the transcript below; copy them into `transcript` unchanged.",
    "Then extract only what was actually said. Never invent quantities, prices, dates or items.",
    "workPerformed: the work completed, as a short clear sentence or two (null if none). jobNotes: other useful job details that are not work performed (null if none). progressSummary: one short line suitable for a job activity log.",
    "materials: each material or part used, with quantity and unit as spoken (\"six feet of PEX\" -> quantity 6, unit \"ft\"). If it clearly matches an inventory item below, set inventoryId to that item's id, otherwise null.",
    "followUps: return visits or tasks. Resolve relative days (\"Tuesday\", \"tomorrow\", \"next week\") to a YYYY-MM-DD date using today's date; the next occurrence of a weekday is after today. time in 24h HH:MM only if a time was said. kind=appointment for visits with the customer, task for internal to-dos.",
    "customerRequests: anything the customer asked for, in plain words.",
    "changeOrders: added work beyond the original job, with the dollar amount if said; customerApproved=true only if the speaker said the customer approved/agreed/OK'd it.",
    "partsToOrder: parts that need to be ordered or picked up.",
    "issues: complaints, leaks, damage, callbacks, warranty or safety concerns.",
    "jobFinished: true only if the speaker said the whole job is finished/done/complete (not just one task).",
    inventory ? `Inventory items (id | name):\n${inventory}` : "The business has no inventory list; leave inventoryId null.",
  ].join("\n");

  const parts: any[] = [];
  if (req.audioBase64) parts.push({ inlineData: { data: req.audioBase64, mimeType: req.mimeType || "audio/webm" } });
  parts.push({ text: transcript ? `${instructions}\n\nTranscript:\n"""${transcript.slice(0, 6000)}"""` : instructions });

  const response = await generateContentWithFallback(ai, {
    contents: [{ role: "user", parts }],
    config: { responseMimeType: "application/json", responseSchema: VOICE_ENTRY_SCHEMA }
  });

  let parsed: Partial<JobVoiceEntryResponse> = {};
  try { parsed = JSON.parse(response.text ?? "{}"); } catch { /* fall through to empty result */ }
  const arr = <T,>(v: unknown): T[] => Array.isArray(v) ? v as T[] : [];
  const str = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
  const date = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const time = (v: unknown) => typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, "0") : null;
  return {
    transcript: str(parsed.transcript) || transcript,
    workPerformed: str(parsed.workPerformed),
    jobNotes: str(parsed.jobNotes),
    progressSummary: str(parsed.progressSummary),
    materials: arr<any>(parsed.materials).filter(m => str(m?.name)).map(m => ({ name: str(m.name)!, quantity: num(m.quantity), unit: str(m.unit), inventoryId: str(m.inventoryId) })),
    followUps: arr<any>(parsed.followUps).filter(f => str(f?.description)).map(f => ({ description: str(f.description)!, date: date(f.date), time: time(f.time), kind: f.kind === "task" ? "task" : "appointment" })),
    customerRequests: arr<unknown>(parsed.customerRequests).map(str).filter((s): s is string => !!s),
    changeOrders: arr<any>(parsed.changeOrders).filter(c => str(c?.description)).map(c => ({ description: str(c.description)!, amount: num(c.amount), customerApproved: c.customerApproved === true })),
    partsToOrder: arr<any>(parsed.partsToOrder).filter(p => str(p?.name)).map(p => ({ name: str(p.name)!, quantity: num(p.quantity) })),
    issues: arr<any>(parsed.issues).filter(i => str(i?.description)).map(i => ({ description: str(i.description)!, kind: ["callback", "warranty", "complaint", "damage", "safety"].includes(i.kind) ? i.kind : "other" })),
    jobFinished: parsed.jobFinished === true,
  };
}

export const JOB_PHOTO_CATEGORIES = ["before", "during", "after", "damage", "materials", "receipt", "serial", "completed", "other"] as const;
export type JobPhotoCategory = typeof JOB_PHOTO_CATEGORIES[number];

export interface JobPhotoEntryRequest {
  context: JobEntryContext;
  imageBase64: string;
  mimeType: string;
}

export interface JobPhotoEntryResponse {
  category: JobPhotoCategory;
  caption: string | null;
  brand: string | null;
  modelNumber: string | null;
  serialNumber: string | null;
  equipmentType: string | null;
  receiptVendor: string | null;
  receiptTotal: number | null;
  receiptDate: string | null;
  materials: Array<{ name: string; quantity: number | null; unit: string | null }>;
}

const PHOTO_ENTRY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    category: { type: Type.STRING, enum: [...JOB_PHOTO_CATEGORIES] },
    caption: { type: Type.STRING, nullable: true },
    brand: { type: Type.STRING, nullable: true },
    modelNumber: { type: Type.STRING, nullable: true },
    serialNumber: { type: Type.STRING, nullable: true },
    equipmentType: { type: Type.STRING, nullable: true },
    receiptVendor: { type: Type.STRING, nullable: true },
    receiptTotal: { type: Type.NUMBER, nullable: true },
    receiptDate: { type: Type.STRING, nullable: true },
    materials: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      name: { type: Type.STRING }, quantity: { type: Type.NUMBER, nullable: true }, unit: { type: Type.STRING, nullable: true }
    }, required: ["name"] } }
  },
  required: ["category", "materials"]
};

/** Classifies a job photo and reads any label, serial plate or receipt in it. */
export async function handleJobPhotoEntry(req: JobPhotoEntryRequest): Promise<JobPhotoEntryResponse> {
  const ai = getClient();
  const response = await generateContentWithFallback(ai, {
    contents: [{
      role: "user",
      parts: [
        { inlineData: { data: req.imageBase64, mimeType: req.mimeType } },
        { text: [
          "This photo was taken by a field technician on a home-service job (plumbing, HVAC, electrical, general contracting).",
          describeJob(req.context),
          "Classify it into exactly one category: before (site/problem before work started), during (work in progress, open walls, parts out), after (finished area), damage (a leak, break, burn, rot or other problem/damage close-up), materials (parts, supplies or equipment not yet installed), receipt (a store receipt, invoice or packing slip), serial (an equipment data plate, model/serial label or nameplate), completed (close-up of finished installed work), other.",
          "If the job status says work hasn't started, an overview of the site is most likely 'before'; if the job is completed, an overview is most likely 'after'.",
          "caption: one short plain sentence describing what the photo shows.",
          "Read any visible text exactly. brand, modelNumber, serialNumber, equipmentType from a data plate or label. receiptVendor, receiptTotal (the printed total including tax), receiptDate (YYYY-MM-DD) from a receipt. materials: distinct parts/supplies visible on a receipt or in the photo, with quantity if readable or countable.",
          "Never guess characters you can't read: set a field to null if it isn't clearly legible."
        ].join(" ") }
      ]
    }],
    config: { responseMimeType: "application/json", responseSchema: PHOTO_ENTRY_SCHEMA }
  });
  let parsed: any = {};
  try { parsed = JSON.parse(response.text ?? "{}"); } catch { /* empty */ }
  const str = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
  return {
    category: (JOB_PHOTO_CATEGORIES as readonly string[]).includes(parsed.category) ? parsed.category : "other",
    caption: str(parsed.caption),
    brand: str(parsed.brand),
    modelNumber: str(parsed.modelNumber),
    serialNumber: str(parsed.serialNumber),
    equipmentType: str(parsed.equipmentType),
    receiptVendor: str(parsed.receiptVendor),
    receiptTotal: typeof parsed.receiptTotal === "number" && Number.isFinite(parsed.receiptTotal) ? parsed.receiptTotal : null,
    receiptDate: typeof parsed.receiptDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.receiptDate) ? parsed.receiptDate : null,
    materials: Array.isArray(parsed.materials) ? parsed.materials.filter((m: any) => str(m?.name)).map((m: any) => ({ name: str(m.name)!, quantity: typeof m.quantity === "number" ? m.quantity : null, unit: str(m.unit) })) : [],
  };
}
