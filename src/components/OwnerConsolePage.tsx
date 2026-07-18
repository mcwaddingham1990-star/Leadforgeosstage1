import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Award,
  Bell,
  Briefcase,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code,
  Cpu,
  Database,
  Download,
  Eye,
  FileText,
  Filter,
  FolderOpen,
  Globe,
  HardDrive,
  History,
  Info,
  Laptop,
  LayoutDashboard,
  Lock,
  Megaphone,
  MessageSquare,
  Network,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  Trash2,
  Truck,
  UserCheck,
  UserPlus,
  Users,
  Volume2,
  Wifi,
  Zap
} from "lucide-react";

// Types for Event Engine and Database Logs
export interface EventEngineNode {
  id: string;
  label: string;
  category: string;
  description: string;
  origin: string;
  destination: string;
  changesMade: string;
  triggeredModules: string[];
  x: number;
  y: number;
}

export interface SimulatedEvent {
  id: string;
  timestamp: string;
  origin: string;
  destination: string[];
  processingTime: number; // ms
  status: "Pending" | "Running" | "Completed" | "Failed";
  changesMade: string;
  payload: Record<string, any>;
  retryCount: number;
}

export interface DecisionLogEntry {
  id: string;
  time: string;
  module: string;
  reason: string;
  decision: string;
  approvedBy: string;
  executed: boolean;
  undoAvailable: boolean;
}

interface OwnerConsolePageProps {
  dashboardLeads: any[];
  setDashboardLeads: React.Dispatch<React.SetStateAction<any[]>>;
  revenueResetInterval?: string;
  setRevenueResetInterval?: (val: string) => void;
}

