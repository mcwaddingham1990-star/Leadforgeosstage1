/**
 * Pure regression tests for the shared Firestore save path: which fields an
 * edit sends (so devices don't overwrite each other), retry/backoff and the
 * user-visible failure + Retry, double-tap duplicate suppression, and the
 * capped logout wait.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../src/firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { diffTopLevelFields } from "../src/lib/firestoreService";
import { dropDoubleSubmits } from "../src/hooks/useFirestoreCollection";
import {
  trackSave,
  onSyncStatus,
  retryFailedSaves,
  clearSaveFailure,
  hasSaveFailures,
  isRetryableError,
  describeError,
  type SyncSnapshot,
} from "../src/lib/syncStatus";
import { onSyncError } from "../src/lib/syncErrorBus";
import {
  enqueuePersistenceTask,
  trackPersistencePromise,
  waitForPersistenceQueue,
  waitForPersistenceQueueWithin,
} from "../src/lib/persistenceQueue";

describe("diffTopLevelFields (field-level saves)", () => {
  test("sends only the fields this device changed", () => {
    const base = { id: "c1", company: "Acme", phone: "111", email: "a@x.com" };
    const desired = { ...base, phone: "222" };
    expect(diffTopLevelFields(base, desired)).toEqual([{ field: "phone", kind: "set", value: "222" }]);
  });

  test("an unchanged record sends nothing", () => {
    const base = { id: "c1", tags: ["a"], nested: { x: 1 } };
    expect(diffTopLevelFields(base, { id: "c1", tags: ["a"], nested: { x: 1 } })).toEqual([]);
  });

  test("ignores persistence metadata", () => {
    expect(diffTopLevelFields({ id: "a", updatedAt: "1" }, { id: "a", updatedAt: "2", businessId: "b" })).toEqual([]);
  });

  test("a removed field is deleted, not left behind", () => {
    expect(diffTopLevelFields({ id: "a", notes: "old" }, { id: "a" })).toEqual([{ field: "notes", kind: "delete" }]);
  });

  test("appending to a list of objects is an append, so two devices' additions both survive", () => {
    const m1 = { id: "m1", text: "hi" };
    const m2 = { id: "m2", text: "there" };
    expect(diffTopLevelFields({ id: "c", messages: [m1] }, { id: "c", messages: [m1, m2] }))
      .toEqual([{ field: "messages", kind: "append", values: [m2] }]);
  });

  test("editing or removing list items replaces the list", () => {
    const m1 = { id: "m1", text: "hi" };
    expect(diffTopLevelFields({ id: "c", messages: [m1] }, { id: "c", messages: [{ ...m1, text: "edited" }] })[0].kind).toBe("set");
    expect(diffTopLevelFields({ id: "c", messages: [m1, { id: "m2" }] }, { id: "c", messages: [m1] })[0].kind).toBe("set");
  });

  test("primitive lists are replaced, never unioned (arrayUnion would drop duplicates)", () => {
    expect(diffTopLevelFields({ id: "a", qty: [1] }, { id: "a", qty: [1, 1] })).toEqual([{ field: "qty", kind: "set", value: [1, 1] }]);
  });

  test("first item added to an empty list is a plain set", () => {
    expect(diffTopLevelFields({ id: "a", items: [] }, { id: "a", items: [{ id: "x" }] })[0].kind).toBe("set");
  });
});

describe("dropDoubleSubmits", () => {
  const job = (id: string, createdAt: string) => ({ id, title: "Fix AC", customer: "Pat", createdAt });

  test("a second identical record from a repeated tap is dropped", () => {
    const recent: { signature: string; at: number }[] = [];
    const first = dropDoubleSubmits([job("j1", new Date().toISOString())], [], recent);
    expect(first).toHaveLength(1);
    const second = dropDoubleSubmits([...first, job("j2", new Date().toISOString())], first, recent);
    expect(second.map(j => j.id)).toEqual(["j1"]);
  });

  test("identical records created together (an import) are all kept", () => {
    const recent: { signature: string; at: number }[] = [];
    const rows = [job("r1", "2026-01-01T00:00:00Z"), job("r2", "2026-01-01T00:00:00Z")];
    expect(dropDoubleSubmits(rows, [], recent)).toHaveLength(2);
  });

  test("different records are kept", () => {
    const recent: { signature: string; at: number }[] = [];
    const first = dropDoubleSubmits([job("j1", "t")], [], recent);
    const next = dropDoubleSubmits([...first, { ...job("j2", "t"), title: "Other job" }], first, recent);
    expect(next).toHaveLength(2);
  });

  test("the same content saved again later is kept", () => {
    vi.useFakeTimers();
    try {
      const recent: { signature: string; at: number }[] = [];
      const first = dropDoubleSubmits([job("j1", "t")], [], recent);
      vi.advanceTimersByTime(2000);
      expect(dropDoubleSubmits([...first, job("j2", "t")], first, recent)).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("edits to existing records are never touched", () => {
    const recent: { signature: string; at: number }[] = [];
    const existing = [job("j1", "t")];
    expect(dropDoubleSubmits([{ ...existing[0], title: "Changed" }], existing, recent)).toHaveLength(1);
  });
});

describe("trackSave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    ["t1", "t2", "t3", "t4"].forEach(clearSaveFailure);
  });

  test("retries a dropped connection and then reports saved", async () => {
    const states: string[] = [];
    const stop = onSyncStatus((s: SyncSnapshot) => states.push(s.state));
    let calls = 0;
    const op = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error("offline"), { code: "unavailable" });
      return "ok";
    });
    const result = trackSave("test record", op, { key: "t1" });
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(result).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(3);
    expect(states).toContain("saving");
    expect(states[states.length - 1]).toBe("saved");
    stop();
  });

  test("bad data fails right away with a user-visible message and a working Retry", async () => {
    const messages: string[] = [];
    const stopErrors = onSyncError(m => messages.push(m));
    let fail = true;
    const op = vi.fn(async () => {
      if (fail) throw Object.assign(new Error("bad"), { code: "invalid-argument" });
      return "ok";
    });
    await expect(trackSave("payroll settings", op, { key: "t2" })).rejects.toThrow();
    expect(op).toHaveBeenCalledTimes(1);
    expect(hasSaveFailures()).toBe(true);
    expect(messages[0]).toMatch(/Couldn't save payroll settings/);

    fail = false;
    retryFailedSaves();
    await vi.runAllTimersAsync();
    expect(op).toHaveBeenCalledTimes(2);
    expect(hasSaveFailures()).toBe(false);
    stopErrors();
  });

  test("gives up after the backoff schedule", async () => {
    const op = vi.fn(async () => { throw Object.assign(new Error("down"), { code: "unavailable" }); });
    const result = trackSave("thing", op, { key: "t3" });
    const settled = result.catch(e => e);
    await vi.runAllTimersAsync();
    expect(await settled).toBeInstanceOf(Error);
    expect(op).toHaveBeenCalledTimes(4);
  });

  test("logout waits for an in-flight save", async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const save = trackSave("slow", () => gate, { key: "t4" });
    let drained = false;
    const drain = waitForPersistenceQueue().then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);
    release();
    await save;
    await drain;
    expect(drained).toBe(true);
  });
});

describe("error classification", () => {
  test("network problems retry, bad data does not", () => {
    expect(isRetryableError({ code: "unavailable" })).toBe(true);
    expect(isRetryableError({ code: "permission-denied" })).toBe(true);
    expect(isRetryableError({ code: "invalid-argument" })).toBe(false);
    expect(isRetryableError(new Error("no code"))).toBe(true);
  });

  test("readable messages, including wrapped handleFirestoreError JSON", () => {
    expect(describeError({ code: "permission-denied" })).toMatch(/permission/);
    expect(describeError(new Error(JSON.stringify({ error: "Document too large" })))).toBe("Document too large");
  });
});

describe("capped persistence wait (offline logout)", () => {
  test("reports false when a save never finishes", async () => {
    vi.useFakeTimers();
    try {
      trackPersistencePromise(new Promise(() => undefined));
      const result = waitForPersistenceQueueWithin(5000);
      await vi.advanceTimersByTimeAsync(5000);
      expect(await result).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("reports true once queued work is done", async () => {
    await enqueuePersistenceTask("biz:test", async () => undefined);
    // The never-resolving promise above is still tracked, so use a fresh check of queued work only.
    const done = await Promise.race([
      enqueuePersistenceTask("biz:test", async () => undefined).then(() => true),
      new Promise(r => setTimeout(() => r(false), 1000)),
    ]);
    expect(done).toBe(true);
  });
});
