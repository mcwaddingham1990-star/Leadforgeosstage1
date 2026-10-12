/**
 * Backend permission enforcement (server/authz.ts + server/rosterAdmin.ts)
 * against the Firestore emulator through the Admin SDK: the requirePermission
 * middleware and the roster endpoints, run exactly as server.ts wires them.
 *
 * Covers: Owner unrestricted; delegated roster admin (Office Manager) limited
 * to what they have themselves; Manager/Employee without Roster refused;
 * no self-escalation, no Owner role, no editing someone more powerful, and
 * nothing across businesses. Also the money endpoints' role gates.
 *
 * Run with `npm run test:rules` (firebase emulators:exec).
 */
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { generateKeyPairSync } from "node:crypto";

const PROJECT_ID = "demo-ownerslocal-roster-api";
const BIZ = "owner@biz.example";
const OTHER = "owner@other.example";

const flags = (view: boolean, edit: boolean, del: boolean) => ({ view, edit, delete: del });

let authz: typeof import("../server/authz");
let roster: typeof import("../server/rosterAdmin");
let db: import("firebase-admin/firestore").Firestore;

const USERS = {
  owner: { uid: "owner-uid", email: BIZ },
  office: { uid: "office-uid", email: "office@biz.example" },
  manager: { uid: "manager-uid", email: "manager@biz.example" },
  tech: { uid: "tech-uid", email: "tech@biz.example" },
  gm: { uid: "gm-uid", email: "gm@biz.example" },
  otherOwner: { uid: "other-owner-uid", email: OTHER },
  otherTech: { uid: "other-tech-uid", email: "tech@other.example" },
};

const PROFILES: Record<string, Record<string, unknown>> = {
  "owner-uid": { businessEmail: BIZ, role: "Owner", email: BIZ },
  "office-uid": {
    businessEmail: BIZ, role: "Office Manager", email: "office@biz.example", isEmployee: true,
    granularPermissions: { roster: flags(true, true, false), customers: flags(true, true, true), jobs: flags(true, true, false), payments: flags(true, false, false) },
  },
  "manager-uid": {
    businessEmail: BIZ, role: "Operations Manager", email: "manager@biz.example", isEmployee: true,
    granularPermissions: { scheduling: flags(true, true, false), jobs: flags(true, true, false) },
  },
  "tech-uid": {
    businessEmail: BIZ, role: "Technician", email: "tech@biz.example", isEmployee: true,
    granularPermissions: { jobs: flags(true, true, false) },
  },
  "gm-uid": {
    businessEmail: BIZ, role: "General Manager", email: "gm@biz.example", isEmployee: true,
    granularPermissions: { roster: flags(true, true, true), accounting: flags(true, true, true), payroll: flags(true, true, false) },
  },
  "other-owner-uid": { businessEmail: OTHER, role: "Owner", email: OTHER },
  "other-tech-uid": { businessEmail: OTHER, role: "Technician", email: "tech@other.example", isEmployee: true, granularPermissions: { roster: flags(true, true, true) } },
};

type Result = { status: number; body: any };

/** Runs middleware + handler like Express would. */
async function call(
  user: { uid: string; email: string },
  checks: Parameters<typeof import("../server/authz").requirePermission>[0],
  handler: (req: any, res: any) => Promise<void> | void,
  body: unknown = {}
): Promise<Result> {
  const result: Result = { status: 200, body: undefined };
  const req: any = { firebaseUser: user, body, headers: {} };
  const res: any = {
    status(code: number) { result.status = code; return res; },
    json(payload: unknown) { result.body = payload; return res; },
  };
  let nextCalled = false;
  await authz.requirePermission(checks)(req, res, () => { nextCalled = true; });
  if (nextCalled) await handler(req, res);
  return result;
}

