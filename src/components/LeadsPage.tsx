import React, { useState, useMemo } from "react";
import {
  Search,
  Plus,
  Upload,
  Download,
  Target,
  Users,
  CheckCircle,
  TrendingUp,
  Clock,
  DollarSign,
  Briefcase,
  FileText,
  Calendar,
  MessageSquare,
  UserCheck,
  Award,
  ChevronRight,
  Filter,
  Check,
  Sparkles,
  ArrowUpRight,
  PhoneCall,
  Activity,
  Globe,
  Facebook,
  Instagram,
  User,
  AlertCircle,
  Camera,
  X,
  Minus
} from "lucide-react";

export type { Lead } from "../types/domain";
import type { Lead } from "../types/domain";

interface LeadsPageProps {
  onOpenPlaceholder: (label: string, icon: string) => void;
  onTakeSnapshot?: (pageId: string, pageName: string, meta?: any) => void;
  onOpenAIAnalysis?: (pageId: string, pageName: string, customContext?: string) => void;
  onNavigateToScreen?: (screenId: string, params?: { customerId?: string; date?: string }) => void;
  leads?: Lead[];
  setLeads?: React.Dispatch<React.SetStateAction<Lead[]>>;
}

// 10 high-quality realistic LeadForge leads
export const INITIAL_LEADS: Lead[] = [];

