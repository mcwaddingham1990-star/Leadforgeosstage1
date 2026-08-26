// Stock/sample data for Demo Mode -- a fixed, offline dataset for a
// fictional home-services business ("Lone Star Roofing & Exteriors") used
// purely to make every page look populated when a visitor clicks "View
// Demo" on the login screen. None of this is written to Firestore (see
// src/lib/demoMode.ts) and none of it needs to be internally perfect --
// just plausible enough that every sidebar destination has something to
// show.
import { Customer, Lead, Estimate, InventoryItem, DocumentItem, RevenueEvent, EmployeeRecord, TimeClockLog, Transaction, SchedulingEvent } from "./types/domain";
import { Invoice, Bill, Vendor, BankAccount, RecurringTransaction, MileageLog, Budget, SalesTaxRate } from "./types/accounting";
import { fullAccessGranular } from "./types/permissions";

const today = () => new Date();
const isoDate = (offsetDays: number): string => {
  const d = new Date(today());
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
};
const isoTimestamp = (offsetDays: number): string => {
  const d = new Date(today());
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
};

export const DEMO_BUSINESS_NAME = "Lone Star Roofing & Exteriors";

export const demoCustomers: Customer[] = [
  { id: "cust_1", company: "Whitfield Residence", contact: "Marcus Whitfield", phone: "(817) 555-0142", email: "marcus.whitfield@example.com", address: "8101 E Tumbleweed Trl, White Settlement, TX", openJobs: 1, outstandingBalance: 1250, lifetimeValue: 8400, status: "Active", type: "Residential", isVIP: true, recentlyAdded: false },
  { id: "cust_2", company: "Garza Family Home", contact: "Elena Garza", phone: "(817) 555-0198", email: "elena.garza@example.com", address: "412 Live Oak St, Haslet, TX", openJobs: 0, outstandingBalance: 0, lifetimeValue: 3200, status: "Active", type: "Residential", isVIP: false, recentlyAdded: false },
  { id: "cust_3", company: "Northpoint Retail Plaza", contact: "Dana Okafor", phone: "(817) 555-0176", email: "dana@northpointplaza.com", address: "2200 Business 287, Haslet, TX", openJobs: 1, outstandingBalance: 4800, lifetimeValue: 21500, status: "Active", type: "Commercial", isVIP: true, recentlyAdded: false },
  { id: "cust_4", company: "Reyes Household", contact: "Carlos Reyes", phone: "(817) 555-0111", email: "carlos.reyes@example.com", address: "930 Meadowbrook Dr, Fort Worth, TX", openJobs: 0, outstandingBalance: 0, lifetimeValue: 1150, status: "Potential", type: "Residential", isVIP: false, recentlyAdded: true },
  { id: "cust_5", company: "Blue Mesa Diner", contact: "Priya Chandra", phone: "(817) 555-0133", email: "priya@bluemesadiner.com", address: "77 Route 156, Justin, TX", openJobs: 0, outstandingBalance: 620, lifetimeValue: 6100, status: "Past Due", type: "Commercial", isVIP: false, recentlyAdded: false },
  { id: "cust_6", company: "Thompson Residence", contact: "Grace Thompson", phone: "(817) 555-0155", email: "grace.thompson@example.com", address: "56 Prairie View Ln, Haslet, TX", openJobs: 0, outstandingBalance: 0, lifetimeValue: 4300, status: "Inactive", type: "Residential", isVIP: false, recentlyAdded: false }
];

export const demoLeads: Lead[] = [
  { id: "lead_1", name: "Ben Ortiz", company: "Ortiz Residence", phone: "(817) 555-0212", email: "ben.ortiz@example.com", source: "Google Business Profile", salesRep: "Jamie Cole", status: "New", estimatedValue: 9200, dateAdded: isoDate(-1), addedDaysAgo: 1, address: "14 Coyote Run, Haslet, TX", notes: "Storm damage, wants inspection ASAP." },
  { id: "lead_2", name: "Sandra Kim", company: "Kim Family Home", phone: "(817) 555-0223", email: "sandra.kim@example.com", source: "Referral", salesRep: "Jamie Cole", status: "Contacted", estimatedValue: 6400, dateAdded: isoDate(-3), addedDaysAgo: 3, address: "901 Willow Bend, Fort Worth, TX" },
  { id: "lead_3", name: "Marcus Webb", company: "Webb Auto Body", phone: "(817) 555-0234", email: "marcus@webbautobody.com", source: "Website", salesRep: "Priya Anand", status: "Qualified", estimatedValue: 15800, dateAdded: isoDate(-6), addedDaysAgo: 6, address: "500 Industrial Blvd, Haslet, TX" },
  { id: "lead_4", name: "Aaliyah Brooks", company: "Brooks Residence", phone: "(817) 555-0245", email: "aaliyah.brooks@example.com", source: "Facebook", salesRep: "Priya Anand", status: "Estimate Sent", estimatedValue: 5100, dateAdded: isoDate(-9), addedDaysAgo: 9 },
  { id: "lead_5", name: "Trevor Nash", company: "Nash Rental Properties", phone: "(817) 555-0256", email: "trevor@nashrentals.com", source: "Phone Call", salesRep: "Jamie Cole", status: "Follow-Up Needed", estimatedValue: 22000, dateAdded: isoDate(-14), addedDaysAgo: 14, notes: "Owns 4 rental units, wants a portfolio quote." },
  { id: "lead_6", name: "Older Won Lead", company: "Delgado Residence", phone: "(817) 555-0267", email: "delgado@example.com", source: "Referral", salesRep: "Priya Anand", status: "Won", estimatedValue: 8700, dateAdded: isoDate(-30), addedDaysAgo: 30 }
];

