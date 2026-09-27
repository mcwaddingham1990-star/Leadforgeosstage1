import { describe, expect, test } from "vitest";
import {
  enqueuePersistenceTask,
  hasPendingPersistenceTasks,
  waitForPersistenceQueue,
} from "../src/lib/persistenceQueue";

describe("persistence queue", () => {
  test("serializes saves for the same collection key", async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = enqueuePersistenceTask("biz-a:leads", async () => {
      events.push("first-start");
      await gate;
      events.push("first-end");
    });

    const second = enqueuePersistenceTask("biz-a:leads", async () => {
      events.push("second-start");
      events.push("second-end");
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(["first-start"]);

    releaseFirst();
    await Promise.all([first, second]);

    expect(events).toEqual([
      "first-start",
      "first-end",
      "second-start",
      "second-end",
    ]);
  });

  test("logout-style drain waits for queued work to finish", async () => {
    let persisted = false;
    let releaseSave!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });

    void enqueuePersistenceTask("biz-a:estimates", async () => {
      await gate;
      persisted = true;
    });

    let drainFinished = false;
    const drain = waitForPersistenceQueue().then(() => {
      drainFinished = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(hasPendingPersistenceTasks()).toBe(true);
    expect(drainFinished).toBe(false);

    releaseSave();
    await drain;

    expect(persisted).toBe(true);
    expect(hasPendingPersistenceTasks()).toBe(false);
  });

  test("one failed save does not block the next save for that collection", async () => {
    const events: string[] = [];

    const failed = enqueuePersistenceTask("biz-a:scheduling", async () => {
      events.push("failed-start");
      throw new Error("simulated write failure");
    });
    void failed.catch(() => undefined);

    const next = enqueuePersistenceTask("biz-a:scheduling", async () => {
      events.push("next-start");
    });

    await next;

    expect(events).toEqual(["failed-start", "next-start"]);
    await waitForPersistenceQueue();
  });
});
