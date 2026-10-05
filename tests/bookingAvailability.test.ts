import { describe, expect, test } from "vitest";
import {
  availabilityDateRange, buildAvailability, checkSlot, eventToBusyInterval, slotsForDay, todayInZone, zonedTimeToUtcMs
} from "../server/bookingAvailability";
import { normalizeOnlineBookingConfig, parseBusinessHours, timeZoneFromCompanyLabel, type OnlineBookingConfig } from "../src/types/onlineBooking";
import { validatePhotos } from "../server/onlineBooking";

const config = (patch: Partial<OnlineBookingConfig> = {}): OnlineBookingConfig => ({
  ...normalizeOnlineBookingConfig({
    enabled: true, websiteEnabled: true, workingDays: [1, 2, 3, 4, 5], dayStart: "08:00", dayEnd: "17:00",
    slotIntervalMinutes: 60, minNoticeHours: 2, maxDaysAhead: 30, capacity: 1, timeZone: "America/Chicago",
    services: [{ id: "repair", name: "Repair", durationMinutes: 120 }]
  }),
  ...patch
});
const repair = { id: "repair", name: "Repair", durationMinutes: 120 };

// Monday 2026-10-05 06:00 America/Chicago (CDT, UTC-5) == 11:00Z
const MONDAY_6AM_CHICAGO = Date.UTC(2026, 9, 5, 11, 0);

describe("time zones", () => {
  test("converts business-local wall time to the real UTC instant, DST-aware", () => {
    expect(new Date(zonedTimeToUtcMs("2026-07-01", 9 * 60, "America/Chicago")).toISOString()).toBe("2026-07-01T14:00:00.000Z");
    expect(new Date(zonedTimeToUtcMs("2026-12-01", 9 * 60, "America/Chicago")).toISOString()).toBe("2026-12-01T15:00:00.000Z");
    expect(new Date(zonedTimeToUtcMs("2026-12-01", 9 * 60, "America/Los_Angeles")).toISOString()).toBe("2026-12-01T17:00:00.000Z");
  });

  test("today is computed in the business's zone, not the server's", () => {
    // 03:00Z on Oct 6 is still Oct 5 in Chicago.
    expect(todayInZone(Date.UTC(2026, 9, 6, 3, 0), "America/Chicago")).toBe("2026-10-05");
  });
});