export const demoEstimates: Estimate[] = [
  { id: "est_1", number: "EST-2026-0041", customerName: "Marcus Whitfield", company: "Whitfield Residence", status: "Accepted", salesRep: "Jamie Cole", amount: 8400, createdDate: isoDate(-10), expirationDate: isoDate(20), address: "8101 E Tumbleweed Trl, White Settlement, TX", phone: "(817) 555-0142" },
  { id: "est_2", number: "EST-2026-0042", customerName: "Dana Okafor", company: "Northpoint Retail Plaza", status: "Sent", salesRep: "Priya Anand", amount: 21500, createdDate: isoDate(-4), expirationDate: isoDate(26), address: "2200 Business 287, Haslet, TX", phone: "(817) 555-0176" },
  { id: "est_3", number: "EST-2026-0043", customerName: "Aaliyah Brooks", company: "Brooks Residence", status: "Viewed", salesRep: "Priya Anand", amount: 5100, createdDate: isoDate(-2), expirationDate: isoDate(28) },
  { id: "est_4", number: "EST-2026-0044", customerName: "Marcus Webb", company: "Webb Auto Body", status: "Draft", salesRep: "Jamie Cole", amount: 15800, createdDate: isoDate(0), expirationDate: isoDate(30), address: "500 Industrial Blvd, Haslet, TX" },
  { id: "est_5", number: "EST-2026-0038", customerName: "Grace Thompson", company: "Thompson Residence", status: "Expired", salesRep: "Jamie Cole", amount: 4300, createdDate: isoDate(-45), expirationDate: isoDate(-15) }
];

export const demoSchedulingEvents: SchedulingEvent[] = [
  {
    id: "sch_1", eventType: "Job", date: isoDate(0), startTime: "08:00", endTime: "16:00",
    customer: "Marcus Whitfield", customerPhone: "(817) 555-0142", customerAddress: "8101 E Tumbleweed Trl, White Settlement, TX",
    assignedEmployee: "Tyler Brooks", priority: "High", status: "Working", jobNumber: "JOB-2026-0031",
    title: "Full roof replacement", description: "Tear-off and replace with architectural shingles.",
    progress: 55, jobType: "Roofing", sourceEstimateId: "est_1", budget: 8400, createdAt: isoTimestamp(-9), updatedAt: isoTimestamp(0)
  },
  {
    id: "sch_2", eventType: "Job", date: isoDate(0), startTime: "09:00", endTime: "13:00",
    customer: "Northpoint Retail Plaza", customerAddress: "2200 Business 287, Haslet, TX",
    assignedEmployee: "Dana Ruiz", priority: "Urgent", status: "En Route", jobNumber: "JOB-2026-0032",
    title: "Commercial gutter repair", progress: 10, jobType: "Gutters", budget: 4800, createdAt: isoTimestamp(-2), updatedAt: isoTimestamp(0)
  },
  {
    id: "sch_3", eventType: "Job", date: isoDate(-2), startTime: "07:30", endTime: "15:30",
    customer: "Blue Mesa Diner", customerAddress: "77 Route 156, Justin, TX",
    assignedEmployee: "Tyler Brooks", priority: "Medium", status: "Completed", jobNumber: "JOB-2026-0029",
    title: "Flat roof patch & recoat", progress: 100, jobType: "Roofing", budget: 2100, createdAt: isoTimestamp(-12), updatedAt: isoTimestamp(-2)
  },
  {
    id: "sch_4", eventType: "Estimate", date: isoDate(1), startTime: "10:00", endTime: "11:00",
    customer: "Ben Ortiz", customerAddress: "14 Coyote Run, Haslet, TX", assignedEmployee: "Jamie Cole",
    priority: "High", status: "Scheduled", title: "Storm damage inspection"
  },
  {
    id: "sch_5", eventType: "Site Visit", date: isoDate(2), startTime: "13:00", endTime: "14:00",
    customer: "Trevor Nash", assignedEmployee: "Jamie Cole", priority: "Medium", status: "Scheduled",
    title: "Portfolio walkthrough - 4 units"
  },
  {
    id: "sch_6", eventType: "Job", date: isoDate(3), startTime: "08:00", endTime: "17:00",
    customer: "Sandra Kim", customerAddress: "901 Willow Bend, Fort Worth, TX", assignedEmployee: "Dana Ruiz",
    priority: "Medium", status: "Unassigned", jobNumber: "JOB-2026-0033", title: "Siding replacement", progress: 0, jobType: "Siding"
  },
  {
    id: "sch_7", eventType: "Vehicle Maintenance", date: isoDate(4), startTime: "07:00", endTime: "09:00",
    customer: "Internal", assignedEmployee: "Tyler Brooks", assignedVehicle: "Truck 3", priority: "Low", status: "Scheduled",
    title: "Truck 3 oil change & inspection"
  },
  {
    id: "sch_8", eventType: "Job", date: isoDate(-5), startTime: "08:00", endTime: "16:00",
    customer: "Grace Thompson", assignedEmployee: "Tyler Brooks", priority: "Low", status: "Completed",
    jobNumber: "JOB-2026-0027", title: "Gutter guard install", progress: 100, jobType: "Gutters", budget: 1400, createdAt: isoTimestamp(-20), updatedAt: isoTimestamp(-5)
  },
  {
    id: "sch_9", eventType: "Follow-Up", date: isoDate(0), startTime: "15:00", endTime: "15:30",
    customer: "Priya Chandra", assignedEmployee: "Priya Anand", priority: "Medium", status: "Scheduled",
    title: "Past-due invoice follow-up call"
  },
  {
    id: "sch_10", eventType: "Job", date: isoDate(7), startTime: "08:00", endTime: "18:00",
    customer: "Dana Okafor", customerAddress: "2200 Business 287, Haslet, TX", assignedEmployee: "Dana Ruiz",
    priority: "High", status: "Assigned", jobNumber: "JOB-2026-0034", title: "Retail plaza roof recoat", progress: 0, jobType: "Roofing", budget: 21500
  }
];

