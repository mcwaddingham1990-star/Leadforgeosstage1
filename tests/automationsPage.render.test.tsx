import { describe, expect, test, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { AUTOMATION_TEMPLATES, automationFromTemplate } from "../src/lib/automationEngine";

const saved = [
  { ...automationFromTemplate(AUTOMATION_TEMPLATES[0]), enabled: true, lastRunAt: "2026-10-05T12:00:00Z", lastRunStatus: "Completed", lastRunSummary: "Create Job: completed" },
  automationFromTemplate(AUTOMATION_TEMPLATES[2])
];

vi.mock("../src/firebase", () => ({ db: {}, auth: {} }));
vi.mock("../src/hooks/useFirestoreCollection", () => ({ useFirestoreCollection: () => [saved, () => undefined, async () => undefined] }));
vi.mock("../src/context/AuthContext", () => ({ useAuth: () => ({ loggedInUser: { email: "owner@example.com", role: "Owner", permissions: [] }, businessId: "owner@example.com", simulatedRole: null }) }));
vi.mock("../src/context/NavTelemetryContext", () => ({ useNavTelemetry: () => ({ triggerNotification: () => undefined, logOperationalEvent: () => undefined }) }));

describe("Automations page", () => {
  test("renders each automation's name, WHEN, IF, DO, on/off state, and last run result", async () => {
    const { AutomationsPage } = await import("../src/components/AutomationsPage");
    const html = renderToString(<AutomationsPage />).replace(/<!-- -->/g, "");
    expect(html).toContain("Estimate Accepted → Create Job");
    expect(html).toContain("WHEN");
    expect(html).toContain("Estimate Accepted");
    expect(html).toContain("Days overdue &gt; 3");
    expect(html).toContain("Create Job → Notify Owner/Manager (owner) → Send Customer Confirmation");
    expect(html).toContain("Completed");
    expect(html).toContain("1 on / 2 total");
    for (const control of ["Create automation", "Edit", "Duplicate", "History", "Delete"]) expect(html).toContain(control);
  });
});
