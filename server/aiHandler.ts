import { GoogleGenAI } from "@google/genai";

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