export const demoInventoryList: InventoryItem[] = [
  {
    id: "inv_1", name: "Architectural Shingles - Weathered Wood", category: "Roofing Materials", vendor: "ABC Supply", manufacturer: "GAF",
    sku: "GAF-WW-AR", barcode: "012345678901", qrCode: "", description: "30-yr architectural shingle bundle", quantity: 84, unit: "bundle",
    minQuantity: 20, maxQuantity: 200, location: "Warehouse A - Rack 3", unitCost: 38.5, sellingPrice: 62, notes: "", photo: "", isFavorite: true,
    lastUpdated: isoDate(-2), quantityHistory: [], purchaseHistory: [], usageHistory: []
  },
  {
    id: "inv_2", name: "Synthetic Roofing Underlayment", category: "Roofing Materials", vendor: "ABC Supply", manufacturer: "Owens Corning",
    sku: "OC-SYN-UL", barcode: "012345678902", qrCode: "", description: "10-sq roll", quantity: 12, unit: "roll",
    minQuantity: 10, maxQuantity: 60, location: "Warehouse A - Rack 3", unitCost: 92, sellingPrice: 140, notes: "Running low", photo: "", isFavorite: false,
    lastUpdated: isoDate(-1), quantityHistory: [], purchaseHistory: [], usageHistory: []
  },
  {
    id: "inv_3", name: "6\" Seamless Gutter - Aluminum", category: "Gutters", vendor: "Fort Worth Gutter Supply", manufacturer: "Berger",
    sku: "BRG-6-ALU", barcode: "012345678903", qrCode: "", description: "10ft section, white", quantity: 240, unit: "ft",
    minQuantity: 100, maxQuantity: 800, location: "Warehouse B - Bay 1", unitCost: 3.1, sellingPrice: 5.75, notes: "", photo: "", isFavorite: false,
    lastUpdated: isoDate(-4), quantityHistory: [], purchaseHistory: [], usageHistory: []
  },
  {
    id: "inv_4", name: "Vinyl Siding - Colonial Beige", category: "Siding", vendor: "ABC Supply", manufacturer: "CertainTeed",
    sku: "CT-VS-CB", barcode: "012345678904", qrCode: "", description: "Box of 24 panels", quantity: 6, unit: "box",
    minQuantity: 8, maxQuantity: 40, location: "Warehouse B - Bay 2", unitCost: 145, sellingPrice: 210, notes: "Reorder soon", photo: "", isFavorite: false,
    lastUpdated: isoDate(-3), quantityHistory: [], purchaseHistory: [], usageHistory: []
  },
  {
    id: "inv_5", name: "Roofing Nails 1.25\"", category: "Fasteners", vendor: "Home Depot Pro", manufacturer: "Grip-Rite",
    sku: "GR-RN-125", barcode: "012345678905", qrCode: "", description: "50lb box, hot-dipped galvanized", quantity: 18, unit: "box",
    minQuantity: 5, maxQuantity: 40, location: "Warehouse A - Shelf 1", unitCost: 54, sellingPrice: 78, notes: "", photo: "", isFavorite: false,
    lastUpdated: isoDate(-6), quantityHistory: [], purchaseHistory: [], usageHistory: []
  },
  {
    id: "inv_6", name: "Ridge Vent - 4ft", category: "Ventilation", vendor: "ABC Supply", manufacturer: "GAF",
    sku: "GAF-RV-4", barcode: "012345678906", qrCode: "", description: "Shingle-over ridge vent", quantity: 30, unit: "piece",
    minQuantity: 10, maxQuantity: 80, location: "Warehouse A - Rack 4", unitCost: 12, sellingPrice: 22, notes: "", photo: "", isFavorite: false,
    lastUpdated: isoDate(-8), quantityHistory: [], purchaseHistory: [], usageHistory: []
  },
  {
    id: "inv_7", name: "Caulk - Exterior Sealant", category: "Sealants", vendor: "Home Depot Pro", manufacturer: "DAP",
    sku: "DAP-EXT-SL", barcode: "012345678907", qrCode: "", description: "10.1oz tube, white", quantity: 3, unit: "tube",
    minQuantity: 12, maxQuantity: 60, location: "Warehouse A - Shelf 2", unitCost: 4.2, sellingPrice: 8, notes: "Low stock", photo: "", isFavorite: false,
    lastUpdated: isoDate(-1), quantityHistory: [], purchaseHistory: [], usageHistory: []
  },
  {
    id: "inv_8", name: "Extension Ladder 28ft", category: "Equipment", vendor: "Home Depot Pro", manufacturer: "Werner",
    sku: "WRN-EXT-28", barcode: "012345678908", qrCode: "", description: "Fiberglass extension ladder", quantity: 5, unit: "each",
    minQuantity: 2, maxQuantity: 10, location: "Warehouse B - Equipment Bay", unitCost: 310, sellingPrice: 0, notes: "Company equipment, not for resale", photo: "", isFavorite: true,
    lastUpdated: isoDate(-15), quantityHistory: [], purchaseHistory: [], usageHistory: []
  }
];