const ok = (_req: any, res: any) => { res.json({ reached: true }); };

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run test:rules` (needs the Firestore emulator).");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ type: "service_account", project_id: PROJECT_ID, private_key: privateKey, client_email: `test@${PROJECT_ID}.iam.gserviceaccount.com` });
  process.env.FIREBASE_DATABASE_ID = "(default)";
  authz = await import("../server/authz");
  roster = await import("../server/rosterAdmin");
  db = authz.getAuthzDb()!;
});

beforeEach(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
  const batch = db.batch();
  for (const [uid, profile] of Object.entries(PROFILES)) batch.set(db.collection("user_profiles").doc(uid), profile);
  for (const key of ["office", "manager", "tech", "gm", "otherTech"] as const) {
    const user = USERS[key];
    const profile = PROFILES[user.uid];
    batch.set(db.collection("employees").doc(user.email), {
      email: user.email, userUid: user.uid, businessEmail: profile.businessEmail, businessId: profile.businessEmail,
      role: profile.role, granularPermissions: profile.granularPermissions,
    });
  }
  await batch.commit();
});

describe("requirePermission gate (money and admin endpoints)", () => {
  test("Owner passes every gate", async () => {
    for (const checks of [[["payments", "edit"]], [["billing", "edit"]], [["roster", "edit"]], [["payroll", "edit"]]] as const) {
      expect((await call(USERS.owner, checks as any, ok)).body).toEqual({ reached: true });
    }
    expect((await call(USERS.owner, "owner", ok)).status).toBe(200);
  });

  test("an employee is refused payments/billing/roster they weren't granted", async () => {
    for (const checks of [[["payments", "edit"]], [["billing", "edit"]], [["billing", "view"]], [["roster", "edit"]]] as const) {
      const result = await call(USERS.tech, checks as any, ok);
      expect(result.status).toBe(403);
    }
  });

  test("view-only Payments isn't enough to open the payouts account", async () => {
    expect((await call(USERS.office, [["payments", "edit"]], ok)).status).toBe(403);
  });

  test("granted permissions pass", async () => {
    expect((await call(USERS.office, [["customers", "edit"]], ok)).status).toBe(200);
    expect((await call(USERS.gm, [["payroll", "edit"]], ok)).status).toBe(200);
  });

  test("a manager title grants nothing by itself", async () => {
    expect((await call(USERS.manager, [["customers", "edit"]], ok)).status).toBe(403);
    expect((await call(USERS.office, "owner", ok)).status).toBe(403);
  });

  test("an account with no business is refused", async () => {
    expect((await call({ uid: "nobody", email: "nobody@x.example" }, "member", ok)).status).toBe(403);
  });
});

describe("POST /api/roster/employee-access", () => {
  const update = (user: { uid: string; email: string }, body: unknown) =>
    call(user, [["roster", "edit"]], roster.handleUpdateEmployeeAccess, body);

  test("Owner can grant anything", async () => {
    const result = await update(USERS.owner, { employeeEmail: USERS.tech.email, role: "Lead Tech", granularPermissions: { payroll: flags(true, true, true), jobs: flags(true, true, true) } });
    expect(result.status).toBe(200);
    const profile = (await db.collection("user_profiles").doc(USERS.tech.uid).get()).data()!;
    expect(profile.granularPermissions.payroll).toEqual(flags(true, true, true));
    expect(profile.role).toBe("Lead Tech");
    expect(profile.permissions.sort()).toEqual(["jobs", "payroll"]);
  });

  test("Office Manager can grant what they have", async () => {
    const result = await update(USERS.office, { employeeEmail: USERS.tech.email, role: "Technician", granularPermissions: { jobs: flags(true, true, false), customers: flags(true, false, false) } });
    expect(result.status).toBe(200);
    const employee = (await db.collection("employees").doc(USERS.tech.email).get()).data()!;
    expect(employee.granularPermissions.customers).toEqual(flags(true, false, false));
  });

  test("NO ESCALATION: Office Manager can't grant what they don't have", async () => {
    for (const granularPermissions of [
      { payroll: flags(true, false, false) },
      { jobs: flags(true, true, true) },          // jobs delete not held
      { payments: flags(true, true, false) },     // payments only view
    ]) {
      const result = await update(USERS.office, { employeeEmail: USERS.tech.email, role: "Technician", granularPermissions });
      expect(result.status).toBe(403);
      expect(result.body.error).toMatch(/only grant access you have yourself/);
    }
    const profile = (await db.collection("user_profiles").doc(USERS.tech.uid).get()).data()!;
    expect(profile.granularPermissions).toEqual(PROFILES["tech-uid"].granularPermissions);
  });

  test("NO ESCALATION: can't make anyone an Owner", async () => {
    const result = await update(USERS.office, { employeeEmail: USERS.tech.email, role: "Owner", granularPermissions: {} });
    expect(result.status).toBe(403);
  });

  test("NO ESCALATION: can't change their own access", async () => {
    const result = await update(USERS.office, { employeeEmail: USERS.office.email, role: "Office Manager", granularPermissions: { roster: flags(true, true, false) } });
    expect(result.status).toBe(403);
  });

  test("can't change access for someone more powerful", async () => {
    const result = await update(USERS.office, { employeeEmail: USERS.gm.email, role: "Technician", granularPermissions: {} });
    expect(result.status).toBe(403);
    expect(result.body.error).toMatch(/only the Owner can change it/);
  });

  test("can't touch another business's employee (and doesn't reveal they exist)", async () => {
    const result = await update(USERS.office, { employeeEmail: USERS.otherTech.email, role: "Technician", granularPermissions: {} });
    expect(result.status).toBe(404);
    const otherTech = (await db.collection("user_profiles").doc(USERS.otherTech.uid).get()).data()!;
    expect(otherTech.businessEmail).toBe(OTHER);
  });

  test("roles without Roster edit never reach the handler", async () => {
    const result = await update(USERS.manager, { employeeEmail: USERS.tech.email, role: "Technician", granularPermissions: {} });
    expect(result.status).toBe(403);
  });

  test("the Owner's access can't be edited through it", async () => {
    await db.collection("employees").doc(BIZ).set({ email: BIZ, businessEmail: BIZ, userUid: "owner-uid", role: "Owner" });
    expect((await update(USERS.gm, { employeeEmail: BIZ, role: "Technician", granularPermissions: {} })).status).toBe(403);
  });
});

describe("POST /api/roster/invites", () => {
  const invite = (user: { uid: string; email: string }, invites: unknown[]) =>
    call(user, [["roster", "edit"]], roster.handleCreateEmployeeInvites, { invites });

  test("a delegate's invite within their own access is created in their business", async () => {
    const result = await invite(USERS.office, [{ role: "Technician", granularPermissions: { jobs: flags(true, true, false) } }]);
    expect(result.status).toBe(200);
    const [{ code }] = result.body.invites;
    const saved = (await db.collection("employee_invites").doc(code).get()).data()!;
    expect(saved).toMatchObject({ businessEmail: BIZ, role: "Technician", status: "pending", permissions: ["jobs"] });
  });

  test("NO ESCALATION: a delegate can't invite someone with more access than they have", async () => {
    const result = await invite(USERS.office, [{ role: "Accountant", granularPermissions: { accounting: flags(true, true, true) } }]);
    expect(result.status).toBe(403);
    expect((await db.collection("employee_invites").get()).size).toBe(0);
  });

  test("NO ESCALATION: a delegate can't invite an Owner", async () => {
    expect((await invite(USERS.office, [{ role: "Owner", granularPermissions: {} }])).status).toBe(403);
  });

  test("one bad invite in a batch stops the whole batch", async () => {
    const result = await invite(USERS.office, [
      { role: "Technician", granularPermissions: { jobs: flags(true, false, false) } },
      { role: "Payroll", granularPermissions: { payroll: flags(true, true, true) } },
    ]);
    expect(result.status).toBe(403);
    expect((await db.collection("employee_invites").get()).size).toBe(0);
  });

  test("garbage permission values are normalized, not trusted", async () => {
    const result = await invite(USERS.office, [{ role: "Technician", granularPermissions: { jobs: "delete", "../evil": flags(true, true, true) } }]);
    // "delete" means view+edit+delete -- the delegate lacks jobs delete.
    expect(result.status).toBe(403);
  });

  test("a delegate from another business only ever creates invites for their own business", async () => {
    const result = await invite(USERS.otherTech, [{ role: "Technician", granularPermissions: { roster: flags(true, false, false) } }]);
    expect(result.status).toBe(200);
    const saved = (await db.collection("employee_invites").doc(result.body.invites[0].code).get()).data()!;
    expect(saved.businessEmail).toBe(OTHER);
  });
});
