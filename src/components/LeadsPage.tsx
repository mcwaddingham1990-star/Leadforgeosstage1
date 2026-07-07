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
  Camera
} from "lucide-react";

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
}

interface LeadsPageProps {
  onOpenPlaceholder: (label: string, icon: string) => void;
  onTakeSnapshot?: (pageId: string, pageName: string, meta?: any) => void;
  onOpenAIAnalysis?: (pageId: string, pageName: string, customContext?: string) => void;
  onNavigateToScreen?: (screenId: string, params?: { customerId?: string; date?: string }) => void;
}

// 10 high-quality realistic LeadForge leads
const INITIAL_LEADS: Lead[] = [
  {
    id: "lead_1",
    name: "John Connor",
    company: "Connor Resistance Gear",
    phone: "(555) 111-2222",
    email: "john@resistance.com",
    source: "Website",
    salesRep: "Marcus Vance",
    status: "New",
    estimatedValue: 4500,
    dateAdded: "July 5, 2026",
    addedDaysAgo: 0
  },
  {
    id: "lead_2",
    name: "Bruce Wayne",
    company: "Wayne Enterprises",
    phone: "(555) 999-8888",
    email: "bruce@waynecorp.com",
    source: "Referral",
    salesRep: "Theresa W.",
    status: "Qualified",
    estimatedValue: 35000,
    dateAdded: "July 3, 2026",
    addedDaysAgo: 2
  },
  {
    id: "lead_3",
    name: "Clark Kent",
    company: "Daily Planet",
    phone: "(555) 333-4444",
    email: "ckent@dailyplanet.com",
    source: "Google Business Profile",
    salesRep: "Albert F.",
    status: "Contacted",
    estimatedValue: 1200,
    dateAdded: "July 4, 2026",
    addedDaysAgo: 1
  },
  {
    id: "lead_4",
    name: "Diana Prince",
    company: "Themyscira Antiques",
    phone: "(555) 777-6666",
    email: "diana@themyscira.museum",
    source: "Instagram",
    salesRep: "Esther H.",
    status: "Estimate Sent",
    estimatedValue: 8900,
    dateAdded: "June 30, 2026",
    addedDaysAgo: 5
  },
  {
    id: "lead_5",
    name: "Tony Stark",
    company: "Stark Industries",
    phone: "(555) 300-4000",
    email: "tony@stark.com",
    source: "Phone Call",
    salesRep: "Marcus Vance",
    status: "Won",
    estimatedValue: 50000,
    dateAdded: "June 25, 2026",
    addedDaysAgo: 10
  },
  {
    id: "lead_6",
    name: "Peter Parker",
    company: "Daily Bugle",
    phone: "(555) 123-4321",
    email: "pparker@bugle.com",
    source: "Facebook",
    salesRep: "James W.",
    status: "Follow-Up Needed",
    estimatedValue: 650,
    dateAdded: "July 1, 2026",
    addedDaysAgo: 4
  },
  {
    id: "lead_7",
    name: "Arthur Curry",
    company: "Atlantis Seafood",
    phone: "(555) 444-5555",
    email: "acurry@atlantis.org",
    source: "Walk-In",
    salesRep: "Brandon M.",
    status: "Lost",
    estimatedValue: 15000,
    dateAdded: "June 20, 2026",
    addedDaysAgo: 15
  },
  {
    id: "lead_8",
    name: "Barry Allen",
    company: "CCPD Lab",
    phone: "(555) 888-9999",
    email: "ballen@ccpd.gov",
    source: "Manual Entry",
    salesRep: "Theresa W.",
    status: "Contacted",
    estimatedValue: 2400,
    dateAdded: "July 2, 2026",
    addedDaysAgo: 3
  },
  {
    id: "lead_9",
    name: "Hal Jordan",
    company: "Ferris Aircraft",
    phone: "(555) 555-6666",
    email: "hjordan@ferris.com",
    source: "Other",
    salesRep: "Albert F.",
    status: "Archived",
    estimatedValue: 3100,
    dateAdded: "June 15, 2026",
    addedDaysAgo: 20
  },
  {
    id: "lead_10",
    name: "Wanda Maximoff",
    company: "Westview Realty",
    phone: "(555) 666-7777",
    email: "wanda@westview.org",
    source: "Website",
    salesRep: "Esther H.",
    status: "New",
    estimatedValue: 12500,
    dateAdded: "July 5, 2026",
    addedDaysAgo: 0
  }
];

export const LeadsPage: React.FC<LeadsPageProps> = ({
  onOpenPlaceholder,
  onTakeSnapshot,
  onOpenAIAnalysis,
  onNavigateToScreen
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>("All");
  const [activeSourceFilter, setActiveSourceFilter] = useState<string>("All");

  // In-memory Leads list
  const leads = useMemo(() => INITIAL_LEADS, []);

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
              onClick={() => onOpenPlaceholder("Add Lead Portal", "✨")}
              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
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
                      onClick={() => onOpenPlaceholder(`Lead Details: ${ld.name}`, "👤")}
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

    </div>
  );
};
