// Demo mode is a client-only walkthrough of the app: a fixed sample
// business, pre-loaded stock data, and no real Firebase reads/writes.
// useFirestoreCollection checks isDemoMode() to skip both the live
// onSnapshot subscription and the sync-to-Firestore write path entirely,
// so entering demo mode never touches the real backend and never spams
// the console with permission-denied errors for a business that doesn't
// exist server-side.
let demoModeActive = false;

export function isDemoMode(): boolean {
  return demoModeActive;
}

export function setDemoMode(value: boolean): void {
  demoModeActive = value;
}

export const DEMO_USER_EMAIL = "demo@ownerslocal.app";
