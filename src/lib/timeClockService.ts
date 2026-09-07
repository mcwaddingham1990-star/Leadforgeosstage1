import { deleteDoc, doc, runTransaction, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { TimeClockLog } from "../types/domain";

export interface LiveLocationFix {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
  capturedAt: string; // ISO timestamp of the real device fix, not of the write
}

const activeShiftId = (businessId: string, employeeEmail: string) =>
  encodeURIComponent(`${businessId}::${employeeEmail.toLowerCase()}`);

const persistedLog = (businessId: string, log: TimeClockLog) =>
  Object.fromEntries(
    Object.entries({ ...log, businessId, updatedAt: log.timestamp })
      .filter(([, value]) => value !== undefined)
  );

export async function clockInTransaction(businessId: string, log: TimeClockLog): Promise<void> {
  const activeRef = doc(db, "active_shifts", activeShiftId(businessId, log.employeeEmail));
  const logRef = doc(db, "time_clock_logs", log.id);

  try {
    await runTransaction(db, async transaction => {
      const active = await transaction.get(activeRef);
      if (active.exists()) throw new Error("This employee is already clocked in.");

      transaction.set(activeRef, {
        businessId,
        employeeEmail: log.employeeEmail,
        employeeName: log.employeeName,
        clockInLogId: log.id,
        clockedInAt: log.timestamp,
        updatedAt: log.timestamp
      });
      transaction.set(logRef, persistedLog(businessId, log));
    });
  } catch (error) {
    if (!isPermissionError(error)) throw error;
    await clockInViaBusinessProfile(businessId, log);
  }
}

export async function clockOutTransaction(
  businessId: string,
  log: TimeClockLog,
  legacyLogsShowActive: boolean
): Promise<void> {
  const activeRef = doc(db, "active_shifts", activeShiftId(businessId, log.employeeEmail));

  // Older active shifts predate active_shifts, and a clock-in can also have
  // landed only in the business-profile compatibility store if writing
  // active_shifts directly hit a permission error (see clockInTransaction's
  // own fallback). Claim/confirm one exactly once so the following
  // transaction still gives duplicate clock-outs backend protection — but a
  // permission failure on this best-effort migration step must not abort
  // the clock-out outright, or every clock-out for an account that needs
  // the compatibility path fails with a confusing "no active shift" error
  // while the employee is very much still clocked in.
  if (legacyLogsShowActive) {
    try {
      await runTransaction(db, async transaction => {
        const active = await transaction.get(activeRef);
        if (!active.exists()) {
          transaction.set(activeRef, {
            businessId,
            employeeEmail: log.employeeEmail,
            employeeName: log.employeeName,
            migratedFromLogs: true,
            updatedAt: log.timestamp
          });
        }
      });
    } catch (error) {
      if (!isPermissionError(error)) throw error;
      await clockOutViaBusinessProfile(businessId, log, legacyLogsShowActive);
      return;
    }
  }

  const logRef = doc(db, "time_clock_logs", log.id);
  try {
    await runTransaction(db, async transaction => {
      const active = await transaction.get(activeRef);
      if (!active.exists()) throw new Error("No active shift exists to clock out.");

      transaction.set(logRef, persistedLog(businessId, log));
      transaction.delete(activeRef);
    });
  } catch (error) {
    if (!isPermissionError(error)) throw error;
    await clockOutViaBusinessProfile(businessId, log, legacyLogsShowActive);
  }
}

const isPermissionError = (error: unknown) =>
  typeof error === "object" && error !== null &&
  "code" in error && String((error as { code?: unknown }).code).includes("permission-denied");

const isNotFoundError = (error: unknown) =>
  typeof error === "object" && error !== null &&
  "code" in error && String((error as { code?: unknown }).code).includes("not-found");

// Real field GPS tracking, one fix at a time, while an employee is clocked
// in -- distinct from the single fix captured on the clock-in/out punch
// itself. Written onto the same active_shifts doc the clock-in transaction
// already owns, so location automatically stops updating (and the last
// position simply goes stale) the moment that doc is deleted at clock-out;
// nothing here needs its own start/stop bookkeeping. Best-effort: a location
// ping must never surface an error or block the caller the way a real punch
// does, so failures are swallowed after the compatibility fallback.
export async function updateLiveLocation(
  businessId: string,
  employeeEmail: string,
  location: LiveLocationFix
): Promise<void> {
  const activeRef = doc(db, "active_shifts", activeShiftId(businessId, employeeEmail));
  try {
    await updateDoc(activeRef, { lastLocation: location, lastLocationAt: location.capturedAt });
  } catch (error) {
    if (!isPermissionError(error) && !isNotFoundError(error)) return;
    await updateLiveLocationViaBusinessProfile(businessId, employeeEmail, location);
  }
}

async function updateLiveLocationViaBusinessProfile(
  businessId: string,
  employeeEmail: string,
  location: LiveLocationFix
): Promise<void> {
  const profileRef = doc(db, "business_profiles", businessId);
  const key = encodeURIComponent(employeeEmail.toLowerCase());
  try {
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(profileRef);
      const data = snapshot.data() || {};
      const active = { ...(data.timeClockActiveShifts || {}) };
      // No active shift recorded through this compatibility path either --
      // the employee isn't really clocked in anywhere this write could
      // reach, so there's nothing honest to attach a live fix to.
      if (!active[key]) return;
      active[key] = { ...active[key], lastLocation: location, lastLocationAt: location.capturedAt };
      transaction.set(profileRef, { timeClockActiveShifts: active, updatedAt: location.capturedAt }, { merge: true });
    });
  } catch {
    // Swallowed -- see updateLiveLocation's note above.
  }
}

