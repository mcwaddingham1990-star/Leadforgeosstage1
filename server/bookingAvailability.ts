import type { BookingDayAvailability, BookingSlot, OnlineBookingConfig, OnlineBookingService } from "../src/types/onlineBooking";

/**
 * Pure availability engine for Online Booking -- no Firestore, no clock of
 * its own (callers pass `nowMs`), so the exact same rules run for listing
 * slots and for the final in-transaction re-check before a booking is
 * written (server/onlineBooking.ts), and both can be unit-tested directly.
 *
 * Source of truth is the business's existing `scheduling_events` records:
 * any non-cancelled event on the calendar occupies its time window.
 */

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Calendar entries that don't actually take a crew's time. */
const NON_BLOCKING_EVENT_TYPES = new Set(["Reminder", "Task"]);

export function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isValidTimeString(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts: Record<string, string> = {};
  new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).formatToParts(new Date(utcMs)).forEach(p => { parts[p.type] = p.value; });
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Business-local YYYY-MM-DD + minutes-after-midnight -> real UTC instant. */
export function zonedTimeToUtcMs(date: string, minutes: number, timeZone: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  const firstGuess = naive - zoneOffsetMs(naive, timeZone);
  return naive - zoneOffsetMs(firstGuess, timeZone);
}

/** Today's date in the business's own time zone. */
export function todayInZone(nowMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(nowMs));
}

export interface CalendarEventLike {
  eventType?: unknown;
  status?: unknown;
  startTime?: unknown;
  endTime?: unknown;
}

export interface BusyInterval { start: number; end: number }

/** The window (minutes of the day) an existing calendar entry occupies, or
 * null when it doesn't block booking. An entry with unreadable times blocks
 * the whole day -- never guess that a slot is free. */
export function eventToBusyInterval(event: CalendarEventLike): BusyInterval | null {
  if (event.status === "Cancelled") return null;
  if (typeof event.eventType === "string" && NON_BLOCKING_EVENT_TYPES.has(event.eventType)) return null;
  if (!isValidTimeString(event.startTime)) return { start: 0, end: 24 * 60 };
  const start = timeToMinutes(event.startTime);
  const end = isValidTimeString(event.endTime) ? timeToMinutes(event.endTime) : start + 60;
  return { start, end: end > start ? end : 24 * 60 };
}

export type SlotRejection =
  | "invalid_date" | "invalid_time" | "closed_day" | "outside_hours" | "off_grid"
  | "too_soon" | "too_far" | "unavailable";

export function checkSlot(
  config: OnlineBookingConfig,
  service: OnlineBookingService,
  date: string,
  startTime: string,
  busy: BusyInterval[],
  nowMs: number
): { ok: true; endTime: string } | { ok: false; reason: SlotRejection } {
  if (!isValidDateString(date)) return { ok: false, reason: "invalid_date" };
  if (!isValidTimeString(startTime)) return { ok: false, reason: "invalid_time" };
  if (!config.workingDays.includes(dayOfWeek(date))) return { ok: false, reason: "closed_day" };

  const dayStart = timeToMinutes(config.dayStart);
  const dayEnd = timeToMinutes(config.dayEnd);
  const start = timeToMinutes(startTime);
  const end = start + service.durationMinutes;
  if (start < dayStart || end > dayEnd) return { ok: false, reason: "outside_hours" };
  if ((start - dayStart) % config.slotIntervalMinutes !== 0) return { ok: false, reason: "off_grid" };

  const today = todayInZone(nowMs, config.timeZone);
  if (date > addDays(today, config.maxDaysAhead)) return { ok: false, reason: "too_far" };
  if (zonedTimeToUtcMs(date, start, config.timeZone) < nowMs + config.minNoticeHours * 3_600_000) return { ok: false, reason: "too_soon" };

  const windowStart = start - config.bufferMinutes;
  const windowEnd = end + config.bufferMinutes;
  const overlapping = busy.filter(b => b.start < windowEnd && b.end > windowStart).length;
  if (overlapping >= config.capacity) return { ok: false, reason: "unavailable" };

  return { ok: true, endTime: minutesToTime(end) };
}

export function slotsForDay(
  config: OnlineBookingConfig,
  service: OnlineBookingService,
  date: string,
  busy: BusyInterval[],
  nowMs: number
): BookingSlot[] {
  const slots: BookingSlot[] = [];
  const dayStart = timeToMinutes(config.dayStart);
  const dayEnd = timeToMinutes(config.dayEnd);
  for (let start = dayStart; start + service.durationMinutes <= dayEnd; start += config.slotIntervalMinutes) {
    const startTime = minutesToTime(start);
    const result = checkSlot(config, service, date, startTime, busy, nowMs);
    if (result.ok) slots.push({ startTime, endTime: result.endTime });
  }
  return slots;
}

/** The dates (business-local) an availability request may cover, clipped
 * to today .. today+maxDaysAhead so a caller can never probe the far past
 * or future of someone's calendar. */
export function availabilityDateRange(config: OnlineBookingConfig, from: unknown, days: unknown, nowMs: number): string[] {
  const today = todayInZone(nowMs, config.timeZone);
  const lastAllowed = addDays(today, config.maxDaysAhead);
  const start = isValidDateString(from) && from > today ? from : today;
  if (start > lastAllowed) return [];
  const count = Math.min(14, Math.max(1, Math.round(Number(days)) || 7));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(start, i);
    if (date > lastAllowed) break;
    out.push(date);
  }
  return out;
}

export function buildAvailability(
  config: OnlineBookingConfig,
  service: OnlineBookingService,
  dates: string[],
  eventsByDate: Map<string, CalendarEventLike[]>,
  nowMs: number
): BookingDayAvailability[] {
  return dates.map(date => {
    const busy = (eventsByDate.get(date) || []).map(eventToBusyInterval).filter((b): b is BusyInterval => !!b);
    return { date, slots: slotsForDay(config, service, date, busy, nowMs) };
  });
}

export const SLOT_REJECTION_MESSAGES: Record<SlotRejection, string> = {
  invalid_date: "Choose a valid date.",
  invalid_time: "Choose a valid time.",
  closed_day: "The business isn't open for bookings that day.",
  outside_hours: "That time is outside the business's booking hours.",
  off_grid: "Choose one of the offered appointment times.",
  too_soon: "That time is too soon (or already past) -- choose a later slot.",
  too_far: "That date is too far ahead to book online.",
  unavailable: "Sorry -- that time was just taken. Please choose another slot."
};
