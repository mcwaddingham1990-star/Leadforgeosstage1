import React, { useState, useEffect } from "react";
import { db, auth } from "./firebase";
import { doc, setDoc, getDoc, writeBatch } from "firebase/firestore";
import { fullAccessGranular, defaultGranularFromModuleList, hasPermission, GranularPermissions } from "./types/permissions";
import { RevenueEvent, EmployeeRecord, TimeClockLog, Transaction } from "./types/domain";
import { Account, JournalEntry, Invoice, Bill, Vendor, BankAccount, RecurringTransaction, MileageLog, Budget, SalesTaxRate, DEFAULT_CHART_OF_ACCOUNTS } from "./types/accounting";
import { postTransactionEntry } from "./lib/accountingEngine";
import { RolePermissionEditorModal, MODULE_CATALOG } from "./components/RolePermissionEditorModal";
import { LogTransactionModal } from "./components/LogTransactionModal";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
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
    description: "Dashboard, CRM, Sched, Msg, Docs, etc.",
    permissions: ["dashboard", "customers", "leads", "estimates", "scheduling", "documents", "messages", "training", "settings"]
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

// Asset URLs from OwnersLOCAL GitHub
const BRAND_ICON_DATA_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAXqBgADASIAAhEBAxEB/8QAHgAAAQUAAwEBAAAAAAAAAAAAAAECAwQFBgcICQr/xABUEAACAQMBBQUACwwIBgEDBAMAAQIDBBExBRITIWEGBxRBUQgWIjJSVHGBkaGxCRcZNDZCU2Jzg6PRFSMkJSYzN5I1Q0STosFysuHwRVVjgvEnGP/EAB0BAAEFAQEBAQAAAAAAAAAAAAABAgMEBQYHCAn/xAA+EQACAgECAggDBwMDBAIDAQAAAQIDEQQSBRMGFCExNFFScRZBkQcVIjI1YXIkM1MjQrFDgaHBJWKC0fBE/9oADAMBAAIRAxEAPwD5VAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/9k=";
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
  const since = new Date(Date.now() - sinceDaysAgo * 24 * 60 * 60 * 1000);
  const sorted = [...logs]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  let totalMs = 0;
  let segmentStart: number | null = null;
  for (const log of sorted) {
    const ts = new Date(log.timestamp).getTime();
    if (log.type === "Clock In" || log.type === "Break End") {
      segmentStart = Math.max(ts, since.getTime());
    } else if ((log.type === "Clock Out" || log.type === "Break Start") && segmentStart !== null) {
      if (ts >= since.getTime()) totalMs += Math.max(0, ts - segmentStart);
      segmentStart = null;
    }
  }
  if (segmentStart !== null) totalMs += Date.now() - segmentStart;
  return totalMs / 3600000;
}

const BrandIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <img
    src={BRAND_ICON_DATA_URL}
    alt=""
    aria-hidden="true"
    className={`object-cover rounded-[22%] ${className}`}
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
  const [customers, setCustomers] = useFirestoreCollection<Customer>("customers", businessId);
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
  const [employees, setEmployees, refreshEmployees] = useFirestoreCollection<EmployeeRecord>("employees", businessId);
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
      // Real logged-in employee — their own stored per-module View
      // permission is authoritative. This is what the owner actually
      // configured for this person, not a role-name lookup against a
      // generic template that may have since changed or never applied.
      perms = OS_SCREENS
        .map(s => s.id)
        .filter(id => hasPermission(loggedInUser.granularPermissions, id, "view"));
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
  const [businessLogos, setBusinessLogos] = useState<string[]>(["/branding/owners-logo.png"]);
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
  const [forgotSubmitted, setForgotSubmitted] = useState(false);

  // New states for Dashboard Customizations, Bulletins, and Revenue Graph
  const [customCardTargets, setCustomCardTargets] = useState({
    card1: "revenue",
    card2: "leads",
    card3: "scheduling"
  });
  const [isCustomizingDailyViewOpen, setIsCustomizingDailyViewOpen] = useState(false);
  const [revenueResetInterval, setRevenueResetInterval] = useState("Pay Period");
  const [newBulletinTitle, setNewBulletinTitle] = useState("");
  const [newBulletinContent, setNewBulletinContent] = useState("");
  const [isAddingBulletin, setIsAddingBulletin] = useState(false);
  const [payrollSearch, setPayrollSearch] = useState("");
  const [revenuePageFilter, setRevenuePageFilter] = useState("Pay Period");
  const [balanceView, setBalanceView] = useState("Total");
  const [logTransactionType, setLogTransactionType] = useState<"income" | "expense" | null>(() => {
    const saved = sessionStorage.getItem("ownerslocal_pending_financial_scan");
    return saved === "income" || saved === "expense" ? saved : null;
  });
  const [isRunningPayroll, setIsRunningPayroll] = useState(false);

  // Total Balance is the first-use default. After the user picks another
  // view, remember it per business through refreshes and logout/login.
  useEffect(() => {
    if (!businessId) return;
    const saved = localStorage.getItem(`ownerslocal_balance_view:${businessId}`);
    setBalanceView(["Day", "Pay Period", "Quarter", "Annual", "Total"].includes(saved || "") ? saved! : "Total");
  }, [businessId]);

  const changeBalanceView = (view: string) => {
    setBalanceView(view);
    if (businessId) localStorage.setItem(`ownerslocal_balance_view:${businessId}`, view);
  };

  // Global AI Widget States
  const [globalAiSetting, setGlobalAiSetting] = useState<"OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO">("ASSIST");
  const [moduleAiSettings, setModuleAiSettings] = useState<Record<string, "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO" | "DEFAULT">>({
    dashboard: "DEFAULT",
    revenue: "DEFAULT",
    customers: "DEFAULT",
    leads: "DEFAULT",
    estimates: "DEFAULT",
    scheduling: "DEFAULT",
    dispatch: "DEFAULT",
    routes: "DEFAULT",
    jobs: "DEFAULT",
    timeclock: "DEFAULT",
    inventory: "DEFAULT",
    documents: "DEFAULT",
    messages: "DEFAULT",
    training: "DEFAULT",
    settings: "DEFAULT",
    integrations: "DEFAULT",
    roster: "DEFAULT",
    bulletins: "DEFAULT",
    snapshots: "DEFAULT",
  });
  

  // Floating AI Widget UI States
  const [isFloatingAiOpen, setIsFloatingAiOpen] = useState(false);
  // Draggable position for the Owner's AI floating widget -- null means
  // "use the default bottom-right dock." Persisted so it stays wherever the
  // owner last dragged it, across reloads, and clamped to the viewport so it
  // can never end up stuck off-screen or covering something unreachable.
  const [aiWidgetPos, setAiWidgetPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem("ownersLocalOS_aiWidgetPos");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const aiDragState = React.useRef<{ dragging: boolean; startX: number; startY: number; originX: number; originY: number }>({
    dragging: false, startX: 0, startY: 0, originX: 0, originY: 0
  });

  const clampAiWidgetPos = (x: number, y: number, width: number, height: number) => ({
    x: Math.min(Math.max(x, 8), window.innerWidth - width - 8),
    y: Math.min(Math.max(y, 8), window.innerHeight - height - 8)
  });

  // Re-clamp whenever the panel opens (it's much larger than the toggle
  // pill) so a position saved while collapsed can never open partly
  // off-screen or hidden behind the edge of the viewport.
  useEffect(() => {
    if (isFloatingAiOpen && aiWidgetPos) {
      setAiWidgetPos((prev) => (prev ? clampAiWidgetPos(prev.x, prev.y, 384, 550) : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFloatingAiOpen]);

  const startAiWidgetDrag = (e: React.PointerEvent, widthGuess: number, heightGuess: number) => {
    const target = e.currentTarget as HTMLElement;
    const widget = target.closest("#floating-ai-widget") as HTMLElement | null;
    const rect = widget?.getBoundingClientRect();
    const originX = aiWidgetPos?.x ?? (rect ? rect.left : window.innerWidth - widthGuess - 24);
    const originY = aiWidgetPos?.y ?? (rect ? rect.top : window.innerHeight - heightGuess - 96);
    aiDragState.current = { dragging: false, startX: e.clientX, startY: e.clientY, originX, originY };

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - aiDragState.current.startX;
      const dy = moveEvent.clientY - aiDragState.current.startY;
      if (!aiDragState.current.dragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        aiDragState.current.dragging = true;
      }
      if (aiDragState.current.dragging) {
        const next = clampAiWidgetPos(aiDragState.current.originX + dx, aiDragState.current.originY + dy, widthGuess, heightGuess);
        setAiWidgetPos(next);
      }
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      if (aiDragState.current.dragging) {
        setAiWidgetPos((prev) => {
          try {
            if (prev) localStorage.setItem("ownersLocalOS_aiWidgetPos", JSON.stringify(prev));
          } catch {
            // ignore storage failures
          }
          return prev;
        });
      }
      aiDragState.current.dragging = false;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };
  const [floatingAiTab, setFloatingAiTab] = useState<"ask" | "actions" | "settings" | "recent">("ask");
  const [floatingAiInput, setFloatingAiInput] = useState("");
  const [floatingAiMessages, setFloatingAiMessages] = useState<Array<{ sender: "user" | "ai"; text: string }>>([
    {
      sender: "ai",
      text: "### 🤖 Owner's AI Companion\n\nI am connected to your live Local OS viewport. Ask me anything, or run automated actions for this workspace module!\n\n*Try asking me to perform an action, or select one from the Page Actions tab.*"
    }
  ]);
  const [floatingAiLoading, setFloatingAiLoading] = useState(false);

  // SNAPSHOT ARCHIVES STATE & MUTATIONS
  const [isFlashing, setIsFlashing] = useState(false);

  const createAndAddSnapshot = (pageId: string, pageName: string, metaData?: any, imageSrc?: string) => {
    setIsFlashing(true);
    setTimeout(() => {
      setIsFlashing(false);
    }, 450);

    const now = new Date();
    const formattedDate = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const timestampStr = `${formattedDate}, ${formattedTime}`;

    const dateSlug = now.toISOString().slice(0, 10).replace(/-/g, '_');
    const timeSlug = now.toTimeString().slice(0, 5).replace(/:/g, '');
    const filenameStr = `ownerslocal_snap_${pageId}_${dateSlug}_${timeSlug}.png`;

    const newSnapshot = {
      id: "snap_" + Math.random().toString(36).substring(2, 9),
      pageId,
      pageName,
      timestamp: timestampStr,
      filename: filenameStr,
      fileSize: `${Math.floor(400 + Math.random() * 200)} KB`,
      meta: metaData || {
        recordCount: pageId === "dashboard" ? 3 : pageId === "customers" ? 10 : 10,
        filters: "Default Filters",
        details: `${pageName} operational snapshot captured during simulated user session.`
      },
      image: imageSrc
    };

    setSnapshots(prev => [newSnapshot, ...prev]);
    triggerNotification(`Snapshot captured: ${filenameStr} saved to Snapshots Folder`);
  };

  // Real-time Firebase Authentication listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const profileSnap = await getDoc(doc(db, "user_profiles", user.uid));
          if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            const isEmployee = profileData.isEmployee ?? false;
            const isOnboarded = profileData.isOnboarded ?? false;

            if (isEmployee || isOnboarded) {
              const resolvedPermissions = profileData.permissions || ["dashboard", "customers", "leads", "estimates", "scheduling", "inventory", "documents", "messages", "settings"];
              setLoggedInUser({
                email: user.email || "",
                role: profileData.role || "Owner",
                permissions: resolvedPermissions,
                granularPermissions: profileData.granularPermissions || (isEmployee ? defaultGranularFromModuleList(resolvedPermissions, "edit") : fullAccessGranular(resolvedPermissions)),
                isEmployee: isEmployee,
                name: profileData.name || user.displayName || "Owner",
                goals: profileData.goals || "",
                businessEmail: isEmployee ? profileData.businessEmail : (user.email || "")
              });
              setIsLoggedIn(true);
              
              // Also, restore their settings from the business profile!
              const businessId = isEmployee ? profileData.businessEmail : user.email;
              if (businessId) {
                const bizSnap = await getDoc(doc(db, "business_profiles", businessId));
                if (bizSnap.exists()) {
                  const bizData = bizSnap.data();
                  if (bizData.customCardTargets) setCustomCardTargets(bizData.customCardTargets);
                  if (bizData.globalAiSetting) setGlobalAiSetting(bizData.globalAiSetting);
                  if (bizData.moduleAiSettings) setModuleAiSettings(bizData.moduleAiSettings);
                  if (bizData.integrationStatuses) setIntegrationStatuses(bizData.integrationStatuses);
                  if (Array.isArray(bizData.selectedRoles) && bizData.selectedRoles.length) setSelectedRoles(bizData.selectedRoles);
                }
                
                // Restore Time Clock state
                const clockSnap = await getDoc(doc(db, "timeclock_states", user.email || ""));
                if (clockSnap.exists()) {
                  const clockData = clockSnap.data();
                  setIsClockedIn(clockData.isClockedIn ?? false);
                  setClockInTime(clockData.clockInTime ?? null);
                  setClockInDuration(clockData.clockInDuration ?? 0);
                }
              }
            } else {
              // Not onboarded yet! Direct to Onboarding Step 1 within Interactive Login Card
              setEmail(user.email || "");
              setBusinessNames([profileData.name || ""]);
              setOwnerNames([profileData.name || ""]);
              setLoggedInUser({
                email: user.email || "",
                role: "Owner",
                permissions: profileData.permissions || ["dashboard", "customers", "leads", "estimates", "scheduling", "inventory", "documents", "messages", "settings"],
                granularPermissions: profileData.granularPermissions || fullAccessGranular(profileData.permissions || ["dashboard", "customers", "leads", "estimates", "scheduling", "inventory", "documents", "messages", "settings"]),
                isEmployee: false,
                name: profileData.name || "Owner",
                goals: ""
              });
              setIsLoggedIn(false);
              setCurrentView("placeholder_password");
            }
          } else {
            setLoggedInUser({
              email: user.email || "",
              role: "Owner",
              permissions: ["dashboard", "customers", "leads", "estimates", "scheduling", "inventory", "documents", "messages", "settings"],
              granularPermissions: fullAccessGranular(["dashboard", "customers", "leads", "estimates", "scheduling", "inventory", "documents", "messages", "settings"]),
              isEmployee: false,
              name: user.displayName || "Owner",
              goals: ""
            });
            setIsLoggedIn(false);
            setCurrentView("placeholder_password");
          }
        } catch (err) {
          console.error("Error reading user profile:", err);
        } finally {
          isTimeClockLoadedRef.current = true;
          setAuthReady(true);
        }
      } else {
        setLoggedInUser(null);
        setIsLoggedIn(false);
        isTimeClockLoadedRef.current = false;
        setAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync Time Clock state to Firestore
  useEffect(() => {
    if (!loggedInUser?.email || !isTimeClockLoadedRef.current) return;
    const saveTimeClock = async () => {
      try {
        await setDoc(doc(db, "timeclock_states", loggedInUser.email), {
          isClockedIn,
          clockInTime,
          clockInDuration,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.error("Failed to save time clock state:", err);
      }
    };
    saveTimeClock();
  }, [isClockedIn, clockInTime, loggedInUser]);

  const takeSnapshot = (pageId: string, pageName: string, metaData?: any) => {
    pendingSnapshotRef.current = { pageId, pageName, metaData };
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    } else {
      createAndAddSnapshot(pageId, pageName, metaData);
    }
  };

  const handleCameraCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      // Fallback if no file was selected or camera was closed
      if (pendingSnapshotRef.current) {
        const { pageId, pageName, metaData } = pendingSnapshotRef.current;
        createAndAddSnapshot(pageId, pageName, metaData);
        pendingSnapshotRef.current = null;
      }
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      if (pendingSnapshotRef.current) {
        const { pageId, pageName, metaData } = pendingSnapshotRef.current;
        createAndAddSnapshot(pageId, pageName, metaData, dataUrl);
        pendingSnapshotRef.current = null;
      }
    };
    reader.readAsDataURL(file);

    // Reset input value so same file can be captured again
    event.target.value = "";
  };

  const deleteSnapshot = (id: string) => {
    setSnapshots(prev => prev.filter(s => s.id !== id));
    triggerNotification("Snapshot deleted from folder index");
  };

  function logOperationalEvent(type: string, desc: string, icon: string = "🤖") {
    triggerNotification(`${icon} ${type}: ${desc}`);
    const newAct = {
      id: "act_sec_" + Math.random().toString(36).substring(2, 9),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      module: type,
      action: desc,
      reason: "Security tracking log",
      status: "Completed" as const,
      approvedBy: loggedInUser?.name || "System"
    };
    setRecentAiActions(prev => [newAct, ...prev]);
  }

  // AI PAGE ANALYSIS STATE & DIALOG ENGINE
  const [isAIAnalysisOpen, setIsAIAnalysisOpen] = useState(false);
  const [aiPageId, setAiPageId] = useState("");
  const [aiPageName, setAiPageName] = useState("");
  const [aiCustomContext, setAiCustomContext] = useState("");
  const [aiMessages, setAiMessages] = useState<Array<{ sender: "user" | "ai"; text: string }>>([]);
  const [aiInputMessage, setAiInputMessage] = useState("");
  const [aiIsLoading, setAiIsLoading] = useState(false);
  const [pendingAiAction, setPendingAiAction] = useState<{ type: "drawer" | "floating"; query: string; customText?: string } | null>(null);

  // Grounded, confirmation-gated data actions for the floating AI widget. Unlike the old
  // fake "autonomous actions" (which fabricated PO numbers/vendors and mutated data from
  // keyword matching with zero confirmation), these are computed from real live data and
  // require an explicit approval click before anything is written.
  type PendingDataAction =
    | { type: "reorder"; item: InventoryItem; suggestedQty: number }
    | { type: "reschedule"; event: SchedulingEvent; newDate: string };
  const [pendingDataAction, setPendingDataAction] = useState<PendingDataAction | null>(null);

  const proposeReorderAction = () => {
    const lowStock = inventoryList.filter(i => i.quantity <= i.minQuantity);
    if (lowStock.length === 0) {
      setFloatingAiMessages(prev => [...prev, { sender: "ai", text: "No inventory items are currently at or below their minimum stock threshold — nothing needs reordering right now." }]);
      return;
    }
    const item = lowStock[0];
    const suggestedQty = Math.max(item.maxQuantity - item.quantity, 1);
    setPendingDataAction({ type: "reorder", item, suggestedQty });
  };

  const proposeRescheduleAction = () => {
    const upcoming = schedulingEvents
      .filter(e => e.status === "Scheduled")
      .sort((a, b) => a.date.localeCompare(b.date));
    if (upcoming.length === 0) {
      setFloatingAiMessages(prev => [...prev, { sender: "ai", text: "There are no scheduled jobs to reschedule." }]);
      return;
    }
    const event = upcoming[0];
    const [y, m, d] = event.date.split("-").map(Number);
    const next = new Date(y, (m || 1) - 1, (d || 1) + 1);
    const newDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    setPendingDataAction({ type: "reschedule", event, newDate });
  };

  const confirmPendingDataAction = () => {
    if (!pendingDataAction) return;
    if (pendingDataAction.type === "reorder") {
      const { item, suggestedQty } = pendingDataAction;
      logOperationalEvent(
        "Reorder Flagged",
        `${item.name}: ${item.quantity} on hand (min ${item.minQuantity}). Flagged for reorder of ${suggestedQty} units${item.vendor ? ` from ${item.vendor}` : " (no vendor on file)"}.`,
        "📦"
      );
      triggerNotification(`Reorder flagged for ${item.name} (${suggestedQty} units)`);
    } else {
      const { event, newDate } = pendingDataAction;
      setSchedulingEvents(prev => prev.map(e => (e.id === event.id ? { ...e, date: newDate } : e)));
      logOperationalEvent("Job Rescheduled", `Moved ${event.customer}'s job from ${event.date} to ${newDate}.`, "📅");
      triggerNotification(`Moved ${event.customer}'s job to ${newDate}`);
    }
    setFloatingAiMessages(prev => [...prev, { sender: "ai", text: "✅ Done — approved and applied." }]);
    setPendingDataAction(null);
  };

  const openPageAIAnalysis = (pageId: string, pageName: string, customContext?: string) => {
    setAiPageId(pageId);
    setAiPageName(pageName);
    const resolvedContext = customContext || "";
    setAiCustomContext(resolvedContext);
    setIsAIAnalysisOpen(true);
    setAiIsLoading(true);

    const isOwnerOrAdmin = (simulatedRole || loggedInUser?.role || "Owner") === "Owner" || (simulatedRole || loggedInUser?.role || "Owner") === "Admin";
    const businessSummary = buildBusinessSummary(pageId);

    fetch("/api/ai/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId, pageName, customContext: resolvedContext, businessSummary, isOwnerOrAdmin })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "AI request failed");
        setAiMessages([{ sender: "ai", text: data.text }]);
      })
      .catch((err) => {
        setAiMessages([{
          sender: "ai",
          text: `⚠️ AI request failed: ${err instanceof Error ? err.message : "Unknown error"}. Make sure GEMINI_API_KEY is configured on the server.`
        }]);
      })
      .finally(() => setAiIsLoading(false));
  };

  // Builds a real (not fabricated) summary of live business data for the AI prompt, scoped to the page being analyzed.
  const buildBusinessSummary = (pageId: string): string => {
    const pastDue = customers.filter(c => c.status === "Past Due");
    const totalPastDue = pastDue.reduce((sum, c) => sum + (c.outstandingBalance || 0), 0);
    const topCustomer = [...customers].sort((a, b) => (b.lifetimeValue || 0) - (a.lifetimeValue || 0))[0];

    switch (pageId) {
      case "dashboard":
        return [
          `Customers: ${customers.length} total, ${pastDue.length} past due ($${totalPastDue.toLocaleString()} outstanding)`,
          `Leads: ${leads.length} total, ${leads.filter(l => l.status === "New").length} new`,
          `Estimates: ${estimates.length} total, ${estimates.filter(e => e.status === "Sent" || e.status === "Viewed").length} awaiting response`,
          `Scheduled jobs: ${schedulingEvents.filter(e => e.status === "Scheduled").length} upcoming, ${schedulingEvents.filter(e => e.status === "Completed").length} completed`,
          `Revenue recognized from completed jobs: $${completedJobsRevenue.toLocaleString()}`
        ].join("\n");
      case "customers":
        return [
          `Total customers: ${customers.length}`,
          `Past due: ${pastDue.length} accounts, $${totalPastDue.toLocaleString()} total outstanding`,
          `VIP customers: ${customers.filter(c => c.isVIP).length}`,
          topCustomer ? `Highest lifetime value: ${topCustomer.company} at $${(topCustomer.lifetimeValue || 0).toLocaleString()}` : ""
        ].filter(Boolean).join("\n");
      case "leads":
        return [
          `Total leads: ${leads.length}`,
          `By status: ${Object.entries(leads.reduce((acc: Record<string, number>, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {})).map(([s, c]) => `${s}: ${c}`).join(", ")}`,
          `Total pipeline value: $${leads.reduce((sum, l) => sum + (l.estimatedValue || 0), 0).toLocaleString()}`
        ].join("\n");
      case "estimates":
        return [
          `Total estimates: ${estimates.length}`,
          `By status: ${Object.entries(estimates.reduce((acc: Record<string, number>, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc; }, {})).map(([s, c]) => `${s}: ${c}`).join(", ")}`,
          `Total estimate value: $${estimates.reduce((sum, e) => sum + (e.amount || 0), 0).toLocaleString()}`
        ].join("\n");
      case "inventory":
        return [
          `Total inventory items: ${inventoryList.length}`,
          `Low stock (below minimum): ${inventoryList.filter(i => i.quantity <= i.minQuantity).length}`
        ].join("\n");
      default:
        return `${customers.length} customers, ${leads.length} leads, ${estimates.length} estimates, ${schedulingEvents.length} scheduled events on record.`;
    }
  };

  const executeConfirmedAIMessage = (query: string) => {
    setAiIsLoading(true);
    const isOwnerOrAdmin = (simulatedRole || loggedInUser?.role || "Owner") === "Owner" || (simulatedRole || loggedInUser?.role || "Owner") === "Admin";
    const conversation = aiMessages.map(m => ({ role: (m.sender === "user" ? "user" : "model") as "user" | "model", text: m.text }));

    fetch("/api/ai/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageId: aiPageId,
        pageName: aiPageName,
        businessSummary: buildBusinessSummary(aiPageId),
        isOwnerOrAdmin,
        conversation,
        query
      })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "AI request failed");
        setAiMessages(prev => [...prev, { sender: "ai", text: data.text }]);
      })
      .catch((err) => {
        setAiMessages(prev => [...prev, {
          sender: "ai",
          text: `⚠️ AI request failed: ${err instanceof Error ? err.message : "Unknown error"}.`
        }]);
      })
      .finally(() => setAiIsLoading(false));
  };

  const handleSendAIMessage = () => {
    if (!aiInputMessage.trim()) return;

    const userMsgText = aiInputMessage;
    setAiMessages(prev => [...prev, { sender: "user", text: userMsgText }]);
    setAiInputMessage("");

    const lower = userMsgText.toLowerCase();
    const isFinancialQuery = lower.includes("past due") || lower.includes("balance") || lower.includes("unpaid") || lower.includes("debt") || lower.includes("highest") || lower.includes("top") || lower.includes("best") || lower.includes("profit") || lower.includes("revenue") || lower.includes("expense") || lower.includes("billing") || lower.includes("ltv") || lower.includes("lifetime") || lower.includes("financial") || lower.includes("invoice");

    const isOwnerOrAdmin = (simulatedRole || loggedInUser?.role || "Owner") === "Owner" || (simulatedRole || loggedInUser?.role || "Owner") === "Admin";

    if (isFinancialQuery) {
      if (!isOwnerOrAdmin) {
        setAiIsLoading(true);
        setTimeout(() => {
          let blockedText = "";
          if (lower.includes("past due") || lower.includes("balance") || lower.includes("unpaid") || lower.includes("debt") || lower.includes("invoice")) {
            blockedText = "🚫 **Access Denied (Role Check Failed)**: You are simulating or logged in with a lower-permission role. Access to sensitive unpaid balances, customer debt records, or billing sheets is strictly restricted to Owner or Admin roles.";
          } else {
            const topCustomer = customers.length > 0 ? [...customers].sort((a, b) => b.lifetimeValue - a.lifetimeValue)[0] : null;
            const topLead = leads.length > 0 ? [...leads].sort((a, b) => b.estimatedValue - a.estimatedValue)[0] : null;
            if (aiPageId === "customers") {
              blockedText = topCustomer
                ? `Your highest value client is **${topCustomer.contact}** representing **${topCustomer.company}** with a Lifetime Value of **[REDACTED - OWNER ONLY]**. They have ${topCustomer.openJobs} open jobs currently.`
                : "No customers on record yet.";
            } else if (aiPageId === "leads") {
              blockedText = topLead
                ? `The highest value lead is **${topLead.name}** representing **${topLead.source}** source with an estimated contract value of **[REDACTED - OWNER ONLY]**, currently marked in '${topLead.status}' status.`
                : "No leads on record yet.";
            } else if (topCustomer) {
              const sourceCounts: Record<string, number> = {};
              leads.forEach((l) => { sourceCounts[l.source] = (sourceCounts[l.source] || 0) + 1; });
              const topSourceEntry = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0];
              blockedText = `Based on our operational ledger, **${topCustomer.contact} (${topCustomer.company})** is the top customer (**[REDACTED - OWNER ONLY]** LTV)${topSourceEntry ? `, and your most consistent acquisition source is ${topSourceEntry[0]}` : ""}.`;
            } else {
              blockedText = "No customer or lead data on record yet.";
            }
          }
          setAiMessages(prev => [...prev, { sender: "ai", text: blockedText }]);
          setAiIsLoading(false);
        }, 600);
        return;
      }

      setPendingAiAction({
        type: "drawer",
        query: userMsgText
      });
      return;
    }

    executeConfirmedAIMessage(userMsgText);
  };

  const executeConfirmedFloatingAiMessage = (query: string, _customText?: string) => {
    setFloatingAiLoading(true);
    const isOwnerOrAdmin = (simulatedRole || loggedInUser?.role || "Owner") === "Owner" || (simulatedRole || loggedInUser?.role || "Owner") === "Admin";
    const conversation = floatingAiMessages.map(m => ({ role: (m.sender === "user" ? "user" : "model") as "user" | "model", text: m.text }));

    fetch("/api/ai/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageId: activeScreen.id,
        pageName: activeScreen.label,
        businessSummary: buildBusinessSummary(activeScreen.id),
        isOwnerOrAdmin,
        conversation,
        query
      })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "AI request failed");
        setFloatingAiMessages(prev => [...prev, { sender: "ai", text: data.text }]);
      })
      .catch((err) => {
        setFloatingAiMessages(prev => [...prev, {
          sender: "ai",
          text: `⚠️ AI request failed: ${err instanceof Error ? err.message : "Unknown error"}.`
        }]);
      })
      .finally(() => setFloatingAiLoading(false));
  };

  const handleSendFloatingAiMessage = (customText?: string) => {
    const textToSend = customText || floatingAiInput;
    if (!textToSend.trim()) return;

    setFloatingAiMessages(prev => [...prev, { sender: "user", text: textToSend }]);
    setFloatingAiInput("");

    const lowerText = textToSend.toLowerCase();
    const isFinancialQuery = lowerText.includes("past due") || lowerText.includes("balance") || lowerText.includes("unpaid") || lowerText.includes("debt") || lowerText.includes("highest") || lowerText.includes("top") || lowerText.includes("best") || lowerText.includes("profit") || lowerText.includes("revenue") || lowerText.includes("expense") || lowerText.includes("billing") || lowerText.includes("ltv") || lowerText.includes("lifetime") || lowerText.includes("financial") || lowerText.includes("invoice");

    const isOwnerOrAdmin = (simulatedRole || loggedInUser?.role || "Owner") === "Owner" || (simulatedRole || loggedInUser?.role || "Owner") === "Admin";

    if (isFinancialQuery) {
      if (!isOwnerOrAdmin) {
        setFloatingAiLoading(true);
        setTimeout(() => {
          let blockedText = "";
          if (lowerText.includes("why did profit drop") || lowerText.includes("past due") || lowerText.includes("balance") || lowerText.includes("unpaid") || lowerText.includes("debt") || lowerText.includes("invoice")) {
            blockedText = "🚫 **Access Denied (Role Check Failed)**: You are simulating or logged in with a lower-permission role. Access to sensitive unpaid balances, customer debt records, or billing sheets is strictly restricted to Owner or Admin roles.";
          } else {
            blockedText = `### 🤖 Owner's AI Solution
Processed context query for **${activeScreen.label} Page**:
- **User Role**: ${simulatedRole || loggedInUser?.role || "Owner"}
- **Lifetime Value**: **[REDACTED - OWNER ONLY]**
- **Outstanding Balance**: **[REDACTED - OWNER ONLY]**

Access to full financial telemetry is restricted.`;
          }
          setFloatingAiMessages(prev => [...prev, { sender: "ai", text: blockedText }]);
          setFloatingAiLoading(false);
        }, 600);
        return;
      }

      setPendingAiAction({
        type: "floating",
        query: textToSend,
        customText: customText
      });
      return;
    }

    // Grounded, confirmation-gated actions: these PROPOSE a real change computed from live
    // data and require an explicit Approve click (see pendingDataAction) before anything is
    // written — no data mutation happens directly from parsing this text.
    if (lowerText.includes("order more") && activeScreen.id === "inventory") {
      proposeReorderAction();
      return;
    }
    if (lowerText.includes("move") && lowerText.includes("tomorrow") && activeScreen.id === "scheduling") {
      proposeRescheduleAction();
      return;
    }

    executeConfirmedFloatingAiMessage(textToSend);
  };

  // TEAM BUILDER STATE - Owner always gets every module at full access;
  // every other starter role gets an independent per-module level, not one
  // tier applied blanket -- managers default to Create & Edit on their
  // department's modules, base employees default to View except on the
  // handful of modules their job actually requires editing.
  const [selectedRoles, setSelectedRoles] = useState<SelectedRole[]>([
    {
      id: "owner",
      name: "Owner",
      count: 1,
      description: "Full access to every module",
      permissions: MODULE_CATALOG.map(m => m.id),
      modulePermissions: fullAccessGranular(MODULE_CATALOG.map(m => m.id))
    },
    {
      id: "office_manager",
      name: "Office Manager",
      count: 1,
      description: "Manager tier -- Create & Edit across office operations",
      permissions: ["customers", "leads", "estimates", "invoices", "scheduling", "documents", "pdf_editor", "esign", "messages", "reports", "settings"],
      modulePermissions: defaultGranularFromModuleList(
        ["customers", "leads", "estimates", "invoices", "scheduling", "documents", "pdf_editor", "esign", "messages", "reports", "settings"],
        "edit"
      )
    },
    {
      id: "dispatcher",
      name: "Dispatcher",
      count: 1,
      description: "Dispatch, Routes, Scheduling, Jobs",
      permissions: ["dispatch", "routes", "scheduling", "jobs", "customers"],
      modulePermissions: {
        dispatch: "edit",
        routes: "edit",
        scheduling: "edit",
        jobs: "edit",
        customers: "view"
      }
    },
    {
      id: "field_technician",
      name: "Field Technician",
      count: 1,
      description: "Jobs, Inventory, Documents, PDF Editor, eSign",
      permissions: ["jobs", "customers", "inventory", "documents", "pdf_editor", "esign", "routes", "scheduling"],
      modulePermissions: {
        jobs: "edit",
        customers: "view",
        inventory: "edit",
        documents: "edit",
        pdf_editor: "edit",
        esign: "edit",
        routes: "view",
        scheduling: "view"
      }
    },
    {
      id: "sales_representative",
      name: "Sales Representative",
      count: 1,
      description: "Leads, Customers, Estimates",
      permissions: ["leads", "customers", "estimates", "messages", "ai_assistant"],
      modulePermissions: {
        leads: "edit",
        customers: "view",
        estimates: "edit",
        messages: "view",
        ai_assistant: "view"
      }
    },
    {
      id: "estimator",
      name: "Estimator",
      count: 1,
      description: "Leads, Estimates, Documents, PDF Editor, eSign",
      permissions: ["leads", "customers", "estimates", "documents", "pdf_editor", "esign"],
      modulePermissions: {
        leads: "edit",
        customers: "view",
        estimates: "edit",
        documents: "edit",
        pdf_editor: "edit",
        esign: "edit"
      }
    }
  ]);
  
  // Custom dialogs & UI states for team setup
  const [customizingRole, setCustomizingRole] = useState<SelectedRole | null>(null);
  const [showRoleInfoPopup, setShowRoleInfoPopup] = useState<string | null>(null);
  const [showCustomRoleModal, setShowCustomRoleModal] = useState(false);
  const [customRoleName, setCustomRoleName] = useState("");
  const [roleIdPendingDelete, setRoleIdPendingDelete] = useState<string | null>(null);
  
  // Generated invites state for modal
  const [generatedInvites, setGeneratedInvites] = useState<Array<{ code: string; role: string; permissions: string[]; granularPermissions?: GranularPermissions }>>([]);
  const [showInvitesModal, setShowInvitesModal] = useState(false);

  useEffect(() => {
    refSecurityLogged.current = {};
  }, [loggedInUser, simulatedRole]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const activeRole = simulatedRole || loggedInUser?.role || "Owner";
    if (activeRole === "Technician" && (activeScreen.id === "owner_console" || activeScreen.id === "revenue")) {
      if (!refSecurityLogged.current[activeScreen.id]) {
        refSecurityLogged.current[activeScreen.id] = true;
        logOperationalEvent("Security Violation", `Blocked unauthorized attempt to access page: ${activeScreen.label}`, "🚨");
      }
    }
  }, [activeScreen, isLoggedIn, loggedInUser, simulatedRole]);

  useEffect(() => {
    if (!loggedInUser) return;
    const isDemoUser = loggedInUser.email === "admin@ownerslocal.com" || loggedInUser.email === "sec_manager@ownerslocal.com";
    if (!isDemoUser) {
      // Clear all Ironclad Plumbing & HVAC demo data for a fresh start
      setCustomers([]);
      setDashboardLeads([]);
      setRecentRoster([]);
      setDocuments([]);
      setSchedulingEvents([]);
      
      // Load any existing profile settings if they exist in firestore
      const loadBizProfile = async () => {
        try {
          const bizSnap = await getDoc(doc(db, "business_profiles", loggedInUser.email));
          if (bizSnap.exists()) {
            const bizData = bizSnap.data();
            if (bizData.businessNames) setBusinessNames(bizData.businessNames);
            if (bizData.ownerNames) setOwnerNames(bizData.ownerNames);
            if (bizData.businessPhones) setBusinessPhones(bizData.businessPhones);
            if (bizData.businessAddresses) setBusinessAddresses(bizData.businessAddresses);
            if (bizData.businessLogos) setBusinessLogos(bizData.businessLogos);
            if (bizData.companyLocations) setCompanyLocations(bizData.companyLocations);
            if (bizData.billingMethods) setBillingMethods(bizData.billingMethods);
            if (bizData.selectedBillingMethodId) setSelectedBillingMethodId(bizData.selectedBillingMethodId);
          } else {
            // For brand-new accounts, start completely blank
            setBusinessNames([]);
            setOwnerNames([]);
            setBusinessPhones([]);
            setBusinessAddresses([]);
            setBusinessLogos([]);
            setCompanyLocations([]);
            setBillingMethods([]);
            setSelectedBillingMethodId("");
          }
        } catch (err) {
          console.error("Error loading non-demo business profile:", err);
        }
      };
      
      if (!loggedInUser.isEmployee) {
        loadBizProfile();
      }
    }
  }, [loggedInUser]);

  // Employee Onboarding form states
  const [empInviteCode, setEmpInviteCode] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empPassword, setEmpPassword] = useState("");
  const [empFirstName, setEmpFirstName] = useState("");
  const [empLastName, setEmpLastName] = useState("");
  const [empAddress, setEmpAddress] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empPhoto, setEmpPhoto] = useState("");
  const [empGoals, setEmpGoals] = useState("");
  const [empHourlyRate, setEmpHourlyRate] = useState("");

  // Trigger brief floating notifications
  const triggerNotification = (message: string) => {
    setShowNotification(message);
    setTimeout(() => {
      setShowNotification(null);
    }, 4000);
  };

  const openPlaceholderPage = (label: string, icon: string) => {
    setActiveScreen({
      id: "placeholder_screen",
      label: label,
      icon: icon,
      url: ""
    });
    triggerNotification(`Navigated to Placeholder for: ${label}`);
  };

  // Canonical cross-page navigation: every page-to-page link (map pin, table
  // row, dropdown, card) should route through this so "many roads lead to the
  // same record" behaves identically everywhere, instead of each page call
  // site redefining its own copy of this logic.
  const navigateToScreen = (screenId: string, params?: { customerId?: string; date?: string }) => {
    setPreSelectedCustomerId(params?.customerId ?? undefined);
    setPreSelectedDate(params?.date ?? undefined);
    const matched = OS_SCREENS.find(s => s.id === screenId);
    if (matched) {
      setActiveScreen(matched);
    }
  };

  const handleOwnerSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = signUpInstructionsEmail.trim().toLowerCase();
    const cleanUser = signUpInstructionsBusinessName.trim();
    const cleanOwner = signUpInstructionsOwnerName.trim();
    const cleanPass = signUpInstructionsPassword.trim();

    if (!cleanUser || !cleanOwner || !cleanEmail || !cleanPass) {
      setSignUpInstructionsError("All fields are required.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setSignUpInstructionsError("Please enter a valid email address.");
      return;
    }

    if (cleanPass.length < 6) {
      setSignUpInstructionsError("Password must be at least 6 characters.");
      return;
    }

    setSignUpInstructionsError("");
    setIsSignUpSubmitting(true);

    try {
      // 1. Create real authentication user
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
      const user = userCredential.user;

      // 2. Create owner user profile document
      const ownerPermissions = ["dashboard", "customers", "leads", "estimates", "scheduling", "dispatch", "routes", "jobs", "timeclock", "inventory", "documents", "messages", "training", "ai_assistant", "settings", "integrations", "roster"];
      const userProfile = {
        uid: user.uid,
        email: cleanEmail,
        role: "Owner",
        permissions: ownerPermissions,
        granularPermissions: fullAccessGranular(ownerPermissions),
        name: cleanOwner,
        isEmployee: false,
        businessEmail: cleanEmail,
        isOnboarded: false,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, "user_profiles", user.uid), userProfile);

      // 3. Create owner business profile document in Firestore
      await setDoc(doc(db, "business_profiles", cleanEmail), {
        businessNames: [cleanUser],
        ownerNames: [cleanOwner],
        businessPhones: [""],
        businessAddresses: [""],
        businessLogos: ["https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=120&auto=format&fit=crop&q=60"],
        companyLocations: [""],
        billingMethods: [],
        selectedBillingMethodId: "",
        updatedAt: new Date().toISOString()
      });

      // Update relevant states for consistency
      setEmail(cleanEmail);
      setPassword(cleanPass);
      setBusinessNames([cleanUser]);
      setOwnerNames([cleanOwner]);

      setLoggedInUser({
        email: cleanEmail,
        role: "Owner",
        permissions: userProfile.permissions,
        granularPermissions: userProfile.granularPermissions,
        isEmployee: false,
        name: cleanOwner,
        goals: ""
      });

      // Directly show Step 1 of Onboarding!
      setCurrentView("placeholder_password");
      setShowSignUpInstructions(false);
      triggerNotification(`Welcome, Owner of ${cleanUser}! Please complete onboarding.`);
    } catch (err: any) {
      console.error("Error signing up:", err);
      let errMsg = err.message || "Unknown error";
      if (err.code === "auth/email-already-in-use") {
        errMsg = "This email address is already registered.";
      }
      setSignUpInstructionsError("Sign up failed: " + errMsg);
    } finally {
      setIsSignUpSubmitting(false);
    }
  };

  // Real Firebase Auth Password sign-in
  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (rememberMe) {
      localStorage.setItem("rememberMe", "true");
      localStorage.setItem("rememberedEmail", email);
      localStorage.setItem("rememberedPassword", password);
    } else {
      localStorage.removeItem("rememberMe");
      localStorage.removeItem("rememberedEmail");
      localStorage.removeItem("rememberedPassword");
    }

    // 1. Business Email must be a valid email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setLoginError("Please enter a valid business email address.");
      triggerNotification("Invalid email format.");
      return;
    }

    // 2. Password cannot be empty
    if (!cleanPass) {
      setLoginError("Password cannot be empty.");
      triggerNotification("Password cannot be empty.");
      return;
    }

    setLoginError(null);
    setIsSubmitting(true);
    setLoginMethod("password");
    
    try {
      // Authenticate with real Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
      const user = userCredential.user;

      // Fetch user profile from user_profiles to load their role and permissions
      const profileSnap = await getDoc(doc(db, "user_profiles", user.uid));
      if (profileSnap.exists()) {
        const profileData = profileSnap.data();
        const isEmployeeAcct = profileData.isEmployee ?? false;
        const resolvedPerms = profileData.permissions || ["dashboard", "customers", "leads", "estimates", "scheduling", "inventory", "documents", "messages", "settings"];
        setLoggedInUser({
          email: user.email || "",
          role: profileData.role || "Owner",
          permissions: resolvedPerms,
          granularPermissions: profileData.granularPermissions || (isEmployeeAcct ? defaultGranularFromModuleList(resolvedPerms, "edit") : fullAccessGranular(resolvedPerms)),
          isEmployee: isEmployeeAcct,
          name: profileData.name || user.displayName || "Owner",
          goals: profileData.goals || "",
          businessEmail: isEmployeeAcct ? profileData.businessEmail : (user.email || "")
        });
        setIsLoggedIn(true);

        const isEmployee = profileData.isEmployee ?? false;
        if (isEmployee) {
          const firstPermitted = OS_SCREENS.find(s => (profileData.permissions || []).includes(s.id)) || OS_SCREENS[0];
          setActiveScreen(firstPermitted);
          triggerNotification(`Signed in as employee: ${profileData.name || "User"} (${profileData.role})`);
        } else {
          setActiveScreen(OS_SCREENS[0]);
          triggerNotification(`Signed in as Owner`);
        }
      } else {
        const fallbackPerms = ["dashboard", "customers", "leads", "estimates", "scheduling", "inventory", "documents", "messages", "settings"];
        setLoggedInUser({
          email: user.email || "",
          role: "Owner",
          permissions: fallbackPerms,
          granularPermissions: fullAccessGranular(fallbackPerms),
          isEmployee: false,
          name: user.displayName || "Owner",
          goals: ""
        });
        setIsLoggedIn(true);
        setActiveScreen(OS_SCREENS[0]);
        triggerNotification(`Signed in successfully.`);
      }
    } catch (err: any) {
      console.error("Error signing in with Firebase Auth:", err);
      let errMsg = "Incorrect password or email. Please try again.";
      if (err.code === "auth/user-not-found") {
        errMsg = "User account not found. Please sign up.";
      } else if (err.code === "auth/wrong-password") {
        errMsg = "Incorrect password. Please try again.";
      } else if (err.code === "auth/invalid-credential") {
        errMsg = "Invalid login credentials. Please check your email and password.";
      }
      setLoginError(errMsg);
      triggerNotification("Sign-in failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPasswordSubmit = async () => {
    if (!forgotEmail) {
      triggerNotification("Please provide an email.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, forgotEmail.trim());
      setForgotSubmitted(true);
      triggerNotification("Password recovery email transmitted successfully!");
    } catch (err: any) {
      console.error("Password reset failed:", err);
      triggerNotification("Reset failed: " + (err.message || "Unknown error"));
    }
  };

  // Real Firestore check for Employee Invite code
  const handleInviteSignIn = async () => {
    const codeTrim = inviteCode.trim().toUpperCase();

    if (!codeTrim) {
      triggerNotification("Please enter an employee invite code.");
      return;
    }
    
    setIsSubmitting(true);
    setLoginMethod("invite");
    
    try {
      const inviteSnap = await getDoc(doc(db, "employee_invites", codeTrim));
      if (inviteSnap.exists()) {
        const inviteData = inviteSnap.data();
        if (inviteData.status === "completed") {
          triggerNotification("This code is already registered. Sign in with email above.");
          setIsSubmitting(false);
          return;
        }
        
        // Start Employee Onboarding Step 1 of 1
        setEmpInviteCode(codeTrim);
        setEmpEmail("");
        setEmpPassword("");
        setEmpFirstName("");
        setEmpLastName("");
        setEmpAddress("");
        setEmpPhone("");
        setEmpGoals("");
        setCurrentView("employee_onboarding");
        triggerNotification(`Invite verified for: ${inviteData.role}! Complete setup.`);
      } else {
        triggerNotification("Invite code not found in database. Please ask your owner or manager for a valid code.");
      }
    } catch (err) {
      console.error("Error verifying invite:", err);
      triggerNotification("Couldn't verify the invite code right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Real Google OAuth via Firebase Auth. This used to be a fake account
  // picker with 3 hardcoded emails that logged the user in as whichever
  // identity was clicked, with zero verification — a full authentication
  // bypass. signInWithPopup performs a real Google sign-in; the existing
  // onAuthStateChanged listener above already loads the resulting user's
  // real profile from user_profiles/{uid}, so no duplicate state-setting
  // logic is needed here.
  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setLoginMethod("google");
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Google sign in error:", err);
      if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
        setLoginError("Google sign-in failed. Please try again.");
        triggerNotification("Google sign-in failed.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Back to Login routine
  const handleBackToLogin = () => {
    setCurrentView("login");
  };

  // Logout routine
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsLoggedIn(false);
      setCurrentView("login");
      setLoginMethod(null);
      setPassword("••••••••••••••••");
      triggerNotification("Logged out of OwnersLOCAL.");
    } catch (err) {
      console.error("Logout error:", err);
      // Fallback
      setIsLoggedIn(false);
      setCurrentView("login");
      setLoginMethod(null);
      setPassword("••••••••••••••••");
    }
  };

  // Load business profile from Firestore on mount or when view transitions to onboarding
  useEffect(() => {
    const loadProfile = async () => {
      if (!email) return;
      try {
        const docRef = doc(db, "business_profiles", email);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.ownerNames) setOwnerNames(data.ownerNames);
          if (data.ownerPhones) setOwnerPhones(data.ownerPhones);
          if (data.businessNames) setBusinessNames(data.businessNames);
          if (data.businessPhones) setBusinessPhones(data.businessPhones);
          if (data.businessAddresses) setBusinessAddresses(data.businessAddresses);
          if (data.businessLogos) setBusinessLogos(data.businessLogos);
          if (data.companyLocations) setCompanyLocations(data.companyLocations);
          if (data.billingMethods) setBillingMethods(data.billingMethods);
          if (data.selectedBillingMethodId) setSelectedBillingMethodId(data.selectedBillingMethodId);
          if (Array.isArray(data.selectedRoles) && data.selectedRoles.length) setSelectedRoles(data.selectedRoles);
          triggerNotification("Synced business profile from cloud database!");
        }
      } catch (err) {
        console.error("Error loading profile from Firestore:", err);
      }
    };

    if (currentView === "placeholder_google" || currentView === "placeholder_password" || currentView === "placeholder_invite") {
      loadProfile();
    }
  }, [currentView, email]);

  const saveProfileToFirestore = async () => {
    if (!email) return;
    try {
      const docRef = doc(db, "business_profiles", email);
      await setDoc(docRef, {
        ownerNames,
        ownerPhones,
        businessNames,
        businessPhones,
        businessAddresses,
        businessLogos,
        companyLocations,
        billingMethods,
        selectedBillingMethodId,
        selectedRoles,
        updatedAt: new Date().toISOString()
      });
      triggerNotification("Saved to cloud Firestore successfully!");
    } catch (err) {
      console.error("Error saving profile to Firestore:", err);
      triggerNotification("Cloud save failed. Please check connection.");
    }
  };

  // Increment/Decrement role count
  const handleIncrementRoleCount = (roleId: string) => {
    setSelectedRoles(prev => prev.map(r => r.id === roleId ? { ...r, count: r.count + 1 } : r));
  };

  const handleDecrementRoleCount = (roleId: string) => {
    setSelectedRoles(prev => {
      return prev.map(r => {
        if (r.id === roleId) {
          const newCount = r.count - 1;
          return { ...r, count: Math.max(0, newCount) };
        }
        return r;
      });
    });
  };

  const handleRemoveRole = (roleId: string) => {
    if (roleId === "owner") {
      triggerNotification("Cannot remove the Owner role.");
      return;
    }
    setSelectedRoles(prev => prev.filter(r => r.id !== roleId));
    triggerNotification("Role removed successfully.");
  };

  // Add a role from the dropdown selection
  const handleAddRole = (roleId: string) => {
    if (roleId === "__create_custom__") {
      setShowCustomRoleModal(true);
      return;
    }
    const defaultData = DEFAULT_ROLES_DATA[roleId];
    if (!defaultData) return;
    
    // Check if already selected
    const exists = selectedRoles.find(r => r.id === roleId);
    if (exists) {
      handleIncrementRoleCount(roleId);
      triggerNotification(`Increased count for ${defaultData.name}`);
      return;
    }

    const newRole: SelectedRole = {
      id: roleId,
      name: defaultData.name,
      count: 1,
      description: defaultData.description,
      permissions: [...defaultData.permissions],
      modulePermissions: defaultGranularFromModuleList(defaultData.permissions, "edit")
    };
    setSelectedRoles(prev => [...prev, newRole]);
    triggerNotification(`Added role: ${defaultData.name}`);
  };

  // Duplicate an existing role
  const handleDuplicateRole = (role: SelectedRole) => {
    const randomId = "custom_" + Math.random().toString(36).substring(2, 7);
    const newRole: SelectedRole = {
      ...role,
      id: randomId,
      name: `${role.name} Copy`,
      isCustom: true,
      count: 1,
      modulePermissions: JSON.parse(JSON.stringify(role.modulePermissions))
    };
    setSelectedRoles(prev => [...prev, newRole]);
    triggerNotification(`Duplicated ${role.name}`);
  };

  // Create a brand new custom role
  const handleCreateCustomRole = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = customRoleName.trim();
    if (!cleanName) {
      triggerNotification("Please enter a custom role name.");
      return;
    }
    const randomId = "custom_" + Math.random().toString(36).substring(2, 7);
    const newRole: SelectedRole = {
      id: randomId,
      name: cleanName,
      count: 1,
      description: "Custom user defined role",
      isCustom: true,
      permissions: ["dashboard", "messages"],
      modulePermissions: defaultGranularFromModuleList(["dashboard", "messages"], "view")
    };
    setSelectedRoles(prev => [...prev, newRole]);
    setShowCustomRoleModal(false);
    setCustomRoleName("");
    setCustomizingRole(newRole); // Open customize modal immediately for custom roles
    triggerNotification(`Created custom role: ${cleanName}`);
  };

  // Save customized permissions
  const handleSaveCustomPermissions = (updated: SelectedRole) => {
    setSelectedRoles(prev => prev.map(r => r.id === updated.id ? updated : r));
    setCustomizingRole(null);
    triggerNotification(`Updated permissions for ${updated.name}`);
  };

  // Save a real income/expense transaction -- typed manually or scanned via
  // real Gemini vision, always confirmed/edited by the user before saving.
  const handleSaveTransaction = async (t: Omit<Transaction, "id">) => {
    try {
      const newTxn: Transaction = { ...t, id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
      const journalEntry = postTransactionEntry(newTxn);
      if (!businessId) throw new Error("Missing business account");
      // Firestore rejects `undefined` values. Category and createdBy are
      // intentionally optional in the manual-entry form, so omit them from
      // the persisted documents instead of letting an uncategorized expense
      // make the entire batch fail.
      const persistedTxn = Object.fromEntries(
        Object.entries({ ...newTxn, businessId, updatedAt: new Date().toISOString() })
          .filter(([, value]) => value !== undefined)
      );
      const persistedJournalEntry = Object.fromEntries(
        Object.entries({ ...journalEntry, businessId, updatedAt: new Date().toISOString() })
          .filter(([, value]) => value !== undefined)
      );
      const batch = writeBatch(db);
      batch.set(doc(db, "transactions", newTxn.id), persistedTxn);
      batch.set(doc(db, "journal_entries", journalEntry.id), persistedJournalEntry);
      await batch.commit();
      setTransactions(prev => [...prev, newTxn]);
      // Real double-entry posting -- every logged transaction moves the
      // real ledger (Cash + Revenue or Cash + the matching expense
      // account), not just a line in a list. See accountingEngine.ts.
      setJournalEntries(prev => [...prev, journalEntry]);
      setLogTransactionType(null);
      sessionStorage.removeItem("ownerslocal_pending_financial_scan");
      triggerNotification(`${t.type === "income" ? "Income" : "Expense"} logged: $${t.amount.toLocaleString()}`);
    } catch (err) {
      console.error("Error saving transaction:", err);
      triggerNotification("Couldn't save that — check your connection and try again.");
      throw err;
    }
  };

  // Runs payroll for the trailing 14-day pay period: real hours from
  // time_clock_logs x each real employee's real hourlyRate. The
  // calculation is fully automatic and real -- there's no real background
  // cron infrastructure in a client-side app, so a manual click is what
  // starts it, same as any payroll software's "Run Payroll" action.
  const handleRunPayroll = async () => {
    setIsRunningPayroll(true);
    try {
      const newPayrollTransactions: Array<Omit<Transaction, "id">> = [];
      let totalPayroll = 0;
      for (const emp of employees) {
        const hours = computeRecentHours(timeClockLogs.filter(l => l.employeeEmail === emp.email), 14);
        if (hours <= 0 || !emp.hourlyRate) continue;
        const regHours = Math.min(hours, 80); // 40/wk x 2 weeks before OT
        const otHours = Math.max(0, hours - 80);
        const pay = regHours * emp.hourlyRate + otHours * emp.hourlyRate * 1.5;
        if (pay <= 0) continue;
        totalPayroll += pay;
        newPayrollTransactions.push({
          type: "expense",
          source: "payroll",
          amount: Math.round(pay * 100) / 100,
          description: `${emp.firstName} ${emp.lastName}`.trim(),
          category: "Payroll",
          date: new Date().toISOString().split("T")[0],
          createdAt: new Date().toISOString(),
          createdBy: loggedInUser?.email
        });
      }

      if (newPayrollTransactions.length === 0) {
        triggerNotification("No real hours logged in the last 14 days — nothing to run payroll on.");
        return;
      }

      const finalizedPayrollTransactions: Transaction[] = newPayrollTransactions.map((t) => ({ ...t, id: `txn_payroll_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }));
      setTransactions(prev => [...prev, ...finalizedPayrollTransactions]);
      // Real double-entry posting for every payroll transaction -- Debit
      // Payroll Expense, Credit Cash, same as any other logged expense.
      setJournalEntries(prev => [...prev, ...finalizedPayrollTransactions.map(postTransactionEntry)]);
      triggerNotification(`Payroll run: $${totalPayroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} across ${newPayrollTransactions.length} employee${newPayrollTransactions.length === 1 ? "" : "s"}, based on real logged hours.`);
    } catch (err) {
      console.error("Error running payroll:", err);
      triggerNotification("Couldn't run payroll — check your connection and try again.");
    } finally {
      setIsRunningPayroll(false);
    }
  };

  // Launch Local OS: generates invites, saves to db, triggers invites modal
  const handleLaunchOS = async () => {
    if (!email) {
      triggerNotification("Missing your business email — please sign in again.");
      return;
    }
    setIsSubmitting(true);
    try {
      // 1. Save owner business profile
      await saveProfileToFirestore();
      
      // 2. Generate invite codes for all staff
      const generated: Array<{ code: string; role: string; permissions: string[]; granularPermissions: GranularPermissions }> = [];
      for (const r of selectedRoles) {
        // Skip main owner seat (count = 1) since owner is already logged in
        const startIndex = r.id === "owner" ? 1 : 0;
        const granularPermissions = r.id === "owner"
          ? fullAccessGranular(r.permissions)
          // Only keep entries for currently-authorized modules — a module
          // toggled off after being configured shouldn't leave a stale
          // permission entry behind.
          : Object.fromEntries(
              Object.entries(r.modulePermissions).filter(([moduleId]) => r.permissions.includes(moduleId))
            ) as GranularPermissions;
        for (let i = startIndex; i < r.count; i++) {
          const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
          const cleanRolePrefix = r.name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);
          const code = `${cleanRolePrefix}-${randomStr}`;
          generated.push({
            code,
            role: r.name,
            permissions: r.permissions,
            granularPermissions
          });
        }
      }

      // 3. Save codes to Firestore
      for (const inv of generated) {
        await setDoc(doc(db, "employee_invites", inv.code), {
          code: inv.code,
          role: inv.role,
          businessEmail: email,
          permissions: inv.permissions,
          granularPermissions: inv.granularPermissions,
          status: "pending",
          createdAt: new Date().toISOString()
        });
      }
      
      setGeneratedInvites(generated);
      setShowInvitesModal(true);
      triggerNotification("Generated secure team invite codes!");
    } catch (err) {
      console.error("Error launching OS:", err);
      triggerNotification("Couldn't generate invite codes — check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Complete Employee Onboarding Flow
  const handleCompleteEmployeeOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = empEmail.trim();
    if (!cleanEmail || !empPassword || !empFirstName || !empLastName || !empPhone || !empAddress) {
      triggerNotification("Please fill in all required employee fields.");
      return;
    }
    
    setIsSubmitting(true);
    
    // Look up role & permissions from the real invite record. This must
    // succeed and resolve a real businessEmail — falling back to a fake
    // default here would attach a new employee to a business that doesn't
    // exist, or worse, to whichever fake default every failed lookup shares.
    let inviteRole = "Driver";
    let invitePermissions = ["dashboard", "routes", "jobs", "timeclock", "messages"];
    let inviteGranularPermissions: GranularPermissions = defaultGranularFromModuleList(invitePermissions, "view");
    let inviteRequiresClockVerification = false;
    let businessEmail: string | null = null;

    try {
      if (!empInviteCode) {
        triggerNotification("No invite code found. Please start from the invite code screen.");
        setIsSubmitting(false);
        return;
      }
      const inviteSnap = await getDoc(doc(db, "employee_invites", empInviteCode));
      if (!inviteSnap.exists()) {
        triggerNotification("This invite code is no longer valid. Please request a new one.");
        setIsSubmitting(false);
        return;
      }
      const inviteData = inviteSnap.data();
      inviteRole = inviteData.role || inviteRole;
      invitePermissions = inviteData.permissions || invitePermissions;
      inviteGranularPermissions = inviteData.granularPermissions || inviteGranularPermissions;
      inviteRequiresClockVerification = !!inviteData.requireTimeClockVerification;
      businessEmail = inviteData.businessEmail || null;
      if (!businessEmail) {
        triggerNotification("This invite is missing a business account. Please ask your owner for a new invite.");
        setIsSubmitting(false);
        return;
      }
    } catch (lookupErr) {
      console.error("Invite lookup failed:", lookupErr);
      triggerNotification("Couldn't verify your invite code right now. Please try again.");
      setIsSubmitting(false);
      return;
    }

    try {
      // 1. Create real Auth User
      const authResult = await createUserWithEmailAndPassword(auth, cleanEmail, empPassword);
      const user = authResult.user;

      // 2. Initialize user_profile
      await setDoc(doc(db, "user_profiles", user.uid), {
        role: inviteRole,
        permissions: invitePermissions,
        granularPermissions: inviteGranularPermissions,
        isEmployee: true,
        businessEmail,
        requireTimeClockVerification: inviteRequiresClockVerification,
        isOnboarded: true,
        name: `${empFirstName} ${empLastName}`,
        goals: empGoals,
        createdAt: new Date().toISOString()
      });

      // 3. Save detailed employees entry
      const newEmployee = {
        id: cleanEmail,
        userUid: user.uid,
        email: cleanEmail,
        firstName: empFirstName,
        lastName: empLastName,
        address: empAddress,
        phone: empPhone,
        photo: empPhoto || "",
        goals: empGoals,
        hourlyRate: parseFloat(empHourlyRate) || 0,
        role: inviteRole,
        permissions: invitePermissions,
        granularPermissions: inviteGranularPermissions,
        requireTimeClockVerification: inviteRequiresClockVerification,
        businessEmail,
        // Also tagged as businessId (same value) so this collection is
        // queryable through the same convention every other Firestore
        // collection uses (see subscribeToCollection).
        businessId: businessEmail,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, "employees", cleanEmail), newEmployee);

      // 4. Update invite status
      if (empInviteCode && empInviteCode !== "DRIVER-X4F91") {
        await setDoc(doc(db, "employee_invites", empInviteCode), { status: "completed", usedBy: cleanEmail }, { merge: true });
      }

      // 5. Update UI local state
      setLoggedInUser({
        email: cleanEmail,
        role: inviteRole,
        permissions: invitePermissions,
        granularPermissions: inviteGranularPermissions,
        isEmployee: true,
        name: `${empFirstName} ${empLastName}`,
        goals: empGoals,
        businessEmail
      });
      setIsLoggedIn(true);
      
      // Redirect to Employee Training (Coming Soon)
      const trainingScreen = OS_SCREENS.find(s => s.id === "training") || OS_SCREENS[0];
      setActiveScreen(trainingScreen);
      triggerNotification("Employee profile registered! Welcome to Employee Training.");
    } catch (err: any) {
      console.error("Employee onboarding database save failed:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      triggerNotification(`Registration failed: ${errMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDynamicField = (
    label: string, 
    items: string[], 
    setter: React.Dispatch<React.SetStateAction<string[]>>, 
    placeholder: string
  ) => {
    return (
      <DynamicFieldList
        label={label}
        items={items}
        setter={setter}
        placeholder={placeholder}
        scale={scale}
        error={onboardingErrors[label.toLowerCase()]}
      />
    );
  };

  const authContextValue: AuthContextValue = {
    loggedInUser,
    isLoggedIn,
    currentView,
    setCurrentView,
    simulatedRole,
    setSimulatedRole,
    businessId,
    handleLogout
  };

  const domainDataContextValue: DomainDataContextValue = {
    customers,
    setCustomers,
    leads,
    setLeads,
    estimates,
    setEstimates,
    schedulingEvents,
    setSchedulingEvents,
    inventoryList,
    setInventoryList,
    documents,
    setDocuments,
    recentRoster,
    setRecentRoster,
    bulletins,
    setBulletins,
    notifications,
    setNotifications,
    recentAiActions,
    setRecentAiActions,
    snapshots,
    setSnapshots,
    revenueEvents,
    setRevenueEvents,
    completedJobsRevenue,
    employees,
    setEmployees,
    refreshEmployees,
    timeClockLogs,
    setTimeClockLogs,
    refreshTimeClockLogs,
    transactions,
    setTransactions,
    accounts,
    setAccounts,
    journalEntries,
    setJournalEntries,
    invoices,
    setInvoices,
    bills,
    setBills,
    vendors,
    setVendors,
    bankAccounts,
    setBankAccounts,
    recurringTransactions,
    setRecurringTransactions,
    mileageLogs,
    setMileageLogs,
    budgets,
    setBudgets,
    salesTaxRates,
    setSalesTaxRates,
    preSelectedDate,
    setPreSelectedDate,
    preSelectedCustomerId,
    setPreSelectedCustomerId
  };

  const navTelemetryContextValue: NavTelemetryContextValue = {
    activeScreen,
    setActiveScreen,
    navigateToScreen,
    logOperationalEvent,
    takeSnapshot,
    deleteSnapshot,
    openPageAIAnalysis,
    openPlaceholderPage,
    triggerNotification
  };

  return (
    <AuthContext.Provider value={authContextValue}>
    <DomainDataContext.Provider value={domainDataContextValue}>
    <NavTelemetryContext.Provider value={navTelemetryContextValue}>
    <EventEngineEffects />
    <div className={`min-h-screen ${isLoggedIn ? 'bg-[#F5FAFF]' : 'bg-[#edf4fa]'} text-[#342D7E] flex flex-col justify-between font-sans overflow-x-hidden relative select-none`}>
      {!authReady && (
        <div className="fixed inset-0 z-[100] bg-[#edf4fa] flex items-center justify-center">
          <div className="text-[#315C9F] text-xs font-bold uppercase tracking-wider animate-pulse">Restoring secure session…</div>
        </div>
      )}
      {/* Hidden device camera capture input */}
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleCameraCapture}
        accept="image/*"
        capture="environment"
        className="hidden"
        style={{ display: "none" }}
      />
      
      {/* Background ambient light effects */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-cyan-500/10 blur-[150px] rounded-full pointer-events-none" />

      {/* Header section (only shown when logged out to present the gateway metadata) */}
      {!isLoggedIn && (
        <header className="hidden sm:flex w-full max-w-7xl mx-auto px-4 py-3 sm:py-4 flex-col sm:flex-row items-center justify-between gap-3 border-b border-blue-200/50 bg-white/45 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-xs tracking-wider text-[#342D7E]/60">OWNER'S LOCAL OS CLOUD GATEWAY v2.8.4</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-[#342D7E]/75 font-mono bg-blue-100/60 px-2 py-1 rounded">
              PORT: 3000 (SECURE)
            </div>
          </div>
        </header>
      )}

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-0 sm:p-4 md:p-8 z-10 w-full overflow-y-auto">
        
        {/* VIEW 1: INTERACTIVE LOGIN CARD */}
        {!isLoggedIn ? (
          <div className="w-full min-h-[100dvh] sm:min-h-0 flex flex-col items-center justify-center sm:py-6">
            
            {/* Aspect ratio bounding box for the login card */}
            <div 
              id="login-card-container"
              ref={containerRef}
              className="relative w-full sm:max-w-[440px] aspect-[1440/3200] sm:rounded-[44px] rounded-none overflow-hidden sm:shadow-[0_20px_50px_rgba(8,112,184,0.2)] sm:border border-blue-200/20 bg-cover bg-center select-none transition-transform duration-500 ease-out hover:scale-[1.015] focus-within:scale-[1.015]"
              style={{ backgroundImage: `url(${CARD_BG_URL})` }}
            >
              {/* Inner glassmorphic shading overlay */}
              <div className="absolute inset-0 bg-blue-500/[0.02] pointer-events-none" />

              {/* INNER ROUTING VIEW: LOGIN OR PLACEHOLDER */}
              {currentView === "login" ? (
                <>
                  {/* LOGO BANNER - Centered to the inset login-card edges.
                      Keep the complete source image at its native 734:302
                      aspect ratio: no crop, distortion, or asset changes. */}
                  <div
                    style={{
                      top: "11.65%",
                      left: "8%",
                      width: "84%",
                      aspectRatio: "734 / 302"
                    }}
                    className="absolute pointer-events-none"
                  >
                    <img
                      src="/branding/Logoactual.png"
                      alt="OwnersLOCAL"
                      style={{ width: "100%", height: "100%" }}
                      className="object-contain"
                      referrerPolicy="no-referrer"
                    />
                    <span
                      style={{
                        right: "3.5%",
                        bottom: "27%",
                        fontSize: `${Math.max(6, Math.round(7 * scale))}px`,
                        letterSpacing: "0.08em",
                      }}
                      className="absolute font-sans font-semibold text-[#315C9F]/65"
                    >
                      by Stuffapp
                    </span>
                  </div>

                  {/* CONTINUE WITH GOOGLE BUTTON */}
                  <div 
                    style={{ top: "27.2%", left: "11%", width: "78%", height: "4.5%" }}
                    className="absolute"
                  >
                    <button
                      type="button"
                      onClick={() => handleGoogleSignIn()}
                      style={{
                        borderRadius: `${14 * scale}px`,
                        gap: `${8 * scale}px`,
                        ...getFontSize(14.5)
                      }}
                      className="w-full h-full bg-white hover:bg-slate-50 border border-slate-200/80 flex items-center justify-center font-bold text-slate-700 shadow-sm hover:shadow active:scale-[0.99] transition-all cursor-pointer"
                    >
                      <svg 
                        style={{ width: `${18 * scale}px`, height: `${18 * scale}px` }} 
                        viewBox="0 0 24 24"
                      >
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <span>Continue with Google</span>
                    </button>
                  </div>

                  {/* SEPARATOR - OR SIGN IN WITH PASSWORD */}
                  <div 
                    style={{ top: "34.7625%", left: "11%", width: "78%", gap: `${8 * scale}px` }}
                    className="absolute flex items-center justify-between"
                  >
                    <div className="h-[1px] flex-1 bg-blue-900/30 shadow-[0_0_1px_rgba(0,240,255,0.4)]" />
                    <span 
                      style={{
                        letterSpacing: "0.12em",
                        ...getFontSize(10.5)
                      }}
                      className="font-bold text-blue-900/60 font-sans"
                    >
                      OR SIGN IN WITH PASSWORD
                    </span>
                    <div className="h-[1px] flex-1 bg-blue-900/30 shadow-[0_0_1px_rgba(0,240,255,0.4)]" />
                  </div>

                  {/* PASSWORD SIGN-IN FORM VIEW */}
                  <form onSubmit={handlePasswordSignIn}>
                    
                    {/* BUSINESS EMAIL FIELD */}
                    <div 
                      style={{ top: "38.14375%", left: "11%", width: "78%" }}
                      className="absolute"
                    >
                      <label 
                        style={{
                          letterSpacing: "0.05em",
                          marginBottom: `${4 * scale}px`,
                          ...getFontSize(11.5)
                        }}
                        className="block font-bold text-blue-900/80"
                      >
                        BUSINESS EMAIL
                      </label>
                      <div 
                        style={{ height: `${46 * scale}px` }}
                        className="relative w-full"
                      >
                        <div 
                          style={{ left: `${14 * scale}px` }}
                          className="absolute top-1/2 -translate-y-1/2 text-blue-800/50 pointer-events-none"
                        >
                          <Mail style={{ width: `${18 * scale}px`, height: `${18 * scale}px` }} />
                        </div>
                        <input
                          type="text"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          style={{
                            paddingLeft: `${42 * scale}px`,
                            paddingRight: `${14 * scale}px`,
                            borderRadius: `${12 * scale}px`,
                            ...getFontSize(13.5)
                          }}
                          className="w-full h-full bg-[#f0f6ff]/95 hover:bg-white focus:bg-white text-slate-800 font-medium border border-slate-200/50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-inner-sm transition-all placeholder:text-slate-400"
                        />
                      </div>
                    </div>

                    {/* PASSWORD FIELD */}
                    <div 
                      style={{ top: "48.0625%", left: "11%", width: "78%" }}
                      className="absolute"
                    >
                      <div 
                        style={{ marginBottom: `${4 * scale}px` }}
                        className="flex items-center justify-between"
                      >
                        <label 
                          style={{
                            letterSpacing: "0.05em",
                            ...getFontSize(11.5)
                          }}
                          className="block font-bold text-blue-900/80"
                        >
                          PASSWORD
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowForgotPassword(true)}
                          style={getFontSize(11.5)}
                          className="font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                        >
                          Forgot?
                        </button>
                      </div>
                      <div 
                        style={{ height: `${46 * scale}px` }}
                        className="relative w-full"
                      >
                        <div 
                          style={{ left: `${14 * scale}px` }}
                          className="absolute top-1/2 -translate-y-1/2 text-blue-800/50 pointer-events-none"
                        >
                          <Lock style={{ width: `${18 * scale}px`, height: `${18 * scale}px` }} />
                        </div>
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••••"
                          style={{
                            paddingLeft: `${42 * scale}px`,
                            paddingRight: `${42 * scale}px`,
                            borderRadius: `${12 * scale}px`,
                            ...getFontSize(13.5)
                          }}
                          className="w-full h-full bg-[#f0f6ff]/95 hover:bg-white focus:bg-white text-slate-800 font-medium border border-slate-200/50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-inner-sm transition-all placeholder:text-slate-400"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          style={{ right: `${14 * scale}px` }}
                          className="absolute top-1/2 -translate-y-1/2 text-blue-800/50 hover:text-blue-800/80 transition-colors cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff style={{ width: `${18 * scale}px`, height: `${18 * scale}px` }} />
                          ) : (
                            <Eye style={{ width: `${18 * scale}px`, height: `${18 * scale}px` }} />
                          )}
                        </button>
                      </div>

                      {/* REMEMBER ME CHECKBOX */}
                      <div 
                        style={{ marginTop: `${5 * scale}px`, gap: `${6 * scale}px` }}
                        className="flex items-center select-none"
                      >
                        <input
                          type="checkbox"
                          id="remember-me-checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          style={{ width: `${14 * scale}px`, height: `${14 * scale}px` }}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <label 
                          htmlFor="remember-me-checkbox"
                          style={getFontSize(11.5)}
                          className="font-bold text-blue-900/80 cursor-pointer"
                        >
                          Remember Me
                        </label>
                      </div>
                    </div>

                    {/* SIGN IN GENERATED GLOWING BUTTON */}
                    <div 
                      style={{ top: "58.2%", left: "11%", width: "78%", height: "4.5%" }}
                      className="absolute flex items-center"
                    >
                      <button
                        type="submit"
                        style={{
                          borderRadius: `${14 * scale}px`,
                          ...getFontSize(14.5)
                        }}
                        className="w-full h-full border-0 font-sans font-bold uppercase tracking-[0.08em] text-white cursor-pointer select-none relative overflow-hidden transition-all duration-300 bg-gradient-to-r from-[#00b0ff] to-[#0055ff] hover:brightness-110 hover:shadow-[0_0_24px_rgba(0,176,255,0.5)] active:shadow-[0_0_35px_rgba(0,176,255,0.7)] active:scale-[0.98] flex items-center justify-center gap-2"
                      >
                        <span>Sign In ➔</span>
                      </button>
                    </div>

                    {loginError && (
                      <div 
                        style={{ top: "54.1%", left: "11%", width: "78%" }}
                        className="absolute text-rose-600 font-bold text-[10px] sm:text-[11px] leading-tight flex items-center gap-1.5 bg-rose-50/95 py-1 px-2 border border-rose-200/50 rounded-lg shadow-sm"
                      >
                        <span className="w-1.5 h-1.5 bg-rose-500 rounded-full shrink-0" />
                        <span>{loginError}</span>
                      </div>
                    )}

                  </form>

                  {/* DYNAMIC OR SIGN UP LINK */}
                  <div 
                    style={{ 
                      top: "62.333%", 
                      left: "11%", 
                      width: "78%", 
                      height: "3.5%",
                    }}
                    className="absolute flex items-center justify-center"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSignUpInstructionsEmail("");
                        setSignUpInstructionsBusinessName("");
                        setSignUpInstructionsOwnerName("");
                        setSignUpInstructionsPassword("");
                        setSignUpInstructionsError("");
                        setSignUpInstructionsStep("input");
                        setShowSignUpInstructions(true);
                      }}
                      style={getFontSize(11.5)}
                      className="font-bold text-[#1E3A8A] hover:text-[#2563EB] transition-colors cursor-pointer flex items-center justify-center gap-1 hover:underline"
                    >
                      <span>Don't have an account?</span>
                      <span className="font-extrabold text-[#315C9F] underline">Or Sign Up</span>
                    </button>
                  </div>

                  {/* SEPARATOR - FIELD SERVICE LOG IN */}
                  <div 
                    style={{ top: "67.68%", left: "11%", width: "78%", gap: `${8 * scale}px` }}
                    className="absolute flex items-center justify-between"
                  >
                    <div className="h-[1px] flex-1 bg-blue-900/30 shadow-[0_0_1px_rgba(0,240,255,0.4)]" />
                    <span 
                      style={{
                        letterSpacing: "0.12em",
                        ...getFontSize(10.5)
                      }}
                      className="font-bold text-blue-900/60 font-sans"
                    >
                      FIELD SERVICE LOG IN
                    </span>
                    <div className="h-[1px] flex-1 bg-blue-900/30 shadow-[0_0_1px_rgba(0,240,255,0.4)]" />
                  </div>

                  {/* INVITE CODE SECTION */}
                  <div 
                    style={{ top: "72.204%", left: "11%", width: "54%" }}
                    className="absolute"
                  >
                    <label 
                      style={{
                        letterSpacing: "0.03em",
                        marginBottom: `${4 * scale}px`,
                        ...getFontSize(10.5)
                      }}
                      className="block font-bold text-blue-900/80"
                    >
                      ENTER EMPLOYEE INVITE CODE
                    </label>
                    <div 
                      style={{ height: `${46 * scale}px` }}
                      className="relative w-full"
                    >
                      <div 
                        style={{ left: `${14 * scale}px` }}
                        className="absolute top-1/2 -translate-y-1/2 text-blue-800/50 pointer-events-none"
                      >
                        <User style={{ width: `${18 * scale}px`, height: `${18 * scale}px` }} />
                      </div>
                      <input
                        type="text"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value)}
                        placeholder="DRIVER-X4F91"
                        style={{
                          paddingLeft: `${42 * scale}px`,
                          paddingRight: `${12 * scale}px`,
                          borderRadius: `${12 * scale}px`,
                          ...getFontSize(13.5)
                        }}
                        className="w-full h-full bg-[#f0f6ff]/95 hover:bg-white focus:bg-white text-slate-800 font-mono font-bold uppercase border border-slate-200/50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-inner-sm transition-all placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  {/* GO GENERATED GLOWING BUTTON */}
                  <div 
                    style={{ top: "74.454%", left: "68%", width: "21%", height: "4.5%" }}
                    className="absolute"
                  >
                    <button
                      type="button"
                      onClick={handleInviteSignIn}
                      style={{
                        borderRadius: `${14 * scale}px`,
                        ...getFontSize(14.5)
                      }}
                      className="w-full h-full border-0 font-sans font-bold uppercase tracking-[0.05em] text-white cursor-pointer select-none relative overflow-hidden transition-all duration-300 bg-gradient-to-r from-[#00b0ff] to-[#0055ff] hover:brightness-110 hover:shadow-[0_0_24px_rgba(0,176,255,0.5)] active:shadow-[0_0_35px_rgba(0,176,255,0.7)] active:scale-[0.98] flex items-center justify-center"
                    >
                      <span>Go ➔</span>
                    </button>
                  </div>

                  {/* FOOTER NAV LINKS */}
                  <div 
                    style={{ 
                      bottom: "13.5%", 
                      left: "11%", 
                      width: "78%",
                      gap: `${16 * scale}px`
                    }}
                    className="absolute flex items-center justify-center text-blue-700 font-sans"
                  >
                    <button 
                      onClick={() => setCurrentView("placeholder_help")}
                      style={{ gap: `${4 * scale}px`, ...getFontSize(12.5) }}
                      className="flex items-center font-bold hover:text-blue-900 transition-colors cursor-pointer"
                    >
                      <HelpCircle style={{ width: `${16 * scale}px`, height: `${16 * scale}px` }} />
                      <span>Need Help?</span>
                    </button>
                    
                    <div style={{ height: `${12 * scale}px` }} className="w-[1px] bg-blue-300" />
                    
                    <button 
                      onClick={() => setCurrentView("placeholder_privacy")}
                      style={{ gap: `${4 * scale}px`, ...getFontSize(12.5) }}
                      className="flex items-center font-bold hover:text-blue-900 transition-colors cursor-pointer"
                    >
                      <Shield style={{ width: `${16 * scale}px`, height: `${16 * scale}px` }} />
                      <span>Privacy Policy</span>
                    </button>
                  </div>

                  {/* AI BUTTONS ON THE BOTTOM OF THE BLUE BACKGROUND */}
                  <div 
                    style={{ 
                      bottom: "5.5%", 
                      left: "11%", 
                      width: "78%"
                    }}
                    className="absolute flex items-center justify-center pointer-events-auto"
                  >
                    {/* AI ASSISTANT BUTTON */}
                    <button
                      type="button"
                      onClick={() => setIsFloatingAiOpen(true)}
                      style={{
                        padding: `${6 * scale}px ${10 * scale}px`,
                        borderRadius: `${10 * scale}px`,
                        ...getFontSize(10)
                      }}
                      className="flex items-center gap-1.5 bg-gradient-to-r from-[#1F3557] to-[#315C9F] text-white font-black uppercase tracking-wider shadow-md hover:shadow-lg hover:scale-105 active:scale-[0.98] border border-blue-300/30 transition-all cursor-pointer"
                    >
                      <span className="relative flex" style={{ width: `${6 * scale}px`, height: `${6 * scale}px` }}>
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full bg-emerald-500" style={{ width: `${6 * scale}px`, height: `${6 * scale}px` }}></span>
                      </span>
                      <span>Owner's AI</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* ONBOARDING FLOW SCREEN - STEP 1 (CREATE YOUR BUSINESS) */}
                  {(currentView === "placeholder_google" || currentView === "placeholder_password" || currentView === "placeholder_invite") ? (
                    <div 
                      style={{
                        padding: `${20 * scale}px ${16 * scale}px`,
                      }}
                      className="absolute inset-0 bg-[#f5f8ff] flex flex-col justify-between overflow-hidden select-none"
                    >
                      {/* Subtle decorative glowing backgrounds inside card */}
                      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-400/10 blur-xl rounded-full pointer-events-none" />
                      <div className="absolute bottom-0 left-0 w-24 h-24 bg-cyan-400/10 blur-xl rounded-full pointer-events-none" />
                      
                      {/* ONBOARDING HEADER MODULE */}
                      <div className="relative z-10 flex items-center justify-between mb-4 pb-3 border-b border-slate-200/50 shrink-0">
                        <div className="flex items-center gap-2.5">
                          {/* Heartbeat/Pulse logo matching image exactly */}
                          <div 
                            style={{
                              width: `${36 * scale}px`,
                              height: `${36 * scale}px`,
                              borderRadius: `${9 * scale}px`,
                            }}
                            className="bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0"
                          >
                            <svg 
                              viewBox="0 0 24 24" 
                              fill="none" 
                              stroke="currentColor" 
                              strokeWidth="3.5" 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              className="w-5 h-5 animate-pulse text-white"
                            >
                              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                            </svg>
                          </div>
                          <div>
                            <h2 style={getFontSize(14.5)} className="font-sans font-bold text-slate-900 tracking-tight leading-tight uppercase">
                              Create Your Business
                            </h2>
                            <p style={getFontSize(10.5)} className="font-sans text-slate-500 font-medium">
                              Step 1 of 2. Profile settings
                            </p>
                          </div>
                        </div>
                        {/* Badge */}
                        <span 
                          style={{
                            padding: `${2 * scale}px ${6 * scale}px`,
                            borderRadius: `${10 * scale}px`,
                            ...getFontSize(9)
                          }}
                          className="font-sans font-bold text-blue-700 bg-blue-50 border border-blue-200 uppercase tracking-wider select-none shrink-0"
                        >
                          Onboarding
                        </span>
                      </div>

                      {/* FORM FIELDS - SCROLLABLE GROUP */}
                      <div className="relative z-10 flex-1 space-y-3.5 overflow-y-auto pr-0.5 scrollbar-thin scrollbar-thumb-blue-200/50">
                        {renderDynamicField("owner name", ownerNames, setOwnerNames, "e.g. John Doe")}
                        {renderDynamicField("owner phone", ownerPhones, setOwnerPhones, "e.g. (206) 555-0199")}
                        {renderDynamicField("business name", businessNames, setBusinessNames, "e.g. Ironclad Plumbing & HVAC")}
                        {renderDynamicField("business phone", businessPhones, setBusinessPhones, "e.g. (206) 565-0144")}
                        <StructuredAddressFields
                          label="Business Headquarters Address"
                          value={businessAddresses[0] || ""}
                          onChange={(value) => setBusinessAddresses(prev => [value, ...prev.slice(1)])}
                          required
                        />
                        {renderDynamicField("business logo", businessLogos, setBusinessLogos, "e.g. https://logo-url.png")}
                        
                        {/* Billing Methods Dropdown/Field */}
                        <div className="space-y-1.5 mb-3.5">
                          <div className="flex items-center justify-between px-1">
                            <label style={getFontSize(11)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider">
                              billing methods
                            </label>
                            <button
                              type="button"
                              onClick={() => setShowAddBillingModal(true)}
                              style={{ padding: `${3 * scale}px ${8 * scale}px`, borderRadius: `${6 * scale}px`, ...getFontSize(10) }}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold flex items-center gap-1 transition-colors cursor-pointer border border-emerald-200/50"
                            >
                              <span>+ Add Card</span>
                            </button>
                          </div>
                          <div className="relative">
                            <select
                              value={selectedBillingMethodId}
                              onChange={(e) => setSelectedBillingMethodId(e.target.value)}
                              style={{
                                height: `${42 * scale}px`,
                                borderRadius: `${12 * scale}px`,
                                paddingLeft: `${14 * scale}px`,
                                paddingRight: `${36 * scale}px`,
                                ...getFontSize(12.5)
                              }}
                              className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 font-medium focus:outline-none transition-all shadow-sm appearance-none cursor-pointer"
                            >
                              {billingMethods.map((method) => (
                                <option key={method.id} value={method.id}>
                                  {method.brand} ending in {method.cardNumber.slice(-4)} ({method.cardholderName})
                                </option>
                              ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                              <ChevronRight className="w-4 h-4 rotate-90" />
                            </div>
                          </div>
                        </div>

                        {renderDynamicField("company locations", companyLocations, setCompanyLocations, "e.g. Seattle HQ")}
                      </div>

                      {/* BOTTOM ACTION BUTTONS */}
                      <div className="relative z-10 flex items-center justify-between gap-2.5 pt-3 mt-3 border-t border-slate-200/50 bg-white/10 shrink-0">
                        <button
                          type="button"
                          onClick={handleBackToLogin}
                          style={{
                            height: `${38 * scale}px`,
                            borderRadius: `${12 * scale}px`,
                            paddingLeft: `${14 * scale}px`,
                            paddingRight: `${14 * scale}px`,
                            ...getFontSize(12.5)
                          }}
                          className="font-sans font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100/80 border border-slate-200 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 bg-white shadow-sm"
                        >
                          Back
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            const errors: Record<string, string> = {};
                            const hasEmptyValue = (arr: string[]) => !arr || arr.length === 0 || arr.some(v => !v || !v.trim());
                            
                            if (hasEmptyValue(ownerNames)) {
                              errors["owner name"] = "Owner Name cannot be empty.";
                            }
                            if (hasEmptyValue(ownerPhones)) {
                              errors["owner phone"] = "Owner Phone cannot be empty.";
                            }
                            if (hasEmptyValue(businessNames)) {
                              errors["business name"] = "Business Name cannot be empty.";
                            }
                            if (hasEmptyValue(businessPhones)) {
                              errors["business phone"] = "Business Phone cannot be empty.";
                            }
                            if (hasEmptyValue(businessAddresses)) {
                              errors["business address"] = "Business Address cannot be empty.";
                            }
                            
                            if (Object.keys(errors).length > 0) {
                              setOnboardingErrors(errors);
                              triggerNotification("Please fill in all required fields.");
                              return;
                            }
                            
                            setOnboardingErrors({});
                            setIsSubmitting(true);
                            await saveProfileToFirestore();
                            setIsSubmitting(false);
                            setCurrentView("placeholder_team_setup");
                          }}
                          style={{
                            height: `${38 * scale}px`,
                            borderRadius: `${12 * scale}px`,
                            paddingLeft: `${16 * scale}px`,
                            paddingRight: `${16 * scale}px`,
                            ...getFontSize(12.5)
                          }}
                          className="flex-1 font-sans font-bold text-white bg-gradient-to-r from-[#00b0ff] to-[#0055ff] hover:brightness-105 active:scale-[0.98] shadow-md hover:shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span>Continue</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : currentView === "placeholder_team_setup" ? (
                    <div 
                      style={{
                        padding: `${18 * scale}px ${16 * scale}px`,
                        backgroundImage: `url("https://raw.githubusercontent.com/mcwaddingham1990-star/Leadforgeos/main/Src/Screens/Lightmodescreens/Step1step2blank.png")`,
                        backgroundSize: "cover",
                        backgroundPosition: "center"
                      }}
                      className="absolute inset-0 flex flex-col justify-between overflow-hidden select-none"
                    >
                      {/* Subtle floating glow effects inside card */}
                      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-400/10 blur-xl rounded-full pointer-events-none" />
                      <div className="absolute bottom-0 left-0 w-24 h-24 bg-cyan-400/10 blur-xl rounded-full pointer-events-none" />
                      
                      {/* STEP 2 HEADER */}
                      <div className="relative z-10 flex items-center justify-between mb-2 pb-2 border-b border-slate-200/50 shrink-0">
                        <div className="flex items-center gap-2">
                          {/* Heartbeat/Pulse logo in bright blue */}
                          <div 
                            style={{
                              width: `${32 * scale}px`,
                              height: `${32 * scale}px`,
                              borderRadius: `${8 * scale}px`
                            }}
                            className="bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 animate-pulse"
                          >
                            <Users style={{ width: `${16 * scale}px`, height: `${16 * scale}px` }} />
                          </div>
                          <div>
                            <h2 style={getFontSize(14)} className="font-sans font-extrabold text-blue-950 uppercase tracking-tight">
                              Build Your Team
                            </h2>
                            <p style={getFontSize(9.5)} className="text-slate-400 font-sans font-medium">
                              Step 2 of 2 • Assign initial roles & codes
                            </p>
                          </div>
                        </div>
                        {/* Pill badge matching image */}
                        <span 
                          style={{
                            padding: `${2 * scale}px ${6 * scale}px`,
                            borderRadius: `${10 * scale}px`,
                            ...getFontSize(8.5)
                          }}
                          className="font-sans font-bold text-blue-700 bg-blue-50 border border-blue-200 uppercase tracking-wider select-none shrink-0"
                        >
                          Team Assignment
                        </span>
                      </div>

                      {/* TEAM SYSTEM INITIATED NOTICE BOX */}
                      <div 
                        style={{
                          padding: `${8 * scale}px ${10 * scale}px`,
                          borderRadius: `${10 * scale}px`,
                          marginBottom: `${8 * scale}px`
                        }}
                        className="relative z-10 bg-emerald-50/90 border border-emerald-100 flex gap-2 shrink-0"
                      >
                        <ShieldAlert className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <p style={getFontSize(10)} className="font-sans font-bold text-emerald-950">
                            Role-Based System Permissions Initiated
                          </p>
                          <p style={getFontSize(8.5)} className="text-emerald-800 leading-normal font-sans font-medium">
                            Each staff member receives an individual invite code. Employees only see sidebar tabs corresponding directly to assigned permissions.
                          </p>
                        </div>
                      </div>

                      {/* DROPDOWN SELECTOR & HELP INFO LINK */}
                      <div className="relative z-10 space-y-1.5 mb-2 shrink-0">
                        <div className="flex items-center justify-between px-1">
                          <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider flex items-center gap-1">
                            <span>Select Roles to Add</span>
                            {/* Floating panel explanation icon */}
                            <button
                              type="button"
                              onClick={() => setShowRoleInfoPopup(showRoleInfoPopup ? null : "info")}
                              className="text-blue-500 hover:text-blue-700 focus:outline-none flex items-center justify-center cursor-pointer"
                            >
                              <Info className="w-3.5 h-3.5 animate-bounce" />
                            </button>
                          </label>
                          <span style={getFontSize(9)} className="text-slate-400 font-mono">
                            {selectedRoles.reduce((acc, r) => acc + r.count, 0)} Seats Configured
                          </span>
                        </div>
                        
                        <div className="relative">
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleAddRole(e.target.value);
                                e.target.value = ""; // Reset after selection
                              }
                            }}
                            style={{
                              height: `${38 * scale}px`,
                              borderRadius: `${10 * scale}px`,
                              paddingLeft: `${12 * scale}px`,
                              paddingRight: `${32 * scale}px`,
                              ...getFontSize(12)
                            }}
                            className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 font-bold focus:outline-none transition-all shadow-sm appearance-none cursor-pointer"
                          >
                            <option value="">+ Add a team role...</option>
                            <option value="__create_custom__" className="text-blue-600 font-bold">
                              ★ + Create Custom Role from scratch...
                            </option>
                            {/* Custom Role stays first; Owner is already added. */}
                            {Object.entries(DEFAULT_ROLES_DATA)
                              .filter(([key]) => key !== "owner")
                              .map(([key, role]) => {
                                const isAdded = selectedRoles.some(r => r.id === key);
                                return (
                                  <option key={key} value={key}>
                                    {role.name} {isAdded ? "• Add another seat" : ""}
                                  </option>
                                );
                              })}
                          </select>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                            <ChevronDown className="w-4 h-4" />
                          </div>
                        </div>
                      </div>

                      {/* STAFF ROLES SCROLLABLE LIST */}
                      <div className="relative z-10 flex-1 overflow-y-auto pr-0.5 space-y-2 mb-3 scrollbar-thin scrollbar-thumb-blue-200/50">
                        {selectedRoles.map((role) => (
                          <div 
                            key={role.id}
                            style={{
                              padding: `${10 * scale}px ${12 * scale}px`,
                              borderRadius: `${12 * scale}px`
                            }}
                            className="bg-white border border-slate-200/80 shadow-sm flex flex-col gap-2 relative group hover:border-blue-200 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 style={getFontSize(12)} className="font-sans font-bold text-blue-950 flex items-center gap-1">
                                  <span>{role.name}</span>
                                  {role.isCustom && (
                                    <span style={getFontSize(8)} className="px-1 py-0.5 bg-purple-50 text-purple-600 border border-purple-200 rounded font-bold uppercase">
                                      Custom
                                    </span>
                                  )}
                                </h4>
                                <p style={getFontSize(9.5)} className="text-slate-400 font-sans font-medium line-clamp-1">
                                  {role.description}
                                </p>
                              </div>

                              {/* COUNTER MODULE */}
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleDecrementRoleCount(role.id)}
                                  style={{
                                    width: `${24 * scale}px`,
                                    height: `${24 * scale}px`
                                  }}
                                  className="rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-90 flex items-center justify-center cursor-pointer font-bold border border-slate-200/30"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span style={getFontSize(12)} className="font-mono font-bold text-slate-800 w-4 text-center">
                                  {role.count}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleIncrementRoleCount(role.id)}
                                  style={{
                                    width: `${24 * scale}px`,
                                    height: `${24 * scale}px`
                                  }}
                                  className="rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-90 flex items-center justify-center cursor-pointer font-bold border border-blue-200/30"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {/* PERMISSIONS SNAPSHOT TAGS */}
                            <div className="flex flex-wrap gap-1">
                              {role.permissions.slice(0, 4).map((p) => (
                                <span 
                                  key={p} 
                                  style={{
                                    padding: `${1 * scale}px ${4 * scale}px`,
                                    borderRadius: `${4 * scale}px`,
                                    ...getFontSize(8.5)
                                  }}
                                  className="bg-blue-50/50 text-blue-600 font-mono font-bold capitalize border border-blue-100/50"
                                >
                                  {p}
                                </span>
                              ))}
                              {role.permissions.length > 4 && (
                                <span 
                                  style={{
                                    padding: `${1 * scale}px ${4 * scale}px`,
                                    borderRadius: `${4 * scale}px`,
                                    ...getFontSize(8.5)
                                  }}
                                  className="bg-slate-50 text-slate-400 font-mono font-bold"
                                >
                                  +{role.permissions.length - 4} more
                                </span>
                              )}
                            </div>

                            {/* CARD SUB-ACTIONS */}
                            {roleIdPendingDelete === role.id ? (
                              <div className="flex items-center justify-between w-full bg-rose-50/90 px-2 py-1 rounded border border-rose-100/50 animate-fade-in mt-1">
                                <span style={getFontSize(9.5)} className="text-rose-700 font-bold flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full shrink-0" />
                                  <span>Remove this role?</span>
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleRemoveRole(role.id);
                                      setRoleIdPendingDelete(null);
                                    }}
                                    className="font-sans font-extrabold text-rose-600 hover:text-rose-800 bg-rose-100 hover:bg-rose-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
                                    style={getFontSize(9.5)}
                                  >
                                    Yes, Remove
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRoleIdPendingDelete(null)}
                                    className="font-sans font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
                                    style={getFontSize(9.5)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between pt-1 border-t border-slate-100/50 text-[10px] text-slate-500">
                                <button
                                  type="button"
                                  onClick={() => setCustomizingRole(role)}
                                  className="font-sans font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                                >
                                  <Settings className="w-3 h-3 text-blue-500 animate-spin-slow" />
                                  <span>Customize Permissions</span>
                                </button>

                                <div className="flex items-center gap-2.5">
                                  <button
                                    type="button"
                                    onClick={() => handleDuplicateRole(role)}
                                    className="font-sans font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                                  >
                                    <Copy className="w-3 h-3 text-slate-400" />
                                    <span>Duplicate</span>
                                  </button>

                                  {role.id !== "owner" && (
                                    <button
                                      type="button"
                                      onClick={() => setRoleIdPendingDelete(role.id)}
                                      className="font-sans font-bold text-rose-500 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3 text-rose-400" />
                                      <span>Remove Role</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                          </div>
                        ))}
                      </div>

                      {/* BOTTOM ACTION BUTTONS */}
                      <div className="relative z-10 flex items-center justify-between gap-2.5 pt-3 mt-1 border-t border-slate-200/50 bg-white/10 shrink-0">
                        <button
                          type="button"
                          onClick={() => setCurrentView("placeholder_password")}
                          style={{
                            height: `${38 * scale}px`,
                            borderRadius: `${12 * scale}px`,
                            paddingLeft: `${14 * scale}px`,
                            paddingRight: `${14 * scale}px`,
                            ...getFontSize(12.5)
                          }}
                          className="font-sans font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100/80 border border-slate-200 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 bg-white shadow-sm"
                        >
                          Back
                        </button>

                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={handleLaunchOS}
                          style={{
                            height: `${38 * scale}px`,
                            borderRadius: `${12 * scale}px`,
                            paddingLeft: `${16 * scale}px`,
                            paddingRight: `${16 * scale}px`,
                            ...getFontSize(12.5)
                          }}
                          className="flex-1 font-sans font-bold text-white bg-gradient-to-r from-[#00b0ff] to-[#0055ff] hover:brightness-105 active:scale-[0.98] shadow-md hover:shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {isSubmitting ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <span>Launch OS</span>
                              <ChevronRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </div>

                    </div>
                  ) : currentView === "employee_onboarding" ? (
                    /* EMPLOYEE ONBOARDING VIEW (STEP 1 OF 1) */
                    <div 
                      style={{
                        padding: `${16 * scale}px ${16 * scale}px`,
                        backgroundColor: "#f8faff"
                      }}
                      className="absolute inset-0 flex flex-col justify-between overflow-hidden select-none animate-fade-in"
                    >
                      {/* Decorative elements */}
                      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-xl rounded-full pointer-events-none" />
                      <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-500/5 blur-xl rounded-full pointer-events-none" />

                      {/* Header */}
                      <div className="relative z-10 flex items-center justify-between mb-3 pb-2 border-b border-slate-200/50 shrink-0">
                        <div className="flex items-center gap-2">
                          <div 
                            style={{
                              width: `${32 * scale}px`,
                              height: `${32 * scale}px`,
                              borderRadius: `${8 * scale}px`
                            }}
                            className="bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/10"
                          >
                            <User style={{ width: `${16 * scale}px`, height: `${16 * scale}px` }} />
                          </div>
                          <div>
                            <h2 style={getFontSize(14)} className="font-sans font-extrabold text-blue-950 uppercase tracking-tight">
                              Employee Onboarding
                            </h2>
                            <p style={getFontSize(9.5)} className="text-indigo-600 font-sans font-medium">
                              Step 1 of 1 • Create Your Profile
                            </p>
                          </div>
                        </div>
                        <span 
                          style={{
                            padding: `${2 * scale}px ${6 * scale}px`,
                            borderRadius: `${10 * scale}px`,
                            ...getFontSize(8.5)
                          }}
                          className="font-sans font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 uppercase tracking-wider select-none shrink-0"
                        >
                          Registration
                        </span>
                      </div>

                      {/* SCROLLABLE REGISTRATION FORM */}
                      <form 
                        onSubmit={handleCompleteEmployeeOnboarding}
                        className="relative z-10 flex-1 flex flex-col justify-between overflow-hidden"
                      >
                        <div className="flex-1 overflow-y-auto pr-0.5 space-y-3 scrollbar-thin scrollbar-thumb-blue-100">
                          
                          {/* Invite Code field (Disabled) */}
                          <div className="space-y-1">
                            <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                              Invite Code (Verified)
                            </label>
                            <input
                              type="text"
                              value={empInviteCode}
                              disabled
                              style={{ height: `${36 * scale}px`, borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                              className="w-full bg-slate-100 border border-slate-200 px-3 text-slate-500 font-mono font-bold uppercase"
                            />
                          </div>

                          {/* Personal Info Row */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                                First Name
                              </label>
                              <input
                                type="text"
                                value={empFirstName}
                                onChange={(e) => setEmpFirstName(e.target.value)}
                                placeholder="John"
                                required
                                style={{ height: `${36 * scale}px`, borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                                className="w-full bg-white border border-slate-200 px-3 text-slate-800 font-sans focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                              />
                            </div>
                            <div className="space-y-1">
                              <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                                Last Name
                              </label>
                              <input
                                type="text"
                                value={empLastName}
                                onChange={(e) => setEmpLastName(e.target.value)}
                                placeholder="Smith"
                                required
                                style={{ height: `${36 * scale}px`, borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                                className="w-full bg-white border border-slate-200 px-3 text-slate-800 font-sans focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                              />
                            </div>
                          </div>

                          {/* Email Input */}
                          <div className="space-y-1">
                            <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                              Verify Email Address
                            </label>
                            <input
                              type="email"
                              value={empEmail}
                              onChange={(e) => setEmpEmail(e.target.value)}
                              placeholder="john.smith@ironclad.com"
                              required
                              style={{ height: `${36 * scale}px`, borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                              className="w-full bg-white border border-slate-200 px-3 text-slate-800 font-sans focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                            />
                          </div>

                          {/* Create Password */}
                          <div className="space-y-1">
                            <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                              Create Password
                            </label>
                            <input
                              type="password"
                              value={empPassword}
                              onChange={(e) => setEmpPassword(e.target.value)}
                              placeholder="••••••••"
                              required
                              style={{ height: `${36 * scale}px`, borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                              className="w-full bg-white border border-slate-200 px-3 text-slate-800 font-sans focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                            />
                          </div>

                          {/* Contact Details */}
                          <div className="space-y-1">
                            <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                              Contact Phone
                            </label>
                            <input
                              type="tel"
                              value={empPhone}
                              onChange={(e) => setEmpPhone(e.target.value)}
                              placeholder="(206) 555-0199"
                              required
                              style={{ height: `${36 * scale}px`, borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                              className="w-full bg-white border border-slate-200 px-3 text-slate-800 font-sans focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                            />
                          </div>

                          <StructuredAddressFields
                            label="Home Address"
                            value={empAddress}
                            onChange={setEmpAddress}
                            required
                            compact
                            inputClassName="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-sans text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                          />

                          <div className="space-y-1">
                            <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                              Hourly Pay Rate (Optional)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={empHourlyRate}
                              onChange={(e) => setEmpHourlyRate(e.target.value)}
                              placeholder="e.g. 28.50"
                              style={{ height: `${36 * scale}px`, borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                              className="w-full bg-white border border-slate-200 px-3 text-slate-800 font-sans focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                            />
                          </div>

                          {/* Avatar Selection (Optional Profile Photo) */}
                          <div className="space-y-2">
                            <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                              Select Avatar Photo (Optional)
                            </label>
                            <div className="flex gap-3 items-center">
                              {[
                                "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80",
                                "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80",
                                "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80",
                                "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80"
                              ].map((url, i) => {
                                const isSelected = empPhoto === url;
                                return (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => setEmpPhoto(url)}
                                    className={`relative rounded-full overflow-hidden w-10 h-10 border-2 cursor-pointer transition-all ${
                                      isSelected ? "border-indigo-600 scale-110 shadow-md" : "border-slate-200 opacity-60 hover:opacity-100"
                                    }`}
                                  >
                                    <img src={url} alt="Avatar" className="w-full h-full object-cover" />
                                    {isSelected && (
                                      <div className="absolute inset-0 bg-indigo-600/30 flex items-center justify-center">
                                        <Check className="w-4 h-4 text-white font-bold" />
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Employment Goals */}
                          <div className="space-y-1">
                            <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                              Employment Goals & Career Plan
                            </label>
                            <textarea
                              value={empGoals}
                              onChange={(e) => setEmpGoals(e.target.value)}
                              placeholder="e.g., Aspiring to become lead technician and coordinate regional operations."
                              rows={2}
                              style={{ borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                              className="w-full bg-white border border-slate-200 p-2.5 text-slate-800 font-sans focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
                            />
                          </div>

                        </div>

                        {/* Actions */}
                        <div className="relative z-10 flex items-center justify-between gap-3 pt-3 mt-2 border-t border-slate-200/50 bg-white/10 shrink-0">
                          <button
                            type="button"
                            onClick={() => setCurrentView("login")}
                            style={{
                              height: `${38 * scale}px`,
                              borderRadius: `${12 * scale}px`,
                              paddingLeft: `${16 * scale}px`,
                              paddingRight: `${16 * scale}px`,
                              ...getFontSize(12.5)
                            }}
                            className="font-sans font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer flex items-center justify-center bg-white shadow-sm"
                          >
                            Cancel
                          </button>

                          <button
                            type="submit"
                            disabled={isSubmitting}
                            style={{
                              height: `${38 * scale}px`,
                              borderRadius: `${12 * scale}px`,
                              paddingLeft: `${18 * scale}px`,
                              paddingRight: `${18 * scale}px`,
                              ...getFontSize(12.5)
                            }}
                            className="flex-1 font-sans font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            {isSubmitting ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <span>Complete Onboarding</span>
                                <ChevronRight className="w-4 h-4" />
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    /* ORIGINAL HELP / PRIVACY PLACEHOLDER VIEWS */
                    <div className="absolute inset-0 bg-gradient-to-b from-[#f0f6ff] to-[#e6efff] flex flex-col items-center justify-center p-8">
                      {/* Subtle glowing ambient lights inside the card */}
                      <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-400/10 blur-2xl rounded-full pointer-events-none" />
                      <div className="absolute bottom-1/4 right-1/4 w-32 h-32 bg-cyan-400/10 blur-2xl rounded-full pointer-events-none" />
                      
                      {/* Premium sleek Back button */}
                      <button
                        onClick={handleBackToLogin}
                        style={{
                          top: `${24 * scale}px`,
                          left: `${24 * scale}px`,
                          borderRadius: `${12 * scale}px`,
                          padding: `${8 * scale}px ${16 * scale}px`,
                          gap: `${6 * scale}px`,
                          ...getFontSize(12.5)
                        }}
                        className="absolute flex items-center font-bold text-blue-600 hover:text-blue-800 bg-white/80 hover:bg-white border border-blue-100 shadow-sm active:scale-95 transition-all cursor-pointer animate-fade-in"
                      >
                        <ArrowLeft style={{ width: `${16 * scale}px`, height: `${16 * scale}px` }} />
                        <span>Back</span>
                      </button>

                      {/* Centered Placeholder Content */}
                      <div className="text-center space-y-2 animate-fade-in px-4">
                        <h1 
                          style={{
                            letterSpacing: "0.15em",
                            fontSize: `${Math.max(16, Math.round(28 * scale))}px`
                          }}
                          className="font-sans font-bold text-blue-900 uppercase opacity-40"
                        >
                          placeholder
                        </h1>
                        <p 
                          style={getFontSize(12)}
                          className="text-blue-500/60 font-medium font-sans max-w-[80%] mx-auto"
                        >
                          {currentView === "placeholder_help" && "Help & Support workflow will be integrated here."}
                          {currentView === "placeholder_privacy" && "Privacy Policy document will be loaded here."}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* FLOATING BILLING METHOD MODAL */}
                  {showAddBillingModal && (
                    <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-40 animate-fade-in">
                      <div 
                        style={{
                          borderRadius: `${24 * scale}px`,
                          padding: `${20 * scale}px`,
                        }}
                        className="bg-white text-slate-800 w-[92%] max-w-[340px] shadow-2xl border border-blue-100 flex flex-col gap-3"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <h3 style={getFontSize(14.5)} className="font-bold text-blue-950 tracking-tight flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-blue-600" /> Add Billing Method
                          </h3>
                          <button
                            onClick={() => {
                              setShowAddBillingModal(false);
                              setNewCardholderName("");
                              setNewCardNumber("");
                              setNewCardExpiry("");
                              setNewCardCVV("");
                            }}
                            className="text-slate-400 hover:text-slate-600 font-bold text-sm p-1 cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                        
                        <p style={getFontSize(10.5)} className="text-slate-500 leading-relaxed -mt-1.5">
                          Enter credit/debit card details for secure merchant processing.
                        </p>

                        {/* Inputs block */}
                        <div className="space-y-3 mt-1 text-left">
                          <div>
                            <label style={getFontSize(10.5)} className="block font-bold text-slate-600 uppercase mb-1">Card Brand</label>
                            <select
                              value={newCardBrand}
                              onChange={(e) => setNewCardBrand(e.target.value)}
                              style={{ height: `${36 * scale}px`, borderRadius: `${10 * scale}px`, ...getFontSize(12) }}
                              className="w-full bg-slate-50 border border-slate-200 px-3 font-medium text-slate-800 outline-none focus:border-blue-500 cursor-pointer"
                            >
                              <option value="Visa">Visa</option>
                              <option value="Mastercard">Mastercard</option>
                              <option value="American Express">American Express</option>
                              <option value="Discover">Discover</option>
                            </select>
                          </div>

                          <div>
                            <label style={getFontSize(10.5)} className="block font-bold text-slate-600 uppercase mb-1">Cardholder Name</label>
                            <input
                              type="text"
                              value={newCardholderName}
                              onChange={(e) => setNewCardholderName(e.target.value)}
                              placeholder="e.g. Operations Manager"
                              style={{ height: `${36 * scale}px`, borderRadius: `${10 * scale}px`, paddingLeft: `${12 * scale}px`, ...getFontSize(12) }}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-medium outline-none focus:border-blue-500 placeholder:text-slate-400"
                            />
                          </div>

                          <div>
                            <label style={getFontSize(10.5)} className="block font-bold text-slate-600 uppercase mb-1">Card Number</label>
                            <input
                              type="text"
                              value={newCardNumber}
                              onChange={(e) => {
                                let val = e.target.value.replace(/\D/g, "");
                                if (val.length > 16) val = val.slice(0, 16);
                                const matches = val.match(/\d{4,16}/g);
                                const match = (matches && matches[0]) || "";
                                const parts = [];
                                for (let i = 0, len = match.length; i < len; i += 4) {
                                  parts.push(match.substring(i, i + 4));
                                }
                                if (parts.length > 0) {
                                  setNewCardNumber(parts.join(" "));
                                } else {
                                  setNewCardNumber(val);
                                }
                              }}
                              placeholder="4111 2222 3333 4444"
                              style={{ height: `${36 * scale}px`, borderRadius: `${10 * scale}px`, paddingLeft: `${12 * scale}px`, ...getFontSize(12) }}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-mono font-medium outline-none focus:border-blue-500 placeholder:text-slate-400"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label style={getFontSize(10.5)} className="block font-bold text-slate-600 uppercase mb-1">Expiration</label>
                              <input
                                type="text"
                                value={newCardExpiry}
                                onChange={(e) => {
                                  let val = e.target.value.replace(/\D/g, "");
                                  if (val.length > 4) val = val.slice(0, 4);
                                  if (val.length >= 3) {
                                    setNewCardExpiry(`${val.slice(0, 2)}/${val.slice(2)}`);
                                  } else {
                                    setNewCardExpiry(val);
                                  }
                                }}
                                placeholder="MM/YY"
                                style={{ height: `${36 * scale}px`, borderRadius: `${10 * scale}px`, paddingLeft: `${12 * scale}px`, ...getFontSize(12) }}
                                className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-mono font-medium outline-none focus:border-blue-500 placeholder:text-slate-400"
                              />
                            </div>
                            <div>
                              <label style={getFontSize(10.5)} className="block font-bold text-slate-600 uppercase mb-1">CVV</label>
                              <input
                                type="text"
                                value={newCardCVV}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                                  setNewCardCVV(val);
                                }}
                                placeholder="123"
                                style={{ height: `${36 * scale}px`, borderRadius: `${10 * scale}px`, paddingLeft: `${12 * scale}px`, ...getFontSize(12) }}
                                className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-mono font-medium outline-none focus:border-blue-500 placeholder:text-slate-400"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2.5 mt-3">
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddBillingModal(false);
                              setNewCardholderName("");
                              setNewCardNumber("");
                              setNewCardExpiry("");
                              setNewCardCVV("");
                            }}
                            className="flex-1 py-2 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!newCardholderName || !newCardNumber || !newCardExpiry || !newCardCVV) {
                                triggerNotification("Please fill in all credit card input fields.");
                                return;
                              }
                              const id = Date.now().toString();
                              const newMethod = {
                                id,
                                cardholderName: newCardholderName,
                                cardNumber: `•••• •••• •••• ${newCardNumber.slice(-4)}`,
                                expiry: newCardExpiry,
                                cvv: "•••",
                                brand: newCardBrand
                              };
                              setBillingMethods(prev => [...prev, newMethod]);
                              setSelectedBillingMethodId(id);
                              setShowAddBillingModal(false);
                              setNewCardholderName("");
                              setNewCardNumber("");
                              setNewCardExpiry("");
                              setNewCardCVV("");
                              triggerNotification(`Added new ${newCardBrand} billing method!`);
                            }}
                            className="flex-1 py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl shadow-md transition-colors cursor-pointer"
                          >
                            Add Card
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 2 MODAL 1: SYSTEM PERMISSIONS EXPLANATION INFO POPUP */}
                  {showRoleInfoPopup && (
                    <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-30 animate-fade-in">
                      <div className="bg-white text-slate-800 rounded-3xl p-5 w-[90%] max-w-[350px] shadow-2xl border border-blue-100 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-200">
                              <Info className="w-4 h-4 text-blue-600 animate-pulse" />
                            </div>
                            <h3 className="text-sm font-extrabold text-blue-950 uppercase tracking-tight font-sans">
                              OwnersLOCAL Role Matrix
                            </h3>
                          </div>
                          <p style={getFontSize(11.5)} className="text-slate-600 leading-relaxed font-sans mb-3.5">
                            Our local operating system employs strict **Role-Based Access Control (RBAC)** guidelines. 
                            Each employee instance only renders screens and tabs associated directly with their authorized template.
                          </p>
                          <div className="bg-slate-50 border border-slate-150/50 p-2.5 rounded-2xl mb-4 space-y-1.5">
                            <p style={getFontSize(10.5)} className="font-sans font-bold text-slate-700 uppercase tracking-wider">
                              Default Access Profiles:
                            </p>
                            <div className="grid grid-cols-2 gap-1.5 font-sans">
                              <div>
                                <span className="font-bold text-[10px] text-blue-600 block">Office Manager</span>
                                <span className="text-[9px] text-slate-400">Leads, Jobs, Docs, Sched, Msg</span>
                              </div>
                              <div>
                                <span className="font-bold text-[10px] text-blue-600 block">Technician / Driver</span>
                                <span className="text-[9px] text-slate-400">Routes, Jobs, Messages, Clock</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowRoleInfoPopup(null)}
                          className="w-full py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition-all cursor-pointer font-sans"
                        >
                          I Understand
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 2 MODAL 2: CREATE CUSTOM ROLE FROM SCRATCH */}
                  {showCustomRoleModal && (
                    <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-30 animate-fade-in">
                      <form 
                        onSubmit={handleCreateCustomRole}
                        className="bg-white text-slate-800 rounded-3xl p-5 w-[90%] max-w-[340px] shadow-2xl border border-blue-100 flex flex-col gap-3"
                      >
                        <div>
                          <h3 className="text-sm font-extrabold text-blue-950 uppercase tracking-tight flex items-center gap-1.5 mb-1 font-sans">
                            <Sparkles className="w-4 h-4 text-blue-600" /> New Custom Role
                          </h3>
                          <p style={getFontSize(10.5)} className="text-slate-400 font-sans leading-relaxed">
                            Define a brand new staff category. You can custom-configure their permissions on the next screen.
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                            Role Title Name
                          </label>
                          <input
                            type="text"
                            required
                            value={customRoleName}
                            onChange={(e) => setCustomRoleName(e.target.value)}
                            placeholder="e.g., Lead Appraiser"
                            style={{ height: `${36 * scale}px`, borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                            className="w-full bg-slate-50 border border-slate-200 px-3 text-slate-800 font-sans font-bold focus:border-blue-500 focus:outline-none transition-all placeholder:text-slate-400"
                          />
                        </div>

                        <div className="flex gap-2.5 mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowCustomRoleModal(false);
                              setCustomRoleName("");
                            }}
                            className="flex-1 py-2 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="flex-1 py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl shadow-md transition-all cursor-pointer"
                          >
                            Create Role
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* STEP 2 MODAL 3: GRANULAR ROLE PERMISSION CUSTOMIZER MATRIX */}
                  {customizingRole && (
                    <RolePermissionEditorModal
                      role={customizingRole}
                      onSave={handleSaveCustomPermissions}
                      onClose={() => setCustomizingRole(null)}
                      position="absolute"
                    />
                  )}

                  {/* STEP 2 MODAL 4: SECURE GENERATED INVITE CODES PANEL */}
                  {showInvitesModal && (
                    <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-3 z-30 animate-fade-in">
                      <div className="bg-white text-slate-800 rounded-3xl p-5 w-[95%] max-w-[420px] max-h-[92%] shadow-2xl border border-blue-100 flex flex-col justify-between overflow-hidden">
                        
                        <div className="text-center shrink-0 pb-3 border-b border-slate-100">
                          <div className="mx-auto w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mb-2 shadow-sm">
                            <CheckCircle className="w-5 h-5 text-emerald-600 animate-bounce" />
                          </div>
                          <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight font-sans">
                            Staff Invites Generated!
                          </h3>
                          <p style={getFontSize(9.5)} className="text-slate-400 max-w-[85%] mx-auto font-sans font-medium mt-0.5 leading-normal">
                            Single-use activation codes are prepared. Share these with team members to onboard them securely.
                          </p>
                        </div>

                        {/* CODES LIST */}
                        <div className="flex-1 overflow-y-auto my-3 pr-1 space-y-2 scrollbar-thin scrollbar-thumb-blue-100">
                          {generatedInvites.map((inv, index) => (
                            <div 
                              key={index}
                              style={{ padding: `${8 * scale}px ${10 * scale}px`, borderRadius: `${10 * scale}px` }}
                              className="bg-slate-50 border border-slate-150/50 flex items-center justify-between gap-3 font-sans group hover:bg-slate-100/50 transition-colors"
                            >
                              <div>
                                <span className="text-[10px] font-bold text-slate-900 block font-sans">
                                  {inv.role} Profile Seat
                                </span>
                                <span className="text-[9px] font-mono font-bold text-slate-400 block uppercase">
                                  KEY: {inv.code}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(inv.code);
                                  triggerNotification(`Copied key: ${inv.code}`);
                                }}
                                className="px-2.5 py-1 text-[9.5px] font-sans font-bold text-blue-600 hover:text-blue-800 bg-white hover:bg-blue-50 border border-blue-100 rounded-lg shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3 text-blue-500" />
                                <span>Copy</span>
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* BOTTOM ACTIONS */}
                        <div className="space-y-2.5 pt-2 border-t border-slate-100 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const allCodes = generatedInvites.map(i => `${i.role}: ${i.code}`).join("\n");
                              navigator.clipboard.writeText(allCodes);
                              triggerNotification("Copied all invite keys to clipboard!");
                            }}
                            className="w-full py-2 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50/50 hover:bg-blue-50 border border-blue-100 rounded-xl transition-all cursor-pointer text-center block"
                          >
                            Copy All Invite Keys
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                if (auth.currentUser) {
                                  await setDoc(doc(db, "user_profiles", auth.currentUser.uid), {
                                    isOnboarded: true
                                  }, { merge: true });
                                }
                              } catch (err) {
                                console.error("Error setting onboarded flag:", err);
                              }
                              const ownerDashboardPerms = ["dashboard", "leads", "jobs", "customers", "messages", "scheduling", "dispatch", "timeclock", "routes", "estimates", "documents", "ai_assistant", "inventory", "settings", "training"];
                              setLoggedInUser({
                                email,
                                role: "Owner",
                                permissions: ownerDashboardPerms,
                                granularPermissions: fullAccessGranular(ownerDashboardPerms)
                              });
                              setIsLoggedIn(true);
                              setActiveScreen(OS_SCREENS[0]); // Go to dashboard
                              setShowInvitesModal(false);
                              triggerNotification("Welcome to OwnersLOCAL Dashboard!");
                            }}
                            className="w-full py-2.5 text-xs font-extrabold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:brightness-105 active:scale-[0.98] rounded-xl shadow-md transition-all cursor-pointer text-center block font-sans uppercase tracking-wider"
                          >
                            Proceed to Local OS Dashboard ➔
                          </button>
                        </div>

                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Loading spinner overlay */}
              {isSubmitting && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex flex-col items-center justify-center z-20">
                  <div className="relative flex items-center justify-center">
                    <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                    <Sparkles className="w-5 h-5 text-blue-600 absolute animate-pulse" />
                  </div>
                  <p className="text-blue-950 font-bold mt-4 text-xs md:text-sm tracking-wider font-sans animate-pulse">
                    {loginMethod === "google" && "Signing in..."}
                    {loginMethod === "password" && "Signing in..."}
                    {loginMethod === "invite" && "Verifying invite..."}
                  </p>
                </div>
              )}

              {/* SUB-MODAL 1: PASSWORD RECOVERY */}
              {showForgotPassword && (
                <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-30 animate-fade-in">
                  <div className="bg-white text-slate-800 rounded-3xl p-6 w-[90%] max-w-[340px] shadow-2xl border border-blue-100 flex flex-col">
                    <h3 className="text-sm font-bold text-blue-950 tracking-tight flex items-center gap-1.5 mb-2">
                      <Sparkles className="w-4 h-4 text-blue-600" /> Password Recovery
                    </h3>
                    
                    {!forgotSubmitted ? (
                      <>
                        <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
                          Enter your registered business email and we'll transmit a secure password recovery link.
                        </p>
                        <div className="relative mb-4">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="email"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            placeholder="Enter business email"
                            className="w-full py-2 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowForgotPassword(false);
                              setForgotEmail("");
                            }}
                            className="flex-1 py-2 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleForgotPasswordSubmit}
                            className="flex-1 py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl shadow-md transition-colors cursor-pointer"
                          >
                            Send Link
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-2">
                        <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                        <p className="text-xs font-bold text-slate-800 mb-1">Transmission Transmitted!</p>
                        <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">
                          If {forgotEmail} is in our system registry, you will receive a code shortly.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setShowForgotPassword(false);
                            setForgotSubmitted(false);
                            setForgotEmail("");
                          }}
                          className="w-full py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl transition-colors cursor-pointer"
                        >
                          Return to Terminal
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUB-MODAL 2: NEED HELP? */}
              {showHelpDialog && (
                <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-30 animate-fade-in">
                  <div className="bg-white text-slate-800 rounded-3xl p-5 w-[90%] max-w-[340px] shadow-2xl border border-blue-100">
                    <h3 className="text-sm font-bold text-blue-950 tracking-tight flex items-center gap-1.5 mb-2">
                      <HelpCircle className="w-4 h-4 text-blue-600" /> OwnersLOCAL Support Desk
                    </h3>
                    <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
                      Need help accessing the Local OS platform? Here are your secure options:
                    </p>
                    <div className="space-y-2 mb-4">
                      <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-100 text-[10px] text-blue-950">
                        <span className="font-bold">Password Log In:</span> Use your primary corporate email and registered password to log in.
                      </div>
                      <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-100 text-[10px] text-blue-950">
                        <span className="font-bold">Employee Invite Log In:</span> Use a custom invite code generated in settings.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowHelpDialog(false)}
                      className="w-full py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl transition-colors cursor-pointer"
                    >
                      Dismiss Desk
                    </button>
                  </div>
                </div>
              )}

              {/* SUB-MODAL 3: PRIVACY POLICY */}
              {showPrivacyDialog && (
                <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-30 animate-fade-in">
                  <div className="bg-white text-slate-800 rounded-3xl p-5 w-[90%] max-w-[340px] shadow-2xl border border-blue-100">
                    <h3 className="text-sm font-bold text-blue-950 tracking-tight flex items-center gap-1.5 mb-2">
                      <Shield className="w-4 h-4 text-emerald-600" /> Platform Privacy Protocol
                    </h3>
                    <p className="text-[10px] text-slate-500 leading-relaxed space-y-2 max-h-[160px] overflow-y-auto pr-1 mb-4">
                      <span>We use industry-standard AES-256 encryption to protect your business data.</span>
                      <br /><br />
                      <span>Information stored locally stays on this device. Your password is not sent to outside services.</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowPrivacyDialog(false)}
                      className="w-full py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl transition-colors cursor-pointer"
                    >
                      Acknowledge & Close
                    </button>
                  </div>
                </div>
              )}

              {/* SUB-MODAL 5: SIGN UP INSTRUCTIONS WITH REAL FIREBASE AUTH */}
              {showSignUpInstructions && (
                <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4 z-30 animate-fade-in">
                  <div className="bg-white text-slate-800 rounded-3xl p-5 w-[90%] max-w-[340px] shadow-2xl border border-blue-100 flex flex-col justify-between max-h-[92%] overflow-y-auto font-sans">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-blue-50 text-blue-600 rounded-xl">
                          <UserPlus className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-blue-950 tracking-tight uppercase">
                            Gateway Registration
                          </h3>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                            Establish Secure Node
                          </p>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 mb-4 leading-relaxed font-semibold">
                        Register your business to activate a secure cloud gateway database node. Verification is required before access is granted.
                      </p>

                      <form onSubmit={handleOwnerSignUp} className="space-y-3">
                        {/* OWNER NAME */}
                        <div>
                          <label className="block text-[9.5px] font-bold text-blue-900/80 uppercase tracking-wider mb-1">
                            Owner Full Name
                          </label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-800/50" />
                            <input
                              type="text"
                              required
                              value={signUpInstructionsOwnerName}
                              onChange={(e) => setSignUpInstructionsOwnerName(e.target.value)}
                              placeholder="e.g. John Doe"
                              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-semibold focus:outline-none transition-all placeholder:text-slate-300"
                            />
                          </div>
                        </div>

                        {/* BUSINESS NAME */}
                        <div>
                          <label className="block text-[9.5px] font-bold text-blue-900/80 uppercase tracking-wider mb-1">
                            Business Name
                          </label>
                          <div className="relative">
                            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-800/50" />
                            <input
                              type="text"
                              required
                              value={signUpInstructionsBusinessName}
                              onChange={(e) => setSignUpInstructionsBusinessName(e.target.value)}
                              placeholder="e.g. Ironclad Plumbing"
                              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-semibold focus:outline-none transition-all placeholder:text-slate-300"
                            />
                          </div>
                        </div>

                        {/* BUSINESS EMAIL */}
                        <div>
                          <label className="block text-[9.5px] font-bold text-blue-900/80 uppercase tracking-wider mb-1">
                            Business Email
                          </label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-800/50" />
                            <input
                              type="email"
                              required
                              value={signUpInstructionsEmail}
                              onChange={(e) => setSignUpInstructionsEmail(e.target.value)}
                              placeholder="e.g. owner@ironclad.com"
                              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-semibold focus:outline-none transition-all placeholder:text-slate-300"
                            />
                          </div>
                        </div>

                        {/* PASSWORD */}
                        <div>
                          <label className="block text-[9.5px] font-bold text-blue-900/80 uppercase tracking-wider mb-1">
                            Create Passcode
                          </label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-800/50" />
                            <input
                              type="password"
                              required
                              value={signUpInstructionsPassword}
                              onChange={(e) => setSignUpInstructionsPassword(e.target.value)}
                              placeholder="••••••••"
                              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-semibold focus:outline-none transition-all placeholder:text-slate-300"
                            />
                          </div>
                        </div>

                        {signUpInstructionsError && (
                          <p className="text-[9px] text-rose-600 font-bold bg-rose-50 p-2 rounded-lg border border-rose-200/50 animate-pulse leading-snug">
                            {signUpInstructionsError}
                          </p>
                        )}

                        <div className="flex gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowSignUpInstructions(false);
                              setSignUpInstructionsError("");
                            }}
                            className="flex-1 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer text-center"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isSignUpSubmitting}
                            className="flex-1 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer text-center disabled:opacity-50"
                          >
                            {isSignUpSubmitting ? "Registering..." : "Sign Up"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              )}



            </div>

          </div>
        ) : (
          
          /* VIEW 2: THE INTERACTIVE SHOWCASE OPERATING SYSTEM */
          <div 
            style={{
              borderRadius: "24px"
            }}
            className="w-full h-[calc(100vh-100px)] min-h-[650px] bg-[#EAF5FF] border border-[#9EC8EF] overflow-hidden flex flex-row shadow-2xl relative animate-scale-up select-none max-w-7xl mx-auto workspace-theme"
          >
            
            {/* COLLAPSIBLE LEFT NAV MENU */}
            <div 
              style={{
                width: isSidebarCollapsed ? "72px" : "240px",
                backgroundColor: "#C7E3FA",
                transition: "width 0.2s ease-in-out"
              }}
              className="flex flex-col border-r border-[#9EC8EF] text-[#1F3557] shrink-0 relative"
            >
              {/* Menu Header with Badges */}
              <div className="p-4 border-b border-[#9EC8EF] flex flex-col gap-2 relative">
                <div className="flex items-center justify-between">
                  {!isSidebarCollapsed ? (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-[#4A86F7] text-white flex items-center justify-center shadow-md shrink-0">
                        <BrandIcon className="w-full h-full" />
                      </div>
                      <span className="font-sans font-black tracking-tight text-sm text-[#1F3557] select-none">OwnersLOCAL</span>
                      <span className="text-[7.5px] px-1.5 py-0.5 bg-[#4A86F7]/10 text-[#1F3557] rounded font-black uppercase tracking-wider select-none">Local OS</span>
                    </div>
                  ) : (
                    <div className="mx-auto w-8 h-8 rounded-lg bg-[#4A86F7] text-white flex items-center justify-center shadow-md">
                      <BrandIcon className="w-full h-full" />
                    </div>
                  )}

                  {/* Collapse/Expand Toggle Button - ALWAYS visible on the right border! */}
                  <button
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    style={{
                      width: "24px",
                      height: "24px",
                    }}
                    className="absolute -right-3 top-5 bg-[#4A86F7] hover:bg-[#3977EE] border border-[#9EC8EF] rounded-full flex items-center justify-center text-white shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer z-20"
                    title={isSidebarCollapsed ? "Expand Menu" : "Collapse Menu"}
                  >
                    {isSidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Plain Text Business Name Header below Badges */}
                {!isSidebarCollapsed && (
                  <div className="mt-2.5 px-0.5 animate-fade-in text-left">
                    <p className="font-sans font-black text-xs text-[#1F3557] tracking-wider uppercase leading-normal">
                      {businessNames?.[0] || "Your Business"}
                    </p>
                  </div>
                )}
              </div>

              {/* Dynamic Menu List (Role-Based Visibility) */}
              <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1 scrollbar-none">
                {getVisibleScreens().filter(screen => screen.id !== "owner_console").map((screen) => {
                  const isCurrent = activeScreen.id === screen.id;
                  // Calculate unread count for this screen
                  const unreadCount = notifications.filter(n => n.screenId === screen.id && !n.isRead).length;

                  return (
                    <button
                      key={screen.id}
                      onClick={() => {
                        setActiveScreen(screen);
                        setNotifications(prev => prev.map(n => n.screenId === screen.id ? { ...n, isRead: true } : n));
                        triggerNotification(`Navigated to: ${screen.label}`);
                      }}
                      className={`w-full rounded-xl transition-all duration-200 cursor-pointer flex items-center relative group ${
                        isSidebarCollapsed ? "justify-center p-2" : "px-3 py-2"
                      } ${
                        isCurrent
                          ? "bg-[#A9CEF5] text-[#1F3557] font-bold shadow-sm"
                          : "hover:bg-[#BDDDF8] text-[#5E7393] hover:text-[#1F3557] border border-transparent"
                      }`}
                      title={screen.label}
                    >
                      {isSidebarCollapsed ? (
                        /* Only show menu icons when collapsed */
                        <span className={`shrink-0 select-none ${isCurrent ? "text-[#1F3557]" : "text-[#5E7393] group-hover:text-[#1F3557]"}`}>
                          {getScreenIcon(screen.id, "w-[18px] h-[18px] text-current")}
                        </span>
                      ) : (
                        /* Show both icon and label when expanded */
                        <div className="flex items-center gap-2.5 w-full min-w-0">
                          <span className={`shrink-0 select-none ${isCurrent ? "text-[#1F3557]" : "text-[#5E7393] group-hover:text-[#1F3557]"}`}>
                            {getScreenIcon(screen.id, "w-[18px] h-[18px] text-current")}
                          </span>
                          <span className={`font-sans font-bold tracking-wide text-xs flex-1 text-left truncate ${isCurrent ? "text-[#1F3557]" : "text-[#5E7393] group-hover:text-[#1F3557]"}`}>
                            {screen.label}
                          </span>
                        </div>
                      )}
                      
                      {/* Badge for AI Assistant */}
                      {!isSidebarCollapsed && screen.badge && (
                        <span className="text-[7.5px] bg-[#1F3557]/10 text-[#1F3557] px-1 py-0.5 rounded font-black tracking-wider uppercase select-none">
                          {screen.badge}
                        </span>
                      )}

                      {/* Subtle red notification dot next to menu item (no count, extremely refined!) */}
                      {unreadCount > 0 && (
                        <span className="absolute top-2 right-2 flex h-2 w-2 items-center justify-center rounded-full bg-red-500 ring-1 ring-white" />
                      )}
                    </button>
                  );
                })}

                {/* Workspace Simulator Card - Styled with soft outline and NO solid white card */}
                {!isSidebarCollapsed && !loggedInUser?.isEmployee && (
                  <div className="mx-1 my-3 p-4 bg-[#1F3557]/5 border border-[#1F3557]/10 rounded-2xl flex flex-col gap-1.5 text-left animate-fade-in">
                    <p className="text-[8.5px] font-black text-[#1F3557]/80 uppercase tracking-wider">WORKSPACE SIMULATOR</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-[#1F3557]">Owner Experience</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#1F3557]" />
                    </div>
                    <p className="text-[10px] text-[#1F3557]/60 leading-relaxed font-sans font-medium">
                      Instantly switch roles to preview permission-guarded tools.
                    </p>
                  </div>
                )}
              </div>

              {/* Bottom profile info block */}
              <div className="p-3 border-t border-[#9EC8EF] bg-transparent flex flex-col gap-2 relative">
                
                {/* Notification Panel Popover */}
                {showNotificationPanel && (
                  <div className="absolute bottom-16 left-4 right-4 bg-[#C7E3FA] text-[#1F3557] rounded-2xl p-4 shadow-2xl border border-[#9EC8EF] z-50 flex flex-col max-h-[300px] overflow-hidden animate-slide-up">
                    <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <BellRing className="w-4 h-4 text-red-500 animate-bounce" />
                        <span className="text-xs font-black text-[#1F3557] uppercase tracking-wider">Operational Alerts</span>
                      </div>
                      <button 
                        onClick={() => setShowNotificationPanel(false)}
                        className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold"
                      >
                        ✕
                      </button>
                    </div>
                    
                    {/* List of active notifications */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                      {notifications.length === 0 ? (
                        <div className="text-center py-6 text-[#5E7393] text-xs font-sans">
                          No pending alerts. Clear board!
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <div 
                            key={notif.id} 
                            onClick={() => {
                              // Mark as read
                              setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
                              if (notif.screenId) {
                                const matched = OS_SCREENS.find(s => s.id === notif.screenId);
                                if (matched) setActiveScreen(matched);
                              }
                              triggerNotification(`Viewed alert: ${notif.title}`);
                            }}
                            className={`p-2 rounded-xl text-left border transition-all cursor-pointer hover:bg-[#BDDDF8] ${
                              notif.isRead 
                                ? "bg-[#EAF5FF] border-[#9EC8EF] text-[#5E7393]" 
                                : "bg-[#BDDDF8] border-[#9EC8EF] font-semibold text-[#1F3557]"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] uppercase font-black tracking-wider text-[#4A86F7]">{notif.title}</span>
                              <span className="text-[8px] text-[#5E7393] font-mono">{notif.time}</span>
                            </div>
                            <p className="text-[10px] mt-0.5 leading-normal truncate">{notif.description}</p>
                          </div>
                        ))
                      )}
                    </div>
                    
                    <div className="border-t border-[#9EC8EF] pt-2 flex items-center justify-between text-[10px] mt-2 font-bold">
                      <button 
                        onClick={() => {
                          setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
                          triggerNotification("Marked all alerts as read");
                        }}
                        className="text-[#4A86F7] hover:underline cursor-pointer"
                      >
                        Mark all read
                      </button>
                      <button 
                        onClick={() => {
                          setNotifications([]);
                          triggerNotification("Cleared all alert logs");
                        }}
                        className="text-red-500 hover:underline cursor-pointer"
                      >
                        Clear all
                      </button>
                    </div>
                  </div>
                )}

                <div className={`flex ${isSidebarCollapsed ? "flex-col items-center gap-2.5" : "items-center gap-2 justify-between"} overflow-hidden`}>
                  <div className={`flex ${isSidebarCollapsed ? "flex-col items-center" : "items-center gap-2"} min-w-0`}>
                    <div className="w-10 h-10 rounded-full bg-[#A9CEF5] text-[#1F3557] flex items-center justify-center text-xs font-black shrink-0 border border-[#9EC8EF] uppercase select-none">
                      {loggedInUser?.name ? loggedInUser.name.slice(0, 2) : (loggedInUser?.role === "Owner" ? "SJ" : "EM")}
                    </div>
                    {!isSidebarCollapsed && (
                      <div className="flex-1 min-w-0 animate-fade-in text-left">
                        <p className="text-xs font-sans font-extrabold text-[#1F3557] truncate leading-tight">
                           {loggedInUser?.name || (loggedInUser?.email ? loggedInUser.email.split("@")[0] : "waterdrops2001")}
                        </p>
                        <div 
                          className="flex items-center gap-1.5 mt-0.5 cursor-pointer hover:opacity-80"
                          onClick={() => {
                            const actRole = simulatedRole || loggedInUser?.role || "Owner";
                            if (actRole === "Owner") {
                              const scr = OS_SCREENS.find((s) => s.id === "owner_console");
                              if (scr) {
                                setActiveScreen(scr);
                                triggerNotification("🔑 Secure shortcut activated: Entering Owner Control Console.");
                              }
                            }
                          }}
                          title={ (simulatedRole || loggedInUser?.role || "Owner") === "Owner" ? "Launch Owner Console" : undefined }
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <p className="text-[10px] font-mono text-[#1F3557]/60 truncate uppercase tracking-wider leading-none">
                            {simulatedRole || loggedInUser?.role || "Owner"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions Block: Notification Bell + Redo Onboarding Trigger + Sign out */}
                  <div className={`flex items-center gap-1.5 ${isSidebarCollapsed ? "flex-col w-full mt-1.5" : ""}`}>
                    {/* Notification bell button */}
                    <button
                      onClick={() => setShowNotificationPanel(!showNotificationPanel)}
                      className="relative p-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[#315C9F] transition-all cursor-pointer flex items-center justify-center"
                      title="Alert Center"
                    >
                      <Bell className="w-3.5 h-3.5 text-[#315C9F]" />
                      
                      {/* Quiet red notification dot */}
                      {notifications.some(n => !n.isRead) && (
                        <span className="absolute top-1 right-1 flex h-1.5 w-1.5 items-center justify-center rounded-full bg-red-500" />
                      )}
                    </button>

                    {/* Redo Onboarding reset simulation */}
                    <button
                      onClick={() => {
                        setCurrentView("login");
                        setIsLoggedIn(false);
                        triggerNotification("System onboarding sequence re-triggered!");
                      }}
                      className="p-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[#315C9F] transition-all cursor-pointer flex items-center justify-center"
                      title="Redo Onboarding Sequence"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>

                    {/* Standard Sign out */}
                    <button
                      onClick={handleLogout}
                      className="p-1.5 bg-[#EAF5FF] hover:bg-rose-100/50 border border-[#9EC8EF] hover:border-rose-200 rounded-xl text-[#315C9F] hover:text-rose-600 transition-all cursor-pointer flex items-center justify-center"
                      title="Sign Out Session"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* MAIN APP BODY CONTENT AREA */}
            <div className="flex-1 flex flex-col min-w-0 min-h-[640px] overflow-hidden relative bg-[#EAF5FF]">
              
              {/* Workspace Top Toolbar Header */}
              {activeScreen.id !== "dashboard" && (
                <div className="px-5 py-3 border-b border-[#9EC8EF] bg-[#C7E3FA] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-[#5E7393] uppercase font-mono tracking-wider">Workspace:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-extrabold text-[#1F3557] bg-[#EAF5FF] border border-[#9EC8EF] px-2.5 py-1 rounded-xl">
                      {activeScreen.label}
                    </span>
                  </div>

                  {/* Simulated Role Dropdown (Only visible to Owners) */}
                  {loggedInUser?.role === "Owner" && (
                    <div className="relative flex items-center gap-1.5 ml-2 pl-2 border-l border-[#9EC8EF]">
                      <span className="text-[9px] text-[#5E7393] font-mono">SIMULATION:</span>
                      <select
                        value={simulatedRole || "Owner"}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSimulatedRole(val === "Owner" ? null : val);
                          triggerNotification(`Simulating permissions for: ${val}`);
                        }}
                        className="text-[10px] font-extrabold text-[#1F3557] bg-[#EAF5FF] hover:bg-[#EAF5FF]/80 border border-[#9EC8EF] rounded-lg px-2 py-0.5 focus:outline-none cursor-pointer"
                      >
                        <option value="Owner">Owner (View All 17)</option>
                        <option value="Office Manager">Office Manager (View 11)</option>
                        <option value="Technician">Technician</option>
                        <option value="Salesperson">Sales Representative</option>
                        <option value="Driver">Driver / Installer</option>
                      </select>
                    </div>
                  )}
                </div>

              </div>
              )}

              {/* RENDER DYNAMIC SECTION */}
              {(

                /* LIVE RESPONSIVE OPERATIONAL WORKSPACE (Custom implementation of all views!) */
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-thin">

                  {simulatedRole && (
                    <div className="sticky top-0 z-40 bg-amber-500 text-amber-950 rounded-2xl px-4 py-2.5 shadow-lg flex items-center justify-between gap-3 font-bold text-xs">
                      <span>⚠️ PREVIEWING AS "{simulatedRole}" — some tabs and data are hidden to match that role's real permissions. This is not your real Owner view.</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSimulatedRole(null);
                          triggerNotification("Exited simulation — back to your real Owner view.");
                        }}
                        className="shrink-0 px-3 py-1 bg-amber-950 text-amber-50 rounded-lg text-[10.5px] uppercase tracking-wide cursor-pointer hover:bg-amber-900"
                      >
                        Exit Simulation
                      </button>
                    </div>
                  )}

                  {activeScreen.id === "dashboard" ? ( (() => {
                    // NOTE: there's no persisted pay-period hours ledger yet (TimeClockPage logs
                    // individual clock in/out events but nothing here aggregates them into a
                    // pay-period total) — this only reflects the current live clock-in session,
                    // not fabricated baseline hours.
                    const totalHours = (clockInDuration / 3600).toFixed(1);
                    const isAuthorizedToCustomize = ["Owner", "General Manager", "Office Manager", "Operations Manager", "Accountant / Bookkeeper", "Accountant"].includes(simulatedRole || loggedInUser?.role || "Owner");

                    // Keep the dashboard widget on the exact same selected period and
                    // financial series as the Revenue page graph.
                    const getDashboardGraphData = () => getRevenueChartData(revenuePageFilter, revenueEvents, transactions).series;
                    const dashboardFinancials = getRevenueChartData(revenuePageFilter, revenueEvents, transactions);
                    const dashboardNetRevenue = dashboardFinancials.currentTotal - dashboardFinancials.currentExpenseTotal;

                    // Renders card by slot target ID
                    const renderCardSlot = (targetId: string, slotLabel: string) => {
                      switch (targetId) {
                        case "revenue":
                          {
                            const activeRoleVal = simulatedRole || loggedInUser?.role || "Owner";
                            const isFinAuthorized = ["Owner", "Admin", "Administrator", "General Manager", "Office Manager", "Accountant", "Accountant / Bookkeeper"].includes(activeRoleVal);
                            return (
                              <div 
                                key={slotLabel}
                                onClick={() => {
                                  if (!isFinAuthorized) {
                                    triggerNotification("⚠️ Access Denied: Financial metrics are restricted to Owners/Admins.");
                                    logOperationalEvent("Security Violation", `User with role ${activeRoleVal} attempted to navigate to financial details via dashboard widget`, "🚨");
                                    return;
                                  }
                                  const matched = OS_SCREENS.find(s => s.id === "revenue");
                                  if (matched) setActiveScreen(matched);
                                  triggerNotification("Navigated to Revenue details");
                                }}
                                className="bg-[#C7E3FA] border border-[#9EC8EF] p-4 rounded-[24px] shadow-sm flex flex-col justify-between h-[240px] transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer relative text-left"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 text-[#1F3557]">
                                    {getScreenIcon("revenue", "w-4 h-4 text-[#315C9F]")}
                                    <span className="text-[10px] font-black tracking-wider uppercase">COMPANY REVENUE</span>
                                  </div>
                                  <span className="text-[8px] bg-[#315C9F]/10 text-[#315C9F] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                    {revenuePageFilter}
                                  </span>
                                </div>
                                
                                <div className="my-1 text-left">
                                  <p className="text-lg font-sans font-black text-[#1F3557] tracking-tight leading-none">
                                    {isFinAuthorized ? (
                                      <>
                                        {`${dashboardNetRevenue < 0 ? "-" : ""}$${Math.abs(dashboardNetRevenue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                      </>
                                    ) : (
                                      <span className="text-sm font-sans font-extrabold text-red-600 bg-red-100 px-2 py-0.5 rounded-md border border-red-200">
                                        [REDACTED - OWNER ONLY]
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-[9px] text-[#5E7393] font-bold mt-0.5">Live Income vs Expenses & Taxes</p>
                                </div>

                                <div className="flex-1 w-full min-h-[100px] mt-2 relative">
                                  {isFinAuthorized ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                      <LineChart data={getDashboardGraphData()} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#9EC8EF" vertical={false} />
                                        <XAxis
                                          dataKey="time"
                                          stroke="#5E7393"
                                          fontSize={8}
                                          tickLine={false}
                                          axisLine={false}
                                          className="font-mono"
                                        />
                                        <YAxis
                                          stroke="#5E7393"
                                          fontSize={8}
                                          tickLine={false}
                                          axisLine={false}
                                          className="font-mono"
                                        />
                                        <Line
                                          type="monotone"
                                          dataKey="Revenue"
                                          stroke="#22C55E"
                                          strokeWidth={1.5}
                                          dot={{ r: 1 }}
                                          activeDot={{ r: 3 }}
                                          name="Revenue"
                                        />
                                        <Line
                                          type="monotone"
                                          dataKey="Expenses"
                                          stroke="#F43F5E"
                                          strokeWidth={1.5}
                                          dot={{ r: 1 }}
                                          activeDot={{ r: 3 }}
                                          name="Expenses"
                                        />
                                        <Line
                                          type="monotone"
                                          dataKey="Profit"
                                          stroke="#4A86F7"
                                          strokeWidth={1.5}
                                          dot={{ r: 1 }}
                                          activeDot={{ r: 3 }}
                                          name="Profit"
                                        />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950/5 border border-dashed border-red-300 rounded-2xl p-2 text-center">
                                      <span className="text-lg">🔒</span>
                                      <p className="text-[10px] font-sans font-bold text-red-700 mt-1 uppercase tracking-wider">Financial Visualization Locked</p>
                                      <p className="text-[8px] text-slate-500 font-sans mt-0.5 font-medium leading-tight">Your current role ({activeRoleVal}) does not have permissions to view business ledger streams.</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }
                        case "leads":
                          return (
                            <div 
                              key={slotLabel}
                              onClick={() => {
                                const matched = OS_SCREENS.find(s => s.id === "leads");
                                if (matched) setActiveScreen(matched);
                                triggerNotification("Navigated to Leads Center");
                              }}
                              className="bg-[#C7E3FA] border border-[#9EC8EF] p-4 rounded-[24px] shadow-sm flex flex-col justify-between h-[240px] transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer text-left"
                            >
                              <div className="flex items-center gap-1.5 text-[#1F3557]">
                                {getScreenIcon("leads", "w-4 h-4 text-[#315C9F]")}
                                <span className="text-[10px] font-black tracking-wider uppercase">ACTIVE LEADS</span>
                              </div>
                              
                              <div className="my-1.5 text-left flex-1 flex flex-col justify-between">
                                <div>
                                  <p className="text-xl font-sans font-black text-[#1F3557] tracking-tight leading-none">{leads.length} Leads</p>
                                  <p className="text-[9px] text-[#5E7393] font-bold mt-1">Adjusted from connected sources</p>
                                </div>

                                <div className="space-y-1 my-3 text-[10px] text-[#1F3557]/85 font-semibold">
                                  {leads.length === 0 ? (
                                    <p className="text-[9px] text-[#5E7393]/70 italic">No active leads yet.</p>
                                  ) : (
                                    [...leads]
                                      .sort((a, b) => (a.addedDaysAgo ?? 0) - (b.addedDaysAgo ?? 0))
                                      .slice(0, 3)
                                      .map((lead) => (
                                        <div key={lead.id} className="flex items-center justify-between border-b border-blue-200/40 pb-1 last:border-b-0">
                                          <span className="flex items-center gap-1 text-[#1F3557]/90 truncate">👤 {lead.name}</span>
                                          <span className="bg-[#315C9F]/10 text-[#315C9F] px-1.5 py-0.2 rounded text-[8px] font-bold shrink-0">{lead.source}</span>
                                        </div>
                                      ))
                                  )}
                                </div>

                                <span className="text-[8.5px] uppercase tracking-wider font-black text-[#315C9F] flex items-center gap-1 mt-1">
                                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                                  Active Live CRM Sync OK
                                </span>
                              </div>
                            </div>
                          );
                        case "scheduling": {
                          const todayStr = `${liveTime.getFullYear()}-${String(liveTime.getMonth() + 1).padStart(2, "0")}-${String(liveTime.getDate()).padStart(2, "0")}`;
                          const todayEvents = schedulingEvents.filter(e => e.date === todayStr);
                          return (
                            <div 
                              key={slotLabel}
                              onClick={() => {
                                const matched = OS_SCREENS.find(s => s.id === "scheduling");
                                if (matched) setActiveScreen(matched);
                                triggerNotification("Navigated to Schedule calendar");
                              }}
                              className="bg-[#C7E3FA] border border-[#9EC8EF] p-4 rounded-[24px] shadow-sm flex flex-col justify-between h-[240px] transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer text-left"
                            >
                              <div className="flex items-center gap-1.5 text-[#1F3557]">
                                {getScreenIcon("scheduling", "w-4 h-4 text-[#315C9F]")}
                                <span className="text-[10px] font-black tracking-wider uppercase">ACTIVE JOBS TODAY</span>
                              </div>
                              
                              <div className="my-1.5 text-left flex-1 flex flex-col justify-between">
                                <div>
                                  <p className="text-xl font-sans font-black text-[#1F3557] tracking-tight leading-none">{todayEvents.length} Jobs Scheduled</p>
                                  <p className="text-[9px] text-[#5E7393] font-bold mt-1">Populated from monthly calendar</p>
                                </div>

                                <div className="space-y-1.5 my-3 text-[9.5px] font-semibold text-[#1F3557]/85">
                                  {todayEvents.slice(0, 3).map((e) => (
                                    <div key={e.id} className="flex items-center gap-1.5 truncate">
                                      <span className="w-1.5 h-1.5 bg-[#315C9F]/40 rounded-full shrink-0" />
                                      <span className="font-mono text-[8px] text-[#5E7393]">{e.startTime}</span>
                                      <span className="truncate text-[#1F3557]/90 font-bold">{e.notes || e.eventType} - {e.customer}</span>
                                    </div>
                                  ))}
                                  {todayEvents.length === 0 && (
                                    <p className="text-[10px] text-slate-500 italic">No events scheduled for today</p>
                                  )}
                                </div>

                                <span className="text-[8.5px] uppercase tracking-wider font-black text-[#315C9F] hover:underline">
                                  View Interactive Calendar ➔
                                </span>
                              </div>
                            </div>
                          );
                        }
                        case "fleet":
                          return (
                            <div 
                              key={slotLabel}
                              onClick={() => {
                                const matched = OS_SCREENS.find(s => s.id === "routes");
                                if (matched) setActiveScreen(matched);
                                triggerNotification("Navigated to Fleet Routes");
                              }}
                              className="bg-[#C7E3FA] border border-[#9EC8EF] p-4 rounded-[24px] shadow-sm flex flex-col justify-between h-[240px] transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer text-left"
                            >
                              <div className="flex items-center gap-1.5 text-[#1F3557]">
                                {getScreenIcon("dispatch", "w-4 h-4 text-[#315C9F]")}
                                <span className="text-[10px] font-black tracking-wider uppercase">FLEET TELEMETRY</span>
                              </div>
                              
                              <div className="my-1.5 text-left flex-1 flex flex-col justify-between">
                                <div>
                                  <p className="text-xl font-sans font-black text-[#1F3557] tracking-tight leading-none">3 Drivers Online</p>
                                  <p className="text-[9px] text-[#5E7393] font-bold mt-1">GPX Navigation tracking active</p>
                                </div>

                                <div className="space-y-1.5 my-3 text-[9.5px] font-semibold text-[#1F3557]/85">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[#1F3557]/90 font-bold">Truck #1 (John D.)</span>
                                    <span className="text-[#5E7393] font-mono text-[8.5px]">En Route</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[#1F3557]/90 font-bold">Truck #2 (Pete M.)</span>
                                    <span className="text-[#315C9F] font-mono text-[8.5px]">On Site</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[#1F3557]/90 font-bold">Truck #3 (Sarah T.)</span>
                                    <span className="text-[#5E7393] font-mono text-[8.5px]">Staged</span>
                                  </div>
                                </div>

                                <span className="text-[8.5px] uppercase tracking-wider font-black text-[#315C9F]">
                                  GPS tracking connected
                                </span>
                              </div>
                            </div>
                          );
                        case "messages":
                          return (
                            <div 
                              key={slotLabel}
                              onClick={() => {
                                const matched = OS_SCREENS.find(s => s.id === "messages");
                                if (matched) setActiveScreen(matched);
                                triggerNotification("Navigated to Messages Board");
                              }}
                              className="bg-[#C7E3FA] border border-[#9EC8EF] p-4 rounded-[24px] shadow-sm flex flex-col justify-between h-[240px] transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer text-left"
                            >
                              <div className="flex items-center gap-1.5 text-[#1F3557]">
                                {getScreenIcon("messages", "w-4 h-4 text-[#315C9F]")}
                                <span className="text-[10px] font-black tracking-wider uppercase">MESSAGES FEED</span>
                              </div>
                              
                              <div className="my-1.5 text-left flex-1 flex flex-col justify-between">
                                <div>
                                  <p className="text-xl font-sans font-black text-[#1F3557] tracking-tight leading-none">{dashboardConversations.reduce((s: number, c: any) => s + (c.unreadCount || 0), 0)} Unread Chats</p>
                                  <p className="text-[9px] text-[#5E7393] font-bold mt-1">{dashboardConversations.length} conversation{dashboardConversations.length === 1 ? "" : "s"} total</p>
                                </div>

                                {dashboardConversations.length === 0 ? (
                                  <p className="text-[9px] text-[#5E7393] font-sans font-semibold my-2">No conversations yet.</p>
                                ) : (
                                  <div className="space-y-1.5 my-2 text-[9px] text-[#1F3557]/85 leading-normal">
                                    {[...dashboardConversations]
                                      .sort((a: any, b: any) => (b.lastMessageTime || "").localeCompare(a.lastMessageTime || ""))
                                      .slice(0, 2)
                                      .map((c: any) => (
                                        <p key={c.id} className="border-l-2 border-[#315C9F] pl-1.5 font-sans font-semibold truncate">
                                          <strong className="text-[#1F3557]">{c.lastMessageSender || c.title}:</strong> "{c.lastMessage || "No messages yet"}"
                                        </p>
                                      ))}
                                  </div>
                                )}

                                {dashboardConversations.some((c: any) => (c.unreadCount || 0) > 0) && (
                                  <span className="text-[8.5px] uppercase tracking-wider font-black text-[#315C9F] flex items-center gap-1 mt-1">
                                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                                    New Messages Available
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        case "inventory": {
                          const lowStockItems = inventoryList
                            .filter(i => i.quantity <= i.minQuantity)
                            .sort((a, b) => (a.quantity - a.minQuantity) - (b.quantity - b.minQuantity));
                          return (
                            <div
                              key={slotLabel}
                              onClick={() => {
                                const matched = OS_SCREENS.find(s => s.id === "inventory");
                                if (matched) setActiveScreen(matched);
                                triggerNotification("Navigated to Inventory ledger");
                              }}
                              className="bg-[#C7E3FA] border border-[#9EC8EF] p-4 rounded-[24px] shadow-sm flex flex-col justify-between h-[240px] transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer text-left"
                            >
                              <div className="flex items-center gap-1.5 text-[#1F3557]">
                                {getScreenIcon("inventory", "w-4 h-4 text-[#315C9F]")}
                                <span className="text-[10px] font-black tracking-wider uppercase">INVENTORY MONITORS</span>
                              </div>

                              <div className="my-1.5 text-left flex-1 flex flex-col justify-between">
                                <div>
                                  <p className="text-xl font-sans font-black text-[#1F3557] tracking-tight leading-none">{lowStockItems.length} Alert{lowStockItems.length === 1 ? "" : "s"} Active</p>
                                  <p className="text-[9px] text-[#5E7393] font-bold mt-1">{inventoryList.length} item{inventoryList.length === 1 ? "" : "s"} on file</p>
                                </div>

                                {lowStockItems.length === 0 ? (
                                  <p className="text-[9.5px] text-[#5E7393]/70 italic my-3">
                                    {inventoryList.length === 0 ? "No inventory items yet." : "All items above their minimum quantity."}
                                  </p>
                                ) : (
                                  <div className="space-y-1.5 my-3 text-[9.5px] font-semibold text-[#1F3557]/85">
                                    {lowStockItems.slice(0, 2).map(item => (
                                      <div key={item.id} className="flex items-center justify-between text-[#1F3557]/90">
                                        <span className="flex items-center gap-1 truncate">
                                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.quantity === 0 ? "bg-red-500" : "bg-[#F59E0B]"}`} />
                                          <span className="truncate">{item.name}</span>
                                        </span>
                                        <span className="shrink-0">Qty: {item.quantity}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {lowStockItems.length > 0 && (
                                  <span className="text-[8.5px] uppercase tracking-wider font-black text-[#315C9F] hover:underline">
                                    Review low stock ➔
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        }
                        default:
                          return null;
                      }
                    };

                    return (
                      <>
                      <div className="flex justify-end">
                        <PlaidConnectButton />
                      </div>
                      <div className="flex-1 flex flex-col gap-5 animate-fade-in text-[#1F3557]">
                        
                        {/* TEAM MEMBER TERMINAL (Top side-to-side card) */}
                        <div className="w-full bg-[#C7E3FA] border border-[#9EC8EF] p-5 rounded-[24px] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden text-left">
                          {/* Left contents */}
                          <div className="text-left space-y-1 bg-transparent border-none p-0 shadow-none">
                            <div className="flex items-center gap-1.5 text-[10px] font-black text-[#1F3557] uppercase tracking-wider">
                              <Laptop className="w-3.5 h-3.5 text-[#315C9F]" />
                              <span>TEAM DASHBOARD</span>
                            </div>
                            <h2 className="text-base md:text-lg font-sans font-black tracking-tight text-[#1F3557] flex items-center gap-2">
                              Welcome, {loggedInUser?.name || (loggedInUser?.email ? loggedInUser.email.split("@")[0] : "waterdrops2001")}!
                              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse border-2 border-white" />
                            </h2>
                            <p className="text-[11px] font-sans font-bold text-[#5E7393]">
                              Role: <span className="text-[#1F3557] uppercase font-mono">{simulatedRole || loggedInUser?.role || "Owner"}</span> • Hours Clocked This Session: <strong className="text-[#1F3557]">{totalHours} hours</strong>
                            </p>
                          </div>

                          {/* Right clock & date block & action buttons */}
                          <div className="flex flex-col sm:flex-row md:flex-col items-stretch md:items-end gap-2 shrink-0 w-full md:w-auto">
                            <div className="bg-[#4A86F7] hover:bg-[#3977EE] text-white p-3 px-4 rounded-2xl flex flex-col items-center justify-center min-w-[170px] shadow-md border border-[#9EC8EF]/40 text-center">
                              <span className="text-[9px] font-black tracking-widest text-blue-100 uppercase leading-none mb-1.5">
                                {liveTime.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}
                              </span>
                              <span className="text-base font-mono font-black tracking-wider leading-none select-all text-white">
                                {liveTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                              </span>
                              <span className="text-[8px] font-bold text-blue-200 font-mono mt-1 uppercase tracking-widest leading-none">
                                Secure Workspace
                              </span>
                            </div>
                            <div className="flex gap-2 w-full">
                              <button
                                onClick={() => takeSnapshot("dashboard", "Dashboard", {
                                  recordCount: 3,
                                  filters: `Role: ${simulatedRole || loggedInUser?.role || "Owner"}`,
                                  details: "Dashboard quick capture. Modules rendered successfully."
                                })}
                                className="flex-1 px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-[10px] uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                                title="Take Page Snapshot"
                              >
                                <Camera className="w-3.5 h-3.5 text-[#315C9F]" />
                                Snapshot
                              </button>
                              <button
                                onClick={() => openPageAIAnalysis("dashboard", "Dashboard")}
                                className="flex-1 px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-[10px] uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                                title="AI Option"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                                AI Option
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* MIDDLE ROW: 4 SEPARATE SQUARE SHAPED NEUTRAL CARDS */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                          {renderCardSlot(customCardTargets.card1, "Slot 1")}
                          {renderCardSlot(customCardTargets.card2, "Slot 2")}
                          {renderCardSlot(customCardTargets.card3, "Slot 3")}

                          {/* Card 4: Customize Daily View */}
                          <div 
                            onClick={() => {
                              if (!isAuthorizedToCustomize) {
                                triggerNotification("Access Denied: Only Owners, Managers, and Accountants can customize the daily view panels.");
                                return;
                              }
                              setIsCustomizingDailyViewOpen(true);
                              triggerNotification("Opening dashboard daily view customizer...");
                            }}
                            className="bg-[#C7E3FA] border border-[#9EC8EF] p-4 rounded-[24px] shadow-sm flex flex-col justify-between h-[240px] transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer text-left group"
                          >
                            <div className="flex items-center gap-1.5 text-[#1F3557]">
                              {getScreenIcon("settings", "w-4 h-4 text-[#315C9F]")}
                              <span className="text-[10px] font-black tracking-wider uppercase">CUSTOMIZE DAILY VIEW</span>
                            </div>

                            <div className="my-1 text-left flex-1 flex flex-col justify-center">
                              <p className="text-xs font-black text-[#1F3557] leading-relaxed">
                                Rearrange dashboard panel metrics instantly.
                              </p>
                              <p className="text-[10.5px] text-[#5E7393] leading-normal font-sans font-medium mt-1">
                                Choose which metrics you want displayed on your primary three operational panels.
                              </p>
                            </div>

                            <button 
                              className={`w-full py-2 rounded-xl text-[9.5px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                isAuthorizedToCustomize
                                  ? "bg-[#4A86F7] hover:bg-[#3977EE] text-white shadow-sm"
                                  : "bg-blue-100/50 text-blue-400 border border-blue-200/50 cursor-not-allowed"
                              }`}
                            >
                              {isAuthorizedToCustomize ? (
                                <>
                                  <Sliders className="w-3.5 h-3.5" />
                                  <span>Configure Slots ➔</span>
                                </>
                              ) : (
                                <>
                                  <span>Restricted To Management 🔒</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* BOTTOM ROW: COMPANY BULLETINS (Side to side rectangular card) */}
                        <div 
                          onClick={() => {
                            const matched = OS_SCREENS.find(s => s.id === "bulletins");
                            if (matched) setActiveScreen(matched);
                            triggerNotification("Navigated to Company Bulletin Board");
                          }}
                          className="w-full bg-[#C7E3FA] border border-[#9EC8EF] p-5 rounded-[24px] shadow-sm flex flex-col gap-3 text-left hover:scale-[1.002] transition-all cursor-pointer relative"
                        >
                          <div className="flex items-center justify-between border-b border-[#9EC8EF]/30 pb-2">
                            <div className="flex items-center gap-1.5 text-[#1F3557]">
                              {getScreenIcon("bulletins", "w-4 h-4 text-[#315C9F]")}
                              <span>COMPANY BULLETIN BOARD</span>
                            </div>
                            <span className="text-[9.5px] font-black text-[#315C9F] hover:underline flex items-center gap-1">
                              View Bulletin Board ➔
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
                            {bulletins.filter(b => b.status === "approved").slice(0, 2).map((bulletin) => (
                              <div key={bulletin.id} className="p-4 bg-[#EAF5FF] border border-[#9EC8EF]/60 rounded-2xl flex flex-col gap-1.5 shadow-sm hover:shadow transition-shadow">
                                <div className="flex items-center justify-between text-[9px] font-bold text-[#1F3557]">
                                  <span className="uppercase tracking-wider text-[#5E7393]">{bulletin.author} ({bulletin.role})</span>
                                  <span className="font-mono text-[#5E7393]">{bulletin.date}</span>
                                </div>
                                <h4 className="text-xs font-black text-[#1F3557] uppercase tracking-wider leading-tight">{bulletin.title}</h4>
                                <p className="text-[10.5px] text-[#5E7393] line-clamp-2 leading-relaxed font-sans font-medium">{bulletin.content}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* CUSTOMIZATION DIALOG MODAL PANEL */}
                        {isCustomizingDailyViewOpen && (
                          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                            <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[420px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up">
                              <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3.5 mb-4">
                                <div className="flex items-center gap-2">
                                  <Sliders className="w-5 h-5 text-[#315C9F]" />
                                  <h3 className="text-sm font-black text-[#1F3557] uppercase tracking-wider">Customize Daily View</h3>
                                </div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsCustomizingDailyViewOpen(false);
                                  }}
                                  className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold"
                                >
                                  ✕
                                </button>
                              </div>

                              <p className="text-xs text-[#5E7393] font-sans font-semibold mb-4 leading-relaxed">
                                Select which metric cards populate your primary three dashboard panel slots. Save to update immediately.
                              </p>

                              <div className="space-y-4">
                                <div className="space-y-1 flex flex-col">
                                  <label className="text-[9.5px] uppercase tracking-wider text-[#5E7393] font-bold">Slot 1 Metric Card</label>
                                  <CustomDropdown
                                    value={customCardTargets.card1}
                                    onChange={(val) => setCustomCardTargets(prev => ({ ...prev, card1: val }))}
                                    options={DAILY_VIEW_OPTIONS}
                                    scale={scale}
                                  />
                                </div>

                                <div className="space-y-1 flex flex-col">
                                  <label className="text-[9.5px] uppercase tracking-wider text-[#5E7393] font-bold">Slot 2 Metric Card</label>
                                  <CustomDropdown
                                    value={customCardTargets.card2}
                                    onChange={(val) => setCustomCardTargets(prev => ({ ...prev, card2: val }))}
                                    options={DAILY_VIEW_OPTIONS}
                                    scale={scale}
                                  />
                                </div>

                                <div className="space-y-1 flex flex-col">
                                  <label className="text-[9.5px] uppercase tracking-wider text-[#5E7393] font-bold">Slot 3 Metric Card</label>
                                  <CustomDropdown
                                    value={customCardTargets.card3}
                                    onChange={(val) => setCustomCardTargets(prev => ({ ...prev, card3: val }))}
                                    options={DAILY_VIEW_OPTIONS}
                                    scale={scale}
                                  />
                                </div>
                              </div>

                              <div className="flex gap-2.5 mt-6 pt-3 border-t border-[#9EC8EF]">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsCustomizingDailyViewOpen(false);
                                  }}
                                  className="flex-1 py-2.5 border border-[#9EC8EF] bg-[#EAF5FF] hover:bg-[#BDDDF8] text-[#1F3557] font-bold rounded-xl text-xs transition-colors cursor-pointer text-center"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsCustomizingDailyViewOpen(false);
                                    triggerNotification("Dashboard Daily View slots successfully updated!");
                                  }}
                                  className="flex-1 py-2.5 bg-[#4A86F7] hover:bg-[#3977EE] text-white font-bold rounded-xl text-xs transition-colors cursor-pointer text-center shadow-sm uppercase tracking-wider"
                                >
                                  Save Layout
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                      </div>
                      </>
                    );
                  })()

                  ) : activeScreen.id === "customers" ? (
                    <CustomersPage
                      onOpenPlaceholder={(screenId) => {
                        const matched = OS_SCREENS.find(s => s.id === screenId);
                        if (matched) {
                          setActiveScreen(matched);
                          triggerNotification(`Navigated to Placeholder for: ${matched.label}`);
                        }
                      }}
                    />

                  ) : activeScreen.id === "leads" ? (
                    <LeadsPage />

                  ) : activeScreen.id === "snapshots" ? (
                    <SnapshotsPage />

                  ) : activeScreen.id === "estimates" ? (
                    <EstimatesPage />

                  ) : activeScreen.id === "roster" ? (
                    <RosterPage />

                  ) : activeScreen.id === "timeclock" ? (
                    <TimeClockPage
                      isClockedIn={isClockedIn}
                      setIsClockedIn={setIsClockedIn}
                      clockInTime={clockInTime}
                      setClockInTime={setClockInTime}
                      clockInDuration={clockInDuration}
                      setClockInDuration={setClockInDuration}
                    />

                  ) : activeScreen.id === "inventory" ? (
                    <InventoryPage />

                  ) : activeScreen.id === "documents" ? (
                    <DocumentsPage />

                  ) : activeScreen.id === "accounting" ? (
                    <AccountingPage />

                  ) : activeScreen.id === "messages" ? (
                    <MessagesPage />

                  ) : activeScreen.id === "training" ? (
                    <TrainingPage />

                  ) : activeScreen.id === "ai_assistant" ? (
                    <AIAssistantPage
                      globalAiSetting={globalAiSetting}
                      setGlobalAiSetting={setGlobalAiSetting}
                      moduleAiSettings={moduleAiSettings}
                      setModuleAiSettings={setModuleAiSettings}
                    />

                  ) : activeScreen.id === "integrations" ? (
                    
                    <IntegrationsPage
                      dashboardLeads={dashboardLeads}
                      setDashboardLeads={setDashboardLeads}
                    />

                  ) : activeScreen.id === "settings" ? (
                    
                    <SettingsPage
                      businessNames={businessNames}
                      setBusinessNames={setBusinessNames}
                      businessPhones={businessPhones}
                      setBusinessPhones={setBusinessPhones}
                      businessAddresses={businessAddresses}
                      setBusinessAddresses={setBusinessAddresses}
                      businessLogos={businessLogos}
                      setBusinessLogos={setBusinessLogos}
                      ownerNames={ownerNames}
                      setOwnerNames={setOwnerNames}
                      ownerPhones={ownerPhones}
                      setOwnerPhones={setOwnerPhones}
                      companyLocations={companyLocations}
                      setCompanyLocations={setCompanyLocations}
                      employeeRedoOnboardingAllowed={employeeRedoOnboardingAllowed}
                      setEmployeeRedoOnboardingAllowed={setEmployeeRedoOnboardingAllowed}
                      revenueResetInterval={revenueResetInterval}
                      setRevenueResetInterval={setRevenueResetInterval}
                      globalAiSetting={globalAiSetting}
                      setGlobalAiSetting={setGlobalAiSetting}
                      moduleAiSettings={moduleAiSettings}
                      setModuleAiSettings={setModuleAiSettings}
                      selectedRoles={selectedRoles}
                      setSelectedRoles={setSelectedRoles}
                    />

                  ) : activeScreen.id === "owner_console" ? (
                    (simulatedRole || loggedInUser?.role || "Owner") === "Technician" ? (
                      <div className="p-8 bg-slate-900 border border-red-500/30 rounded-[28px] text-center max-w-md mx-auto my-12 space-y-4">
                        <ShieldAlert className="w-16 h-16 text-red-500 mx-auto animate-bounce" />
                        <h2 className="text-xl font-bold text-white">Restricted Access – Owner only</h2>
                        <p className="text-xs text-slate-400 font-sans leading-relaxed">
                          Your account role (Technician) does not have permissions to access the Owner Console. This event has been logged for security audit purposes.
                        </p>
                        <button
                          onClick={() => setActiveScreen(OS_SCREENS[0])}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          Return to Dashboard
                        </button>
                      </div>
                    ) : (
                      <OwnerConsolePage
                        dashboardLeads={dashboardLeads}
                        setDashboardLeads={setDashboardLeads}
                        revenueResetInterval={revenueResetInterval}
                      />
                    )

                  ) : activeScreen.id === "revenue" ? (
                    (simulatedRole || loggedInUser?.role || "Owner") === "Technician" ? (
                      <div className="p-8 bg-slate-900 border border-red-500/30 rounded-[28px] text-center max-w-md mx-auto my-12 space-y-4">
                        <ShieldAlert className="w-16 h-16 text-red-500 mx-auto animate-bounce" />
                        <h2 className="text-xl font-bold text-white">Restricted Access – Owner only</h2>
                        <p className="text-xs text-slate-400 font-sans leading-relaxed">
                          Your account role (Technician) does not have permissions to access the Revenue Page or view financial data.
                        </p>
                        <button
                          onClick={() => setActiveScreen(OS_SCREENS[0])}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          Return to Dashboard
                        </button>
                      </div>
                    ) : (
                      /* HIGHLY POLISHED COMPREHENSIVE REVENUE PAGE */
                      <div className="space-y-6 animate-fade-in text-left">
                      {/* HEADER SECTION - Separate clean header block */}
                      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                          <h2 className="text-lg font-sans font-extrabold text-[#1F3557] uppercase tracking-wider flex items-center gap-2">
                            <span className="select-none text-xl">📈</span> Company Revenue Analytics
                          </h2>
                          <p className="text-xs text-[#5E7393] font-sans font-semibold">Track revenue, labor costs, expenses, and estimated taxes</p>
                        </div>
                        <PlaidConnectButton />
                      </div>

                      {/* CONFIGURE RESET INTERVAL BLOCK */}
                      <div className="bg-[#C7E3FA] p-5 rounded-2xl border border-[#9EC8EF] space-y-4 shadow-sm">
                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                          <div>
                            <h3 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider">Configure Dashboard Graph Reset Interval</h3>
                            <p className="text-[11px] text-[#5E7393] leading-relaxed font-sans font-medium mt-0.5">
                              Select the interval at which the home screen revenue graph resets. The graph continues from the last day of the selected period.
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[10.5px] text-[#5E7393] font-sans font-medium hidden sm:inline">Currently resetting: <strong className="text-[#315C9F]">{revenueResetInterval}</strong></span>
                            <select
                              value={revenueResetInterval}
                              onChange={(e) => {
                                  setRevenueResetInterval(e.target.value);
                                  triggerNotification(`Dashboard revenue graph reset interval updated to: ${e.target.value}`);
                                }}
                              className="text-xs font-bold text-[#1F3557] bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none cursor-pointer"
                            >
                              <option value="Pay Period">Pay Period Reset (Default)</option>
                              <option value="Monthly">Monthly Reset</option>
                              <option value="Quarterly">Quarterly Reset</option>
                              <option value="Annually">Annually Reset</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* TOP SECTION - LARGE REVENUE OVERVIEW CARD WITH MULTI-LINE GRAPH */}
                      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-5">
                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-[#9EC8EF]/30 pb-4">
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-[#5E7393]">Financial Ledger</span>
                            <h3 className="text-base font-sans font-black text-[#1F3557] tracking-tight">Revenue Overview</h3>
                            <p className="text-xs text-[#5E7393] font-sans font-medium mt-0.5">
                              Period: <strong className="text-[#315C9F]">
                                {(() => {
                                  const now = new Date();
                                  if (revenuePageFilter === "Day") return `Daily activity — last 30 days (through ${now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })})`;
                                  if (revenuePageFilter === "Pay Period") return "Running totals — current 14-day pay period";
                                  if (revenuePageFilter === "Quarter") return "Running totals — current quarter";
                                  if (revenuePageFilter === "Annual") return `Running totals — ${now.getFullYear()}`;
                                  return "Running totals — complete financial history";
                                })()}
                              </strong>
                            </p>
                          </div>

                          {/* Filter Button Group */}
                          <div className="bg-[#EAF5FF] p-1 rounded-xl border border-[#9EC8EF] flex flex-wrap gap-1">
                            {[
                              { value: "Day", label: "View by Day" },
                              { value: "Pay Period", label: "View by Pay Period" },
                              { value: "Quarter", label: "View by Quarter" },
                              { value: "Annual", label: "View Annual" },
                              { value: "Total", label: "View Total" }
                            ].map(({ value, label }) => {
                              const isActive = revenuePageFilter === value;
                              return (
                                <button
                                  key={value}
                                  onClick={() => {
                                    setRevenuePageFilter(value);
                                    triggerNotification(`Adjusted graph filter to: ${label}`);
                                  }}
                                  className={`px-3 py-1.5 text-[10.5px] rounded-lg transition-all duration-200 cursor-pointer font-bold ${
                                    isActive
                                      ? "bg-[#4A86F7] text-white shadow-sm"
                                      : "text-[#5E7393] hover:text-[#1F3557]"
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Summary Display on Graph card */}
                        {(() => {
                          const { currentTotal, currentExpenseTotal, priorTotal, priorExpenseTotal } = getRevenueChartData(balanceView, revenueEvents, transactions);
                          const balance = currentTotal - currentExpenseTotal;
                          const priorBalance = priorTotal - priorExpenseTotal;
                          const hasPrior = priorBalance !== 0;
                          const pct = hasPrior ? ((balance - priorBalance) / Math.abs(priorBalance)) * 100 : null;
                          const isUp = pct === null ? balance > 0 : pct >= 0;
                          const balanceLabel = balanceView === "Total" ? "Total Balance" : `${balanceView} Balance`;
                          return (
                            <div className="flex flex-wrap items-end gap-3 sm:gap-4">
                              <div>
                                <p className="text-[10px] uppercase font-bold tracking-wider text-[#5E7393] mb-1">{balanceLabel}</p>
                                <span className="text-3xl font-sans font-black text-[#1F3557] tracking-tight">
                                  {`${balance < 0 ? "-" : ""}$${Math.abs(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                </span>
                              </div>
                              <select
                                aria-label="Balance view"
                                value={balanceView}
                                onChange={(e) => {
                                  changeBalanceView(e.target.value);
                                  triggerNotification(`Balance view updated to: ${e.target.options[e.target.selectedIndex].text}`);
                                }}
                                className="text-[10.5px] font-bold text-[#1F3557] bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2 focus:outline-none cursor-pointer"
                              >
                                <option value="Day">View by Day</option>
                                <option value="Pay Period">View by Pay Period</option>
                                <option value="Quarter">View by Quarter</option>
                                <option value="Annual">View Annual</option>
                                <option value="Total">View Total Balance</option>
                              </select>
                              <span className={`text-xs font-bold flex items-center px-2.5 py-1 rounded-lg ${isUp ? "text-emerald-600 bg-emerald-500/10" : "text-red-600 bg-red-500/10"}`}>
                                {isUp ? <TrendingUp className="w-3.5 h-3.5 mr-1 shrink-0" /> : <TrendingDown className="w-3.5 h-3.5 mr-1 shrink-0" />}
                                {pct === null ? (balance !== 0 ? "Current" : "—") : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
                              </span>
                              <span className="text-xs text-[#5E7393] font-sans font-medium">income minus expenses</span>
                            </div>
                          );
                        })()}

                        {/* Log real income/expenses, run real payroll */}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => { sessionStorage.setItem("ownerslocal_pending_financial_scan", "income"); setLogTransactionType("income"); }}
                            className="px-3 py-1.5 text-[10.5px] font-bold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer flex items-center gap-1"
                          >
                            + Log Income
                          </button>
                          <button
                            type="button"
                            onClick={() => { sessionStorage.setItem("ownerslocal_pending_financial_scan", "expense"); setLogTransactionType("expense"); }}
                            className="px-3 py-1.5 text-[10.5px] font-bold rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 cursor-pointer flex items-center gap-1"
                          >
                            + Log Expense
                          </button>
                          <button
                            type="button"
                            disabled={isRunningPayroll}
                            onClick={handleRunPayroll}
                            className="px-3 py-1.5 text-[10.5px] font-bold rounded-lg bg-[#EAF5FF] text-[#315C9F] border border-[#9EC8EF] hover:bg-white cursor-pointer flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isRunningPayroll ? "Running Payroll..." : "Run Payroll (last 14 days)"}
                          </button>
                        </div>

                        {logTransactionType && (
                          <LogTransactionModal
                            key={logTransactionType}
                            type={logTransactionType}
                            createdBy={loggedInUser?.email}
                            onSave={handleSaveTransaction}
                            onClose={() => { sessionStorage.removeItem("ownerslocal_pending_financial_scan"); setLogTransactionType(null); }}
                          />
                        )}

                        {/* Recharts Live Multi-line Graph Container */}
                        <div className="h-[280px] w-full pt-2">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={getRevenueChartData(revenuePageFilter, revenueEvents, transactions).series}
                              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
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
                                tickFormatter={(val) => `$${val.toLocaleString()}`}
                                className="font-mono"
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
                              <Line
                                type="monotone"
                                dataKey="Revenue"
                                stroke="#22C55E"
                                strokeWidth={3}
                                dot={{ r: 4, strokeWidth: 1 }}
                                activeDot={{ r: 6 }}
                                name="Revenue"
                              />
                              <Line
                                type="monotone"
                                dataKey="Expenses"
                                stroke="#F43F5E"
                                strokeWidth={2}
                                dot={{ r: 3, strokeWidth: 1 }}
                                activeDot={{ r: 5 }}
                                name="Expenses"
                              />
                              <Line
                                type="monotone"
                                dataKey="Profit"
                                stroke="#4A86F7"
                                strokeWidth={2}
                                dot={{ r: 3, strokeWidth: 1 }}
                                activeDot={{ r: 5 }}
                                name="Profit"
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* SUMMARY CARDS - FIVE SEPARATE FLOATING BLUE CARDS */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        {(() => {
                          const { currentExpenseTotal, currentPayrollTotal } = getRevenueChartData(revenuePageFilter, revenueEvents, transactions);
                          const netProfit = completedJobsRevenue - currentExpenseTotal;
                          const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                          return [
                          {
                            label: "Total Revenue",
                            key: "revenue",
                            val: `$${completedJobsRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                            change: null,
                            isUp: true,
                            comp: "Real revenue from completed jobs",
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
                            comp: "Revenue minus logged expenses",
                            icon: TrendingUp,
                            color: "text-blue-500",
                            bgColor: "bg-blue-500/10"
                          },
                          {
                            label: "Total Expenses",
                            key: "expenses",
                            val: fmt(currentExpenseTotal),
                            change: null,
                            isUp: true,
                            comp: "Real logged income/expense entries",
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

                        {/* Real payroll rows: real employees x real time_clock_logs x real hourlyRate,
                            same trailing-14-day math as Run Payroll above. recentRoster is a separate
                            onboarding-invite list without email/hourlyRate, so it can't be cross-referenced
                            to real hours — this table uses the real `employees` collection instead. */}
                        {(() => {
                          const rows = employees
                            .filter(e => `${e.firstName} ${e.lastName}`.toLowerCase().includes(payrollSearch.toLowerCase()) || e.role.toLowerCase().includes(payrollSearch.toLowerCase()))
                            .map((emp) => {
                              const myLogs = timeClockLogs.filter(l => l.employeeEmail === emp.email);
                              const hours = computeRecentHours(myLogs, 14);
                              const regHours = Math.min(hours, 80);
                              const otHours = Math.max(0, hours - 80);
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
                              { label: "Record Expense", action: "Record Expense Journal", icon: DollarSign },
                              { label: "Run Payroll", action: "Run Payroll Protocol", icon: Users },
                              { label: "Create Invoice", action: "Create Service Invoice", icon: FileText },
                              { label: "Reconcile Bank", action: "Reconcile Bank Accounts", icon: Landmark }
                            ].map((btn, idx) => (
                              <button
                                key={idx}
                                onClick={() => openPlaceholderPage(btn.action, "⚡")}
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
                            onClick={() => setRevenueConfirmAction({ label: "Financial Reports Hub", icon: "📊" })}
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
