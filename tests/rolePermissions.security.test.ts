/**
 * Role-by-role permission matrix against the real firestore.rules.
 *
 * One business (BIZ) with four people, plus an unrelated business (OTHER):
 *  - Owner           : the account whose email IS the business id -> everything.
 *  - Office Manager  : Owner granted Customers (view/edit/delete), Accounting
 *                      (view/edit), Roster (view/edit) -- nothing else.
 *  - Manager         : Owner granted Scheduling/Jobs (view/edit) and the Time
 *                      Clock team-punch capability.
 *  - Employee        : Technician -- Jobs (view/edit), Time Clock (view/edit),
 *                      Customers (view only).
 *
 * Every role is checked against permitted AND restricted actions, plus the
 * escalation and cross-business paths this audit closed.
 *
 * Run with `npm run test:rules` (firebase emulators:exec).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch, collection, query, where, getDocs } from "firebase/firestore";

// Own emulator project so clearing data never races the other suites.
const PROJECT_ID = "demo-ownerslocal-roles-test";

const BIZ = "owner@biz.example";
const OTHER = "owner@other.example";

const OWNER = { uid: "owner-uid", email: BIZ };
const OFFICE = { uid: "office-uid", email: "office@biz.example" };
const MANAGER = { uid: "manager-uid", email: "manager@biz.example" };
const EMPLOYEE = { uid: "tech-uid", email: "tech@biz.example" };
const OTHER_OWNER = { uid: "other-owner-uid", email: OTHER };
const OTHER_EMPLOYEE = { uid: "other-tech-uid", email: "tech@other.example" };

const flags = (view: boolean, edit: boolean, del: boolean) => ({ view, edit, delete: del });

const PROFILES: Record<string, Record<string, unknown>> = {
  [OWNER.uid]: { businessEmail: BIZ, role: "Owner", email: BIZ, name: "Olivia Owner" },
  [OFFICE.uid]: {
    businessEmail: BIZ, role: "Office Manager", email: OFFICE.email, name: "Oscar Office", isEmployee: true,
    permissions: ["customers", "accounting", "roster"],
    granularPermissions: { customers: flags(true, true, true), accounting: flags(true, true, false), roster: flags(true, true, false) },
  },
  [MANAGER.uid]: {
    businessEmail: BIZ, role: "Operations Manager", email: MANAGER.email, name: "Mia Manager", isEmployee: true,
    permissions: ["scheduling", "jobs", "timeclock", "timeclock_team_punches"],
    granularPermissions: {
      scheduling: flags(true, true, false), jobs: flags(true, true, false),
      timeclock: flags(true, true, false), timeclock_team_punches: flags(true, true, false),
    },
  },
  [EMPLOYEE.uid]: {
    businessEmail: BIZ, role: "Technician", email: EMPLOYEE.email, name: "Theo Tech", isEmployee: true,
    permissions: ["jobs", "timeclock", "customers"],
    granularPermissions: { jobs: flags(true, true, false), timeclock: flags(true, true, false), customers: flags(true, false, false) },
  },
  [OTHER_OWNER.uid]: { businessEmail: OTHER, role: "Owner", email: OTHER, name: "Other Owner" },
  [OTHER_EMPLOYEE.uid]: {
    businessEmail: OTHER, role: "Technician", email: OTHER_EMPLOYEE.email, name: "Other Tech", isEmployee: true,
    permissions: ["customers", "jobs"], granularPermissions: { customers: flags(true, true, true), jobs: flags(true, true, true) },
  },
};

let testEnv: RulesTestEnvironment;
const as = (who: { uid: string; email: string }) => testEnv.authenticatedContext(who.uid, { email: who.email }).firestore();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, profile] of Object.entries(PROFILES)) await setDoc(doc(db, "user_profiles", uid), profile);
    for (const who of [OFFICE, MANAGER, EMPLOYEE]) {
      const p = PROFILES[who.uid];
      await setDoc(doc(db, "employees", who.email), {
        email: who.email, businessEmail: BIZ, businessId: BIZ, userUid: who.uid, role: p.role,
        permissions: p.permissions, granularPermissions: p.granularPermissions, firstName: "x", lastName: "y", hourlyRate: 20,
      });
    }
    await setDoc(doc(db, "business_profiles", BIZ), { businessNames: ["Biz"] });
    await setDoc(doc(db, "business_profiles", OTHER), { businessNames: ["Other"] });
    await setDoc(doc(db, "customers", "cust_biz"), { businessId: BIZ, company: "Biz Customer" });
    await setDoc(doc(db, "customers", "cust_other"), { businessId: OTHER, company: "Other Customer" });
    await setDoc(doc(db, "scheduling_events", "job_biz"), { businessId: BIZ, title: "Job", assignedEmployee: "Theo Tech" });
    await setDoc(doc(db, "invoices", "inv_biz"), { businessId: BIZ, total: 100 });
    await setDoc(doc(db, "invoices", "inv_other"), { businessId: OTHER, total: 100 });
    await setDoc(doc(db, "chart_of_accounts", "acct_biz"), { businessId: BIZ, name: "Cash" });
    await setDoc(doc(db, "notifications", "note_tech"), { businessId: BIZ, recipientEmail: EMPLOYEE.email, title: "Hi", isRead: false });
  });
});

describe("Owner: unrestricted inside their own business", () => {
  test("reads, writes and deletes in every module", async () => {
    const db = as(OWNER);
    await assertSucceeds(getDoc(doc(db, "customers", "cust_biz")));
    await assertSucceeds(updateDoc(doc(db, "customers", "cust_biz"), { company: "Renamed" }));
    await assertSucceeds(deleteDoc(doc(db, "customers", "cust_biz")));
    await assertSucceeds(setDoc(doc(db, "invoices", "inv_new"), { businessId: BIZ, total: 5 }));
    await assertSucceeds(deleteDoc(doc(db, "invoices", "inv_biz")));
    await assertSucceeds(updateDoc(doc(db, "scheduling_events", "job_biz"), { title: "Moved" }));
    await assertSucceeds(updateDoc(doc(db, "business_profiles", BIZ), { businessNames: ["Biz 2"] }));
  });

  test("sets any employee's role and permissions directly", async () => {
    const db = as(OWNER);
    const batch = writeBatch(db);
    batch.set(doc(db, "user_profiles", EMPLOYEE.uid), { role: "General Manager", granularPermissions: { accounting: flags(true, true, true) }, permissions: ["accounting"] }, { merge: true });
    batch.set(doc(db, "employees", EMPLOYEE.email), { role: "General Manager", granularPermissions: { accounting: flags(true, true, true) }, permissions: ["accounting"] }, { merge: true });
    await assertSucceeds(batch.commit());
  });

  test("issues invites with any role, including Owner", async () => {
    const db = as(OWNER);
    await assertSucceeds(setDoc(doc(db, "employee_invites", "CO-OWNER"), {
      code: "CO-OWNER", businessEmail: BIZ, role: "Owner", permissions: [], granularPermissions: {}, status: "pending",
    }));
  });

  test("but not in another business", async () => {
    const db = as(OWNER);
    await assertFails(getDoc(doc(db, "customers", "cust_other")));
    await assertFails(updateDoc(doc(db, "customers", "cust_other"), { company: "x" }));
    await assertFails(deleteDoc(doc(db, "invoices", "inv_other")));
    await assertFails(updateDoc(doc(db, "business_profiles", OTHER), { businessNames: ["x"] }));
  });
});

describe("Office Manager: only what the Owner granted", () => {
  test("granted modules work", async () => {
    const db = as(OFFICE);
    await assertSucceeds(getDoc(doc(db, "customers", "cust_biz")));
    await assertSucceeds(updateDoc(doc(db, "customers", "cust_biz"), { company: "Edited" }));
    await assertSucceeds(deleteDoc(doc(db, "customers", "cust_biz")));
    await assertSucceeds(getDoc(doc(db, "invoices", "inv_biz")));
    await assertSucceeds(updateDoc(doc(db, "chart_of_accounts", "acct_biz"), { name: "Cash 2" }));
  });

  test("Delete wasn't granted for Accounting, so it's refused", async () => {
    await assertFails(deleteDoc(doc(as(OFFICE), "chart_of_accounts", "acct_biz")));
  });

  test("modules not granted are refused, whatever the role name says", async () => {
    const db = as(OFFICE);
    await assertFails(getDoc(doc(db, "scheduling_events", "job_biz")));
    await assertFails(updateDoc(doc(db, "scheduling_events", "job_biz"), { title: "x" }));
    await assertFails(updateDoc(doc(db, "business_profiles", BIZ), { businessNames: ["x"] }));
  });

  test("can't punch other employees in/out just for being a 'Manager' title", async () => {
    await assertFails(setDoc(doc(as(OFFICE), "time_clock_logs", "log_office_for_tech"), {
      businessId: BIZ, employeeEmail: EMPLOYEE.email, type: "in",
    }));
  });

  test("can toggle clock-in verification for an employee", async () => {
    await assertSucceeds(updateDoc(doc(as(OFFICE), "user_profiles", EMPLOYEE.uid), { requireTimeClockVerification: true }));
  });

  test("NO ESCALATION: can't write anyone's role or permissions directly", async () => {
    const db = as(OFFICE);
    await assertFails(updateDoc(doc(db, "user_profiles", EMPLOYEE.uid), { granularPermissions: { payroll: flags(true, true, true) } }));
    await assertFails(updateDoc(doc(db, "user_profiles", EMPLOYEE.uid), { role: "Owner" }));
    await assertFails(updateDoc(doc(db, "user_profiles", MANAGER.uid), { permissions: ["payroll", "billing"] }));
    await assertFails(updateDoc(doc(db, "employees", EMPLOYEE.email), { granularPermissions: { payroll: flags(true, true, true) } }));
    await assertFails(updateDoc(doc(db, "employees", EMPLOYEE.email), { role: "General Manager" }));
  });

  test("NO ESCALATION: can't raise their own access", async () => {
    const db = as(OFFICE);
    await assertFails(updateDoc(doc(db, "user_profiles", OFFICE.uid), { granularPermissions: { payroll: flags(true, true, true) } }));
    await assertFails(updateDoc(doc(db, "user_profiles", OFFICE.uid), { role: "Owner" }));
    await assertFails(updateDoc(doc(db, "user_profiles", OFFICE.uid), { businessEmail: OTHER }));
  });

  test("NO ESCALATION: can't touch the Owner's profile", async () => {
    await assertFails(updateDoc(doc(as(OFFICE), "user_profiles", OWNER.uid), { requireTimeClockVerification: true }));
  });

  test("NO ESCALATION: can't write an invite directly (the server checks what they may grant)", async () => {
    await assertFails(setDoc(doc(as(OFFICE), "employee_invites", "SNEAKY"), {
      code: "SNEAKY", businessEmail: BIZ, role: "Technician", permissions: ["payroll"],
      granularPermissions: { payroll: flags(true, true, true) }, status: "pending",
    }));
  });

  test("NO ESCALATION: can't widen an existing pending invite", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "employee_invites", "PENDING1"), {
        code: "PENDING1", businessEmail: BIZ, role: "Technician", permissions: ["jobs"],
        granularPermissions: { jobs: flags(true, true, false) }, status: "pending",
      });
    });
    await assertFails(updateDoc(doc(as(OFFICE), "employee_invites", "PENDING1"), { granularPermissions: { payroll: flags(true, true, true) } }));
    await assertFails(updateDoc(doc(as(OFFICE), "employee_invites", "PENDING1"), { role: "Owner" }));
  });

  test("can still edit ordinary roster details", async () => {
    await assertSucceeds(updateDoc(doc(as(OFFICE), "employees", EMPLOYEE.email), { phone: "555-0100", hourlyRate: 22 }));
  });
});

describe("Manager: only what the Owner granted", () => {
  test("granted scheduling/jobs work", async () => {
    const db = as(MANAGER);
    await assertSucceeds(getDoc(doc(db, "scheduling_events", "job_biz")));
    await assertSucceeds(updateDoc(doc(db, "scheduling_events", "job_biz"), { title: "Rescheduled" }));
  });

  test("the explicitly granted team-punch capability works", async () => {
    await assertSucceeds(setDoc(doc(as(MANAGER), "time_clock_logs", "log_mgr_for_tech"), {
      businessId: BIZ, employeeEmail: EMPLOYEE.email, type: "in",
    }));
  });

  test("Delete wasn't granted, so deleting a job is refused", async () => {
    await assertFails(deleteDoc(doc(as(MANAGER), "scheduling_events", "job_biz")));
  });

  test("no customers, accounting, roster or settings", async () => {
    const db = as(MANAGER);
    await assertFails(getDoc(doc(db, "customers", "cust_biz")));
    await assertFails(getDoc(doc(db, "invoices", "inv_biz")));
    await assertFails(updateDoc(doc(db, "user_profiles", EMPLOYEE.uid), { requireTimeClockVerification: true }));
    await assertFails(updateDoc(doc(db, "business_profiles", BIZ), { businessNames: ["x"] }));
    await assertFails(setDoc(doc(db, "employee_invites", "MGR-INV"), {
      code: "MGR-INV", businessEmail: BIZ, role: "Technician", permissions: [], granularPermissions: {}, status: "pending",
    }));
  });

  test("an older manager profile gets team punches only if the Owner listed it -- never from the title", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "user_profiles", MANAGER.uid), {
        businessEmail: BIZ, role: "Office Manager", email: MANAGER.email, isEmployee: true,
        permissions: ["timeclock"], // legacy list, no explicit granular entry, no team punches granted
      });
    });
    await assertFails(setDoc(doc(as(MANAGER), "time_clock_logs", "log_legacy_mgr"), {
      businessId: BIZ, employeeEmail: EMPLOYEE.email, type: "in",
    }));
  });
});

describe("Employee: only authorized records and functions", () => {
  test("can work their jobs and their own time clock", async () => {
    const db = as(EMPLOYEE);
    await assertSucceeds(getDoc(doc(db, "scheduling_events", "job_biz")));
    await assertSucceeds(updateDoc(doc(db, "scheduling_events", "job_biz"), { status: "In Progress" }));
    await assertSucceeds(setDoc(doc(db, "time_clock_logs", "log_tech_self"), { businessId: BIZ, employeeEmail: EMPLOYEE.email, type: "in" }));
  });

  test("customers are view-only", async () => {
    const db = as(EMPLOYEE);
    await assertSucceeds(getDoc(doc(db, "customers", "cust_biz")));
    await assertFails(updateDoc(doc(db, "customers", "cust_biz"), { company: "x" }));
    await assertFails(deleteDoc(doc(db, "customers", "cust_biz")));
  });

  test("can't punch someone else in", async () => {
    await assertFails(setDoc(doc(as(EMPLOYEE), "time_clock_logs", "log_tech_for_mgr"), { businessId: BIZ, employeeEmail: MANAGER.email, type: "in" }));
  });

  test("can't approve their own time", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "time_clock_logs", "log_pending"), { businessId: BIZ, employeeEmail: EMPLOYEE.email, type: "in", approvalStatus: "pending" });
    });
    await assertFails(updateDoc(doc(as(EMPLOYEE), "time_clock_logs", "log_pending"), { approvalStatus: "approved" }));
  });

  test("no accounting, roster, settings or other people's notifications", async () => {
    const db = as(EMPLOYEE);
    await assertFails(getDoc(doc(db, "invoices", "inv_biz")));
    await assertFails(getDoc(doc(db, "user_profiles", MANAGER.uid)));
    await assertFails(updateDoc(doc(db, "business_profiles", BIZ), { businessNames: ["x"] }));
    await assertSucceeds(getDoc(doc(db, "notifications", "note_tech")));
    await assertFails(getDoc(doc(as(MANAGER), "notifications", "note_tech")));
  });

  test("NO ESCALATION: can't change their own access or tenant", async () => {
    const db = as(EMPLOYEE);
    await assertFails(updateDoc(doc(db, "user_profiles", EMPLOYEE.uid), { granularPermissions: { accounting: flags(true, true, true) } }));
    await assertFails(updateDoc(doc(db, "user_profiles", EMPLOYEE.uid), { permissions: ["accounting"] }));
    await assertFails(updateDoc(doc(db, "user_profiles", EMPLOYEE.uid), { role: "Owner" }));
    await assertFails(updateDoc(doc(db, "user_profiles", EMPLOYEE.uid), { businessEmail: OTHER }));
    await assertFails(updateDoc(doc(db, "employees", EMPLOYEE.email), { granularPermissions: { accounting: flags(true, true, true) } }));
  });

  test("can update their own contact details", async () => {
    await assertSucceeds(updateDoc(doc(as(EMPLOYEE), "employees", EMPLOYEE.email), { phone: "555-0199" }));
  });

  test("can mark their notification read, but can't readdress or move it", async () => {
    const db = as(EMPLOYEE);
    await assertSucceeds(updateDoc(doc(db, "notifications", "note_tech"), { isRead: true }));
    await assertFails(updateDoc(doc(db, "notifications", "note_tech"), { recipientEmail: MANAGER.email }));
    await assertFails(updateDoc(doc(db, "notifications", "note_tech"), { businessId: OTHER }));
  });
});

describe("Cross-business data exposure", () => {
  test("another business's staff can't read anything here", async () => {
    const db = as(OTHER_EMPLOYEE);
    await assertFails(getDoc(doc(db, "customers", "cust_biz")));
    await assertFails(getDoc(doc(db, "scheduling_events", "job_biz")));
    await assertFails(getDocs(query(collection(db, "customers"), where("businessId", "==", BIZ))));
    await assertFails(getDoc(doc(db, "business_profiles", BIZ)));
    await assertFails(getDoc(doc(db, "employees", EMPLOYEE.email)));
  });

  test("TAKEOVER: can't overwrite this business's record by writing it with their own business id", async () => {
    // Other business's employee has customers + jobs edit/delete in THEIR business.
    const db = as(OTHER_EMPLOYEE);
    await assertFails(setDoc(doc(db, "customers", "cust_biz"), { businessId: OTHER, company: "Stolen" }));
    await assertFails(updateDoc(doc(db, "customers", "cust_biz"), { businessId: OTHER }));
    await assertFails(setDoc(doc(db, "scheduling_events", "job_biz"), { businessId: OTHER, title: "Stolen" }));
    await assertFails(setDoc(doc(as(OTHER_OWNER), "invoices", "inv_biz"), { businessId: OTHER, total: 0 }));
  });

  test("TAKEOVER: this business can't push its own record into another business either", async () => {
    await assertFails(updateDoc(doc(as(OWNER), "customers", "cust_biz"), { businessId: OTHER }));
  });

  test("records stay readable by their own business after a blocked takeover attempt", async () => {
    await assertFails(setDoc(doc(as(OTHER_OWNER), "customers", "cust_biz"), { businessId: OTHER, company: "Stolen" }));
    const snap = await assertSucceeds(getDoc(doc(as(OWNER), "customers", "cust_biz")));
    expect(snap.data()?.company).toBe("Biz Customer");
  });

  test("push notifications: a device can only be registered under the user's own business", async () => {
    await assertFails(setDoc(doc(as(OTHER_EMPLOYEE), "push_subscriptions", `${OTHER_EMPLOYEE.email}__tok1`), {
      email: OTHER_EMPLOYEE.email, businessId: BIZ, token: "tok1",
    }));
    await assertSucceeds(setDoc(doc(as(OTHER_EMPLOYEE), "push_subscriptions", `${OTHER_EMPLOYEE.email}__tok2`), {
      email: OTHER_EMPLOYEE.email, businessId: OTHER, token: "tok2",
    }));
    await assertSucceeds(setDoc(doc(as(EMPLOYEE), "push_subscriptions", `${EMPLOYEE.email}__tok3`), {
      email: EMPLOYEE.email, businessId: BIZ, token: "tok3",
    }));
  });

  test("can't redirect a business's customer payouts by writing its Stripe account id", async () => {
    await assertFails(updateDoc(doc(as(OWNER), "business_profiles", BIZ), { stripeConnectedAccountId: "acct_attacker" }));
    await assertFails(setDoc(doc(as(OWNER), "business_profiles", BIZ), { stripeConnectedAccountId: "acct_attacker" }, { merge: true }));
  });

  test("can't join another business by editing their own profile", async () => {
    await assertFails(updateDoc(doc(as(OTHER_EMPLOYEE), "user_profiles", OTHER_EMPLOYEE.uid), { businessEmail: BIZ }));
  });
});
