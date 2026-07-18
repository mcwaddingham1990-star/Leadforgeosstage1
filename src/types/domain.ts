// Canonical domain types shared across the app. Previously these were each
// defined independently inside their "owning" page component (and, for
// DocumentItem/SchedulingEvent, duplicated with conflicting shapes in
// src/initialData.ts). Page components re-export from here so existing
// imports (e.g. `import { Customer } from "./components/CustomersPage"`)
// keep working.

export interface Customer {
  id: string;
  company: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  openJobs: number;
  outstandingBalance: number;
  lifetimeValue: number;
  status: "Active" | "Inactive" | "Past Due";
  type: "Residential" | "Commercial";
  isVIP: boolean;
  recentlyAdded: boolean;
  upcomingJobDate?: string;
  requireFollowUp?: boolean;
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  source:
    | "Google Business Profile"
    | "Website"
    | "Facebook"
    | "Instagram"
    | "Referral"
    | "Phone Call"
    | "Walk-In"
    | "Manual Entry"
    | "Other";
  salesRep: string;
  status:
    | "New"
    | "Contacted"
    | "Qualified"
    | "Estimate Sent"
    | "Follow-Up Needed"
    | "Won"
    | "Lost"
    | "Archived";
  estimatedValue: number;
  dateAdded: string;
  addedDaysAgo: number;
  address?: string;
  notes?: string;
}

export interface Estimate {
  id: string;
  number: string;
  customerName: string;
  company: string;
  status: "Draft" | "Pending" | "Sent" | "Viewed" | "Accepted" | "Declined" | "Expired" | "Completed";
  salesRep: string;
  amount: number;
  createdDate: string;
  expirationDate: string;
  address?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  vendor: string;
  manufacturer: string;
  sku: string;
  barcode: string;
  qrCode: string;
  description: string;
  quantity: number;
  unit: string;
  minQuantity: number;
  maxQuantity: number;
  location: string;
  unitCost: number;
  sellingPrice: number;
  notes: string;
  photo: string;
  isFavorite: boolean;
  assignedVehicle?: string;
  assignedEmployee?: string;
  lastUpdated: string;
  customFields?: Array<{ key: string; value: string }>;
  quantityHistory: Array<{ date: string; type: string; amount: number; previous: number; current: number; notes: string }>;
  purchaseHistory: Array<{ date: string; vendor: string; amount: number; unitCost: number; total: number }>;
  usageHistory: Array<{ date: string; jobName: string; amount: number; employee: string }>;
}

export interface PurchaseRecord {
  id: string;
  vendor: string;
  receiptNumber: string;
  date: string;
  employee: string;
  itemsPurchased: string;
  totalCost: number;
}

export interface DocumentItem {
  id: string;
  name: string;
  customer: string;
  employee: string;
  vendor: string;
  job: string;
  type: string;
  uploadedBy: string;
  date: string;
  size: string;
  status: "Signed" | "Unsigned" | "Pending" | "Archived" | "Draft" | "Awaiting Signature" | "Sent" | "Viewed" | "Declined" | "Expired";
  isFavorite: boolean;
  isArchived: boolean;
  notes: string;
  tags: string[];
  estimateId: string;
  invoiceId: string;
  receiptAmount?: number;
  lastModified: string;
  url?: string;
  metaObjects?: any[];
}

/**
 * One real, timestamped revenue recognition — written by the Event
 * Engine's job-completion cascade (useEventEngineSubscribers) when a job
 * with a linked estimate is marked Completed. This is the only source of
 * truth for both the running revenue total and the dashboard revenue
 * graph — nothing here is ever synthesized or estimated.
 */
export interface RevenueEvent {
  id: string;
  date: string; // ISO timestamp, when the job was marked Completed
  amount: number;
  customer: string;
  jobId: string;
  estimateId: string;
}

/** A real employee record, written once at employee-onboarding completion (see handleCompleteEmployeeOnboarding in App.tsx). Doc id is the employee's email. */
export interface EmployeeRecord {
  id: string; // employee's email
  email: string;
  firstName: string;
  lastName: string;
  address: string;
  phone: string;
  photo: string;
  goals: string;
  hourlyRate: number;
  role: string;
  businessEmail: string;
  createdAt: string;
}

/**
 * One real clock in/out/break event, written the moment it actually
 * happens — by the employee themselves (self clock-in/out) or by an
 * authorized manager via manual time entry. This is the only source of
 * truth for hours worked, overtime, and payroll on the Time Clock page;
 * nothing there is ever a running counter kept separately from this log.
 */
export interface TimeClockLog {
  id: string;
  employeeEmail: string;
  employeeName: string;
  type: "Clock In" | "Clock Out" | "Break Start" | "Break End";
  date: string; // YYYY-MM-DD, local to whoever logged it
  time: string; // e.g. "08:00 AM"
  timestamp: string; // ISO timestamp, real ordering/aggregation key
  gps: string;
  jobId?: string;
  jobTitle?: string;
  route?: string;
  vehicle?: string;
  approved?: boolean;
  enteredManually?: boolean;
}

export interface SchedulingEvent {
  id: string;
  eventType: string; // Estimate, Consultation, Meeting, Job, Project Review, Site Visit, Follow-Up, Inspection, Delivery, Training, PTO, Vacation, Sick Day, Vehicle Maintenance, Equipment Maintenance, Inventory Delivery, Reminder, Task, Custom
  customType?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM (24-hour)
  endTime: string; // HH:MM (24-hour)
  customer: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  assignedEmployee: string;
  assignedCrew?: string;
  assignedVehicle?: string;
  estimatedDuration?: string;
  department?: string;
  location?: string;
  priority: "Low" | "Medium" | "High" | "Urgent";
  notes?: string;
  status: "Scheduled" | "Completed" | "Cancelled";
  /** Set when this job was created via Estimate->Job conversion (useDomainActions.approveEstimateToJob); lets the Event Engine's job-completion cascade find a real revenue amount instead of guessing. */
  sourceEstimateId?: string;
}
