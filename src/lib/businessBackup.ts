import { doc, getDocFromServer } from "firebase/firestore";
import { db } from "../firebase";
import { fetchCollectionFromServer } from "./firestoreService";
import { loadDocumentPdf } from "./documentPdfStore";

/** Every per-business collection the app keeps (see useFirestoreCollection callers). */
export const BACKUP_COLLECTIONS: Array<{ name: string; tenantField?: string }> = [
  "automations", "bank_accounts", "bills", "budgets", "bulletins", "chart_of_accounts", "conversations",
  "customers", "document_folders", "documents", "estimates", "inventory", "invoices", "journal_entries",
  "leads", "memberships", "mileage_logs", "missed_call_events", "notifications", "payroll_runs",
  "price_book_folders", "price_book_models", "project_completion_plans", "purchase_orders",
  "recent_ai_actions", "recurring_transactions", "revenue_events", "review_requests", "sales_tax_rates",
  "scheduling_events", "snapshots", "text_messages", "time_clock_logs", "transactions", "vendors", "work_orders"
].map((name): { name: string; tenantField?: string } => ({ name })).concat([{ name: "employees", tenantField: "businessEmail" }]);

export interface BusinessBackup {
  format: "ownerslocal-backup";
  version: 1;
  businessId: string;
  createdAt: string;
  businessProfile: Record<string, unknown> | null;
  collections: Record<string, any[]>;
  /** Collections (or large PDFs) that couldn't be read, with why. */
  skipped: Record<string, string>;
}

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Reads every record this business has straight from the server. */
export async function buildBusinessBackup(businessId: string): Promise<BusinessBackup> {
  const backup: BusinessBackup = {
    format: "ownerslocal-backup",
    version: 1,
    businessId,
    createdAt: new Date().toISOString(),
    businessProfile: null,
    collections: {},
    skipped: {}
  };
  try {
    const profile = await getDocFromServer(doc(db, "business_profiles", businessId));
    backup.businessProfile = profile.exists() ? profile.data() : null;
  } catch (err) {
    backup.skipped.business_profiles = reason(err);
  }
  await Promise.all(BACKUP_COLLECTIONS.map(async ({ name, tenantField }) => {
    try {
      backup.collections[name] = await fetchCollectionFromServer(name, businessId, tenantField);
    } catch (err) {
      backup.skipped[name] = reason(err);
    }
  }));
  // Large PDFs are stored outside their records; put them in the backup too.
  for (const record of backup.collections.documents || []) {
    if (!record.pdfChunked) continue;
    try {
      record.pdfBase64 = await loadDocumentPdf(record);
    } catch (err) {
      backup.skipped[`documents/${record.id} PDF`] = reason(err);
    }
  }
  return backup;
}

export function countBackupRecords(backup: BusinessBackup): number {
  return Object.values(backup.collections).reduce((sum, items) => sum + items.length, 0);
}

/** Saves the backup to the device as a .json file. */
export function downloadBackup(backup: BusinessBackup): string {
  const filename = `ownerslocal-backup-${backup.createdAt.slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return filename;
}
