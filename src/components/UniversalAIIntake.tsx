import React, { useEffect, useRef, useState } from "react";
import { Camera, Check, FileUp, Loader2, PencilLine, Sparkles, X } from "lucide-react";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { useAuth } from "../context/AuthContext";
import { postBillCreatedEntry } from "../lib/accountingEngine";

type RecordType = "bill" | "customer" | "lead" | "estimate" | "inventory" | "address" | "onboarding" | "financial" | "unknown";
type Fields = Record<string, string | number | boolean | null>;
const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const today = () => new Date().toISOString().slice(0, 10);
const labels: Record<RecordType, string> = { bill: "Bill / Invoice", customer: "Customer", lead: "Lead", estimate: "Estimate", inventory: "Inventory", address: "Address", onboarding: "Onboarding", financial: "Financial Record", unknown: "Auto-detect" };

export function UniversalAIIntake() {
  const data = useDomainData();
  const { triggerNotification, logOperationalEvent } = useNavTelemetry();
  const { loggedInUser } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"choose" | "scanning" | "review">("choose");
  const [recordType, setRecordType] = useState<RecordType>("unknown");
  const [fields, setFields] = useState<Fields>({});
  const [confidence, setConfidence] = useState(0);

  useEffect(() => {
    const handler = (event: Event) => {
      const preferred = (event as CustomEvent<{ recordType?: RecordType }>).detail?.recordType || "unknown";
      setRecordType(preferred); setFields({}); setStage("choose"); setOpen(true);
    };
    window.addEventListener("ownerslocal:ai-intake", handler);
    return () => window.removeEventListener("ownerslocal:ai-intake", handler);
  }, []);

  const close = () => { setOpen(false); setStage("choose"); setFields({}); };
  const scan = async (file?: File) => {
    if (!file) return;
    setStage("scanning");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      const response = await fetch("/api/ai/scan-business-record", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64: dataUrl.split(",")[1], mimeType: file.type || "image/jpeg", preferredRecordType: recordType === "unknown" ? undefined : recordType }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to scan this record");
      if (result.unreadable) throw new Error("AI could not read a completed business record in that image.");
      setRecordType(result.recordType || recordType); setFields(Object.fromEntries(Object.entries(result.fields || {}).filter(([, value]) => value !== null && value !== ""))); setConfidence(Number(result.confidence) || 0); setStage("review");
    } catch (error) {
      triggerNotification(error instanceof Error ? error.message : "AI scan failed. Manual entry is still available."); setStage("choose");
    }
  };

  const save = () => {
    const createdAt = new Date().toISOString();
    const actor = loggedInUser?.email;
    if (recordType === "bill") {
      const payee = String(fields.payee || fields.company || fields.name || "").trim();
      const service = String(fields.serviceProvided || fields.description || "").trim();
      const amount = Number(fields.totalCost ?? fields.estimatedCost ?? fields.amount);
      if (!payee || !service || !Number.isFinite(amount)) return triggerNotification("Review requires a payee, service, and valid cost before saving.");
      const existing = data.vendors.find(v => v.name.trim().toLowerCase() === payee.toLowerCase());
      const provider = existing || { id: id("provider"), name: payee, category: "Service Provider", createdAt };
      if (!existing) data.setVendors(prev => [...prev, provider]);
      const bill: any = { id: id("bill"), billNumber: `BILL-${1000 + data.bills.length + 1}`, vendor: provider.name, serviceProviderId: provider.id, serviceProvided: service, estimatedCost: Number(fields.estimatedCost ?? amount), totalCost: fields.totalCost == null ? undefined : Number(fields.totalCost), recurring: Boolean(fields.recurring), recurringDate: fields.recurringDate ? String(fields.recurringDate) : undefined, lineItems: [{ id: id("li"), description: service, quantity: 1, unitPrice: amount }], category: "Bills", issuedDate: today(), dueDate: String(fields.recurringDate || fields.dueDate || today()), status: "unpaid", amountPaid: 0, notes: fields.notes ? String(fields.notes) : undefined, createdAt, createdBy: actor, source: "ai_snapshot", history: [{ id: id("history"), date: createdAt, action: "AI Snapshot reviewed and saved", amount }] };
      data.setBills(prev => [...prev, bill]);
      data.setJournalEntries(prev => [...prev, postBillCreatedEntry(bill, actor)]);
    } else if (recordType === "customer") {
      data.setCustomers(prev => [...prev, { id: id("cust"), company: String(fields.company || fields.name || fields.contact || "New Customer"), contact: String(fields.contact || fields.name || ""), phone: String(fields.phone || ""), email: String(fields.email || ""), address: String(fields.address || ""), city: String(fields.city || ""), state: String(fields.state || ""), zip: String(fields.zip || ""), source: "AI Snapshot", createdAt } as any]);
    } else if (recordType === "lead") {
      data.setLeads(prev => [...prev, { id: id("lead"), name: String(fields.name || fields.contact || fields.company || "New Lead"), company: String(fields.company || ""), phone: String(fields.phone || ""), email: String(fields.email || ""), address: String(fields.address || ""), notes: String(fields.notes || fields.description || ""), status: "New", source: "AI Snapshot", createdAt } as any]);
    } else if (recordType === "estimate") {
      data.setEstimates(prev => [...prev, { id: id("estimate"), customer: String(fields.company || fields.name || fields.contact || "Unassigned"), title: String(fields.description || fields.serviceProvided || "AI Snapshot estimate"), amount: Number(fields.amount || fields.estimatedCost || 0), status: "Draft", date: today(), createdAt } as any]);
    } else if (recordType === "inventory") {
      data.setInventoryList(prev => [...prev, { id: id("inventory"), name: String(fields.name || fields.description || "Scanned item"), category: String(fields.category || "Materials"), quantity: Number(fields.quantity || 0), unitCost: Number(fields.unitCost || fields.amount || 0), supplier: String(fields.company || fields.payee || ""), source: "AI Snapshot", createdAt } as any]);
    } else if (recordType === "financial") {
      const amount = Number(fields.amount || fields.totalCost || 0);
      if (!Number.isFinite(amount) || amount <= 0) return triggerNotification("Review requires a valid financial amount before saving.");
      if (String(fields.category || "").trim().toLowerCase() === "bills") return triggerNotification("Service/provider obligations must be saved as a Bill. Change 'Save to' to Bill / Invoice so it stays provider-linked.");
      data.setTransactions(prev => [...prev, { id: id("txn"), type: "expense", source: "ai_scan", amount, description: String(fields.description || fields.serviceProvided || fields.payee || "AI Snapshot financial record"), category: String(fields.category || "Other Expense"), date: String(fields.dueDate || today()), createdAt, createdBy: actor } as any]);
    } else {
      triggerNotification("Choose Bill, Customer, Lead, Estimate, or Inventory before saving this reviewed record."); return;
    }
    logOperationalEvent?.("AI Intake Saved", `${labels[recordType]} reviewed by owner before save`, "🤖");
    triggerNotification(`${labels[recordType]} reviewed and saved.`); close();
  };

  if (!open) return <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-40 rounded-full bg-violet-600 px-4 py-3 text-xs font-black text-white shadow-xl hover:bg-violet-700 flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI Intake</button>;
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
    <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-black uppercase text-[#1F3557]">AI Snapshot &amp; Form Intake</h3><p className="mt-1 text-[10px] text-slate-500">Photograph/upload a completed paper form. Nothing saves until you review it.</p></div><button onClick={close}><X className="w-5 h-5 text-slate-400" /></button></div>
    {stage === "choose" && <div className="mt-5 space-y-4"><label className="block text-[10px] font-black uppercase text-slate-500">Record destination<select value={recordType} onChange={e => setRecordType(e.target.value as RecordType)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs normal-case"><option value="unknown">Auto-detect from document</option>{Object.entries(labels).filter(([key]) => key !== "unknown").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => scan(e.target.files?.[0])} /><button onClick={() => inputRef.current?.click()} className="w-full rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50 p-7 text-violet-700"><FileUp className="mx-auto mb-2 w-7 h-7" /><span className="text-xs font-black">Photograph or upload completed form</span></button><button onClick={() => { setFields({ name: "", phone: "", email: "", address: "", description: "", amount: "" }); setStage("review"); }} className="w-full rounded-xl border border-[#9EC8EF] bg-[#EAF5FF] px-3 py-2.5 text-xs font-bold text-[#315C9F] flex justify-center gap-2"><PencilLine className="w-4 h-4" /> Use editable preset form</button><p className="text-center text-[9px] text-slate-500">Manual entry inside every module remains available.</p></div>}
    {stage === "scanning" && <div className="py-14 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-violet-600" /><p className="mt-3 text-xs font-bold text-[#1F3557]">Reading and classifying the form…</p></div>}
    {stage === "review" && <div className="mt-4 space-y-3"><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-900"><strong>Owner review required.</strong> Correct every field below before saving. AI confidence: {Math.round(confidence * 100)}%.</div><label className="block text-[9px] font-black uppercase text-slate-500">Save to<select value={recordType} onChange={e => setRecordType(e.target.value as RecordType)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs normal-case">{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{Object.entries(fields).map(([key, value]) => <label key={key} className="block"><span className="text-[9px] font-bold uppercase text-slate-500">{key.replace(/([A-Z])/g, " $1")}</span><input value={String(value ?? "")} onChange={e => setFields(prev => ({ ...prev, [key]: typeof value === "number" ? Number(e.target.value) : typeof value === "boolean" ? e.target.value === "true" : e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" /></label>)}<button onClick={() => setFields(prev => ({ ...prev, [`field${Object.keys(prev).length + 1}`]: "" }))} className="text-[10px] font-bold text-[#315C9F]">+ Add missing field</button><div className="flex gap-2 pt-2"><button onClick={() => setStage("choose")} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-600">Back</button><button onClick={save} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white flex justify-center gap-2"><Check className="w-4 h-4" /> Review Complete — Save</button></div></div>}
  </div></div>;
}
