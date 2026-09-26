/**
 * Cross-tenant security regression suite for firestore.rules.
 *
 * Runs against the real Firestore emulator with the project's actual rules
 * file loaded (never a hand-copied excerpt), via `firebase emulators:exec`
 * (see package.json's `test:rules` script). Every test in here either:
 *   (a) proves a cross-business read/write/delete or a privilege-escalation
 *       attempt is denied, or
 *   (b) proves the equivalent SAME-business action still succeeds, so this
 *       suite can't silently pass by denying everything.
 *
 * Two businesses are used throughout: BIZ_A ("ownerA@example.com") and
 * BIZ_B ("ownerB@example.com"), each with their own owner and employee.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection } from "firebase/firestore";

const PROJECT_ID = "demo-ownerslocal-security-test";

const BIZ_A = "ownerA@example.com";
const BIZ_B = "ownerB@example.com";
const EMP_A_UID = "emp-a-uid";
const EMP_A_EMAIL = "employeeA@example.com";
const EMP_B_UID = "emp-b-uid";
const EMP_B_EMAIL = "employeeB@example.com";
const OWNER_A_UID = "owner-a-uid";
const OWNER_B_UID = "owner-b-uid";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed baseline tenants/users with the Admin SDK context, which bypasses
  // rules entirely -- this is test fixture setup, not something the rules
  // are meant to allow a real client to do.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "user_profiles", OWNER_A_UID), {
      businessEmail: BIZ_A,
      role: "Owner",
      email: BIZ_A,
      name: "Owner A",
    });
    await setDoc(doc(db, "user_profiles", OWNER_B_UID), {
      businessEmail: BIZ_B,
      role: "Owner",
      email: BIZ_B,
      name: "Owner B",
    });
    await setDoc(doc(db, "user_profiles", EMP_A_UID), {
      businessEmail: BIZ_A,
      role: "Technician",
      email: EMP_A_EMAIL,
      name: "Employee A",
      firstName: "Employee",
      lastName: "A",
      permissions: ["customers", "jobs", "timeclock", "scheduling", "messages"],
      granularPermissions: {
        customers: { view: true, edit: false, delete: false },
        jobs: { view: true, edit: true, delete: false },
        scheduling: { view: true, edit: false, delete: false },
        timeclock: { view: true, edit: true, delete: false },
        messages: { view: true, edit: true, delete: false },
      },
    });
    await setDoc(doc(db, "user_profiles", EMP_B_UID), {
      businessEmail: BIZ_B,
      role: "Technician",
      email: EMP_B_EMAIL,
      name: "Employee B",
      firstName: "Employee",
      lastName: "B",
      permissions: ["customers"],
      granularPermissions: {
        customers: { view: true, edit: false, delete: false },
      },
    });

    // One customer document per business, seeded directly (as if already
    // written by that business's own owner).
    await setDoc(doc(db, "customers", "cust_a1"), { businessId: BIZ_A, company: "A Customer" });
    await setDoc(doc(db, "customers", "cust_b1"), { businessId: BIZ_B, company: "B Customer" });

    // One of each representative financial/record collection per business,
    // for the delete-vulnerability regression sweep below.
    for (const [collectionName, id] of [
      ["invoices", "inv_"],
      ["bills", "bill_"],
      ["journal_entries", "je_"],
      ["transactions", "txn_"],
      ["scheduling_events", "evt_"],
      ["work_orders", "wo_"],
      ["estimates", "est_"],
      ["leads", "lead_"],
      ["missed_call_events", "mce_"],
      ["text_messages", "txt_"],
    ] as const) {
      await setDoc(doc(db, collectionName, `${id}a`), { businessId: BIZ_A });
      await setDoc(doc(db, collectionName, `${id}b`), { businessId: BIZ_B });
    }

    // A job in Business B, deliberately assigned to someone whose name
    // coincidentally matches Employee A -- used by the isAssignedToJob
    // cross-business regression test below.
    await setDoc(doc(db, "scheduling_events", "evt_b_coincidence"), {
      businessId: BIZ_B,
      eventType: "Job",
      assignedEmployee: "Employee A",
    });

    // A pending invite for Business A, role Technician.
    await setDoc(doc(db, "employee_invites", "INVITE_A_TECH"), {
      businessEmail: BIZ_A,
      role: "Technician",
      status: "pending",
    });

    // Business A's profile, as if the real signup flow created it plus a
    // real Stripe webhook already set subscriptionActive -- used by the
    // paywall-field-protection regression tests below.
    await setDoc(doc(db, "business_profiles", BIZ_A), {
      businessNames: ["A Co"],
      subscriptionActive: false,
    });
  });
});

function ctxFor(uid: string, email: string) {
  return testEnv.authenticatedContext(uid, { email });
}

describe("Tenant isolation: reads", () => {
  test("owner can read their own business's customer", async () => {
    const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
    await assertSucceeds(getDoc(doc(db, "customers", "cust_a1")));
  });

  test("owner cannot read another business's customer", async () => {
    const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
    await assertFails(getDoc(doc(db, "customers", "cust_b1")));
  });

  test("employee can read their own business's customer", async () => {
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertSucceeds(getDoc(doc(db, "customers", "cust_a1")));
  });

  test("employee cannot read another business's customer", async () => {
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertFails(getDoc(doc(db, "customers", "cust_b1")));
  });

  test("unauthenticated caller cannot read any customer", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "customers", "cust_a1")));
  });
});

describe("Tenant isolation: create/update cannot claim another business", () => {
  test("owner cannot create a customer under another business's id", async () => {
    const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
    await assertFails(setDoc(doc(db, "customers", "cust_spoof"), { businessId: BIZ_B, company: "Spoofed" }));
  });

  test("owner can create a customer under their own business id", async () => {
    const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
    await assertSucceeds(setDoc(doc(db, "customers", "cust_new_a"), { businessId: BIZ_A, company: "New A Customer" }));
  });

  test("owner cannot update another business's existing customer", async () => {
    const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
    await assertFails(updateDoc(doc(db, "customers", "cust_b1"), { company: "Hijacked" }));
  });
});

describe("Owner-configured module permissions are enforced by Firestore", () => {
  test("a Customers view-only employee can read but cannot create, update, or delete customers", async () => {
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertSucceeds(getDoc(doc(db, "customers", "cust_a1")));
    await assertFails(setDoc(doc(db, "customers", "cust_emp_create"), {
      businessId: BIZ_A,
      company: "Unauthorized Create",
    }));
    await assertFails(updateDoc(doc(db, "customers", "cust_a1"), { company: "Unauthorized Update" }));
    await assertFails(deleteDoc(doc(db, "customers", "cust_a1")));
  });

  test("Customers edit grants create/update but still does not grant delete", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "user_profiles", EMP_A_UID), {
        granularPermissions: {
          customers: { view: true, edit: true, delete: false },
        },
      });
    });
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertSucceeds(setDoc(doc(db, "customers", "cust_emp_create"), {
      businessId: BIZ_A,
      company: "Permitted Create",
    }));
    await assertSucceeds(updateDoc(doc(db, "customers", "cust_a1"), { company: "Permitted Update" }));
    await assertFails(deleteDoc(doc(db, "customers", "cust_a1")));
  });

  test("Customers delete is independent and must be explicitly granted", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "user_profiles", EMP_A_UID), {
        granularPermissions: {
          customers: { view: true, edit: false, delete: true },
        },
      });
    });
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertSucceeds(deleteDoc(doc(db, "customers", "cust_a1")));
  });

  test("an employee with no Leads view permission cannot read same-business leads", async () => {
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertFails(getDoc(doc(db, "leads", "lead_a")));
  });

  test("granting Leads view permits the read without granting edit", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "user_profiles", EMP_A_UID), {
        granularPermissions: {
          leads: { view: true, edit: false, delete: false },
        },
      });
    });
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertSucceeds(getDoc(doc(db, "leads", "lead_a")));
    await assertFails(updateDoc(doc(db, "leads", "lead_a"), { status: "Won" }));
  });

  test("a same-business employee without Accounting or Invoices permission cannot read financial records", async () => {
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertFails(getDoc(doc(db, "invoices", "inv_a")));
    await assertFails(getDoc(doc(db, "journal_entries", "je_a")));
  });

  test("a same-business employee without Settings edit cannot modify the business profile", async () => {
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertFails(updateDoc(doc(db, "business_profiles", BIZ_A), {
      businessNames: ["Employee Hijack"],
    }));
  });

  test("Jobs edit permits the shared scheduling job record even without Scheduling edit", async () => {
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertSucceeds(updateDoc(doc(db, "scheduling_events", "evt_a"), {
      status: "In Progress",
    }));
  });
});

describe("Employee record tampering is blocked", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "employees", EMP_A_EMAIL), {
        id: EMP_A_EMAIL,
        userUid: EMP_A_UID,
        email: EMP_A_EMAIL,
        firstName: "Employee",
        lastName: "A",
        phone: "111",
        hourlyRate: 20,
        role: "Technician",
        permissions: ["customers"],
        granularPermissions: { customers: { view: true, edit: false, delete: false } },
        businessEmail: BIZ_A,
        businessId: BIZ_A,
      });
      await setDoc(doc(db, "employees", "coworker@example.com"), {
        id: "coworker@example.com",
        userUid: "coworker-uid",
        email: "coworker@example.com",
        firstName: "Co",
        lastName: "Worker",
        hourlyRate: 25,
        role: "Technician",
        permissions: ["jobs"],
        granularPermissions: { jobs: { view: true, edit: true, delete: false } },
        businessEmail: BIZ_A,
        businessId: BIZ_A,
      });
    });
  });

  test("an employee can update safe fields on their own employee record", async () => {
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertSucceeds(updateDoc(doc(db, "employees", EMP_A_EMAIL), { phone: "222" }));
  });

  test("an employee cannot change their own pay, role, or permission payload", async () => {
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertFails(updateDoc(doc(db, "employees", EMP_A_EMAIL), { hourlyRate: 999 }));
    await assertFails(updateDoc(doc(db, "employees", EMP_A_EMAIL), { role: "Owner" }));
    await assertFails(updateDoc(doc(db, "employees", EMP_A_EMAIL), {
      granularPermissions: { roster: { view: true, edit: true, delete: true } },
    }));
  });

  test("an employee cannot edit another employee in the same business", async () => {
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertFails(updateDoc(doc(db, "employees", "coworker@example.com"), { hourlyRate: 1 }));
  });

  test("the owner can still administer employee records", async () => {
    const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
    await assertSucceeds(updateDoc(doc(db, "employees", EMP_A_EMAIL), { hourlyRate: 30 }));
  });
});

describe("Cross-business DELETE (regression for the request.resource==null bug)", () => {
  const collections = ["customers", "invoices", "bills", "journal_entries", "transactions", "scheduling_events", "work_orders", "estimates", "leads", "missed_call_events", "text_messages"] as const;
  const idFor = (c: (typeof collections)[number]) =>
    ({
      customers: "cust_b1",
      invoices: "inv_b",
      bills: "bill_b",
      journal_entries: "je_b",
      transactions: "txn_b",
      scheduling_events: "evt_b",
      work_orders: "wo_b",
      estimates: "est_b",
      leads: "lead_b",
      missed_call_events: "mce_b",
      text_messages: "txt_b",
    })[c];

  for (const collectionName of collections) {
    test(`owner of Business A cannot delete Business B's ${collectionName} document`, async () => {
      const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
      await assertFails(deleteDoc(doc(db, collectionName, idFor(collectionName))));
    });
  }

  test("owner CAN delete their own business's document (positive control)", async () => {
    const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
    await assertSucceeds(deleteDoc(doc(db, "customers", "cust_a1")));
  });

  test("the standard businessId-scoped delete pattern rejects a delete with no auth at all", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(deleteDoc(doc(db, "customers", "cust_a1")));
  });
});

describe("Privilege escalation via user_profiles", () => {
  test("a brand new user cannot self-assign another business's businessEmail with role Owner", async () => {
    const db = ctxFor("attacker-uid", "attacker@example.com").firestore();
    await assertFails(
      setDoc(doc(db, "user_profiles", "attacker-uid"), {
        businessEmail: BIZ_A,
        role: "Owner",
        email: "attacker@example.com",
      })
    );
  });

  test("a brand new user CAN self-signup as Owner of their own verified email", async () => {
    const db = ctxFor("new-owner-uid", "newowner@example.com").firestore();
    await assertSucceeds(
      setDoc(doc(db, "user_profiles", "new-owner-uid"), {
        businessEmail: "newowner@example.com",
        role: "Owner",
        email: "newowner@example.com",
      })
    );
  });

  test("a brand new user cannot claim role Owner via a Technician-only invite", async () => {
    const db = ctxFor("attacker-uid", "attacker@example.com").firestore();
    await assertFails(
      setDoc(doc(db, "user_profiles", "attacker-uid"), {
        businessEmail: BIZ_A,
        role: "Owner",
        email: "attacker@example.com",
        inviteCode: "INVITE_A_TECH",
      })
    );
  });

  test("a brand new user cannot redeem a nonexistent invite code", async () => {
    const db = ctxFor("attacker-uid", "attacker@example.com").firestore();
    await assertFails(
      setDoc(doc(db, "user_profiles", "attacker-uid"), {
        businessEmail: BIZ_A,
        role: "Technician",
        email: "attacker@example.com",
        inviteCode: "DOES_NOT_EXIST",
      })
    );
  });

  test("a brand new user CAN join via a real, matching, pending invite", async () => {
    const db = ctxFor("new-emp-uid", "newemp@example.com").firestore();
    await assertSucceeds(
      setDoc(doc(db, "user_profiles", "new-emp-uid"), {
        businessEmail: BIZ_A,
        role: "Technician",
        email: "newemp@example.com",
        inviteCode: "INVITE_A_TECH",
      })
    );
  });

  test("an existing employee cannot self-update their own businessEmail to another business", async () => {
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertFails(updateDoc(doc(db, "user_profiles", EMP_A_UID), { businessEmail: BIZ_B }));
  });

  test("an existing employee cannot self-promote their own role to Owner", async () => {
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertFails(updateDoc(doc(db, "user_profiles", EMP_A_UID), { role: "Owner" }));
  });

  test("a malformed employee CAN repair a stale businessEmail from their original completed invite", async () => {
    const brokenUid = "broken-office-uid";
    const brokenEmail = "brokenoffice@example.com";
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "employee_invites", "RECOVER_OFFICE"), {
        businessEmail: BIZ_A,
        role: "Office Manager",
        status: "completed",
        usedBy: brokenEmail,
      });
      await setDoc(doc(db, "user_profiles", brokenUid), {
        businessEmail: brokenEmail,
        role: "Office Manager",
        email: brokenEmail,
        isEmployee: false,
        inviteCode: "RECOVER_OFFICE",
        // This regression is about tenant-root repair, not permission
        // migration. Preserve the employee's legacy module grant so the
        // repaired profile can still read its own business's Customers.
        permissions: ["customers"],
      });
    });

    const db = ctxFor(brokenUid, brokenEmail).firestore();
    await assertSucceeds(updateDoc(doc(db, "user_profiles", brokenUid), { businessEmail: BIZ_A }));
    await assertSucceeds(getDoc(doc(db, "customers", "cust_a1")));
    await assertFails(getDoc(doc(db, "customers", "cust_b1")));
  });

  test("an employee cannot swap inviteCode and use it to tenant-hop", async () => {
    const uid = "invite-swap-uid";
    const employeeEmail = "inviteswap@example.com";
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "employee_invites", "INVITE_B_TECH"), {
        businessEmail: BIZ_B,
        role: "Technician",
        status: "completed",
        usedBy: employeeEmail,
      });
      await setDoc(doc(db, "user_profiles", uid), {
        businessEmail: BIZ_A,
        role: "Technician",
        email: employeeEmail,
        isEmployee: true,
        inviteCode: "INVITE_A_TECH",
      });
    });

    const db = ctxFor(uid, employeeEmail).firestore();
    await assertFails(updateDoc(doc(db, "user_profiles", uid), {
      inviteCode: "INVITE_B_TECH",
      businessEmail: BIZ_B,
    }));
  });

  test("an orphaned owner profile CAN repair missing owner trust fields to their own auth email", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "user_profiles", "orphan-owner-uid"), {
        email: "orphanowner@example.com",
        name: "Orphan Owner",
      });
    });
    const db = ctxFor("orphan-owner-uid", "orphanowner@example.com").firestore();
    await assertSucceeds(
      setDoc(doc(db, "user_profiles", "orphan-owner-uid"), {
        email: "orphanowner@example.com",
        name: "Orphan Owner",
        businessEmail: "orphanowner@example.com",
        role: "Owner",
      }, { merge: true })
    );
  });

  test("a malformed employee profile cannot use owner repair to self-promote", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "user_profiles", "malformed-emp-uid"), {
        email: "malformedemp@example.com",
        role: "Technician",
        name: "Malformed Employee",
      });
    });
    const db = ctxFor("malformed-emp-uid", "malformedemp@example.com").firestore();
    await assertFails(
      setDoc(doc(db, "user_profiles", "malformed-emp-uid"), {
        email: "malformedemp@example.com",
        role: "Owner",
        businessEmail: "malformedemp@example.com",
      }, { merge: true })
    );
  });

  test("an existing employee CAN update harmless fields of their own profile", async () => {
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertSucceeds(updateDoc(doc(db, "user_profiles", EMP_A_UID), { goals: "Finish assigned work safely." }));
  });

  test("an employee cannot self-edit permissions or granularPermissions", async () => {
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertFails(updateDoc(doc(db, "user_profiles", EMP_A_UID), {
      permissions: ["customers", "roster", "accounting", "settings"],
    }));
    await assertFails(updateDoc(doc(db, "user_profiles", EMP_A_UID), {
      granularPermissions: {
        customers: { view: true, edit: true, delete: true },
        roster: { view: true, edit: true, delete: true },
      },
    }));
  });

  test("an employee cannot self-change identity fields used by authorization", async () => {
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertFails(updateDoc(doc(db, "user_profiles", EMP_A_UID), { name: "Owner A" }));
    await assertFails(updateDoc(doc(db, "user_profiles", EMP_A_UID), { isEmployee: false }));
  });

  test("an owner CAN edit an employee's role within their own business (legitimate admin action)", async () => {
    const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
    await assertSucceeds(updateDoc(doc(db, "user_profiles", EMP_A_UID), { role: "General Manager" }));
  });

  test("an owner cannot move their employee profile into another business", async () => {
    const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
    await assertFails(updateDoc(doc(db, "user_profiles", EMP_A_UID), { businessEmail: BIZ_B }));
  });

  test("an owner of Business B cannot edit an employee's profile in Business A", async () => {
    const db = ctxFor(OWNER_B_UID, BIZ_B).firestore();
    await assertFails(updateDoc(doc(db, "user_profiles", EMP_A_UID), { role: "Owner" }));
  });

  test("an owner of Business A cannot delete an employee profile belonging to Business B", async () => {
    const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
    await assertFails(deleteDoc(doc(db, "user_profiles", EMP_B_UID)));
  });
});

describe("isBusinessMember hardening: documents/profiles missing their tenant field", () => {
  test("a document missing businessId is not readable even by a caller whose own profile is missing businessEmail", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "user_profiles", "orphan-uid"), { role: "Technician", email: "orphan@example.com" });
      await setDoc(doc(db, "customers", "cust_orphan"), { company: "No businessId here" });
    });
    const db = ctxFor("orphan-uid", "orphan@example.com").firestore();
    await assertFails(getDoc(doc(db, "customers", "cust_orphan")));
  });

  test("a document missing businessId is not writable by that same orphaned caller", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "user_profiles", "orphan-uid2"), { role: "Technician", email: "orphan2@example.com" });
    });
    const db = ctxFor("orphan-uid2", "orphan2@example.com").firestore();
    await assertFails(setDoc(doc(db, "customers", "cust_orphan2"), { company: "No businessId" }));
  });
});

describe("isAssignedToJob hardening: cross-business job-id coincidence", () => {
  test("an employee cannot use a same-named assignment on ANOTHER business's job to write project_completion_plans under their own business", async () => {
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    // evt_b_coincidence belongs to Business B and is assigned to "Employee A"
    // by name only -- Employee A (of Business A) must not be able to use
    // that coincidence to create a plan claiming businessId: BIZ_A.
    await assertFails(
      setDoc(doc(db, "project_completion_plans", "evt_b_coincidence"), {
        businessId: BIZ_A,
        jobId: "evt_b_coincidence",
        goals: [],
        activity: [],
      })
    );
  });

  test("an employee CAN write project_completion_plans for a job actually in their own business", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "scheduling_events", "evt_a_real"), {
        businessId: BIZ_A,
        eventType: "Job",
        assignedEmployee: "Employee A",
      });
    });
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertSucceeds(
      setDoc(doc(db, "project_completion_plans", "evt_a_real"), {
        businessId: BIZ_A,
        jobId: "evt_a_real",
        goals: [],
        activity: [],
      })
    );
  });
});

describe("Team clock permission", () => {
  const OTHER_EMPLOYEE = "employee-c@example.com";

  test("a regular employee can create their own punch but cannot clock in another employee", async () => {
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertSucceeds(setDoc(doc(db, "time_clock_logs", "own_punch"), {
      businessId: BIZ_A,
      employeeEmail: EMP_A_EMAIL,
      employeeName: "Employee A",
      type: "Clock In",
      timestamp: new Date().toISOString(),
    }));
    await assertFails(setDoc(doc(db, "time_clock_logs", "other_punch_denied"), {
      businessId: BIZ_A,
      employeeEmail: OTHER_EMPLOYEE,
      employeeName: "Employee C",
      type: "Clock In",
      timestamp: new Date().toISOString(),
    }));
  });

  test("an employee explicitly granted Clock Employees In/Out can create another employee's punch and active shift", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "user_profiles", EMP_A_UID), {
        granularPermissions: {
          timeclock_team_punches: { view: false, edit: true, delete: false },
        },
      });
    });
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertSucceeds(setDoc(doc(db, "time_clock_logs", "other_punch_allowed"), {
      businessId: BIZ_A,
      employeeEmail: OTHER_EMPLOYEE,
      employeeName: "Employee C",
      type: "Clock In",
      timestamp: new Date().toISOString(),
    }));
    await assertSucceeds(setDoc(doc(db, "active_shifts", "team_active"), {
      businessId: BIZ_A,
      employeeEmail: OTHER_EMPLOYEE,
      employeeName: "Employee C",
      clockInLogId: "other_punch_allowed",
      updatedAt: new Date().toISOString(),
    }));
  });

  test("an explicit deny overrides the legacy built-in manager default", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "user_profiles", EMP_A_UID), {
        role: "General Manager",
        granularPermissions: {
          timeclock_team_punches: { view: false, edit: false, delete: false },
        },
      });
    });
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, "time_clock_logs", "manager_explicit_deny"), {
      businessId: BIZ_A,
      employeeEmail: OTHER_EMPLOYEE,
      employeeName: "Employee C",
      type: "Clock In",
      timestamp: new Date().toISOString(),
    }));
  });

  test("owners can clock in another employee", async () => {
    const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
    await assertSucceeds(setDoc(doc(db, "time_clock_logs", "owner_team_punch"), {
      businessId: BIZ_A,
      employeeEmail: OTHER_EMPLOYEE,
      employeeName: "Employee C",
      type: "Clock In",
      timestamp: new Date().toISOString(),
    }));
  });
});

describe("Employee invites cannot be minted for a business you don't belong to", () => {
  test("a Business A member cannot create an invite for Business B", async () => {
    const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
    await assertFails(setDoc(doc(db, "employee_invites", "FORGED"), { businessEmail: BIZ_B, role: "Owner", status: "pending" }));
  });

  test("a Business A member CAN create an invite for their own business", async () => {
    const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
    await assertSucceeds(setDoc(doc(db, "employee_invites", "REAL_A"), { businessEmail: BIZ_A, role: "Technician", status: "pending" }));
  });
});

describe("Notifications are per-recipient, not business-wide broadcast", () => {
  test("an employee cannot read a notification addressed to someone else in the same business", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "notifications", "notif_1"), {
        businessId: BIZ_A,
        recipientEmail: BIZ_A,
      });
    });
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertFails(getDoc(doc(db, "notifications", "notif_1")));
  });

  test("the addressed recipient CAN read their own notification", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "notifications", "notif_2"), {
        businessId: BIZ_A,
        recipientEmail: EMP_A_EMAIL,
      });
    });
    const db = ctxFor(EMP_A_UID, EMP_A_EMAIL).firestore();
    await assertSucceeds(getDoc(doc(db, "notifications", "notif_2")));
  });
});

describe("Paywall self-grant via business_profiles (regression for the open-devtools bypass)", () => {
  test("an owner cannot self-grant subscriptionActive on their own business_profiles doc", async () => {
    const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
    await assertFails(updateDoc(doc(db, "business_profiles", BIZ_A), { subscriptionActive: true }));
  });

  test("an owner cannot self-grant a bypass via bypassActive/bypassExpiresAt", async () => {
    const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
    await assertFails(
      updateDoc(doc(db, "business_profiles", BIZ_A), {
        bypassActive: true,
        bypassExpiresAt: Date.now() + 999_999_999,
      })
    );
  });

  test("an owner cannot forge stripeSubscriptionCustomerId onto their own profile", async () => {
    const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
    await assertFails(updateDoc(doc(db, "business_profiles", BIZ_A), { stripeSubscriptionCustomerId: "cus_forged" }));
  });

  test("a brand new business cannot create its business_profiles doc pre-loaded with subscriptionActive: true", async () => {
    const db = ctxFor("new-owner-uid", "newowner2@example.com").firestore();
    await assertFails(
      setDoc(doc(db, "business_profiles", "newowner2@example.com"), {
        businessNames: ["New Co"],
        subscriptionActive: true,
      })
    );
  });

  test("an owner CAN still update ordinary business_profiles fields (legitimate settings save)", async () => {
    const db = ctxFor(OWNER_A_UID, BIZ_A).firestore();
    await assertSucceeds(setDoc(doc(db, "business_profiles", BIZ_A), { businessNames: ["A Co Renamed"] }, { merge: true }));
  });

  test("an owner of Business B cannot touch Business A's subscription fields at all", async () => {
    const db = ctxFor(OWNER_B_UID, BIZ_B).firestore();
    await assertFails(updateDoc(doc(db, "business_profiles", BIZ_A), { subscriptionActive: true }));
  });
});
