Warning: truncated output (original token count: 120816)
Total output lines: 8092

import React, { useState, useEffect, useRef } from "react";
import { db, auth } from "./firebase";
import { doc, setDoc, getDoc, getDocFromServer, writeBatch } from "firebase/firestore";
import { fullAccessGranular, defaultGranularFromModuleList, hasPermission, GranularPermissions } from "./types/permissions";
import { RevenueEvent, EmployeeRecord, TimeClockLog, Transaction } from "./types/domain";
import { Account, JournalEntry, Invoice, Bill, Vendor, BankAccount, RecurringTransaction, MileageLog, Budget, SalesTaxRate, DEFAULT_CHART_OF_ACCOUNTS } from "./types/accounting";
import { postTransactionEntry } from "./lib/accountingEngine";
import { registerForPushNotifications } from "./lib/pushNotifications";
import { TimeClockApprovalModal } from "./components/TimeClockApprovalModal";
import { RolePermissionEditorModal, MODULE_CATALOG } from "./components/RolePermissionEditorModal";
import { LogTransactionModal } from "./components/LogTransactionModal";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";
import { 
  Mail, 
  Lock, 
  User, 
  UserPlus, 
  Eye, 
  EyeOff, 
  HelpCircle, 
  Shield, 
  Info, 
  CheckCircle, 
  AlertCircle,
  LogOut,
  ChevronRight,
  Sparkles,
  ExternalLink,
  Laptop,
  Check,
  RotateCcw,
  ArrowLeft,
  ChevronDown,
  Plus,
  Minus,
  Copy,
  Users,
  Settings,
  ShieldAlert,
  Edit,
  Trash2,
  CopyIcon,
  CheckSquare,
  // New icons for sidebar and dashboard
  LayoutDashboard,
  Target,
  FileText,
  Calendar,
  Truck,
  MapPin,
  Briefcase,
  Clock,
  Package,
  FolderOpen,
  MessageSquare,
  GraduationCap,
  Link,
  ChevronLeft,
  Moon,
  Sun,
  Maximize2,
  Minimize2,
  RefreshCw,
  Megaphone,
  Trophy,
  Flame,
  UserCheck,
  Compass,
  PlusCircle,
  Wrench,
  Bell,
  BellRing,
  Menu,
  Sliders
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";
import { LineChart, Line } from "recharts";
import { DollarSign, TrendingUp, TrendingDown, Search, Filter, Landmark, Box, CreditCard, Camera, Star } from "lucide-react";
import { CustomersPage, Customer, INITIAL_CUSTOMERS } from "./components/CustomersPage";
import { LeadsPage, INITIAL_LEADS, Lead } from "./components/LeadsPage";
import { SnapshotsPage } from "./components/SnapshotsPage";
import { EstimatesPage, INITIAL_ESTIMATES, Estimate } from "./components/EstimatesPage";
import { SchedulingPage, SchedulingEvent } from "./components/SchedulingPage";
import { DispatchPage } from "./components/DispatchPage";
import { JobsPage } from "./components/JobsPage";
import { TimeClockPage } from "./components/TimeClockPage";
import { InventoryPage, INITIAL_INVENTORY, InventoryItem } from "./components/InventoryPage";
import { InteractiveMapPage } from "./components/InteractiveMapPage";
import { DocumentsPage, DocumentItem } from "./components/DocumentsPage";
import { AccountingPage } from "./components/AccountingPage";
import { PlaidConnectButton } from "./components/PlaidConnectButton";
import { RosterPage } from "./components/RosterPage";
import { MessagesPage } from "./components/MessagesPage";
import { TrainingPage } from "./components/TrainingPage";
import { AIAssistantPage } from "./components/AIAssistantPage";
import SettingsPage from "./components/SettingsPage";
import { StructuredAddressFields } from "./components/StructuredAddressFields";
import { IntegrationsPage } from "./components/IntegrationsPage";
import { NotificationsPage } from "./components/NotificationsPage";
import { OwnerConsolePage } from "./components/OwnerConsolePage";
import {
  INITIAL_DASHBOARD_LEADS,
  INITIAL_RECENT_ROSTER,
  INITIAL_DOCUMENTS,
  INITIAL_SCHEDULING_EVENTS,
  INITIAL_RECENT_AI_ACTIONS,
  INITIAL_SNAPSHOTS
} from "./initialData";
import { validateConnection } from "./lib/firestoreService";
import { useFirestoreCollection } from "./hooks/useFirestoreCollection";
import { AuthContext, AuthContextValue } from "./context/AuthContext";
import { DomainDataContext, DomainDataContextValue } from "./context/DomainDataContext";
import { NavTelemetryContext, NavTelemetryContextValue } from "./context/NavTelemetryContext";
import { useEventEngineSubscribers } from "./hooks/useEventEngineSubscribers";
import darkLoginBackground from "../Src/Assets/Login/Darkloginbg.png";
import darkLoginCard from "../Src/Assets/Login/Darkmodecard.png";

export type WorkspaceTheme = "light-basic" | "dark-basic" | "dark-dynamic";

const workspaceThemeFromSetting = (value?: string): WorkspaceTheme => {
  if (value === "Dark Mode Dynamic") return "dark-dynamic";
  if (value === "Dark Mode Basic" || value === "Basic Dark") return "dark-basic";
  return "light-basic";
};

// Exact fingerprints of demo records used by the original prototype. Older
// accounts may still have these rows in Firestore even though the seed arrays
// are now empty. Matching record content protects legitimate user data.
const LEGACY_INVENTORY_FINGERPRINTS = new Set([
  "2x4 Stud Spruce-Pine-Fir|SPF-248-KD",
  "DeWalt DCD771C2 Hammer Drill|DEW-DCD771",
  "Copper Pipe Type L 3/4in x 10ft|COP-34-10",
  "14/2 Romex NMB Wire 250ft|ROM-142-250",
  "Quikrete Concrete Mix 80lb|QUIK-80-BAG",
  "Generac GP6500 CO Sense Generator|GEN-GP6500"
]);

const LEGACY_TIME_LOG_NAMES = new Set(["Theresa W.", "Albert F.", "Esther H.", "James W.", "Brandon M."]);

const isLegacyInventoryItem = (item: InventoryItem) =>
  LEGACY_INVENTORY_FINGERPRINTS.has(`${item.name}|${item.sku}`);

const isLegacyTimeLog = (log: TimeClockLog) =>
  /^log_[1-8]$/.test(log.id) && log.date === "2026-07-06" && LEGACY_TIME_LOG_NAMES.has(log.employeeName);

class MapPageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  declare readonly props: Readonly<{ children: React.ReactNode }>;
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Interactive map failed safely:", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="rounded-3xl border border-red-200 bg-white p-6 text-left shadow-sm">
          <h2 className="text-base font-extrabold text-slate-800">The map could not load</h2>
          <p className="mt-2 text-sm text-slate-600">
            OwnersLOCAL is still running. Close this page and reopen the map to try again.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

export interface SelectedRole {
  id: string;
  name: string;
  count: number;
  description: string;
  isCustom?: boolean;
  permissions: string[];
  // Real per-module capabilities — e.g. this role can have Routes: Edit
  // while another role has Routes: View only, instead of one flat
  // view/create/edit/... set applied uniformly across every module.
  modulePermissions: GranularPermissions;
}

export const DEFAULT_ROLES_DATA: Record<string, { name: string; description: string; permissions: string[] }> = {
  owner: {
    name: "Owner",
    description: "Everything",
    permissions: ["dashboard", "leads", "jobs", "customers", "messages", "scheduling", "dispatch", "timeclock", "routes", "estimates", "documents", "ai_assistant", "inventory", "settings", "training"]
  },
  general_manager: {
    name: "General Manager",
    description: "Everything except ownership and account deletion",
    permissions: ["dashboard", "leads", "jobs", "customers", "messages", "scheduling", "dispatch", "timeclock", "routes", "estimates", "documents", "ai_assistant", "inventory", "settings", "training"]
  },
  office_manager: {
    name: "Office Manager",
    description: "Day-to-day office and field operations",
    permissions: ["dashboard", "revenue", "accounting", "customers", "leads", "estimates", "scheduling", "dispatch", "routes", "jobs", "timeclock", "inventory", "documents", "messages", "roster", "training", "settings"]
  },
  operations_manager: {
    name: "Operations Manager",
    description: "Dashboard, Scheduling, Dispatch, Routes, Jobs, Inventory, etc.",
    permissions: ["dashboard", "scheduling", "dispatch", "routes", "jobs", "inventory", "documents", "messages", "training"]
  },
  dispatcher: {
    name: "Dispatcher",
    description: "Dispatch, Routes, Map, Jobs, Sched",
    permissions: ["dashboard", "scheduling", "dispatch", "routes", "jobs", "customers", "messages"]
  },
  scheduler: {
    name: "Scheduler",
    description: "Dashboard, Scheduling, Customers, Jobs, Messages",
    permissions: ["dashboard", "scheduling", "customers", "jobs", "messages"]
  },
  sales_manager: {
    name: "Sales Manager",
    description: "Dashboard, Customers, Leads, Estimates, Messages, AI Assistant",
    permissions: ["dashboard", "customers", "leads", "estimates", "messages", "ai_assistant"]
  },
  sales_representative: {
    name: "Sales Representative",
    description: "Leads, CRM, Estimates, Docs",
    permissions: ["dashboard", "customers", "leads", "estimates", "messages", "ai_assistant"]
  },
  estimator: {
    name: "Estimator",
    description: "Estimates, Bids, Takeoffs, Reports",
    permissions: ["dashboard", "customers", "leads", "estimates", "documents", "messages", "ai_assistant"]
  },
  project_manager: {
    name: "Project Manager",
    description: "Dashboard, Customers, Scheduling, Dispatch, Routes, Jobs, Inventory, Documents, Messages",
    permissions: ["dashboard", "customers", "scheduling", "dispatch", "routes", "jobs", "inventory", "documents", "messages"]
  },
  field_supervisor: {
    name: "Field Supervisor",
    description: "Dashboard, Jobs, Scheduling, Dispatch, Routes, Inventory, Documents, Messages, Training",
    permissions: ["dashboard", "jobs", "scheduling", "dispatch", "routes", "inventory", "documents", "messages", "training"]
  },
  technician: {
    name: "Technician",
    description: "Dashboard, Jobs, Time Clock, Messages, Documents, Training",
    permissions: ["dashboard", "jobs", "timeclock", "messages", "documents", "training"]
  },
  laborer: {
    name: "Laborer",
    description: "Dashboard, Jobs, Time Clock, Training, Messages",
    permissions: ["dashboard", "jobs", "timeclock", "training", "messages"]
  },
  apprentice: {
    name: "Apprentice",
    description: "Dashboard, Jobs, Time Clock, Training, Messages",
    permissions: ["dashboard", "jobs", "timeclock", "training", "messages"]
  },
  installer: {
    name: "Installer",
    description: "Dashboard, Jobs, Time Clock, Inventory, Documents, Messages",
    permissions: ["dashboard", "jobs", "timeclock", "inventory", "documents", "messages"]
  },
  driver: {
    name: "Driver",
    description: "Dashboard, Routes, Jobs, Time Clock, Messages",
    permissions: ["dashboard", "routes", "jobs", "timeclock", "messages"]
  },
  warehouse_manager: {
    name: "Warehouse / Inventory Manager",
    description: "Dashboard, Inventory, Documents, Messages",
    permissions: ["dashboard", "inventory", "documents", "messages"]
  },
  purchasing_manager: {
    name: "Purchasing Manager",
    description: "Dashboard, Inventory, Documents",
    permissions: ["dashboard", "inventory", "documents"]
  },
  customer_service: {
    name: "Customer Service Representative",
    description: "Dashboard, Customers, Leads, Scheduling, Messages",
    permissions: ["dashboard", "customers", "leads", "scheduling", "messages"]
  },
  marketing_manager: {
    name: "Marketing Manager",
    description: "Dashboard, Customers, Leads, AI Assistant",
    permissions: ["dashboard", "customers", "leads", "ai_assistant"]
  },
  accountant: {
    name: "Accountant / Bookkeeper",
    description: "Dashboard, Customers, Estimates",
    permissions: ["dashboard", "customers", "estimates"]
  },
  hr_manager: {
    name: "HR Manager",
    description: "Dashboard, Documents, Training",
    permissions: ["dashboard", "documents", "training"]
  },
  safety_manager: {
    name: "Safety Manager",
    description: "Dashboard, Jobs, Training, Documents",
    permissions: ["dashboard", "jobs", "training", "documents"]
  },
  it_administrator: {
    name: "IT Administrator",
    description: "Everything except Owner company settings",
    permissions: ["dashboard", "leads", "jobs", "customers", "messages", "scheduling", "dispatch", "timeclock", "routes", "estimates", "documents", "ai_assistant", "inventory", "training"]
  }
};

/** Repairs legacy onboarding role payloads before they reach the UI/invite loop. */
export function normalizeSelectedRoles(value: unknown): SelectedRole[] {
  if (!Array.isArray(value)) return [];
  const roles = new Map<string, SelectedRole>();

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Partial<SelectedRole>;
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name) continue;
    const fallbackId = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : `custom_${fallbackId}`;
    const defaults = DEFAULT_ROLES_DATA[id] || (id === "field_technician" ? DEFAULT_ROLES_DATA.technician : undefined);
    const suppliedPermissions = Array.isArray(candidate.permissions)
      ? candidate.permissions.filter((permission): permission is string => typeof permission === "string" && !!permission)
      : [];
    // Built-in roles evolve as operational modules become real. Union their
    // current defaults into saved onboarding payloads so an older profile
    // cannot keep generating permanently under-permissioned invite codes.
    const permissions = [...new Set([...(defaults?.permissions || []), ...suppliedPermissions])];
    if (!permissions.length) permissions.push("dashboard", "messages");
    const rawCount = (candidate as { count?: unknown }).count;
    const numericCount = rawCount === null || rawCount === undefined || rawCount === "" ? Number.NaN : Number(rawCount);
    const count = Number.isFinite(numericCount) ? Math.max(id === "owner" ? 1 : 0, Math.floor(numericCount)) : 1;
    const fallbackLevel = id === "owner" ? "delete" : id.includes("manager") ? "edit" : "view";
    const fallbackModulePermissions = defaultGranularFromModuleList(permissions, fallbackLevel);
    const modulePermissions = candidate.modulePermissions && typeof candidate.modulePermissions === "object"
      ? { ...fallbackModulePermissions, ...candidate.modulePermissions }
      : fallbackModulePermissions;
    const normalized: SelectedRole = {
      id,
      name,
      count,
      description: typeof candidate.description === "string" ? candidate.description : defaults?.description || "Custom user defined role",
      isCustom: candidate.isCustom ?? !defaults,
      permissions,
      modulePermissions
    };
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const existing = roles.get(key);
    roles.set(key, existing ? {
      ...existing,
      count: Math.max(existing.count, normalized.count),
      permissions: [...new Set([...existing.permissions, ...normalized.permissions])],
      modulePermissions: { ...existing.modulePermissions, ...normalized.modulePermissions }
    } : normalized);
  }

  return [...roles.values()];
}

