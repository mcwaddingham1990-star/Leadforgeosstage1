/**
 * Cross-tenant + safety regression suite for the `automations` and
 * `automation_runs` rules in firestore.rules. Runs in the real Firestore
 * emulator (see package.json's test:rules script) under its own project id so
 * it never shares data with firestoreRules.security.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, setDoc, updateDoc, where } from "firebase/firestore";

const PROJECT_ID = "demo-ownerslocal-automation-test";

const BIZ_A = "ownerA@example.com";
const BIZ_B = "ownerB@example.com";
const OWNER_A_UID = "owner-a-uid";
const OWNER_B_UID = "owner-b-uid";
const EMP_A_UID = "emp-a-uid";
const EMP_A_EMAIL = "employeeA@example.com";

let testEnv: RulesTestEnvironment;

const automation = (businessId: string, overrides: Record<string, unknown> = {}) => ({
  id: "auto_x",
  businessId,
  name: "Estimate Accepted → Create Job",
  trigger: "estimate.accepted",
  conditions: [],
  actions: [{ id: "act_1", type: "create_job" }],
  actionTypes: ["create_job"],
  enabled: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

const run = (businessId: string, automationId: string, overrides: Record<string, unknown> = {}) => ({
  businessId,
  automationId,
  automationName: "x",
  trigger: "estimate.accepted",
  eventKey: "estimate.accepted:est_1",
  sourceCollection: "estimates",
  sourceRecordId: "est_1",
  conditions: [],
  conditionResults: [],
  conditionsMet: true,
  actionsAttempted: [],
  actionResults: [],
  completedActions: 0,
  skippedActions: 0,
  failedActions: 0,
  errors: [],
  status: "Running",
  startedAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "user_profiles", OWNER_A_UID), { businessEmail: BIZ_A, role: "Owner", email: BIZ_A });
    await setDoc(doc(db, "user_profiles", OWNER_B_UID), { businessEmail: BIZ_B, role: "Owner", email: BIZ_B });
    await setDoc(doc(db, "user_profiles", EMP_A_UID), {
      businessEmail: BIZ_A,
      role: "Technician",
      email: EMP_A_EMAIL,
      permissions: ["jobs"],
      granularPermissions: { jobs: { view: true, edit: true, delete: false } },
    });
    await setDoc(doc(db, "automations", "auto_a"), automation(BIZ_A, { id: "auto_a", enabled: true }));
    await setDoc(doc(db, "automations", "auto_b"), automation(BIZ_B, { id: "auto_b", enabled: true }));
    await setDoc(doc(db, "automation_runs", "auto_a__estimate.accepted:est_1"), run(BIZ_A, "auto_a", { status: "Completed" }));
    await setDoc(doc(db, "automation_runs", "auto_b__estimate.accepted:est_9"), run(BIZ_B, "auto_b", { status: "Completed", eventKey: "estimate.accepted:est_9" }));
  });
});

const ctx = (uid: string, email: string) => testEnv.authenticatedContext(uid, { email }).firestore();

describe("automations: tenant isolation", () => {
  test("owner reads their own automations (also after a fresh sign-in)", async () => {
    await assertSucceeds(getDoc(doc(ctx(OWNER_A_UID, BIZ_A), "automations", "auto_a")));
    // A brand-new authenticated context = logout/login: the saved automation is still there.
    const snap = await getDoc(doc(ctx(OWNER_A_UID, BIZ_A), "automations", "auto_a"));
    expect(snap.data()?.name).toBe("Estimate Accepted → Create Job");
    expect(snap.data()?.enabled).toBe(true);
  });

  test("owner cannot read another business's automation", async () => {
    await assertFails(getDoc(doc(ctx(OWNER_A_UID, BIZ_A), "automations", "auto_b")));
  });

  test("listing is scoped to the caller's own business", async () => {
    const db = ctx(OWNER_A_UID, BIZ_A);
    await assertSucceeds(getDocs(query(collection(db, "automations"), where("businessId", "==", BIZ_A))));
    await assertFails(getDocs(query(collection(db, "automations"), where("businessId", "==", BIZ_B))));
    await assertFails(getDocs(collection(db, "automations")));
  });

  test("an employee can read (to run) but not edit their business's automations without the Automations permission", async () => {
    const db = ctx(EMP_A_UID, EMP_A_EMAIL);
    await assertSucceeds(getDoc(doc(db, "automations", "auto_a")));
    await assertFails(updateDoc(doc(db, "automations", "auto_a"), { name: "Renamed" }));
    await assertFails(setDoc(doc(db, "automations", "auto_new"), automation(BIZ_A, { id: "auto_new" })));
    await assertFails(deleteDoc(doc(db, "automations", "auto_a")));
  });

  test("owner cannot create, edit, enable, or delete another business's automation", async () => {
    const db = ctx(OWNER_A_UID, BIZ_A);
    await assertFails(setDoc(doc(db, "automations", "auto_spoof"), automation(BIZ_B, { id: "auto_spoof" })));
    await assertFails(updateDoc(doc(db, "automations", "auto_b"), { enabled: false }));
    await assertFails(setDoc(doc(db, "automations", "auto_b"), automation(BIZ_A, { id: "auto_b" })));
    await assertFails(deleteDoc(doc(db, "automations", "auto_b")));
  });

  test("businessId can't be moved to another tenant on update", async () => {
    const db = ctx(OWNER_A_UID, BIZ_A);
    await assertFails(updateDoc(doc(db, "automations", "auto_a"), { businessId: BIZ_B }));
  });

  test("new automations must be saved OFF", async () => {
    const db = ctx(OWNER_A_UID, BIZ_A);
    await assertFails(setDoc(doc(db, "automations", "auto_on"), automation(BIZ_A, { id: "auto_on", enabled: true })));
    await assertSucceeds(setDoc(doc(db, "automations", "auto_off"), automation(BIZ_A, { id: "auto_off" })));
    await assertSucceeds(updateDoc(doc(db, "automations", "auto_off"), { enabled: true, enabledAt: "2026-10-02T00:00:00.000Z" }));
  });

  test("actions outside the safe allowlist are rejected", async () => {
    const db = ctx(OWNER_A_UID, BIZ_A);
    for (const bad of ["issue_refund", "delete_record", "charge_card", "change_price"]) {
      await assertFails(setDoc(doc(db, "automations", `auto_${bad}`), automation(BIZ_A, {
        id: `auto_${bad}`,
        actions: [{ id: "a", type: bad }],
        actionTypes: [bad],
      })));
    }
    // actionTypes must describe every action (can't hide a bad one).
    await assertFails(setDoc(doc(db, "automations", "auto_hidden"), automation(BIZ_A, {
      id: "auto_hidden",
      actions: [{ id: "a", type: "create_job" }, { id: "b", type: "issue_refund" }],
      actionTypes: ["create_job"],
    })));
    await assertFails(updateDoc(doc(db, "automations", "auto_a"), { actions: [{ id: "a", type: "issue_refund" }], actionTypes: ["issue_refund"] }));
  });

  test("any member may record last-run fields on their own business's automation, nothing more", async () => {
    const emp = ctx(EMP_A_UID, EMP_A_EMAIL);
    await assertSucceeds(updateDoc(doc(emp, "automations", "auto_a"), { lastRunAt: "2026-10-02T00:00:00.000Z", lastRunStatus: "Completed", lastRunSummary: "ok" }));
    await assertFails(updateDoc(doc(emp, "automations", "auto_a"), { lastRunStatus: "Completed", enabled: false }));
    await assertFails(updateDoc(doc(ctx(OWNER_A_UID, BIZ_A), "automations", "auto_b"), { lastRunStatus: "Failed" }));
  });
});

describe("automation_runs: idempotency + tenant isolation", () => {
  test("a run can be claimed once; a replay finds it already claimed", async () => {
    const db = ctx(OWNER_A_UID, BIZ_A);
    const ref = doc(db, "automation_runs", "auto_a__estimate.accepted:est_2");
    const claim = () => runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (snap.exists()) return false;
      tx.set(ref, run(BIZ_A, "auto_a", { eventKey: "estimate.accepted:est_2", sourceRecordId: "est_2" }));
      return true;
    });
    expect(await claim()).toBe(true);
    expect(await claim()).toBe(false);
    // A blind re-create (overwrite) of the existing run is an update the rules refuse.
    await assertFails(setDoc(ref, run(BIZ_A, "auto_a", { eventKey: "estimate.accepted:est_2", sourceRecordId: "est_2" })));
  });

  test("a finished run is append-only: can't be re-opened, rewritten, or deleted", async () => {
    const db = ctx(OWNER_A_UID, BIZ_A);
    const ref = doc(db, "automation_runs", "auto_a__estimate.accepted:est_1");
    await assertFails(updateDoc(ref, { status: "Running" }));
    await assertFails(updateDoc(ref, { status: "Failed" }));
    await assertFails(deleteDoc(ref));
  });

  test("a Running run can be finished, but its identity fields can't change", async () => {
    const db = ctx(EMP_A_UID, EMP_A_EMAIL);
    const ref = doc(db, "automation_runs", "auto_a__estimate.accepted:est_3");
    await assertSucceeds(setDoc(ref, run(BIZ_A, "auto_a", { eventKey: "estimate.accepted:est_3", sourceRecordId: "est_3" })));
    await assertFails(updateDoc(ref, { status: "Completed", sourceRecordId: "est_other" }));
    await assertSucceeds(updateDoc(ref, { status: "Completed", completedActions: 1, finishedAt: "2026-10-01T00:00:01.000Z" }));
  });

  test("cannot log runs for another business's automation, or squat on its run ids", async () => {
    const db = ctx(OWNER_A_UID, BIZ_A);
    await assertFails(setDoc(doc(db, "automation_runs", "auto_b__estimate.accepted:est_5"), run(BIZ_B, "auto_b")));
    await assertFails(setDoc(doc(db, "automation_runs", "auto_b__estimate.accepted:est_5"), run(BIZ_A, "auto_b")));
    // A run id must belong to the automation it names.
    await assertFails(setDoc(doc(db, "automation_runs", "auto_b__estimate.accepted:est_6"), run(BIZ_A, "auto_a")));
  });

  test("history of another business can't be read or listed", async () => {
    const db = ctx(OWNER_A_UID, BIZ_A);
    await assertSucceeds(getDoc(doc(db, "automation_runs", "auto_a__estimate.accepted:est_1")));
    await assertFails(getDoc(doc(db, "automation_runs", "auto_b__estimate.accepted:est_9")));
    await assertSucceeds(getDocs(query(collection(db, "automation_runs"), where("businessId", "==", BIZ_A), where("automationId", "==", "auto_a"))));
    await assertFails(getDocs(query(collection(db, "automation_runs"), where("businessId", "==", BIZ_B), where("automationId", "==", "auto_b"))));
  });

  test("another business's run can't be finished or tampered with", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "automation_runs", "auto_b__estimate.accepted:est_10"), run(BIZ_B, "auto_b", { eventKey: "estimate.accepted:est_10" }));
    });
    const db = ctx(OWNER_A_UID, BIZ_A);
    await assertFails(updateDoc(doc(db, "automation_runs", "auto_b__estimate.accepted:est_10"), { status: "Completed" }));
  });

  test("unauthenticated callers get nothing", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "automations", "auto_a")));
    await assertFails(getDoc(doc(db, "automation_runs", "auto_a__estimate.accepted:est_1")));
  });
});
