// Short, first-visit orientation copy for every sidebar destination.
// PageTutorialPopup (src/components/PageTutorialPopup.tsx) shows one of
// these the first time a given user's account ever lands on that screen,
// then never again (tracked per-person in localStorage — see the
// tutorial effect in App.tsx).
export interface PageTutorial {
  icon: string;
  title: string;
  body: string[];
}

export const PAGE_TUTORIALS: Record<string, PageTutorial> = {
  dashboard: {
    icon: "📊",
    title: "Welcome to your Dashboard",
    body: [
      "This is your home base — revenue, active leads, today's jobs, and the company bulletin board at a glance.",
      "Use \"Configure Slots\" to choose which three metrics show up here, and the sidebar on the left to get anywhere else in the app."
    ]
  },
  revenue: {
    icon: "📈",
    title: "Revenue",
    body: [
      "A real-time breakdown of income vs. expenses by category, plus payroll — everything here is computed from actual invoices, transactions, and time clock entries, never a guessed number.",
      "Switch the balance view (Day / Pay Period / Quarter / Annual / Total) to change the window you're looking at."
    ]
  },
  accounting: {
    icon: "🧮",
    title: "Accounting & Bookkeeping",
    body: [
      "Real double-entry books that sync automatically with every event in the app — an invoice, a paid bill, a completed job all post their own journal entries here.",
      "Use the tabs above to move between Invoices, Expenses, Banking, Chart of Accounts, Journal Entries, and Reports."
    ]
  },
  customers: {
    icon: "👥",
    title: "Customers",
    body: [
      "Every customer record lives here — contact info, open jobs, outstanding balance, and lifetime value.",
      "Click into a customer to see their full history, or use the status/type filters to segment your list."
    ]
  },
  leads: {
    icon: "🎯",
    title: "Leads",
    body: [
      "New business enters here before it becomes a customer. Track source, sales rep, and status from New through Won or Lost.",
      "Convert a lead to an estimate right from its card once you're ready to quote the job."
    ]
  },
  estimates: {
    icon: "📝",
    title: "Estimates & Bids",
    body: [
      "Build and send quotes, then track them through Sent, Viewed, Accepted, or Declined.",
      "Accepting an estimate is what lets you convert it straight into a scheduled job — no re-typing the details."
    ]
  },
  scheduling: {
    icon: "📅",
    title: "Scheduling",
    body: [
      "Your calendar for jobs, estimates, meetings, and everything else your crew needs to be somewhere for.",
      "Assign an employee, crew, or vehicle to each event, and set a priority so nothing urgent gets buried."
    ]
  },
  dispatch: {
    icon: "🚚",
    title: "Dispatch",
    body: [
      "A live operational view of every job in progress today — who's assigned, en route, on-site, or done.",
      "Use this when you need to reassign a crew or check status without digging through the full calendar."
    ]
  },
  routes: {
    icon: "🗺️",
    title: "Interactive Map & Routes",
    body: [
      "See today's jobs, crews, and vehicles plotted on a live map so you can spot the fastest routing at a glance.",
      "Great for last-minute reassignments when something's closer to one tech than another."
    ]
  },
  jobs: {
    icon: "💼",
    title: "Jobs",
    body: [
      "Every job that's been scheduled, in progress, or completed — with its budget, checklist, materials, and activity log.",
      "A job's progress and revenue are the real source of truth for what shows up on your Dashboard and Revenue pages."
    ]
  },
  timeclock: {
    icon: "⏱️",
    title: "Time Clock",
    body: [
      "Clock in/out records for every employee, tied to the job and location they were working.",
      "Owners and managers can review, approve, or manually correct entries here — this feeds payroll directly."
    ]
  },
  inventory: {
    icon: "📦",
    title: "Inventory",
    body: [
      "Track materials, equipment, and supplies — quantity on hand, reorder thresholds, cost, and where it's stored.",
      "Items below their minimum quantity are flagged automatically so restocking never comes as a surprise."
    ]
  },
  documents: {
    icon: "📁",
    title: "Documents",
    body: [
      "A filing cabinet for contracts, estimates, invoices, insurance certs, and anything else — organized into folders by customer, job, vendor, or company.",
      "Documents support real e-signatures with a full audit trail when you need something signed."
    ]
  },
  messages: {
    icon: "💬",
    title: "Messages",
    body: [
      "Conversations with customers and your team in one place, so nothing important gets lost in a text thread or someone's personal inbox."
    ]
  },
  training: {
    icon: "🎓",
    title: "Training",
    body: [
      "Onboarding material, SOPs, and safety policies for your crew — the same place bulletins like safety-policy updates point back to."
    ]
  },
  ai_assistant: {
    icon: "🤖",
    title: "AI Assistant",
    body: [
      "Ask questions about your business data, or hand off busywork — drafting follow-ups, categorizing receipts, summarizing what needs attention.",
      "Every AI action it takes is logged and reversible from the Audit Log Checklist, never applied silently."
    ]
  },
  settings: {
    icon: "⚙️",
    title: "Settings",
    body: [
      "Business profile, appearance (light/dark theme), roles & permissions, payroll configuration, and every other account-level setting lives here."
    ]
  },
  integrations: {
    icon: "🔗",
    title: "Integrations",
    body: [
      "Connect banking (Plaid), and other outside services your business relies on. Connection status for each shows right here."
    ]
  },
  roster: {
    icon: "📋",
    title: "Roster",
    body: [
      "Your full team list — roles, invite codes, and status. This is where you add a new employee or adjust someone's role."
    ]
  },
  bulletins: {
    icon: "📌",
    title: "Bulletins",
    body: [
      "The company announcement board. Managers can approve or reject submissions before they go live to the whole team."
    ]
  },
  snapshots: {
    icon: "📸",
    title: "Snapshots Folder",
    body: [
      "A snapshot freezes a page's current numbers and filters at a point in time — handy for before/after comparisons or a record you want to hand off.",
      "Take one anytime with the Snapshot button that follows you around the app."
    ]
  },
  notifications: {
    icon: "🔔",
    title: "Notifications",
    body: [
      "Every real-time alert the app generates — overdue invoices, low stock, new leads, completed jobs — lands here, filterable by priority, category, or who it's assigned to."
    ]
  },
  owner_console: {
    icon: "🛠️",
    title: "Owner Console",
    body: [
      "Owner-only diagnostics: system health, database state, AI usage, security, and backups in one place."
    ]
  }
};
