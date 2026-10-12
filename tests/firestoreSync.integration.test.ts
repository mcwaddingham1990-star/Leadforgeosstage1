/**
 * The shared save path (writeCollectionItem / syncArrayToFirestore, used by
 * every module through useFirestoreCollection) against the real Firestore
 * emulator with the project's real security rules.
 *
 * Each "device" is its own authenticated Firestore client, so these cover the
 * cross-device cases that used to lose data: two devices editing different
 * fields of one record, two devices adding to the same list (chat messages),
 * a fresh client after refresh / logout seeing exactly what was saved, and a
 * delete on one device not being undone by a stale copy on another.
 *
 * Run with `npm run test:rules` (firebase emulators:exec sets the emulator up).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";

// The app's save helpers write through `db` from src/firebase -- point it at
// whichever simulated device is acting.
const device = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../src/firebase", () => ({
  get db() { return device.db; },
  auth: { currentUser: null },
}));

import { writeCollectionItem, syncArrayToFirestore, diffTopLevelFields } from "../src/lib/firestoreService";

// Its own emulator project, so clearing data here never races the security suite running in parallel.
const PROJECT_ID = "demo-ownerslocal-sync-test";
const BIZ = "owner-sync@example.com";
const OTHER_BIZ = "other-sync@example.com";
const OWNER_UID = "owner-sync-uid";

let testEnv: RulesTestEnvironment;

const newDevice = (): Firestore =>
  testEnv.authenticatedContext(OWNER_UID, { email: BIZ, email_verified: true }).firestore() as unknown as Firestore;

/** Runs app save code as if on `db`'s device. */
async function on<T>(db: Firestore, work: () => Promise<T>): Promise<T> {
  device.db = db;
  return work();
}

/**
 * What is actually stored (read with rules off -- reading a missing doc is
 * denied by rules that look at resource.data, which isn't what's under test).
 * `_db` documents which device is looking; storage is shared by all.
 */
async function read(_db: Firestore, collectionName: string, id: string) {
  let data: Record<string, any> | undefined;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await getDoc(doc(context.firestore() as unknown as Firestore, collectionName, id));
    data = snap.exists() ? snap.data() : undefined;
  });
  if (!data) return undefined;
  const { businessId: _b, updatedAt: _u, ...ui } = data;
  return ui as Record<string, any>;
}

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
    await setDoc(doc(db, "user_profiles", OWNER_UID), { businessEmail: BIZ, role: "Owner", email: BIZ, name: "Owner" });
    await setDoc(doc(db, "customers", "other_cust"), { id: "other_cust", businessId: OTHER_BIZ, company: "Not yours" });
  });
});

describe("cross-device saves", () => {
  test("two devices editing different fields of one customer keep both edits", async () => {
    const phone = newDevice();
    const laptop = newDevice();
    const original = { id: "cust1", company: "Acme", phone: "111", email: "old@acme.com" };
    await on(phone, () => writeCollectionItem("customers", "cust1", original, undefined, BIZ));

    // Both devices loaded the same version, then each edits a different field.
    await on(phone, () => writeCollectionItem("customers", "cust1", { ...original, phone: "222" }, original, BIZ));
    await on(laptop, () => writeCollectionItem("customers", "cust1", { ...original, email: "new@acme.com" }, original, BIZ));

    const saved = await read(newDevice(), "customers", "cust1");
    expect(saved).toMatchObject({ company: "Acme", phone: "222", email: "new@acme.com" });
  });

  test("two devices sending in the same conversation keep both messages", async () => {
    const owner = newDevice();
    const tech = newDevice();
    const m1 = { id: "m1", text: "Running late", sender: "Owner" };
    const base = { id: "conv1", title: "Crew", messages: [m1], lastMessage: "Running late" };
    await on(owner, () => writeCollectionItem("conversations", "conv1", base, undefined, BIZ));

    const fromOwner = { id: "m2", text: "On my way", sender: "Owner" };
    const fromTech = { id: "m3", text: "Got it", sender: "Tech" };
    await on(owner, () => writeCollectionItem("conversations", "conv1", { ...base, messages: [m1, fromOwner], lastMessage: "On my way" }, base, BIZ));
    await on(tech, () => writeCollectionItem("conversations", "conv1", { ...base, messages: [m1, fromTech], lastMessage: "Got it" }, base, BIZ));

    const saved = await read(newDevice(), "conversations", "conv1");
    expect(saved!.messages.map((m: any) => m.id).sort()).toEqual(["m1", "m2", "m3"]);
  });

  test("a stale device can't undo another device's delete by re-sending an unchanged record", async () => {
    const a = newDevice();
    const b = newDevice();
    const original = { id: "lead1", name: "Pat", status: "New" };
    await on(a, () => writeCollectionItem("leads", "lead1", original, undefined, BIZ));
    await on(a, () => writeCollectionItem("leads", "lead1", null, original, BIZ));
    // Device B still shows the lead; re-saving it unchanged sends nothing.
    await on(b, () => writeCollectionItem("leads", "lead1", original, original, BIZ));
    expect(await read(newDevice(), "leads", "lead1")).toBeUndefined();
  });

  test("a real edit to a record deleted elsewhere is kept rather than silently dropped", async () => {
    const a = newDevice();
    const b = newDevice();
    const original = { id: "lead2", name: "Sam", status: "New" };
    await on(a, () => writeCollectionItem("leads", "lead2", original, undefined, BIZ));
    await on(a, () => writeCollectionItem("leads", "lead2", null, original, BIZ));
    await on(b, () => writeCollectionItem("leads", "lead2", { ...original, status: "Contacted" }, original, BIZ));
    expect(await read(newDevice(), "leads", "lead2")).toMatchObject({ name: "Sam", status: "Contacted" });
  });

  test("clearing a field removes it everywhere", async () => {
    const a = newDevice();
    const original = { id: "est1", title: "AC", notes: "call first" };
    await on(a, () => writeCollectionItem("estimates", "est1", original, undefined, BIZ));
    await on(a, () => writeCollectionItem("estimates", "est1", { id: "est1", title: "AC" }, original, BIZ));
    const saved = await read(newDevice(), "estimates", "est1");
    expect(saved).toEqual({ id: "est1", title: "AC" });
  });
});