export const demoDocuments: DocumentItem[] = [
  { id: "doc_1", name: "Whitfield Roof Contract.pdf", customer: "Marcus Whitfield", employee: "Jamie Cole", vendor: "", job: "JOB-2026-0031", type: "Contract", folder: "Customers", uploadedBy: "Jamie Cole", date: isoDate(-9), size: "412 KB", status: "Signed", isFavorite: true, isArchived: false, notes: "", tags: ["contract", "roofing"], estimateId: "est_1", invoiceId: "inv_1", lastModified: isoDate(-9) },
  { id: "doc_2", name: "Northpoint Estimate.pdf", customer: "Dana Okafor", employee: "Priya Anand", vendor: "", job: "", type: "Estimate", folder: "Leads", uploadedBy: "Priya Anand", date: isoDate(-4), size: "298 KB", status: "Sent", isFavorite: false, isArchived: false, notes: "", tags: ["estimate"], estimateId: "est_2", invoiceId: "", lastModified: isoDate(-4) },
  { id: "doc_3", name: "GL Insurance Certificate 2026.pdf", customer: "", employee: "", vendor: "", job: "", type: "Insurance", folder: "Company", uploadedBy: "Owner", date: isoDate(-60), size: "1.1 MB", status: "Archived", isFavorite: false, isArchived: false, notes: "Renews annually", tags: ["insurance", "compliance"], estimateId: "", invoiceId: "", lastModified: isoDate(-60) },
  { id: "doc_4", name: "Tyler Brooks W-4.pdf", customer: "", employee: "Tyler Brooks", vendor: "", job: "", type: "Payroll", folder: "Payroll", uploadedBy: "Owner", date: isoDate(-200), size: "88 KB", status: "Signed", isFavorite: false, isArchived: false, notes: "", tags: ["payroll", "hr"], estimateId: "", invoiceId: "", lastModified: isoDate(-200) },
  { id: "doc_5", name: "ABC Supply W9.pdf", customer: "", employee: "", vendor: "ABC Supply", job: "", type: "Vendor", folder: "Company", uploadedBy: "Owner", date: isoDate(-120), size: "64 KB", status: "Signed", isFavorite: false, isArchived: false, notes: "", tags: ["vendor"], estimateId: "", invoiceId: "", lastModified: isoDate(-120) },
  { id: "doc_6", name: "Blue Mesa Diner Invoice.pdf", customer: "Priya Chandra", employee: "Priya Anand", vendor: "", job: "JOB-2026-0029", type: "Invoice", folder: "Customers", uploadedBy: "Priya Anand", date: isoDate(-2), size: "204 KB", status: "Sent", isFavorite: false, isArchived: false, notes: "Past due, follow up scheduled", tags: ["invoice"], estimateId: "", invoiceId: "inv_4", lastModified: isoDate(-2) }
];

export const demoRecentRoster: Array<{ id?: string; name: string; role: string; code: string; status: string }> = [
  { id: "roster_1", name: "Tyler Brooks", role: "Technician", code: "TB-4471", status: "Active" },
  { id: "roster_2", name: "Dana Ruiz", role: "Technician", code: "DR-2290", status: "Active" },
  { id: "roster_3", name: "Jamie Cole", role: "Sales Representative", code: "JC-1183", status: "Active" },
  { id: "roster_4", name: "Priya Anand", role: "Office Manager", code: "PA-5502", status: "Active" }
];

export const demoBulletins: any[] = [
  { id: "bltn_1", title: "New safety harness policy", content: "All roof work above 6ft now requires a harness check-in with dispatch before starting. See Training for the updated SOP.", author: "Owner", role: "Owner", date: isoDate(-3), status: "approved" },
  { id: "bltn_2", title: "Q3 top performer", content: "Congrats to Dana Ruiz for the most 5-star reviews this quarter!", author: "Priya Anand", role: "Office Manager", date: isoDate(-7), status: "approved" },
  { id: "bltn_3", title: "Requesting Friday off", content: "Would like to request PTO this Friday for a family event.", author: "Tyler Brooks", role: "Technician", date: isoDate(-1), status: "pending" }
];

