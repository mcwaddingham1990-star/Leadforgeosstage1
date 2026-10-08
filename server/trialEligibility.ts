import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import { sharedTrialField, trialIdentityKeys, type TrialMatchField } from "../src/lib/freeTrial";
import { isAdminBusinessId } from "./paywallBypass";

/**
 * One free trial per business (see src/lib/freeTrial.ts for the matching
 * rules). Two server-only collections back this -- neither has a
 * firestore.rules match, so no client can read or write them (Firestore
 * denies unmatched paths by default); only this Admin SDK code touches them:
 *
 *  - trial_fingerprints/{businessId}: every phone/name/address/email key a
 *    business has ever had (array union, never removed) plus when its owner
 *    signed up. Kept even if the business later edits or deletes its
 *    profile, so "change everything / delete and re-sign-up" still matches.
 *  - trial_blocks/{businessId}: written once a new business is found to
 *    match an older one. Permanent, so editing the profile afterwards
 *    doesn't bring the trial back.
 */
const FINGERPRINTS = "trial_fingerprints";
const BLOCKS = "trial_blocks";
const PROFILE_FIELDS = ["businessNames", "businessPhones", "ownerPhones", "businessAddresses"] as const;

export interface TrialEligibility {
  blocked: boolean;
  field?: TrialMatchField;
}

async function ownerCreatedAtMs(auth: Auth, businessId: string): Promise<number | null> {
  try {
    const user = await auth.getUserByEmail(businessId);
    const created = Date.parse(user.metadata.creationTime);
    return Number.isFinite(created) ? created : null;
  } catch {
    return null;
  }
}

/** Records this business's identity keys (every business, every status check). */
export async function recordTrialFingerprint(db: Firestore, businessId: string, profile: Record<string, unknown>, ownerCreatedAt: number | null): Promise<string[]> {
  const keys = trialIdentityKeys({ ownerEmail: businessId, ...profile });
  if (isAdminBusinessId(businessId) || !keys.length) return keys;
  await db.collection(FINGERPRINTS).doc(businessId).set({
    keys: FieldValue.arrayUnion(...keys),
    ...(ownerCreatedAt ? { ownerCreatedAt } : {}),
    updatedAt: Date.now()
  }, { merge: true });
  return keys;
}

/**
 * Whether a business still inside its 7-day window is allowed the trial:
 * blocked when any of its keys matches a business whose owner signed up
 * earlier (the older business is never affected by a newer look-alike).
 */
export async function checkTrialEligibility(db: Firestore, auth: Auth, businessId: string, keys: string[], ownerCreatedAt: number): Promise<TrialEligibility> {
  const existingBlock = await db.collection(BLOCKS).doc(businessId).get();
  if (existingBlock.exists) return { blocked: true, field: existingBlock.data()?.field };
  if (!keys.length) return { blocked: false };

  const isEarlier = (createdAt: number | null) => createdAt === null || createdAt < ownerCreatedAt;
  let match: { businessId: string; field: TrialMatchField } | null = null;

  // 1. The permanent fingerprint record (array-contains-any takes 30 values per query).
  for (let i = 0; i < keys.length && !match; i += 30) {
    const snap = await db.collection(FINGERPRINTS).where("keys", "array-contains-any", keys.slice(i, i + 30)).get();
    for (const doc of snap.docs) {
      if (doc.id === businessId || isAdminBusinessId(doc.id)) continue;
      const data = doc.data();
      const field = sharedTrialField(keys, Array.isArray(data.keys) ? data.keys : []);
      const createdAt = typeof data.ownerCreatedAt === "number" ? data.ownerCreatedAt : await ownerCreatedAtMs(auth, doc.id);
      if (field && isEarlier(createdAt)) { match = { businessId: doc.id, field }; break; }
    }
  }

  // 2. Live business profiles, for businesses that haven't been fingerprinted
  //    yet (only the fields compared are read).
  if (!match) {
    const profiles = await db.collection("business_profiles").select(...PROFILE_FIELDS).get();
    for (const doc of profiles.docs) {
      if (doc.id === businessId || isAdminBusinessId(doc.id)) continue;
      const field = sharedTrialField(keys, trialIdentityKeys({ ownerEmail: doc.id, ...doc.data() }));
      if (!field) continue;
      if (isEarlier(await ownerCreatedAtMs(auth, doc.id))) { match = { businessId: doc.id, field }; break; }
    }
  }

  if (!match) return { blocked: false };
  await db.collection(BLOCKS).doc(businessId).set({
    field: match.field,
    matchedBusinessId: match.businessId,
    createdAt: Date.now()
  });
  console.log(`[trial] ${businessId} gets no free trial: ${match.field} matches earlier business ${match.businessId}.`);
  return { blocked: true, field: match.field };
}
