import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import {
  Sparkles,
  Bot,
  Database,
  History,
  FileText,
  Play,
  Settings,
  Cpu,
  TrendingUp,
  BarChart2,
  CheckCircle2,
  ShieldCheck,
  Zap,
  HelpCircle,
  Save,
  Sliders,
  Layers,
  ChevronRight,
  RefreshCw,
  Clock,
  ArrowRight,
  Download,
  PlusSquare,
  AlertCircle,
  Check,
  Undo2
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from "recharts";

interface AIAssistantPageProps {
  globalAiSetting: "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO";
  setGlobalAiSetting: (val: "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO") => void;
  moduleAiSettings: Record<string, "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO" | "DEFAULT">;
  setModuleAiSettings: React.Dispatch<React.SetStateAction<Record<string, "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO" | "DEFAULT">>>;
}

export const AIAssistantPage: React.FC<AIAssistantPageProps> = ({
  globalAiSetting,
  setGlobalAiSetting,
  moduleAiSettings,
  setModuleAiSettings
}) => {
  const { loggedInUser, simulatedRole } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const { recentAiActions, setRecentAiActions } = useDomainData();
  const {
    openPlaceholderPage: onOpenPlaceholder,
    takeSnapshot: onTakeSnapshot,
    openPageAIAnalysis: onOpenAIAnalysis,
    logOperationalEvent
  } = useNavTelemetry();
  const [activeTab, setActiveTab] = useState<"command" | "reports" | "workflows" | "config" | "insights" | "settings">("command");
  
  // Local state for interactive configurations
  const [selectedKBDoc, setSelectedKBDoc] = useState<string>("pricebook");
  const [creativityLevel, setCreativityLevel] = useState<number>(70);
  const [aiTone, setAiTone] = useState<string>("analytical");
  const [showSaveToast, setShowSaveToast] = useState<boolean>(false);

  // Mock conversation history for the Command Center
  const [chatLogs, setChatLogs] = useState([
    { id: "log_1", title: "Low stock alert for Copper Tubing", date: "Today, 04:15 PM", module: "Inventory", preview: "Determined that copper tubing levels dropped below safety parameters..." },
    { id: "log_2", title: "Double booking on Route A conflict", date: "Today, 02:30 PM", module: "Scheduling", preview: "Suggested shifting technician Dave's 3 PM call to tomorrow morning..." },
    { id: "log_3", title: "Invoice leakage analysis", date: "Jul 5, 2026", module: "Revenue", preview: "Reviewed outstanding unpaid balances for residential clients..." },
    { id: "log_4", title: "VIP Loyalty pricing suggestion", date: "Jul 4, 2026", module: "Estimates", preview: "Computed discount parameters for Apex Plumbing based on historical margin..." }
  ]);

  // Mock Business Insights telemetry chart data
  const chartsData = [
    { name: "Mon", "AI Recommendations": 42, "Auto Actions": 15, "Efficiency Gain %": 24 },
    { name: "Tue", "AI Recommendations": 58, "Auto Actions": 24, "Efficiency Gain %": 28 },
    { name: "Wed", "AI Recommendations": 65, "Auto Actions": 30, "Efficiency Gain %": 35 },
    { name: "Thu", "AI Recommendations": 48, "Auto Actions": 18, "Efficiency Gain %": 31 },
    { name: "Fri", "AI Recommendations": 72, "Auto Actions": 42, "Efficiency Gain %": 40 },
    { name: "Sat", "AI Recommendations": 30, "Auto Actions": 10, "Efficiency Gain %": 42 },
    { name: "Sun", "AI Recommendations": 20, "Auto Actions": 5, "Efficiency Gain %": 45 }
  ];

  // Mock AI Reports
  const reportsList = [
    { id: "rep_1", title: "Q3 Operational Bottleneck Forecast", size: "2.4 MB", type: "PDF Report", downloads: 14, date: "Jul 6, 2026" },
    { id: "rep_2", title: "Lead to Close Velocity Audit", size: "1.2 MB", type: "Spreadsheet", downloads: 8, date: "Jul 5, 2026" },
    { id: "rep_3", title: "Drive Time & Route Optimization Study", size: "950 KB", type: "PDF Report", downloads: 22, date: "Jul 3, 2026" },
    { id: "rep_4", title: "Payroll & Labor Efficiency Breakdown", size: "1.8 MB", type: "PDF Report", downloads: 11, date: "Jun 30, 2026" }
  ];

  // Mock Workflows
  const [workflows, setWorkflows] = useState([
    { id: "wf_1", name: "Low Inventory Automatic PO", desc: "Instantly draft purchase orders when core items drop below minQuantity.", status: true, triggers: "Inventory", actions: "PO Draft" },
    { id: "wf_2", name: "Lead Follow-up Auto Drafting", desc: "Draft professional reply proposals 30 mins after a new high-value lead arrives.", status: true, triggers: "Leads", actions: "Messages Draft" },
    { id: "wf_3", name: "Technician Drive Time Guard", desc: "Alert scheduler automatically if dispatch drive time exceeds 45 mins between jobs.", status: false, triggers: "Routes", actions: "Conflict Alert" },
    { id: "wf_4", name: "Customer Past Due Balance Hold", desc: "Automatically tag estimates as 'Review Required' if the client has invoices > 30 days outstanding.", status: true, triggers: "Estimates", actions: "Lock Status" }
  ]);

  const handleToggleWorkflow = (id: string) => {
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, status: !w.status } : w));
    const workflow = workflows.find(w => w.id === id);
    if (workflow) {
      logOperationalEvent("AI Config", `Workflow '${workflow.name}' status toggled to ${!workflow.status ? "Enabled" : "Disabled"}.`, "🤖");
    }
  };

  const handleSaveConfig = () => {
    setShowSaveToast(true);
    logOperationalEvent("AI Config", "LeadForge Global AI Knowledge database and tone configs saved.", "⚙️");
    setTimeout(() => setShowSaveToast(false), 3000);
  };

  const handleUndoAction = (id: string) => {
    setRecentAiActions(prev => prev.map(act => {
      if (act.id === id) {
        return { ...act, status: "Undone" as const };
      }
      return act;
    }));
    const actObj = recentAiActions.find(a => a.id === id);
    if (actObj) {
      logOperationalEvent("AI Undo", `Reverted action: ${actObj.action} in ${actObj.module}`, "↩️");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      
      {/* HEADER HERO AREA */}
      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#1F3557] to-[#4A86F7] text-white flex items-center justify-center text-2xl font-bold shadow-md">
            🤖
          </div>
          <div>
            <h2 className="text-lg font-sans font-extrabold text-[#1F3557] uppercase tracking-wider flex items-center gap-2">
              LeadForge AI Command Center
            </h2>
            <p className="text-xs text-[#5E7393] font-sans font-semibold">
              The neural core of LeadForge Local OS • Intelligent routing, automations & business diagnostics
            </p>
          </div>
        </div>
        
        {/* Quick Snapshot Action */}
        <button
          onClick={() => {
            if (onTakeSnapshot) onTakeSnapshot("ai_assistant", "AI Assistant Command Center");
          }}
          className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-xs font-bold text-[#315C9F] flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Capture UI State</span>
        </button>
      </div>

      {/* NAVIGATION TABS BAR */}
      <div className="flex flex-wrap gap-1.5 border-b border-[#9EC8EF]/40 pb-2.5">
        {[
          { id: "command", label: "Conversation History", icon: <History className="w-4 h-4" /> },
          { id: "reports", label: "AI Reports & Audits", icon: <FileText className="w-4 h-4" /> },
          { id: "workflows", label: "Saved Workflows", icon: <Zap className="w-4 h-4" /> },
          { id: "insights", label: "Business Insights", icon: <BarChart2 className="w-4 h-4" /> },
          { id: "config", label: "Model Knowledge Configuration", icon: <Database className="w-4 h-4" /> },
          { id: "settings", label: "Global AI Settings", icon: <Settings className="w-4 h-4" /> }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer border ${
              activeTab === tab.id
                ? "bg-[#1F3557] text-white border-[#1F3557] shadow-sm"
                : "bg-white text-[#5E7393] border-[#9EC8EF] hover:bg-[#EAF5FF] hover:text-[#1F3557]"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* INTERACTIVE CONTENT VIEWPORT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: ACTIVE WORKSPACE TAB CARD */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* CONVERSATION HISTORY TAB */}
          {activeTab === "command" && (
            <div className="bg-[#C7E3FB] rounded-3xl p-5 border border-[#A9CDEE] space-y-4 shadow-sm">
              <div className="flex justify-between items-center border-b border-[#A9CDEE] pb-3">
                <div>
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Historical AI Chats & Telemetries</h3>
                  <p className="text-[10.5px] text-slate-500 mt-0.5">Access and resume past session context logs and decision streams.</p>
                </div>
                <span className="text-[10px] bg-white text-[#315C9F] border border-[#A9CDEE] px-2.5 py-1 rounded-xl font-mono font-bold">
                  {chatLogs.length} Saved Logs
                </span>
              </div>

              <div className="space-y-3">
                {chatLogs.map((log) => (
                  <div key={log.id} className="p-4 bg-white border border-[#9EC8EF]/40 hover:border-[#315C9F] rounded-2xl flex justify-between gap-4 transition-all">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 bg-[#EAF5FF] text-[#315C9F] border border-[#9EC8EF]/40 rounded text-[9px] font-mono font-bold uppercase">
                          {log.module}
                        </span>
                        <span className="text-[9px] text-slate-400 font-bold font-mono">{log.date}</span>
                      </div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide truncate">{log.title}</h4>
                      <p className="text-slate-500 text-[11px] leading-relaxed line-clamp-2 font-sans font-medium">{log.preview}</p>
                    </div>
                    
                    <button
                      onClick={() => {
                        if (onOpenAIAnalysis) {
                          onOpenAIAnalysis(log.module.toLowerCase(), log.module, log.preview);
                        }
                      }}
                      className="h-fit px-3 py-2 bg-[#EAF5FF] hover:bg-[#315C9F] text-[#315C9F] hover:text-white border border-[#9EC8EF] hover:border-transparent rounded-xl text-[10px] font-black transition-colors uppercase tracking-wider flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>Resume</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="bg-[#E3F3FF] p-4 rounded-xl border border-[#A9CDEE] text-[11px] leading-relaxed text-slate-600 font-sans font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Storage Policy:</strong> Conversations remain persistently logged in Firestore until cleared. Any model configuration parameters tweaked inside this hub dynamically alter downstream floating widget logic automatically.
                </span>
              </div>
            </div>
          )}

          {/* AI REPORTS TAB */}
          {activeTab === "reports" && (
            <div className="bg-[#C7E3FB] rounded-3xl p-5 border border-[#A9CDEE] space-y-4 shadow-sm">
              <div className="flex justify-between items-center border-b border-[#A9CDEE] pb-3">
                <div>
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Operational Audits & Diagnostic Reports</h3>
                  <p className="text-[10.5px] text-slate-500 mt-0.5">Download AI-compiled corporate health and dispatch analysis logs.</p>
                </div>
                <button 
                  onClick={() => {
                    logOperationalEvent("AI Reports", "Triggered live compilation of new company-wide performance audit.", "📋");
                  }}
                  className="px-3 py-1.5 bg-[#4A9BFF] hover:bg-[#3583E6] text-white rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer flex items-center gap-1 shadow-sm transition-colors"
                >
                  <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '4s' }} />
                  <span>Compile Audit</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reportsList.map((rep) => (
                  <div key={rep.id} className="p-4 bg-white border border-[#9EC8EF]/40 rounded-2xl flex flex-col justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-mono text-[#4A9BFF] font-bold uppercase">{rep.type}</span>
                        <span className="text-[9px] text-slate-400 font-mono">{rep.date}</span>
                      </div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider leading-snug">{rep.title}</h4>
                      <p className="text-[10px] text-slate-400 font-bold font-mono">Size: {rep.size} • Total Downloads: {rep.downloads}</p>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <span className="text-[9.5px] text-slate-500 font-sans font-semibold flex items-center gap-1 text-emerald-600">
                        <CheckSquareIcon className="w-3.5 h-3.5" /> Verified Clean
                      </span>
                      <button
                        onClick={() => {
                          logOperationalEvent("AI Report Download", `Downloaded audit file: ${rep.title}`, "📥");
                        }}
                        className="p-1.5 bg-[#EAF5FF] hover:bg-[#315C9F] text-[#315C9F] hover:text-white border border-[#9EC8EF] hover:border-transparent rounded-lg transition-colors cursor-pointer"
                        title="Download Report"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SAVED WORKFLOWS TAB */}
          {activeTab === "workflows" && (
            <div className="bg-[#C7E3FB] rounded-3xl p-5 border border-[#A9CDEE] space-y-4 shadow-sm">
              <div className="flex justify-between items-center border-b border-[#A9CDEE] pb-3">
                <div>
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Autonomous AI Business Workflows</h3>
                  <p className="text-[10.5px] text-slate-500 mt-0.5">Manage automated triggers that execute background system logic.</p>
                </div>
                <button
                  onClick={() => onOpenPlaceholder("New Workflow Builder", "🤖")}
                  className="px-3 py-1.5 bg-[#4A9BFF] hover:bg-[#3583E6] text-white rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <PlusSquare className="w-3.5 h-3.5" />
                  <span>Create Trigger</span>
                </button>
              </div>

              <div className="space-y-3">
                {workflows.map((wf) => (
                  <div key={wf.id} className="p-4 bg-white border border-[#9EC8EF]/40 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[8.5px] rounded font-bold font-mono">
                          IF: {wf.triggers}
                        </span>
                        <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[8.5px] rounded font-bold font-mono">
                          THEN: {wf.actions}
                        </span>
                      </div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">{wf.name}</h4>
                      <p className="text-slate-500 text-[10.5px] font-sans font-semibold leading-relaxed">{wf.desc}</p>
                    </div>

                    <div className="flex items-center gap-3 self-end md:self-auto">
                      <span className={`text-[10px] font-mono font-bold uppercase ${wf.status ? "text-emerald-500" : "text-slate-400"}`}>
                        {wf.status ? "● Active Trigger" : "○ Paused"}
                      </span>
                      <button
                        onClick={() => handleToggleWorkflow(wf.id)}
                        className={`w-12 h-6 rounded-full p-0.5 transition-colors cursor-pointer relative ${
                          wf.status ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      >
                        <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${
                          wf.status ? "translate-x-6" : "translate-x-0"
                        }`} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BUSINESS INSIGHTS TAB */}
          {activeTab === "insights" && (
            <div className="bg-[#C7E3FB] rounded-3xl p-5 border border-[#A9CDEE] space-y-4 shadow-sm">
              <div className="border-b border-[#A9CDEE] pb-3">
                <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">AI Operations Productivity Telemetry</h3>
                <p className="text-[10.5px] text-slate-500 mt-0.5">Real-time charts plotting model efficiency and automated dispatch metrics.</p>
              </div>

              {/* Chart Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-[#9EC8EF]/30 h-64">
                  <p className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-2 text-left">Daily Optimization Telemetry</p>
                  <ResponsiveContainer width="100%" height="90%">
                    <AreaChart data={chartsData}>
                      <defs>
                        <linearGradient id="colorAI" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#315C9F" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#315C9F" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="name" stroke="#94A3B8" fontSize={9} tickLine={false} />
                      <YAxis stroke="#94A3B8" fontSize={9} tickLine={false} />
                      <Tooltip />
                      <Area type="monotone" dataKey="AI Recommendations" stroke="#315C9F" fillOpacity={1} fill="url(#colorAI)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#9EC8EF]/30 h-64">
                  <p className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-2 text-left">Autonomous Actions Completed</p>
                  <ResponsiveContainer width="100%" height="90%">
                    <BarChart data={chartsData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="name" stroke="#94A3B8" fontSize={9} tickLine={false} />
                      <YAxis stroke="#94A3B8" fontSize={9} tickLine={false} />
                      <Tooltip />
                      <Bar dataKey="Auto Actions" fill="#4A86F7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* KPI metrics row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: "Est. Win Probability Lift", value: "+18.2%", desc: "Estimates suggested with custom AI price margins win more bids." },
                  { label: "Dispatch Drive Saved", value: "34.5 hrs", desc: "Aggregated travel hours reduced via Route optimization algorithms." },
                  { label: "Average Efficiency Boost", value: "32.4%", desc: "Calculated across total simulated employee rosters this month." }
                ].map((kpi, kIdx) => (
                  <div key={kIdx} className="bg-white p-3.5 rounded-2xl border border-[#9EC8EF]/40 flex flex-col justify-between">
                    <div>
                      <p className="text-[9px] font-extrabold text-[#5E7393] uppercase tracking-wider">{kpi.label}</p>
                      <p className="text-lg font-black text-[#1F3557] mt-1">{kpi.value}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 font-sans font-medium mt-1 leading-normal text-left">{kpi.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KNOWLEDGE BASE CONFIG */}
          {activeTab === "config" && (
            <div className="bg-[#C7E3FB] rounded-3xl p-5 border border-[#A9CDEE] space-y-4 shadow-sm">
              <div className="border-b border-[#A9CDEE] pb-3">
                <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Model Knowledge Base Configuration</h3>
                <p className="text-[10.5px] text-slate-500 mt-0.5">Train your AI and sync corporate files to govern local system decisions.</p>
              </div>

              <div className="space-y-4 text-left">
                {/* Knowledge Base Selectors */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { id: "pricebook", label: "Corporate Price Book", icon: "💰", details: "Contains standard job line items, service pricing parameters, and vendor labor cost structures." },
                    { id: "codes", label: "Building Plumbing Codes", icon: "🚰", details: "Regional rules for HVAC safety clearances, drainage slopes, and local code criteria." },
                    { id: "safety", label: "Employee Safety Manual", icon: "🛡️", details: "Connected guidelines detailing hazard checklists and technician weather alerts." }
                  ].map((kb) => (
                    <button
                      key={kb.id}
                      onClick={() => setSelectedKBDoc(kb.id)}
                      className={`p-3.5 rounded-2xl border transition-all text-left flex flex-col justify-between cursor-pointer ${
                        selectedKBDoc === kb.id
                          ? "bg-[#1F3557] text-white border-transparent shadow-md"
                          : "bg-white text-slate-700 border-[#9EC8EF]/40 hover:bg-[#EAF5FF]"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xl select-none">{kb.icon}</span>
                        {selectedKBDoc === kb.id && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-wider mt-2.5">{kb.label}</h4>
                      <p className={`text-[10px] leading-relaxed mt-1 font-sans font-medium ${selectedKBDoc === kb.id ? "text-slate-300" : "text-slate-500"}`}>{kb.details}</p>
                    </button>
                  ))}
                </div>

                {/* Creativity levels & sliders */}
                <div className="bg-white p-5 rounded-2xl border border-[#9EC8EF]/40 space-y-4">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Hyperparameter & System Tuning</h4>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10.5px] font-bold text-[#5E7393]">
                      <span>CREATIVITY COEFFICIENT (TEMPERATURE)</span>
                      <span className="font-mono text-[#315C9F]">{creativityLevel}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={creativityLevel}
                      onChange={(e) => setCreativityLevel(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#315C9F]"
                    />
                    <p className="text-[9px] text-slate-400 font-sans font-semibold">
                      Lower values produce strict, precise ledger analysis. Higher values generate creative proposal drafting.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">Model Conversation Tone Tone</label>
                    <select
                      value={aiTone}
                      onChange={(e) => setAiTone(e.target.value)}
                      className="w-full bg-[#EAF5FF] border border-[#9EC8EF] text-xs font-bold text-[#1F3557] rounded-xl px-3 py-2 focus:outline-none cursor-pointer"
                    >
                      <option value="analytical">Analytical & Objective (System Default)</option>
                      <option value="supportive">Supportive & Collaborative (Aesthetic-Friendly)</option>
                      <option value="brutalist">Brutalist & Minimal (Compact Summaries)</option>
                      <option value="sales">Commercial & Sales-Focused (Proposal Boosting)</option>
                    </select>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={handleSaveConfig}
                      className="px-4 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Apply Knowledge Sync</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* GLOBAL AI SETTINGS TAB */}
          {activeTab === "settings" && (
            <div className="bg-[#C7E3FB] rounded-3xl p-5 border border-[#A9CDEE] space-y-4 shadow-sm">
              <div className="border-b border-[#A9CDEE] pb-3">
                <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Global Assistant Integration Modes</h3>
                <p className="text-[10.5px] text-slate-500 mt-0.5">Configure system defaults that are inherited by individual workspaces.</p>
              </div>

              <div className="space-y-5 text-left">
                <div className="bg-white p-4 rounded-2xl border border-[#9EC8EF]/40 space-y-3">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1">
                    <Sliders className="w-4 h-4 text-[#315C9F]" /> Set Default Global Policy
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-normal font-sans font-medium">
                    This selection represents the baseline AI control framework across all modules. If a specific module configuration is set to 'DEFAULT', it inherits this selection automatically.
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-2">
                    {[
                      { id: "OFF", label: "OFF", desc: "Disable AI assistance entirely." },
                      { id: "ASSIST", label: "ASSIST", desc: "Suggest items inside chat widgets only." },
                      { id: "ASSIST + APPROVAL", label: "ASSIST + APP.", desc: "Automate actions but await confirmation." },
                      { id: "AUTO", label: "AUTO", desc: "Execute operations autonomously." }
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => {
                          setGlobalAiSetting(mode.id as any);
                          logOperationalEvent("AI Config", `Global fallback baseline mode updated to ${mode.id}.`, "🤖");
                        }}
                        className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer ${
                          globalAiSetting === mode.id
                            ? "bg-[#315C9F] text-white border-transparent shadow-sm"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-[#EAF5FF]"
                        }`}
                      >
                        <span className="text-xs font-black tracking-wider uppercase">{mode.label}</span>
                        <p className={`text-[9px] leading-tight mt-1.5 font-sans font-semibold ${globalAiSetting === mode.id ? "text-slate-200" : "text-slate-400"}`}>{mode.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#9EC8EF]/40 space-y-3">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Module-Specific Overrides Configuration</h4>
                  <p className="text-[11px] text-slate-500 font-sans font-medium">
                    Tweak specific operational bounds. Specific overrides customize the global fallback configured above.
                  </p>

                  <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1.5 scrollbar-thin">
                    {[
                      { key: "dashboard", label: "Dashboard Hub" },
                      { key: "revenue", label: "Revenue Analytics" },
                      { key: "customers", label: "CRM Customers" },
                      { key: "leads", label: "Acquisition Leads" },
                      { key: "estimates", label: "Estimates & Bids" },
                      { key: "scheduling", label: "Field Scheduling" },
                      { key: "dispatch", label: "Dispatch Board" },
                      { key: "inventory", label: "Inventory Ledger" },
                      { key: "documents", label: "Documents Vault" },
                      { key: "messages", label: "Chat & Messages" },
                      { key: "training", label: "Training Academy" }
                    ].map((mod) => (
                      <div key={mod.key} className="flex items-center justify-between p-2.5 hover:bg-slate-50/50 rounded-xl border border-slate-100 bg-white">
                        <span className="text-xs font-bold text-slate-700 font-sans">{mod.label}</span>
                        <select
                          value={moduleAiSettings[mod.key] || "DEFAULT"}
                          onChange={(e) => {
                            const val = e.target.value;
                            setModuleAiSettings(prev => ({ ...prev, [mod.key]: val as any }));
                            logOperationalEvent("AI Config", `Override for '${mod.label}' updated to ${val}.`, "⚙️");
                          }}
                          className="text-[10px] font-bold text-[#1F3557] bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-lg px-2.5 py-1 focus:outline-none cursor-pointer font-sans"
                        >
                          <option value="DEFAULT">INHERIT DEFAULT ({globalAiSetting})</option>
                          <option value="OFF">OFF</option>
                          <option value="ASSIST">ASSIST</option>
                          <option value="ASSIST + APPROVAL">ASSIST + APPROVAL</option>
                          <option value="AUTO">AUTO (AUTONOMOUS)</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: RECENT ACTIONS PANEL */}
        <div className="space-y-6 text-left">
          
          {/* QUICK SYSTEM STATS */}
          <div className="bg-[#1F3557] text-white p-5 rounded-3xl border border-[#1F3557] shadow-lg flex flex-col justify-between h-44 relative overflow-hidden">
            <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-10 select-none text-[120px] font-black">
              AI
            </div>
            <div className="space-y-1">
              <span className="text-[9.5px] bg-[#4A86F7] text-white px-2 py-0.5 rounded font-black tracking-widest uppercase">
                Core Engine Status
              </span>
              <h3 className="text-base font-extrabold uppercase mt-1.5 tracking-wider">Active Workspace AI</h3>
              <p className="text-[10.5px] text-slate-300 leading-normal font-sans font-medium">
                LeadForge AI watches active module screens, syncing real-time inputs to optimize task proposal flows.
              </p>
            </div>
            
            <div className="flex items-center justify-between text-xs font-bold font-mono pt-2 border-t border-white/10 mt-2">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> LIVE TELEMETRY
              </span>
              <span className="text-slate-300">v3.5 Flash Protocol</span>
            </div>
          </div>

          {/* RECENT AI ACTIONS LEDGER */}
          <div className="bg-white rounded-3xl p-5 border border-[#9EC8EF]/40 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-xs font-black text-[#1F3557] uppercase tracking-wider">Audit Log: Recent AI Actions</h3>
                <p className="text-[10px] text-slate-400 font-sans font-medium">Click undo to reverse any model-driven state change.</p>
              </div>
              <span className="text-[9px] bg-[#EAF5FF] text-[#315C9F] border border-[#9EC8EF]/30 px-2 py-0.5 rounded font-mono font-black">
                {recentAiActions.filter(a => a.status === "Completed").length} Active
              </span>
            </div>

            <div className="space-y-3.5 max-h-[460px] overflow-y-auto pr-1 scrollbar-thin">
              {recentAiActions.map((act) => (
                <div key={act.id} className={`p-3.5 rounded-2xl border transition-all ${
                  act.status === "Undone" 
                    ? "bg-rose-50/50 border-rose-100 text-slate-400" 
                    : "bg-[#F5FAFF] border-[#9EC8EF]/40 text-slate-700 hover:border-[#315C9F]"
                }`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 text-[8.5px] rounded font-mono font-bold uppercase">
                          {act.module}
                        </span>
                        <span className={`px-1.5 py-0.5 text-[8.5px] rounded font-mono font-bold uppercase border ${
                          act.status === "Completed" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                          act.status === "Pending Approval" ? "bg-amber-50 text-amber-700 border-amber-100" :
                          "bg-rose-100 text-rose-700 border-rose-200"
                        }`}>
                          {act.status}
                        </span>
                      </div>
                      <p className="text-[8.5px] text-slate-400 font-mono font-bold mt-1">{act.date} • {act.time}</p>
                    </div>
                    
                    {act.status !== "Undone" && (
                      <button
                        onClick={() => handleUndoAction(act.id)}
                        className="px-2 py-1 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-100 rounded-lg text-[9px] font-black transition-colors uppercase tracking-wider flex items-center gap-0.5 cursor-pointer"
                        title="Revert decision"
                      >
                        <Undo2 className="w-2.5 h-2.5" />
                        <span>Undo</span>
                      </button>
                    )}
                  </div>

                  <h4 className={`text-xs font-extrabold uppercase mt-2 ${act.status === "Undone" ? "line-through" : "text-slate-800"}`}>
                    {act.action}
                  </h4>
                  <p className="text-[10.5px] leading-relaxed mt-1 text-slate-500 font-sans font-medium">{act.reason}</p>
                  
                  {act.approvedBy && (
                    <p className="text-[9.5px] text-[#4A86F7] font-mono font-bold mt-1.5 pt-1.5 border-t border-slate-100/60">
                      Approved By: {act.approvedBy}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* FLOATING SAVE CONFIRMATION TOAST */}
      {showSaveToast && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-emerald-500/30 shadow-[0_10px_30px_rgba(16,185,129,0.2)] rounded-2xl px-4 py-3.5 flex items-center gap-3 z-50 text-xs md:text-sm animate-fade-in text-slate-100 max-w-sm">
          <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
            <CheckSquareIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-white mb-0.5">Configuration Saved</p>
            <p className="text-slate-400 font-medium text-xs leading-tight">Neural parameters applied successfully to LeadForge Core.</p>
          </div>
        </div>
      )}

    </div>
  );
};

// Simple inline helper icon for checkmark
const CheckSquareIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
