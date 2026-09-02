import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";

// Public visitors to a business's own website have no OwnersLocal login, so
// this can't go through the normal authenticated client SDK writes every
// other collection uses -- it has to run server-side with the Admin SDK
// (same reason server/pushNotifications.ts does), keyed off a per-business
// embed token instead of a Firebase Auth session.
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
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed/used for the website lead form:", err);
    adminApp = null;
  }
  return adminApp;
}

export interface WebLeadFormSubmission {
  token?: string;
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  notes?: string;
  // Honeypot -- a real visitor never sees or fills this field (hidden via
  // CSS in the embed snippet); a bot filling every input on the page will.
  website?: string;
}

export interface WebLeadFormResult {
  ok: boolean;
  error?: string;
}

export async function handleWebLeadFormSubmit(body: WebLeadFormSubmission): Promise<WebLeadFormResult> {
  const app = getAdminApp();
  if (!app) return { ok: false, error: "This server isn't configured to accept lead form submissions yet." };

  // Silently "succeed" on the honeypot so a bot's script sees a normal
  // response and doesn't retry or flag the endpoint as broken.
  if (body.website) return { ok: true };

  const token = (body.token || "").trim();
  const name = (body.name || "").trim();
  if (!token) return { ok: false, error: "Missing form token." };
  if (!name) return { ok: false, error: "Name is required." };
  const phone = (body.phone || "").trim();
  const email = (body.email || "").trim();
  if (!phone && !email) return { ok: false, error: "A phone number or email is required." };

  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");

  const ownerSnap = await db.collection("business_profiles").where("webFormToken", "==", token).limit(1).get();
  if (ownerSnap.empty) return { ok: false, error: "Invalid form -- this embed code may have been regenerated or removed." };
  const businessId = ownerSnap.docs[0].id;

  const id = `lead_web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.collection("leads").doc(id).set({
    id,
    name,
    company: (body.company || "").trim(),
    phone,
    email,
    source: "Website",
    salesRep: "Unassigned",
    status: "New",
    estimatedValue: 0,
    dateAdded: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    addedDaysAgo: 0,
    address: "",
    notes: (body.notes || "").trim(),
    businessId,
    updatedAt: new Date().toISOString()
  });

  await notifyNewWebsiteLead(db, businessId, name);

  return { ok: true };
}

/**
 * Notifies the owner's inbox, plus any employee individually granted the
 * "View Lead Messages in Inbox" permission (view_lead_messages) -- written
 * server-side via the Admin SDK since NotificationsPage's Firestore rule
 * requires each notification's own recipientEmail to match the reading
 * user, so one recipient can't just subscribe to another's document.
 */
async function notifyNewWebsiteLead(
  db: FirebaseFirestore.Firestore,
  businessId: string,
  leadName: string
): Promise<void> {
  const recipients = new Set<string>([businessId]);

  try {
    const employeesSnap = await db.collection("employees").where("businessEmail", "==", businessId).get();
    employeesSnap.forEach(employeeDoc => {
      const data = employeeDoc.data();
      const permission = data?.granularPermissions?.view_lead_messages;
      const granted = permission === "view" || permission === "edit" || permission === "delete"
        || permission?.view === true || permission?.edit === true || permission?.delete === true;
      if (granted && typeof data?.email === "string" && data.email) recipients.add(data.email);
    });
  } catch (err) {
    console.error("Error resolving employees for website-lead notification (continuing with owner only):", err);
  }

  const now = new Date();
  const time = now.toISOString().slice(0, 16).replace("T", " ");
  const writes = Array.from(recipients).map(recipientEmail => {
    const notifId = `notif_web_lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return db.collection("notifications").doc(notifId).set({
      id: notifId,
      businessId,
      category: "leads",
      title: "New Website Lead",
      description: `${leadName} submitted your website lead form.`,
      time,
      isRead: false,
      isArchived: false,
      isPinned: false,
      priority: "Normal",
      assignedUser: "Owner",
      recipientEmail,
      createdBy: "Website Lead Form",
      history: [`${time}: New website lead form submission from ${leadName}.`]
    });
  });
  await Promise.all(writes);
}