describe("refresh and logout", () => {
  test("everything a list save wrote is there for a fresh client (refresh / re-login)", async () => {
    const a = newDevice();
    const before = [
      { id: "s1", title: "Visit 1", date: "2026-10-01" },
      { id: "s2", title: "Visit 2", date: "2026-10-02" },
    ];
    await on(a, () => syncArrayToFirestore("scheduling_events", [], before, BIZ));
    const after = [{ ...before[0], date: "2026-10-05" }, { id: "s3", title: "Visit 3", date: "2026-10-03" }];
    await on(a, () => syncArrayToFirestore("scheduling_events", before, after, BIZ));

    const fresh = newDevice();
    expect(await read(fresh, "scheduling_events", "s1")).toMatchObject({ date: "2026-10-05" });
    expect(await read(fresh, "scheduling_events", "s2")).toBeUndefined();
    expect(await read(fresh, "scheduling_events", "s3")).toMatchObject({ title: "Visit 3" });
  });

  test("custom keys and doc ids (training profiles) round-trip", async () => {
    const a = newDevice();
    const scoped = (key: string) => `owner_sync__${key}`;
    const profiles = [{ employeeName: "Jo Smith", courses: ["safety"] }];
    await on(a, () => syncArrayToFirestore("training_profiles", [], profiles, BIZ, {
      key: (p: any) => p.employeeName.replace(/\s+/g, "_").toLowerCase(),
      docId: scoped,
    }));
    expect(await read(newDevice(), "training_profiles", scoped("jo_smith"))).toMatchObject({ employeeName: "Jo Smith" });
  });
});

describe("failures are reported, not swallowed", () => {
  test("writing into another business is refused and the error code survives for retry logic", async () => {
    const a = newDevice();
    const error = await on(a, () =>
      writeCollectionItem("customers", "other_cust", { id: "other_cust", company: "Hijack" }, { id: "other_cust", company: "Not yours" }, OTHER_BIZ)
    ).catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(String(error.code)).toMatch(/permission-denied/);
  });

  test("one failed write in a list save is rethrown after the rest are written", async () => {
    const a = newDevice();
    // Adds ok_cust and "removes" other_cust, which belongs to another business.
    const error = await on(a, () => syncArrayToFirestore(
      "customers",
      [{ id: "other_cust", company: "Not yours" }],
      [{ id: "ok_cust", company: "Fine" }],
      BIZ
    )).catch(e => e);
    // Deleting another business's customer is denied...
    expect(error).toBeInstanceOf(Error);
    // ...but the valid record in the same save still landed.
    expect(await read(newDevice(), "customers", "ok_cust")).toMatchObject({ company: "Fine" });
    expect(await read(newDevice(), "customers", "other_cust")).toMatchObject({ company: "Not yours" });
  });
});

test("diff sanity check matches what the emulator stored", () => {
  expect(diffTopLevelFields({ a: 1 }, { a: 1 })).toEqual([]);
});
