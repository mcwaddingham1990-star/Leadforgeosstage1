import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

type Frequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

let adminApp: App | null | undefined;

function getDatabase(): Firestore | null {
  if (adminApp === undefined) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) adminApp = null;
    else {
      try {
        adminApp = getApps().length ? getApps()[0]! : initializeApp({ credential: cert(JSON.parse(raw)) });
      } catch (error) {
        console.error("Recurring scheduler could not initialize Firebase Admin:", error);
        adminApp = null;
      }
    }
  }
  if (!adminApp) return null;
  return getFirestore(
    adminApp,
    process.env.FIREBASE_DATABASE_ID || "ai-studio-leadforgelocalos-a91c76d6-18b0-4f96-b3fb-ef1e755e81f4"
  );
}

function advanceDate(date: string, frequency: Frequency): string {
  const next = new Date(`${date}T12:00:00Z`);
  if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  if (frequency === "biweekly") next.setUTCDate(next.getUTCDate() + 14);
  if (frequency === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  if (frequency === "quarterly") next.setUTCMonth(next.getUTCMonth() + 3);
  if (frequency === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next.toISOString().slice(0, 10);
}

function expenseAccount(category?: string): string {
  const accounts: Record<string, string> = {
    Materials: "acct_cogs_materials", Fuel: "acct_fuel_expense",
    "Vehicle Maintenance": "acct_vehicle_expense", "Office Supplies": "acct_office_expense",
    Marketing: "acct_marketing_expense", Utilities: "acct_utilities_expense",
    Insurance: "acct_insurance_expense", Payroll: "acct_payroll_expense"
  };
  return accounts[category || ""] || "acct_other_expense";
}

export async function processDueRecurringTransactions(): Promise<{ configured: boolean; processed: number; failed: number }> {
  const db = getDatabase();
  if (!db) return { configured: false, processed: 0, failed: 0 };
  const today = new Date().toISOString().slice(0, 10);
  // Filter the date in-process so this works without requiring customers to
  // create an additional composite Firestore index.
  const active = await db.collection("recurring_transactions").where("active", "==", true).get();
  const due = active.docs.filter(document => String(document.data().nextRunDate || "") <= today);
  let processed = 0;
  let failed = 0;

  for (const snapshot of due) {
    try {
      const generated = await db.runTransaction(async transaction => {
        const current = await transaction.get(snapshot.ref);
        const rec = current.data() as any;
        if (!current.exists || !rec.active || rec.nextRunDate > today || !rec.businessId) return false;
        const runDate = rec.nextRunDate;
        const suffix = `${snapshot.id}_${runDate.replace(/-/g, "")}`;
        const lineItems = Array.isArray(rec.payload?.lineItems) ? rec.payload.lineItems : [];
        const subtotal = lineItems.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
        const tax = rec.type === "invoice" ? subtotal * ((Number(rec.payload?.taxRate) || 0) / 100) : 0;
        const dueDate = new Date(`${runDate}T12:00:00Z`);
        dueDate.setUTCDate(dueDate.getUTCDate() + (Number(rec.payload?.dueInDays) || 30));
        const common = { businessId: rec.businessId, createdAt: new Date().toISOString() };
        const journalId = `je_recurring_${suffix}`;

        if (rec.type === "invoice") {
          const id = `inv_recurring_${suffix}`;
          transaction.set(db.collection("invoices").doc(id), {
            ...common, id, invoiceNumber: `INV-REC-${runDate.replace(/-/g, "")}-${snapshot.id.slice(-4)}`,
            customer: rec.payload.customerOrVendor, lineItems, taxRate: Number(rec.payload.taxRate) || 0,
            issuedDate: runDate, dueDate: dueDate.toISOString().slice(0, 10), status: "sent", amountPaid: 0,
            notes: rec.payload.notes || "", recurringTransactionId: snapshot.id
          });
          const lines: any[] = [
            { accountId: "acct_ar", debit: subtotal + tax, credit: 0 },
            { accountId: "acct_service_revenue", debit: 0, credit: subtotal }
          ];
          if (tax) lines.push({ accountId: "acct_sales_tax_payable", debit: 0, credit: tax });
          transaction.set(db.collection("journal_entries").doc(journalId), {
            ...common, id: journalId, date: runDate, memo: `Recurring invoice: ${rec.templateName}`,
            source: "invoice", sourceId: id, lines
          });
        } else {
          const id = `bill_recurring_${suffix}`;
          transaction.set(db.collection("bills").doc(id), {
            ...common, id, billNumber: `BILL-REC-${runDate.replace(/-/g, "")}-${snapshot.id.slice(-4)}`,
            vendor: rec.payload.customerOrVendor, lineItems, category: rec.payload.category || "Other",
            issuedDate: runDate, dueDate: dueDate.toISOString().slice(0, 10), status: "unpaid", amountPaid: 0,
            notes: rec.payload.notes || "", recurringTransactionId: snapshot.id
          });
          transaction.set(db.collection("journal_entries").doc(journalId), {
            ...common, id: journalId, date: runDate, memo: `Recurring bill: ${rec.templateName}`,
            source: "bill", sourceId: id,
            lines: [{ accountId: expenseAccount(rec.payload.category), debit: subtotal, credit: 0 }, { accountId: "acct_ap", debit: 0, credit: subtotal }]
          });
        }
        transaction.update(snapshot.ref, { nextRunDate: advanceDate(runDate, rec.frequency), lastRunAt: new Date().toISOString() });
        return true;
      });
      if (generated) processed++;
    } catch (error) {
      failed++;
      console.error(`Recurring item ${snapshot.id} failed:`, error);
    }
  }
  return { configured: true, processed, failed };
}

export function startRecurringScheduler(): void {
  const run = () => void processDueRecurringTransactions().then(result => {
    if (result.processed || result.failed) console.log("Recurring scheduler run:", result);
  }).catch(error => console.error("Recurring scheduler run failed:", error));
  setTimeout(run, 10_000);
  setInterval(run, 5 * 60 * 1000);
}
