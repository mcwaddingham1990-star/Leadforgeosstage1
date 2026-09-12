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

type MaintenanceFrequency = { unit: "days" | "weeks" | "months" | "years" | "specific_dates"; interval?: number; specificDates?: string[] };

/** Same date math as MembershipBuilder's own addInterval() (client-side,
 * used only to preview the first nextMaintenanceDate on save) -- kept as a
 * small, separate duplicate the same way this file's own advanceDate()
 * already is, since server/ and src/ aren't bundled together. Returns null
 * once a specific-dates list runs out (no more visits/bills to generate). */
function advanceMaintenanceDate(date: string, freq: MaintenanceFrequency | undefined): string | null {
  if (!freq) return null;
  if (freq.unit === "specific_dates") {
    const next = (freq.specificDates || []).filter(d => d > date).sort()[0];
    return next || null;
  }
  const next = new Date(`${date}T12:00:00Z`);
  const interval = Math.max(1, freq.interval || 1);
  if (freq.unit === "days") next.setUTCDate(next.getUTCDate() + interval);
  if (freq.unit === "weeks") next.setUTCDate(next.getUTCDate() + interval * 7);
  if (freq.unit === "months") next.setUTCMonth(next.getUTCMonth() + interval);
  if (freq.unit === "years") next.setUTCFullYear(next.getUTCFullYear() + interval);
  return next.toISOString().slice(0, 10);
}

