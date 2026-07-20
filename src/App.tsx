import React, { useState, useEffect } from "react";
import { db, auth } from "./firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
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
  Activity,
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
import { TimeClockPage } from "./components/TimeClockPage";
import { InventoryPage, INITIAL_INVENTORY, InventoryItem } from "./components/InventoryPage";
import { InteractiveMapPage } from "./components/InteractiveMapPage";
import { DocumentsPage, DocumentItem } from "./components/DocumentsPage";
import { AccountingPage } from "./components/AccountingPage";
import { RosterPage } from "./components/RosterPage";
import { MessagesPage } from "./components/MessagesPage";
import { TrainingPage } from "./components/TrainingPage";
import { AIAssistantPage } from "./components/AIAssistantPage";
import SettingsPage from "./components/SettingsPage";
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

// Asset URLs from Owner's Local OS GitHub
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
  ) => ({
    series,
    currentTotal: series.reduce((s, d) => s + d.Revenue, 0),
    priorTotal,
    currentExpenseTotal: series.reduce((s, d) => s + d.Expenses, 0),
    currentPayrollTotal: sumInRange(payrollTx, periodStart, periodEnd)
  });

  if (filter === "Week") {
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const series = buildDays(7, (d) => d.toLocaleDateString(undefined, { weekday: "short" }));
    const priorTotal = sumInRange(
      revenueSource,
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13),
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
    );
    return withTotals(series, periodStart, periodEnd, priorTotal);
  }

  if (filter === "Quarter") {
    const months: Array<{ time: string; Revenue: number; Expenses: number; Profit: number }> = [];
    for (let i = 2; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      months.push(buildRow(monthStart.toLocaleDateString(undefined, { month: "short" }), monthStart, monthEnd));
    }
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const priorTotal = sumInRange(
      revenueSource,
      new Date(now.getFullYear(), now.getMonth() - 5, 1),
      new Date(now.getFullYear(), now.getMonth() - 2, 1)
    );
    return withTotals(months, periodStart, periodEnd, priorTotal);
  }

  if (filter === "Year") {
    const quarters: Array<{ time: string; Revenue: number; Expenses: number; Profit: number }> = [];
    const currentQuarter = Math.floor(now.getMonth() / 3);
    let periodStart = now;
    let periodEnd = now;
    for (let i = 3; i >= 0; i--) {
      const qIndex = currentQuarter - i;
      const qYear = now.getFullYear() + Math.floor(qIndex / 4);
      const qNum = ((qIndex % 4) + 4) % 4;
      const qStart = new Date(qYear, qNum * 3, 1);
      const qEnd = new Date(qYear, qNum * 3 + 3, 1);
      if (i === 3) periodStart = qStart;
      if (i === 0) periodEnd = qEnd;
      quarters.push(buildRow(`Q${qNum + 1} ${qYear}`, qStart, qEnd));
    }
    const priorQIndex = currentQuarter - 4;
    const priorYear = now.getFullYear() + Math.floor(priorQIndex / 4);
    const priorQNum = ((priorQIndex % 4) + 4) % 4;
    const priorTotal = sumInRange(
      revenueSource,
      new Date(priorYear, priorQNum * 3, 1),
      new Date(priorYear, priorQNum * 3 + 3, 1)
    );
    return withTotals(quarters, periodStart, periodEnd, priorTotal);
  }

  // "Pay Period"/"Custom"/anything else: real trailing 30 days by day.
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

/**
 * Real hours worked in the trailing `sinceDaysAgo` days, computed by
 * pairing Clock In/Break End with Clock Out/Break Start the same way
 * TimeClockPage and handleRunPayroll do. Shared here so the Revenue page's
 * Payroll Overview table shows the same real numbers Run Payroll acts on.
 */
function computeRecentHours(logs: TimeClockLog[], sinceDaysAgo: number): number {
  const since = new Date(Date.now() - sinceDaysAgo * 24 * 60 * 60 * 1000);
  const sorted = [...logs]
    .filter((l) => new Date(l.timestamp) >= since)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  let totalMs = 0;
  let segmentStart: number | null = null;
  for (const log of sorted) {
    const ts = new Date(log.timestamp).getTime();
    if (log.type === "Clock In" || log.type === "Break End") {
      segmentStart = ts;
    } else if ((log.type === "Clock Out" || log.type === "Break Start") && segmentStart !== null) {
      totalMs += ts - segmentStart;
      segmentStart = null;
    }
  }
  if (segmentStart !== null) totalMs += Date.now() - segmentStart;
  return totalMs / 3600000;
}