export const demoNotifications: any[] = [
  { id: "notif_1", title: "Invoice overdue: Blue Mesa Diner", description: "Invoice INV-2026-0104 is 12 days past due ($620.00).", time: `${isoDate(0)} 08:15`, isRead: false, isArchived: false, category: "customer", priority: "High", relatedCustomer: "Blue Mesa Diner" },
  { id: "notif_2", title: "New lead assigned", description: "Ben Ortiz was assigned to Jamie Cole - storm damage inspection.", time: `${isoDate(-1)} 14:02`, isRead: false, isArchived: false, category: "leads", priority: "Medium", assignedUser: "Jamie Cole" },
  { id: "notif_3", title: "Low stock: Caulk - Exterior Sealant", description: "Only 3 tubes remaining, below the minimum of 12.", time: `${isoDate(-1)} 09:40`, isRead: true, isArchived: false, category: "inventory", priority: "Medium" },
  { id: "notif_4", title: "Job completed", description: "JOB-2026-0029 (Blue Mesa Diner - flat roof patch) was marked Completed.", time: `${isoDate(-2)} 16:05`, isRead: true, isArchived: false, category: "jobs", priority: "Low" },
  { id: "notif_5", title: "AI drafted a follow-up email", description: "A follow-up email for Trevor Nash's portfolio quote is ready to review.", time: `${isoDate(0)} 07:30`, isRead: false, isArchived: false, category: "ai", priority: "Low" }
];

export const demoRecentAiActions: any[] = [
  { id: "ai_1", module: "Leads", action: "Drafted follow-up email", reason: "Lead inactive for 5+ days", status: "Completed", timestamp: isoTimestamp(-1) },
  { id: "ai_2", module: "Inventory", action: "Flagged 3 low-stock items", reason: "Below reorder threshold", status: "Completed", timestamp: isoTimestamp(-1) },
  { id: "ai_3", module: "Accounting", action: "Categorized 4 scanned receipts", reason: "Auto-scan on upload", status: "Completed", timestamp: isoTimestamp(-3) },
  { id: "ai_4", module: "Scheduling", action: "Suggested crew reassignment", reason: "Weather delay on JOB-2026-0032", status: "Undone", timestamp: isoTimestamp(-4) }
];

export const demoSnapshots: any[] = [
  { id: "snap_1", pageId: "dashboard", pageName: "Dashboard", timestamp: isoTimestamp(-1), filename: `ownerslocal_snap_dashboard_${isoDate(-1).replace(/-/g, "")}_0900.png`, fileSize: "512 KB", meta: { recordCount: 24, filters: "Default Filters", details: "Dashboard snapshot." }, createdAt: isoTimestamp(-1) },
  { id: "snap_2", pageId: "accounting", pageName: "Accounting & Bookkeeping", timestamp: isoTimestamp(-4), filename: `ownerslocal_snap_accounting_${isoDate(-4).replace(/-/g, "")}_1730.png`, fileSize: "488 KB", meta: { recordCount: 18, filters: "This Month", details: "Accounting dashboard snapshot." }, createdAt: isoTimestamp(-4) },
  { id: "snap_3", pageId: "customers", pageName: "Customers", timestamp: isoTimestamp(-7), filename: `ownerslocal_snap_customers_${isoDate(-7).replace(/-/g, "")}_1200.png`, fileSize: "455 KB", meta: { recordCount: 6, filters: "All Customers", details: "Customer list snapshot." }, createdAt: isoTimestamp(-7) }
];

export const demoRevenueEvents: RevenueEvent[] = [
  { id: "rev_1", date: isoTimestamp(-2), amount: 2100, customer: "Blue Mesa Diner", jobId: "sch_3", estimateId: "" },
  { id: "rev_2", date: isoTimestamp(-5), amount: 1400, customer: "Grace Thompson", jobId: "sch_8", estimateId: "" },
  { id: "rev_3", date: isoTimestamp(-20), amount: 8400, customer: "Marcus Whitfield", jobId: "", estimateId: "est_1" },
  { id: "rev_4", date: isoTimestamp(-33), amount: 3600, customer: "Delgado Residence", jobId: "", estimateId: "" },
  { id: "rev_5", date: isoTimestamp(-48), amount: 5200, customer: "Northpoint Retail Plaza", jobId: "", estimateId: "" },
  { id: "rev_6", date: isoTimestamp(-61), amount: 1950, customer: "Garza Family Home", jobId: "", estimateId: "" }
];

const demoOwnerPermissions = ["dashboard", "revenue", "accounting", "customers", "leads", "estimates", "scheduling", "dispatch", "routes", "jobs", "timeclock", "inventory", "documents", "messages", "training", "ai_assistant", "settings", "integrations", "roster", "bulletins", "snapshots", "notifications", "owner_console"];