function advanceBillingDate(date: string, billingFrequency: string | undefined, customBillingDays?: number): string | null {
  const next = new Date(`${date}T12:00:00Z`);
  if (billingFrequency === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else if (billingFrequency === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  else if (billingFrequency === "quarterly") next.setUTCMonth(next.getUTCMonth() + 3);
  else if (billingFrequency === "annually") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else if (billingFrequency === "custom") next.setUTCDate(next.getUTCDate() + Math.max(1, customBillingDays || 30));
  else return null; // "one_time" -- nothing further to bill
  return next.toISOString().slice(0, 10);
}

/**
 * When an Active Membership's nextMaintenanceDate is due, generates the
 * next recurring maintenance visit as a real, independent WorkOrder (see
 * src/types/domain.ts's WorkOrder -- it already gives every visit its own
 * freely-editable copy, so nothing new was needed for that guarantee),
 * a companion scheduling_events record so it shows on Scheduling/Dispatch/
 * Map for free, and a notification. Guarded against duplicates two ways:
 * the same runTransaction re-check pattern processDueRecurringTransactions
 * already uses, AND a deterministic work-order id
 * (wo_membership_<membershipId>_<date>) that a second run would collide
 * with and skip instead of re-creating.
 */
export async function processDueMembershipMaintenance(): Promise<{ configured: boolean; processed: number; failed: number }> {
  const db = getDatabase();
  if (!db) return { configured: false, processed: 0, failed: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const active = await db.collection("memberships").where("status", "==", "Active").get();
  const due = active.docs.filter(d => {
    const next = String(d.data().nextMaintenanceDate || "");
    return next && next <= today;
  });
  let processed = 0;
  let failed = 0;

  for (const snapshot of due) {
    try {
      const generated = await db.runTransaction(async transaction => {
        const current = await transaction.get(snapshot.ref);
        const m = current.data() as any;
        if (!current.exists || m.status !== "Active" || !m.nextMaintenanceDate || m.nextMaintenanceDate > today) return false;
        const visitDate = m.nextMaintenanceDate as string;
        if (m.endDate && visitDate > m.endDate) {
          // The plan ended before this visit's date -- stop generating and clear the field, per nextMaintenanceDate's own contract.
          transaction.update(snapshot.ref, { nextMaintenanceDate: null, status: "Expired", updatedAt: new Date().toISOString() });
          return false;
        }
        const suffix = `${snapshot.id}_${visitDate.replace(/-/g, "")}`;
        const woId = `wo_membership_${suffix}`;
        const woRef = db.collection("work_orders").doc(woId);
        const existingWo = await transaction.get(woRef);
        const rawNextDate = advanceMaintenanceDate(visitDate, m.maintenanceFrequency);
        const nextDate = (rawNextDate && m.endDate && rawNextDate > m.endDate) ? null : rawNextDate;
        if (existingWo.exists) {
          // Already generated by an earlier run -- just advance the date, don't duplicate the visit.
          transaction.update(snapshot.ref, { nextMaintenanceDate: nextDate, updatedAt: new Date().toISOString() });
          return false;
        }
        const now = new Date().toISOString();
        const lineItems = Array.isArray(m.includedServices) ? m.includedServices.map((s: any, i: number) => ({
          id: `mli_${suffix}_${i}`, description: s.description, quantity: Number(s.quantity) || 1, unitPrice: Number(s.unitPrice) || 0, priceBookModelId: s.priceBookModelId
        })) : [];
        transaction.set(woRef, {
          id: woId,
          workOrderNumber: `WO-MAINT-${visitDate.replace(/-/g, "")}-${snapshot.id.slice(-4)}`,
          date: visitDate,
          jobDescription: `${m.planName} — Recurring Maintenance Visit`,
          customerId: m.customerId || undefined,
          customerName: m.customerName || undefined,
          customerPhone: m.customerPhone || undefined,
          customerEmail: m.customerEmail || undefined,
          address: m.address || undefined,
          sourceMembershipId: snapshot.id,
          assignedEmployees: m.assignedEmployee ? [m.assignedEmployee] : undefined,
          scheduledDate: visitDate,
          scheduledTime: "09:00",
          lineItems,
          status: "Scheduled",
          businessId: m.businessId,
          createdAt: now,
          updatedAt: now
        });
        transaction.set(db.collection("scheduling_events").doc(`evt_${woId}`), {
          id: `evt_${woId}`,
          eventType: "Work Order",
          date: visitDate,
          startTime: "09:00",
          endTime: "10:00",
          customer: m.customerName || "Membership visit",
          customerId: m.customerId || undefined,
          customerPhone: m.customerPhone || undefined,
          location: m.address || undefined,
          assignedEmployee: m.assignedEmployee || "",
          assignedCrew: m.assignedCrew || undefined,
          priority: "Medium",
          status: m.assignedEmployee ? "Assigned" : "Unassigned",
          title: `${m.planName} — Recurring Maintenance`,
          description: `Auto-generated recurring maintenance visit for ${m.planName}.`,
          sourceWorkOrderId: woId,
          businessId: m.businessId,
          createdAt: now,
          updatedAt: now
        });
        transaction.set(db.collection("notifications").doc(`notif_${woId}`), {
          id: `notif_${woId}`,
          businessId: m.businessId,
          screenId: "scheduling",
          title: "Recurring maintenance scheduled",
          message: `${m.planName} for ${m.customerName || "a customer"} was auto-scheduled for ${visitDate}.`,
          isRead: false,
          timestamp: now
        });
        transaction.update(snapshot.ref, { nextMaintenanceDate: nextDate, lastGeneratedVisitDate: visitDate, updatedAt: now });
        return true;
      });
      if (generated) processed++;
    } catch (error) {
      failed++;
      console.error(`Membership ${snapshot.id} maintenance generation failed:`, error);
    }
  }
  return { configured: true, processed, failed };
}

/**
 * Manual/Invoice recurring billing for Memberships whose nextPaymentDate is
 * due. Stripe-billed memberships are intentionally NOT auto-charged here --
 * charging a customer's saved card automatically needs real payment-method
 * capture and webhook-verified confirmation this app doesn't have wired up
 * yet, and guessing at that with real money on the line is worse than not
 * doing it. Instead a notification tells the owner/manager a Stripe charge
 * is due so they can run it deliberately from Payments, same duplicate
 * guard (deterministic id + transactional re-check) either way.
 */
export async function processDueMembershipBilling(): Promise<{ configured: boolean; processed: number; failed: number }> {
  const db = getDatabase();
  if (!db) return { configured: false, processed: 0, failed: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const active = await db.collection("memberships").where("status", "==", "Active").get();
  const due = active.docs.filter(d => {
    const next = String(d.data().nextPaymentDate || "");
    return next && next <= today;
  });
  let processed = 0;
  let failed = 0;

  for (const snapshot of due) {
    try {
      const generated = await db.runTransaction(async transaction => {
        const current = await transaction.get(snapshot.ref);
        const m = current.data() as any;
        if (!current.exists || m.status !== "Active" || !m.nextPaymentDate || m.nextPaymentDate > today) return false;
        const billDate = m.nextPaymentDate as string;
        if (m.endDate && billDate > m.endDate) {
          transaction.update(snapshot.ref, { nextPaymentDate: null, status: "Expired", updatedAt: new Date().toISOString() });
          return false;
        }
        const suffix = `${snapshot.id}_${billDate.replace(/-/g, "")}`;
        const rawNextDate = advanceBillingDate(billDate, m.billingFrequency, m.customBillingDays);
        const nextDate = (rawNextDate && m.endDate && rawNextDate > m.endDate) ? null : rawNextDate;
        const now = new Date().toISOString();
        const subtotal = Math.max(0, Number(m.price) || 0) - (Number(m.discountFlat) || 0);
        const amount = Math.max(0, subtotal * (1 - (Number(m.discountPercent) || 0) / 100));

        if (m.billingMethod === "invoice") {
          const invId = `inv_membership_${suffix}`;
          const invRef = db.collection("invoices").doc(invId);
          if ((await transaction.get(invRef)).exists) {
            transaction.update(snapshot.ref, { nextPaymentDate: nextDate, updatedAt: now });
            return false;
          }
          const dueDate = new Date(`${billDate}T12:00:00Z`);
          dueDate.setUTCDate(dueDate.getUTCDate() + 15);
          transaction.set(invRef, {
            id: invId, invoiceNumber: `INV-MEM-${billDate.replace(/-/g, "")}-${snapshot.id.slice(-4)}`,
            customer: m.customerName || "", membershipId: snapshot.id,
            lineItems: [{ id: `mbi_${suffix}`, description: m.planName, quantity: 1, unitPrice: amount }],
            taxRate: 0, issuedDate: billDate, dueDate: dueDate.toISOString().slice(0, 10),
            status: "sent", amountPaid: 0, businessId: m.businessId, createdAt: now, createdBy: "recurring_scheduler"
          });
          transaction.set(db.collection("notifications").doc(`notif_${invId}`), {
            id: `notif_${invId}`, businessId: m.businessId, screenId: "accounting",
            title: "Membership invoice created", message: `Invoice for ${m.planName} (${m.customerName || "customer"}) — $${amount.toFixed(2)}.`,
            isRead: false, timestamp: now
          });
        } else if (m.billingMethod === "stripe") {
          const notifId = `notif_stripe_due_${suffix}`;
          const notifRef = db.collection("notifications").doc(notifId);
          if ((await transaction.get(notifRef)).exists) {
            transaction.update(snapshot.ref, { nextPaymentDate: nextDate, updatedAt: now });
            return false;
          }
          transaction.set(notifRef, {
            id: notifId, businessId: m.businessId, screenId: "payments",
            title: "Stripe membership charge due", message: `${m.planName} (${m.customerName || "customer"}) — $${amount.toFixed(2)} is due. Charge it from Payments.`,
            isRead: false, timestamp: now
          });
        } else {
          const txnId = `txn_membership_${suffix}`;
          const txnRef = db.collection("transactions").doc(txnId);
          if ((await transaction.get(txnRef)).exists) {
            transaction.update(snapshot.ref, { nextPaymentDate: nextDate, updatedAt: now });
            return false;
          }
          transaction.set(txnRef, {
            id: txnId, type: "income", source: "recurring_membership", amount,
            description: `${m.planName} — ${m.customerName || "Membership"}`, category: "Membership",
            date: billDate, createdAt: now, membershipId: snapshot.id, businessId: m.businessId
          });
        }
        transaction.update(snapshot.ref, { nextPaymentDate: nextDate, lastBilledDate: billDate, updatedAt: now });
        return true;
      });
      if (generated) processed++;
    } catch (error) {
      failed++;
      console.error(`Membership ${snapshot.id} billing generation failed:`, error);
    }
  }
  return { configured: true, processed, failed };
}

export function startRecurringScheduler(): void {
  const run = () => {
    void processDueRecurringTransactions().then(result => {
      if (result.processed || result.failed) console.log("Recurring scheduler run:", result);
    }).catch(error => console.error("Recurring scheduler run failed:", error));
    void processDueMembershipMaintenance().then(result => {
      if (result.processed || result.failed) console.log("Membership maintenance scheduler run:", result);
    }).catch(error => console.error("Membership maintenance scheduler run failed:", error));
    void processDueMembershipBilling().then(result => {
      if (result.processed || result.failed) console.log("Membership billing scheduler run:", result);
    }).catch(error => console.error("Membership billing scheduler run failed:", error));
  };
  setTimeout(run, 10_000);
  setInterval(run, 5 * 60 * 1000);
}