// Asset URLs from OwnersLOCAL GitHub
const BRAND_ICON_DATA_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAXqBgADASIAAhEBAxEB/8QAHgAAAQUAAwEBAAAAAAAAAAAAAAECAwQFBgcICQr/xABUEAACAQMBBQUACwwIBgEDBAMAAQIDBBExBRITIWEGBxRBUQgWIjJSVHGBkaGxCRcZNDZCU2Jzg6PRFSMkJSYzN5I1Q0STosFysuHwRVVjgvEnGP/EAB0BAAEFAQEBAQAAAAAAAAAAAAABAgMEBQYHCAn/xAA+EQACAgECAggDBwMDBAIDAQAAAQIDEQQSBRMGFCExNFFScRZBkQcVIjI1YXIkM1MjQrFDgaHBJWKC0fBE/9oADAMBAAIRAxEAPwD5VAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+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…41644 tokens truncated…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";
const CARD_BG_URL = "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Assets/Login/lightmodecardbg.jpg";
const SIGNIN_BUTTON_URL = "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Assets/Signinbuttom.png";
const GO_BUTTON_URL = "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Assets/Gobutton.png";

// Operating System Screens mapping
const OS_SCREENS = [
  { id: "dashboard", label: "Dashboard", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightdashboard.jpg", icon: "📊", top: "12%", bottom: "17%" },
  { id: "revenue", label: "Revenue", url: "", icon: "📈", top: "12%", bottom: "17%" },
  { id: "accounting", label: "Accounting", url: "", icon: "🧮", top: "12%", bottom: "17%" },
  { id: "customers", label: "Customers", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightcustomers.jpg", icon: "👥", top: "27%", bottom: "32%" },
  { id: "leads", label: "Leads", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightleads.jpg", icon: "🎯", top: "17%", bottom: "22%" },
  { id: "estimates", label: "Estimates & Bids", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightestimatesbids.jpg", icon: "📝", top: "57%", bottom: "62%" },
  { id: "scheduling", label: "Scheduling", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightscheduling.jpg", icon: "📅", top: "37%", bottom: "42%" },
  { id: "dispatch", label: "Dispatch", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightdispatch.jpg", icon: "🚚", top: "42%", bottom: "47%" },
  { id: "routes", label: "Interactive Map & Routes", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightroutes.jpg", icon: "🗺️", top: "52%", bottom: "57%" },
  { id: "jobs", label: "Jobs", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightjobs.jpg", icon: "💼", top: "22%", bottom: "27%" },
  { id: "timeclock", label: "Time Clock", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lighttimeclock.jpg", icon: "⏱️", top: "47%", bottom: "52%" },
  { id: "inventory", label: "Inventory", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightinventory.jpg", icon: "📦", top: "72%", bottom: "77%" },
  { id: "documents", label: "Documents", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightdocuments.jpg", icon: "📁", top: "62%", bottom: "67%" },
  { id: "messages", label: "Messages", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightmessages.jpg", icon: "💬", top: "32%", bottom: "37%" },
  { id: "training", label: "Training", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lighttraining.jpg", icon: "🎓", top: "82%", bottom: "87%" },
  { id: "ai_assistant", label: "AI Assistant", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightaiassistant.jpg", icon: "🤖", top: "67%", bottom: "72%", badge: "AI" },
  { id: "settings", label: "Settings", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightsettings.png", icon: "⚙️", top: "77%", bottom: "82%" },
  { id: "integrations", label: "Integrations", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightsettings.png", icon: "🔗", top: "77%", bottom: "82%" },
  { id: "roster", label: "Roster", url: "https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Lightsettings.png", icon: "📋", top: "77%", bottom: "82%" },
  { id: "bulletins", label: "Bulletins", url: "", icon: "📌", top: "77%", bottom: "82%" },
  { id: "snapshots", label: "Snapshots Folder", url: "", icon: "📸", top: "82%", bottom: "87%" },
  { id: "notifications", label: "Notifications", url: "", icon: "🔔", top: "82%", bottom: "87%" },
  { id: "owner_console", label: "Owner Console", url: "", icon: "🛠️", top: "82%", bottom: "87%" }
];

/**
 * Buckets the real revenueEvents log (written by the Event Engine's
 * job-completion cascade) and real transactions log (manual/scanned/payroll
 * entries — see LogTransactionModal + handleRunPayroll) into real calendar
 * periods for the revenue chart, plus real prior-period/current-period
 * totals for the comparison badge and summary cards. Accrued Taxes is
 * deliberately not derived here — there's no real tax engine anywhere in
 * the app to compute a real liability from.
 */
function getRevenueChartData(
  filter: string,
  revenueEvents: RevenueEvent[],
  transactions: Transaction[] = []
): {
  series: Array<{ time: string; Revenue: number; Expenses: number; Profit: number }>;
  currentTotal: number;
  priorTotal: number;
  currentExpenseTotal: number;
  currentPayrollTotal: number;
  priorExpenseTotal: number;
} {
  const now = new Date();
  const expenseTx = transactions.filter((t) => t.type === "expense");
  const payrollTx = expenseTx.filter((t) => t.category === "Payroll");
  // Real revenue = job-completion events (revenueEvents) + manually-logged
  // or scanned income transactions (e.g. a photographed check) — both are
  // real money in, and logging one should actually move these totals.
  const incomeTx = transactions.filter((t) => t.type === "income");
  const revenueSource: Array<{ amount: number; date: string }> = [...revenueEvents, ...incomeTx];

  const sumInRange = (items: Array<{ amount: number; date: string }>, start: Date, end: Date) =>
    items
      .filter((e) => {
        const d = new Date(e.date);
        return d >= start && d < end;
      })
      .reduce((sum, e) => sum + e.amount, 0);

  const buildRow = (time: string, start: Date, end: Date) => {
    const Revenue = sumInRange(revenueSource, start, end);
    const Expenses = sumInRange(expenseTx, start, end);
    return { time, Revenue, Expenses, Profit: Revenue - Expenses };
  };

  const buildDays = (count: number, labelFn: (d: Date) => string) => {
    const days: Array<{ time: string; Revenue: number; Expenses: number; Profit: number }> = [];
    for (let i = count - 1; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);
      days.push(buildRow(labelFn(dayStart), dayStart, dayEnd));
    }
    return days;
  };

  const withTotals = (
    series: Array<{ time: string; Revenue: number; Expenses: number; Profit: number }>,
    periodStart: Date,
    periodEnd: Date,
    priorTotal: number
  ) => {
    const periodDuration = Math.max(0, periodEnd.getTime() - periodStart.getTime());
    return {
      series,
      currentTotal: filter === "Day"
        ? series.reduce((s, d) => s + d.Revenue, 0)
        : (series[series.length - 1]?.Revenue || 0),
      priorTotal,
      currentExpenseTotal: filter === "Day"
        ? series.reduce((s, d) => s + d.Expenses, 0)
        : (series[series.length - 1]?.Expenses || 0),
      currentPayrollTotal: sumInRange(payrollTx, periodStart, periodEnd),
      priorExpenseTotal: sumInRange(expenseTx, new Date(periodStart.getTime() - periodDuration), periodStart)
    };
  };

  // Daily view intentionally shows each day's activity. Every wider view is
  // cumulative so a later expense lowers the running profit by only that
  // expense instead of making the graph look as though earlier income vanished.
  const cumulative = (rows: Array<{ time: string; Revenue: number; Expenses: number; Profit: number }>) => {
    let revenue = 0;
    let expenses = 0;
    return rows.map((row) => {
      revenue += row.Revenue;
      expenses += row.Expenses;
      return { ...row, Revenue: revenue, Expenses: expenses, Profit: revenue - expenses };
    });
  };

  if (filter === "Day") {
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const series = buildDays(30, (d) => d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }));
    const priorTotal = sumInRange(
      revenueSource,
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - 59),
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
    );
    return withTotals(series, periodStart, periodEnd, priorTotal);
  }

  if (filter === "Week") {
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const dailyRows = buildDays(7, (d) => d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }));
    const priorTotal = sumInRange(
      revenueSource,
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13),
      periodStart
    );
    return withTotals(cumulative(dailyRows), periodStart, periodEnd, priorTotal);
  }

  if (filter === "Pay Period") {
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const dailyRows = buildDays(14, (d) => d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }));
    const priorTotal = sumInRange(
      revenueSource,
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - 27),
      periodStart
    );
    return withTotals(cumulative(dailyRows), periodStart, periodEnd, priorTotal);
  }

  if (filter === "Quarter") {
    const months: Array<{ time: string; Revenue: number; Expenses: number; Profit: number }> = [];
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    for (let month = quarterStartMonth; month <= now.getMonth(); month++) {
      const monthStart = new Date(now.getFullYear(), month, 1);
      const monthEnd = new Date(now.getFullYear(), month + 1, 1);
      months.push(buildRow(monthStart.toLocaleDateString(undefined, { month: "short" }), monthStart, monthEnd));
    }
    const periodStart = new Date(now.getFullYear(), quarterStartMonth, 1);
    const periodEnd = new Date(now.getFullYear(), quarterStartMonth + 3, 1);
    const priorTotal = sumInRange(
      revenueSource,
      new Date(now.getFullYear(), quarterStartMonth - 3, 1),
      periodStart
    );
    return withTotals(cumulative(months), periodStart, periodEnd, priorTotal);
  }

  if (filter === "Annual") {
    const months: Array<{ time: string; Revenue: number; Expenses: number; Profit: number }> = [];
    for (let month = 0; month <= now.getMonth(); month++) {
      const monthStart = new Date(now.getFullYear(), month, 1);
      const monthEnd = new Date(now.getFullYear(), month + 1, 1);
      months.push(buildRow(monthStart.toLocaleDateString(undefined, { month: "short" }), monthStart, monthEnd));
    }
    const periodStart = new Date(now.getFullYear(), 0, 1);
    const periodEnd = new Date(now.getFullYear() + 1, 0, 1);
    const priorTotal = sumInRange(
      revenueSource,
      new Date(now.getFullYear() - 1, 0, 1),
      periodStart
    );
    return withTotals(cumulative(months), periodStart, periodEnd, priorTotal);
  }

  // Total: group the complete ledger by year, then show lifetime running totals.
  const allDates = [...revenueSource, ...expenseTx]
    .map((item) => new Date(item.date))
    .filter((date) => !Number.isNaN(date.getTime()));
  const firstYear = allDates.length ? Math.min(...allDates.map((date) => date.getFullYear())) : now.getFullYear();
  const years: Array<{ time: string; Revenue: number; Expenses: number; Profit: number }> = [];
  for (let year = firstYear; year <= now.getFullYear(); year++) {
    years.push(buildRow(String(year), new Date(year, 0, 1), new Date(year + 1, 0, 1)));
  }
  const periodStart = new Date(firstYear, 0, 1);
  const periodEnd = new Date(now.getFullYear() + 1, 0, 1);
  return withTotals(cumulative(years), periodStart, periodEnd, 0);
}

/**
 * Real hours worked in the trailing `sinceDaysAgo` days, computed by
 * pairing Clock In/Break End with Clock Out/Break Start the same way
 * TimeClockPage and handleRunPayroll do. Shared here so the Revenue page's
 * Payroll Overview table shows the same real numbers Run Payroll acts on.
 */
function computeRecentHours(logs: TimeClockLog[], sinceDaysAgo: number): number {
  return computeRecentPayrollHours(logs, sinceDaysAgo).hours;
}

type PayrollSchedule = "weekly_friday" | "biweekly" | "semimonthly" | "monthly" | "custom";
const US_PAYROLL_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
const dateInputValue = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
function scheduledPayrollPeriod(schedule: PayrollSchedule, anchor = new Date()): { start: string; end: string } {
  const day = new Date(anchor); day.setHours(12, 0, 0, 0);
  if (schedule === "semimonthly") {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() <= 15 ? 1 : 16);
    const end = day.getDate() <= 15 ? new Date(day.getFullYear(), day.getMonth(), 15) : new Date(day.getFullYear(), day.getMonth() + 1, 0);
    return { start: dateInputValue(start), end: dateInputValue(end) };
  }
  if (schedule === "monthly") return { start: dateInputValue(new Date(day.getFullYear(), day.getMonth(), 1)), end: dateInputValue(new Date(day.getFullYear(), day.getMonth() + 1, 0)) };
  const sunday = new Date(day); sunday.setDate(day.getDate() - day.getDay());
  if (schedule === "biweekly") {
    const epoch = new Date(2024, 0, 7, 12);
    const weeks = Math.floor((sunday.getTime() - epoch.getTime()) / (7 * 86400000));
    if (Math.abs(weeks % 2) === 1) sunday.setDate(sunday.getDate() - 7);
    const end = new Date(sunday); end.setDate(end.getDate() + 13);
    return { start: dateInputValue(sunday), end: dateInputValue(end) };
  }
  const end = new Date(sunday); end.setDate(end.getDate() + 6);
  return { start: dateInputValue(sunday), end: dateInputValue(end) };
}

/** Splits worked time into Sunday-Saturday workweeks. The FLSA does not
 * allow a biweekly 80-hour average: each seven-day workweek stands alone. */
function computeRecentPayrollHours(logs: TimeClockLog[], sinceDaysAgo: number): { hours: number; regularHours: number; overtimeHours: number } {
  const since = new Date(Date.now() - sinceDaysAgo * 24 * 60 * 60 * 1000);
  return computePayrollHoursForRange(logs, dateInputValue(since), dateInputValue(new Date()), 0);
}

function computePayrollHoursForRange(logs: TimeClockLog[], startDate: string, endDate: string, workweekStartDay: number): { hours: number; regularHours: number; overtimeHours: number } {
  const since = new Date(`${startDate}T00:00:00`);
  const through = new Date(`${endDate}T23:59:59.999`);
  const sorted = [...logs]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const weekHours = new Map<string, number>();
  let segmentStart: number | null = null;
  const addSegment = (startMs: number, endMs: number) => {
    let cursor = Math.max(startMs, since.getTime());
    while (cursor < endMs) {
      const date = new Date(cursor);
      const weekStart = new Date(date);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() - workweekStartDay + 7) % 7));
      const nextWeek = new Date(weekStart);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const sliceEnd = Math.min(endMs, nextWeek.getTime());
      const key = weekStart.toISOString().slice(0, 10);
      weekHours.set(key, (weekHours.get(key) || 0) + Math.max(0, sliceEnd - cursor) / 3600000);
      cursor = sliceEnd;
    }
  };
  for (const log of sorted) {
    const ts = new Date(log.timestamp).getTime();
    if (log.type === "Clock In" || log.type === "Break End") {
      segmentStart = Math.max(ts, since.getTime());
    } else if ((log.type === "Clock Out" || log.type === "Break Start") && segmentStart !== null) {
      if (ts >= since.getTime() && segmentStart <= through.getTime()) addSegment(segmentStart, Math.min(ts, through.getTime()));
      segmentStart = null;
    }
  }
  if (segmentStart !== null && segmentStart <= through.getTime()) addSegment(segmentStart, Math.min(Date.now(), through.getTime()));
  let regularHours = 0;
  let overtimeHours = 0;
  weekHours.forEach(hours => {
    regularHours += Math.min(hours, 40);
    overtimeHours += Math.max(0, hours - 40);
  });
  return { hours: regularHours + overtimeHours, regularHours, overtimeHours };
}

const BrandIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <img
    src="/branding/owners-sidebar-icon-1000043699.png"
    alt=""
    aria-hidden="true"
    className={`object-contain ${className}`}
  />
);

const getScreenIcon = (screenId: string, className: string = "w-4 h-4") => {
  switch (screenId) {
    case "owner_console":
      return <ShieldAlert className={className} />;
    case "dashboard":
      return <LayoutDashboard className={className} />;
    case "revenue":
      return <BrandIcon className={className} />;
    case "accounting":
      return <Landmark className={className} />;
    case "customers":
      return <Users className={className} />;
    case "leads":
      return <Target className={className} />;
    case "estimates":
      return <FileText className={className} />;
    case "scheduling":
      return <Calendar className={className} />;
    case "dispatch":
      return <Truck className={className} />;
    case "routes":
      return <Compass className={className} />;
    case "jobs":
      return <Briefcase className={className} />;
    case "timeclock":
      return <Clock className={className} />;
    case "inventory":
      return <Package className={className} />;
    case "documents":
      return <FolderOpen className={className} />;
    case "messages":
      return <MessageSquare className={className} />;
    case "training":
      return <GraduationCap className={className} />;
    case "ai_assistant":
      return <Sparkles className={className} />;
    case "settings":
      return <Settings className={className} />;
    case "integrations":
      return <Link className={className} />;
    case "roster":
      return <Users className={className} />;
    case "bulletins":
      return <Megaphone className={className} />;
    case "snapshots":
      return <Camera className={className} />;
    case "notifications":
      return <Bell className={className} />;
    default:
      return <BrandIcon className={className} />;
  }
};

interface DynamicFieldListProps {
  label: string;
  items: string[];
  setter: React.Dispatch<React.SetStateAction<string[]>>;
  placeholder: string;
  scale: number;
  error?: string;
}

const DynamicFieldList: React.FC<DynamicFieldListProps> = ({
  label,
  items,
  setter,
  placeholder,
  scale,
  error
}) => {
  const [localItems, setLocalItems] = useState<{ id: string; value: string }[]>(() =>
    items.map(val => ({ id: Math.random().toString(36).substring(2, 9), value: val }))
  );

  const prevItemsRef = React.useRef(items);
  if (prevItemsRef.current !== items) {
    prevItemsRef.current = items;
    const prevValues = localItems.map(p => p.value);
    if (JSON.stringify(prevValues) !== JSON.stringify(items)) {
      setLocalItems(
        items.map((val, idx) => {
          const existingId = localItems[idx]?.id || Math.random().toString(36).substring(2, 9);
          return { id: existingId, value: val };
        })
      );
    }
  }

  const handleAdd = () => {
    const newItem = { id: Math.random().toString(36).substring(2, 9), value: "" };
    const updated = [...localItems, newItem];
    setLocalItems(updated);
    setter(updated.map(x => x.value));
  };

  const handleChange = (index: number, newValue: string) => {
    const updated = [...localItems];
    updated[index] = { ...updated[index], value: newValue };
    setLocalItems(updated);
    setter(updated.map(x => x.value));
  };

  const handleRemove = (index: number) => {
    if (localItems.length <= 1) return;
    const updated = localItems.filter((_, i) => i !== index);
    setLocalItems(updated);
    setter(updated.map(x => x.value));
  };

  const getFontSize = (baseSize: number) => {
    return { fontSize: `${Math.max(10, Math.round(baseSize * scale))}px` };
  };

  return (
    <div className="space-y-1.5 mb-4">
      <div className="flex items-center justify-between px-1">
        <label style={getFontSize(11)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider">
          {label}
        </label>
        <button
          type="button"
          onClick={handleAdd}
          style={{ padding: `${3 * scale}px ${8 * scale}px`, borderRadius: `${6 * scale}px`, ...getFontSize(10) }}
          className="bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold flex items-center gap-1 transition-colors cursor-pointer border border-blue-200/50 animate-fade-in"
        >
          <span>+ Add</span>
        </button>
      </div>
      <div className="space-y-1.5">
        {localItems.map((item, idx) => {
          const isEmpty = !item.value || !item.value.trim();
          const hasError = !!error && isEmpty;
          return (
            <div key={item.id} className="flex gap-1.5 items-center">
              <input
                type="text"
                value={item.value}
                onChange={(e) => handleChange(idx, e.target.value)}
                placeholder={placeholder}
                style={{
                  height: `${42 * scale}px`,
                  borderRadius: `${12 * scale}px`,
                  paddingLeft: `${14 * scale}px`,
                  paddingRight: `${14 * scale}px`,
                  ...getFontSize(12.5)
                }}
                className={`flex-1 bg-white border focus:ring-1 focus:outline-none transition-all placeholder:text-slate-400/70 shadow-sm font-medium ${
                  hasError 
                    ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500 text-rose-900" 
                    : "border-slate-200 focus:border-blue-500 focus:ring-blue-500 text-slate-800"
                }`}
              />
              {localItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  style={{ width: `${30 * scale}px`, height: `${30 * scale}px`, borderRadius: `${8 * scale}px` }}
                  className="hover:bg-rose-50 text-rose-500 hover:text-rose-700 font-bold transition-colors cursor-pointer flex items-center justify-center text-xs shrink-0 border border-transparent hover:border-rose-100"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p className="text-rose-600 font-bold text-[10.5px] mt-1 pl-1 flex items-center gap-1 animate-pulse">
          <span className="w-1.5 h-1.5 bg-rose-500 rounded-full shrink-0 animate-ping" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};

const DAILY_VIEW_OPTIONS = [
  { value: "revenue", label: "📊 Company Revenue Graph" },
  { value: "leads", label: "🎯 Active Leads Count" },
  { value: "scheduling", label: "📅 Jobs Scheduled Today" },
  { value: "fleet", label: "🚚 Fleet Status" },
  { value: "messages", label: "💬 Messages Feed Board" },
  { value: "inventory", label: "📦 Warehouse Inventory Scans" },
];

interface CustomDropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  scale: number;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({ value, onChange, options, scale }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value) || options[0];

  const getFontSize = (baseSize: number) => {
    return { fontSize: `${Math.max(10, Math.round(baseSize * scale))}px` };
  };

  return (
    <div ref={dropdownRef} className="relative w-full z-30">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          height: `${42 * scale}px`,
          borderRadius: `${12 * scale}px`,
          ...getFontSize(12.5),
          backgroundColor: "#ffffff",
          color: "#1F3557",
        }}
        className="w-full flex items-center justify-between border border-[#9EC8EF] px-3.5 focus:outline-none focus:border-[#4A86F7] font-bold cursor-pointer transition-all hover:bg-slate-50 text-left custom-dropdown-popover"
      >
        <span>{selectedOption.label}</span>
        <ChevronDown className={`w-4 h-4 text-[#315C9F] transition-transform duration-200 shrink-0 ml-2 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div
          style={{
            borderRadius: `${12 * scale}px`,
            marginTop: `${4 * scale}px`,
            backgroundColor: "#ffffff",
            color: "#1f3557",
          }}
          className="absolute left-0 w-full border border-[#9EC8EF] shadow-2xl py-1.5 z-[100] max-h-48 overflow-y-auto animate-fade-in text-left block custom-dropdown-popover"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                style={{
                  ...getFontSize(12),
                  backgroundColor: isSelected ? "#EAF5FF" : "#ffffff",
                  color: isSelected ? "#4A86F7" : "#1F3557",
                }}
                className={`w-full text-left px-4 py-2.5 font-bold transition-all block cursor-pointer border-0 custom-dropdown-item ${
                  isSelected ? "custom-dropdown-item-active font-extrabold" : ""
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Mounts the Event Engine's cascade subscribers (see src/hooks/useEventEngineSubscribers.ts).
// Renders nothing — must be rendered inside DomainDataContext/NavTelemetryContext.
const EventEngineEffects: React.FC = () => {
  useEventEngineSubscribers();
  return null;
};

export default function App() {
  // Logged in user profile (null if guest/default owner, or set when authenticated)
  const [loggedInUser, setLoggedInUser] = useState<{
    email: string;
    role: string;
    permissions: string[];
    granularPermissions?: GranularPermissions;
    isEmployee?: boolean;
    name?: string;
    goals?: string;
    /** The owner's business email — the real multi-tenant scoping key for employee sessions (an employee's own `email` is not it). */
    businessEmail?: string;
  } | null>(null);
  const [workspaceTheme, setWorkspaceTheme] = useState<WorkspaceTheme>(() =>
    workspaceThemeFromSetting(localStorage.getItem("ownerslocal_workspace_theme") || undefined)
  );
  const isDarkTheme = workspaceTheme === "dark-basic" || workspaceTheme === "dark-dynamic";

  // Authentication & Form States
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem("rememberMe") === "true";
  });
  const [email, setEmail] = useState(() => {
    if (localStorage.getItem("rememberMe") === "true") {
      return localStorage.getItem("rememberedEmail") || "";
    }
    return "";
  });
  const [password, setPassword] = useState(() => {
    if (localStorage.getItem("rememberMe") === "true") {
      return localStorage.getItem("rememberedPassword") || "";
    }
    return "";
  });
  const [inviteCode, setInviteCode] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [onboardingErrors, setOnboardingErrors] = useState<Record<string, string>>({});
  
  // Proportional Scaling State for Mobile viewport compatibility
  const [cardWidth, setCardWidth] = useState(440);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const pendingSnapshotRef = React.useRef<{ pageId: string; pageName: string; metaData?: any } | null>(null);
  const refSecurityLogged = React.useRef<Record<string, boolean>>({});
  const isTimeClockLoadedRef = React.useRef(false);
  const [revenueConfirmAction, setRevenueConfirmAction] = useState<{ label: string; icon: string } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setCardWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const scale = cardWidth / 440;
  const getScaled = (size: number) => `${Math.max(6, Math.round(size * scale))}px`;
  const getFontSize = (size: number) => ({ fontSize: `${Math.max(8, Math.round(size * scale))}px` });

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginMethod, setLoginMethod] = useState<"password" | "invite" | "google" | null>(null);

  // Sign Up Flow State
  const [showSignUpModal, setShowSignUpModal] = useState(false);
  const [signUpUsername, setSignUpUsername] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState("");
  const [signUpError, setSignUpError] = useState("");
  const [isSignUpSubmitting, setIsSignUpSubmitting] = useState(false);
  
  // Navigation & Flow states
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [currentView, setCurrentView] = useState<string>("login");
  const [activeScreen, setActiveScreen] = useState(() => {
    const savedId = sessionStorage.getItem("ownerslocal_active_screen");
    return OS_SCREENS.find(screen => screen.id === savedId) || OS_SCREENS[0];
  });
  const [showNotification, setShowNotification] = useState<string | null>(null);
  const [employeeRedoOnboardingAllowed, setEmployeeRedoOnboardingAllowed] = useState(false);

  // New Sidebar & Workspace Simulation states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [simulatedRole, setSimulatedRole] = useState<string | null>(null);
  const [liveTime, setLiveTime] = useState(new Date());

  // Notification system states
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [reviewingClockNotifLogId, setReviewingClockNotifLogId] = useState<string | null>(null);

  useEffect(() => {
    sessionStorage.setItem("ownerslocal_active_screen", activeScreen.id);
  }, [activeScreen]);

  // Dashboard & Operational Interactive states
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [clockInDuration, setClockInDuration] = useState(0);
  const [dashboardLeads, setDashboardLeads] = useState<Array<{
    id: string;
    name: string;
    phone: string;
    service: string;
    status: string;
    date: string;
  }>>([]);
  const [integrationStatuses, setIntegrationStatuses] = useState({
    quickbooks: true,
    stripe: true,
    google_maps: true,
    gmail: false
  });
  // Core Event Engine & CRM Shared States back-ended by Firestore.
  // Each collection is backed by useFirestoreCollection, which centralizes the
  // sync-to-Firestore + realtime-subscribe + clear-on-logout behavior that used
  // to be hand-duplicated per collection (see src/hooks/useFirestoreCollection.ts).
  // The real multi-tenant scoping key. For an owner this is their own
  // email; for an employee it must be the owner's businessEmail — an
  // employee's own email is a different tenant and would resolve every
  // collection to empty. (TrainingPage.tsx already used this exact
  // ternary, anticipating businessEmail would be populated here.)
  const businessId = loggedInUser?.isEmployee ? loggedInUser?.businessEmail : loggedInUser?.email;

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    getDoc(doc(db, "business_profiles", businessId)).then(snapshot => {
      if (cancelled) return;
      const savedTheme = snapshot.data()?.companySettings?.appearance?.theme;
      const nextTheme = workspaceThemeFromSetting(savedTheme);
      setWorkspaceTheme(nextTheme);
      localStorage.setItem("ownerslocal_workspace_theme", savedTheme || "Light Mode Basic");
    }).catch(error => console.error("Couldn't load workspace theme:", error));
    return () => { cancelled = true; };
  }, [businessId]);

  useEffect(() => {
    document.documentElement.dataset.ownerslocalTheme = workspaceTheme;
  }, [workspaceTheme]);
  const [customers, setCustomers] = useFirestoreCollection<Customer>("customers", businessId, {
    normalize: (customer) => {
      const legacyName = String((customer as Customer & { name?: string }).name || "").trim();
      const contact = String(customer.contact || legacyName || customer.company || "Unnamed Customer").trim();
      return {
        ...customer,
        company: String(customer.company || legacyName || contact).trim(),
        contact,
        phone: String(customer.phone || ""),
        email: String(customer.email || ""),
        address: String(customer.address || "")
      };
    }
  });
  const [leads, setLeads] = useFirestoreCollection<Lead>("leads", businessId);
  const [estimates, setEstimates] = useFirestoreCollection<Estimate>("estimates", businessId);
  const [schedulingEvents, setSchedulingEvents] = useFirestoreCollection<SchedulingEvent>("scheduling_events", businessId);
  const [inventoryList, setInventoryList] = useFirestoreCollection<InventoryItem>("inventory", businessId);
  const [documents, setDocuments] = useFirestoreCollection<DocumentItem>("documents", businessId);
  const [recentRoster, setRecentRoster] = useFirestoreCollection<{ id?: string; name: string; role: string; code: string; status: string }>(
    "roster",
    businessId,
    { normalize: (item) => ({ ...item, id: item.id || item.code }) }
  );
  const [bulletins, setBulletins] = useFirestoreCollection<any>("bulletins", businessId);
  const [notifications, setNotifications] = useFirestoreCollection<any>("notifications", businessId);
  const [recentAiActions, setRecentAiActions] = useFirestoreCollection<any>("recent_ai_actions", businessId);
  const [snapshots, setSnapshots] = useFirestoreCollection<any>("snapshots", businessId);
  const [revenueEvents, setRevenueEvents] = useFirestoreCollection<RevenueEvent>("revenue_events", businessId);
  const [employees, setEmployees, refreshEmployees] = useFirestoreCollection<EmployeeRecord>("employees", businessId, { tenantField: "businessEmail" });
  const [timeClockLogs, setTimeClockLogs, refreshTimeClockLogs] = useFirestoreCollection<TimeClockLog>("time_clock_logs", businessId);
  const [transactions, setTransactions] = useFirestoreCollection<Transaction>("transactions", businessId);
  const [accounts, setAccounts] = useFirestoreCollection<Account>("chart_of_accounts", businessId);
  const [journalEntries, setJournalEntries] = useFirestoreCollection<JournalEntry>("journal_entries", businessId);
  const [invoices, setInvoices] = useFirestoreCollection<Invoice>("invoices", businessId);
  const [bills, setBills] = useFirestoreCollection<Bill>("bills", businessId);
  const [vendors, setVendors] = useFirestoreCollection<Vendor>("vendors", businessId);
  // Read-only mirror for the Dashboard's Messages summary card -- MessagesPage
  // owns the real read/write subscription for the actual Messages screen.
  const [dashboardConversations] = useFirestoreCollection<any>("conversations", businessId);
  const [bankAccounts, setBankAccounts] = useFirestoreCollection<BankAccount>("bank_accounts", businessId);
  const [recurringTransactions, setRecurringTransactions] = useFirestoreCollection<RecurringTransaction>("recurring_transactions", businessId);
  const [mileageLogs, setMileageLogs] = useFirestoreCollection<MileageLog>("mileage_logs", businessId);
  const [budgets, setBudgets] = useFirestoreCollection<Budget>("budgets", businessId);
  const [salesTaxRates, setSalesTaxRates] = useFirestoreCollection<SalesTaxRate>("sales_tax_rates", businessId);
  const migratedCustomersForBusinessRef = useRef(new Set<string>());

  // Recover customer records saved by earlier builds before Firestore became
  // the canonical store. The migration runs once per business per session and
  // preserves record IDs, making it idempotent rather than duplicate seed.
  useEffect(() => {
    if (!businessId || loggedInUser?.isEmployee) return;
    const migrationKey = businessId.toLowerCase();
    if (migratedCustomersForBusinessRef.current.has(migrationKey)) return;
    migratedCustomersForBusinessRef.current.add(migrationKey);
    try {
      const raw = localStorage.getItem("ownerslocal_customers") || localStorage.getItem("leadforge_customers");
      const cached = raw ? JSON.parse(raw) : [];
      if (Array.isArray(cached) && cached.length > 0) {
        setCustomers(current => {
          const merged = new Map<string, Customer>();
          cached.forEach((customer: Customer) => customer?.id && merged.set(customer.id, customer));
          current.forEach(customer => merged.set(customer.id, customer));
          return [...merged.values()];
        });
      }
    } catch (error) {
      console.error("Couldn't migrate cached customers:", error);
    }
  }, [businessId, loggedInUser?.isEmployee, setCustomers]);

  // Delete only the original prototype's known demo rows if they were
  // persisted by an older build. Real inventory and time entries remain.
  useEffect(() => {
    if (inventoryList.some(isLegacyInventoryItem)) {
      setInventoryList((current) => current.filter((item) => !isLegacyInventoryItem(item)));
    }
  }, [inventoryList, setInventoryList]);

  useEffect(() => {
    if (timeClockLogs.some(isLegacyTimeLog)) {
      setTimeClockLogs((current) => current.filter((log) => !isLegacyTimeLog(log)));
    }
  }, [timeClockLogs, setTimeClockLogs]);

  // Seed the standard Chart of Accounts once per business -- every account
  // the app's own event-posting logic writes to must already exist so
  // journal entries never get silently dropped for lacking a target
  // account. Owners can still add unlimited custom accounts afterward.
  useEffect(() => {
    if (!businessId || accounts.length > 0) return;
    const seeded: Account[] = DEFAULT_CHART_OF_ACCOUNTS.map(a => ({ ...a, createdAt: new Date().toISOString() }));
    setAccounts(seeded);
  }, [businessId, accounts.length, setAccounts]);

  // Derived, never a separately-tracked number — a running total kept in
  // its own useState would silently reset to 0 on every reload/re-login
  // instead of reflecting what's actually been recognized. Includes both
  // job-completion revenue (revenueEvents) and manually-logged/scanned
  // income (transactions of type "income" — e.g. a photographed check) so
  // logging income actually moves this number, not just an ignored ledger.
  const completedJobsRevenue =
    revenueEvents.reduce((sum, e) => sum + e.amount, 0) +
    transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const [preSelectedDate, setPreSelectedDate] = useState<string | undefined>(undefined);
  const [preSelectedCustomerId, setPreSelectedCustomerId] = useState<string | undefined>(undefined);

  // Test connection on boot
  useEffect(() => {
    validateConnection();
  }, []);

  // Track the logged-in-user email in localStorage across login/logout
  useEffect(() => {
    if (businessId) {
      localStorage.setItem("ownerslocal_logged_in_user_email", businessId);
    } else {
      localStorage.removeItem("ownerslocal_logged_in_user_email");
    }
  }, [businessId]);

  // Timer for Clocked In Duration
  useEffect(() => {
    let interval: any = null;
    if (isClockedIn) {
      interval = setInterval(() => {
        setClockInDuration(d => d + 1);
      }, 1000);
    } else {
      setClockInDuration(0);
    }
    return () => clearInterval(interval);
  }, [isClockedIn]);

  // Firestore clock events are the source of truth. Rebuild the active
  // shift after navigation, reload, or returning from another page so the
  // employee remains clocked in until an explicit Clock Out event exists.
  useEffect(() => {
    if (!loggedInUser?.email) return;
    const myLogs = timeClockLogs
      .filter(log => log.employeeEmail === loggedInUser.email)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (!myLogs.length) return;
    const latest = myLogs[myLogs.length - 1];
    const active = latest.type !== "Clock Out";
    setIsClockedIn(active);
    if (active) {
      const lastClockIn = [...myLogs].reverse().find(log => log.type === "Clock In");
      setClockInTime(lastClockIn?.time || latest.time);
      let sessionStart = myLogs.map(log => log.type).lastIndexOf("Clock Out") + 1;
      const sessionLogs = myLogs.slice(sessionStart);
      let seconds = 0;
      let segmentStart: number | null = null;
      for (const log of sessionLogs) {
        const timestamp = new Date(log.timestamp).getTime();
        if (log.type === "Clock In" || log.type === "Break End") segmentStart = timestamp;
        if ((log.type === "Clock Out" || log.type === "Break Start") && segmentStart !== null) {
          seconds += Math.max(0, timestamp - segmentStart) / 1000;
          segmentStart = null;
        }
      }
      if (segmentStart !== null) seconds += Math.max(0, Date.now() - segmentStart) / 1000;
      setClockInDuration(Math.floor(seconds));
    } else {
      setClockInTime(null);
      setClockInDuration(0);
    }
  }, [timeClockLogs, loggedInUser?.email]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Keep digital clock updated
  useEffect(() => {
    if (!isLoggedIn) return;
    const timer = setInterval(() => {
      setLiveTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, [isLoggedIn]);

  // Register this device for real push notifications (e.g. "clock in/out
  // needs your approval") once signed in. A clean no-op until
  // FIREBASE_VAPID_KEY is configured -- the real-time in-app Alert Center
  // above already works fully without it.
  useEffect(() => {
    if (!isLoggedIn || !loggedInUser?.email || !businessId) return;
    void registerForPushNotifications({ email: loggedInUser.email, businessId });
  }, [isLoggedIn, loggedInUser?.email, businessId]);

  const getVisibleScreens = () => {
    if (!loggedInUser) return [];

    // Determine which role we are currently viewing/simulating
    const activeRole = simulatedRole || loggedInUser.role;

    // The real owner account is never an employee record (only invited
    // staff get isEmployee: true) -- that's the reliable signal for full
    // access, not a role-string match. An older/inconsistent stored
    // `role` value must never silently lock the actual owner out of
    // screens. Workspace Simulator previews still go through the
    // restricted logic below on purpose.
    if (!simulatedRole && !loggedInUser.isEmployee) {
      return OS_SCREENS;
    }

    if (activeRole === "Owner") {
      return OS_SCREENS;
    }

    let perms: string[] = [];

    if (simulatedRole) {
      // Owner is previewing a role template before any real employee is
      // using it yet — there's no real employee profile to read, so fall
      // back to the template's own module list.
      const normalizedRoleKey = activeRole.toLowerCase().replace(/ /g, "_");
      const customRoleMatch = selectedRoles.find(r => r.name === activeRole || r.id === normalizedRoleKey);
      if (customRoleMatch) {
        perms = [...customRoleMatch.permissions];
      } else {
        const defaultRoleMatch = DEFAULT_ROLES_DATA[normalizedRoleKey];
        perms = defaultRoleMatch ? [...defaultRoleMatch.permissions] : [...(loggedInUser.permissions || ["dashboard"])];
      }
    } else if (loggedInUser.granularPermissions) {
      // Real logged-in employee — their own stored per-module permission
      // is authoritative. A module belongs in the sidebar when any of its
      // independently configurable capabilities is enabled; otherwise a
      // role can show Time Clock (or another module) in the permission
      // matrix while leaving the employee with no way to open it. Older
      // employee profiles can have the module in the flat permissions list
      // without a granular entry, so retain that access until the profile is
      // next saved in the current format.
      perms = OS_SCREENS
        .map(s => s.id)
        .filter(id => {
          const granularEntry = loggedInUser.granularPermissions?.[id];
          if (granularEntry === undefined) {
            return loggedInUser.permissions?.includes(id) ?? false;
          }
          return (["view", "edit", "delete"] as const).some(action =>
            hasPermission(loggedInUser.granularPermissions, id, action)
          );
        });
    } else {
      // Legacy account from before granular permissions existed.
      perms = [...(loggedInUser.permissions || ["dashboard"])];
    }

    // Always allow the Dashboard to be viewed by everyone -- it isn't part
    // of the configurable module permission catalog (MODULE_CATALOG), same
    // as bulletins/snapshots/notifications below.
    if (!perms.includes("dashboard")) {
      perms.push("dashboard");
    }

    // Always allow bulletins to be viewed by everyone
    if (!perms.includes("bulletins")) {
      perms.push("bulletins");
    }

    // Always allow snapshots folder to be viewed by everyone
    if (!perms.includes("snapshots")) {
      perms.push("snapshots");
    }

    // Always allow notifications to be viewed by everyone
    if (!perms.includes("notifications")) {
      perms.push("notifications");
    }

    // Allow revenue & accounting for specific management/accounting roles
    const highPrivilegeRoles = ["Owner", "General Manager", "Office Manager", "Accountant", "Accountant / Bookkeeper"];
    if (highPrivilegeRoles.includes(activeRole)) {
      if (!perms.includes("revenue")) perms.push("revenue");
      if (!perms.includes("accounting")) perms.push("accounting");
    }

    return OS_SCREENS.filter(s => perms.includes(s.id));
  };

  // Onboarding Profile Settings States (start empty for every new account)
  const [ownerNames, setOwnerNames] = useState<string[]>([""]);
  const [ownerPhones, setOwnerPhones] = useState<string[]>([""]);
  const [businessNames, setBusinessNames] = useState<string[]>([""]);
  const [businessPhones, setBusinessPhones] = useState<string[]>([""]);
  const [businessAddresses, setBusinessAddresses] = useState<string[]>([""]);
  const [businessLogos, setBusinessLogos] = useState<string[]>([""]);
  const [companyLocations, setCompanyLocations] = useState<string[]>([""]);

  // Billing methods state
  const [billingMethods, setBillingMethods] = useState<Array<{
    id: string;
    cardholderName: string;
    cardNumber: string;
    expiry: string;
    cvv: string;
    brand: string;
  }>>([
    {
      id: "1",
      cardholderName: "Operations Management",
      cardNumber: "•••• •••• •••• 4242",
      expiry: "12/29",
      cvv: "•••",
      brand: "Visa"
    }
  ]);
  const [selectedBillingMethodId, setSelectedBillingMethodId] = useState<string>("1");
  const [showAddBillingModal, setShowAddBillingModal] = useState(false);

  // Modal input states for billing method
  const [newCardholderName, setNewCardholderName] = useState("");
  const [newCardNumber, setNewCardNumber] = useState("");
  const [newCardExpiry, setNewCardExpiry] = useState("");
  const [newCardCVV, setNewCardCVV] = useState("");
  const [newCardBrand, setNewCardBrand] = useState("Visa");

  // Custom dialog overlays
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);
  
  // Sign Up Instructions Modal States
  const [showSignUpInstructions, setShowSignUpInstructions] = useState(false);
  const [signUpInstructionsStep, setSignUpInstructionsStep] = useState<"input" | "pending">("input");
  const [signUpInstructionsEmail, setSignUpInstructionsEmail] = useState("");
  const [signUpInstructionsBusinessName, setSignUpInstructionsBusinessName] = useState("");
  const [signUpInstructionsOwnerName, setSignUpInstructionsOwnerName] = useState("");
  const [signUpInstructionsPassword, setSignUpInstructionsPassword] = useState("");
  const [signUpInstructionsError, setSignUpInstructionsError] = useState("");
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  
  // Forgot password email field
  const [forgotEmail, setForgotEmail] = useState("");
  co…70816 tokens truncated…roll"}
                          </button>
                        </div>

                        {logTransactionType && (
                          <LogTransactionModal
                            type={logTransactionType}
                            createdBy={loggedInUser?.email}
                            onSave={handleSaveTransaction}
                            onClose={() => { sessionStorage.removeItem("ownerslocal_pending_financial_scan"); setLogTransactionType(null); }}
                          />
                        )}

                        {/* Recharts Live Multi-line Graph — horizontally scrollable */}
                        {(() => {
                          const chartSeries = getRevenueChartData(revenuePageFilter, revenueEvents, transactions).series;
                          const chartWidth = Math.max(340, chartSeries.length * 78);
                          return (
                            <div className="pt-2">
                              {chartSeries.length > 5 && (
                                <p className="text-[10px] text-[#5E7393] font-sans text-right pr-2 pb-1 opacity-60 select-none">← swipe to scroll →</p>
                              )}
                              <div className="overflow-x-auto overflow-y-hidden rounded-xl" style={{ WebkitOverflowScrolling: 'touch' as any }}>
                                <LineChart
                                  width={chartWidth}
                                  height={280}
                                  data={chartSeries}
                                  margin={{ top: 10, right: 24, left: 14, bottom: 0 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" stroke="#9EC8EF" vertical={false} />
                                  <XAxis
                                    dataKey="time"
                                    stroke="#5E7393"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    dy={10}
                                    className="font-mono"
                                  />
                                  <YAxis
                                    stroke="#5E7393"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(val) => val >= 1000 ? `$${(val / 1000).toFixed(0)}k` : `$${val}`}
                                    className="font-mono"
                                    width={48}
                                  />
                                  <Tooltip content={
                                    ({ active, payload, label }) => {
                                      if (active && payload && payload.length) {
                                        return (
                                          <div className="bg-[#EAF5FF] border border-[#9EC8EF] p-3 rounded-xl shadow-md text-left text-xs font-sans">
                                            <p className="font-bold text-[#1F3557] mb-1.5 border-b border-[#9EC8EF]/50 pb-1">{label}</p>
                                            <div className="space-y-1">
                                              {payload.map((entry: any, index: number) => (
                                                <div key={index} className="flex items-center justify-between gap-6">
                                                  <span className="flex items-center gap-1.5 font-semibold text-[#5E7393] text-[11px]">
                                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                                    {entry.name}:
                                                  </span>
                                                  <span className="font-mono font-bold text-[#1F3557] text-[11px]">
                                                    ${entry.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      }
                                      return null;
                                    }
                                  } />
                                  <Legend
                                    verticalAlign="top"
                                    height={36}
                                    iconType="circle"
                                    iconSize={8}
                                    className="font-sans font-bold text-[11px]"
                                    wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                                  />
                                  <Line type="monotone" dataKey="Revenue" stroke="#4A86F7" strokeWidth={3} dot={{ r: 4, strokeWidth: 1 }} activeDot={{ r: 6 }} name="Revenue" />
                                  <Line type="monotone" dataKey="Expenses" stroke="#F43F5E" strokeWidth={2} dot={{ r: 3, strokeWidth: 1 }} activeDot={{ r: 5 }} name="Expenses" />
                                  <Line type="monotone" dataKey="Profit" stroke="#22C55E" strokeWidth={2} dot={{ r: 3, strokeWidth: 1 }} activeDot={{ r: 5 }} name="Profit" />
                                </LineChart>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* SUMMARY CARDS - FIVE SEPARATE FLOATING BLUE CARDS */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        {(() => {
                          const { currentPayrollTotal } = getRevenueChartData(revenuePageFilter, revenueEvents, transactions);
                          // Accounting's dashboard is all-time. Keep these headline cards
                          // on that same basis; the chart and comparison cards below remain
                          // controlled by revenuePageFilter.
                          const allTimeExpenseTotal = transactions
                            .filter(transaction => transaction.type === "expense")
                            .reduce((sum, transaction) => sum + transaction.amount, 0);
                          const netProfit = completedJobsRevenue - allTimeExpenseTotal;
                          const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                          return [
                          {
                            label: "Total Revenue",
                            key: "revenue",
                            val: `$${completedJobsRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                            change: null,
                            isUp: true,
                            comp: "All-time recognized revenue",
                            icon: DollarSign,
                            color: "text-emerald-500",
                            bgColor: "bg-emerald-500/10"
                          },
                          {
                            label: "Net Profit",
                            key: "profit",
                            val: fmt(netProfit),
                            change: null,
                            isUp: netProfit >= 0,
                            comp: "All-time revenue minus logged expenses",
                            icon: TrendingUp,
                            color: "text-blue-500",
                            bgColor: "bg-blue-500/10"
                          },
                          {
                            label: "Total Expenses",
                            key: "expenses",
                            val: fmt(allTimeExpenseTotal),
                            change: null,
                            isUp: true,
                            comp: "All-time logged expenses",
                            icon: TrendingDown,
                            color: "text-rose-500",
                            bgColor: "bg-rose-500/10"
                          },
                          {
                            label: "Gross Payroll",
                            key: "payroll",
                            val: fmt(currentPayrollTotal),
                            change: null,
                            isUp: true,
                            comp: "Real payroll runs, this period",
                            icon: Users,
                            color: "text-purple-500",
                            bgColor: "bg-purple-500/10"
                          },
                          {
                            label: "Accrued Taxes",
                            key: "taxes",
                            val: "$0.00",
                            change: null,
                            isUp: false,
                            comp: "Tax tracking not built yet",
                            icon: Landmark,
                            color: "text-amber-500",
                            bgColor: "bg-amber-500/10"
                          }
                          ];
                        })().map((card, idx) => (
                          <div key={idx} className="bg-[#C7E3FA] rounded-2xl p-4.5 border border-[#9EC8EF] shadow-sm flex flex-col justify-between gap-3 text-left">
                            <div className="flex justify-between items-start">
                              <span className="text-[10.5px] font-bold text-[#5E7393] uppercase tracking-wide">{card.label}</span>
                              <div className={`p-1.5 rounded-lg ${card.bgColor} ${card.color}`}>
                                <card.icon className="w-3.5 h-3.5" />
                              </div>
                            </div>
                            
                            <div>
                              <p className="text-xl font-sans font-black text-[#1F3557] tracking-tight">{card.val}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                {card.change && (
                                  <span className={`text-[10px] font-bold flex items-center ${card.isUp ? "text-emerald-600 bg-emerald-500/10" : "text-rose-600 bg-rose-500/10"} px-1.5 py-0.5 rounded`}>
                                    {card.isUp ? "+" : "-"}{card.change}
                                  </span>
                                )}
                                <span className="text-[9.5px] text-[#5E7393] font-sans font-medium">{card.comp}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* EXPENSE CATEGORIES GRID - 12 SEPARATE FLOATING BLUE CARDS */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center px-1">
                          <h3 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider">Expenses by Operational Category</h3>
                          <span className="text-[10px] font-mono font-bold text-[#5E7393] uppercase">12 Expenses Recorded</span>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                          {[
                            { name: "Materials", target: "inventory", label: "Inventory" },
                            { name: "Fuel", target: "placeholder_fuel", label: "Expenses" },
                            { name: "Vehicle Maintenance", target: "placeholder_vehicle", label: "Expenses" },
                            { name: "Equipment", target: "inventory", label: "Inventory" },
                            { name: "Tools", target: "inventory", label: "Inventory" },
                            { name: "Insurance", target: "documents", label: "Documents" },
                            { name: "Taxes", target: "documents", label: "Documents" },
                            { name: "Marketing", target: "integrations", label: "Web Integration" },
                            { name: "Software & Subs", target: "integrations", label: "Integrations" },
                            { name: "Utilities", target: "placeholder_utilities", label: "Expenses" },
                            { name: "Office Supplies", target: "inventory", label: "Inventory" },
                            { name: "Custom Expense", target: "placeholder_custom", label: "Expenses" }
                          ].map((cat, idx) => {
                            const categoryTotal = transactions
                              .filter((t) => t.type === "expense" && t.category === cat.name)
                              .reduce((sum, t) => sum + t.amount, 0);
                            const currentAmt = `$${categoryTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                            return (
                              <div
                                key={idx}
                                onClick={() => {
                                  if (cat.target === "inventory" || cat.target === "documents" || cat.target === "integrations") {
                                    const matched = OS_SCREENS.find(s => s.id === cat.target);
                                    if (matched) {
                                      setActiveScreen(matched);
                                      triggerNotification(`Navigated to: ${matched.label}`);
                                    }
                                  } else {
                                    openPlaceholderPage(cat.name + " Expense Logs", "💳");
                                  }
                                }}
                                className="bg-[#C7E3FA] hover:bg-[#BDDDF8] rounded-2xl p-4 border border-[#9EC8EF] hover:border-[#4A86F7] shadow-sm hover:shadow transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3 text-left group"
                              >
                                <div>
                                  <span className="text-[9.5px] text-[#5E7393] font-bold uppercase tracking-wider block truncate">{cat.name}</span>
                                  <span className="text-base font-sans font-black text-[#1F3557] tracking-tight block mt-0.5">{currentAmt}</span>
                                </div>
                                
                                <div className="flex items-center justify-between border-t border-[#9EC8EF]/30 pt-2 mt-1">
                                  <span className="text-[8.5px] font-bold text-[#315C9F] group-hover:underline flex items-center gap-0.5 shrink-0">
                                    {cat.label} ➔
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* PAYROLL SECTION - PAYROLL OVERVIEW AND SEARCHABLE TABLE */}
                      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#9EC8EF]/30 pb-4">
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-[#5E7393]">Personnel Ledger</span>
                            <h3 className="text-base font-sans font-black text-[#1F3557] tracking-tight">Payroll Overview</h3>
                            <p className="text-xs text-[#5E7393] font-sans font-semibold">Active crew hours, overtime coefficients, and cumulative gross wages</p>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                            {/* Employee Search Bar */}
                            <div className="relative flex-1 sm:w-60">
                              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                                <Search className="w-4 h-4 text-[#5E7393]" />
                              </span>
                              <input
                                value={payrollSearch}
                                onChange={(e) => setPayrollSearch(e.target.value)}
                                type="text"
                                placeholder="Search employees..."
                                className="w-full pl-9.5 pr-4 py-2 text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl focus:outline-none focus:border-[#4A86F7] text-[#1F3557] font-medium placeholder-[#5E7393]/70"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={downloadPayrollCsv}
                              className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] text-[#315C9F] border border-[#9EC8EF] font-bold rounded-xl text-xs transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Download CSV
                            </button>

                            <button
                              type="button"
                              onClick={printPayrollSummary}
                              className="px-3 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white border border-[#315C9F] font-bold rounded-xl text-xs transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Print / PDF
                            </button>
                            
                            <button
                              onClick={() => {
                                const matched = OS_SCREENS.find(s => s.id === "roster");
                                if (matched) setActiveScreen(matched);
                              }}
                              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] text-[#315C9F] border border-[#9EC8EF] font-bold rounded-xl text-xs transition-colors cursor-pointer text-center uppercase tracking-wider shrink-0"
                            >
                              View Roster
                            </button>
                          </div>
                        </div>

                        <div className="grid gap-3 rounded-2xl border border-[#9EC8EF] bg-[#EAF5FF] p-4 lg:grid-cols-6">
                          <label className="text-[9px] font-black uppercase text-[#5E7393]">Work state
                            <select value={payrollState} onChange={e => setPayrollState(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#9EC8EF] bg-white px-2 py-2 text-xs font-bold text-[#1F3557]">
                              {US_PAYROLL_STATES.map(state => <option key={state} value={state}>{state}{state === "TX" ? " — configured" : " — setup required"}</option>)}
                            </select>
                          </label>
                          <label className="text-[9px] font-black uppercase text-[#5E7393] lg:col-span-2">Pay schedule
                            <select value={payrollSchedule} onChange={e => selectPayrollSchedule(e.target.value as PayrollSchedule)} className="mt-1 block w-full rounded-lg border border-[#9EC8EF] bg-white px-3 py-2 text-xs font-bold text-[#1F3557]">
                              <option value="weekly_friday">Weekly — payday Friday</option>
                              <option value="biweekly">Every two weeks</option>
                              <option value="semimonthly">Semimonthly — 1–15 / 16–end</option>
                              <option value="monthly">Monthly</option>
                              <option value="custom">Custom date range</option>
                            </select>
                          </label>
                          <label className="text-[9px] font-black uppercase text-[#5E7393]">Period start
                            <input type="date" value={payrollPeriodStart} max={payrollPeriodEnd} onChange={e => { setPayrollSchedule("custom"); setPayrollPeriodStart(e.target.value); }} className="mt-1 block w-full rounded-lg border border-[#9EC8EF] bg-white px-2 py-2 text-xs" />
                          </label>
                          <label className="text-[9px] font-black uppercase text-[#5E7393]">Period end
                            <input type="date" value={payrollPeriodEnd} min={payrollPeriodStart} onChange={e => { setPayrollSchedule("custom"); setPayrollPeriodEnd(e.target.value); }} className="mt-1 block w-full rounded-lg border border-[#9EC8EF] bg-white px-2 py-2 text-xs" />
                          </label>
                          <label className="text-[9px] font-black uppercase text-[#5E7393]">Workweek starts
                            <select value={payrollWorkweekStart} onChange={e => setPayrollWorkweekStart(Number(e.target.value))} className="mt-1 block w-full rounded-lg border border-[#9EC8EF] bg-white px-2 py-2 text-xs">
                              {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((day,index)=><option key={day} value={index}>{day}</option>)}
                            </select>
                          </label>
                          <label className="text-[9px] font-black uppercase text-[#5E7393]">Payday
                            <select value={payrollPayday} onChange={e => setPayrollPayday(Number(e.target.value))} className="mt-1 block w-full rounded-lg border border-[#9EC8EF] bg-white px-2 py-2 text-xs">
                              {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((day,index)=><option key={day} value={index}>{day}</option>)}
                            </select>
                          </label>
                          <div className="flex flex-wrap gap-2 lg:col-span-6">
                            <button type="button" disabled={payrollSchedule === "custom"} onClick={()=>movePayrollPeriod(-1)} className="rounded-lg border border-[#9EC8EF] bg-white px-3 py-1.5 text-[10px] font-bold disabled:opacity-40">← Previous</button>
                            <button type="button" disabled={payrollSchedule === "custom"} onClick={useCurrentPayrollPeriod} className="rounded-lg border border-[#9EC8EF] bg-white px-3 py-1.5 text-[10px] font-bold disabled:opacity-40">Current period</button>
                            <button type="button" disabled={payrollSchedule === "custom"} onClick={()=>movePayrollPeriod(1)} className="rounded-lg border border-[#9EC8EF] bg-white px-3 py-1.5 text-[10px] font-bold disabled:opacity-40">Next →</button>
                            <span className="self-center text-[10px] font-semibold text-[#5E7393]">Saved automatically for this business.</span>
                          </div>
                        </div>

                        {/* Real payroll rows: real employees x real time_clock_logs x real hourlyRate,
                            using the selected pay period and workweek rules above. recentRoster is a separate
                            onboarding-invite list without email/hourlyRate, so it can't be cross-referenced
                            to real hours — this table uses the real `employees` collection instead. */}
                        {(() => {
                          const rows = employees
                            .filter(e => `${e.firstName} ${e.lastName}`.toLowerCase().includes(payrollSearch.toLowerCase()) || e.role.toLowerCase().includes(payrollSearch.toLowerCase()))
                            .map((emp) => {
                              const myLogs = timeClockLogs.filter(l => l.employeeEmail === emp.email);
                              const { hours, overtimeHours: otHours } = computePayrollHoursForRange(myLogs, payrollPeriodStart, payrollPeriodEnd, payrollWorkweekStart);
                              const regHours = hours - otHours;
                              const pay = emp.hourlyRate ? regHours * emp.hourlyRate + otHours * emp.hourlyRate * 1.5 : 0;
                              const lastPayroll = transactions
                                .filter(t => t.source === "payroll" && t.description === `${emp.firstName} ${emp.lastName}`.trim())
                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                              const lastLog = [...myLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                              const status = !lastLog ? "Off Duty" : lastLog.type === "Break Start" ? "On Break" : lastLog.type === "Clock Out" ? "Off Duty" : "Clocked In";
                              return { emp, hours, otHours, pay, lastPayroll, status };
                            });
                          return (
                            <>
                              {payrollSearch && (
                                <div className="text-[11px] font-sans font-bold text-[#1F3557] bg-[#EAF5FF] px-3.5 py-1.5 rounded-lg border border-[#9EC8EF]/50 inline-block">
                                  Found {rows.length} employees matching "{payrollSearch}"
                                </div>
                              )}

                              <div className="overflow-x-auto rounded-xl border border-[#9EC8EF] shadow-sm">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-[#EAF5FF] border-b border-[#9EC8EF] text-[10px] font-bold text-[#1F3557] uppercase tracking-wider">
                                      <th className="px-4 py-3">Employee</th>
                                      <th className="px-4 py-3 text-right">Current Hours</th>
                                      <th className="px-4 py-3 text-right">Overtime Hours</th>
                                      <th className="px-4 py-3 text-right">Current Pay</th>
                                      <th className="px-4 py-3 text-center">Last Payroll Date</th>
                                      <th className="px-4 py-3 text-center">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#9EC8EF]/30 text-xs font-sans">
                                    {rows.length === 0 && (
                                      <tr>
                                        <td colSpan={6} className="px-4 py-6 text-center text-[#5E7393] font-sans font-medium">
                                          No real employees onboarded yet.
                                        </td>
                                      </tr>
                                    )}
                                    {rows.map(({ emp, hours, otHours, pay, lastPayroll, status }) => {
                                      const initials = `${emp.firstName[0] || ""}${emp.lastName[0] || ""}`.toUpperCase();
                                      const statusColor = status === "Clocked In" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : status === "On Break" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-slate-500/10 text-slate-600 border-slate-500/20";
                                      return (
                                        <tr
                                          key={emp.email}
                                          onClick={() => {
                                            const matched = OS_SCREENS.find(s => s.id === "roster");
                                            if (matched) setActiveScreen(matched);
                                          }}
                                          className="hover:bg-[#BDDDF8] transition-colors cursor-pointer"
                                        >
                                          <td className="px-4 py-3 flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-[#EAF5FF] text-[#315C9F] border-[#9EC8EF] font-black text-xs flex items-center justify-center border shadow-sm">
                                              {initials}
                                            </div>
                                            <div>
                                              <p className="font-extrabold text-[#1F3557]">{emp.firstName} {emp.lastName}</p>
                                              <p className="text-[10px] text-[#5E7393] font-mono tracking-wider">{emp.role}</p>
                                            </div>
                                          </td>
                                          <td className="px-4 py-3 text-right font-mono font-bold text-[#1F3557]">{hours.toFixed(2)}</td>
                                          <td className="px-4 py-3 text-right font-mono font-bold text-[#1F3557]">{otHours.toFixed(2)}</td>
                                          <td className="px-4 py-3 text-right font-mono font-bold text-[#1F3557]">${pay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                          <td className="px-4 py-3 text-center font-mono text-[#5E7393]">{lastPayroll ? lastPayroll.date : "—"}</td>
                                          <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-0.5 border text-[9.5px] font-bold rounded ${statusColor}`}>
                                              {status}
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </>
                          );
                        })()}
                        
                        <div className="text-center pt-2">
                          <button
                            onClick={() => setRevenueConfirmAction({ label: "Complete Payroll & Wage Ledger", icon: "👥" })}
                            className="text-[#315C9F] hover:text-[#1F3557] font-bold text-xs hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            View All Employees ➔
                          </button>
                        </div>
                      </div>

                      {/* FINANCIAL INSIGHTS & QUICK ACTIONS SECTION (Bento Style Grid) */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        {/* Financial Insights Card */}
                        <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-4 lg:col-span-2 text-left">
                          <div className="border-b border-[#9EC8EF]/30 pb-3">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-[#5E7393]">Algorithmic Auditing</span>
                            <h3 className="text-base font-sans font-black text-[#1F3557] tracking-tight">Financial Insights</h3>
                            <p className="text-xs text-[#5E7393] font-sans font-semibold">Active warning signals, cost inflations, and profit margin optimizations</p>
                          </div>
                          
                          <div className="space-y-3">
                            {(() => {
                              // Real insights only, each gated on having a real prior period to
                              // compare against — no invoice or tax-liability system exists in the
                              // app to back "overdue invoices" / "quarterly tax due" style claims,
                              // so those insight types were removed rather than left fabricated.
                              const now = new Date();
                              const periodDays = 14;
                              const curStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - periodDays);
                              const curEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                              const priorStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - periodDays * 2);
                              const priorEnd = curStart;
                              const sumBetween = (category: string | null, start: Date, end: Date) =>
                                transactions
                                  .filter(t => t.type === "expense" && (!category || t.category === category) && new Date(t.date) >= start && new Date(t.date) < end)
                                  .reduce((s, t) => s + t.amount, 0);
                              const pctChange = (cur: number, prior: number) => ((cur - prior) / prior) * 100;

                              const insights: Array<{ text: string; link: string; color: string; icon: any; action: string }> = [];

                              const curPayroll = sumBetween("Payroll", curStart, curEnd);
                              const priorPayroll = sumBetween("Payroll", priorStart, priorEnd);
                              if (curPayroll > 0 && priorPayroll > 0) {
                                const pct = pctChange(curPayroll, priorPayroll);
                                insights.push({
                                  text: `Payroll is ${pct >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}% vs the prior ${periodDays} days ($${curPayroll.toLocaleString(undefined, { maximumFractionDigits: 0 })} vs $${priorPayroll.toLocaleString(undefined, { maximumFractionDigits: 0 })}).`,
                                  link: "Review payroll details ➔",
                                  color: "border-[#9EC8EF] bg-purple-500/5 text-purple-700",
                                  icon: Users,
                                  action: "Payroll Ledger Analysis"
                                });
                              }

                              const curFuel = sumBetween("Fuel", curStart, curEnd);
                              const priorFuel = sumBetween("Fuel", priorStart, priorEnd);
                              if (curFuel > 0 && priorFuel > 0) {
                                const pct = pctChange(curFuel, priorFuel);
                                insights.push({
                                  text: `Fuel expenses are ${pct >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}% vs the prior ${periodDays} days ($${curFuel.toLocaleString(undefined, { maximumFractionDigits: 0 })} vs $${priorFuel.toLocaleString(undefined, { maximumFractionDigits: 0 })}).`,
                                  link: "Review fuel expenses ➔",
                                  color: "border-[#9EC8EF] bg-amber-500/5 text-amber-700",
                                  icon: Landmark,
                                  action: "Fuel Receipts & Fleet Usage"
                                });
                              }

                              const curIncomeTx = transactions.filter(t => t.type === "income" && new Date(t.date) >= curStart && new Date(t.date) < curEnd).reduce((s, t) => s + t.amount, 0);
                              const curRevenue = revenueEvents.filter(e => new Date(e.date) >= curStart && new Date(e.date) < curEnd).reduce((s, e) => s + e.amount, 0) + curIncomeTx;
                              const curExpenses = sumBetween(null, curStart, curEnd);
                              if (curRevenue > 0) {
                                const margin = ((curRevenue - curExpenses) / curRevenue) * 100;
                                insights.push({
                                  text: `Profit margin over the last ${periodDays} days is ${margin.toFixed(1)}% ($${(curRevenue - curExpenses).toLocaleString(undefined, { maximumFractionDigits: 0 })} profit on $${curRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} revenue).`,
                                  link: "View profit report ➔",
                                  color: "border-[#9EC8EF] bg-emerald-500/5 text-emerald-700",
                                  icon: TrendingUp,
                                  action: "Net Profitability Margin Analyzer"
                                });
                              }

                              if (insights.length === 0) {
                                return (
                                  <div className="p-4 rounded-2xl border border-dashed border-[#9EC8EF] text-[11px] text-[#5E7393] font-sans font-medium text-center">
                                    Not enough transaction history yet to generate real insights — log income/expenses and run payroll to build up a comparison period.
                                  </div>
                                );
                              }

                              return insights.map((insight, idx) => (
                                <div
                                  key={idx}
                                  onClick={() => openPlaceholderPage(insight.action, "🔍")}
                                  className={`p-3.5 rounded-2xl border ${insight.color} flex items-start gap-3 hover:scale-[1.01] transition-transform cursor-pointer text-xs`}
                                >
                                  <span className="p-1.5 bg-[#EAF5FF] rounded-lg shadow-sm border border-[#9EC8EF]/30 mt-0.5 shrink-0">
                                    <insight.icon className="w-3.5 h-3.5 text-[#315C9F]" />
                                  </span>
                                  <div>
                                    <p className="font-semibold leading-normal text-[#1F3557]">{insight.text}</p>
                                    <p className="text-[10px] font-bold mt-1 inline-block text-[#315C9F] hover:underline">
                                      {insight.link}
                                    </p>
                                  </div>
                                </div>
                              ));
                            })()}
                          </div>
                        </div>

                        {/* Quick Actions Card */}
                        <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm flex flex-col justify-between gap-4 text-left">
                          <div className="border-b border-[#9EC8EF]/30 pb-3">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-[#5E7393]">Ledger Actions</span>
                            <h3 className="text-base font-sans font-black text-[#1F3557] tracking-tight">Quick Actions</h3>
                            <p className="text-xs text-[#5E7393] font-sans font-semibold">Execute double-entry bookkeeping actions</p>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 flex-1 py-1">
                            {[
                              { label: "Record Expense", action: "expense", icon: DollarSign },
                              { label: "Run Payroll", action: "payroll", icon: Users },
                              { label: "Create Invoice", action: "invoice", icon: FileText },
                              { label: "Reconcile Bank", action: "accounting", icon: Landmark }
                            ].map((btn, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  if (btn.action === "expense") {
                                    sessionStorage.setItem("ownerslocal_pending_financial_scan", "expense");
                                    setLogTransactionType("expense");
                                    return;
                                  }
                                  if (btn.action === "payroll") {
                                    handleRunPayroll();
                                    return;
                                  }
                                  const accounting = OS_SCREENS.find(screen => screen.id === "accounting");
                                  if (accounting) setActiveScreen(accounting);
                                  triggerNotification(btn.action === "invoice" ? "Open Invoices to create a customer invoice." : "Open Banking to reconcile accounts.");
                                }}
                                className="bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] hover:border-[#4A86F7] rounded-xl p-3.5 flex flex-col items-center justify-center text-center gap-2 cursor-pointer transition-all hover:scale-[1.02]"
                              >
                                <span className="p-1.5 bg-[#EAF5FF] border border-[#9EC8EF]/30 rounded-lg text-[#315C9F] shadow-sm">
                                  <btn.icon className="w-4 h-4" />
                                </span>
                                <span className="text-[10.5px] font-extrabold text-[#1F3557] uppercase tracking-wide leading-tight">
                                  {btn.label}
                                </span>
                              </button>
                            ))}
                          </div>
                          
                          <button
                            onClick={() => {
                              const accounting = OS_SCREENS.find(screen => screen.id === "accounting");
                              if (accounting) setActiveScreen(accounting);
                              triggerNotification("Open Reports for current financial statements.");
                            }}
                            className="w-full py-3 bg-[#4A86F7] hover:bg-[#3977EE] text-white font-bold rounded-xl text-xs transition-colors cursor-pointer text-center uppercase tracking-wider shadow-sm"
                          >
                            View Financial Reports
                          </button>
                        </div>
                      </div>

                      {/* FUTURE INTEGRATIONS SECTION (Bottom Card) */}
                      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-4">
                        <div className="border-b border-[#9EC8EF]/30 pb-3">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-[#5E7393]">Automations & Ecosystems</span>
                          <h3 className="text-base font-sans font-black text-[#1F3557] tracking-tight">Future Integrations</h3>
                          <p className="text-xs text-[#5E7393] font-sans font-semibold">Connect OwnersLOCAL with your accounting software</p>
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                          {[
                            { name: "Bank Accounts", icon: Landmark, desc: "Plaid Integration" },
                            { name: "Payroll Provider", icon: Users, desc: "Gusto / ADP Synced" },
                            { name: "QuickBooks", icon: Landmark, desc: "Ledger Realtime Sync" },
                            { name: "Stripe", icon: CreditCard, desc: "Card Payment Gateway" },
                            { name: "Square", icon: Box, desc: "Mobile Register Sync" }
                          ].map((integ, idx) => (
                            <div
                              key={idx}
                              className="border border-dashed border-[#9EC8EF] rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-2.5 opacity-80 bg-[#EAF5FF]/50 hover:opacity-100 transition-opacity"
                            >
                              <div className="w-9 h-9 rounded-full bg-[#EAF5FF] text-[#315C9F] border border-[#9EC8EF] flex items-center justify-center text-sm shadow-sm">
                                <integ.icon className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="text-[11px] font-extrabold text-[#1F3557] leading-none">{integ.name}</p>
                                <p className="text-[9px] text-[#5E7393] font-medium mt-0.5">{integ.desc}</p>
                              </div>
                              <span className="px-2 py-0.5 bg-[#9EC8EF]/30 text-[#1F3557] border border-[#9EC8EF]/50 text-[8.5px] font-bold rounded">
                                Coming Soon
                              </span>
                            </div>
                          ))}
                        </div>
                        
                        <div className="text-center pt-2">
                          <button
                            onClick={() => {
                              const matched = OS_SCREENS.find(s => s.id === "integrations");
                              if (matched) {
                                setActiveScreen(matched);
                                triggerNotification("Navigated to Integrations & Gateways Settings");
                              }
                            }}
                            className="text-[#315C9F] hover:text-[#1F3557] font-bold text-xs hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            View All Integrations ➔
                          </button>
                        </div>
                      </div>

                    </div>
                    )

                  ) : activeScreen.id === "scheduling" ? (
                    <SchedulingPage />

                  ) : activeScreen.id === "dispatch" ? (
                    <DispatchPage />

                  ) : activeScreen.id === "jobs" ? (
                    <JobsPage />

                  ) : activeScreen.id === "routes" ? (
                    <MapPageErrorBoundary>
                      <InteractiveMapPage
                        businessAddresses={businessAddresses}
                      />
                    </MapPageErrorBoundary>

                  ) : activeScreen.id === "bulletins" ? (
                    
                    /* BULLETINS PAGE */
                    <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm space-y-6 animate-fade-in text-left">
                      <div className="flex items-center justify-between border-b border-[#A9CDEE] pb-4">
                        <div>
                          <h2 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">Company Bulletins Center</h2>
                          <p className="text-xs text-slate-500">Read official notifications or post announcements for administrative approval</p>
                        </div>
                        <span className="px-3 py-1 bg-[#E3F3FF] text-[#4A9BFF] text-xs font-mono font-bold rounded-xl border border-[#A9CDEE]">
                          Active Notices
                        </span>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Post bulletin form */}
                        <div className="bg-[#E3F3FF] p-5 rounded-2xl border border-[#A9CDEE] space-y-4 h-fit">
                          <div>
                            <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Post New Notice</h3>
                            <p className="text-[10.5px] text-slate-600 mt-1">
                              Note: If you are not an owner, manager, or scheduler, your bulletin will require approval.
                            </p>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Bulletin Title</label>
                            <input
                              value={newBulletinTitle}
                              onChange={(e) => setNewBulletinTitle(e.target.value)}
                              type="text"
                              placeholder="e.g. Safety Regulations"
                              className="w-full text-xs bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A9BFF] font-medium font-sans text-slate-700"
                            />
                          </div>

                          <div className="space-y-1 flex flex-col">
                            <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold text-left">Content</label>
                            <textarea
                              value={newBulletinContent}
                              onChange={(e) => setNewBulletinContent(e.target.value)}
                              placeholder="Describe details clearly..."
                              rows={4}
                              className="w-full text-xs bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A9BFF] font-medium font-sans text-slate-700"
                            />
                          </div>

                          <button
                            onClick={() => {
                              if (!newBulletinTitle.trim() || !newBulletinContent.trim()) {
                                triggerNotification("Please fill in both title and content.");
                                return;
                              }
                              const activeRole = simulatedRole || loggedInUser?.role || "Owner";
                              const nameClean = loggedInUser?.name || (loggedInUser?.email ? loggedInUser.email.split("@")[0] : "waterdrops2001");
                              
                              const directApprovalRoles = ["Owner", "General Manager", "Office Manager", "Operations Manager", "Scheduler"];
                              const isDirect = directApprovalRoles.includes(activeRole);
                              
                              const newBulletinItem = {
                                id: `${bulletins.length + 1}`,
                                title: newBulletinTitle.trim(),
                                content: newBulletinContent.trim(),
                                author: nameClean,
                                role: activeRole,
                                date: "Today, " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                status: isDirect ? ("approved" as const) : ("pending" as const)
                              };
                              
                              setBulletins(prev => [newBulletinItem, ...prev]);
                              setNewBulletinTitle("");
                              setNewBulletinContent("");
                              
                              if (isDirect) {
                                triggerNotification("Bulletin posted successfully!");
                              } else {
                                triggerNotification("Bulletin submitted! Awaiting Manager/Owner approval.");
                              }
                            }}
                            className="w-full py-2.5 bg-[#4A9BFF] hover:bg-[#3583E6] text-white font-bold rounded-xl text-xs transition-colors cursor-pointer text-center uppercase tracking-wider shadow-sm"
                          >
                            Post Bulletin
                          </button>
                        </div>

                        {/* Bulletins listing feed */}
                        <div className="lg:col-span-2 space-y-4">
                          {/* Pending approvals section (for management roles) */}
                          {["Owner", "General Manager", "Office Manager"].includes(simulatedRole || loggedInUser?.role || "Owner") && bulletins.some(b => b.status === "pending") && (
                            <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-2xl space-y-3">
                              <h3 className="text-xs font-extrabold text-amber-800 uppercase tracking-wider">Awaiting Manager Approval</h3>
                              <div className="space-y-3">
                                {bulletins.filter(b => b.status === "pending").map((b) => (
                                  <div key={b.id} className="p-3.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl flex flex-col justify-between gap-3 shadow-sm">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <p className="text-xs font-black text-slate-800">{b.title}</p>
                                        <p className="text-[10px] text-slate-400 font-medium">By {b.author} ({b.role}) • {b.date}</p>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          onClick={() => {
                                            setBulletins(prev => prev.map(item => item.id === b.id ? { ...item, status: "approved" as const } : item));
                                            triggerNotification("Bulletin approved and published!");
                                          }}
                                          className="px-2.5 py-1 bg-emerald-500 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer"
                                        >
                                          Approve
                                        </button>
                                        <button
                                          onClick={() => {
                                            setBulletins(prev => prev.filter(item => item.id !== b.id));
                                            triggerNotification("Bulletin submission rejected.");
                                          }}
                                          className="px-2.5 py-1 bg-rose-500 text-white text-[10px] font-bold rounded-lg hover:bg-rose-600 transition-colors cursor-pointer"
                                        >
                                          Reject
                                        </button>
                                      </div>
                                    </div>
                                    <p className="text-xs text-slate-600 leading-normal font-sans font-medium">{b.content}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Active Bulletins Board</h3>
                          <div className="space-y-3.5">
                            {bulletins.filter(b => b.status === "approved").length === 0 ? (
                              <div className="text-center py-8 text-slate-400 text-xs">
                                No announcements active currently.
                              </div>
                            ) : (
                              bulletins.filter(b => b.status === "approved").map((b) => (
                                <div key={b.id} className="p-4 bg-[#E3F3FF] hover:bg-[#E3F3FF]/80 border border-[#A9CDEE] rounded-2xl flex flex-col gap-2 shadow-sm transition-all">
                                  <div className="flex items-center justify-between text-[10.5px] font-bold text-[#4A9BFF] border-b border-[#A9CDEE]/40 pb-1.5">
                                    <span className="uppercase tracking-wider">{b.author} ({b.role})</span>
                                    <span className="font-mono text-slate-400">{b.date}</span>
                                  </div>
                                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">{b.title}</h4>
                                  <p className="text-xs text-slate-500 leading-relaxed font-sans font-medium">{b.content}</p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                  ) : activeScreen.id === "notifications" ? (
                    
                    <NotificationsPage
                      dashboardLeads={dashboardLeads}
                      setDashboardLeads={setDashboardLeads}
                    />

                  ) : (
                    
                    /* Screens that don't have a dedicated real implementation yet -- shown
                       honestly as "not built yet" rather than dressed up with fake activity. */
                    <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm min-h-[420px] flex flex-col justify-between gap-5 animate-fade-in text-left">
                      <div className="flex items-center justify-between border-b border-[#A9CDEE] pb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl select-none">{activeScreen.icon}</span>
                          <div>
                            <h2 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">{activeScreen.label}</h2>
                            <p className="text-xs text-slate-500 font-sans font-semibold">This feature isn't built yet</p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 bg-[#E3F3FF] text-[#4A9BFF] text-[9px] font-mono font-bold rounded-xl border border-[#A9CDEE] uppercase">
                          Not Built Yet
                        </span>
                      </div>

                      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-[#E3F3FF] rounded-2xl border border-dashed border-[#A9CDEE]">
                        <div className="w-12 h-12 rounded-full bg-[#F5FAFF] text-[#4A9BFF] flex items-center justify-center text-xl font-bold border border-[#A9CDEE] shadow-sm mb-4">
                          {activeScreen.icon}
                        </div>
                        <h4 className="text-xs font-black text-slate-700 font-sans uppercase tracking-wider">{activeScreen.label}</h4>
                        <p className="text-slate-600 text-[11px] mt-1.5 max-w-xs leading-relaxed font-sans font-semibold">
                          We haven't built this screen yet. Use the sidebar to get back to a working part of the app.
                        </p>
                      </div>
                    </div>
                  )}

                </div>

              )}

            </div>

            {/* Sidebar toggle button is now integrated into the header of the narrow sidebar itself! */}
          </div>
        )}

      </main>

      {!isLoggedIn && (
        <div
          aria-label="Created by Stuffapp"
          className="fixed bottom-3 right-4 z-20 pointer-events-none font-sans text-[10px] sm:text-xs font-semibold tracking-[0.08em] text-[#315C9F]/55"
        >
          by Stuffapp
        </div>
      )}

      {/* CAMERA SHUTTER SNAPSHOT FLASH SIMULATION */}
      {isFlashing && (
        <div 
          className="fixed inset-0 bg-white z-[9999] pointer-events-none transition-opacity duration-300 ease-out opacity-100 animate-pulse" 
          style={{ animationDuration: "150ms", animationIterationCount: 1 }}
        />
      )}

      {/* REVENUE SENSITIVE OPERATIONS CONFIRMATION DIALOG */}
      {revenueConfirmAction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full mx-4 shadow-xl border border-blue-100 space-y-4 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
              <Lock className="w-6 h-6 animate-pulse" />
            </div>
            <h3 className="text-base font-extrabold text-[#1F3557] uppercase tracking-wider">Confirm Financial Report Download</h3>
            <p className="text-xs text-[#5E7393] leading-relaxed font-sans font-medium">
              You are requesting to generate and load: <strong className="text-red-600">{revenueConfirmAction.label}</strong>. 
              This contains confidential company revenue, profit margins, and payroll balances. 
              Please confirm your administrative override to compile this data.
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={() => setRevenueConfirmAction(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const target = revenueConfirmAction;
                  setRevenueConfirmAction(null);
                  openPlaceholderPage(target.label, target.icon);
                  logOperationalEvent("Financial Export", `User authorized download of sensitive report: ${target.label}`, "📊");
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1 shadow-md shadow-blue-500/15"
              >
                Authorize & Load
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI OPTION COMPANION WORKSPACE CHATBOT DRAWER */}
      {isAIAnalysisOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          {/* Backdrop Click */}
          <div className="absolute inset-0" onClick={() => setIsAIAnalysisOpen(false)} />

          {/* Drawer content panel */}
          <div className="relative w-full max-w-lg h-full bg-[#EAF5FF] border-l border-[#9EC8EF] shadow-2xl flex flex-col justify-between overflow-hidden animate-slide-in-right">
            
            {/* Header */}
            <div className="p-5 bg-[#C7E3FA] border-b border-[#9EC8EF] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[#EAF5FF] rounded-xl border border-[#9EC8EF]">
                  <Sparkles className="w-5 h-5 text-[#315C9F] animate-pulse" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-sans font-extrabold text-[#1F3557] uppercase tracking-wider">
                    Owner's AI Option
                  </h3>
                  <p className="text-[10px] text-[#5E7393] font-bold uppercase tracking-widest">
                    AI help for this page • {aiPageName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAIAnalysisOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold text-sm transition-colors flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Message Area */}
            <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-[#EAF5FF]">
              {aiMessages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex flex-col max-w-[85%] text-left ${
                    msg.sender === "user" ? "ml-auto items-end" : "mr-auto items-start"
                  }`}
                >
                  <span className="text-[9px] uppercase tracking-wider font-bold text-[#5E7393] mb-1">
                    {msg.sender === "user" ? "You" : "Owner's AI"}
                  </span>
                  <div
                    className={`p-3.5 rounded-2xl text-xs leading-relaxed border shadow-sm ${
                      msg.sender === "user"
                        ? "bg-[#315C9F] border-[#1F3557] text-white rounded-tr-none"
                        : "bg-[#C7E3FA] border-[#9EC8EF] text-[#1F3557] rounded-tl-none whitespace-pre-wrap"
                    }`}
                  >
                    {msg.sender === "ai" ? (
                      <div className="prose prose-sm max-w-none">
                        {msg.text.split("\n").map((line, lIdx) => {
                          if (line.startsWith("###")) {
                            return <h4 key={lIdx} className="font-extrabold text-sm text-[#1F3557] mt-2 mb-1 uppercase">{line.replace("###", "").trim()}</h4>;
                          }
                          if (line.startsWith("1.") || line.startsWith("2.") || line.startsWith("3.")) {
                            return <p key={lIdx} className="ml-1.5 mt-1 text-[#1F3557] font-medium">{line}</p>;
                          }
                          if (line.startsWith("-")) {
                            return <li key={lIdx} className="ml-3 mt-0.5 text-slate-700">{line.replace("-", "").trim()}</li>;
                          }
                          return <p key={lIdx} className="mt-1">{line}</p>;
                        })}
                      </div>
                    ) : (
                      msg.text
                    )}
                  </div>
                </div>
              ))}

              {aiIsLoading && (
                <div className="flex items-center gap-2 mr-auto text-xs text-[#5E7393] font-semibold bg-[#C7E3FA] border border-[#9EC8EF] px-3.5 py-2.5 rounded-2xl rounded-tl-none animate-pulse">
                  <div className="w-2.5 h-2.5 bg-[#315C9F] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2.5 h-2.5 bg-[#315C9F] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2.5 h-2.5 bg-[#315C9F] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span>AI Agent is analyzing workspace ledger...</span>
                </div>
              )}

              {pendingAiAction && pendingAiAction.type === "drawer" && (
                <div className="bg-[#FFF5F5] border-2 border-red-200 rounded-2xl p-4 shadow-sm space-y-3 animate-fade-in text-left">
                  <div className="flex items-start gap-2.5">
                    <span className="p-1.5 bg-red-100 rounded-lg text-red-600 font-bold text-sm">🔒</span>
                    <div>
                      <h4 className="text-xs font-extrabold text-red-800 uppercase tracking-wider">Financial Data Clearance Check</h4>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed font-semibold">
                        Your query involves sensitive ledger parameters (e.g. lifetime value, unpaid balances, or margin indexes). Do you confirm you have authorization to reveal these metrics in this session?
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-8 pt-1">
                    <button
                      onClick={() => {
                        const queryToRun = pendingAiAction.query;
                        setPendingAiAction(null);
                        executeConfirmedAIMessage(queryToRun);
                      }}
                      className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10.5px] font-extrabold rounded-lg shadow-sm transition-all uppercase cursor-pointer tracking-wider"
                    >
                      Confirm & Reveal
                    </button>
                    <button
                      onClick={() => {
                        setPendingAiAction(null);
                      }}
                      className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-[10.5px] font-bold rounded-lg transition-all uppercase cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Suggestions list */}
            <div className="px-5 py-2 bg-[#C7E3FA]/40 border-t border-[#9EC8EF]/40 flex flex-wrap gap-1.5 justify-start">
              {[
                "Who is our top performer?",
                "How can we grow conversions?",
                "Analyze outstanding unpaid invoices"
              ].map((sug, sIdx) => (
                <button
                  key={sIdx}
                  disabled={!!pendingAiAction}
                  onClick={() => {
                    setAiInputMessage(sug);
                  }}
                  className={`px-2.5 py-1 text-[10px] font-sans font-bold text-[#315C9F] hover:text-white hover:bg-[#315C9F] bg-white border border-[#9EC8EF] rounded-lg transition-all cursor-pointer shadow-sm shrink-0 ${pendingAiAction ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {sug}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <div className="p-4 bg-[#C7E3FA] border-t border-[#9EC8EF] flex items-center gap-2">
              <input
                type="text"
                value={aiInputMessage}
                disabled={!!pendingAiAction}
                onChange={(e) => setAiInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !pendingAiAction) handleSendAIMessage();
                }}
                placeholder={pendingAiAction ? "Confirmation pending... make a selection above" : `Ask about ${aiPageName} metrics or suggestions...`}
                className={`flex-1 bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-4 py-3 text-xs text-[#1F3557] placeholder-[#5E7393]/70 focus:outline-none focus:border-[#315C9F] font-semibold ${pendingAiAction ? "opacity-60 cursor-not-allowed" : ""}`}
              />
              <button
                onClick={handleSendAIMessage}
                disabled={!!pendingAiAction}
                className={`px-4 py-3 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-bold rounded-xl transition-all uppercase tracking-wider cursor-pointer shadow-sm ${pendingAiAction ? "opacity-55 cursor-not-allowed" : ""}`}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL FLOATING AI WIDGET -- draggable; remembers where the owner last left it */}
      <div
        id="floating-ai-widget"
        className={`fixed z-40 select-none ${aiWidgetPos ? "" : "bottom-24 right-6"}`}
        style={aiWidgetPos ? { left: aiWidgetPos.x, top: aiWidgetPos.y } : undefined}
      >

        {/* Toggle Trigger Pill (drag by pressing and moving) */}
        {!isFloatingAiOpen && isLoggedIn && (
          <button
            onClick={() => { if (!aiDragState.current.dragging) setIsFloatingAiOpen(true); }}
            onPointerDown={(e) => startAiWidgetDrag(e, 180, 52)}
            className="flex items-center gap-2 px-4 py-3.5 bg-gradient-to-r from-[#1F3557] to-[#315C9F] text-white rounded-2xl shadow-[0_4px_25px_rgba(31,53,87,0.35)] hover:shadow-[0_4px_30px_rgba(74,134,247,0.5)] hover:scale-105 border border-[#9EC8EF]/40 transition-all cursor-grab active:cursor-grabbing group font-sans font-black text-xs uppercase tracking-wider"
            title="Drag to move, click to open"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span>Owner's AI</span>
            <Sparkles className="w-4 h-4 text-amber-300 group-hover:rotate-12 transition-transform" />
          </button>
        )}

        {/* Slide-Up Panel Overlay */}
        {isFloatingAiOpen && (
          <div className="w-96 h-[550px] bg-white rounded-3xl border border-[#9EC8EF] shadow-2xl flex flex-col overflow-hidden animate-slide-up select-text">

            {/* Drawer Header (drag handle) */}
            <div
              onPointerDown={(e) => startAiWidgetDrag(e, 384, 550)}
              className="bg-[#1F3557] text-white px-4 py-3 flex items-center justify-between border-b border-white/10 shrink-0 cursor-grab active:cursor-grabbing"
              title="Drag to move"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#315C9F] to-[#4A86F7] text-white flex items-center justify-center text-lg font-bold">
                  🤖
                </div>
                <div className="text-left">
                  <h3 className="text-xs font-black uppercase tracking-wider">OwnersLOCAL AI</h3>
                  <p className="text-[9.5px] text-slate-300 font-mono">Module: {activeScreen.label}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Collapse button */}
                <button
                  onClick={() => setIsFloatingAiOpen(false)}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center text-xs font-bold cursor-pointer"
                  title="Collapse Panel"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* TAB BAR NAVIGATION */}
            <div className="flex bg-[#EAF5FF] border-b border-[#9EC8EF]/30 p-1 shrink-0">
              {[
                { id: "ask", label: "Ask AI", icon: "💬" },
                { id: "actions", label: "Actions", icon: "⚡" },
                { id: "settings", label: "Settings", icon: "⚙️" },
                { id: "recent", label: "Ledger", icon: "📋" }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFloatingAiTab(tab.id as any)}
                  className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-wide rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    floatingAiTab === tab.id
                      ? "bg-[#315C9F] text-white border-[#315C9F] shadow-sm"
                      : "bg-transparent text-[#5E7393] border-transparent hover:bg-white/50"
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Current page context (real — reflects the actual active screen) */}
            <div className="bg-[#FFF9EA] border-b border-amber-200/50 px-3.5 py-2 flex items-center justify-between text-left text-[9.5px] text-[#855D00] font-sans font-bold uppercase tracking-wider">
              <span className="text-[8.5px] bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-300 text-amber-700">Viewing: {activeScreen.label}</span>
            </div>

            {/* PANEL BODY CONTENT AREA */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#F8FBFF]">
              
              {/* ASK AI CHAT TAB */}
              {floatingAiTab === "ask" && (
                <div className="h-full flex flex-col justify-between gap-3 text-left">
                  <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 select-text">
                    {floatingAiMessages.map((m, idx) => (
                      <div key={idx} className={`flex flex-col max-w-[85%] ${m.sender === "user" ? "ml-auto items-end" : "mr-auto items-start"}`}>
                        <span className="text-[8.5px] font-bold text-slate-400 uppercase mb-0.5 tracking-wider">
                          {m.sender === "user" ? "You" : "Owner's AI"}
                        </span>
                        <div className={`p-3 rounded-2xl text-[11px] leading-relaxed border shadow-xs ${
                          m.sender === "user"
                            ? "bg-[#315C9F] text-white border-[#315C9F]"
                            : "bg-white text-slate-700 border-[#9EC8EF]/40"
                        }`}>
                          {m.sender === "ai" ? (
                            <div className="prose prose-sm max-w-none text-left">
                              {/* Simple Markdown Render helpers */}
                              {m.text.split("\n\n").map((para, pIdx) => {
                                if (para.startsWith("###")) {
                                  return <h4 key={pIdx} className="text-xs font-black uppercase text-[#1F3557] mb-1.5 mt-2">{para.replace("###", "").trim()}</h4>;
                                }
                                if (para.startsWith("*") || para.startsWith("-")) {
                                  return (
                                    <ul key={pIdx} className="list-disc pl-4 space-y-1 my-1.5 text-[10.5px]">
                                      {para.split("\n").map((li, lIdx) => (
                                        <li key={lIdx}>{li.replace(/^[*\-\s]+/, "").trim()}</li>
                                      ))}
                                    </ul>
                                  );
                                }
                                return <p key={pIdx} className="mb-1.5 font-medium leading-relaxed">{para}</p>;
                              })}
                            </div>
                          ) : (
                            <p className="font-semibold leading-relaxed">{m.text}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {floatingAiLoading && (
                      <div className="flex items-center gap-1.5 p-2 text-[10px] text-[#5E7393] font-bold font-mono">
                        <span className="animate-bounce">●</span>
                        <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
                        <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>●</span>
                        <span className="text-[9px]">Model is processing viewport...</span>
                      </div>
                    )}
                  </div>

                  {pendingAiAction && pendingAiAction.type === "floating" && (
                    <div className="bg-[#FFF5F5] border border-red-200 rounded-xl p-3 shadow-xs space-y-2.5 animate-fade-in text-left shrink-0">
                      <div className="flex items-start gap-2">
                        <span className="p-1 bg-red-100 rounded text-red-600 font-bold text-xs">🔒</span>
                        <div>
                          <h4 className="text-[10px] font-black text-red-800 uppercase tracking-wider">Access Clearance Confirmation</h4>
                          <p className="text-[9.5px] text-slate-600 mt-0.5 leading-relaxed font-semibold">
                            Revealing company accounts, VIP Lifetime Values (LTV), or past-due debt ledgers requires session verification. Do you confirm your Owner/Admin permission level?
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 pl-6">
                        <button
                          onClick={() => {
                            const queryToRun = pendingAiAction.query;
                            const cTxt = pendingAiAction.customText;
                            setPendingAiAction(null);
                            executeConfirmedFloatingAiMessage(queryToRun, cTxt);
                          }}
                          className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-[9px] font-black rounded transition-all uppercase cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => {
                            setPendingAiAction(null);
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 text-[9px] font-bold rounded transition-all uppercase cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Grounded data-action confirmation: shows the exact real record(s) affected and
                      requires explicit approval before anything is written. */}
                  {pendingDataAction && (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 shadow-xs space-y-2.5 animate-fade-in text-left shrink-0">
                      <div className="flex items-start gap-2">
                        <span className="p-1 bg-amber-100 rounded text-amber-700 font-bold text-xs">⚠️</span>
                        <div>
                          <h4 className="text-[10px] font-black text-amber-800 uppercase tracking-wider">Confirm Action</h4>
                          {pendingDataAction.type === "reorder" ? (
                            <p className="text-[9.5px] text-slate-700 mt-0.5 leading-relaxed font-semibold">
                              Flag <strong>{pendingDataAction.item.name}</strong> for reorder — currently <strong>{pendingDataAction.item.quantity}</strong> on hand (minimum {pendingDataAction.item.minQuantity}). Suggested reorder quantity: <strong>{pendingDataAction.suggestedQty} units</strong>{pendingDataAction.item.vendor ? ` from ${pendingDataAction.item.vendor}` : " (no vendor on file)"}.
                            </p>
                          ) : (
                            <p className="text-[9.5px] text-slate-700 mt-0.5 leading-relaxed font-semibold">
                              Move <strong>{pendingDataAction.event.customer}</strong>'s job from <strong>{pendingDataAction.event.date}</strong> to <strong>{pendingDataAction.newDate}</strong>.
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 pl-6">
                        <button
                          onClick={confirmPendingDataAction}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[9px] font-black rounded transition-all uppercase cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setPendingDataAction(null)}
                          className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 text-[9px] font-bold rounded transition-all uppercase cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Smart suggestion chips based on active module */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1 bg-white p-2 rounded-xl border border-slate-100 shrink-0">
                    <span className="text-[8px] text-slate-400 font-extrabold uppercase w-full mb-1">Context Shortcuts:</span>
                    {activeScreen.id === "inventory" && (
                      <button
                        onClick={() => !pendingAiAction && !pendingDataAction && handleSendFloatingAiMessage("Order more.")}
                        disabled={!!pendingAiAction || !!pendingDataAction}
                        className={`px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-[9.5px] font-black cursor-pointer uppercase tracking-wider ${pendingAiAction || pendingDataAction ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        ⚡ Order more
                      </button>
                    )}
                    {activeScreen.id === "scheduling" && (
                      <button
                        onClick={() => !pendingAiAction && !pendingDataAction && handleSendFloatingAiMessage("Move him to tomorrow.")}
                        disabled={!!pendingAiAction || !!pendingDataAction}
                        className={`px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[9.5px] font-black cursor-pointer uppercase tracking-wider ${pendingAiAction || pendingDataAction ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        ⚡ Move to tomorrow
                      </button>
                    )}
                    {activeScreen.id === "revenue" && (
                      <button
                        onClick={() => !pendingAiAction && !pendingDataAction && handleSendFloatingAiMessage("Why did profit drop?")}
                        disabled={!!pendingAiAction || !!pendingDataAction}
                        className={`px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[9.5px] font-black cursor-pointer uppercase tracking-wider ${pendingAiAction || pendingDataAction ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        ⚡ Analyze drop
                      </button>
                    )}
                    <span className="text-[9px] text-slate-400 font-medium">Ask simple or complex queries using input below.</span>
                  </div>

                  {/* Input form */}
                  <div className="flex gap-1.5 pt-2 border-t border-slate-100 shrink-0">
                    <input
                      type="text"
                      value={floatingAiInput}
                      disabled={!!pendingAiAction || !!pendingDataAction}
                      onChange={(e) => setFloatingAiInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !pendingAiAction && !pendingDataAction) handleSendFloatingAiMessage();
                      }}
                      placeholder={pendingAiAction ? "Clearance check active..." : pendingDataAction ? "Confirmation pending... approve or cancel above" : `Ask Owner's AI about ${activeScreen.label}...`}
                      className={`flex-1 bg-slate-50 border border-[#9EC8EF]/40 rounded-xl px-3 py-2 text-[11px] text-[#1F3557] focus:outline-none focus:border-[#315C9F] font-semibold ${pendingAiAction || pendingDataAction ? "opacity-60 cursor-not-allowed" : ""}`}
                    />
                    <button
                      onClick={() => !pendingAiAction && !pendingDataAction && handleSendFloatingAiMessage()}
                      disabled={!!pendingAiAction || !!pendingDataAction}
                      className={`px-3.5 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-[10px] font-black rounded-xl transition-all uppercase tracking-wider cursor-pointer ${pendingAiAction || pendingDataAction ? "opacity-55 cursor-not-allowed" : ""}`}
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}

              {/* MODULE-SPECIFIC AI ACTIONS TAB */}
              {floatingAiTab === "actions" && (
                <div className="space-y-3.5 text-left">
                  <div className="bg-[#FFF9EA] p-3 rounded-2xl border border-amber-200 text-[10px] leading-relaxed text-amber-800 font-sans font-bold uppercase tracking-wider flex items-start gap-1.5">
                    <span className="text-sm shrink-0">⚡</span>
                    <span>Ready-to-Run operations for {activeScreen.label}</span>
                  </div>

                  <div className="space-y-2">
                    {/* Map of page actions */}
                    {(
                      activeScreen.id === "dashboard" ? ["Analyze Business", "Daily Summary", "Weekly Summary", "Monthly Summary"] :
                      activeScreen.id === "revenue" ? ["Analyze Profit", "Forecast Revenue", "Analyze Expenses", "Payroll Summary"] :
                      activeScreen.id === "customers" ? ["Customer Insights", "Follow-up Suggestions", "Customer Timeline"] :
                      activeScreen.id === "leads" ? ["Prioritize Leads", "Draft Follow-up", "Predict Closing Probability"] :
                      activeScreen.id === "estimates" ? ["Improve Estimate", "Suggest Pricing", "Compare Similar Jobs"] :
                      activeScreen.id === "scheduling" ? ["Optimize Schedule", "Detect Conflicts", "Assign Technician"] :
                      activeScreen.id === "dispatch" ? ["Assign Crew", "Optimize Dispatch"] :
                      activeScreen.id === "routes" ? ["Optimize Route", "Reduce Drive Time"] :
                      activeScreen.id === "jobs" ? ["Review Job", "Suggest Next Step"] :
                      activeScreen.id === "inventory" ? ["Detect Low Inventory", "Generate Purchase Order", "Scan Receipt", "Analyze Inventory"] :
                      activeScreen.id === "documents" ? ["Summarize Document", "Organize Files"] :
                      activeScreen.id === "messages" ? ["Draft Reply", "Rewrite Message", "Summarize Conversation"] :
                      activeScreen.id === "training" ? ["Assign Courses", "Generate Quiz", "Build Course"] :
                      activeScreen.id === "settings" ? ["Explain Settings", "Recommend Configuration"] :
                      activeScreen.id === "integrations" ? ["Diagnose Integration", "Sync Status"] :
                      activeScreen.id === "roster" ? ["Employee Summary", "Performance Review"] :
                      ["Post Bulletin Alert", "Summarize Announcements"]
                    ).map((act, aIdx) => (
                      <button
                        key={aIdx}
                        onClick={() => {
                          setFloatingAiTab("ask");
                          handleSendFloatingAiMessage(`Perform standard action: ${act}`);
                        }}
                        className="w-full p-3 bg-white hover:bg-[#EAF5FF] border border-slate-200 hover:border-[#315C9F] rounded-2xl text-[10.5px] font-black text-[#1F3557] flex items-center justify-between transition-all cursor-pointer uppercase tracking-wider"
                      >
                        <span className="truncate">{act}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-[#315C9F]" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* MODULE AI SETTINGS TAB */}
              {floatingAiTab === "settings" && (
                <div className="space-y-4 text-left">
                  <div className="bg-white p-3.5 rounded-2xl border border-[#9EC8EF]/40 space-y-1.5">
                    <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-wider">Module Override AI Level</h4>
                    <p className="text-[9px] text-slate-400 font-sans font-medium">
                      Control parameters for {activeScreen.label} specifically. Specific overrides customize the global fallback configured below.
                    </p>
                    <select
                      value={moduleAiSettings[activeScreen.id] || "DEFAULT"}
                      onChange={(e) => {
                        const val = e.target.value;
                        setModuleAiSettings(prev => ({ ...prev, [activeScreen.id]: val as any }));
                        triggerNotification(`⚙️ Override for ${activeScreen.label} set to ${val}`);
                      }}
                      className="w-full mt-2 text-[10px] font-bold text-[#1F3557] bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer"
                    >
                      <option value="DEFAULT">INHERIT DEFAULT ({globalAiSetting})</option>
                      <option value="OFF">OFF</option>
                      <option value="ASSIST">ASSIST</option>
                      <option value="ASSIST + APPROVAL">ASSIST + APPROVAL</option>
                      <option value="AUTO">AUTO (AUTONOMOUS)</option>
                    </select>
                  </div>

                  <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
                    <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-wider">Default Global Policy</h4>
                    <p className="text-[9px] text-slate-400 font-sans font-medium">
                      Baseline fallback for all workspaces.
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      {["OFF", "ASSIST", "ASSIST + APPROVAL", "AUTO"].map((mode) => (
                        <button
                          key={mode}
                          onClick={() => {
                            setGlobalAiSetting(mode as any);
                            triggerNotification(`🤖 Global AI baseline updated to ${mode}`);
                          }}
                          className={`p-1.5 rounded-lg border text-center text-[9px] font-black uppercase transition-all cursor-pointer ${
                            globalAiSetting === mode
                              ? "bg-[#315C9F] text-white border-transparent"
                              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {mode === "ASSIST + APPROVAL" ? "ASSIST + APP" : mode}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* RECENT AI ACTIONS LEDGER TAB */}
              {floatingAiTab === "recent" && (
                <div className="space-y-3.5 text-left">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-wider">Audit Log Checklist</h4>
                    <span className="text-[8.5px] bg-[#EAF5FF] text-[#315C9F] px-2 py-0.5 rounded font-mono font-black">
                      {recentAiActions.filter(a => a.status === "Completed").length} Active
                    </span>
                  </div>

                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {recentAiActions.map((act) => (
                      <div key={act.id} className={`p-3 rounded-2xl border transition-all text-left ${
                        act.status === "Undone" 
                          ? "bg-rose-50/50 border-rose-100 text-slate-400" 
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:border-[#315C9F]"
                      }`}>
                        <div className="flex justify-between items-center w-full">
                          <span className="text-[8px] bg-slate-200 px-1.5 py-0.5 rounded font-mono font-bold uppercase">{act.module}</span>
                          {act.status !== "Undone" && (
                            <button
                              onClick={() => {
                                // NOTE: this only marks the log entry as undone (audit annotation).
                                // Recent AI actions don't currently carry structured revert data, so
                                // this deliberately does not attempt to reverse the underlying change —
                                // doing that with guessed/hardcoded values would silently corrupt data.
                                setRecentAiActions(prev => prev.map(a => a.id === act.id ? { ...a, status: "Undone" } : a));
                                triggerNotification(`Marked as undone: ${act.action}. Reverse the change manually on the relevant page if needed.`);
                              }}
                              className="px-1.5 py-0.5 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-100 rounded text-[8px] font-black uppercase transition-colors cursor-pointer"
                            >
                              Undo
                            </button>
                          )}
                        </div>
                        <h5 className={`text-[10.5px] font-black uppercase mt-1.5 ${act.status === "Undone" ? "line-through text-slate-400" : "text-slate-800"}`}>{act.action}</h5>
                        <p className="text-[9.5px] leading-relaxed text-slate-500 font-sans font-semibold mt-0.5">{act.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

          </div>
        )}

      </div>

      {/* FLOATING SUCCESS/WARNING NOTIFICATIONS SYSTEM */}
      {showNotification && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-blue-500/30 shadow-[0_10px_30px_rgba(30,144,255,0.2)] rounded-2xl px-4 py-3.5 flex items-center gap-3 z-50 text-xs md:text-sm animate-fade-in text-slate-100 max-w-sm">
          <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-white mb-0.5">System Alert</p>
            <p className="text-slate-400 font-medium text-xs leading-tight">{showNotification}</p>
          </div>
        </div>
      )}





      {/* Universal footer */}
      <footer className="w-full py-4 text-center border-t border-white/5 bg-slate-950/80 backdrop-blur text-[11px] font-mono tracking-wider text-slate-500 z-10">
        OWNER'S LOCAL OS • CLOUD RUN PREVIEW SECURED CLIENT ENVIRONMENT • © 2026
      </footer>

    </div>
    </NavTelemetryContext.Provider>
    </DomainDataContext.Provider>
    </AuthContext.Provider>
  );
}