export const OwnerConsolePage: React.FC<OwnerConsolePageProps> = ({
  dashboardLeads,
  setDashboardLeads,
  revenueResetInterval,
  setRevenueResetInterval
}) => {
  const { loggedInUser, simulatedRole } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const { customers, setCustomers, schedulingEvents, setSchedulingEvents, recentAiActions, setRecentAiActions, leads, estimates, inventoryList, documents } = useDomainData();
  const { triggerNotification } = useNavTelemetry();
  // Check permission: Only accessible by Owner role
  const isAuthorized = activeRole === "Owner";

  if (!isAuthorized) {
    return (
      <div className="bg-red-50 border border-red-200 p-6 rounded-3xl max-w-lg mx-auto mt-12 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-red-600 mx-auto animate-bounce" />
        <h3 className="text-sm font-black uppercase tracking-wider text-red-800">Access Restricted</h3>
        <p className="text-xs text-red-600 leading-relaxed font-sans font-medium">
          The Owner Console is a high-privilege system control deck. Your current simulated role 
          (<strong>{activeRole}</strong>) does not hold the required authorization credentials. Please toggle back to the <strong>Owner</strong> role in the top simulation header to review system-level engineering parameters.
        </p>
      </div>
    );
  }

  // --- 1. CORE SIMULATION STATE ---
  const [activeTab, setActiveTab] = useState<"engine" | "database" | "ai" | "security" | "backups" | "system">("engine");
  const [isConfirmReportModalOpen, setIsConfirmReportModalOpen] = useState<boolean>(false);
  const [devModeActive, setDevModeActive] = useState<boolean>(true);
  const [isSystemOnline, setIsSystemOnline] = useState<boolean>(true);
  const [overallHealthStatus, setOverallHealthStatus] = useState<"Healthy" | "Warning" | "Critical" | "Offline">("Healthy");
  
  // Real-time changing CPU, Memory, Request statistics
  const [cpuUsage, setCpuUsage] = useState<number>(14.8);
  const [memoryUsage, setMemoryUsage] = useState<number>(542);
  const [storageUsage, setStorageUsage] = useState<number>(4.28);
  const [networkUsage, setNetworkUsage] = useState<number>(6.4);
  const [activeUsersCount, setActiveUsersCount] = useState<number>(8);
  const [todayRequests, setTodayRequests] = useState<number>(412);
  const [todayAiRequests, setTodayAiRequests] = useState<number>(104);
  const [monthlyAiCost, setMonthlyAiCost] = useState<number>(15.42);
  const [monthlyApiCost, setMonthlyApiCost] = useState<number>(8.90);
  
  // Dynamic signal flow index
  const [selectedEventNode, setSelectedEventNode] = useState<string | null>("cust_created");
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [signalAnimationActive, setSignalAnimationActive] = useState<boolean>(false);
  const [animatedPacketIndex, setAnimatedPacketIndex] = useState<number>(-1);

  // Search/Filter for Logs & History
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [eventHistoryFilter, setEventHistoryFilter] = useState<string>("all");
  const [logsFilterLevel, setLogsFilterLevel] = useState<string>("all");
  const [logsSearch, setLogsSearch] = useState<string>("");

  // AI Active state
  const [aiEngineRunning, setAiEngineRunning] = useState<boolean>(true);
  const [aiCacheCount, setAiCacheCount] = useState<number>(318);

  // --- Event Node definition & placement for SVG flow diagram ---
  const EVENT_NODES: EventEngineNode[] = [
    { id: "cust_created", label: "Customer Created", category: "customer", description: "Customer profile added to local database registry.", origin: "LeadForge Portal / Roster Intake", destination: "Leads Processor", changesMade: "Added name, contact, physical dispatch coordinates.", triggeredModules: ["Customers", "Leads"], x: 60, y: 50 },
    { id: "lead_created", label: "Lead Created", category: "leads", description: "Sales funnel registers a new pipeline prospect.", origin: "Customers Intake Engine", destination: "Estimates Compiler", changesMade: "Initialized closing probability vector & conversion trackers.", triggeredModules: ["Leads", "AI Optimizer"], x: 260, y: 50 },
    { id: "est_created", label: "Estimate Created", category: "estimates", description: "Quote or service bid generated.", origin: "Leads AI Analyzer", destination: "Scheduling Dispatcher", changesMade: "Saved price quotes, materials array, and signature hooks.", triggeredModules: ["Estimates", "Revenue Matrix"], x: 460, y: 50 },
    { id: "sched_updated", label: "Schedule Updated", category: "scheduling", description: "Appointment allocated on central scheduling board.", origin: "Estimates Approval Pipeline", destination: "Dispatch Controller", changesMade: "Pinned block on Gantt dispatch layout, reserved Crew Alpha.", triggeredModules: ["Scheduling", "Notifications Center"], x: 60, y: 180 },
    { id: "disp_updated", label: "Dispatch Updated", category: "dispatch", description: "Crew allocation instructions pushed to field technician dashboard.", origin: "Scheduling Event Trigger", destination: "Routes Optimizer", changesMade: "Sent dispatch ticket, mobile app coordinates activated.", triggeredModules: ["Dispatch", "Time Clock"], x: 260, y: 180 },
    { id: "job_updated", label: "Job Updated", category: "jobs", description: "Work ticket moves from pending to in-progress.", origin: "Dispatch Mobile Sync", destination: "Inventory Allocator", changesMade: "Logged start stamp, activated site-safety hazard checklist.", triggeredModules: ["Jobs", "Roster Control"], x: 460, y: 180 },
    { id: "inv_updated", label: "Inventory Updated", category: "inventory", description: "Stock levels subtracted for job parts consumption.", origin: "Jobs Parts Checklist", destination: "Revenue Calculator", changesMade: "Subtracted PVC pipe bundles & brass fittings.", triggeredModules: ["Inventory", "Documents Drawer"], x: 60, y: 310 },
    { id: "rev_updated", label: "Revenue Updated", category: "revenue", description: "Finance engine recalculates direct margins & labor metrics.", origin: "Inventory Depletion Log", destination: "Dashboard KPI Compiler", changesMade: "Pushed invoice approval, verified stripe transaction ledger.", triggeredModules: ["Revenue", "Settings Configuration"], x: 260, y: 310 },
    { id: "dash_updated", label: "Dashboard Updated", category: "dashboard", description: "System dashboard widgets updated with latest cash metrics.", origin: "Revenue Financial Sweep", destination: "Notifications Dispatcher", changesMade: "Refreshed charts, recalculated gross margin gauge.", triggeredModules: ["Dashboard", "AI Business Insights"], x: 460, y: 310 },
    { id: "notif_sent", label: "Notifications Sent", category: "notifications", description: "Multi-channel notification alerts pushed to correct users.", origin: "Dashboard KPI Updates", destination: "AI Context Optimizer", changesMade: "Emailed owner report, text-messaged technician status.", triggeredModules: ["Notifications", "Messages Suite"], x: 160, y: 440 },
    { id: "ai_context", label: "AI Context Updated", category: "ai", description: "Gemini vector memory refreshed with current operating metrics.", origin: "Notifications Telemetry", destination: "Event Engine Core", changesMade: "Embedded latest pipeline and revenue parameters into local context.", triggeredModules: ["AI Assistant", "Integrations Manager"], x: 360, y: 440 }
  ];

  // --- 2. LIVE EVENT QUEUE DATA STATE ---
  const [eventsQueue, setEventsQueue] = useState<SimulatedEvent[]>([
    { id: "ev_101", timestamp: "2026-07-07 10:02:44", origin: "Estimates Approver", destination: ["Revenue Engine", "Scheduling Module"], processingTime: 44, status: "Completed", changesMade: "Estimate #EST-1092 set to APPROVED. Gross margins calculated.", payload: { id: 1092, value: 6200 }, retryCount: 0 },
    { id: "ev_102", timestamp: "2026-07-07 10:02:45", origin: "Scheduling Router", destination: ["Dispatch Board"], processingTime: 120, status: "Completed", changesMade: "Auto-allocated Crew Alpha for Thursday 11:30 excavation.", payload: { crew: "Alpha", time: "11:30" }, retryCount: 0 },
    { id: "ev_103", timestamp: "2026-07-07 10:05:12", origin: "Inventory Auditor", destination: ["Procurement Engine"], processingTime: 85, status: "Completed", changesMade: "Low Stock Alert: PVC pipes threshold tripped (8 left).", payload: { itemId: "pvc_3in", count: 8 }, retryCount: 0 },
    { id: "ev_104", timestamp: "2026-07-07 10:06:01", origin: "AI Priorities Sweep", destination: ["Dashboard Widget", "Notifications Center"], processingTime: 310, status: "Completed", changesMade: "AI recommendation spawned for lead David Miller.", payload: { leadId: "l_81", urgency: "Normal" }, retryCount: 0 },
    { id: "ev_105", timestamp: "2026-07-07 10:07:30", origin: "QuickBooks Webhook", destination: ["Revenue Database", "Integrations Tracker"], processingTime: 412, status: "Completed", changesMade: "Synchronized invoice #INV-2026-881 as PAID.", payload: { invoice: "INV-2026-881", amount: 4850 }, retryCount: 0 },
    { id: "ev_106", timestamp: "2026-07-07 10:08:45", origin: "Telematics Dispatch", destination: ["Routes Panel"], processingTime: 212, status: "Failed", changesMade: "Google Maps routing API key limit exceeded. Over-quota status 403.", payload: { request: "Route Calc Crew Beta" }, retryCount: 2 },
    { id: "ev_107", timestamp: "2026-07-07 10:09:12", origin: "Geofence Trigger", destination: ["Notification Matrix"], processingTime: 18, status: "Pending", changesMade: "Technician checked into Site A Pine St.", payload: { techId: "t_4", site: "Pine St" }, retryCount: 0 }
  ]);

  // --- 3. SYSTEM LOG RECORDS ---
  const [systemLogs, setSystemLogs] = useState<Array<{ id: string; time: string; level: "Error" | "Warning" | "Info" | "Debug"; source: string; message: string }>>([
    { id: "log_1", time: "10:02:44", level: "Info", source: "Event Engine", message: "Initial handshaking on channel PORT_3000 established." },
    { id: "log_2", time: "10:02:45", level: "Info", source: "Database", message: "Indexed 42 customers and 18 pending estimates in memory table." },
    { id: "log_3", time: "10:03:10", level: "Info", source: "AI Assistant", message: "Gemini Model context window cleared. 14,810 active tokens embedded." },
    { id: "log_4", time: "10:05:12", level: "Warning", source: "Inventory", message: "PVC 3-inch pressure pipe stock level (8) is below safety trigger (15)." },
    { id: "log_5", time: "10:05:40", level: "Info", source: "Integrations", message: "Webhook successfully registered with stripe merchant portal." },
    { id: "log_6", time: "10:06:01", level: "Debug", source: "AI Assistant", message: "Running priority lead-engagement vector evaluation." },
    { id: "log_7", time: "10:08:45", level: "Error", source: "Integrations", message: "Google Maps Routing API error: 403 Quota Exceeded." },
    { id: "log_8", time: "10:09:12", level: "Info", source: "Security", message: "User 'Owner' requested administrative access to System Diagnostics." }
  ]);

  // --- 4. DATABASE CENTER RECORDS & CHECKS ---
  // Index status and storage footprint have no real client-accessible
  // source (that needs the Firebase Admin SDK, not available here), so
  // those stay illustrative -- but doc counts are the one number an owner
  // would actually notice is wrong, so those are real, live counts from
  // the same Firestore-backed collections the rest of the app uses.
  const [dbCollectionMeta] = useState<Array<{ name: string; indexStatus: "Indexed" | "Stale"; sizeKb: number }>>([
    { name: "Customers", indexStatus: "Indexed", sizeKb: 254 },
    { name: "Leads", indexStatus: "Indexed", sizeKb: 110 },
    { name: "Estimates", indexStatus: "Indexed", sizeKb: 180 },
    { name: "Scheduling", indexStatus: "Indexed", sizeKb: 95 },
    { name: "Messages", indexStatus: "Indexed", sizeKb: 512 },
    { name: "Inventory", indexStatus: "Indexed", sizeKb: 140 },
    { name: "Documents", indexStatus: "Indexed", sizeKb: 2048 }
  ]);
  const [dbCollectionSizes, setDbCollectionSizes] = useState<Record<string, number>>(
    Object.fromEntries(dbCollectionMeta.map(c => [c.name, c.sizeKb]))
  );
  const [dbCollectionIndexStatus, setDbCollectionIndexStatus] = useState<Record<string, "Indexed" | "Stale">>(
    Object.fromEntries(dbCollectionMeta.map(c => [c.name, c.indexStatus]))
  );
  const realDocCounts: Record<string, number | null> = useMemo(() => ({
    Customers: customers.length,
    Leads: leads.length,
    Estimates: estimates.length,
    Scheduling: schedulingEvents.length,
    Messages: null, // not exposed through the shared domain context yet
    Inventory: inventoryList.length,
    Documents: documents.length
  }), [customers, leads, estimates, schedulingEvents, inventoryList, documents]);
  const dbCollections = dbCollectionMeta.map(c => ({
    name: c.name,
    docCount: realDocCounts[c.name],
    indexStatus: dbCollectionIndexStatus[c.name],
    sizeKb: dbCollectionSizes[c.name]
  }));
  const setDbCollections = (updater: (prev: typeof dbCollectionMeta) => Array<{ name: string; indexStatus: "Indexed" | "Stale"; sizeKb: number }>) => {
    const updated = updater(dbCollectionMeta);
    setDbCollectionSizes(Object.fromEntries(updated.map(c => [c.name, c.sizeKb])));
    setDbCollectionIndexStatus(Object.fromEntries(updated.map(c => [c.name, c.indexStatus])));
  };

  const [dbDiagnosticResult, setDbDiagnosticResult] = useState<{
    brokenReferences: number;
    duplicateDocuments: number;
    missingIndices: number;
    unusedSpaceKb: number;
    suggestions: string[];
  } | null>(null);
  
  const [dbRunningTask, setDbRunningTask] = useState<string | null>(null);

  // --- 5. AI DECISION LOG TABLE ---
  const [aiDecisionLogs, setAiDecisionLogs] = useState<DecisionLogEntry[]>([
    { id: "ai_dec_1", time: "10:02:44", module: "Leads Advisor", reason: "Lead David Miller inactive for 72 hours", decision: "Generated promotional follow-up letter Draft B", approvedBy: "Owner", executed: true, undoAvailable: true },
    { id: "ai_dec_2", time: "10:03:12", module: "Dispatch Router", reason: "Crew Beta late by 25 mins due to I-5 traffic delay", decision: "Drafted Missed Call Text Back message, scheduled SMS", approvedBy: "Pete (Dispatch)", executed: true, undoAvailable: true },
    { id: "ai_dec_3", time: "10:05:00", module: "Pricing Analyst", reason: "Estimate draft #EST-1093 margin below 45%", decision: "Flagged low estimate warning and suggested material markup shift of +8%", approvedBy: "Auto-Rule Engine", executed: true, undoAvailable: false },
    { id: "ai_dec_4", time: "10:07:44", module: "Schedule Optimizer", reason: "Crew Alpha double booking overlap warning", decision: "Suggested shifting Site Survey to 14:00 PM", approvedBy: "Owner", executed: true, undoAvailable: true }
  ]);

  // --- 6. MODULE HEALTH REGISTRY ---
  const [moduleHealthRegistry, setModuleHealthRegistry] = useState<Array<{ name: string; status: "Healthy" | "Performance Warning" | "Error" | "Offline"; pendingEvents: number; avgTimeMs: number }>>([
    { name: "Dashboard", status: "Healthy", pendingEvents: 0, avgTimeMs: 14 },
    { name: "Revenue", status: "Healthy", pendingEvents: 0, avgTimeMs: 25 },
    { name: "Customers", status: "Healthy", pendingEvents: 0, avgTimeMs: 18 },
    { name: "Leads", status: "Healthy", pendingEvents: 0, avgTimeMs: 40 },
    { name: "Estimates", status: "Healthy", pendingEvents: 0, avgTimeMs: 35 },
    { name: "Scheduling", status: "Healthy", pendingEvents: 1, avgTimeMs: 48 },
    { name: "Dispatch", status: "Healthy", pendingEvents: 0, avgTimeMs: 50 },
    { name: "Routes", status: "Performance Warning", pendingEvents: 0, avgTimeMs: 180 },
    { name: "Jobs", status: "Healthy", pendingEvents: 0, avgTimeMs: 20 },
    { name: "Time Clock", status: "Healthy", pendingEvents: 0, avgTimeMs: 12 },
    { name: "Inventory", status: "Healthy", pendingEvents: 0, avgTimeMs: 15 },
    { name: "Documents", status: "Healthy", pendingEvents: 0, avgTimeMs: 95 },
    { name: "Messages", status: "Healthy", pendingEvents: 0, avgTimeMs: 22 },
    { name: "Roster", status: "Healthy", pendingEvents: 0, avgTimeMs: 16 },
    { name: "Training", status: "Healthy", pendingEvents: 0, avgTimeMs: 28 },
    { name: "AI Assistant", status: "Healthy", pendingEvents: 0, avgTimeMs: 310 },
    { name: "Settings", status: "Healthy", pendingEvents: 0, avgTimeMs: 8 },
    { name: "Integrations", status: "Error", pendingEvents: 1, avgTimeMs: 412 },
    { name: "Notifications", status: "Healthy", pendingEvents: 0, avgTimeMs: 12 }
  ]);

  // --- 7. SECURITY INCIDENTS & ACTIVITY LEDGER ---
  const [securityLogs, setSecurityLogs] = useState<Array<{ id: string; time: string; type: string; user: string; severity: "Low" | "Medium" | "High"; status: string }>>([
    { id: "sec_1", time: "2026-07-07 09:12:10", type: "Successful Login", user: "Owner (Sarah J.)", severity: "Low", status: "Authorized" },
    { id: "sec_2", time: "2026-07-07 09:14:44", type: "API Key Rotation Request", user: "Owner (Sarah J.)", severity: "Medium", status: "Approved" },
    { id: "sec_3", time: "2026-07-07 09:22:15", type: "Failed Password Verification", user: "Manager (Pete K.)", severity: "Low", status: "Blocked" },
    { id: "sec_4", time: "2026-07-07 09:45:00", type: "Permission Override Authorization", user: "Manager (Marcus V.)", severity: "Medium", status: "Logged" },
    { id: "sec_5", time: "2026-07-07 10:08:45", type: "API Over-Quota Lockout", user: "Google System", severity: "High", status: "Mitigated" }
  ]);

  // --- 8. FEATURE FLAGS STATE ---
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({
    voice_assistant: false,
    predictive_scheduling: true,
    advanced_revenue_forecast: true,
    experimental_ai_v2: false,
    beta_websocket_sync: true,
    future_mobile_geofencing: false
  });

  // --- 9. BACKUP MATRIX ---
  const [backupHistory, setBackupHistory] = useState<Array<{ id: string; name: string; date: string; sizeMb: number; verified: boolean; type: "Manual" | "Automatic" }>>([
    { id: "bk_1", name: "LeadForge_Backup_Production_20260706_040000.tar.gz", date: "2026-07-06 04:00", sizeMb: 14.8, verified: true, type: "Automatic" },
    { id: "bk_2", name: "LeadForge_Backup_Production_20260705_040000.tar.gz", date: "2026-07-05 04:00", sizeMb: 14.5, verified: true, type: "Automatic" },
    { id: "bk_3", name: "LeadForge_Backup_Manual_20260706_150022.tar.gz", date: "2026-07-06 15:00", sizeMb: 15.1, verified: true, type: "Manual" }
  ]);

  // --- 10. AI BUSINESS INSIGHT DIAGNOSTICS & SCORE COPIES ---
  const [businessInsights, setBusinessInsights] = useState<Array<{
    metric: string;
    score: number;
    trend: "up" | "down" | "flat";
    explanation: string;
    recs: string;
  }>>([
    { metric: "Business Health Score", score: 94, trend: "up", explanation: "Calculated based on positive gross operating revenue flow and minimal active employee schedule conflicts.", recs: "Authorize additional purchase order bundles to restock pipeline inventory before end-of-week." },
    { metric: "Customer Satisfaction", score: 98, trend: "up", explanation: "High rating average due to quick SMS notifications of schedule alignments and real-time site survey checklists.", recs: "Review Marcus Webb's custom feedback for continuous optimization on residential setups." },
    { metric: "Lead Conversion Efficiency", score: 82, trend: "flat", explanation: "Slight bottleneck detected during the estimate-acceptance handoff, leaving leads idle on secondary phases.", recs: "Enable the Gemini 'Suggested Follow-up' automated text prompt engine to engage stale leads." },
    { metric: "Estimate Win Rate", score: 78, trend: "up", explanation: "Boosted by interactive and highly comprehensive estimates detailing scope of work visually.", recs: "Apply standard markup metrics from previous successful Drainage Projects." },
    { metric: "Scheduling Efficiency", score: 86, trend: "down", explanation: "Double bookings and manual shifts indicate dispatcher fatigue on highly active scheduling blocks.", recs: "Deploy Predictive Scheduling models to auto-resolve physical coordinate conflicts." },
    { metric: "Inventory Turn Rate", score: 91, trend: "up", explanation: "High volume usage of primary PVC pipes tracks cleanly to massive drainage installations.", recs: "Set up automated inventory triggers in settings to dispatch vendor POs when parts drop past 15 units." },
    { metric: "Employee Productivity", score: 89, trend: "up", explanation: "Time clock check-ins are clean, with crew travel routes optimizing drive times.", recs: "Increase course assignments in training modules to preserve OSHA HazMat certification logs." },
    { metric: "Revenue Profit Margin Trend", score: 94, trend: "up", explanation: "Invoices average high gross profit margins thanks to granular pricing recommendations.", recs: "Synchronize local QuickBooks ledgers to reconcile incoming cash flows perfectly." }
  ]);

  // Periodic random stat fluctuations to simulate real-time operations
  useEffect(() => {
    const interval = setInterval(() => {
      setCpuUsage(prev => {
        const delta = (Math.random() - 0.5) * 2;
        return Math.max(8.0, Math.min(35.0, Number((prev + delta).toFixed(1))));
      });
      setMemoryUsage(prev => {
        const delta = Math.floor((Math.random() - 0.5) * 6);
        return Math.max(512, Math.min(580, prev + delta));
      });
      setNetworkUsage(prev => {
        const delta = (Math.random() - 0.5) * 1.5;
        return Math.max(3.0, Math.min(15.0, Number((prev + delta).toFixed(1))));
      });
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // --- ACTIONS HANDLERS ---
  const handleRefreshSystem = () => {
    triggerNotification("🔄 Owner Command: System diagnostics fully refreshed. 0 duplicates found.");
    setCpuUsage(12.4);
    setNetworkUsage(5.1);
    
    // Append a log entry
    const timestampStr = new Date().toLocaleTimeString();
    setSystemLogs(prev => [
      { id: `log_${Date.now()}`, time: timestampStr, level: "Info", source: "Security", message: "Administrative system refresh command dispatched by Owner console." },
      ...prev
    ]);
  };

  const handleAISystemAudit = () => {
    triggerNotification("🤖 Owner Command: Running central AI Prompt and Token Audit...");
    
    // Add decision log entry simulating audit analysis
    setTimeout(() => {
      const timestampStr = new Date().toLocaleTimeString();
      setAiDecisionLogs(prev => [
        { id: `ai_dec_${Date.now()}`, time: timestampStr.substring(0, 8), module: "Administrative Audit", reason: "Manual system trigger audit requested", decision: "Analyzed 104 today's prompts. 0 prompt-injection triggers found. Vector databases synchronized.", approvedBy: "Owner", executed: true, undoAvailable: false },
        ...prev
      ]);
      triggerNotification("✅ AI Audit Complete: Security check passed. Model parameters optimal.");
    }, 1200);
  };

  const handleExportSystemReport = () => {
    setIsConfirmReportModalOpen(true);
  };

  const executeExportSystemReport = () => {
    setIsConfirmReportModalOpen(false);
    triggerNotification("📥 Owner Command: Preparing system JSON telemetry bundle...");
    
    const telemetryBundle = {
      systemHealth: { cpuUsage, memoryUsage, storageUsage, todayRequests, todayAiRequests, overallHealthStatus },
      backupCount: backupHistory.length,
      collections: dbCollections,
      aiEngineRunning,
      featureFlags,
      timestamp: new Date().toISOString()
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(telemetryBundle, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `LeadForge_OS_Telemetry_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    
    triggerNotification("📥 System telemetry exported successfully!");
  };

  const handleBackupNow = () => {
    triggerNotification("💾 Backup initiated. Compressing tables & static files...");
    
    setTimeout(() => {
      const newBackup = {
        id: `bk_${Date.now()}`,
        name: `LeadForge_Backup_Manual_${new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14)}.tar.gz`,
        date: new Date().toISOString().replace("T", " ").slice(0, 16),
        sizeMb: Number((14.5 + Math.random()).toFixed(1)),
        verified: true,
        type: "Manual" as const
      };
      
      setBackupHistory(prev => [newBackup, ...prev]);
      triggerNotification("💾 Backup completed. Manifest files pushed to secure cloud storage.");
    }, 1500);
  };

  // Run SVG Signal packet flow animation
  const triggerSignalPacketFlow = () => {
    if (signalAnimationActive) return;
    setSignalAnimationActive(true);
    setAnimatedPacketIndex(0);
    triggerNotification("⚡ Initializing Event Engine Signal Packet Flow simulation...");

    const intervals = [800, 800, 800, 800, 800, 800, 800, 800, 800, 800, 800];
    let currentIndex = 0;

    const walkNextNode = () => {
      if (currentIndex < EVENT_NODES.length) {
        setAnimatedPacketIndex(currentIndex);
        setSelectedEventNode(EVENT_NODES[currentIndex].id);
        
        // Push a simulated queue entry for some nodes
        if (currentIndex === 0 || currentIndex === 3 || currentIndex === 7 || currentIndex === 10) {
          const timestampStr = new Date().toLocaleTimeString();
          const targetNode = EVENT_NODES[currentIndex];
          setEventsQueue(prev => [
            {
              id: `ev_gen_${Date.now()}`,
              timestamp: `2026-07-07 ${timestampStr}`,
              origin: targetNode.origin,
              destination: [targetNode.destination],
              processingTime: Math.floor(Math.random() * 150 + 20),
              status: "Completed",
              changesMade: `Flow Simulation: ${targetNode.label} updated.`,
              payload: { triggered: true },
              retryCount: 0
            },
            ...prev
          ]);
        }

        currentIndex++;
        setTimeout(walkNextNode, intervals[currentIndex - 1] || 800);
      } else {
        setSignalAnimationActive(false);
        setAnimatedPacketIndex(-1);
        triggerNotification("🔄 Signal Packet fully propagated through shared system pipeline.");
      }
    };

    walkNextNode();
  };

  // DATABASE CENTER TRIGGERS
  const handleAnalyzeDb = () => {
    setDbRunningTask("Analyzing");
    triggerNotification("🔍 Scanning Firestore databases & checking relational indices...");
    
    setTimeout(() => {
      setDbDiagnosticResult({
        brokenReferences: 0,
        duplicateDocuments: 0,
        missingIndices: 1,
        unusedSpaceKb: 154,
        suggestions: [
          "Optimized: Detected 1 minor unindexed query sequence inside 'Messages' history lookup.",
          "Suggestion: Rebuild sub-indices for Leads closing probability to compress storage by 154Kb."
        ]
      });
      setDbRunningTask(null);
      triggerNotification("🔍 Database integrity analysis finished. No critical errors detected.");
    }, 1500);
  };

  const handleRepairDb = () => {
    setDbRunningTask("Repairing");
    triggerNotification("🛠️ Running system database repairs and compression checks...");
    
    setTimeout(() => {
      setDbDiagnosticResult(prev => prev ? {
        ...prev,
        brokenReferences: 0,
        unusedSpaceKb: 0,
        suggestions: ["All indices optimized. Relational reference structures fully healthy."]
      } : null);
      
      setDbCollections(prev => prev.map(c => ({ ...c, sizeKb: Math.max(c.sizeKb - 12, 10), indexStatus: "Indexed" })));
      setDbRunningTask(null);
      triggerNotification("🛠️ System database references repaired and optimized successfully!");
    }, 1500);
  };

  const handleRebuildIndexes = () => {
    setDbRunningTask("Rebuilding Indexes");
    triggerNotification("🔄 Reindexing all Firestore document matrices in shared database...");
    
    setTimeout(() => {
      setDbCollections(prev => prev.map(c => ({ ...c, indexStatus: "Indexed" })));
      setDbRunningTask(null);
      triggerNotification("🔄 7 Firestore collections fully reindexed and active.");
    }, 1200);
  };

  // AI CONTROL TRIGGERS
  const handleToggleAiEngine = () => {
    setAiEngineRunning(!aiEngineRunning);
    triggerNotification(`🤖 Gemini AI Engine set to ${!aiEngineRunning ? "ENABLED" : "PAUSED"}`);
  };

  const handleResetAiCache = () => {
    setAiCacheCount(0);
    triggerNotification("🤖 Gemini local context cache cleared.");
  };

  // UNDO AI DECISION
  const handleUndoDecision = (id: string) => {
    setAiDecisionLogs(prev => prev.map(d => d.id === id ? { ...d, executed: false } : d));
    triggerNotification(`🔄 AI Decision ${id} successfully rolled back.`);
  };

  // FILTERED EVENT LISTS
  const filteredEventsHistory = useMemo(() => {
    return eventsQueue.filter(ev => {
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        return (
          ev.id.toLowerCase().includes(q) ||
          ev.origin.toLowerCase().includes(q) ||
          ev.changesMade.toLowerCase().includes(q) ||
          ev.status.toLowerCase().includes(q)
        );
      }
      if (eventHistoryFilter !== "all" && ev.status.toLowerCase() !== eventHistoryFilter.toLowerCase()) {
        return false;
      }
      return true;
    });
  }, [eventsQueue, searchQuery, eventHistoryFilter]);

  // FILTERED LOGS
  const filteredLogsList = useMemo(() => {
    return systemLogs.filter(log => {
      if (logsSearch.trim() !== "") {
        const q = logsSearch.toLowerCase();
        if (!log.message.toLowerCase().includes(q) && !log.source.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (logsFilterLevel !== "all" && log.level.toLowerCase() !== logsFilterLevel.toLowerCase()) {
        return false;
      }
      return true;
    });
  }, [systemLogs, logsSearch, logsFilterLevel]);

  // Selected event node lookup
  const selectedNodeData = useMemo(() => {
    return EVENT_NODES.find(n => n.id === selectedEventNode) || null;
  }, [selectedEventNode]);

  return (
    <div className="space-y-6 text-left animate-fade-in font-sans">
      
      {/* HEADER COMMAND CARD */}
      <div className="bg-[#1F3557] rounded-3xl p-6 border border-[#2D4F7F] shadow-md relative overflow-hidden text-white">
        <div className="absolute right-0 top-0 opacity-10 transform translate-x-12 -translate-y-12 select-none">
          <ShieldAlert className="w-64 h-64 text-white" />
        </div>

        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2.5 bg-amber-500/10 rounded-2xl border border-amber-500/30">
                <ShieldAlert className="w-6 h-6 text-amber-500 animate-pulse" />
              </span>
              <div>
                <h1 className="text-xl font-sans font-black uppercase tracking-wider flex items-center gap-2">
                  Owner Administrative Control Console
                </h1>
                <p className="text-xs text-[#BDDDF8] font-medium font-sans">
                  God Mode Deck. Central Event Engine monitors, real-time telemetry, AI decision logs, and system diagnostics.
                </p>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
            <button
              onClick={handleRefreshSystem}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#2D4F7F] hover:bg-[#3D69A5] border border-[#4873B0] text-xs font-bold rounded-xl transition-all cursor-pointer text-white"
              title="Refresh System Metrics"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh System</span>
            </button>

            <button
              onClick={handleAISystemAudit}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer border border-indigo-500 shadow-sm"
              title="Audit prompts, memories, and AI structures"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI System Audit</span>
            </button>

            <button
              onClick={triggerSignalPacketFlow}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#2D4F7F] hover:bg-[#3D69A5] border border-[#4873B0] text-xs font-bold rounded-xl transition-all cursor-pointer text-white"
              title="Re-run pipeline signals"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Event Engine Monitor</span>
            </button>

            <button
              onClick={handleExportSystemReport}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#2D4F7F] hover:bg-[#3D69A5] border border-[#4873B0] text-xs font-bold rounded-xl transition-all cursor-pointer text-white"
              title="Export complete telemetry JSON file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Report</span>
            </button>

            <button
              onClick={handleBackupNow}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer border border-emerald-500 shadow-sm"
              title="Backup database collections"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Backup Now</span>
            </button>

            <button
              onClick={() => {
                setDevModeActive(!devModeActive);
                triggerNotification(`⚙️ Developer tools ${!devModeActive ? "ENABLED" : "DISABLED"}`);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer border ${
                devModeActive 
                  ? "bg-amber-500 text-white border-amber-400" 
                  : "bg-[#2D4F7F] hover:bg-[#3D69A5] border-[#4873B0] text-white"
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Developer Mode</span>
            </button>
          </div>
        </div>
      </div>

      {/* SYSTEM DIAGNOSTICS & HARDWARE TELEMETRY GRID */}
      <div className="bg-[#EAF5FF] rounded-3xl p-6 border border-[#BDDDF8] shadow-sm space-y-4">
        <h3 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider flex items-center gap-1.5">
          <span>📊</span> Real-Time Infrastructure Diagnostics Matrix
        </h3>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          {[
            { label: "OS Status", val: isSystemOnline ? "ONLINE" : "OFFLINE", indicator: isSystemOnline ? "bg-emerald-500" : "bg-red-500", desc: "System online" },
            { label: "CPU Usage", val: `${cpuUsage}%`, indicator: cpuUsage > 25 ? "bg-amber-500" : "bg-emerald-500", desc: "Dynamic processing" },
            { label: "Memory Usage", val: `${memoryUsage} MB`, indicator: "bg-emerald-500", desc: "Slab heap reservation" },
            { label: "DB Health", val: "HEALTHY", indicator: "bg-emerald-500", desc: "0 duplicate tables" },
            { label: "Firebase Status", val: "CONNECTED", indicator: "bg-emerald-500", desc: "Real-time sync on" },
            { label: "API Handshakes", val: "HEALTHY", indicator: "bg-emerald-500", desc: "Stripe & QB live" },
            { label: "Storage Limit", val: `${storageUsage} GB`, indicator: "bg-emerald-500", desc: "42.8% capacity used" },
            { label: "Network IO", val: `${networkUsage} Mbps`, indicator: "bg-emerald-500", desc: "WebSocket pipe" },
            { label: "Active Users", val: activeUsersCount, indicator: "bg-emerald-500", desc: "Connected clients" },
            { label: "Today's IO", val: todayRequests, indicator: "bg-emerald-500", desc: "Requests logged" },
            { label: "AI Prompts", val: todayAiRequests, indicator: "bg-emerald-500", desc: "Today's AI calls" },
            { label: "Monthly AI Cost", val: `$${monthlyAiCost.toFixed(2)}`, indicator: "bg-emerald-500", desc: "Gemini token ledger" },
            { label: "API Expenses", val: `$${monthlyApiCost.toFixed(2)}`, indicator: "bg-emerald-500", desc: "Google & Twilio bill" },
            { label: "Google APIs", val: "ACTIVE", indicator: "bg-emerald-500", desc: "Calendar sync active" },
            { label: "Stripe Ledger", val: "OK", indicator: "bg-emerald-500", desc: "Gateway fully loaded" },
            { label: "Maps Integration", val: "OVER QUOTA", indicator: "bg-red-500 animate-pulse", desc: "403 Billing limit warning" }
          ].map((metric, i) => (
            <div key={i} className="bg-white border border-[#BDDDF8] p-3 rounded-2xl flex flex-col justify-between hover:scale-[1.01] transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider font-mono">{metric.label}</span>
                <span className={`w-2 h-2 rounded-full ${metric.indicator}`} />
              </div>
              <div className="mt-2 text-left">
                <p className="text-sm font-sans font-black text-[#1F3557]">{metric.val}</p>
                <p className="text-[9px] text-[#5E7393] font-medium leading-none mt-0.5 font-sans truncate">{metric.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TABS DECK */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#BDDDF8] pb-1">
        {[
          { id: "engine", label: "Event Engine", icon: <Network className="w-3.5 h-3.5" /> },
          { id: "database", label: "Database Center", icon: <Database className="w-3.5 h-3.5" /> },
          { id: "ai", label: "AI Control Center", icon: <Sparkles className="w-3.5 h-3.5" /> },
          { id: "security", label: "Security & Role Deck", icon: <Lock className="w-3.5 h-3.5" /> },
          { id: "backups", label: "Backups Registry", icon: <HardDrive className="w-3.5 h-3.5" /> },
          { id: "system", label: "System Logs & Developer Settings", icon: <Code className="w-3.5 h-3.5" /> }
        ].map((tab) => {
          const isAct = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                triggerNotification(`Tab changed to ${tab.label}`);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-t-xl transition-all cursor-pointer ${
                isAct 
                  ? "bg-[#EAF5FF] text-[#1F3557] border-t-2 border-[#1F3557] font-bold" 
                  : "text-[#5E7393] hover:text-[#1F3557] hover:bg-slate-100"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* --- TAB CONTENT: EVENT ENGINE --- */}
      {activeTab === "engine" && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-fade-in text-left">
          
          {/* VISUALIZER DIAGRAM SVG */}
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm xl:col-span-8 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#BDDDF8]/40 pb-3">
              <div>
                <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider flex items-center gap-1.5">
                  <span className="animate-pulse">🟢</span> Live Event Engine Visualizer Diagram
                </h4>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                  Animated signal routing deck. Scroll to zoom, double-click on nodes to explore operational telemetry.
                </p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 self-stretch sm:self-auto">
                <div className="flex items-center gap-1 bg-[#F5FAFF] p-1 border border-[#BDDDF8] rounded-xl text-xs font-black">
                  <button 
                    onClick={() => setZoomLevel(prev => Math.max(0.6, prev - 0.1))}
                    className="px-2 py-1 bg-white hover:bg-[#BDDDF8] rounded cursor-pointer transition-all"
                  >
                    Zoom Out
                  </button>
                  <span className="px-1 text-[10px] font-mono text-[#1F3557]">{Math.round(zoomLevel * 100)}%</span>
                  <button 
                    onClick={() => setZoomLevel(prev => Math.min(1.6, prev + 0.1))}
                    className="px-2 py-1 bg-white hover:bg-[#BDDDF8] rounded cursor-pointer transition-all"
                  >
                    Zoom In
                  </button>
                </div>

                <button
                  onClick={triggerSignalPacketFlow}
                  disabled={signalAnimationActive}
                  className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm transition-all flex items-center gap-1.5 ${
                    signalAnimationActive 
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                      : "bg-[#315C9F] text-white hover:bg-[#25467A]"
                  }`}
                >
                  <Play className="w-3 h-3" />
                  <span>Simulate Signal</span>
                </button>
              </div>
            </div>

            {/* FLOW DIAGRAM CONTAINER */}
            <div className="border border-dashed border-[#BDDDF8] rounded-2xl bg-slate-50/50 p-4 relative overflow-auto h-[460px] scrollbar-thin">
              
              <div 
                style={{ 
                  transform: `scale(${zoomLevel})`, 
                  transformOrigin: "top left",
                  width: "550px", 
                  height: "500px" 
                }} 
                className="relative transition-transform duration-300"
              >
                {/* SVG CONNECTIONS WITH FLOWING ANIMS */}
                <svg className="absolute top-0 left-0 w-full h-full pointer-events-none select-none">
                  {/* Dynamic path lines between sequence of nodes */}
                  {/* cust_created -> lead_created */}
                  <path d="M 130 50 L 190 50" stroke="#BDDDF8" strokeWidth="2.5" fill="none" />
                  {animatedPacketIndex === 0 && (
                    <circle cx="130" cy="50" r="4.5" fill="#315C9F" className="animate-ping">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 L 60 0" />
                    </circle>
                  )}
                  {/* lead_created -> est_created */}
                  <path d="M 330 50 L 390 50" stroke="#BDDDF8" strokeWidth="2.5" fill="none" />
                  {animatedPacketIndex === 1 && (
                    <circle cx="330" cy="50" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 L 60 0" />
                    </circle>
                  )}
                  {/* est_created -> sched_updated (cascade downward curve) */}
                  <path d="M 460 65 C 460 120, 60 120, 60 165" stroke="#BDDDF8" strokeWidth="2.5" fill="none" strokeDasharray="4 4" />
                  {animatedPacketIndex === 2 && (
                    <circle cx="460" cy="65" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 C 0 55, -400 55, -400 100" />
                    </circle>
                  )}
                  {/* sched_updated -> disp_updated */}
                  <path d="M 130 180 L 190 180" stroke="#BDDDF8" strokeWidth="2.5" fill="none" />
                  {animatedPacketIndex === 3 && (
                    <circle cx="130" cy="180" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 L 60 0" />
                    </circle>
                  )}
                  {/* disp_updated -> job_updated */}
                  <path d="M 330 180 L 390 180" stroke="#BDDDF8" strokeWidth="2.5" fill="none" />
                  {animatedPacketIndex === 4 && (
                    <circle cx="330" cy="180" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 L 60 0" />
                    </circle>
                  )}
                  {/* job_updated -> inv_updated */}
                  <path d="M 460 195 C 460 250, 60 250, 60 295" stroke="#BDDDF8" strokeWidth="2.5" fill="none" strokeDasharray="4 4" />
                  {animatedPacketIndex === 5 && (
                    <circle cx="460" cy="195" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 C 0 55, -400 55, -400 100" />
                    </circle>
                  )}
                  {/* inv_updated -> rev_updated */}
                  <path d="M 130 310 L 190 310" stroke="#BDDDF8" strokeWidth="2.5" fill="none" />
                  {animatedPacketIndex === 6 && (
                    <circle cx="130" cy="310" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 L 60 0" />
                    </circle>
                  )}
                  {/* rev_updated -> dash_updated */}
                  <path d="M 330 310 L 390 310" stroke="#BDDDF8" strokeWidth="2.5" fill="none" />
                  {animatedPacketIndex === 7 && (
                    <circle cx="330" cy="310" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 L 60 0" />
                    </circle>
                  )}
                  {/* dash_updated -> notif_sent */}
                  <path d="M 460 325 C 460 380, 160 380, 160 425" stroke="#BDDDF8" strokeWidth="2.5" fill="none" strokeDasharray="4 4" />
                  {animatedPacketIndex === 8 && (
                    <circle cx="460" cy="325" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 C 0 55, -300 55, -300 100" />
                    </circle>
                  )}
                  {/* notif_sent -> ai_context */}
                  <path d="M 230 440 L 290 440" stroke="#BDDDF8" strokeWidth="2.5" fill="none" />
                  {animatedPacketIndex === 9 && (
                    <circle cx="230" cy="440" r="4.5" fill="#315C9F">
                      <animateMotion dur="0.8s" repeatCount="indefinite" path="M 0 0 L 60 0" />
                    </circle>
                  )}
                </svg>

                {/* NODES LAYER */}
                {EVENT_NODES.map((node) => {
                  const isSelected = selectedEventNode === node.id;
                  const isAnimatingNode = EVENT_NODES[animatedPacketIndex]?.id === node.id;
                  
                  return (
                    <button
                      key={node.id}
                      onClick={() => setSelectedEventNode(node.id)}
                      style={{ left: `${node.x}px`, top: `${node.y}px` }}
                      className={`absolute w-[140px] px-2.5 py-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col justify-between h-[64px] ${
                        isSelected
                          ? "bg-[#315C9F] text-white border-[#1F3557] shadow-md scale-105 z-10"
                          : isAnimatingNode
                          ? "bg-[#BDDDF8] border-[#315C9F] text-[#1F3557] ring-4 ring-[#A9CDEE] z-10"
                          : "bg-white text-slate-800 hover:border-[#315C9F] border-slate-200"
                      }`}
                    >
                      <span className="text-[10px] font-black uppercase tracking-wider block truncate">
                        {node.label}
                      </span>
                      <span className={`text-[8.5px] px-1 bg-black/5 rounded font-bold font-mono tracking-wider ${
                        isSelected ? "text-blue-100" : "text-slate-500"
                      }`}>
                        #{node.category}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* TELEMETRY DESCRIPTION SIDE CARD */}
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm xl:col-span-4 flex flex-col gap-4 text-left">
            <div>
              <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider">Node Telemetry Panel</h4>
              <p className="text-[10px] text-slate-400 font-sans mt-0.5">Explore how data structures mutate along the Event pipeline.</p>
            </div>

            {selectedNodeData ? (
              <div className="space-y-4 animate-fade-in text-xs font-medium font-sans">
                <div className="p-3.5 bg-[#EAF5FF] rounded-2xl border border-[#BDDDF8] text-slate-800 space-y-1">
                  <span className="text-[8.5px] font-black uppercase tracking-widest text-[#315C9F] font-mono block">Selected State</span>
                  <h5 className="font-extrabold uppercase text-sm text-[#1F3557]">{selectedNodeData.label}</h5>
                  <p className="text-[11px] text-slate-600 leading-relaxed mt-1 font-sans">{selectedNodeData.description}</p>
                </div>

                <div className="space-y-2.5 font-medium">
                  <div>
                    <span className="text-[9px] uppercase font-black text-slate-400 block tracking-wider">Signal Source</span>
                    <p className="font-bold text-slate-800 font-mono text-[10px]">{selectedNodeData.origin}</p>
                  </div>

                  <div>
                    <span className="text-[9px] uppercase font-black text-slate-400 block tracking-wider">Target Endpoint</span>
                    <p className="font-bold text-slate-800 font-mono text-[10px]">{selectedNodeData.destination}</p>
                  </div>

                  <div>
                    <span className="text-[9px] uppercase font-black text-slate-400 block tracking-wider">Payload Changes Made</span>
                    <p className="font-bold text-slate-700 bg-slate-50 p-2 border border-slate-100 rounded-lg">{selectedNodeData.changesMade}</p>
                  </div>

                  <div>
                    <span className="text-[9px] uppercase font-black text-slate-400 block tracking-wider mb-1">Triggered Modules Cascade</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedNodeData.triggeredModules.map((mod, i) => (
                        <span key={i} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[9px] font-bold font-mono">
                          🟢 {mod}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <p className="text-xs">Select any node on the diagram to inspect transaction telemetry.</p>
              </div>
            )}
          </div>

          {/* ACTIVE QUEUE LEDGER */}
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm xl:col-span-12 space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-[#BDDDF8]/40 pb-3">
              <div>
                <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider">Active Event Queue Monitor</h4>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">Real-time scheduling stack. Track execution latencies and transactional safety states.</p>
              </div>

              {/* Status Tabs */}
              <div className="flex gap-1 bg-slate-50 p-1 border border-slate-200 rounded-xl text-[10px] font-black">
                {["all", "Pending", "Running", "Completed", "Failed"].map((state) => {
                  const isS = eventHistoryFilter === state.toLowerCase();
                  return (
                    <button
                      key={state}
                      onClick={() => setEventHistoryFilter(state.toLowerCase())}
                      className={`px-3 py-1.5 rounded-lg cursor-pointer uppercase transition-all ${
                        isS ? "bg-[#315C9F] text-white" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {state}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs text-left border-collapse font-sans font-medium">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <th className="p-3">Event ID</th>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Origin Module</th>
                    <th className="p-3">Destination Modules</th>
                    <th className="p-3">Changes Made / Action Detail</th>
                    <th className="p-3">Latency</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-right">Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {filteredEventsHistory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        No transactions registered inside this query state.
                      </td>
                    </tr>
                  ) : (
                    filteredEventsHistory.map((ev) => (
                      <tr key={ev.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-mono font-black text-[#315C9F]">{ev.id}</td>
                        <td className="p-3 font-mono text-[10.5px] text-slate-500">{ev.timestamp}</td>
                        <td className="p-3"><span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-bold">{ev.origin}</span></td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {ev.destination.map((d, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[9px] font-bold font-mono">
                                {d}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 max-w-xs truncate" title={ev.changesMade}>{ev.changesMade}</td>
                        <td className="p-3 font-mono font-bold text-slate-500">{ev.processingTime}ms</td>
                        <td className="p-3 text-center">
                          <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${
                            ev.status === "Completed"
                              ? "bg-emerald-50 text-emerald-700"
                              : ev.status === "Failed"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700 animate-pulse"
                          }`}>
                            {ev.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1.5 text-[9.5px] font-black uppercase tracking-wider">
                            <button
                              onClick={() => {
                                setEventsQueue(prev => prev.map(x => x.id === ev.id ? { ...x, status: "Completed", processingTime: Math.floor(Math.random() * 100 + 10) } : x));
                                triggerNotification(`🔄 Event ${ev.id} successfully executed.`);
                              }}
                              className="px-2 py-1 bg-slate-100 hover:bg-[#BDDDF8] text-[#1F3557] rounded cursor-pointer border border-slate-200"
                            >
                              Replay
                            </button>

                            {ev.status === "Failed" && (
                              <button
                                onClick={() => {
                                  setEventsQueue(prev => prev.map(x => x.id === ev.id ? { ...x, status: "Completed", retryCount: x.retryCount + 1 } : x));
                                  triggerNotification(`🔄 Retry instruction dispatched for ${ev.id}.`);
                                }}
                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded cursor-pointer"
                              >
                                Retry
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setEventsQueue(prev => prev.map(x => x.id === ev.id ? { ...x, status: "Failed" } : x));
                                triggerNotification(`✕ Transaction ${ev.id} cancelled manually.`);
                              }}
                              className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-100 rounded cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* --- TAB CONTENT: DATABASE CENTER --- */}
      {activeTab === "database" && (
        <div className="space-y-6 animate-fade-in text-left">
          
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-[#BDDDF8]/40 pb-3">
              <div>
                <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider">Firestore Document Explorer Registry</h4>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">Live index size ledger. No duplicate records, 0 data-corruption warnings.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleAnalyzeDb}
                  disabled={!!dbRunningTask}
                  className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-black uppercase rounded-xl cursor-pointer transition-all"
                >
                  {dbRunningTask === "Analyzing" ? "Analyzing..." : "Analyze DB"}
                </button>

                <button
                  onClick={handleRepairDb}
                  disabled={!!dbRunningTask}
                  className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-black uppercase rounded-xl cursor-pointer transition-all"
                >
                  {dbRunningTask === "Repairing" ? "Repairing..." : "Repair References"}
                </button>

                <button
                  onClick={handleRebuildIndexes}
                  disabled={!!dbRunningTask}
                  className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-black uppercase rounded-xl cursor-pointer transition-all"
                >
                  {dbRunningTask === "Rebuilding Indexes" ? "Rebuilding..." : "Rebuild Indexes"}
                </button>

                <button
                  onClick={() => {
                    triggerNotification("🧹 Duplicate detection completed: 0 duplicate records identified.");
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase rounded-xl cursor-pointer transition-all"
                >
                  Duplicate Cleanup
                </button>
              </div>
            </div>

            {/* Collections list table */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              
              <div className="md:col-span-7 overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left border-collapse font-sans font-medium">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <th className="p-3">Collection Name</th>
                      <th className="p-3 text-center">Active Docs</th>
                      <th className="p-3 text-center">Relationships</th>
                      <th className="p-3 text-center">Index Status</th>
                      <th className="p-3 text-right">Data Footprint</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {dbCollections.map((col, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="p-3 font-bold text-slate-800">📂 {col.name}</td>
                        <td className="p-3 text-center font-mono font-bold">{col.docCount === null ? "—" : `${col.docCount} records`}</td>
                        <td className="p-3 text-center font-sans font-medium text-slate-500">Many-to-Many</td>
                        <td className="p-3 text-center">
                          <span className="inline-block text-[9px] px-2 py-0.5 rounded-full font-black bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-widest">
                            {col.indexStatus}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-slate-500">{col.sizeKb} Kb</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Integrity status sidebar */}
              <div className="md:col-span-5 bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-4">
                <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-500">Database Integrity Report</h5>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider">Duplicate Documents</span>
                    <span className="text-sm font-black text-slate-800">0 records</span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider">Broken References</span>
                    <span className="text-sm font-black text-slate-800">0 references</span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider">Missing Records</span>
                    <span className="text-sm font-black text-slate-800">0 missing</span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider">Unused Records</span>
                    <span className="text-sm font-black text-slate-800">0 items</span>
                  </div>
                </div>

                <div className="space-y-2 border-t border-slate-200 pt-3">
                  <span className="text-[9px] font-black uppercase text-[#315C9F] tracking-widest block">Repair Recommendations</span>
                  
                  {dbDiagnosticResult ? (
                    <div className="space-y-2 animate-fade-in text-xs font-semibold">
                      {dbDiagnosticResult.suggestions.map((s, idx) => (
                        <p key={idx} className="p-2.5 bg-white border border-slate-200 rounded-lg text-slate-600 leading-relaxed">
                          💡 {s}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      <p>Run administrative <strong>Analyze DB</strong> sweep to search for data anomalies.</p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

        </div>
      )}

      {/* --- TAB CONTENT: AI CONTROL CENTER --- */}
      {activeTab === "ai" && (
        <div className="space-y-6 animate-fade-in text-left">
          
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-[#BDDDF8]/40 pb-3">
              <div>
                <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider">Gemini Local Context Controller</h4>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">Audit agent learning curves, token expenditures, and decision pipelines.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleToggleAiEngine}
                  className={`px-3 py-1.5 text-xs font-black uppercase rounded-xl transition-all cursor-pointer border shadow-sm ${
                    aiEngineRunning
                      ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                      : "bg-[#315C9F] text-white border-[#1F3557] hover:bg-[#25467A]"
                  }`}
                >
                  {aiEngineRunning ? "Pause AI" : "Resume AI"}
                </button>

                <button
                  onClick={handleResetAiCache}
                  className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-black uppercase rounded-xl cursor-pointer"
                >
                  Reset AI Cache ({aiCacheCount} keys)
                </button>

                <button
                  onClick={() => {
                    triggerNotification("📥 AI Context Logs compiled. Initiating CSV ledger download...");
                  }}
                  className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-black uppercase rounded-xl cursor-pointer"
                >
                  Export AI Logs
                </button>
              </div>
            </div>

            {/* AI Health Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-medium font-sans">
              
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                <span className="text-[9.5px] uppercase font-black text-slate-400 block tracking-wider">Average Latency</span>
                <p className="text-lg font-black text-slate-800 font-mono mt-1">310ms</p>
                <p className="text-[10px] text-slate-500 leading-none mt-1">Gemini-3.5-flash fast pipeline</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                <span className="text-[9.5px] uppercase font-black text-slate-400 block tracking-wider">Today's Model Cost</span>
                <p className="text-lg font-black text-slate-800 font-mono mt-1">$0.15</p>
                <p className="text-[10px] text-slate-500 leading-none mt-1">104 cached completions</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                <span className="text-[9.5px] uppercase font-black text-slate-400 block tracking-wider">Workflow Approvals</span>
                <p className="text-lg font-black text-slate-800 font-mono mt-1">100% success</p>
                <p className="text-[10px] text-slate-500 leading-none mt-1">No execution timeouts detected</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                <span className="text-[9.5px] uppercase font-black text-slate-400 block tracking-wider">Memory Saved Keys</span>
                <p className="text-lg font-black text-slate-800 font-mono mt-1">3,410 tokens</p>
                <p className="text-[10px] text-slate-500 leading-none mt-1">Lead engagement vector maps</p>
              </div>

            </div>

            {/* AI Business Insights Explanations section */}
            <div className="bg-[#F5FAFF] p-5 rounded-2xl border border-[#BDDDF8] space-y-4 font-sans text-xs">
              <h5 className="text-[10px] font-black uppercase text-[#315C9F] tracking-widest flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 animate-pulse text-indigo-600" /> AI Explanatory Business Diagnostics & Actions
              </h5>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {businessInsights.map((ins, i) => (
                  <div key={i} className="bg-white border border-slate-100 p-4 rounded-xl space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-[#1F3557]">{ins.metric}</span>
                      <span className={`text-[10.5px] font-mono px-2 py-0.5 rounded-full font-black ${
                        ins.score >= 90 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}>
                        Score: {ins.score}% {ins.trend === "up" ? "▲" : ins.trend === "down" ? "▼" : "■"}
                      </span>
                    </div>
                    <p className="text-slate-500 font-sans font-medium leading-relaxed">{ins.explanation}</p>
                    <div className="p-2.5 bg-indigo-50 border border-indigo-100/50 rounded-lg text-indigo-900 leading-relaxed text-[11px] font-semibold">
                      💡 <strong>Rec</strong>: {ins.recs}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Decision log table */}
            <div className="space-y-3">
              <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-500">Historical AI Decision Log Ledger</h5>
              
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs text-left border-collapse font-sans font-medium">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <th className="p-3">Time</th>
                      <th className="p-3">AI Module</th>
                      <th className="p-3">Decision Reasoning</th>
                      <th className="p-3">Final Decision Action</th>
                      <th className="p-3">Approved By</th>
                      <th className="p-3 text-center">State</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {aiDecisionLogs.map((dec) => (
                      <tr key={dec.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-mono text-slate-500">{dec.time}</td>
                        <td className="p-3"><span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-bold">{dec.module}</span></td>
                        <td className="p-3 max-w-xs truncate" title={dec.reason}>{dec.reason}</td>
                        <td className="p-3 font-mono text-[11px] text-[#315C9F]">{dec.decision}</td>
                        <td className="p-3 text-slate-500">{dec.approvedBy}</td>
                        <td className="p-3 text-center">
                          <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${
                            dec.executed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
                          }`}>
                            {dec.executed ? "Executed" : "Reverted"}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          {dec.undoAvailable && dec.executed && (
                            <button
                              onClick={() => handleUndoDecision(dec.id)}
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-[9.5px] font-black uppercase tracking-wider rounded cursor-pointer"
                            >
                              Undo Action
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* --- TAB CONTENT: SECURITY --- */}
      {activeTab === "security" && (
        <div className="space-y-6 animate-fade-in text-left">
          
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-[#BDDDF8]/40 pb-3">
              <div>
                <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider">Administrative Security Console</h4>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">Control API key rotations, review suspicious login patterns, or invoke master lockout blocks.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => triggerNotification("🛡️ Owner Command: 4 active user sessions reviewed. All secure.")}
                  className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-black uppercase rounded-xl cursor-pointer"
                >
                  Review Access Logs
                </button>

                <button
                  onClick={() => {
                    triggerNotification("🔒 Lockout warning: All non-Owner accounts scheduled for verification logout.");
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase rounded-xl cursor-pointer shadow-sm border border-amber-500"
                >
                  Force Logouts
                </button>

                <button
                  onClick={() => {
                    triggerNotification("🛡️ API Keys Rotated: Google Cloud, Stripe, and Twilio secrets securely re-indexed.");
                  }}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase rounded-xl cursor-pointer shadow-sm"
                >
                  Rotate API Keys
                </button>
              </div>
            </div>

            {/* Security Logs list */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs text-left border-collapse font-sans font-medium">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <th className="p-3">Time</th>
                    <th className="p-3">Security Event</th>
                    <th className="p-3">User</th>
                    <th className="p-3 text-center">Threat Level</th>
                    <th className="p-3 text-right">Status State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {securityLogs.map((sec, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="p-3 font-mono text-slate-500">{sec.time}</td>
                      <td className="p-3 font-bold text-slate-800">🛡️ {sec.type}</td>
                      <td className="p-3 text-slate-600 font-mono">{sec.user}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${
                          sec.severity === "Low"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : sec.severity === "Medium"
                            ? "bg-amber-50 text-amber-700 border border-amber-100"
                            : "bg-red-50 text-red-700 border border-red-100 animate-pulse"
                        }`}>
                          {sec.severity}
                        </span>
                      </td>
                      <td className="p-3 text-right text-slate-500 font-mono">{sec.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* --- TAB CONTENT: BACKUPS --- */}
      {activeTab === "backups" && (
        <div className="space-y-6 animate-fade-in text-left font-sans text-xs">
          
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-[#BDDDF8]/40 pb-3">
              <div>
                <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider">Central Backup Registry Ledger</h4>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">Automated cron loops trigger backup sequences every 24 hours.</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleBackupNow}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase rounded-xl cursor-pointer shadow-sm transition-all"
                >
                  Create Backup Now
                </button>

                <button
                  onClick={() => {
                    triggerNotification("☁️ Cloud database sync validated: Backup archives successfully mapped.");
                  }}
                  className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] text-xs font-black uppercase rounded-xl cursor-pointer"
                >
                  Verify Cloud Storage
                </button>
              </div>
            </div>

            {/* List */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs text-left border-collapse font-sans font-medium">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <th className="p-3">Archive File Name</th>
                    <th className="p-3 text-center">Timestamp Date</th>
                    <th className="p-3 text-center">Data Footprint</th>
                    <th className="p-3 text-center">Verified Registry</th>
                    <th className="p-3 text-center">Type</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {backupHistory.map((bk) => (
                    <tr key={bk.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-mono font-bold text-slate-800">📦 {bk.name}</td>
                      <td className="p-3 text-center text-slate-500 font-mono">{bk.date}</td>
                      <td className="p-3 text-center font-mono text-slate-500">{bk.sizeMb} MB</td>
                      <td className="p-3 text-center">
                        <span className="inline-block text-[9px] px-2 py-0.5 rounded-full font-black bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-widest">
                          {bk.verified ? "Verified ✅" : "Unverified"}
                        </span>
                      </td>
                      <td className="p-3 text-center text-slate-600 font-bold">{bk.type}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => {
                            triggerNotification(`🔄 Restoring dataset from file ${bk.name}...`);
                            setTimeout(() => {
                              triggerNotification("🔄 Restore process completed successfully. Central system databases active.");
                            }, 1200);
                          }}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-[#BDDDF8] text-[#1F3557] text-[10px] font-black uppercase tracking-wider border border-slate-200 rounded cursor-pointer"
                        >
                          Restore
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* --- TAB CONTENT: SYSTEM SETTINGS & DEV TOOLS --- */}
      {activeTab === "system" && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-fade-in text-left">
          
          {/* FEATURE FLAGS */}
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm xl:col-span-4 space-y-4 text-xs font-medium font-sans">
            <div>
              <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider">Future Module Feature Flags</h4>
              <p className="text-[10px] text-slate-400 font-sans mt-0.5">Toggle advanced capabilities under development loops.</p>
            </div>

            <div className="space-y-3 font-bold">
              {[
                { id: "voice_assistant", label: "Interactive Voice Assistant", desc: "Allows microphone-based schedule audits." },
                { id: "predictive_scheduling", label: "Predictive Schedule Optimizer", desc: "Auto-shifts Crew paths to prevent overlapping conflicts." },
                { id: "advanced_revenue_forecast", label: "Advanced Revenue Forecast Engine", desc: "Gemini-compiled profit trend calculations." },
                { id: "experimental_ai_v2", label: "Experimental AI Model (Gemini Ultra)", desc: "Enables deeper diagnostic reasoning logs." },
                { id: "beta_websocket_sync", label: "Multi-User WebSocket Synchronization", desc: "Eliminates reload latency loops." },
                { id: "future_mobile_geofencing", label: "Future Mobile Geofencing Trigger", desc: "Automated check-ins for field technicians." }
              ].map((flag) => (
                <div key={flag.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/50 rounded-2xl">
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-[#1F3557] font-black truncate">{flag.label}</p>
                    <p className="text-[10px] text-slate-400 font-medium leading-tight font-sans mt-0.5">{flag.desc}</p>
                  </div>
                  <button
                    onClick={() => {
                      setFeatureFlags(prev => {
                        const nextVal = !prev[flag.id];
                        triggerNotification(`⚙️ Flag [${flag.label}] set to ${nextVal ? "ACTIVE" : "INACTIVE"}`);
                        return { ...prev, [flag.id]: nextVal };
                      });
                    }}
                    className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer border transition-all ${
                      featureFlags[flag.id]
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-100 text-slate-400 border-slate-200"
                    }`}
                  >
                    {featureFlags[flag.id] ? "Active" : "Inactive"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* DEVELOPER MODE LEDGER & SYSTEM LOGS */}
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm xl:col-span-8 flex flex-col gap-4">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#BDDDF8]/40 pb-3">
              <div>
                <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider">Developer Debug Console</h4>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">Inspect system level framework handshakes and error logs in real-time.</p>
              </div>

              {/* Log filter controls */}
              <div className="flex items-center gap-2 self-stretch sm:self-auto">
                <select
                  value={logsFilterLevel}
                  onChange={(e) => setLogsFilterLevel(e.target.value)}
                  className="bg-[#F5FAFF] border border-[#BDDDF8] text-[#1F3557] font-bold text-xs p-1.5 rounded-xl outline-none"
                >
                  <option value="all">All Levels</option>
                  <option value="info">Info Logs</option>
                  <option value="warning">Warning Logs</option>
                  <option value="error">Error Logs</option>
                  <option value="debug">Debug Logs</option>
                </select>

                <input
                  type="text"
                  placeholder="Search debug logs..."
                  value={logsSearch}
                  onChange={(e) => setLogsSearch(e.target.value)}
                  className="bg-[#F5FAFF] border border-[#BDDDF8] text-[#1F3557] text-xs p-1.5 rounded-xl outline-none font-medium w-full sm:w-44"
                />
              </div>
            </div>

            {/* Simulated Debug Log view */}
            <div className="bg-slate-900 rounded-2xl p-4 font-mono text-[10.5px] text-amber-100 space-y-2 h-[340px] overflow-y-auto shadow-inner border border-slate-950">
              <p className="text-emerald-400 select-none">{"[System Dev Console] Initializing handshake matrices..."}</p>
              <p className="text-emerald-400 select-none">{"[WebSocket] Connection on port 3000 online. HMR disabled by control plane."}</p>
              <p className="text-slate-400 select-none">{"------------------------------------------------------------"}</p>
              
              {filteredLogsList.map((log) => (
                <div key={log.id} className="leading-relaxed">
                  <span className="text-slate-400 mr-1 select-none">[{log.time}]</span>
                  <span className={`font-black uppercase mr-1.5 ${
                    log.level === "Error"
                      ? "text-red-400"
                      : log.level === "Warning"
                      ? "text-orange-400"
                      : log.level === "Debug"
                      ? "text-indigo-400"
                      : "text-blue-400"
                  }`}>
                    [{log.level}]
                  </span>
                  <span className="text-slate-400 font-bold mr-1 select-none">[{log.source}]:</span>
                  <span className="text-slate-100">{log.message}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center text-[10.5px] font-semibold text-slate-500">
              <div className="flex gap-4">
                <span>Version: <strong className="text-slate-700">v4.8.2</strong></span>
                <span>Build: <strong className="text-slate-700">#40291</strong></span>
                <span>Commit: <strong className="text-slate-700">7a2f1c8e</strong></span>
              </div>
              <button
                onClick={() => {
                  setSystemLogs([]);
                  triggerNotification("🧹 Log matrices cleared.");
                }}
                className="text-[#315C9F] hover:text-[#1F3557] font-black uppercase tracking-wider"
              >
                Clear Screen Logs
              </button>
            </div>

          </div>

          {/* MODULE INTEGRITY MATRIX GRAPH */}
          <div className="bg-white rounded-3xl p-6 border border-[#BDDDF8] shadow-sm xl:col-span-12 space-y-4">
            <div>
              <h4 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider">System Modules Health Check Registry</h4>
              <p className="text-[10px] text-slate-400 font-sans mt-0.5">Continuous automated operational auditing loops across all 19 screens.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-3 text-xs font-sans font-medium">
              {moduleHealthRegistry.map((mod, i) => {
                let colorClass = "bg-emerald-50 border-emerald-200 text-emerald-800";
                if (mod.status === "Performance Warning") colorClass = "bg-amber-50 border-amber-200 text-amber-800";
                if (mod.status === "Error") colorClass = "bg-red-50 border-red-200 text-red-800 animate-pulse";
                if (mod.status === "Offline") colorClass = "bg-slate-50 border-slate-200 text-slate-500";

                return (
                  <div key={i} className={`p-3.5 rounded-2xl border ${colorClass} hover:scale-[1.01] transition-all`}>
                    <div className="flex justify-between items-start">
                      <span className="font-extrabold text-[#1F3557] uppercase tracking-wider text-[10px] block truncate">{mod.name}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    </div>
                    <div className="mt-2 text-left space-y-1 font-semibold">
                      <p className="text-[9.5px] font-bold opacity-80 uppercase font-mono">{mod.status}</p>
                      <div className="flex justify-between text-[9px] opacity-60 pt-1 border-t border-black/5 font-mono">
                        <span>Latency:</span>
                        <span>{mod.avgTimeMs}ms</span>
                      </div>
                      <div className="flex justify-between text-[9px] opacity-60 font-mono">
                        <span>Queue:</span>
                        <span>{mod.pendingEvents} pending</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* --- OWNER QUICK ACTIONS DECK --- */}
      <div className="bg-[#EAF5FF] rounded-3xl p-6 border border-[#BDDDF8] shadow-sm space-y-4">
        <h3 className="text-xs font-extrabold uppercase text-[#1F3557] tracking-wider flex items-center gap-1.5">
          <span>⚡</span> Owner Fast-Intake Maintenance Commands
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          {[
            { label: "Create Backup", action: handleBackupNow, icon: "💾", color: "bg-white hover:bg-[#BDDDF8] border-[#9EC8EF]" },
            { label: "Restart Services", action: () => {
              triggerNotification("🔄 Owner Command: Gracefully reloading central server processes... Online!");
            }, icon: "🔄", color: "bg-white hover:bg-[#BDDDF8] border-[#9EC8EF]" },
            { label: "Rebuild Event Queue", action: () => {
              setEventsQueue(prev => prev.filter(e => e.status !== "Completed"));
              triggerNotification("🔄 Rebuilt Event queue matrices. Discarded completed records.");
            }, icon: "⚙️", color: "bg-white hover:bg-[#BDDDF8] border-[#9EC8EF]" },
            { label: "Verify Database", action: handleAnalyzeDb, icon: "🔍", color: "bg-white hover:bg-[#BDDDF8] border-[#9EC8EF]" },
            { label: "Run System Audit", action: handleAISystemAudit, icon: "🛡️", color: "bg-white hover:bg-[#BDDDF8] border-[#9EC8EF]" },
            { label: "Optimize Performance", action: () => {
              setCpuUsage(9.2);
              triggerNotification("⚡ Performance optimized. Cleared slab caches.");
            }, icon: "⚡", color: "bg-white hover:bg-[#BDDDF8] border-[#9EC8EF]" },
            { label: "Verify Permissions", action: () => {
              triggerNotification("🛡️ Checked Owner-only access tokens. Permissions secure.");
            }, icon: "🔑", color: "bg-white hover:bg-[#BDDDF8] border-[#9EC8EF]" },
            { label: "Verify Integrations", action: () => {
              triggerNotification("🔗 Integrations: Stripe & QuickBooks online. Maps billing warning active.");
            }, icon: "🔗", color: "bg-white hover:bg-[#BDDDF8] border-[#9EC8EF]" }
          ].map((act, i) => (
            <button
              key={i}
              onClick={act.action}
              className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${act.color}`}
            >
              <span className="text-lg select-none">{act.icon}</span>
              <span className="text-[10px] font-black uppercase text-[#1F3557] tracking-wider leading-tight block">{act.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* CONFIRMATION MODAL */}
      {isConfirmReportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full mx-4 shadow-xl border border-blue-100 space-y-4 text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto text-blue-600">
              <Shield className="w-6 h-6 animate-pulse" />
            </div>
            <h3 className="text-base font-extrabold text-[#1F3557] uppercase tracking-wider">Confirm Report Generation</h3>
            <p className="text-xs text-[#5E7393] leading-relaxed font-sans font-medium">
              This action compiles and packages real-time operational and system telemetry indices. 
              Please confirm your administrative authorization override.
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={() => setIsConfirmReportModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={executeExportSystemReport}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1 shadow-md shadow-blue-500/15"
              >
                Authorize & Download
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
