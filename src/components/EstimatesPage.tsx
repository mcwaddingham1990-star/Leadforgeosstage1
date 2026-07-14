import React, { useState, useMemo } from "react";
import { useDomainActions } from "../hooks/useDomainActions";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import {
  Search,
  Plus,
  Upload,
  Download,
  FileText,
  DollarSign,
  User,
  Calendar,
  MessageSquare,
  Sparkles,
  Camera,
  Activity,
  Briefcase,
  Layers,
  Wrench,
  Percent,
  CheckCircle,
  Clock,
  ArrowRight,
  Database,
  Cpu,
  TrendingUp,
  FileSpreadsheet,
  Trash2,
  Lock,
  ChevronRight,
  AlertCircle,
  X
} from "lucide-react";

export type { Estimate } from "../types/domain";
import type { Estimate } from "../types/domain";

// 8 high-quality realistic Estimates
export const INITIAL_ESTIMATES: Estimate[] = [];

export const EstimatesPage: React.FC = () => {
  const { approveEstimateToJob } = useDomainActions();
  const { loggedInUser } = useAuth();
  const { estimates: propsEstimates, setEstimates, recentRoster } = useDomainData();
  const {
    openPlaceholderPage: onOpenPlaceholder,
    takeSnapshot: onTakeSnapshot,
    openPageAIAnalysis: onOpenAIAnalysis,
    navigateToScreen: onNavigateToScreen,
    logOperationalEvent
  } = useNavTelemetry();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>("All");
  const [localEstimates, setLocalEstimates] = useState<Estimate[]>(INITIAL_ESTIMATES);

  const [selectedEstimate, setSelectedEstimate] = useState<Estimate | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Form states
  const [formCustomerName, setFormCustomerName] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formAmount, setFormAmount] = useState<number>(0);
  const [formStatus, setFormStatus] = useState<Estimate["status"]>("Draft");
  const [formSalesRep, setFormSalesRep] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const openAddModal = () => {
    setFormCustomerName("");
    setFormCompany("");
    setFormAmount(0);
    setFormStatus("Draft");
    setFormSalesRep("Self");
    setFormNotes("");
    setIsAddModalOpen(true);
  };

  const handleAddEstimate = () => {
    if (!formCustomerName.trim()) return;
    const newEst: Estimate = {
      id: "est_" + Math.random().toString(36).substring(2, 9),
      number: "EST-2026-" + Math.floor(100 + Math.random() * 900),
      customerName: formCustomerName.trim(),
      company: formCompany.trim() || formCustomerName.trim() + " Inc",
      status: formStatus,
      salesRep: formSalesRep.trim() || "Self",
      amount: Number(formAmount) || 0,
      createdDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" }),
      expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })
    };

    if (setEstimates) {
      setEstimates(prev => [newEst, ...prev]);
    } else {
      setLocalEstimates(prev => [newEst, ...prev]);
    }
    if (logOperationalEvent) {
      logOperationalEvent("Estimate Created", `${newEst.number} for ${newEst.customerName}`, "📝");
    }
    setIsAddModalOpen(false);
  };

  const openViewModal = (est: Estimate) => {
    setSelectedEstimate(est);
    setFormCustomerName(est.customerName);
    setFormCompany(est.company || "");
    setFormAmount(est.amount);
    setFormStatus(est.status);
    setFormSalesRep(est.salesRep);
    setFormNotes("");
    setIsEditMode(false);
  };

  const handleSaveEdit = () => {
    if (!selectedEstimate) return;
    const updated = {
      ...selectedEstimate,
      customerName: formCustomerName.trim(),
      company: formCompany.trim(),
      amount: Number(formAmount) || 0,
      status: formStatus,
      salesRep: formSalesRep.trim()
    };

    if (setEstimates) {
      setEstimates(prev => prev.map(e => e.id === selectedEstimate.id ? updated : e));
    } else {
      setLocalEstimates(prev => prev.map(e => e.id === selectedEstimate.id ? updated : e));
    }
    if (logOperationalEvent) {
      logOperationalEvent("Estimate Updated", `${updated.number} saved`, "📝");
    }
    setSelectedEstimate(updated);
    setIsEditMode(false);
  };

  const handleApproveEstimate = () => {
    if (!selectedEstimate) return;
    approveEstimateToJob(selectedEstimate.id);
    setSelectedEstimate(null);
  };

  const estimates = propsEstimates || localEstimates;

  // Filtered estimates list
  const filteredEstimates = useMemo(() => {
    return estimates.filter((est) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q === "" ||
        est.customerName.toLowerCase().includes(q) ||
        est.number.toLowerCase().includes(q) ||
        est.company.toLowerCase().includes(q) ||
        est.salesRep.toLowerCase().includes(q) ||
        est.amount.toString().includes(q);

      if (!matchesSearch) return false;

      const matchesStatus =
        activeStatusFilter === "All" || est.status === activeStatusFilter;

      return matchesStatus;
    });
  }, [estimates, searchQuery, activeStatusFilter]);

  // Metrics sums
  const metrics = useMemo(() => {
    const totalEstimates = estimates.length;
    const openEstimates = estimates.filter(
      (e) => e.status === "Draft" || e.status === "Pending" || e.status === "Sent" || e.status === "Viewed"
    ).length;
    const pendingApproval = estimates.filter((e) => e.status === "Pending").length;
    const accepted = estimates.filter((e) => e.status === "Accepted").length;
    const declined = estimates.filter((e) => e.status === "Declined").length;
    
    // Revenue pending calculation
    const revenuePending = estimates.filter(
      (e) => e.status === "Pending" || e.status === "Sent" || e.status === "Viewed"
    ).reduce((sum, e) => sum + e.amount, 0);

    return {
      totalEstimates,
      openEstimates,
      pendingApproval,
      accepted,
      declined,
      revenuePending
    };
  }, [estimates]);

  // Status lists for rendering filters
  const STATUS_FILTERS = [
    "Draft",
    "Pending",
    "Sent",
    "Viewed",
    "Accepted",
    "Declined",
    "Expired",
    "Completed"
  ];

  // Activities logs for the bottom section
  const activities = [
    { id: "act_1", type: "Estimate Accepted", desc: "Estimate #EST-2026-001 by Marcus Vance accepted ($12,500.00)", time: "2 hours ago", icon: "✅" },
    { id: "act_2", type: "Estimate Sent", desc: "Estimate #EST-2026-002 sent to Diana Prince ($8,900.00)", time: "5 hours ago", icon: "📨" },
    { id: "act_3", type: "Customer Viewed Estimate", desc: "Clark Kent viewed Estimate #EST-2026-004 on mobile portal", time: "1 day ago", icon: "👁️" },
    { id: "act_4", type: "Estimate Created", desc: "New draft Estimate #EST-2026-005 created for Bruce Wayne", time: "1 day ago", icon: "📝" },
    { id: "act_5", type: "Estimate Declined", desc: "Estimate #EST-2026-006 declined by Arthur Curry (Scope adjustment requested)", time: "3 days ago", icon: "❌" },
    { id: "act_6", type: "Estimate Converted to Job", desc: "Estimate #EST-2026-008 converted to Job #JOB-5912 and dispatched", time: "5 days ago", icon: "🛠️" }
  ];

  // Handle navigation with safety checks
  const handleLinkNavigation = (screenId: string, fallbackLabel: string, icon: string) => {
    if (onNavigateToScreen && ["customers", "leads", "dashboard"].includes(screenId)) {
      onNavigateToScreen(screenId);
    } else {
      onOpenPlaceholder(fallbackLabel, icon);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      
      {/* 1. TOP CARD */}
      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-display font-extrabold text-[#1F3557] tracking-tight uppercase flex items-center gap-2">
              <span>📝</span> Estimates & Bids
            </h2>
            <p className="text-xs text-[#5E7393] font-bold mt-1 uppercase tracking-wider">
              System quotation customizer, pipeline diagnostic panel & proposal dispatch nodes
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              New Estimate
            </button>
            <button
              onClick={() => onOpenPlaceholder("Import Estimates Database", "📥")}
              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </button>
            <button
              onClick={() => onOpenPlaceholder("Export Estimates Ledger", "📤")}
              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            {onTakeSnapshot && (
              <button
                onClick={() =>
                  onTakeSnapshot("estimates", "Estimates & Bids", {
                    recordCount: filteredEstimates.length,
                    filters: `Status: ${activeStatusFilter}`,
                    details: `Estimates pipeline logged. Total open: ${metrics.openEstimates}, Total Revenue Pending: $${metrics.revenuePending.toLocaleString()}`
                  })
                }
                className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
                title="Take Page Snapshot"
              >
                <Camera className="w-3.5 h-3.5 text-[#315C9F]" />
                Snapshot
              </button>
            )}
            {onOpenAIAnalysis && (
              <button
                onClick={() => onOpenAIAnalysis("estimates", "Estimates & Bids")}
                className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
                title="AI Option"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                AI Option
              </button>
            )}
          </div>
        </div>

        {/* SEARCH AND FILTERS */}
        <div className="bg-[#EAF5FF] p-4 rounded-2xl border border-[#9EC8EF] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5E7393] pointer-events-none">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Customer, Estimate Number, Company, Phone, Address, Sales Rep..."
              className="w-full text-xs bg-white border border-[#9EC8EF] rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-[#315C9F] text-[#1F3557] font-sans font-semibold placeholder-[#5E7393]/60"
            />
          </div>
          <div className="text-right shrink-0">
            <span className="text-[10px] text-[#5E7393] font-bold uppercase tracking-wider block md:inline mr-2">
              Search parameters index:
            </span>
            <div className="inline-flex gap-1.5 flex-wrap">
              {["Customer", "Estimate Number", "Company", "Phone", "Address"].map((item) => (
                <span
                  key={item}
                  className="px-2 py-1 bg-white border border-[#9EC8EF]/60 text-[#315C9F] text-[9px] font-mono font-bold rounded-lg uppercase tracking-wide shadow-2xs"
                >
                  • {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 2. SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="bg-[#EAF5FF] border border-[#9EC8EF] p-4 rounded-2xl flex flex-col items-start gap-1 shadow-sm">
          <span className="text-[10px] text-[#5E7393] font-extrabold uppercase tracking-widest">
            Open Estimates
          </span>
          <span className="text-xl font-mono font-black text-[#1F3557]">
            {metrics.openEstimates}
          </span>
          <span className="text-[9px] text-[#5E7393]/80 font-bold uppercase tracking-wider">
            In active workflow
          </span>
        </div>

        <div className="bg-[#EAF5FF] border border-[#9EC8EF] p-4 rounded-2xl flex flex-col items-start gap-1 shadow-sm">
          <span className="text-[10px] text-[#5E7393] font-extrabold uppercase tracking-widest">
            Pending Approval
          </span>
          <span className="text-xl font-mono font-black text-amber-600">
            {metrics.pendingApproval}
          </span>
          <span className="text-[9px] text-[#5E7393]/80 font-bold uppercase tracking-wider">
            Awaiting dispatch
          </span>
        </div>

        <div className="bg-[#EAF5FF] border border-[#9EC8EF] p-4 rounded-2xl flex flex-col items-start gap-1 shadow-sm">
          <span className="text-[10px] text-[#5E7393] font-extrabold uppercase tracking-widest">
            Accepted
          </span>
          <span className="text-xl font-mono font-black text-emerald-600">
            {metrics.accepted}
          </span>
          <span className="text-[9px] text-[#5E7393]/80 font-bold uppercase tracking-wider">
            Ready to build job
          </span>
        </div>

        <div className="bg-[#EAF5FF] border border-[#9EC8EF] p-4 rounded-2xl flex flex-col items-start gap-1 shadow-sm">
          <span className="text-[10px] text-[#5E7393] font-extrabold uppercase tracking-widest">
            Declined
          </span>
          <span className="text-xl font-mono font-black text-rose-500">
            {metrics.declined}
          </span>
          <span className="text-[9px] text-[#5E7393]/80 font-bold uppercase tracking-wider">
            Needs review / edit
          </span>
        </div>

        <div className="col-span-2 md:col-span-1 bg-[#315C9F] border border-[#1F3557] p-4 rounded-2xl flex flex-col items-start gap-1 shadow-md text-white">
          <span className="text-[10px] text-blue-100 font-extrabold uppercase tracking-widest">
            Revenue Pending
          </span>
          <span className="text-xl font-mono font-black text-white">
            ${metrics.revenuePending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[9px] text-blue-200/90 font-bold uppercase tracking-wider">
            Outstanding volume
          </span>
        </div>
      </div>

      {/* 3. STATUS FILTERS BAR & ESTIMATES LIST TABLE CONTAINER */}
      <div className="bg-white rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-4">
        
        {/* FILTERS */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-[#EAF5FF] pb-4 gap-4">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[#EAF5FF] rounded-lg border border-[#9EC8EF]">
              <Activity className="w-4 h-4 text-[#315C9F]" />
            </span>
            <div>
              <h3 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider">
                Quotation Database Ledger
              </h3>
              <p className="text-[10px] text-[#5E7393] font-bold">
                Filtered: {filteredEstimates.length} of {estimates.length} proposals
              </p>
            </div>
          </div>

          {/* HORIZONTAL BUTTON FILTERS */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <button
              onClick={() => setActiveStatusFilter("All")}
              className={`px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider rounded-xl transition-all cursor-pointer border ${
                activeStatusFilter === "All"
                  ? "bg-[#315C9F] border-[#1F3557] text-white"
                  : "bg-[#EAF5FF] border-[#9EC8EF]/50 text-[#1F3557] hover:bg-[#BDDDF8]"
              }`}
            >
              All Statuses
            </button>
            {STATUS_FILTERS.map((f) => {
              const count = estimates.filter((e) => e.status === f).length;
              return (
                <button
                  key={f}
                  onClick={() => setActiveStatusFilter(f)}
                  className={`px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider rounded-xl transition-all cursor-pointer border ${
                    activeStatusFilter === f
                      ? "bg-[#315C9F] border-[#1F3557] text-white shadow-xs"
                      : "bg-[#EAF5FF] border-[#9EC8EF]/50 text-[#1F3557] hover:bg-[#BDDDF8]"
                  }`}
                >
                  {f} <span className="font-mono text-[9px] opacity-75">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. ESTIMATES TABLE */}
        <div className="overflow-x-auto rounded-2xl border border-[#9EC8EF]/60 bg-[#F5FAFF]/50 shadow-inner">
          <table className="w-full min-w-[1000px] text-left border-collapse">
            <thead>
              <tr className="bg-[#C7E3FA]/60 text-[10px] font-sans font-bold text-[#1F3557] uppercase border-b border-[#9EC8EF]/60">
                <th className="py-3.5 px-4">Estimate #</th>
                <th className="py-3.5 px-4">Customer</th>
                <th className="py-3.5 px-4">Company</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Sales Representative</th>
                <th className="py-3.5 px-4 text-right">Amount</th>
                <th className="py-3.5 px-4">Created</th>
                <th className="py-3.5 px-4">Expiration Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAF5FF] text-xs text-slate-700">
              {filteredEstimates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#5E7393] font-bold uppercase tracking-wider bg-white">
                    No matching estimates found in this system node partition.
                  </td>
                </tr>
              ) : (
                filteredEstimates.map((est) => {
                  // Style badge depending on status
                  let badgeStyle = "bg-slate-100 text-slate-700 border-slate-300";
                  if (est.status === "Accepted" || est.status === "Completed") {
                    badgeStyle = "bg-emerald-50 border-emerald-200 text-emerald-700";
                  } else if (est.status === "Pending" || est.status === "Sent" || est.status === "Viewed") {
                    badgeStyle = "bg-amber-50 border-amber-200 text-amber-700";
                  } else if (est.status === "Declined") {
                    badgeStyle = "bg-rose-50 border-rose-200 text-rose-700";
                  } else if (est.status === "Expired") {
                    badgeStyle = "bg-slate-200 border-slate-400 text-slate-500";
                  }

                  return (
                    <tr
                      key={est.id}
                      onClick={() => openViewModal(est)}
                      className="hover:bg-[#EAF5FF] transition-all cursor-pointer group bg-white"
                    >
                      <td className="py-3.5 px-4 font-mono font-black text-[#315C9F] group-hover:underline">
                        {est.number}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#1F3557]">
                        {est.customerName}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-600">
                        {est.company}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-1 rounded-xl text-[9px] font-bold uppercase border tracking-wider ${badgeStyle}`}>
                          {est.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-500">
                        {est.salesRep}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-black text-[#1F3557]">
                        ${est.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                        {est.createdDate}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                        {est.expirationDate}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. INTERACTIVE ESTIMATE BUILDER SCREEN (UI LAYOUT) */}
      <div className="bg-white rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-[#EAF5FF] pb-4">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[#EAF5FF] rounded-lg border border-[#9EC8EF]">
              <Layers className="w-4.5 h-4.5 text-[#315C9F]" />
            </span>
            <div>
              <h2 className="text-base font-sans font-extrabold text-[#1F3557] uppercase tracking-wider">
                Interactive Estimate Builder Engine
              </h2>
              <p className="text-xs text-[#5E7393] font-bold">
                Configure material parameters, crew dispatch times, pricing rules, and tax brackets
              </p>
            </div>
          </div>
          <span className="px-3 py-1 bg-[#EAF5FF] text-[#315C9F] text-[9px] font-mono font-black uppercase rounded-xl border border-[#9EC8EF] tracking-wider animate-pulse">
            Design Studio Mode
          </span>
        </div>

        {/* Builder Form Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main sections */}
          <div className="lg:col-span-2 space-y-5">
            
            {/* Customer & Job Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Customer Information */}
              <div className="bg-[#F5FAFF] p-4 rounded-2xl border border-[#9EC8EF]/50 space-y-3">
                <h4 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider flex items-center gap-1.5 border-b border-[#9EC8EF]/30 pb-2">
                  <User className="w-3.5 h-3.5 text-[#315C9F]" /> Customer Information
                </h4>
                <div className="space-y-2">
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-[#5E7393] font-black block mb-1">Select Customer Record</label>
                    <select className="w-full text-xs bg-white border border-[#9EC8EF] rounded-xl px-3 py-2.5 font-semibold text-[#1F3557] focus:outline-none">
                      <option>Marcus Vance — Apex Plumb & Drain</option>
                      <option>Clara Oswald — Oakridge Apartments</option>
                      <option>Diana Prince — Themyscira Antiques</option>
                      <option>Clark Kent — Daily Planet Corp</option>
                      <option>Bruce Wayne — Wayne Enterprises</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-[#5E7393] font-black block mb-1">Billing Address Reference</label>
                    <input
                      type="text"
                      placeholder="120 Plum Ave, Suite B, Gotham"
                      className="w-full text-xs bg-white border border-[#9EC8EF] rounded-xl px-3 py-2.5 font-semibold text-[#1F3557] focus:outline-none placeholder-[#5E7393]/40"
                    />
                  </div>
                </div>
              </div>

              {/* Job Information */}
              <div className="bg-[#F5FAFF] p-4 rounded-2xl border border-[#9EC8EF]/50 space-y-3">
                <h4 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider flex items-center gap-1.5 border-b border-[#9EC8EF]/30 pb-2">
                  <Briefcase className="w-3.5 h-3.5 text-[#315C9F]" /> Job Information
                </h4>
                <div className="space-y-2">
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-[#5E7393] font-black block mb-1">Project Name / Brief Description</label>
                    <input
                      type="text"
                      placeholder="Commercial Sewer Replacements Stage 1"
                      className="w-full text-xs bg-white border border-[#9EC8EF] rounded-xl px-3 py-2.5 font-semibold text-[#1F3557] focus:outline-none placeholder-[#5E7393]/40"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] uppercase tracking-wider text-[#5E7393] font-black block mb-1">Created Date</label>
                      <input
                        type="date"
                        defaultValue="2026-07-05"
                        className="w-full text-xs bg-white border border-[#9EC8EF] rounded-xl px-2 py-2 font-semibold text-[#1F3557] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] uppercase tracking-wider text-[#5E7393] font-black block mb-1">Sales Rep</label>
                      <select 
                        value={formSalesRep} 
                        onChange={(e) => setFormSalesRep(e.target.value)}
                        className="w-full text-xs bg-white border border-[#9EC8EF] rounded-xl px-2 py-2 font-semibold text-[#1F3557] focus:outline-none"
                      >
                        <option value={loggedInUser?.name || "Owner"}>{loggedInUser?.name || "Owner"}</option>
                        {recentRoster && recentRoster.map((item, idx) => (
                          <option key={idx} value={item.name}>{item.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Labor & Materials */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Labor Configuration */}
              <div className="bg-[#F5FAFF] p-4 rounded-2xl border border-[#9EC8EF]/50 space-y-3">
                <h4 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider flex items-center gap-1.5 border-b border-[#9EC8EF]/30 pb-2">
                  <Activity className="w-3.5 h-3.5 text-[#315C9F]" /> Labor Assignment
                </h4>
                <div className="space-y-2.5">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[8.5px] uppercase tracking-wider text-[#5E7393] font-black block mb-1">Labor Code</label>
                      <select className="w-full text-xs bg-white border border-[#9EC8EF] rounded-xl px-2 py-2 font-semibold text-[#1F3557] focus:outline-none">
                        <option>Crew Master Plumber ($120/hr)</option>
                        <option>Senior Excavation Tech ($95/hr)</option>
                        <option>Apprentice Journeyman ($55/hr)</option>
                      </select>
                    </div>
                    <div className="w-20">
                      <label className="text-[8.5px] uppercase tracking-wider text-[#5E7393] font-black block mb-1">Est. Hours</label>
                      <input
                        type="number"
                        defaultValue="24"
                        className="w-full text-xs bg-white border border-[#9EC8EF] rounded-xl px-2 py-2 font-mono font-bold text-[#1F3557] text-center focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="p-2.5 bg-white border border-[#9EC8EF]/40 rounded-xl">
                    <p className="text-[10px] text-slate-500 font-semibold leading-normal">
                      • Base allocation: 2 senior technicians dispatched over 2 labor cycles. Total labor base rate modeled at <strong className="text-[#315C9F]">$2,280.00</strong>
                    </p>
                  </div>
                </div>
              </div>

              {/* Materials Configuration */}
              <div className="bg-[#F5FAFF] p-4 rounded-2xl border border-[#9EC8EF]/50 space-y-3">
                <h4 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider flex items-center gap-1.5 border-b border-[#9EC8EF]/30 pb-2">
                  <Wrench className="w-3.5 h-3.5 text-[#315C9F]" /> Materials & Supplies
                </h4>
                <div className="space-y-2.5">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[8.5px] uppercase tracking-wider text-[#5E7393] font-black block mb-1">Supply Name</label>
                      <select className="w-full text-xs bg-white border border-[#9EC8EF] rounded-xl px-2 py-2 font-semibold text-[#1F3557] focus:outline-none">
                        <option>Heavy-Duty PVC Conduit Pipe (100 ft)</option>
                        <option>Industrial Sewer Valve Coupling</option>
                        <option>Steel Reinforced Siphon Joint</option>
                      </select>
                    </div>
                    <div className="w-16">
                      <label className="text-[8.5px] uppercase tracking-wider text-[#5E7393] font-black block mb-1">Qty</label>
                      <input
                        type="number"
                        defaultValue="3"
                        className="w-full text-xs bg-white border border-[#9EC8EF] rounded-xl px-2 py-2 font-mono font-bold text-[#1F3557] text-center focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="p-2.5 bg-white border border-[#9EC8EF]/40 rounded-xl">
                    <p className="text-[10px] text-slate-500 font-semibold leading-normal">
                      • Warehousing ledger checklist: Supplies locked & reserved in primary yard depot. Supply cost estimate modeled at <strong className="text-[#315C9F]">$1,450.00</strong>
                    </p>
                  </div>
                </div>
              </div>

            </div>

            {/* Equipment & Additional Charges */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Equipment */}
              <div className="bg-[#F5FAFF] p-4 rounded-2xl border border-[#9EC8EF]/50 space-y-3">
                <h4 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider flex items-center gap-1.5 border-b border-[#9EC8EF]/30 pb-2">
                  <Layers className="w-3.5 h-3.5 text-[#315C9F]" /> Equipment & Rentals
                </h4>
                <div className="space-y-2">
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-[#5E7393] font-black block mb-1">Heavy Machinery Allocation</label>
                    <select className="w-full text-xs bg-white border border-[#9EC8EF] rounded-xl px-3 py-2.5 font-semibold text-[#1F3557] focus:outline-none">
                      <option>Hydraulic Ditch Excavator ($350/day)</option>
                      <option>Sewer Line Hydro-Jet Rig ($150/day)</option>
                      <option>High Pressure Pneumatic Ram ($120/day)</option>
                      <option>None (Manual Work Standard)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Additional Charges */}
              <div className="bg-[#F5FAFF] p-4 rounded-2xl border border-[#9EC8EF]/50 space-y-3">
                <h4 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider flex items-center gap-1.5 border-b border-[#9EC8EF]/30 pb-2">
                  <DollarSign className="w-3.5 h-3.5 text-[#315C9F]" /> Additional Charges
                </h4>
                <div className="space-y-2">
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-[#5E7393] font-black block mb-1">Permit Fees / Hazardous Disposal Surcharge</label>
                    <input
                      type="text"
                      placeholder="e.g. City Environmental Permit ($300)"
                      className="w-full text-xs bg-white border border-[#9EC8EF] rounded-xl px-3 py-2.5 font-semibold text-[#1F3557] focus:outline-none placeholder-[#5E7393]/40"
                    />
                  </div>
                </div>
              </div>

            </div>

          </div>

          {/* Right Summary Column (calculations, discounts, totals) */}
          <div className="bg-[#F5FAFF] p-5 rounded-2xl border border-[#9EC8EF] space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <h4 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider border-b border-[#9EC8EF]/40 pb-2 flex items-center gap-1.5">
                <Percent className="w-4 h-4 text-[#315C9F]" /> Quotation Ledger Totals
              </h4>

              {/* Discount / Tax / Deposit Inputs */}
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-[#5E7393] font-black block mb-1">Discount Coupon (%)</label>
                  <input
                    type="number"
                    defaultValue="0"
                    className="w-full text-xs bg-white border border-[#9EC8EF] rounded-xl px-3 py-2 font-mono font-bold text-[#1F3557] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-[#5E7393] font-black block mb-1">Sales Tax Rate (%)</label>
                  <input
                    type="number"
                    defaultValue="8.25"
                    className="w-full text-xs bg-white border border-[#9EC8EF] rounded-xl px-3 py-2 font-mono font-bold text-[#1F3557] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-[#5E7393] font-black block mb-1">Upfront Deposit Required ($)</label>
                  <input
                    type="number"
                    defaultValue="1500"
                    className="w-full text-xs bg-white border border-[#9EC8EF] rounded-xl px-3 py-2 font-mono font-bold text-[#1F3557] focus:outline-none"
                  />
                </div>
              </div>

              {/* Display breakdown */}
              <div className="border-t border-[#9EC8EF]/40 pt-3 space-y-2 text-xs font-bold text-slate-600">
                <div className="flex justify-between">
                  <span>Labor Base Subtotal:</span>
                  <span className="font-mono">$2,280.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Materials Subtotal:</span>
                  <span className="font-mono">$1,450.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Machinery Subtotal:</span>
                  <span className="font-mono">$350.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax Base (8.25%):</span>
                  <span className="font-mono">$336.60</span>
                </div>
              </div>
            </div>

            {/* GRAND TOTAL */}
            <div className="bg-[#EAF5FF] border border-[#9EC8EF] p-4 rounded-xl space-y-2 text-center">
              <span className="text-[9px] uppercase tracking-widest text-[#5E7393] font-black block">Grand Total Output</span>
              <span className="text-2xl font-mono font-black text-[#1F3557] block">$4,416.60</span>
              <span className="text-[9px] font-mono text-[#315C9F] font-bold block">Deposit: $1,500.00</span>
            </div>

            <button
              onClick={() => onOpenPlaceholder("Calculate Live Estimates Schema", "🤖")}
              className="w-full py-3 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-sans font-black rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-colors text-center"
            >
              Simulate Build Calculations
            </button>
          </div>

        </div>
      </div>

      {/* 6. QUICK ACTIONS & AI ESTIMATE ASSISTANT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* QUICK ACTIONS */}
        <div className="bg-white rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-[#EAF5FF] pb-3">
            <span className="p-1.5 bg-[#EAF5FF] rounded-lg border border-[#9EC8EF]">
              <Cpu className="w-4.5 h-4.5 text-[#315C9F]" />
            </span>
            <div>
              <h3 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider">
                Quotation Quick Action Hub
              </h3>
              <p className="text-[10px] text-[#5E7393] font-semibold">
                Generate PDFs, duplicate contract drafts, or dispatch direct alerts
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            {[
              { label: "Generate PDF", icon: "📄" },
              { label: "Duplicate Estimate", icon: "📋" },
              { label: "Convert to Job", icon: "🛠️" },
              { label: "Schedule Appointment", icon: "📅" },
              { label: "Message Customer", icon: "💬" },
              { label: "View Documents", icon: "📂" }
            ].map((btn) => (
              <button
                key={btn.label}
                onClick={() => {
                  if (btn.label === "Schedule Appointment") {
                    if (onNavigateToScreen) {
                      onNavigateToScreen("scheduling");
                    } else {
                      onOpenPlaceholder("scheduling", "📅");
                    }
                  } else {
                    onOpenPlaceholder(`${btn.label} Action`, btn.icon);
                  }
                }}
                className="p-3.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF]/60 text-[#1F3557] font-extrabold rounded-xl text-[10.5px] uppercase tracking-wide transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-1.5 shadow-2xs"
              >
                <span className="text-lg">{btn.icon}</span>
                <span>{btn.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* AI ESTIMATE ASSISTANT */}
        <div className="bg-white rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-[#EAF5FF] pb-3">
            <span className="p-1.5 bg-[#EAF5FF] rounded-lg border border-[#9EC8EF]">
              <Sparkles className="w-4.5 h-4.5 text-amber-500 animate-pulse" />
            </span>
            <div>
              <h3 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider">
                AI Estimate Assistant Nodes
              </h3>
              <p className="text-[10px] text-[#5E7393] font-semibold">
                Predict profit margins, recommend catalog items, and scan cost indices
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            {[
              { title: "Estimate Suggestions", icon: "💡", color: "bg-blue-50/50 border-blue-200" },
              { title: "Material Recommendations", icon: "📦", color: "bg-indigo-50/50 border-indigo-200" },
              { title: "Profit Margin", icon: "📈", color: "bg-emerald-50/50 border-emerald-200" },
              { title: "Labor Suggestions", icon: "⚙️", color: "bg-amber-50/50 border-amber-200" },
              { title: "Pricing Analysis", icon: "📊", color: "bg-rose-50/50 border-rose-200" }
            ].map((card) => (
              <div
                key={card.title}
                onClick={() => onOpenPlaceholder(`AI Recommendation: ${card.title}`, "🤖")}
                className={`p-3 rounded-xl border ${card.color} text-slate-800 hover:scale-[1.02] cursor-pointer transition-all flex flex-col justify-between h-20 shadow-2xs text-left group`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-base">{card.icon}</span>
                  <Sparkles className="w-3 h-3 text-amber-500 animate-pulse opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-[9px] font-black uppercase tracking-wider text-[#1F3557] leading-tight">
                  {card.title}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 7. BOTTOM SECTION - RECENT ESTIMATE ACTIVITY */}
      <div className="bg-white rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-[#EAF5FF] pb-3">
          <span className="p-1.5 bg-[#EAF5FF] rounded-lg border border-[#9EC8EF]">
            <Clock className="w-4.5 h-4.5 text-[#315C9F]" />
          </span>
          <div>
            <h3 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider">
              Recent Estimate Activity Logs
            </h3>
            <p className="text-[10px] text-[#5E7393] font-semibold">
              Live tracking log of proposal creation, email triggers, client views, and job translations
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {activities.map((act) => (
            <div
              key={act.id}
              onClick={() => onOpenPlaceholder(`Activity Details: ${act.type}`, "📋")}
              className="p-3.5 bg-[#F5FAFF] hover:bg-[#EAF5FF] border border-[#9EC8EF]/40 rounded-xl flex items-start gap-3 cursor-pointer transition-all shadow-2xs text-left"
            >
              <span className="text-lg select-none shrink-0">{act.icon}</span>
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#315C9F]">
                    {act.type}
                  </span>
                  <span className="text-[9px] font-mono font-medium text-slate-400">
                    {act.time}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-semibold leading-snug">
                  {act.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 8. FUTURE CONNECTIONS SYSTEM DIAGRAM & LEGACY MAP */}
      <div className="bg-[#EAF5FF] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-4 border-b border-[#9EC8EF]/30 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-white rounded-lg border border-[#9EC8EF] text-[#315C9F]">
              <Database className="w-4.5 h-4.5" />
            </span>
            <div>
              <h3 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider">
                Integrated Operational Schema Connectivity Index
              </h3>
              <p className="text-[10px] text-[#5E7393] font-semibold">
                Dynamic pipelines connecting quotation inputs to back-office bookkeeping and field team dispatchers
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 bg-amber-100 border border-amber-300 text-amber-800 text-[8px] font-mono font-bold rounded-lg uppercase tracking-widest">
            Pending Core Map
          </span>
        </div>

        <p className="text-slate-600 text-[11px] leading-relaxed font-sans font-semibold">
          💡 <strong>Simulated Workflow Pipeline:</strong> When an estimate is marked as <strong className="text-emerald-600 uppercase font-mono">Accepted</strong> by a residential customer, the LeadForge core engine is engineered to automatically spawn a corresponding <strong>Job</strong>, add it to the live schedule ledger, transmit dispatch alerts to the nearest crew member, and write pending receivables into your Revenue database module.
        </p>

        {/* CLICKABLE CONNECTION NODES */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 pt-1.5">
          {[
            { id: "customers", label: "Customers Module", icon: "👥" },
            { id: "leads", label: "Leads Module", icon: "🎯" },
            { id: "inventory", label: "Inventory Depot", icon: "📦" },
            { id: "scheduling", label: "Scheduling Grid", icon: "📅" },
            { id: "jobs", label: "Jobs Dispatch", icon: "🛠️" },
            { id: "documents", label: "Documents Safe", icon: "📂" },
            { id: "revenue", label: "Revenue Vault", icon: "💰" },
            { id: "ai_assistant", label: "AI Copilot Core", icon: "🤖" },
            { id: "dashboard", label: "HQ Dashboard", icon: "📊" },
            { id: "shared_events", label: "Event Logger", icon: "⚙️" }
          ].map((node) => (
            <button
              key={node.id}
              onClick={() => handleLinkNavigation(node.id, node.label, node.icon)}
              className="p-2.5 bg-white hover:bg-[#C7E3FA] border border-[#9EC8EF] text-[#1F3557] rounded-xl text-[10px] uppercase font-black tracking-wider transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <span>{node.icon}</span>
              <span>{node.label}</span>
              <ChevronRight className="w-2.5 h-2.5 text-[#315C9F]/70 ml-auto" />
            </button>
          ))}
        </div>
      </div>

      {/* Add Estimate Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-white" />
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">Create New Estimate</h3>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Client Name *</label>
                  <input 
                    type="text" 
                    value={formCustomerName}
                    onChange={e => setFormCustomerName(e.target.value)}
                    placeholder="e.g. Wayne Enterprises"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Company / Account Name</label>
                  <input 
                    type="text" 
                    value={formCompany}
                    onChange={e => setFormCompany(e.target.value)}
                    placeholder="e.g. Apex Plumb & Drain"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Quoted Amount ($) *</label>
                  <input 
                    type="number" 
                    value={formAmount || ""}
                    onChange={e => setFormAmount(Number(e.target.value))}
                    placeholder="e.g. 12500"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Initial Status</label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as any)}
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Pending">Pending</option>
                    <option value="Sent">Sent</option>
                    <option value="Viewed">Viewed</option>
                    <option value="Accepted">Accepted</option>
                    <option value="Declined">Declined</option>
                    <option value="Expired">Expired</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-[#5E7393]">Assigned Sales Representative</label>
                <input 
                  type="text" 
                  value={formSalesRep}
                  onChange={e => setFormSalesRep(e.target.value)}
                  placeholder="e.g. Marcus Vance"
                  className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-[#5E7393]">Scope of Work Notes</label>
                <textarea 
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="Enter detailed description of proposed services, pricing terms, materials, exclusions..."
                  rows={4}
                  className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557] resize-none"
                />
              </div>
            </div>

            <div className="bg-slate-50 border-t border-[#9EC8EF]/40 px-6 py-4 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!formCustomerName.trim()}
                onClick={handleAddEstimate}
                className={`px-4 py-2 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                  formCustomerName.trim() ? "bg-[#315C9F] hover:bg-[#1F3557]" : "bg-slate-300 cursor-not-allowed"
                }`}
              >
                Save Estimate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View / Edit Estimate Modal with Auto-Job Conversion */}
      {selectedEstimate && (
        <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-white" />
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">
                  {isEditMode ? "Edit Quotation Form" : `Estimate details: ${selectedEstimate.number}`}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedEstimate(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {isEditMode ? (
                // Edit fields
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Client Name *</label>
                      <input 
                        type="text" 
                        value={formCustomerName}
                        onChange={e => setFormCustomerName(e.target.value)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Company / Account Name</label>
                      <input 
                        type="text" 
                        value={formCompany}
                        onChange={e => setFormCompany(e.target.value)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Quoted Amount ($) *</label>
                      <input 
                        type="number" 
                        value={formAmount}
                        onChange={e => setFormAmount(Number(e.target.value))}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Quotation Status</label>
                      <select
                        value={formStatus}
                        onChange={e => setFormStatus(e.target.value as any)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                      >
                        <option value="Draft">Draft</option>
                        <option value="Pending">Pending</option>
                        <option value="Sent">Sent</option>
                        <option value="Viewed">Viewed</option>
                        <option value="Accepted">Accepted</option>
                        <option value="Declined">Declined</option>
                        <option value="Expired">Expired</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">Assigned Sales Representative</label>
                    <input 
                      type="text" 
                      value={formSalesRep}
                      onChange={e => setFormSalesRep(e.target.value)}
                      className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                    />
                  </div>
                </div>
              ) : (
                // Detailed view mode
                <div className="space-y-4">
                  <div className="bg-[#EAF5FF] p-4.5 rounded-2xl border border-[#9EC8EF]/60 space-y-3.5">
                    <div className="flex justify-between items-start border-b border-[#9EC8EF]/40 pb-2.5">
                      <div>
                        <h4 className="text-sm font-bold text-[#1F3557]">{selectedEstimate.customerName}</h4>
                        <p className="text-xs text-[#5E7393] font-semibold">{selectedEstimate.company || "No Company"}</p>
                      </div>
                      <span className="px-2.5 py-0.5 bg-[#315C9F] text-white font-extrabold uppercase text-[9px] rounded-lg border border-[#9EC8EF]/40">
                        {selectedEstimate.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Estimate ID</p>
                        <p className="font-mono text-[#1F3557] font-bold mt-0.5">{selectedEstimate.number}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Quoted Amount</p>
                        <p className="text-[#315C9F] font-extrabold font-mono mt-0.5 text-blue-600">
                          ${selectedEstimate.amount.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Created Date</p>
                        <p className="text-[#1F3557] font-bold mt-0.5">{selectedEstimate.createdDate}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Expiration Date</p>
                        <p className="text-[#1F3557] font-bold mt-0.5">{selectedEstimate.expirationDate}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Representative</p>
                        <p className="text-[#1F3557] font-bold mt-0.5">{selectedEstimate.salesRep}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-[#5E7393]">Scope notes / exclusions</p>
                    <p className="text-xs bg-[#EAF5FF]/40 border border-[#9EC8EF]/30 p-3 rounded-xl font-medium text-[#1F3557] min-h-[60px]">
                      {formNotes || "No scope notes compiled for this proposal. Default labor and material warranty applies."}
                    </p>
                  </div>

                  {/* Operational approve & convert workflow! */}
                  {selectedEstimate.status !== "Accepted" && selectedEstimate.status !== "Completed" && (
                    <div className="pt-3 border-t border-[#9EC8EF]/40">
                      <p className="text-[10px] uppercase font-bold text-[#5E7393] mb-2">Back-Office OS Integration</p>
                      <button
                        onClick={handleApproveEstimate}
                        className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 border border-emerald-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Approve & Convert to Scheduled Job
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-slate-50 border-t border-[#9EC8EF]/40 px-6 py-4 flex justify-between shrink-0">
              <div>
                {!isEditMode && (
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Edit Proposal
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedEstimate(null)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Close
                </button>
                {isEditMode && (
                  <button
                    type="button"
                    disabled={!formCustomerName.trim()}
                    onClick={handleSaveEdit}
                    className={`px-4 py-2 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                      formCustomerName.trim() ? "bg-[#315C9F] hover:bg-[#1F3557]" : "bg-slate-300 cursor-not-allowed"
                    }`}
                  >
                    Save Changes
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