export const LeadsPage: React.FC<LeadsPageProps> = ({
  onOpenPlaceholder,
  onTakeSnapshot,
  onOpenAIAnalysis,
  onNavigateToScreen,
  leads: propsLeads,
  setLeads,
  customers,
  setCustomers,
  estimates,
  setEstimates
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>("All");
  const [activeSourceFilter, setActiveSourceFilter] = useState<string>("All");
  const [localLeads, setLocalLeads] = useState<Lead[]>(INITIAL_LEADS);

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Form states
  const [formName, setFormName] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formPhones, setFormPhones] = useState<string[]>([""]);
  const [formEmail, setFormEmail] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formCityState, setFormCityState] = useState("");
  const [formZip, setFormZip] = useState("");
  const [formSource, setFormSource] = useState<Lead["source"]>("Manual Entry");
  const [formStatus, setFormStatus] = useState<Lead["status"]>("New");
  const [formEstimatedValue, setFormEstimatedValue] = useState<number>(0);
  const [formNotes, setFormNotes] = useState("");

  const openAddModal = () => {
    setFormName("");
    setFormCompany("");
    setFormPhones([""]);
    setFormEmail("");
    setFormAddress("");
    setFormCityState("");
    setFormZip("");
    setFormSource("Manual Entry");
    setFormStatus("New");
    setFormEstimatedValue(0);
    setFormNotes("");
    setIsAddModalOpen(true);
  };

  const handleAddLead = () => {
    if (!formName.trim()) return;
    const phoneStr = formPhones.map(p => p.trim()).filter(Boolean).join(", ") || "(555) 000-0000";
    const combinedAddress = [formAddress.trim(), formCityState.trim(), formZip.trim()].filter(Boolean).join(", ");
    
    const newLead: Lead = {
      id: "lead_" + Math.random().toString(36).substring(2, 9),
      name: formName.trim(),
      company: formCompany.trim(),
      phone: phoneStr,
      email: formEmail.trim() || `${formName.toLowerCase().replace(/\s+/g, "")}@example.com`,
      source: formSource,
      salesRep: "Self",
      status: formStatus,
      estimatedValue: Number(formEstimatedValue) || 0,
      dateAdded: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      addedDaysAgo: 0,
      address: combinedAddress,
      notes: formNotes.trim()
    };

    if (setLeads) {
      setLeads(prev => [newLead, ...prev]);
    } else {
      setLocalLeads(prev => [newLead, ...prev]);
    }
    setIsAddModalOpen(false);
  };

  const openViewModal = (ld: Lead) => {
    setSelectedLead(ld);
    setFormName(ld.name);
    setFormCompany(ld.company || "");
    
    // Parse phone list
    const phones = (ld.phone || "").split(",").map(p => p.trim()).filter(Boolean);
    setFormPhones(phones.length > 0 ? phones : [""]);
    
    setFormEmail(ld.email);
    
    // Parse address
    const parts = (ld.address || "").split(",").map(s => s.trim());
    const street = parts[0] || "";
    let cityState = "";
    let zip = "";
    if (parts.length >= 3) {
      cityState = parts[1];
      zip = parts[2];
    } else if (parts.length === 2) {
      const lastPart = parts[1];
      const zipMatch = lastPart.match(/\d{5}(-\d{4})?$/);
      if (zipMatch) {
        zip = zipMatch[0];
        cityState = lastPart.replace(zip, "").trim();
      } else {
        cityState = lastPart;
      }
    }
    setFormAddress(street);
    setFormCityState(cityState);
    setFormZip(zip);
    
    setFormSource(ld.source);
    setFormStatus(ld.status);
    setFormEstimatedValue(ld.estimatedValue);
    setFormNotes(ld.notes || "");
    setIsEditMode(false);
  };

  const handleSaveEdit = () => {
    if (!selectedLead) return;
    const phoneStr = formPhones.map(p => p.trim()).filter(Boolean).join(", ");
    const combinedAddress = [formAddress.trim(), formCityState.trim(), formZip.trim()].filter(Boolean).join(", ");
    
    const updated = {
      ...selectedLead,
      name: formName.trim(),
      company: formCompany.trim(),
      phone: phoneStr,
      email: formEmail.trim(),
      address: combinedAddress,
      source: formSource,
      status: formStatus,
      estimatedValue: Number(formEstimatedValue) || 0,
      notes: formNotes.trim()
    };

    if (setLeads) {
      setLeads(prev => prev.map(l => l.id === selectedLead.id ? updated : l));
    } else {
      setLocalLeads(prev => prev.map(l => l.id === selectedLead.id ? updated : l));
    }
    setSelectedLead(updated);
    setIsEditMode(false);
  };

  const handleConvertLead = () => {
    if (!selectedLead) return;
    
    // Create new customer
    const newCust = {
      id: "cust_" + Math.random().toString(36).substring(2, 9),
      company: selectedLead.company || selectedLead.name + " Inc",
      contact: selectedLead.name,
      phone: selectedLead.phone,
      email: selectedLead.email,
      address: selectedLead.address || "100 Operational Way",
      openJobs: 0,
      outstandingBalance: 0,
      lifetimeValue: selectedLead.estimatedValue || 0,
      status: "Active" as const,
      type: "Residential" as const,
      isVIP: false,
      recentlyAdded: true
    };

    if (setCustomers) {
      setCustomers(prev => [newCust, ...prev]);
    }

    // Set lead status to Won
    const updatedLead = { ...selectedLead, status: "Won" as const };
    if (setLeads) {
      setLeads(prev => prev.map(l => l.id === selectedLead.id ? updatedLead : l));
    } else {
      setLocalLeads(prev => prev.map(l => l.id === selectedLead.id ? updatedLead : l));
    }

    setSelectedLead(null);
  };

  const handleCreateEstimate = () => {
    if (!selectedLead) return;

    const newEst = {
      id: "est_" + Math.random().toString(36).substring(2, 9),
      number: "E-" + (1000 + Math.floor(Math.random() * 9000)),
      company: selectedLead.company || selectedLead.name + " Inc",
      customerName: selectedLead.name,
      email: selectedLead.email,
      phone: selectedLead.phone,
      amount: selectedLead.estimatedValue || 1500,
      status: "Draft" as const,
      createdDate: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      notes: selectedLead.notes || "Estimate generated from sales lead."
    };

    if (setEstimates) {
      setEstimates(prev => [newEst, ...prev]);
    }

    // Update lead status to Estimate Sent
    const updatedLead = { ...selectedLead, status: "Estimate Sent" as const };
    if (setLeads) {
      setLeads(prev => prev.map(l => l.id === selectedLead.id ? updatedLead : l));
    } else {
      setLocalLeads(prev => prev.map(l => l.id === selectedLead.id ? updatedLead : l));
    }

    setSelectedLead(null);
  };

  const leads = propsLeads || localLeads;

  // Filtered and searched leads list
  const filteredLeads = useMemo(() => {
    return leads.filter((ld) => {
      // Search logic (Name, Company, Phone, Email, Address placeholder, Lead Source)
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q === "" ||
        ld.name.toLowerCase().includes(q) ||
        ld.company.toLowerCase().includes(q) ||
        ld.phone.toLowerCase().includes(q) ||
        ld.email.toLowerCase().includes(q) ||
        ld.source.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      // Status Filter logic
      const matchesStatus =
        activeStatusFilter === "All" || ld.status === activeStatusFilter;

      // Source Filter logic
      const matchesSource =
        activeSourceFilter === "All" || ld.source === activeSourceFilter;

      return matchesStatus && matchesSource;
    });
  }, [leads, searchQuery, activeStatusFilter, activeSourceFilter]);

  // Metrics calculations
  const metrics = useMemo(() => {
    const total = leads.length;
    const newToday = leads.filter((l) => l.addedDaysAgo === 0).length;
    const qualified = leads.filter((l) => l.status === "Qualified").length;
    const wonLeads = leads.filter((l) => l.status === "Won").length;
    const lostLeads = leads.filter((l) => l.status === "Lost").length;
    const totalConversions = wonLeads;
    const closedLeads = wonLeads + lostLeads;
    const conversionRate = closedLeads > 0 ? (totalConversions / closedLeads) * 100 : 75;

    return { total, newToday, qualified, conversionRate };
  }, [leads]);

  // Stage pipeline values
  const pipelineStages = useMemo(() => {
    const stages = [
      { key: "New", label: "New", count: leads.filter((l) => l.status === "New").length, color: "bg-blue-100 border-blue-200" },
      { key: "Contacted", label: "Contacted", count: leads.filter((l) => l.status === "Contacted").length, color: "bg-indigo-100 border-indigo-200" },
      { key: "Qualified", label: "Qualified", count: leads.filter((l) => l.status === "Qualified").length, color: "bg-emerald-100 border-emerald-200" },
      { key: "Estimate Sent", label: "Estimate Sent", count: leads.filter((l) => l.status === "Estimate Sent").length, color: "bg-amber-100 border-amber-200" },
      { key: "Won", label: "Won", count: leads.filter((l) => l.status === "Won").length, color: "bg-teal-100 border-teal-200" },
      { key: "Lost", label: "Lost", count: leads.filter((l) => l.status === "Lost").length, color: "bg-rose-100 border-rose-200" }
    ];
    return stages;
  }, [leads]);

  // Activity feed mock items
  const activities = [
    { id: "act_1", type: "Lead Created", desc: "New Lead 'John Connor' created via Website", time: "1 hour ago", icon: "✨" },
    { id: "act_2", type: "Call Logged", desc: "Call logged with Bruce Wayne (Qualified) by Theresa W.", time: "3 hours ago", icon: "📞" },
    { id: "act_3", type: "Estimate Sent", desc: "Estimate #E-2090 sent to Diana Prince ($8,900.00 value)", time: "Yesterday", icon: "📝" },
    { id: "act_4", type: "Appointment Scheduled", desc: "On-site diagnostic scheduled for Clark Kent", time: "2 days ago", icon: "📅" },
    { id: "act_5", type: "Lead Converted", desc: "Lead 'Tony Stark' converted to Won Account! ($50,000.00 value)", time: "3 days ago", icon: "🏆" },
    { id: "act_6", type: "Lost Lead", desc: "Lead 'Arthur Curry' marked as Lost (Price objection)", time: "5 days ago", icon: "⚠️" }
  ];

  return (
    <div className="space-y-6 animate-fade-in text-left">
      
      {/* 1. TOP CARD */}
      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-display font-extrabold text-[#1F3557] tracking-tight uppercase">
              Lead Management
            </h2>
            <p className="text-xs text-[#5E7393] font-sans font-semibold mt-1">
              Sales automation pipeline, incoming opportunities, and acquisition logs
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white border border-[#9EC8EF] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Lead
            </button>
            <button
              onClick={() => onOpenPlaceholder("Import Leads Center", "📥")}
              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Leads
            </button>
            <button
              onClick={() => onOpenPlaceholder("Export Leads Wizard", "📤")}
              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export Leads
            </button>
            {onTakeSnapshot && (
              <button
                onClick={() => onTakeSnapshot("leads", "Leads", {
                  recordCount: filteredLeads.length,
                  filters: `Status: ${activeStatusFilter} | Source: ${activeSourceFilter}`,
                  details: `Total listed leads: ${leads.length}. New today: ${metrics.newToday}. High value lead estimated value: $${Math.max(...leads.map(l => l.estimatedValue)).toLocaleString()}.`
                })}
                className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
                title="Take Page Snapshot"
              >
                <Camera className="w-3.5 h-3.5 text-[#315C9F]" />
                Snapshot
              </button>
            )}
            {onOpenAIAnalysis && (
              <button
                onClick={() => onOpenAIAnalysis("leads", "Leads")}
                className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
                title="AI Option"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                AI Option
              </button>
            )}
          </div>
        </div>

        {/* Search input and "Search by" indicator */}
        <div className="bg-[#EAF5FF] p-4.5 rounded-2xl border border-[#9EC8EF] space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5E7393]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search leads..."
              className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-[#4A86F7] font-medium font-sans text-[#1F3557]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-sans font-bold text-[#5E7393]">
            <span>Search by:</span>
            <span className="flex items-center gap-1 px-2 py-0.5 bg-[#C7E3FA] text-[#1F3557] rounded-lg border border-[#9EC8EF]/40">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1F3557]" /> Name
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 bg-[#C7E3FA] text-[#1F3557] rounded-lg border border-[#9EC8EF]/40">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1F3557]" /> Company
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 bg-[#C7E3FA] text-[#1F3557] rounded-lg border border-[#9EC8EF]/40">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1F3557]" /> Phone
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 bg-[#C7E3FA] text-[#1F3557] rounded-lg border border-[#9EC8EF]/40">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1F3557]" /> Email
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 bg-[#C7E3FA] text-[#1F3557] rounded-lg border border-[#9EC8EF]/40">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1F3557]" /> Address
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 bg-[#C7E3FA] text-[#1F3557] rounded-lg border border-[#9EC8EF]/40">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1F3557]" /> Lead Source
            </span>
          </div>
        </div>
      </div>

      {/* 2. SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1 */}
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] text-[#1F3557] border border-[#9EC8EF] flex items-center justify-center">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393]">
              Total Leads
            </p>
            <p className="text-lg font-display font-bold text-[#1F3557] mt-0.5">
              {metrics.total}
            </p>
          </div>
        </div>

        {/* CARD 2 */}
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] text-[#1F3557] border border-[#9EC8EF] flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393]">
              New Leads Today
            </p>
            <p className="text-lg font-display font-bold text-[#1F3557] mt-0.5">
              {metrics.newToday}
            </p>
          </div>
        </div>

        {/* CARD 3 */}
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] text-indigo-600 border border-[#9EC8EF] flex items-center justify-center">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393]">
              Qualified Leads
            </p>
            <p className="text-lg font-display font-bold text-[#1F3557] mt-0.5">
              {metrics.qualified}
            </p>
          </div>
        </div>

        {/* CARD 4 */}
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] text-amber-600 border border-[#9EC8EF] flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393]">
              Conversion Rate
            </p>
            <p className="text-lg font-display font-bold text-[#1F3557] mt-0.5">
              {metrics.conversionRate.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* 3. VISUAL SALES PIPELINE STAGES */}
      <div className="bg-[#C7E3FA] rounded-2xl p-5 border border-[#9EC8EF] shadow-sm space-y-4">
        <div>
          <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider">
            Sales Pipeline Breakdown
          </h3>
          <p className="text-[10.5px] text-[#5E7393] font-sans font-semibold mt-0.5">
            Interactive metrics. Click any funnel phase below to apply an instant table filter.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {pipelineStages.map((stage) => {
            const isFiltering = activeStatusFilter === stage.key;
            return (
              <div
                key={stage.key}
                onClick={() => setActiveStatusFilter(isFiltering ? "All" : stage.key)}
                className={`p-3 rounded-xl border transition-all cursor-pointer select-none flex flex-col justify-between h-20 ${
                  isFiltering
                    ? "bg-[#EAF5FF] border-[#4A86F7] shadow-sm ring-1 ring-[#4A86F7]"
                    : "bg-[#EAF5FF]/60 hover:bg-[#EAF5FF] border-[#9EC8EF]/50"
                }`}
              >
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393] truncate">
                  {stage.label}
                </span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-xl font-display font-bold text-[#1F3557]">{stage.count}</span>
                  <span className="text-[9px] text-[#5E7393] font-mono font-bold">Leads</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grid containing FILTERS + TABLE */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* FILTERS PANEL */}
        <div className="space-y-4 lg:col-span-1">
          {/* STATUS FILTERS CARD */}
          <div className="bg-[#C7E3FA] rounded-2xl p-4.5 border border-[#9EC8EF] shadow-sm">
            <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider mb-3 flex items-center gap-1.5 border-b border-[#9EC8EF]/40 pb-2">
              <Filter className="w-3.5 h-3.5 text-[#1F3557]" />
              Status Filter
            </h3>
            
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => setActiveStatusFilter("All")}
                className={`px-3 py-2 rounded-xl border font-bold text-xs uppercase tracking-wider text-left transition-all cursor-pointer flex items-center justify-between ${
                  activeStatusFilter === "All"
                    ? "bg-[#EAF5FF] border-[#9EC8EF] text-[#1F3557]"
                    : "bg-transparent border-transparent text-[#5E7393] hover:bg-[#EAF5FF]/40 hover:text-[#1F3557]"
                }`}
              >
                <span>Show All</span>
                {activeStatusFilter === "All" && <Check className="w-3.5 h-3.5 text-[#1F3557]" />}
              </button>
              {(
                [
                  "New",
                  "Contacted",
                  "Qualified",
                  "Estimate Sent",
                  "Follow-Up Needed",
                  "Won",
                  "Lost",
                  "Archived"
                ] as const
              ).map((status) => {
                const isActive = activeStatusFilter === status;
                return (
                  <button
                    key={status}
                    onClick={() => setActiveStatusFilter(status)}
                    className={`px-3 py-2 rounded-xl border font-bold text-xs uppercase tracking-wider text-left transition-all cursor-pointer flex items-center justify-between ${
                      isActive
                        ? "bg-[#EAF5FF] border-[#9EC8EF] text-[#1F3557]"
                        : "bg-transparent border-transparent text-[#5E7393] hover:bg-[#EAF5FF]/40 hover:text-[#1F3557]"
                    }`}
                  >
                    <span>{status}</span>
                    {isActive && <Check className="w-3.5 h-3.5 text-[#1F3557]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* LEAD SOURCES FILTERS CARD */}
          <div className="bg-[#C7E3FA] rounded-2xl p-4.5 border border-[#9EC8EF] shadow-sm">
            <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider mb-3 flex items-center gap-1.5 border-b border-[#9EC8EF]/40 pb-2">
              <Globe className="w-3.5 h-3.5 text-[#1F3557]" />
              Lead Sources
            </h3>
            
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => setActiveSourceFilter("All")}
                className={`px-3 py-2 rounded-xl border font-bold text-xs uppercase tracking-wider text-left transition-all cursor-pointer flex items-center justify-between ${
                  activeSourceFilter === "All"
                    ? "bg-[#EAF5FF] border-[#9EC8EF] text-[#1F3557]"
                    : "bg-transparent border-transparent text-[#5E7393] hover:bg-[#EAF5FF]/40 hover:text-[#1F3557]"
                }`}
              >
                <span>All Sources</span>
                {activeSourceFilter === "All" && <Check className="w-3.5 h-3.5 text-[#1F3557]" />}
              </button>
              {(
                [
                  "Google Business Profile",
                  "Website",
                  "Facebook",
                  "Instagram",
                  "Referral",
                  "Phone Call",
                  "Walk-In",
                  "Manual Entry",
                  "Other"
                ] as const
              ).map((src) => {
                const isActive = activeSourceFilter === src;
                return (
                  <button
                    key={src}
                    onClick={() => setActiveSourceFilter(src)}
                    className={`px-3 py-1.5 rounded-xl border font-bold text-[10.5px] uppercase tracking-wider text-left transition-all cursor-pointer flex items-center justify-between ${
                      isActive
                        ? "bg-[#EAF5FF] border-[#9EC8EF] text-[#1F3557]"
                        : "bg-transparent border-transparent text-[#5E7393] hover:bg-[#EAF5FF]/40 hover:text-[#1F3557]"
                    }`}
                  >
                    <span>{src}</span>
                    {isActive && <Check className="w-3.5 h-3.5 text-[#1F3557]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* QUICK ACTIONS CARD */}
          <div className="bg-[#C7E3FA] rounded-2xl p-4.5 border border-[#9EC8EF] shadow-sm">
            <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider mb-3 flex items-center gap-1.5 border-b border-[#9EC8EF]/40 pb-2">
              <Activity className="w-3.5 h-3.5 text-[#1F3557]" />
              Quick Actions
            </h3>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => onOpenPlaceholder("Convert Lead to Customer Profile", "👤")}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <UserCheck className="w-3.5 h-3.5 text-[#1F3557]" />
                Create Customer
              </button>
              <button
                onClick={() => onOpenPlaceholder("Lead Estimate Creation Builder", "📝")}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <FileText className="w-3.5 h-3.5 text-[#1F3557]" />
                Create Estimate
              </button>
              <button
                onClick={() => {
                  if (onNavigateToScreen) {
                    onNavigateToScreen("scheduling");
                  } else {
                    onOpenPlaceholder("Lead Dispatch Calendar", "📅");
                  }
                }}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <Calendar className="w-3.5 h-3.5 text-[#1F3557]" />
                Schedule Appointment
              </button>
              <button
                onClick={() => onOpenPlaceholder("Lead SMS & Email Board", "💬")}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <MessageSquare className="w-3.5 h-3.5 text-[#1F3557]" />
                Send Message
              </button>
              <button
                onClick={() => onOpenPlaceholder("Lead Follow-Up Automator", "⏰")}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <Clock className="w-3.5 h-3.5 text-[#1F3557]" />
                Create Follow-Up
              </button>
            </div>
          </div>
        </div>

        {/* LEADS TABLE */}
        <div className="lg:col-span-3 bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex flex-col justify-between overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-[#9EC8EF] text-[10px] font-extrabold uppercase text-[#1F3557] tracking-wider bg-[#EAF5FF]/30">
                  <th className="py-3 px-4">Lead Name</th>
                  <th className="py-3 px-4">Company</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Lead Source</th>
                  <th className="py-3 px-4">Sales Rep</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Est. Value</th>
                  <th className="py-3 px-4 text-center">Date Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#9EC8EF]/40">
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-[#5E7393] text-xs font-semibold">
                      No matching leads found. Try relaxing your search query or filters.
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((ld) => (
                    <tr
                      key={ld.id}
                      onClick={() => openViewModal(ld)}
                      className="hover:bg-[#BDDDF8]/70 transition-colors cursor-pointer text-xs"
                    >
                      <td className="py-3 px-4 font-bold text-[#1F3557]">{ld.name}</td>
                      <td className="py-3 px-4 text-[#5E7393] font-semibold">{ld.company || "—"}</td>
                      <td className="py-3 px-4 font-mono text-[#5E7393]">{ld.phone}</td>
                      <td className="py-3 px-4 text-[#5E7393] truncate max-w-[120px]">{ld.email}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 bg-[#EAF5FF] text-[#1F3557] font-sans font-bold text-[10px] rounded-lg border border-[#9EC8EF]/40">
                          {ld.source}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[#5E7393] font-medium">{ld.salesRep}</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                            ld.status === "New"
                              ? "bg-blue-100 text-blue-800 border border-blue-200"
                              : ld.status === "Won"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              : ld.status === "Lost"
                              ? "bg-rose-100 text-rose-800 border border-rose-200"
                              : ld.status === "Estimate Sent"
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : ld.status === "Follow-Up Needed"
                              ? "bg-orange-100 text-orange-800 border border-orange-200"
                              : "bg-indigo-100 text-indigo-800 border border-indigo-200"
                          }`}
                        >
                          {ld.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold font-mono text-[#1F3557]">
                        ${ld.estimatedValue.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-[#5E7393]">{ld.dateAdded}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Footer of table */}
          <div className="mt-4 pt-3 border-t border-[#9EC8EF]/40 flex justify-between items-center text-[10.5px] font-sans font-bold text-[#5E7393]">
            <span>
              Showing {filteredLeads.length} of {leads.length} opportunities loaded
            </span>
            <span className="px-2 py-0.5 bg-[#EAF5FF] border border-[#9EC8EF]/60 rounded-lg text-[#1F3557]">
              Pipeline Connected
            </span>
          </div>
        </div>
        
      </div>

      {/* 4. AI INSIGHTS SECTION */}
      <div className="space-y-3.5">
        <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          Lead Insights & Performance Analytics
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          
          {/* INSIGHT 1: New Leads This Week */}
          <div
            onClick={() => onOpenPlaceholder("Leads Performance Center", "📊")}
            className="bg-[#C7E3FA] hover:bg-[#BDDDF8] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm cursor-pointer transition-all flex flex-col justify-between h-40 text-left"
          >
            <div>
              <div className="flex justify-between items-start">
                <span className="text-[9.5px] bg-[#EAF5FF] border border-[#9EC8EF] text-[#1F3557] px-2 py-0.5 rounded font-black uppercase tracking-wider">
                  New Opportunities
                </span>
                <Clock className="w-4 h-4 text-[#1F3557]" />
              </div>
              <p className="text-xs font-extrabold text-[#1F3557] mt-3">Incoming This Week</p>
              <p className="text-[11px] text-[#5E7393] font-medium mt-1 leading-normal">
                4 high-priority inquiries logged via Website and Phone.
              </p>
            </div>
            <p className="text-[10px] font-bold text-[#1F3557] hover:underline inline-flex items-center gap-1 mt-2">
              Inspect roster <ArrowUpRight className="w-3 h-3" />
            </p>
          </div>

          {/* INSIGHT 2: Highest Value Leads */}
          <div
            onClick={() => onOpenPlaceholder("High Value Lead Analysis", "💎")}
            className="bg-[#C7E3FA] hover:bg-[#BDDDF8] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm cursor-pointer transition-all flex flex-col justify-between h-40 text-left"
          >
            <div>
              <div className="flex justify-between items-start">
                <span className="text-[9.5px] bg-[#EAF5FF] border border-[#9EC8EF] text-[#1F3557] px-2 py-0.5 rounded font-black uppercase tracking-wider">
                  Highest Value
                </span>
                <DollarSign className="w-4 h-4 text-[#1F3557]" />
              </div>
              <p className="text-xs font-extrabold text-[#1F3557] mt-3">Top Value Pipeline</p>
              <p className="text-[11px] text-[#5E7393] font-medium mt-1 leading-normal">
                Bruce Wayne (Wayne Enterprises) valued at $35,000.
              </p>
            </div>
            <p className="text-[10px] font-bold text-[#1F3557] hover:underline inline-flex items-center gap-1 mt-2">
              Review lead <ArrowUpRight className="w-3 h-3" />
            </p>
          </div>

          {/* INSIGHT 3: Oldest Uncontacted */}
          <div
            onClick={() => onOpenPlaceholder("Stale Leads Review Hub", "⚠️")}
            className="bg-[#C7E3FA] hover:bg-[#BDDDF8] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm cursor-pointer transition-all flex flex-col justify-between h-40 text-left"
          >
            <div>
              <div className="flex justify-between items-start">
                <span className="text-[9.5px] bg-[#EAF5FF] border border-rose-300 text-rose-600 px-2 py-0.5 rounded font-black uppercase tracking-wider">
                  Attention Required
                </span>
                <AlertCircle className="w-4 h-4 text-rose-600" />
              </div>
              <p className="text-xs font-extrabold text-[#1F3557] mt-3">Oldest Uncontacted</p>
              <p className="text-[11px] text-[#5E7393] font-medium mt-1 leading-normal">
                Wanda Maximoff - Pending touchpoint for 48 hours.
              </p>
            </div>
            <p className="text-[10px] font-bold text-rose-600 hover:underline inline-flex items-center gap-1 mt-2">
              Call account <ArrowUpRight className="w-3 h-3" />
            </p>
          </div>

          {/* INSIGHT 4: Conversion Rate */}
          <div
            onClick={() => onOpenPlaceholder("Conversion Performance Board", "📈")}
            className="bg-[#C7E3FA] hover:bg-[#BDDDF8] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm cursor-pointer transition-all flex flex-col justify-between h-40 text-left"
          >
            <div>
              <div className="flex justify-between items-start">
                <span className="text-[9.5px] bg-[#EAF5FF] border border-[#9EC8EF] text-[#1F3557] px-2 py-0.5 rounded font-black uppercase tracking-wider">
                  Acquisition
                </span>
                <TrendingUp className="w-4 h-4 text-[#1F3557]" />
              </div>
              <p className="text-xs font-extrabold text-[#1F3557] mt-3">LTM Conversion</p>
              <p className="text-[11px] text-[#5E7393] font-medium mt-1 leading-normal">
                Monthly average stable at 78.2% overall win probability.
              </p>
            </div>
            <p className="text-[10px] font-bold text-[#1F3557] hover:underline inline-flex items-center gap-1 mt-2">
              View charts <ArrowUpRight className="w-3 h-3" />
            </p>
          </div>

          {/* INSIGHT 5: Average Response Time */}
          <div
            onClick={() => onOpenPlaceholder("Response Time Auditing", "⚡")}
            className="bg-[#C7E3FA] hover:bg-[#BDDDF8] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm cursor-pointer transition-all flex flex-col justify-between h-40 text-left"
          >
            <div>
              <div className="flex justify-between items-start">
                <span className="text-[9.5px] bg-[#EAF5FF] border border-[#9EC8EF] text-[#1F3557] px-2 py-0.5 rounded font-black uppercase tracking-wider">
                  Response SLA
                </span>
                <Clock className="w-4 h-4 text-[#1F3557]" />
              </div>
              <p className="text-xs font-extrabold text-[#1F3557] mt-3">Avg Response Time</p>
              <p className="text-[11px] text-[#5E7393] font-medium mt-1 leading-normal">
                Currently holding at 8.4 minutes from intake to SMS.
              </p>
            </div>
            <p className="text-[10px] font-bold text-[#1F3557] hover:underline inline-flex items-center gap-1 mt-2">
              Check SLA report <ArrowUpRight className="w-3 h-3" />
            </p>
          </div>

        </div>
      </div>

      {/* 5. LEAD ACTIVITY FEED */}
      <div className="space-y-3">
        <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider">
          Lead Activity Feed
        </h3>
        
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm divide-y divide-[#9EC8EF]/40">
          {activities.map((act) => (
            <div
              key={act.id}
              onClick={() => onOpenPlaceholder(act.type + " Operation Details", act.icon)}
              className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4 cursor-pointer hover:bg-[#BDDDF8]/40 px-2 rounded-xl transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-base select-none">{act.icon}</span>
                <div>
                  <p className="text-xs font-bold text-[#1F3557]">{act.desc}</p>
                  <p className="text-[10px] text-[#5E7393] font-medium mt-0.5">
                    Category: {act.type}
                  </p>
                </div>
              </div>
              <span className="text-[10.5px] font-mono text-[#5E7393]">{act.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add Lead Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-white" />
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">Add New Sales Lead</h3>
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
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Contact Person *</label>
                  <input 
                    type="text" 
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="e.g. John Connor"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Company Name</label>
                  <input 
                    type="text" 
                    value={formCompany}
                    onChange={e => setFormCompany(e.target.value)}
                    placeholder="e.g. Connor Resistance Gear"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>
              </div>

              {/* Phone Numbers with Plus / Minus */}
              <div className="space-y-1.5 bg-[#F5FAFF] p-3 rounded-2xl border border-blue-100/50">
                <label className="text-[10px] uppercase font-bold text-[#5E7393] flex items-center justify-between">
                  <span>Phone Numbers *</span>
                  <button 
                    type="button" 
                    onClick={() => setFormPhones(prev => [...prev, ""])}
                    className="text-[#4A86F7] hover:text-[#1E52C9] font-extrabold text-[11px] flex items-center gap-1 bg-[#EAF5FF] px-2.5 py-1 rounded-lg border border-[#9EC8EF]/50 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Phone
                  </button>
                </label>
                <div className="space-y-2">
                  {formPhones.map((phone, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input 
                        type="text" 
                        value={phone}
                        onChange={e => {
                          const updated = [...formPhones];
                          updated[index] = e.target.value;
                          setFormPhones(updated);
                        }}
                        placeholder="e.g. (555) 111-2222"
                        className="flex-1 text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                      {formPhones.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setFormPhones(prev => prev.filter((_, i) => i !== index))}
                          className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-xl p-2.5 shrink-0 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-[#5E7393]">Email Address</label>
                <input 
                  type="email" 
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  placeholder="e.g. john@resistance.com"
                  className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                />
              </div>

              <div className="bg-[#F5FAFF] p-3 rounded-2xl border border-blue-100/50 space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Street Address</label>
                  <input 
                    type="text" 
                    value={formAddress}
                    onChange={e => setFormAddress(e.target.value)}
                    placeholder="e.g. 742 Evergreen Terrace"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">City, State</label>
                    <input 
                      type="text" 
                      value={formCityState}
                      onChange={e => setFormCityState(e.target.value)}
                      placeholder="e.g. Springfield, OR"
                      className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">Zip Code</label>
                    <input 
                      type="text" 
                      value={formZip}
                      onChange={e => setFormZip(e.target.value)}
                      placeholder="e.g. 97477"
                      className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Lead Source</label>
                  <select
                    value={formSource}
                    onChange={e => setFormSource(e.target.value as any)}
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                  >
                    <option value="Google Business Profile">Google Business Profile</option>
                    <option value="Website">Website</option>
                    <option value="Facebook">Facebook</option>
                    <option value="Instagram">Instagram</option>
                    <option value="Referral">Referral</option>
                    <option value="Phone Call">Phone Call</option>
                    <option value="Walk-In">Walk-In</option>
                    <option value="Manual Entry">Manual Entry</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Initial Status</label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as any)}
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                  >
                    <option value="New">New</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Qualified">Qualified</option>
                    <option value="Estimate Sent">Estimate Sent</option>
                    <option value="Follow-Up Needed">Follow-Up Needed</option>
                    <option value="Won">Won</option>
                    <option value="Lost">Lost</option>
                    <option value="Archived">Archived</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Estimated Deal Value ($)</label>
                  <input 
                    type="number" 
                    value={formEstimatedValue || ""}
                    onChange={e => setFormEstimatedValue(Number(e.target.value))}
                    placeholder="e.g. 4500"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-[#5E7393]">Sales Notes / Requirements</label>
                <textarea 
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="Enter initial lead specifications, service needed, budget details..."
                  rows={3}
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
                disabled={!formName.trim()}
                onClick={handleAddLead}
                className={`px-4 py-2 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                  formName.trim() ? "bg-[#315C9F] hover:bg-[#1F3557]" : "bg-slate-300 cursor-not-allowed"
                }`}
              >
                Save Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lead Details & Operations Modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-white" />
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">
                  {isEditMode ? "Edit Sales Lead" : "Sales Lead Details"}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedLead(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {isEditMode ? (
                // Edit Form fields
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Contact Person *</label>
                      <input 
                        type="text" 
                        value={formName}
                        onChange={e => setFormName(e.target.value)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Company Name</label>
                      <input 
                        type="text" 
                        value={formCompany}
                        onChange={e => setFormCompany(e.target.value)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>
                  </div>

                  {/* Phone Numbers with Plus / Minus */}
                  <div className="space-y-1.5 bg-[#F5FAFF] p-3 rounded-2xl border border-blue-100/50">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393] flex items-center justify-between">
                      <span>Phone Numbers *</span>
                      <button 
                        type="button" 
                        onClick={() => setFormPhones(prev => [...prev, ""])}
                        className="text-[#4A86F7] hover:text-[#1E52C9] font-extrabold text-[11px] flex items-center gap-1 bg-[#EAF5FF] px-2.5 py-1 rounded-lg border border-[#9EC8EF]/50 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Add Phone
                      </button>
                    </label>
                    <div className="space-y-2">
                      {formPhones.map((phone, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input 
                            type="text" 
                            value={phone}
                            onChange={e => {
                              const updated = [...formPhones];
                              updated[index] = e.target.value;
                              setFormPhones(updated);
                            }}
                            placeholder="e.g. (555) 111-2222"
                            className="flex-1 text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                          />
                          {formPhones.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setFormPhones(prev => prev.filter((_, i) => i !== index))}
                              className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-xl p-2.5 shrink-0 cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">Email Address</label>
                    <input 
                      type="email" 
                      value={formEmail}
                      onChange={e => setFormEmail(e.target.value)}
                      className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                    />
                  </div>

                  <div className="bg-[#F5FAFF] p-3 rounded-2xl border border-blue-100/50 space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Street Address</label>
                      <input 
                        type="text" 
                        value={formAddress}
                        onChange={e => setFormAddress(e.target.value)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-[#5E7393]">City, State</label>
                        <input 
                          type="text" 
                          value={formCityState}
                          onChange={e => setFormCityState(e.target.value)}
                          placeholder="e.g. Springfield, OR"
                          className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-[#5E7393]">Zip Code</label>
                        <input 
                          type="text" 
                          value={formZip}
                          onChange={e => setFormZip(e.target.value)}
                          placeholder="e.g. 97477"
                          className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Lead Source</label>
                      <select
                        value={formSource}
                        onChange={e => setFormSource(e.target.value as any)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                      >
                        <option value="Google Business Profile">Google Business Profile</option>
                        <option value="Website">Website</option>
                        <option value="Facebook">Facebook</option>
                        <option value="Instagram">Instagram</option>
                        <option value="Referral">Referral</option>
                        <option value="Phone Call">Phone Call</option>
                        <option value="Walk-In">Walk-In</option>
                        <option value="Manual Entry">Manual Entry</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Lead Status</label>
                      <select
                        value={formStatus}
                        onChange={e => setFormStatus(e.target.value as any)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                      >
                        <option value="New">New</option>
                        <option value="Contacted">Contacted</option>
                        <option value="Qualified">Qualified</option>
                        <option value="Estimate Sent">Estimate Sent</option>
                        <option value="Follow-Up Needed">Follow-Up Needed</option>
                        <option value="Won">Won</option>
                        <option value="Lost">Lost</option>
                        <option value="Archived">Archived</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Estimated Deal Value ($)</label>
                      <input 
                        type="number" 
                        value={formEstimatedValue || ""}
                        onChange={e => setFormEstimatedValue(Number(e.target.value))}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">Sales Notes / Requirements</label>
                    <textarea 
                      value={formNotes}
                      onChange={e => setFormNotes(e.target.value)}
                      rows={3}
                      className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557] resize-none"
                    />
                  </div>
                </div>
              ) : (
                // View Details mode with operational integrations
                <div className="space-y-4">
                  <div className="bg-[#EAF5FF] p-4.5 rounded-2xl border border-[#9EC8EF]/60 space-y-3.5">
                    <div className="flex justify-between items-start border-b border-[#9EC8EF]/40 pb-2.5">
                      <div>
                        <h4 className="text-sm font-bold text-[#1F3557]">{selectedLead.name}</h4>
                        <p className="text-xs text-[#5E7393] font-semibold">{selectedLead.company || "No Company"}</p>
                      </div>
                      <span className="px-2.5 py-0.5 bg-[#315C9F] text-white font-extrabold uppercase text-[9px] rounded-lg border border-[#9EC8EF]/40">
                        {selectedLead.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Phone</p>
                        <p className="font-mono text-[#1F3557] font-bold mt-0.5">{selectedLead.phone}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Email</p>
                        <p className="text-[#1F3557] font-bold mt-0.5">{selectedLead.email}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Street Address</p>
                        <p className="text-[#1F3557] font-bold mt-0.5">{selectedLead.address || "No address provided."}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Source</p>
                        <p className="text-[#1F3557] font-bold mt-0.5">{selectedLead.source}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-[#5E7393]">Value</p>
                        <p className="text-[#1F3557] font-extrabold font-mono mt-0.5 text-blue-600">
                          ${selectedLead.estimatedValue.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-[#5E7393]">Lead Notes</p>
                    <p className="text-xs bg-[#EAF5FF]/40 border border-[#9EC8EF]/30 p-3 rounded-xl font-medium text-[#1F3557] min-h-[60px]">
                      {selectedLead.notes || "No notes available for this sales lead."}
                    </p>
                  </div>

                  {/* Core Operations Engine Actions */}
                  <div className="pt-3 border-t border-[#9EC8EF]/40">
                    <p className="text-[10px] uppercase font-bold text-[#5E7393] mb-2.5">CRM System Operations</p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        onClick={handleConvertLead}
                        className="px-4 py-2.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] hover:text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <UserCheck className="w-4 h-4 text-emerald-600" />
                        Convert to Client
                      </button>
                      <button
                        onClick={handleCreateEstimate}
                        className="px-4 py-2.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] hover:text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <FileText className="w-4 h-4 text-blue-600" />
                        Build Estimate
                      </button>
                    </div>
                  </div>
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
                    Edit Profile
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedLead(null)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Close
                </button>
                {isEditMode && (
                  <button
                    type="button"
                    disabled={!formName.trim()}
                    onClick={handleSaveEdit}
                    className={`px-4 py-2 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                      formName.trim() ? "bg-[#315C9F] hover:bg-[#1F3557]" : "bg-slate-300 cursor-not-allowed"
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