export const demoEmployees: EmployeeRecord[] = [
  { id: "tyler.brooks@demo.ownerslocal.app", email: "tyler.brooks@demo.ownerslocal.app", firstName: "Tyler", lastName: "Brooks", address: "Fort Worth, TX", phone: "(817) 555-0301", photo: "", goals: "Get certified for commercial flat-roof systems.", hourlyRate: 26, role: "Technician", granularPermissions: fullAccessGranular(["scheduling", "dispatch", "routes", "jobs", "timeclock", "inventory", "messages", "training"]), businessEmail: "demo@ownerslocal.app", createdAt: isoTimestamp(-400) },
  { id: "dana.ruiz@demo.ownerslocal.app", email: "dana.ruiz@demo.ownerslocal.app", firstName: "Dana", lastName: "Ruiz", address: "Haslet, TX", phone: "(817) 555-0302", photo: "", goals: "Lead a second crew by Q4.", hourlyRate: 28, role: "Technician", granularPermissions: fullAccessGranular(["scheduling", "dispatch", "routes", "jobs", "timeclock", "inventory", "messages", "training"]), businessEmail: "demo@ownerslocal.app", createdAt: isoTimestamp(-350) },
  { id: "jamie.cole@demo.ownerslocal.app", email: "jamie.cole@demo.ownerslocal.app", firstName: "Jamie", lastName: "Cole", address: "Haslet, TX", phone: "(817) 555-0303", photo: "", goals: "Close 20 estimates this quarter.", hourlyRate: 22, role: "Salesperson", granularPermissions: fullAccessGranular(["customers", "leads", "estimates", "messages"]), businessEmail: "demo@ownerslocal.app", createdAt: isoTimestamp(-500) },
  { id: "priya.anand@demo.ownerslocal.app", email: "priya.anand@demo.ownerslocal.app", firstName: "Priya", lastName: "Anand", address: "Fort Worth, TX", phone: "(817) 555-0304", photo: "", goals: "Roll out the new bulletin approval workflow.", hourlyRate: 24, role: "Office Manager", granularPermissions: fullAccessGranular(demoOwnerPermissions), businessEmail: "demo@ownerslocal.app", createdAt: isoTimestamp(-600) }
];

export const demoTimeClockLogs: TimeClockLog[] = [
  { id: "tc_1", employeeEmail: "tyler.brooks@demo.ownerslocal.app", employeeName: "Tyler Brooks", type: "Clock In", date: isoDate(0), time: "07:58 AM", timestamp: isoTimestamp(0), gps: "32.8998,-97.3428", jobId: "sch_1", jobTitle: "Full roof replacement" },
  { id: "tc_2", employeeEmail: "dana.ruiz@demo.ownerslocal.app", employeeName: "Dana Ruiz", type: "Clock In", date: isoDate(0), time: "08:55 AM", timestamp: isoTimestamp(0), gps: "32.9126,-97.3562", jobId: "sch_2", jobTitle: "Commercial gutter repair" },
  { id: "tc_3", employeeEmail: "tyler.brooks@demo.ownerslocal.app", employeeName: "Tyler Brooks", type: "Clock Out", date: isoDate(-2), time: "03:32 PM", timestamp: isoTimestamp(-2), gps: "32.8331,-97.2914", jobId: "sch_3", jobTitle: "Flat roof patch & recoat", approved: true },
  { id: "tc_4", employeeEmail: "dana.ruiz@demo.ownerslocal.app", employeeName: "Dana Ruiz", type: "Clock Out", date: isoDate(-5), time: "04:10 PM", timestamp: isoTimestamp(-5), gps: "32.9012,-97.3390", approved: true },
  { id: "tc_5", employeeEmail: "jamie.cole@demo.ownerslocal.app", employeeName: "Jamie Cole", type: "Clock In", date: isoDate(0), time: "08:02 AM", timestamp: isoTimestamp(0), gps: "32.9126,-97.3562" },
  { id: "tc_6", employeeEmail: "priya.anand@demo.ownerslocal.app", employeeName: "Priya Anand", type: "Clock In", date: isoDate(0), time: "08:00 AM", timestamp: isoTimestamp(0), gps: "32.9126,-97.3562" }
];

export const demoTransactions: Transaction[] = [
  { id: "txn_1", type: "expense", source: "manual", amount: 1450, description: "ABC Supply - shingles & underlayment", category: "Materials", date: isoDate(-9), createdAt: isoTimestamp(-9), createdBy: "Owner" },
  { id: "txn_2", type: "expense", source: "manual", amount: 210, description: "Fuel - crew trucks", category: "Fuel", date: isoDate(-3), createdAt: isoTimestamp(-3), createdBy: "Owner" },
  { id: "txn_3", type: "income", source: "invoice_payment", amount: 8400, description: "Marcus Whitfield - deposit", category: "", date: isoDate(-8), createdAt: isoTimestamp(-8), createdBy: "Owner", invoiceId: "inv_1" },
  { id: "txn_4", type: "expense", source: "ai_scan", amount: 88, description: "O'Reilly Auto Parts - Truck 3", category: "Vehicle Maintenance", date: isoDate(-6), createdAt: isoTimestamp(-6), createdBy: "Owner" },
  { id: "txn_5", type: "expense", source: "manual", amount: 145, description: "Office Depot - supplies", category: "Office Supplies", date: isoDate(-11), createdAt: isoTimestamp(-11), createdBy: "Priya Anand" },
  { id: "txn_6", type: "income", source: "invoice_payment", amount: 2100, description: "Blue Mesa Diner - progress payment", category: "", date: isoDate(-2), createdAt: isoTimestamp(-2), createdBy: "Owner", invoiceId: "inv_4" },
  { id: "txn_7", type: "expense", source: "manual", amount: 320, description: "Facebook Ads - August campaign", category: "Marketing", date: isoDate(-15), createdAt: isoTimestamp(-15), createdBy: "Owner" },
  { id: "txn_8", type: "expense", source: "manual", amount: 610, description: "Texas Mutual - monthly premium", category: "Insurance", date: isoDate(-1), createdAt: isoTimestamp(-1), createdBy: "Owner" }
];

