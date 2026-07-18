import React, { useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import {
  Bell,
  Search,
  Filter,
  RefreshCw,
  Settings,
  CheckCircle2,
  Archive,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Pin,
  Clock,
  Trash2,
  ArrowUpRight,
  UserPlus,
  Info,
  Plus,
  ChevronRight,
  Check,
  X,
  Shield,
  Volume2,
  Mail,
  Phone,
  Laptop,
  BellRing,
  Calendar,
  Users,
  Target,
  FileText,
  Truck,
  Compass,
  Briefcase,
  Package,
  FolderOpen,
  MessageSquare,
  GraduationCap,
  Activity,
  UserCheck
} from "lucide-react";

export interface DetailedNotification {
  id: string;
  category: string; // 'customer' | 'leads' | 'estimates' | 'scheduling' | 'dispatch' | 'routes' | 'jobs' | 'timeclock' | 'inventory' | 'documents' | 'messages' | 'training' | 'revenue' | 'ai' | 'system' | 'custom'
  title: string;
  description: string;
  time: string; // YYYY-MM-DD HH:MM
  isRead: boolean;
  isArchived: boolean;
  isPinned: boolean;
  snoozedUntil?: string | null;
  priority: "Critical" | "High" | "Normal" | "Low" | "Informational";
  assignedUser?: string;
  relatedCustomer?: string;
  relatedEmployee?: string;
  relatedJob?: string;
  notes?: string;
  createdBy?: string;
  history?: string[];
}

interface NotificationsPageProps {
  dashboardLeads: any[];
  setDashboardLeads: React.Dispatch<React.SetStateAction<any[]>>;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({
  dashboardLeads,
  setDashboardLeads
}) => {
  const { loggedInUser, simulatedRole } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const {
    schedulingEvents,
    setSchedulingEvents,
    customers,
    setCustomers,
    documents,
    setDocuments,
    recentAiActions,
    setRecentAiActions,
    recentRoster
  } = useDomainData();
  const {
    takeSnapshot: onTakeSnapshot,
    openPageAIAnalysis: onOpenAIAnalysis,
    navigateToScreen: onNavigateToScreen,
    logOperationalEvent,
    triggerNotification
  } = useNavTelemetry();
  // 1. Core database of notifications (starts empty for every new account)
  const [notifList, setNotifList] = useState<DetailedNotification[]>([]);

  // 2. Navigation & UI States
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSummaryFilter, setActiveSummaryFilter] = useState<string>("all"); // "unread", "today", "high", "assigned", "system", "ai", "archived", "all"
  
  // Specific Filters
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  
  // Detail Dialog State
  const [selectedNotif, setSelectedNotif] = useState<DetailedNotification | null>(null);
  
  // Snooze and Assign sub-popups
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const [aiSummaryResult, setAiSummaryResult] = useState<string | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiExplainResult, setAiExplainResult] = useState<string | null>(null);
  const [aiExplainLoading, setAiExplainLoading] = useState(false);

  // Custom notification creator state
  const [showCreateCustomModal, setShowCreateCustomModal] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [customPriority, setCustomPriority] = useState<"Critical" | "High" | "Normal" | "Low" | "Informational">("Normal");
  const [customCategory, setCustomCategory] = useState("custom");
  const [customAssignedUser, setCustomAssignedUser] = useState("Owner");
  const [customCustomer, setCustomCustomer] = useState("");

  // 3. Notification Settings State (Channel Matrix)
  const [notifSettings, setNotifSettings] = useState<Record<string, Record<string, boolean>>>({
    customer: { email: true, sms: true, push: true, desktop: true, inapp: true, voice: false },
    leads: { email: true, sms: true, push: true, desktop: true, inapp: true, voice: true },
    estimates: { email: true, sms: false, push: true, desktop: true, inapp: true, voice: false },
    scheduling: { email: true, sms: true, push: true, desktop: true, inapp: true, voice: true },
    dispatch: { email: false, sms: true, push: true, desktop: true, inapp: true, voice: true },
    routes: { email: false, sms: true, push: true, desktop: false, inapp: true, voice: true },
    jobs: { email: true, sms: true, push: true, desktop: true, inapp: true, voice: false },
    timeclock: { email: false, sms: false, push: true, desktop: false, inapp: true, voice: false },
    inventory: { email: true, sms: false, push: true, desktop: true, inapp: true, voice: false },
    documents: { email: true, sms: false, push: false, desktop: false, inapp: true, voice: false },
    messages: { email: false, sms: true, push: true, desktop: true, inapp: true, voice: true },
    training: { email: true, sms: false, push: false, desktop: false, inapp: true, voice: false },
    revenue: { email: true, sms: true, push: true, desktop: true, inapp: true, voice: true },
    ai: { email: false, sms: false, push: true, desktop: true, inapp: true, voice: false },
    system: { email: true, sms: true, push: true, desktop: true, inapp: true, voice: true }
  });

  // 4. Role Permissions Matrix State
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({
    Owner: ["customer", "leads", "estimates", "scheduling", "dispatch", "routes", "jobs", "timeclock", "inventory", "documents", "messages", "training", "revenue", "ai", "system", "custom"],
    Manager: ["customer", "leads", "estimates", "scheduling", "dispatch", "routes", "jobs", "timeclock", "inventory", "documents", "messages", "training", "revenue", "ai", "system", "custom"],
    Employee: ["scheduling", "jobs", "messages", "training", "custom"],
    Technician: ["scheduling", "dispatch", "routes", "jobs", "timeclock", "inventory", "messages", "training"],
    Dispatch: ["scheduling", "dispatch", "routes", "jobs", "timeclock", "messages"],
    Sales: ["customer", "leads", "estimates", "messages"],
    Warehouse: ["inventory", "jobs", "documents"],
    Office: ["customer", "leads", "estimates", "scheduling", "documents", "messages"]
  });

  // 5. Shared Event Engine Simulator State (The cascading sequence)
  const [simStep, setSimStep] = useState<number>(-1); // -1 = idle
  const [simLogs, setSimLogs] = useState<string[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);

  // Helper: check if role has permission to see notification
  const currentSimulatedRole = activeRole || "Owner";
  const userHasPermission = (category: string) => {
    const allowedCategories = rolePermissions[currentSimulatedRole as keyof typeof rolePermissions] || [];
    return allowedCategories.includes(category);
  };

  // 6. Dynamic Counts for Summary Cards
  const summaryCounts = useMemo(() => {
    const unread = notifList.filter(n => !n.isRead && !n.isArchived).length;
    const todayCount = notifList.filter(n => n.time.startsWith("2026-07-06") && !n.isArchived).length;
    const high = notifList.filter(n => (n.priority === "Critical" || n.priority === "High") && !n.isArchived).length;
    
    // Assigned to me (mock based on current simulated role or loggedInUser name)
    const activeUsername = loggedInUser?.name || "Owner";
    const assigned = notifList.filter(n => 
      (n.assignedUser?.toLowerCase() === activeUsername.toLowerCase() || 
       n.assignedUser?.toLowerCase() === currentSimulatedRole.toLowerCase() ||
       n.assignedUser?.toLowerCase() === "all technicians" && currentSimulatedRole === "Technician") 
      && !n.isArchived
    ).length;

    const system = notifList.filter(n => n.category === "system" && !n.isArchived).length;
    const ai = notifList.filter(n => n.category === "ai" && !n.isArchived).length;
    const archived = notifList.filter(n => n.isArchived).length;

    return { unread, todayCount, high, assigned, system, ai, archived };
  }, [notifList, currentSimulatedRole, loggedInUser]);

  // 7. Filtering Logic
  const filteredNotifications = useMemo(() => {
    return notifList.filter((n) => {
      // Role permission check first
      if (!userHasPermission(n.category)) return false;

      // Summary selection filter
      if (activeSummaryFilter === "unread" && (n.isRead || n.isArchived)) return false;
      if (activeSummaryFilter === "today" && (!n.time.startsWith("2026-07-06") || n.isArchived)) return false;
      if (activeSummaryFilter === "high" && ((n.priority !== "Critical" && n.priority !== "High") || n.isArchived)) return false;
      if (activeSummaryFilter === "archived" && !n.isArchived) return false;
      if (activeSummaryFilter !== "archived" && n.isArchived) return false; // Default non-archived screen

      if (activeSummaryFilter === "assigned") {
        const activeUsername = loggedInUser?.name || "Owner";
        const matchesAssignment = 
          n.assignedUser?.toLowerCase() === activeUsername.toLowerCase() || 
          n.assignedUser?.toLowerCase() === currentSimulatedRole.toLowerCase() ||
          (n.assignedUser?.toLowerCase() === "all technicians" && currentSimulatedRole === "Technician");
        if (!matchesAssignment) return false;
      }
      if (activeSummaryFilter === "system" && n.category !== "system") return false;
      if (activeSummaryFilter === "ai" && n.category !== "ai") return false;

      // Priority Multiselect
      if (selectedPriorities.length > 0 && !selectedPriorities.includes(n.priority)) return false;

      // Category Multiselect
      if (selectedCategories.length > 0 && !selectedCategories.includes(n.category)) return false;

      // Search Query
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          n.title.toLowerCase().includes(q) ||
          n.description.toLowerCase().includes(q) ||
          (n.relatedCustomer && n.relatedCustomer.toLowerCase().includes(q)) ||
          (n.assignedUser && n.assignedUser.toLowerCase().includes(q)) ||
          n.category.toLowerCase().includes(q) ||
          n.priority.toLowerCase().includes(q) ||
          (n.notes && n.notes.toLowerCase().includes(q));
        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [notifList, activeSummaryFilter, selectedPriorities, selectedCategories, searchQuery, currentSimulatedRole]);

  // Priority color config
  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case "Critical":
        return { bg: "bg-red-50 text-red-600 border-red-200", indicator: "bg-red-500" };
      case "High":
        return { bg: "bg-orange-50 text-orange-600 border-orange-200", indicator: "bg-orange-500" };
      case "Normal":
        return { bg: "bg-[#EAF5FF] text-[#315C9F] border-[#9EC8EF]", indicator: "bg-[#315C9F]" };
      case "Low":
        return { bg: "bg-slate-50 text-slate-600 border-slate-200", indicator: "bg-slate-500" };
      case "Informational":
        return { bg: "bg-emerald-50 text-emerald-600 border-emerald-200", indicator: "bg-emerald-500" };
      default:
        return { bg: "bg-blue-50 text-blue-600 border-blue-200", indicator: "bg-blue-500" };
    }
  };

  const getModuleIcon = (cat: string) => {
    switch (cat) {
      case "customer": return "👥";
      case "leads": return "🎯";
      case "estimates": return "📝";
      case "scheduling": return "📅";
      case "dispatch": return "🚚";
      case "routes": return "🗺️";
      case "jobs": return "💼";
      case "timeclock": return "⏱️";
      case "inventory": return "📦";
      case "documents": return "📁";
      case "messages": return "💬";
      case "training": return "🎓";
      case "revenue": return "📈";
      case "ai": return "🤖";
      case "system": return "⚙️";
      case "custom": return "📌";
      default: return "🔔";
    }
  };

  // AI Summary generation mock
  const generateAISummary = (type: string) => {
    setAiSummaryLoading(true);
    setAiSummaryResult(null);
    triggerNotification(`Generating AI ${type}...`);
    
    setTimeout(() => {
      let result = "";
      if (type === "Daily Summary") {
        result = "📋 **Owner's AI Daily Business Summary (July 6, 2026)**\n\n" +
          "• **Financial Highlights**: One invoice PAID today ($4,850.00 for Drainage Project) and Theresa Webb's estimate approved ($6,200.00).\n" +
          "• **Operational Alerts**: Crew Alpha scheduling conflict detected at 11:30. Crew Beta is running 25 minutes late to 1420 Pine St due to I-5 traffic.\n" +
          "• **Inventory & Logistics**: Low stock warning active on PVC 3-inch pressure pipes (8 remaining). Suggest immediate restock approval.\n" +
          "• **AI Recommendations**: Customer David Miller has been inactive for 72 hours since Estimate Sent. Recommendation: Dispatch promotional follow-up sequence.";
      } else if (type === "Morning Brief") {
        result = "☀️ **Owner's Local OS Morning Dispatch Brief**\n\n" +
          "• 3 scheduled appointments active today starting at 09:00.\n" +
          "• Double booking flag active: Crew Alpha is overlapping. Please adjust dispatch grid.\n" +
          "• Stock limits checked: Auto-generated PO candidates ready for warehouse review.";
      } else if (type === "Missed Items" || type === "Action Items") {
        result = "⚠️ **High Priority Action Queue**\n\n" +
          "1. **Crew Overlap**: Resolve Crew Alpha dual-allocation to Survey & Drainage Project immediately (Scheduling screen).\n" +
          "2. **Pipeline Refill**: Dispatch Purchase Order PO-2026-991 to restock critical PVC pipe sizes.\n" +
          "3. **Customer Re-engagement**: Lead David Miller requires manual review or automated follow-up dispatch.";
      } else {
        result = `🤖 **AI ${type} Module Matrix**\n\nCurrently analyzing system signals... Operational events look clean. 1 schedule change, 1 paid invoice, and 1 approved estimate are the core events. No duplicate signals detected in database.`;
      }
      setAiSummaryResult(result);
      setAiSummaryLoading(false);
      triggerNotification("AI Summary compiled and ready!");
    }, 1500);
  };

  // AI Explain notification details mock
  const runAIExplain = (notif: DetailedNotification) => {
    setAiExplainLoading(true);
    setAiExplainResult(null);
    triggerNotification("AI Agent analyzing alert telemetry...");

    setTimeout(() => {
      let explanation = "";
      if (notif.category === "scheduling" && notif.priority === "Critical") {
        explanation = "🚨 **AI Diagnosis & Recommended Dispatch Solution**:\n\n" +
          "• **Core Cause**: Both appointments require 'Crew Alpha'. Owner's Local OS telemetry indicates Crew Alpha is physically located at site A, making B physically impossible.\n" +
          "• **Next Best Action**: Shift the Site Survey to 14:00 PM (open slot detected). Open the Scheduling Page to perform the swap instantly.\n" +
          "• **Automated Assistance**: Click 'Open Related Record' to navigate, or assign Crew Beta who is currently nearby and unallocated.";
      } else if (notif.category === "revenue") {
        explanation = "💰 **Financial Ledger Insight**:\n\n" +
          "• **Impact**: Boosts active monthly gross goal by 4.2%. Profit margins on this Drainage Project are high (estimated 62%).\n" +
          "• **Next Best Action**: Automatically sends tax reserve percentage (30%) to tax vault, and schedules material procurement on next batch loop.";
      } else {
        explanation = `ℹ️ **AI Analysis of '${notif.title}'**:\n\n` +
          `• **Event Details**: This is a "${notif.category}" warning flagged with "${notif.priority}" priority.\n` +
          `• **Operational Suggestion**: Ensure ${notif.assignedUser || "unassigned roles"} reviews notes: "${notif.notes || "None listed"}". Verify that timeline state updates correctly.`;
      }
      setAiExplainResult(explanation);
      setAiExplainLoading(false);
    }, 1200);
  };

  // Bulk Actions
  const handleMarkAllRead = () => {
    setNotifList(prev => prev.map(n => ({ ...n, isRead: true })));
    triggerNotification("Marked all notifications as read.");
  };

  const handleArchiveAllRead = () => {
    setNotifList(prev => prev.map(n => n.isRead ? { ...n, isArchived: true } : n));
    triggerNotification("Archived all read notifications.");
  };

  const handleRefresh = () => {
    triggerNotification("Synchronized with central Event Engine database. 0 duplicates found.");
  };

  // Create custom notification manual dispatch
  const handleCreateCustomNotification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() || !customDesc.trim()) {
      triggerNotification("Please fill in title and description.");
      return;
    }

    const newNotif: DetailedNotification = {
      id: `notif_custom_${Date.now()}`,
      category: customCategory,
      title: customTitle,
      description: customDesc,
      time: "2026-07-06 15:00",
      isRead: false,
      isArchived: false,
      isPinned: false,
      priority: customPriority,
      assignedUser: customAssignedUser,
      relatedCustomer: customCustomer || undefined,
      notes: "Custom manual override alert spawned by Owner console console.",
      createdBy: "Owner",
      history: ["2026-07-06 15:00: Manually created by Owner."]
    };

    setNotifList(prev => [newNotif, ...prev]);
    setShowCreateCustomModal(false);
    setCustomTitle("");
    setCustomDesc("");
    triggerNotification(`🔔 Custom Alert dispatched: ${customTitle}`);
  };

  // 8. Event Engine Simulator Cascade Trigger
  const triggerEventCascade = () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setSimLogs([]);
    setSimStep(0);
    
    const steps = [
      { msg: "🤝 Step 1: Customer accepts Estimate #EST-1092 online.", delay: 1000 },
      { msg: "📈 Step 2: Revenue ledger receives $6,200.00 approval, updating gross monthly forecast.", delay: 1200 },
      { msg: "📅 Step 3: Scheduling engine registers auto-draft Site Survey on YYYY-MM-DD.", delay: 1200 },
      { msg: "👥 Step 4: Customer Timeline updates with Estimate Approved status stamp.", delay: 1000 },
      { msg: "🔔 Step 5: Unified Event Engine fires notification block to Notification Center.", delay: 1200 },
      { msg: "🤖 Step 6: Gemini analyzes signals, generating 'Suggested Follow-up' AI action card.", delay: 1400 },
      { msg: "📊 Step 7: Dashboard real-time KPIs re-calculate and re-render perfectly.", delay: 1000 }
    ];

    let currentLog: string[] = [];
    let currentStep = 0;

    const runNextStep = () => {
      if (currentStep < steps.length) {
        currentLog.push(steps[currentStep].msg);
        setSimLogs([...currentLog]);
        setSimStep(currentStep);
        
        // At step 4, let's inject a real new notification into the state!
        if (currentStep === 4) {
          const cascadeNotif: DetailedNotification = {
            id: `notif_cascade_${Date.now()}`,
            category: "estimates",
            title: "Estimate Accepted (Engine Sync)",
            description: "Shared Event Engine: Estimate #EST-1092 accepted ($6,200). Pipeline updated.",
            time: "2026-07-06 15:10",
            isRead: false,
            isArchived: false,
            isPinned: false,
            priority: "High",
            assignedUser: "Marcus Vance",
            relatedCustomer: "Theresa Webb",
            notes: "Automatic system event spawned via acceptance portal pipeline.",
            createdBy: "Event Engine",
            history: ["2026-07-06 15:10: Injected by Event Engine on estimate accept."]
          };
          setNotifList(prev => [cascadeNotif, ...prev]);
        }

        // At step 5, let's inject an AI recommendation notification
        if (currentStep === 5) {
          const aiCascadeNotif: DetailedNotification = {
            id: `notif_cascade_ai_${Date.now()}`,
            category: "ai",
            title: "AI Project Recommendation",
            description: "Suggested Purchase: Auto-allocate parts for Drainage Project to avoid low stock warning.",
            time: "2026-07-06 15:11",
            isRead: false,
            isArchived: false,
            isPinned: false,
            priority: "Normal",
            assignedUser: "Owner",
            relatedCustomer: "Theresa Webb",
            notes: "PVC pipes allocation recommended based on project scope checklist.",
            createdBy: "Gemini Local AI",
            history: ["2026-07-06 15:11: Auto-generated from project allocation patterns."]
          };
          setNotifList(prev => [aiCascadeNotif, ...prev]);
        }

        currentStep++;
        setTimeout(runNextStep, steps[currentStep - 1].delay);
      } else {
        setIsSimulating(false);
        triggerNotification("🔄 Shared Event Engine Simulation Complete! Live records updated.");
      }
    };

    setTimeout(runNextStep, 500);
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      
      {/* 1. TOP CARD - Notification Center Title & Global Controls */}
      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h2 className="text-lg font-sans font-extrabold text-[#1F3557] uppercase tracking-wider flex items-center gap-2">
            <span className="select-none text-xl animate-pulse">🔔</span> Notification Center
          </h2>
          <p className="text-xs text-[#5E7393] font-sans font-semibold">
            Universal operational activity hub. Real-time synchronizations from central Event Engine.
          </p>
        </div>
        
        {/* Buttons Group */}
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-bold rounded-xl transition-all cursor-pointer"
            title="Mark All Read"
          >
            <Check className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mark All Read</span>
          </button>

          <button
            onClick={handleArchiveAllRead}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-bold rounded-xl transition-all cursor-pointer"
            title="Archive Read"
          >
            <Archive className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Archive Read</span>
          </button>

          <button
            onClick={() => generateAISummary("Daily Summary")}
            className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-violet-100 to-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-xl transition-all hover:scale-[1.02] cursor-pointer"
            title="AI Executive Summary"
          >
            <Sparkles className="w-3.5 h-3.5 animate-pulse text-indigo-600" />
            <span>AI Summary</span>
          </button>

          <button
            onClick={() => setShowFiltersPanel(!showFiltersPanel)}
            className={`flex items-center gap-1.5 px-3 py-2 border text-xs font-bold rounded-xl transition-all cursor-pointer ${
              showFiltersPanel || selectedPriorities.length > 0 || selectedCategories.length > 0
                ? "bg-[#315C9F] text-white border-[#315C9F]"
                : "bg-[#EAF5FF] hover:bg-[#BDDDF8] border-[#9EC8EF] text-[#315C9F]"
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters</span>
          </button>

          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-bold rounded-xl transition-all cursor-pointer"
            title="Force Synchronize Feed"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {currentSimulatedRole === "Owner" && (
            <button
              onClick={() => setShowCreateCustomModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm"
              title="Spawn Custom Alert"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Spawn Alert</span>
            </button>
          )}

          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-bold rounded-xl transition-all cursor-pointer"
            title="Notification Matrix Settings"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          {currentSimulatedRole === "Owner" && (
            <button
              onClick={() => setShowPermissionsModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-bold rounded-xl transition-all cursor-pointer"
              title="Role Visibility Constraints"
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Permissions</span>
            </button>
          )}
        </div>
      </div>

      {/* AI SUMMARY EXPANSION AREA */}
      {aiSummaryResult && (
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-indigo-200 p-5 rounded-2xl relative shadow-sm animate-fade-in text-left space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-black uppercase text-indigo-900 tracking-wider">AI Executive Insights</h3>
            </div>
            <button 
              onClick={() => setAiSummaryResult(null)}
              className="text-indigo-400 hover:text-indigo-900 text-xs font-bold"
            >
              ✕ Clear Summary
            </button>
          </div>
          <div className="text-xs font-sans text-indigo-950 leading-relaxed whitespace-pre-line bg-white/60 p-4 rounded-xl border border-indigo-100/50 font-medium">
            {aiSummaryResult}
          </div>
        </div>
      )}

      {/* 2. SUMMARY CARDS - Clickable Quick filters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {[
          { id: "all", label: "All Alerts", count: notifList.filter(n => !n.isArchived).length, icon: "🔔", color: "border-slate-200 bg-[#EAF5FF]" },
          { id: "unread", label: "Unread", count: summaryCounts.unread, icon: "🔵", color: "border-[#9EC8EF] bg-[#BDDDF8]/40" },
          { id: "today", label: "Today", count: summaryCounts.todayCount, icon: "📅", color: "border-sky-200 bg-sky-50/30" },
          { id: "high", label: "High Priority", count: summaryCounts.high, icon: "🔥", color: "border-orange-200 bg-orange-50/20" },
          { id: "assigned", label: "Assigned To Me", count: summaryCounts.assigned, icon: "👤", color: "border-violet-200 bg-violet-50/20" },
          { id: "system", label: "System Alerts", count: summaryCounts.system, icon: "⚙️", color: "border-rose-200 bg-rose-50/20" },
          { id: "ai", label: "AI Suggestions", count: summaryCounts.ai, icon: "🤖", color: "border-indigo-200 bg-indigo-50/20" },
          { id: "archived", label: "Archived Logs", count: summaryCounts.archived, icon: "📦", color: "border-slate-200 bg-slate-100/40" }
        ].map((card) => {
          const isActive = activeSummaryFilter === card.id;
          return (
            <button
              key={card.id}
              onClick={() => {
                setActiveSummaryFilter(card.id);
                triggerNotification(`Quick-filtered dashboard view: ${card.label}`);
              }}
              className={`p-3 rounded-2xl border text-left flex flex-col justify-between gap-2.5 transition-all cursor-pointer relative overflow-hidden ${
                isActive 
                  ? "bg-[#315C9F] text-white border-[#315C9F] shadow-md scale-[1.02]" 
                  : `${card.color} text-[#1F3557] hover:scale-[1.01]`
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-base select-none">{card.icon}</span>
                {card.count > 0 && (
                  <span className={`text-[9.5px] px-1.5 py-0.5 rounded-full font-black font-mono ${
                    isActive ? "bg-white text-[#315C9F]" : "bg-[#1F3557] text-white"
                  }`}>
                    {card.count}
                  </span>
                )}
              </div>
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? "text-blue-100" : "text-[#5E7393]"}`}>
                  {card.label}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* EVENT ENGINE CASCADE SANDBOX CONTROL CARD */}
      <div className="bg-[#C7E3FA] rounded-2xl p-5 border border-[#9EC8EF] shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-[#9EC8EF]/40 pb-3">
          <div>
            <h3 className="text-xs font-black uppercase text-[#1F3557] tracking-wider flex items-center gap-1.5">
              <span>🔄</span> Event Engine Core Simulator
            </h3>
            <p className="text-[10.5px] text-[#5E7393] font-sans font-medium mt-0.5">
              Watch a synchronized live estimate acceptance cascade. Witness state change propagation through the shared framework.
            </p>
          </div>
          <button
            onClick={triggerEventCascade}
            disabled={isSimulating}
            className={`px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm transition-all flex items-center gap-2 ${
              isSimulating 
                ? "bg-slate-300 text-slate-500 cursor-not-allowed" 
                : "bg-[#315C9F] text-white hover:bg-[#25467A]"
            }`}
          >
            {isSimulating ? "Cascading..." : "Trigger Accept Cascade"}
          </button>
        </div>

        {/* Live visualization grid */}
        {simLogs.length > 0 && (
          <div className="p-4 bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl space-y-3 font-sans text-xs">
            <h4 className="text-[9.5px] font-black uppercase text-[#315C9F] tracking-widest">Active Propagation Signal Tracker</h4>
            <div className="space-y-2">
              {simLogs.map((log, idx) => (
                <div 
                  key={idx} 
                  className={`flex items-center gap-2 p-1.5 rounded transition-all font-semibold ${
                    idx === simStep ? "bg-[#BDDDF8] text-[#1F3557] font-bold border-l-2 border-[#315C9F]" : "text-slate-500"
                  }`}
                >
                  <span className="shrink-0">
                    {idx < simStep ? "🟢" : idx === simStep ? "⚡" : "⚪"}
                  </span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SEARCH AND ADVANCED FILTERS PANEL */}
      <div className="bg-[#C7E3FB] rounded-2xl p-4 border border-[#A9CDEE] space-y-3">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#5E7393]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notifications by keyword, customer name, technician, estimate ID, low inventory pipe size..."
            className="w-full text-xs bg-[#E3F3FF] border border-[#A9CDEE] rounded-xl pl-10 pr-10 py-3.5 focus:outline-none focus:border-[#4A9BFF] font-medium font-sans text-slate-700 shadow-inner"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-3.5 text-xs text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* Advanced filter toggles inside section */}
        {showFiltersPanel && (
          <div className="p-4 bg-[#E3F3FF] border border-[#A9CDEE] rounded-xl space-y-4 animate-fade-in">
            {/* Priority Selector pills */}
            <div className="space-y-1.5 text-left">
              <label className="text-[9.5px] uppercase font-black text-[#342D7E] tracking-wider block">Priority Segment Filter</label>
              <div className="flex flex-wrap gap-2">
                {["Critical", "High", "Normal", "Low", "Informational"].map((pri) => {
                  const isSel = selectedPriorities.includes(pri);
                  return (
                    <button
                      key={pri}
                      onClick={() => {
                        setSelectedPriorities(prev => 
                          isSel ? prev.filter(p => p !== pri) : [...prev, pri]
                        );
                      }}
                      className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                        isSel 
                          ? "bg-[#315C9F] text-white border-[#315C9F]" 
                          : "bg-[#F5FAFF] hover:bg-[#BDDDF8] border-[#9EC8EF] text-[#315C9F]"
                      }`}
                    >
                      {pri}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category selection list */}
            <div className="space-y-1.5 text-left">
              <label className="text-[9.5px] uppercase font-black text-[#342D7E] tracking-wider block">Module Origin Filter</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {[
                  { id: "customer", label: "Customer" },
                  { id: "leads", label: "Leads" },
                  { id: "estimates", label: "Estimates" },
                  { id: "scheduling", label: "Scheduling" },
                  { id: "dispatch", label: "Dispatch" },
                  { id: "routes", label: "Routes" },
                  { id: "jobs", label: "Jobs" },
                  { id: "timeclock", label: "Time Clock" },
                  { id: "inventory", label: "Inventory" },
                  { id: "documents", label: "Documents" },
                  { id: "messages", label: "Messages" },
                  { id: "training", label: "Training" },
                  { id: "revenue", label: "Revenue" },
                  { id: "ai", label: "AI Suggestions" },
                  { id: "system", label: "System Monitor" },
                  { id: "custom", label: "Custom Alerts" }
                ].map((cat) => {
                  const isSel = selectedCategories.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setSelectedCategories(prev => 
                          isSel ? prev.filter(c => c !== cat.id) : [...prev, cat.id]
                        );
                      }}
                      className={`text-[9px] font-bold px-2 py-1.5 rounded-lg border text-center transition-all truncate cursor-pointer ${
                        isSel 
                          ? "bg-[#315C9F] text-white border-[#315C9F]" 
                          : "bg-[#F5FAFF] hover:bg-[#BDDDF8] border-[#9EC8EF] text-[#315C9F]"
                      }`}
                    >
                      {getModuleIcon(cat.id)} {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Reset buttons */}
            <div className="flex justify-end gap-2 text-xs pt-1 border-t border-[#A9CDEE]/40">
              <button
                onClick={() => {
                  setSelectedPriorities([]);
                  setSelectedCategories([]);
                  triggerNotification("Cleared advanced filter rules.");
                }}
                className="text-slate-500 hover:text-slate-800 font-bold px-3 py-1"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI SUGGESTED SHORTCUTS / BRIEFINGS TAB PANEL */}
      <div className="bg-[#C7E3FB] p-5 rounded-2xl border border-[#A9CDEE] shadow-sm flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#315C9F]" />
          <h3 className="text-xs font-black uppercase text-[#1F3557] tracking-wider">AI Analytical Digest Routines</h3>
        </div>
        <p className="text-[10.5px] text-[#5E7393] font-sans font-medium">
          Generate structured analytical reports by aggregating current database notifications. No duplicates.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {["Daily Summary", "Morning Brief", "Evening Recap", "Weekly Summary", "Monthly Summary", "High Priority Summary", "Missed Items", "Action Items"].map((type) => (
            <button
              key={type}
              onClick={() => generateAISummary(type)}
              className="px-3 py-2 bg-[#E3F3FF] hover:bg-[#BDDDF8] border border-[#A9CDEE] text-[#1F3557] rounded-xl text-left text-[10.5px] font-bold flex items-center justify-between transition-all cursor-pointer hover:translate-x-0.5"
            >
              <span>{type}</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#5E7393] shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* 3. NOTIFICATION LISTING GRID */}
      <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#A9CDEE] pb-3">
          <h3 className="text-xs font-black uppercase text-[#1F3557] tracking-wider">
            Operational Stream ({filteredNotifications.length} entries shown)
          </h3>
          <span className="text-[10px] font-mono text-slate-500 font-bold">
            Simulated Role: <strong className="text-[#315C9F]">{currentSimulatedRole}</strong>
          </span>
        </div>

        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center bg-[#E3F3FF] rounded-2xl border border-dashed border-[#A9CDEE] p-6">
            <Bell className="w-10 h-10 text-slate-400 mb-3 animate-pulse" />
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-600">All Alerts Cleared</h4>
            <p className="text-[11px] text-slate-500 mt-1 max-w-xs leading-relaxed font-sans font-medium">
              No notifications matching current filters or role permissions. Try resetting search parameters or spawning manual custom triggers.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredNotifications.map((notif) => {
              const priStyle = getPriorityStyle(notif.priority);
              return (
                <div
                  key={notif.id}
                  onClick={() => {
                    setSelectedNotif(notif);
                    setAiExplainResult(null); // reset explanation state for new notif
                  }}
                  className={`p-4 rounded-2xl border text-left cursor-pointer transition-all hover:bg-[#BDDDF8] hover:scale-[1.002] shadow-sm relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    notif.isRead 
                      ? "bg-[#EAF5FF]/80 border-[#A9CDEE] text-slate-600" 
                      : "bg-[#BDDDF8] border-[#A9CDEE] font-semibold text-[#1F3557]"
                  }`}
                >
                  {/* Left segment: indicators and copy */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Color indicator bar */}
                    <div className={`w-1.5 self-stretch rounded-full ${priStyle.indicator} shrink-0`} />

                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Module Tag */}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/60 border border-[#9EC8EF] rounded-md text-[9px] font-bold uppercase tracking-wider">
                          <span className="select-none">{getModuleIcon(notif.category)}</span>
                          <span>{notif.category}</span>
                        </span>

                        {/* Priority Badge */}
                        <span className={`inline-block text-[9px] px-2 py-0.5 rounded-md font-bold border uppercase tracking-wider ${priStyle.bg}`}>
                          {notif.priority}
                        </span>

                        {notif.isPinned && (
                          <span className="text-red-500 text-xs">
                            <Pin className="w-3 h-3 inline rotate-45" />
                          </span>
                        )}

                        {!notif.isRead && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse shrink-0" />
                        )}
                      </div>

                      <h4 className={`text-xs font-black uppercase tracking-wide leading-tight truncate ${notif.isRead ? "text-slate-700" : "text-[#1F3557]"}`}>
                        {notif.title}
                      </h4>
                      
                      <p className="text-xs text-slate-500 font-sans font-medium leading-relaxed">
                        {notif.description}
                      </p>
                    </div>
                  </div>

                  {/* Right segment: timestamp, assigned user, customer link */}
                  <div className="flex flex-row md:flex-col items-start md:items-end justify-between md:justify-center shrink-0 border-t md:border-t-0 border-[#A9CDEE]/30 pt-2.5 md:pt-0 gap-1.5">
                    <span className="text-[10px] font-mono text-slate-400 font-semibold">
                      ⏱️ {notif.time}
                    </span>

                    {notif.assignedUser && (
                      <span className="text-[10px] bg-white/50 border border-[#9EC8EF] px-1.5 py-0.5 rounded text-slate-600 font-sans font-bold flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-[#315C9F]" /> {notif.assignedUser}
                      </span>
                    )}

                    {notif.relatedCustomer && (
                      <span className="text-[9.5px] text-[#315C9F] hover:underline font-bold">
                        👤 {notif.relatedCustomer}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. NOTIFICATION DETAILS POPUP DIALOG */}
      {selectedNotif && (
        <div className="fixed inset-0 bg-[#1F3557]/45 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#C7E3FB] max-w-2xl w-full rounded-3xl border border-[#9EC8EF] shadow-2xl p-6 overflow-y-auto max-h-[90vh] space-y-5 text-left animate-scale-up">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl select-none">{getModuleIcon(selectedNotif.category)}</span>
                <div>
                  <h3 className="text-sm font-black uppercase text-[#1F3557] tracking-wider">
                    {selectedNotif.title}
                  </h3>
                  <p className="text-[11px] text-[#5E7393] font-sans font-semibold uppercase tracking-wider">
                    Origin Module: {selectedNotif.category} • {selectedNotif.priority} Priority
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedNotif(null)}
                className="w-8 h-8 rounded-full bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] flex items-center justify-center text-slate-500 hover:text-slate-800 text-sm font-black transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Metadata Detail Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-[#EAF5FF] p-4 rounded-2xl border border-[#9EC8EF] text-xs font-semibold text-slate-700">
              <div>
                <span className="block text-[9px] uppercase text-[#5E7393] font-bold">Date</span>
                <span className="font-mono text-[#1F3557]">{selectedNotif.time.split(" ")[0]}</span>
              </div>
              <div>
                <span className="block text-[9px] uppercase text-[#5E7393] font-bold">Time</span>
                <span className="font-mono text-[#1F3557]">{selectedNotif.time.split(" ")[1] || "12:00"}</span>
              </div>
              <div>
                <span className="block text-[9px] uppercase text-[#5E7393] font-bold">Created By</span>
                <span className="text-[#315C9F]">{selectedNotif.createdBy || "System"}</span>
              </div>
              <div>
                <span className="block text-[9px] uppercase text-[#5E7393] font-bold">Assigned To</span>
                <span className="text-[#315C9F]">{selectedNotif.assignedUser || "Unassigned"}</span>
              </div>
              {selectedNotif.relatedCustomer && (
                <div>
                  <span className="block text-[9px] uppercase text-[#5E7393] font-bold">Customer</span>
                  <span className="text-[#315C9F] hover:underline cursor-pointer" onClick={() => {
                    setSelectedNotif(null);
                    onNavigateToScreen("customers", { customerId: "cust_1" });
                  }}>
                    👤 {selectedNotif.relatedCustomer}
                  </span>
                </div>
              )}
              {selectedNotif.relatedEmployee && (
                <div>
                  <span className="block text-[9px] uppercase text-[#5E7393] font-bold">Employee</span>
                  <span className="text-[#1F3557]">{selectedNotif.relatedEmployee}</span>
                </div>
              )}
              {selectedNotif.relatedJob && (
                <div>
                  <span className="block text-[9px] uppercase text-[#5E7393] font-bold">Related Job</span>
                  <span className="text-[#1F3557]">{selectedNotif.relatedJob}</span>
                </div>
              )}
              <div>
                <span className="block text-[9px] uppercase text-[#5E7393] font-bold">Current Status</span>
                <span className="inline-block text-[9px] bg-white border border-[#9EC8EF] text-[#315C9F] font-bold uppercase rounded px-1.5 py-0.5 mt-0.5">
                  {selectedNotif.isRead ? "Read" : "Unread"} {selectedNotif.isArchived ? "• Archived" : ""}
                </span>
              </div>
            </div>

            {/* Main Description */}
            <div className="space-y-1">
              <label className="text-[9px] uppercase text-[#5E7393] font-black tracking-wider">Alert Summary Description</label>
              <div className="p-4 bg-white/70 rounded-xl border border-[#9EC8EF] text-xs font-sans text-slate-800 leading-relaxed font-semibold">
                {selectedNotif.description}
              </div>
            </div>

            {/* Notes Section with Editable text area */}
            <div className="space-y-1">
              <label className="text-[9px] uppercase text-[#5E7393] font-black tracking-wider block">Operational Action Notes</label>
              <textarea
                value={selectedNotif.notes || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setNotifList(prev => prev.map(n => n.id === selectedNotif.id ? { ...n, notes: val } : n));
                  setSelectedNotif(prev => prev ? { ...prev, notes: val } : null);
                }}
                className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none font-medium font-sans text-slate-700"
                rows={3}
                placeholder="Append operational instructions, dispatcher notes, or resolution telemetry notes here..."
              />
            </div>

            {/* AI EXPLAIN ACCORDION BUTTON */}
            <div className="space-y-2">
              <button
                onClick={() => runAIExplain(selectedNotif)}
                className="w-full py-2.5 bg-gradient-to-r from-violet-100 to-indigo-100 hover:from-violet-200 hover:to-indigo-200 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 animate-pulse text-indigo-600" />
                <span>Explain Alert with AI Agent</span>
              </button>

              {aiExplainLoading && (
                <div className="p-4 bg-white/60 border border-indigo-200 rounded-xl animate-pulse text-center text-xs font-bold text-indigo-900">
                  🤖 Analyzing notification context & routing metrics...
                </div>
              )}

              {aiExplainResult && !aiExplainLoading && (
                <div className="p-4 bg-gradient-to-r from-violet-50 to-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-950 whitespace-pre-line leading-relaxed font-semibold">
                  {aiExplainResult}
                </div>
              )}
            </div>

            {/* History Audit Trail */}
            {selectedNotif.history && selectedNotif.history.length > 0 && (
              <div className="space-y-1 text-xs">
                <span className="block text-[9px] uppercase text-[#5E7393] font-black tracking-wider">Audit Log History</span>
                <div className="p-3 bg-[#EAF5FF]/60 rounded-xl border border-[#9EC8EF]/40 font-mono text-[10px] text-slate-500 space-y-1">
                  {selectedNotif.history.map((h, i) => (
                    <div key={i}>• {h}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons row */}
            <div className="border-t border-[#9EC8EF] pt-4 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                
                {/* Left controls */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => {
                      const updatedRead = !selectedNotif.isRead;
                      setNotifList(prev => prev.map(n => n.id === selectedNotif.id ? { ...n, isRead: updatedRead } : n));
                      setSelectedNotif(prev => prev ? { ...prev, isRead: updatedRead } : null);
                      triggerNotification(`Marked alert as ${updatedRead ? "READ" : "UNREAD"}`);
                    }}
                    className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-bold rounded-xl cursor-pointer"
                  >
                    {selectedNotif.isRead ? <EyeOff className="w-3.5 h-3.5 inline mr-1" /> : <Eye className="w-3.5 h-3.5 inline mr-1" />}
                    {selectedNotif.isRead ? "Mark Unread" : "Mark Read"}
                  </button>

                  <button
                    onClick={() => {
                      const updatedPin = !selectedNotif.isPinned;
                      setNotifList(prev => prev.map(n => n.id === selectedNotif.id ? { ...n, isPinned: updatedPin } : n));
                      setSelectedNotif(prev => prev ? { ...prev, isPinned: updatedPin } : null);
                      triggerNotification(updatedPin ? "Pinned alert to top of stream" : "Unpinned alert");
                    }}
                    className={`px-3 py-2 border text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1 ${
                      selectedNotif.isPinned 
                        ? "bg-amber-100 border-amber-300 text-amber-800" 
                        : "bg-[#EAF5FF] hover:bg-[#BDDDF8] border-[#9EC8EF] text-[#315C9F]"
                    }`}
                  >
                    <Pin className="w-3.5 h-3.5 rotate-45" />
                    {selectedNotif.isPinned ? "Unpin Alert" : "Pin Alert"}
                  </button>

                  {/* Snooze Toggle */}
                  <div className="relative">
                    <button
                      onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
                      className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Snooze</span>
                    </button>

                    {showSnoozeMenu && (
                      <div className="absolute bottom-11 left-0 bg-[#C7E3FB] text-[#1F3557] rounded-xl border border-[#9EC8EF] shadow-lg p-2.5 w-44 z-50 text-xs font-bold space-y-1">
                        {["15 Minutes", "30 Minutes", "1 Hour", "Tomorrow", "Next Week"].map((dur) => (
                          <button
                            key={dur}
                            onClick={() => {
                              setNotifList(prev => prev.map(n => n.id === selectedNotif.id ? { ...n, isRead: true, notes: (n.notes || "") + ` (Snoozed for ${dur})` } : n));
                              triggerNotification(`Snoozed alert for ${dur}`);
                              setShowSnoozeMenu(false);
                              setSelectedNotif(null);
                            }}
                            className="w-full text-left px-2 py-1.5 hover:bg-[#BDDDF8] rounded"
                          >
                            • {dur}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Assign Toggle */}
                  <div className="relative">
                    <button
                      onClick={() => setShowAssignMenu(!showAssignMenu)}
                      className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Assign</span>
                    </button>

                    {showAssignMenu && (
                      <div className="absolute bottom-11 left-0 bg-[#C7E3FB] text-[#1F3557] rounded-xl border border-[#9EC8EF] shadow-lg p-2.5 w-48 z-50 text-xs font-bold space-y-1">
                        {(recentRoster.length > 0 ? recentRoster.map(r => r.name) : ["No team members yet"]).map((user) => (
                          <button
                            key={user}
                            onClick={() => {
                              setNotifList(prev => prev.map(n => n.id === selectedNotif.id ? { ...n, assignedUser: user } : n));
                              setSelectedNotif(prev => prev ? { ...prev, assignedUser: user } : null);
                              triggerNotification(`Assigned alert to: ${user}`);
                              setShowAssignMenu(false);
                            }}
                            className="w-full text-left px-2 py-1.5 hover:bg-[#BDDDF8] rounded"
                          >
                            👤 {user}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right controls */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      const updatedArchived = !selectedNotif.isArchived;
                      setNotifList(prev => prev.map(n => n.id === selectedNotif.id ? { ...n, isArchived: updatedArchived } : n));
                      setSelectedNotif(null);
                      triggerNotification(updatedArchived ? "Moved notification to Archived Logs." : "Unarchived notification.");
                    }}
                    className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>{selectedNotif.isArchived ? "Unarchive" : "Archive"}</span>
                  </button>

                  <button
                    onClick={() => {
                      setNotifList(prev => prev.filter(n => n.id !== selectedNotif.id));
                      setSelectedNotif(null);
                      triggerNotification("Permanently deleted notification alert.");
                    }}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>

              </div>

              {/* Direct Deep Link Navigator */}
              <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-[#315C9F] shrink-0" />
                  <p className="text-[11px] text-slate-600 font-sans font-semibold leading-normal">
                    This notification originates from the <strong className="text-[#315C9F] uppercase">{selectedNotif.category}</strong> module database. Click to open originating screen.
                  </p>
                </div>
                
                <button
                  onClick={() => {
                    setSelectedNotif(null);
                    // Map origin category to correct OS screen ID
                    let screenId = selectedNotif.category;
                    if (screenId === "ai") screenId = "ai_assistant";
                    if (screenId === "system" || screenId === "custom") screenId = "settings";
                    
                    // Route parameters if any
                    let params: any = {};
                    if (selectedNotif.relatedCustomer) {
                      params.customerId = "cust_1";
                    }
                    onNavigateToScreen(screenId, params);
                    triggerNotification(`Direct link: Navigated to ${screenId} workspace segment.`);
                  }}
                  className="px-3.5 py-2 bg-[#315C9F] hover:bg-[#25467A] text-white text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer shrink-0 shadow-sm flex items-center gap-1"
                >
                  <span>Open Related Record</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* 5. SPAWN CUSTOM NOTIFICATION FORM MODAL */}
      {showCreateCustomModal && (
        <div className="fixed inset-0 bg-[#1F3557]/45 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fade-in">
          <form 
            onSubmit={handleCreateCustomNotification} 
            className="bg-[#C7E3FB] max-w-md w-full rounded-3xl border border-[#9EC8EF] shadow-2xl p-6 space-y-4 text-left animate-scale-up"
          >
            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3">
              <h3 className="text-sm font-black uppercase text-[#1F3557] tracking-wider">
                Spawn Owner Custom Alert
              </h3>
              <button 
                type="button" 
                onClick={() => setShowCreateCustomModal(false)}
                className="text-[#5E7393] hover:text-[#1F3557] font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Alert Title</label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g. Utility Line Check Completed"
                required
                className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A9BFF] font-medium font-sans text-slate-700"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Description Details</label>
              <textarea
                value={customDesc}
                onChange={(e) => setCustomDesc(e.target.value)}
                placeholder="Write specific notification instructions here..."
                required
                className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A9BFF] font-medium font-sans text-slate-700 text-left"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Priority</label>
                <select
                  value={customPriority}
                  onChange={(e) => setCustomPriority(e.target.value as any)}
                  className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none font-bold text-slate-700 cursor-pointer"
                >
                  <option value="Critical">🚨 Critical</option>
                  <option value="High">🔥 High</option>
                  <option value="Normal">🔵 Normal</option>
                  <option value="Low">⚪ Low</option>
                  <option value="Informational">💚 Informational</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Module Origin</label>
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none font-bold text-slate-700 cursor-pointer"
                >
                  <option value="custom">📌 Custom Alert</option>
                  <option value="system">⚙️ System Alert</option>
                  <option value="scheduling">📅 Scheduling Alert</option>
                  <option value="inventory">📦 Inventory Alert</option>
                  <option value="customer">👥 Customer Alert</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Assigned Staff</label>
                <input
                  type="text"
                  value={customAssignedUser}
                  onChange={(e) => setCustomAssignedUser(e.target.value)}
                  className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none font-medium text-slate-700"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Related Customer</label>
                <input
                  type="text"
                  value={customCustomer}
                  onChange={(e) => setCustomCustomer(e.target.value)}
                  placeholder="e.g. David Miller"
                  className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none font-medium text-slate-700"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setShowCreateCustomModal(false)}
                className="text-slate-500 hover:text-slate-800 font-bold px-3 py-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl cursor-pointer"
              >
                Dispatch Alert
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 6. NOTIFICATION MATRIX SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-[#1F3557]/45 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#C7E3FB] max-w-4xl w-full rounded-3xl border border-[#9EC8EF] shadow-2xl p-6 overflow-y-auto max-h-[90vh] space-y-5 text-left animate-scale-up">
            
            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#315C9F]" />
                <h3 className="text-sm font-black uppercase text-[#1F3557] tracking-wider">
                  Notification Channel Router Matrix
                </h3>
              </div>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-500 hover:text-slate-800 text-sm font-black"
              >
                ✕ Close
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-normal font-sans font-medium">
              Configure independent notification dispatch behaviors independently for every corporate module. Keep your communication lines fully optimized.
            </p>

            {/* Matrix Table */}
            <div className="overflow-x-auto rounded-2xl border border-[#9EC8EF] bg-white">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-[#EAF5FF] border-b border-[#9EC8EF] font-bold text-[#1F3557]">
                    <th className="p-3">Module Name</th>
                    <th className="p-3 text-center"><Mail className="w-3.5 h-3.5 inline mr-1" />Email</th>
                    <th className="p-3 text-center"><Phone className="w-3.5 h-3.5 inline mr-1" />SMS</th>
                    <th className="p-3 text-center"><BellRing className="w-3.5 h-3.5 inline mr-1" />Push</th>
                    <th className="p-3 text-center"><Laptop className="w-3.5 h-3.5 inline mr-1" />Desktop</th>
                    <th className="p-3 text-center"><Bell className="w-3.5 h-3.5 inline mr-1" />In-App</th>
                    <th className="p-3 text-center"><Volume2 className="w-3.5 h-3.5 inline mr-1" />Voice Announcement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {Object.keys(notifSettings).map((mod) => (
                    <tr key={mod} className="hover:bg-slate-50/50">
                      <td className="p-3 uppercase font-bold text-[#1F3557]">
                        <span className="select-none mr-1.5">{getModuleIcon(mod)}</span> {mod}
                      </td>
                      {["email", "sms", "push", "desktop", "inapp", "voice"].map((chan) => {
                        const val = notifSettings[mod][chan];
                        return (
                          <td key={chan} className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={val}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setNotifSettings(prev => ({
                                  ...prev,
                                  [mod]: { ...prev[mod], [chan]: checked }
                                }));
                                triggerNotification(`Configured ${mod} ${chan} notification channel to: ${checked ? "Active" : "Disabled"}`);
                              }}
                              className="w-4 h-4 rounded text-[#315C9F] border-[#9EC8EF] focus:ring-[#315C9F] cursor-pointer"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  triggerNotification("Saved notification channel matrix configuration.");
                }}
                className="px-5 py-2.5 bg-[#315C9F] hover:bg-[#25467A] text-white font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm text-xs"
              >
                Save Operational Preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. ROLE PERMISSIONS PRIVILEGE CONFIGURATION */}
      {showPermissionsModal && (
        <div className="fixed inset-0 bg-[#1F3557]/45 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#C7E3FB] max-w-3xl w-full rounded-3xl border border-[#9EC8EF] shadow-2xl p-6 overflow-y-auto max-h-[90vh] space-y-5 text-left animate-scale-up">
            
            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#315C9F]" />
                <h3 className="text-sm font-black uppercase text-[#1F3557] tracking-wider">
                  Role-Based Notification Visibility Privileges
                </h3>
              </div>
              <button 
                onClick={() => setShowPermissionsModal(false)}
                className="text-slate-500 hover:text-slate-800 text-sm font-black"
              >
                ✕ Close
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-normal font-sans font-medium">
              Restrict alert flows by organizational division. Field technicians, dispatch, sales, and warehouse managers should only receive alerts matching their strict security profiles.
            </p>

            <div className="space-y-3.5">
              {Object.keys(rolePermissions).map((role) => (
                <div key={role} className="bg-[#EAF5FF] p-4 rounded-2xl border border-[#9EC8EF] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase text-[#1F3557] tracking-wider">
                      👤 {role} Division Profile
                    </h4>
                    <span className="text-[10px] font-mono text-[#5E7393] font-bold">
                      {rolePermissions[role].length} Authorized Categories
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "customer", "leads", "estimates", "scheduling", "dispatch", "routes", "jobs", "timeclock", "inventory", "documents", "messages", "training", "revenue", "ai", "system", "custom"
                    ].map((cat) => {
                      const hasPerm = rolePermissions[role].includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setRolePermissions(prev => {
                              const list = prev[role];
                              const newList = list.includes(cat) 
                                ? list.filter(item => item !== cat) 
                                : [...list, cat];
                              return { ...prev, [role]: newList };
                            });
                            triggerNotification(`Updated ${role} alert permissions: ${cat}`);
                          }}
                          className={`text-[9.5px] font-bold px-2 py-1.5 rounded-lg border flex items-center gap-1 cursor-pointer transition-all ${
                            hasPerm 
                              ? "bg-[#315C9F] text-white border-[#315C9F]" 
                              : "bg-[#F5FAFF] border-[#9EC8EF] text-slate-400 hover:text-slate-600"
                          }`}
                        >
                          <span className="select-none">{getModuleIcon(cat)}</span>
                          <span className="uppercase tracking-wider">{cat}</span>
                          {hasPerm && <Check className="w-2.5 h-2.5 ml-0.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  setShowPermissionsModal(false);
                  triggerNotification("Role Alert visibility controls successfully deployed.");
                }}
                className="px-5 py-2.5 bg-[#315C9F] hover:bg-[#25467A] text-white font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm text-xs"
              >
                Deploy Security Profiles
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