// Compatibility storage for projects where the web app has deployed before
// the new collection rules. Business-profile access already follows company
// membership, so punches remain shared across devices instead of failing.
async function clockInViaBusinessProfile(businessId: string, log: TimeClockLog): Promise<void> {
  const profileRef = doc(db, "business_profiles", businessId);
  const key = encodeURIComponent(log.employeeEmail.toLowerCase());
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(profileRef);
    const data = snapshot.data() || {};
    const active = { ...(data.timeClockActiveShifts || {}) };
    if (active[key]) throw new Error("This employee is already clocked in.");
    active[key] = { employeeEmail: log.employeeEmail, employeeName: log.employeeName, clockInLogId: log.id, clockedInAt: log.timestamp };
    transaction.set(profileRef, {
      timeClockActiveShifts: active,
      timeClockLogs: { ...(data.timeClockLogs || {}), [log.id]: persistedLog(businessId, log) },
      updatedAt: log.timestamp
    }, { merge: true });
  });
}

async function clockOutViaBusinessProfile(businessId: string, log: TimeClockLog, legacyLogsShowActive: boolean): Promise<void> {
  const profileRef = doc(db, "business_profiles", businessId);
  const key = encodeURIComponent(log.employeeEmail.toLowerCase());
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(profileRef);
    const data = snapshot.data() || {};
    const active = { ...(data.timeClockActiveShifts || {}) };
    if (!active[key] && !legacyLogsShowActive) throw new Error("No active shift exists to clock out.");
    delete active[key];
    transaction.set(profileRef, {
      timeClockActiveShifts: active,
      timeClockLogs: { ...(data.timeClockLogs || {}), [log.id]: persistedLog(businessId, log) },
      updatedAt: log.timestamp
    }, { merge: true });
  });
}

// Kept separate for administrative repair tools that may need to clear an
// orphaned active marker after deleting/correcting its source punch.
export async function clearActiveShift(businessId: string, employeeEmail: string): Promise<void> {
  await deleteDoc(doc(db, "active_shifts", activeShiftId(businessId, employeeEmail)));
}