export const demoInvoices: Invoice[] = [
  { id: "inv_1", invoiceNumber: "INV-2026-0101", customer: "Marcus Whitfield", jobId: "sch_1", estimateId: "est_1", lineItems: [{ id: "li_1", description: "Full roof replacement - architectural shingles", quantity: 1, unitPrice: 8400 }], taxRate: 0, issuedDate: isoDate(-9), dueDate: isoDate(11), status: "partial", amountPaid: 8400, createdAt: isoTimestamp(-9), createdBy: "Owner" },
  { id: "inv_2", invoiceNumber: "INV-2026-0102", customer: "Northpoint Retail Plaza", jobId: "sch_10", estimateId: "est_2", lineItems: [{ id: "li_2", description: "Retail plaza roof recoat", quantity: 1, unitPrice: 21500 }], taxRate: 8.25, issuedDate: isoDate(-4), dueDate: isoDate(26), status: "sent", amountPaid: 0, createdAt: isoTimestamp(-4), createdBy: "Owner" },
  { id: "inv_3", invoiceNumber: "INV-2026-0103", customer: "Grace Thompson", jobId: "sch_8", lineItems: [{ id: "li_3", description: "Gutter guard install", quantity: 1, unitPrice: 1400 }], taxRate: 8.25, issuedDate: isoDate(-5), dueDate: isoDate(-5), status: "paid", amountPaid: 1400, createdAt: isoTimestamp(-5), createdBy: "Owner" },
  { id: "inv_4", invoiceNumber: "INV-2026-0104", customer: "Blue Mesa Diner", jobId: "sch_3", lineItems: [{ id: "li_4", description: "Flat roof patch & recoat", quantity: 1, unitPrice: 2720 }], taxRate: 0, issuedDate: isoDate(-14), dueDate: isoDate(-2), status: "overdue", amountPaid: 2100, createdAt: isoTimestamp(-14), createdBy: "Owner" },
  { id: "inv_5", invoiceNumber: "INV-2026-0105", customer: "Delgado Residence", lineItems: [{ id: "li_5", description: "Roof repair - hail damage", quantity: 1, unitPrice: 3600 }], taxRate: 8.25, issuedDate: isoDate(-33), dueDate: isoDate(-13), status: "paid", amountPaid: 3600, createdAt: isoTimestamp(-33), createdBy: "Owner" },
  { id: "inv_6", invoiceNumber: "INV-2026-0106", customer: "Garza Family Home", lineItems: [{ id: "li_6", description: "Gutter cleaning & minor repair", quantity: 1, unitPrice: 480 }], taxRate: 8.25, issuedDate: isoDate(-1), dueDate: isoDate(29), status: "draft", amountPaid: 0, createdAt: isoTimestamp(-1), createdBy: "Owner" }
];

export const demoBills: Bill[] = [
  { id: "bill_1", billNumber: "BILL-1001", vendor: "ABC Supply", lineItems: [{ id: "bli_1", description: "Shingles & underlayment", quantity: 1, unitPrice: 1450 }], category: "Materials", issuedDate: isoDate(-9), dueDate: isoDate(21), status: "unpaid", amountPaid: 0, createdAt: isoTimestamp(-9) },
  { id: "bill_2", billNumber: "BILL-1002", vendor: "Fort Worth Gutter Supply", lineItems: [{ id: "bli_2", description: "Seamless gutter stock", quantity: 1, unitPrice: 744 }], category: "Materials", issuedDate: isoDate(-4), dueDate: isoDate(26), status: "unpaid", amountPaid: 0, createdAt: isoTimestamp(-4) },
  { id: "bill_3", billNumber: "BILL-1003", vendor: "Texas Mutual Insurance", lineItems: [{ id: "bli_3", description: "General liability - monthly premium", quantity: 1, unitPrice: 610 }], category: "Insurance", issuedDate: isoDate(-1), dueDate: isoDate(-1), status: "paid", amountPaid: 610, createdAt: isoTimestamp(-1) },
  { id: "bill_4", billNumber: "BILL-1004", vendor: "Home Depot Pro", lineItems: [{ id: "bli_4", description: "Fasteners, sealant, ladder restock", quantity: 1, unitPrice: 909 }], category: "Materials", issuedDate: isoDate(-6), dueDate: isoDate(-6), status: "overdue", amountPaid: 0, createdAt: isoTimestamp(-6) },
  { id: "bill_5", billNumber: "BILL-1005", vendor: "Meta Ads", lineItems: [{ id: "bli_5", description: "August marketing campaign", quantity: 1, unitPrice: 320 }], category: "Marketing", issuedDate: isoDate(-15), dueDate: isoDate(-15), status: "paid", amountPaid: 320, createdAt: isoTimestamp(-15) }
];