describe("slot generation", () => {
  test("offers grid-aligned slots that fit inside business hours", () => {
    const slots = slotsForDay(config(), repair, "2026-10-06", [], MONDAY_6AM_CHICAGO);
    expect(slots.map(s => s.startTime)).toEqual(["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"]);
    expect(slots[0].endTime).toBe("10:00");
  });

  test("never offers past slots or slots inside the minimum notice window", () => {
    // Monday 06:00 + 2h notice -> 08:00 is the first allowed start.
    const today = slotsForDay(config(), repair, "2026-10-05", [], MONDAY_6AM_CHICAGO).map(s => s.startTime);
    expect(today[0]).toBe("08:00");
    const noon = Date.UTC(2026, 9, 5, 17, 0); // 12:00 CDT
    const afternoon = slotsForDay(config(), repair, "2026-10-05", [], noon).map(s => s.startTime);
    expect(afternoon[0]).toBe("14:00");
    expect(slotsForDay(config(), repair, "2026-10-02", [], MONDAY_6AM_CHICAGO)).toEqual([]);
  });

  test("existing appointments block overlapping slots (no double booking)", () => {
    const busy = [eventToBusyInterval({ eventType: "Job", status: "Scheduled", startTime: "10:00", endTime: "11:00" })!];
    const starts = slotsForDay(config(), repair, "2026-10-06", busy, MONDAY_6AM_CHICAGO).map(s => s.startTime);
    expect(starts).not.toContain("09:00"); // 09-11 overlaps 10-11
    expect(starts).not.toContain("10:00");
    expect(starts).toContain("08:00"); // 08-10 ends exactly when the job starts
    expect(starts).toContain("11:00");
  });

  test("cancelled events, reminders and tasks don't block; unreadable times block the whole day", () => {
    expect(eventToBusyInterval({ eventType: "Job", status: "Cancelled", startTime: "09:00", endTime: "10:00" })).toBeNull();
    expect(eventToBusyInterval({ eventType: "Reminder", status: "Scheduled", startTime: "09:00", endTime: "10:00" })).toBeNull();
    expect(eventToBusyInterval({ eventType: "PTO", status: "Scheduled" })).toEqual({ start: 0, end: 1440 });
  });

  test("capacity allows that many overlapping appointments, buffer pads each side", () => {
    const busy = [{ start: 600, end: 660 }];
    expect(checkSlot(config({ capacity: 2 }), repair, "2026-10-06", "10:00", busy, MONDAY_6AM_CHICAGO).ok).toBe(true);
    expect(checkSlot(config({ capacity: 2 }), repair, "2026-10-06", "10:00", [...busy, { start: 630, end: 700 }], MONDAY_6AM_CHICAGO).ok).toBe(false);
    // 08:00-10:00 is adjacent to 10:00 -- with a 30-min buffer it is not.
    expect(checkSlot(config({ bufferMinutes: 30 }), repair, "2026-10-06", "08:00", busy, MONDAY_6AM_CHICAGO)).toEqual({ ok: false, reason: "unavailable" });
  });

  test("rejects closed days, off-grid times, out-of-hours and too-far dates", () => {
    expect(checkSlot(config(), repair, "2026-10-10", "09:00", [], MONDAY_6AM_CHICAGO)).toEqual({ ok: false, reason: "closed_day" });
    expect(checkSlot(config(), repair, "2026-10-06", "09:30", [], MONDAY_6AM_CHICAGO)).toEqual({ ok: false, reason: "off_grid" });
    expect(checkSlot(config(), repair, "2026-10-06", "16:00", [], MONDAY_6AM_CHICAGO)).toEqual({ ok: false, reason: "outside_hours" });
    expect(checkSlot(config(), repair, "2026-12-01", "09:00", [], MONDAY_6AM_CHICAGO)).toEqual({ ok: false, reason: "too_far" });
    expect(checkSlot(config(), repair, "2026-02-30", "09:00", [], MONDAY_6AM_CHICAGO)).toEqual({ ok: false, reason: "invalid_date" });
  });

  test("availability windows are clipped to today..maxDaysAhead and at most 14 days", () => {
    expect(availabilityDateRange(config(), "2020-01-01", 3, MONDAY_6AM_CHICAGO)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(availabilityDateRange(config(), undefined, 99, MONDAY_6AM_CHICAGO)).toHaveLength(14);
    expect(availabilityDateRange(config({ maxDaysAhead: 2 }), undefined, 7, MONDAY_6AM_CHICAGO)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(availabilityDateRange(config(), "2027-06-01", 7, MONDAY_6AM_CHICAGO)).toEqual([]);
  });

  test("buildAvailability only uses events for each day", () => {
    const events = new Map([["2026-10-06", [{ eventType: "Job", status: "Scheduled", startTime: "08:00", endTime: "17:00" }]]]);
    const days = buildAvailability(config(), repair, ["2026-10-06", "2026-10-07"], events, MONDAY_6AM_CHICAGO);
    expect(days[0].slots).toEqual([]);
    expect(days[1].slots.length).toBe(8);
  });
});

describe("config normalization", () => {
  test("parses Settings business hours and time-zone labels", () => {
    expect(parseBusinessHours("08:00 AM - 05:00 PM")).toEqual({ start: "08:00", end: "17:00" });
    expect(parseBusinessHours("7am to 6:30pm")).toEqual({ start: "07:00", end: "18:30" });
    expect(parseBusinessHours("nonsense")).toBeNull();
    expect(timeZoneFromCompanyLabel("Pacific Standard Time (PST)")).toBe("America/Los_Angeles");
    expect(timeZoneFromCompanyLabel("Central Standard Time (CST)")).toBe("America/Chicago");
    expect(timeZoneFromCompanyLabel("Eastern Time (ET)")).toBe("America/New_York");
  });

  test("defaults are safe: booking off until the owner turns it on", () => {
    const c = normalizeOnlineBookingConfig(undefined, { company: { businessHours: "07:00 AM - 03:00 PM", timeZone: "Mountain Standard Time (MST)" } });
    expect(c.enabled).toBe(false);
    expect(c.websiteEnabled).toBe(false);
    expect(c.dayStart).toBe("07:00");
    expect(c.dayEnd).toBe("15:00");
    expect(c.timeZone).toBe("America/Denver");
    expect(c.services.length).toBe(1);
  });

  test("clamps hostile values and drops invalid origins", () => {
    const c = normalizeOnlineBookingConfig({
      capacity: 9999, slotIntervalMinutes: 1, timeZone: "Mars/Olympus", workingDays: [1, 9, "x"],
      services: [{ id: "a/b", name: "  X  ", durationMinutes: 100000 }, { name: "" }],
      allowedOrigins: ["https://example.com/path", "javascript:alert(1)", "not a url"]
    });
    expect(c.capacity).toBe(50);
    expect(c.slotIntervalMinutes).toBe(15);
    expect(c.timeZone).toBe("America/Los_Angeles");
    expect(c.workingDays).toEqual([1]);
    expect(c.services).toEqual([{ id: "ab", name: "X", durationMinutes: 480 }]);
    expect(c.allowedOrigins).toEqual(["https://example.com"]);
  });
});

describe("photo validation", () => {
  test("accepts small images, rejects non-images and oversized payloads", () => {
    expect(validatePhotos(["data:image/png;base64,iVBORw0KGgo="]).ok).toBe(true);
    expect(validatePhotos(undefined)).toEqual({ ok: true, photos: [] });
    expect(validatePhotos(["data:text/html;base64,PHNjcmlwdD4="]).ok).toBe(false);
    expect(validatePhotos(["https://evil.example/x.png"]).ok).toBe(false);
    expect(validatePhotos(new Array(5).fill("data:image/png;base64,AA==")).ok).toBe(false);
    expect(validatePhotos(["data:image/jpeg;base64," + "A".repeat(400_000)]).ok).toBe(false);
  });
});
