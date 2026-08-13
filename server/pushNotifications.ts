import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

// True push notifications (delivered even when the app/tab is closed) need
// a Firebase service account -- the client-side web config already bundled
// into this app (firebase-applet-config.json) is intentionally public and
// cannot authenticate server-to-FCM sends. Generate one at:
//   Firebase Console -> Project Settings -> Service Accounts -> Generate new
//   private key
// and set the downloaded JSON file's contents as FIREBASE_SERVICE_ACCOUNT_JSON.
// Until that's set, this stays a clean no-op (see getAdminApp below) and
// callers fall back to the always-on in-app notification instead.
let adminApp: App | null | undefined;

function getAdminApp(): App | null {
  if (adminApp !== undefined) return adminApp;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    adminApp = null;
    return adminApp;
  }
  try {
    const serviceAccount = JSON.parse(raw);
    adminApp = getApps().length ? getApps()[0]! : initializeApp({ credential: cert(serviceAccount) });
  } catch (err) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed/used for push notifications:", err);
    adminApp = null;
  }
  return adminApp;
}

export interface SendPushRequest {
  recipientEmails: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface SendPushResult {
  sent: number;
  configured: boolean;
}

export async function sendPushToRecipients(req: SendPushRequest): Promise<SendPushResult> {
  const app = getAdminApp();
  if (!app) return { sent: 0, configured: false };
  if (!req.recipientEmails.length) return { sent: 0, configured: true };

  const db = getFirestore(app);

  // Firestore 'in' queries cap at 30 values -- batch defensively for
  // businesses with a lot of managers assigned as approvers.
  const emailBatches: string[][] = [];
  for (let i = 0; i < req.recipientEmails.length; i += 30) {
    emailBatches.push(req.recipientEmails.slice(i, i + 30));
  }

  const tokens: string[] = [];
  for (const batch of emailBatches) {
    const snap = await db.collection("push_subscriptions").where("email", "in", batch).get();
    snap.forEach(doc => {
      const token = doc.data()?.token;
      if (typeof token === "string" && token) tokens.push(token);
    });
  }
  if (!tokens.length) return { sent: 0, configured: true };

  const messaging = getMessaging(app);
  const result = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: req.title, body: req.body },
    data: req.data || {},
  });

  // Prune tokens FCM reports as dead so future sends don't keep paying the
  // latency/quota cost of a device that unregistered or reinstalled.
  const staleTokens: string[] = [];
  result.responses.forEach((response, index) => {
    const code = response.error?.code;
    if (!response.success && (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token")) {
      staleTokens.push(tokens[index]);
    }
  });
  if (staleTokens.length) {
    const staleSnap = await db.collection("push_subscriptions").where("token", "in", staleTokens.slice(0, 30)).get();
    await Promise.all(staleSnap.docs.map(d => d.ref.delete()));
  }

  return { sent: result.successCount, configured: true };
}