export const demoVendors: Vendor[] = [
  { id: "vend_1", name: "ABC Supply", contact: "Rick Alvarado", email: "rick@abcsupply-demo.com", phone: "(817) 555-0410", address: "1500 Distribution Way, Fort Worth, TX", category: "Roofing Materials", createdAt: isoTimestamp(-500) },
  { id: "vend_2", name: "Fort Worth Gutter Supply", contact: "Nina Fields", email: "nina@fwguttersupply-demo.com", phone: "(817) 555-0420", address: "88 Commerce St, Fort Worth, TX", category: "Gutters", createdAt: isoTimestamp(-420) },
  { id: "vend_3", name: "Home Depot Pro", contact: "Pro Desk", email: "prodesk@homedepot-demo.com", phone: "(817) 555-0430", address: "3300 N Beach St, Haltom City, TX", category: "General Supplies", createdAt: isoTimestamp(-600) },
  { id: "vend_4", name: "Texas Mutual Insurance", contact: "Client Services", email: "service@texasmutual-demo.com", phone: "(800) 555-0440", address: "Austin, TX", category: "Insurance", createdAt: isoTimestamp(-700) }
];

export const demoBankAccounts: BankAccount[] = [
  { id: "bank_1", name: "Business Checking", type: "checking", accountNumberLast4: "4821", openingBalance: 12500, openingBalanceDate: isoDate(-365), isPlaidConnected: false, createdAt: isoTimestamp(-365) },
  { id: "bank_2", name: "Business Credit Card", type: "credit_card", accountNumberLast4: "7734", openingBalance: 0, openingBalanceDate: isoDate(-365), isPlaidConnected: false, createdAt: isoTimestamp(-365) }
];

export const demoRecurringTransactions: RecurringTransaction[] = [
  { id: "rec_1", type: "bill", templateName: "Texas Mutual - monthly premium", frequency: "monthly", nextRunDate: isoDate(30), active: true, payload: { customerOrVendor: "Texas Mutual Insurance", lineItems: [{ id: "rli_1", description: "General liability premium", quantity: 1, unitPrice: 610 }], category: "Insurance", dueInDays: 0 }, createdAt: isoTimestamp(-365) },
  { id: "rec_2", type: "invoice", templateName: "Northpoint Retail Plaza - quarterly maintenance", frequency: "quarterly", nextRunDate: isoDate(60), active: true, payload: { customerOrVendor: "Northpoint Retail Plaza", lineItems: [{ id: "rli_2", description: "Quarterly roof maintenance check", quantity: 1, unitPrice: 950 }], taxRate: 8.25, dueInDays: 30 }, createdAt: isoTimestamp(-180) }
];

export const demoMileageLogs: MileageLog[] = [
  { id: "mile_1", employeeEmail: "tyler.brooks@demo.ownerslocal.app", date: isoDate(-2), startLocation: "Shop - Haslet, TX", endLocation: "77 Route 156, Justin, TX", miles: 14.2, purpose: "Job site travel", rateApplied: 0.67, amount: 9.51, jobId: "sch_3", createdAt: isoTimestamp(-2) },
  { id: "mile_2", employeeEmail: "dana.ruiz@demo.ownerslocal.app", date: isoDate(-5), startLocation: "Shop - Haslet, TX", endLocation: "56 Prairie View Ln, Haslet, TX", miles: 6.8, purpose: "Job site travel", rateApplied: 0.67, amount: 4.56, jobId: "sch_8", createdAt: isoTimestamp(-5) },
  { id: "mile_3", employeeEmail: "jamie.cole@demo.ownerslocal.app", date: isoDate(-1), startLocation: "Shop - Haslet, TX", endLocation: "500 Industrial Blvd, Haslet, TX", miles: 9.4, purpose: "Sales call", rateApplied: 0.67, amount: 6.3, createdAt: isoTimestamp(-1) }
];

export const demoBudgets: Budget[] = [
  { id: "bud_1", accountId: "acct_cogs_materials", period: isoDate(0).slice(0, 7), amount: 6000 },
  { id: "bud_2", accountId: "acct_marketing_expense", period: isoDate(0).slice(0, 7), amount: 800 },
  { id: "bud_3", accountId: "acct_fuel_expense", period: isoDate(0).slice(0, 7), amount: 500 }
];

export const demoSalesTaxRates: SalesTaxRate[] = [
  { id: "tax_1", name: "Tarrant County, TX", rate: 8.25, isDefault: true },
  { id: "tax_2", name: "Out of County", rate: 6.25, isDefault: false }
];

/** Bundles every collection above so App.tsx can seed all setters in one call when a visitor clicks "View Demo". */
export function buildDemoData() {
  return {
    customers: demoCustomers,
    leads: demoLeads,
    estimates: demoEstimates,
    schedulingEvents: demoSchedulingEvents,
    inventoryList: demoInventoryList,
    documents: demoDocuments,
    recentRoster: demoRecentRoster,
    bulletins: demoBulletins,
    notifications: demoNotifications,
    recentAiActions: demoRecentAiActions,
    snapshots: demoSnapshots,
    revenueEvents: demoRevenueEvents,
    employees: demoEmployees,
    timeClockLogs: demoTimeClockLogs,
    transactions: demoTransactions,
    invoices: demoInvoices,
    bills: demoBills,
    vendors: demoVendors,
    bankAccounts: demoBankAccounts,
    recurringTransactions: demoRecurringTransactions,
    mileageLogs: demoMileageLogs,
    budgets: demoBudgets,
    salesTaxRates: demoSalesTaxRates
  };
}