const getScreenIcon = (screenId: string, className: string = "w-4 h-4") => {
  switch (screenId) {
    case "owner_console":
      return <ShieldAlert className={className} />;
    case "dashboard":
      return <LayoutDashboard className={className} />;
    case "revenue":
      return <Activity className={className} />;
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
      return <Activity className={className} />;
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
  { value: "fleet", label: "🚚 Fleet Telemetry Hub" },
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
  const [currentView, setCurrentView] = useState<string>("login");
  const [activeScreen, setActiveScreen] = useState(OS_SCREENS[0]);
  const [showNotification, setShowNotification] = useState<string | null>(null);
  const [employeeRedoOnboardingAllowed, setEmployeeRedoOnboardingAllowed] = useState(false);

  // New Sidebar & Workspace Simulation states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [simulatedRole, setSimulatedRole] = useState<string | null>(null);
  const [liveTime, setLiveTime] = useState(new Date());

  // Notification system states
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);

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
  const [newRosterName, setNewRosterName] = useState("");
  const [newRosterRole, setNewRosterRole] = useState("Technician");

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
  const [employees, setEmployees] = useFirestoreCollection<EmployeeRecord>("employees", businessId);
  const [timeClockLogs, setTimeClockLogs] = useFirestoreCollection<TimeClockLog>("time_clock_logs", businessId);
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
  const [logTransactionType, setLogTransactionType] = useState<"income" | "expense" | null>(null);
  const [isRunningPayroll, setIsRunningPayroll] = useState(false);

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
        }
      } else {
        setLoggedInUser(null);
        setIsLoggedIn(false);
        isTimeClockLoadedRef.current = false;
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
  }, [isClockedIn, clockInTime, clockInDuration, loggedInUser]);

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
      triggerNotification("Logged out of Owner's Local OS.");
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
      setTransactions(prev => [...prev, newTxn]);
      // Real double-entry posting -- every logged transaction moves the
      // real ledger (Cash + Revenue or Cash + the matching expense
      // account), not just a line in a list. See accountingEngine.ts.
      setJournalEntries(prev => [...prev, postTransactionEntry(newTxn)]);
      setLogTransactionType(null);
      triggerNotification(`${t.type === "income" ? "Income" : "Expense"} logged: $${t.amount.toLocaleString()}`);
    } catch (err) {
      console.error("Error saving transaction:", err);
      triggerNotification("Couldn't save that — check your connection and try again.");
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
        isOnboarded: true,
        name: `${empFirstName} ${empLastName}`,
        goals: empGoals,
        createdAt: new Date().toISOString()
      });

      // 3. Save detailed employees entry
      const newEmployee = {
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
    timeClockLogs,
    setTimeClockLogs,
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
                  {/* LOGO BANNER - Fills the card exactly from the top edge
                      down to the top of the Google button (27.2%, matching
                      the button div's own top offset), flush with both side
                      edges. object-cover fills that box with zero stretching,
                      cropping the image's outer edges as needed. */}
                  <div
                    style={{
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "27.2%"
                    }}
                    className="absolute pointer-events-none"
                  >
                    <img
                      src="/branding/Logoactual.png"
                      alt="Owner's Local OS"
                      style={{ width: "100%", height: "100%" }}
                      className="object-cover"
                      referrerPolicy="no-referrer"
                    />
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
                        {renderDynamicField("business address", businessAddresses, setBusinessAddresses, "e.g. 1102 Industrial Way")}
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
                            {/* Filter out Owner since they are already added, show other default roles */}
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
                            <option value="__create_custom__" className="text-blue-600 font-bold">
                              ★ + Create Custom Role from scratch...
                            </option>
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

                          <div className="space-y-1">
                            <label style={getFontSize(10)} className="font-sans font-bold text-[#342D7E] uppercase tracking-wider block">
                              Home Address
                            </label>
                            <input
                              type="text"
                              value={empAddress}
                              onChange={(e) => setEmpAddress(e.target.value)}
                              placeholder="123 Maple St, Seattle WA"
                              required
                              style={{ height: `${36 * scale}px`, borderRadius: `${8 * scale}px`, ...getFontSize(12) }}
                              className="w-full bg-white border border-slate-200 px-3 text-slate-800 font-sans focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                            />
                          </div>

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
                              Owner's Local OS Role Matrix
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
                              triggerNotification("Welcome to Owner's Local OS Dashboard!");
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
                      <HelpCircle className="w-4 h-4 text-blue-600" /> Owner's Local OS Support Desk
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
                      <span>We employ industry standard AES-256 cloud encryption nodes to protect your business intelligence operations.</span>
                      <br /><br />
                      <span>Any details cached or entered in this local runtime sandbox are purely client-side local variables. Your password data is never transmitted to outside networks.</span>
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

            {/* Hint of source authenticity */}
            <div className="mt-4 flex flex-col items-center gap-1">
              <p className="text-[11px] text-slate-500 text-center">
                Visual card dimensions modeled on raw GitHub resource resolution.
              </p>
              <div className="flex items-center gap-1.5 mt-1 text-slate-400 hover:text-slate-300 text-xs font-mono">
                <Laptop className="w-3.5 h-3.5 text-blue-500" />
                <span>Device Adaptive Frame Simulation</span>
              </div>
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
                        <Activity className="w-5 h-5 stroke-[2.5]" />
                      </div>
                      <span className="font-sans font-black tracking-tight text-sm text-[#1F3557] select-none">Owner's Local OS</span>
                      <span className="text-[7.5px] px-1.5 py-0.5 bg-[#4A86F7]/10 text-[#1F3557] rounded font-black uppercase tracking-wider select-none">Local OS</span>
                    </div>
                  ) : (
                    <div className="mx-auto w-8 h-8 rounded-lg bg-[#4A86F7] text-white flex items-center justify-center shadow-md">
                      <Activity className="w-5 h-5 stroke-[2.5]" />
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

                    // Real Revenue only, bucketed by real completed-job data — see
                    // getRevenueChartData for why Profit/Expenses/Payroll/Taxes
                    // aren't part of this.
                    const getDashboardGraphData = () => getRevenueChartData(revenuePageFilter, revenueEvents).series;

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
                                        {`$${completedJobsRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
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
                    
                    /* ROSTER VIEW */
                    <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm space-y-4 animate-fade-in">
                      <div className="flex items-center justify-between border-b border-[#A9CDEE] pb-4">
                        <div>
                          <h2 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">Corporate Roster</h2>
                          <p className="text-xs text-slate-500">Employee database and secure roster logs</p>
                        </div>
                        <span className="px-3 py-1 bg-[#E3F3FF] text-[#4A9BFF] text-xs font-mono font-bold rounded-xl border border-[#A9CDEE]">
                          Secure Node Connected
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Interactive Invite Creator */}
                        <div className="bg-[#E3F3FF] p-5 rounded-2xl border border-[#A9CDEE] space-y-3.5 h-fit">
                          <h4 className="text-xs font-black uppercase text-[#342D7E] tracking-wider flex items-center gap-1.5">
                            <PlusCircle className="w-4 h-4 text-[#4A9BFF]" /> Create Security Invitation
                          </h4>
                          <p className="text-[10.5px] text-slate-500 leading-normal font-medium">
                            Generate temporary secure invitation keys for onboarding new employees.
                          </p>
                          
                          <div className="space-y-1">
                            <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">New Employee Name</label>
                            <input
                              value={newRosterName}
                              onChange={(e) => setNewRosterName(e.target.value)}
                              type="text"
                              placeholder="e.g. Sarah Jenkins"
                              className="w-full text-xs bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A9BFF] font-medium"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Assigned Role Node</label>
                            <select
                              value={newRosterRole}
                              onChange={(e) => setNewRosterRole(e.target.value)}
                              className="w-full text-xs bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-2 py-2.5 focus:outline-none cursor-pointer text-slate-700 font-medium"
                            >
                              <option value="Technician">Technician / Specialist</option>
                              <option value="Driver">Driver / Installer</option>
                              <option value="Office Manager">Office Manager</option>
                              <option value="Salesperson">Sales Representative</option>
                            </select>
                          </div>

                          <button
                            onClick={() => {
                              if (!newRosterName.trim()) {
                                triggerNotification("Please enter employee name.");
                                return;
                              }
                              const nameClean = newRosterName.trim();
                              const randomCode = `${newRosterRole.toUpperCase().replace(/ /g, "_")}-${Math.floor(1000 + Math.random() * 9000)}`;
                              const newEntry = {
                                name: nameClean,
                                role: newRosterRole,
                                code: randomCode,
                                status: "Awaiting Login"
                              };
                              setRecentRoster(prev => [...prev, newEntry]);
                              triggerNotification(`Invite generated for ${nameClean}! Code: ${randomCode}`);
                              setNewRosterName("");
                            }}
                            className="w-full py-2.5 bg-[#4A9BFF] hover:bg-[#3583E6] text-white font-bold rounded-xl text-xs transition-colors cursor-pointer text-center uppercase tracking-wider shadow-sm"
                          >
                            + Generate Invite Code
                          </button>
                        </div>

                        {/* Roster Listing Grid */}
                        <div className="md:col-span-2 space-y-3">
                          <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Active Invitation Database</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {recentRoster.map((item, idx) => (
                              <div key={idx} className="p-4 bg-[#E3F3FF] hover:bg-[#E3F3FF]/80 rounded-2xl border border-[#A9CDEE] flex flex-col justify-between gap-3 shadow-sm hover:shadow transition-all relative group">
                                <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-emerald-500" />
                                
                                <div>
                                  <p className="text-xs font-extrabold text-slate-800 font-sans">{item.name}</p>
                                  <p className="text-[10px] text-slate-400 font-mono tracking-wider mt-0.5">{item.role}</p>
                                </div>

                                <div className="p-2 bg-[#F5FAFF] rounded-xl border border-[#A9CDEE]/30 flex items-center justify-between">
                                  <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold font-sans">Access Key</span>
                                  <code 
                                    onClick={() => {
                                      navigator.clipboard.writeText(item.code);
                                      triggerNotification(`Copied security key: ${item.code}`);
                                    }}
                                    className="bg-[#F5FAFF] hover:bg-[#E3F3FF] text-[#4A9BFF] border border-[#A9CDEE] px-2 py-0.5 rounded text-[10px] font-black cursor-pointer select-all"
                                    title="Click to copy security key"
                                  >
                                    {item.code}
                                  </code>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

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

                  ) : activeScreen.id === "roster" ? (
                    <RosterPage />

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
                          <p className="text-xs text-[#5E7393] font-sans font-semibold">Real-time financial metrics, labor costs, and operational tax projection matrix</p>
                        </div>
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
                                  if (revenuePageFilter === "Week") return "Last 7 days";
                                  if (revenuePageFilter === "Quarter") return "Last 3 months";
                                  if (revenuePageFilter === "Year") return "Last 4 quarters";
                                  return `Last 30 days (through ${now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })})`;
                                })()}
                              </strong>
                            </p>
                          </div>

                          {/* Filter Button Group */}
                          <div className="bg-[#EAF5FF] p-1 rounded-xl border border-[#9EC8EF] flex flex-wrap gap-1">
                            {["Pay Period", "Week", "Month", "Quarter", "Year", "Custom"].map((period) => {
                              const isActive = revenuePageFilter === period;
                              return (
                                <button
                                  key={period}
                                  onClick={() => {
                                    setRevenuePageFilter(period);
                                    triggerNotification(`Adjusted graph filter to: ${period}`);
                                  }}
                                  className={`px-3 py-1.5 text-[10.5px] rounded-lg transition-all duration-200 cursor-pointer font-bold ${
                                    isActive
                                      ? "bg-[#4A86F7] text-white shadow-sm"
                                      : "text-[#5E7393] hover:text-[#1F3557]"
                                  }`}
                                >
                                  {period}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Summary Display on Graph card */}
                        <div className="flex flex-wrap items-baseline gap-4">
                          <span className="text-3xl font-sans font-black text-[#1F3557] tracking-tight">
                            {`$${completedJobsRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          </span>
                          {(() => {
                            const { currentTotal, priorTotal } = getRevenueChartData(revenuePageFilter, revenueEvents, transactions);
                            const hasPrior = priorTotal > 0;
                            const pct = hasPrior ? ((currentTotal - priorTotal) / priorTotal) * 100 : null;
                            const isUp = pct === null ? currentTotal > 0 : pct >= 0;
                            return (
                              <span className={`text-xs font-bold flex items-center px-2.5 py-1 rounded-lg ${isUp ? "text-emerald-600 bg-emerald-500/10" : "text-red-600 bg-red-500/10"}`}>
                                {isUp ? <TrendingUp className="w-3.5 h-3.5 mr-1 shrink-0" /> : <TrendingDown className="w-3.5 h-3.5 mr-1 shrink-0" />}
                                {pct === null ? (currentTotal > 0 ? "New" : "—") : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
                              </span>
                            );
                          })()}
                          <span className="text-xs text-[#5E7393] font-sans font-medium">vs prior period</span>
                        </div>

                        {/* Log real income/expenses, run real payroll */}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setLogTransactionType("income")}
                            className="px-3 py-1.5 text-[10.5px] font-bold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer flex items-center gap-1"
                          >
                            + Log Income
                          </button>
                          <button
                            type="button"
                            onClick={() => setLogTransactionType("expense")}
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
                            type={logTransactionType}
                            createdBy={loggedInUser?.email}
                            onSave={handleSaveTransaction}
                            onClose={() => setLogTransactionType(null)}
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
                          <span className="text-[10px] font-mono font-bold text-[#5E7393] uppercase">12 Cost Nodes Accrued</span>
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
                          <p className="text-xs text-[#5E7393] font-sans font-semibold">Connect your local enterprise nodes to leading accounting API integrations</p>
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

                  ) : activeScreen.id === "routes" ? (
                    <InteractiveMapPage
                      businessAddresses={businessAddresses}
                    />

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
                    Workspace diagnostic assistant • {aiPageName}
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
                  <h3 className="text-xs font-black uppercase tracking-wider">Owner's Local OS AI</h3>
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
