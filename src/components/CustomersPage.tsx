import React, { useState, useMemo, useEffect } from "react";
import {
  Search,
  Plus,
  Upload,
  Download,
  Users,
  CheckCircle,
  AlertTriangle,
  Clock,
  DollarSign,
  Building,
  Home,
  Briefcase,
  FileText,
  Calendar,
  CreditCard,
  MessageSquare,
  FolderOpen,
  ArrowUpRight,
  Activity,
  User,
  MapPin,
  Mail,
  Phone,
  Filter,
  Check,
  Sparkles,
  Camera,
  Trash2,
  Edit3,
  X,
  Save,
  Minus
} from "lucide-react";

export type { Customer } from "../types/domain";
import type { Customer } from "../types/domain";

export interface CustomersPageProps {
  onOpenPlaceholder: (label: string, icon: string) => void;
  onTakeSnapshot?: (pageId: string, pageName: string, meta?: any) => void;
  onOpenAIAnalysis?: (pageId: string, pageName: string, customContext?: string) => void;
  customers?: Customer[];
  setCustomers?: React.Dispatch<React.SetStateAction<Customer[]>>;
  logOperationalEvent?: (type: string, desc: string, icon: string) => void;
  onNavigateToScreen?: (screenId: string, params?: { customerId?: string; date?: string }) => void;
}

// 10 high-quality realistic LeadForge customers
export const INITIAL_CUSTOMERS: Customer[] = [];

export const CustomersPage: React.FC<CustomersPageProps> = ({
  onOpenPlaceholder,
  onTakeSnapshot,
  onOpenAIAnalysis,
  customers: propCustomers,
  setCustomers: propSetCustomers,
  logOperationalEvent,
  onNavigateToScreen
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "All" | "Residential" | "Commercial" | "Active" | "Inactive" | "Past Due" | "VIP" | "Recently Added"
  >("All");

  const [localCustomers, setLocalCustomers] = useState<Customer[]>(() => {
    const saved = localStorage.getItem("leadforge_customers");
    return saved ? JSON.parse(saved) : INITIAL_CUSTOMERS;
  });

  const customers = propCustomers || localCustomers;
  const setCustomers = propSetCustomers || setLocalCustomers;

  useEffect(() => {
    if (!propCustomers) {
      localStorage.setItem("leadforge_customers", JSON.stringify(localCustomers));
    }
  }, [localCustomers, propCustomers]);

  // Modal & Details States
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFileError, setImportFileError] = useState<string | null>(null);
  const [importPreviewList, setImportPreviewList] = useState<Customer[]>([]);

  const handleExportCSV = () => {
    const headers = ["ID", "Company Name", "Contact Person", "Phone", "Email", "Address", "Open Jobs", "Outstanding Balance ($)", "Lifetime Value ($)", "Status", "Customer Type", "VIP Status"];
    
    const rows = customers.map(c => [
      c.id,
      c.company.replace(/"/g, '""'),
      c.contact.replace(/"/g, '""'),
      c.phone,
      c.email,
      c.address.replace(/"/g, '""'),
      c.openJobs,
      c.outstandingBalance,
      c.lifetimeValue,
      c.status,
      c.type,
      c.isVIP ? "Yes" : "No"
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(fields => fields.map(val => {
        const strVal = String(val);
        if (strVal.includes(",") || strVal.includes('"') || strVal.includes("\n")) {
          return `"${strVal}"`;
        }
        return strVal;
      }).join(","))
    ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "leadforge_customer_database.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (logOperationalEvent) {
      logOperationalEvent("CSV Exported", `Exported ${customers.length} customer records to CSV file`, "📥");
    }
  };

  const handleImportCSVData = (text: string) => {
    try {
      const lines = text.split(/\r?\n/);
      if (lines.length <= 1) {
        setImportFileError("The file seems to be empty or contains no headers.");
        return;
      }

      const parsedList: Customer[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const fields: string[] = [];
        let cur = "";
        let inQuotes = false;
        for (let charIdx = 0; charIdx < line.length; charIdx++) {
          const char = line[charIdx];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            fields.push(cur.trim().replace(/^["']|["']$/g, ""));
            cur = "";
          } else {
            cur += char;
          }
        }
        fields.push(cur.trim().replace(/^["']|["']$/g, ""));

        let company = fields[0] || "";
        let contact = fields[1] || "";
        let phone = fields[2] || "";
        let email = fields[3] || "";
        let address = fields[4] || "";
        let typeStr = fields[5] || "Residential";
        let statusStr = fields[6] || "Active";
        let vipStr = fields[7] || "No";

        if (!contact && company) {
          contact = company;
        }
        if (!contact && !company) continue;

        const importedCustomer: Customer = {
          id: "cust_csv_" + Math.random().toString(36).substring(2, 9),
          company: company || contact,
          contact: contact || company,
          phone: phone || "(555) 555-0100",
          email: email || `${(contact || company).toLowerCase().replace(/[^a-z0-9]/g, "")}@example.com`,
          address: address || "No address supplied",
          openJobs: 0,
          outstandingBalance: 0,
          lifetimeValue: 0,
          status: (statusStr.toLowerCase().includes("past") || statusStr.toLowerCase().includes("due"))
            ? "Past Due"
            : statusStr.toLowerCase().includes("inactive")
            ? "Inactive"
            : "Active",
          type: (typeStr.toLowerCase().includes("commercial") || typeStr.toLowerCase().includes("comm"))
            ? "Commercial"
            : "Residential",
          isVIP: vipStr.toLowerCase() === "yes" || vipStr.toLowerCase() === "true" || vipStr.toLowerCase() === "y" || vipStr.toLowerCase() === "vip",
          recentlyAdded: true
        };
        parsedList.push(importedCustomer);
      }

      if (parsedList.length === 0) {
        setImportFileError("Could not extract any valid customer records. Please verify headers.");
      } else {
        setImportPreviewList(parsedList);
        setImportFileError(null);
      }
    } catch (err) {
      setImportFileError("Failed to parse the CSV file. Please check the file formatting.");
    }
  };

  const loadPresetImport = (presetName: string) => {
    let presetText = "";
    if (presetName === "hvac") {
      presetText = `Company Name,Contact Person,Phone,Email,Address,Customer Type,Status,VIP Status\n"Titan Air Conditioning","Ray Nelson","(555) 304-9811","ray@titanair.com","452 Industrial Parkway, Ste E","Commercial","Active","Yes"\n"Linda Geller Residential","Linda Geller","(555) 881-2356","linda.geller@gmail.com","128 Maple Lane","Residential","Active","No"\n"Metro Cold Storage Inc","Victor Stone","(555) 441-9022","vstone@metrocold.org","99 Waterfront Rd","Commercial","Past Due","No"`;
    } else {
      presetText = `Company Name,Contact Person,Phone,Email,Address,Customer Type,Status,VIP Status\n"Stark Remodeling","Howard Stark","(555) 902-1144","howard@starkremodel.com","10880 Malibu Point","Commercial","Active","Yes"\n"Green Acres Farms","Bruce Banner","(555) 234-9900","bruce@hulkscience.org","14 Outer Ridge Road","Residential","Active","No"`;
    }
    handleImportCSVData(presetText);
  };

  // Form states
  const [formCompany, setFormCompany] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formPhones, setFormPhones] = useState<string[]>([""]);
  const [formEmail, setFormEmail] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formCityState, setFormCityState] = useState("");
  const [formZip, setFormZip] = useState("");
  const [formType, setFormType] = useState<"Residential" | "Commercial">("Residential");
  const [formStatus, setFormStatus] = useState<"Active" | "Inactive" | "Past Due">("Active");
  const [formIsVIP, setFormIsVIP] = useState(false);

  const openAddModal = () => {
    setFormCompany("");
    setFormContact("");
    setFormPhones([""]);
    setFormEmail("");
    setFormAddress("");
    setFormCityState("");
    setFormZip("");
    setFormType("Residential");
    setFormStatus("Active");
    setFormIsVIP(false);
    setIsAddModalOpen(true);
  };

  const openEditModal = (cust: Customer) => {
    setSelectedCustomer(cust);
    setFormCompany(cust.company);
    setFormContact(cust.contact);
    
    // Parse phones
    const phones = (cust.phone || "").split(",").map(p => p.trim()).filter(Boolean);
    setFormPhones(phones.length > 0 ? phones : [""]);
    
    setFormEmail(cust.email);
    
    // Parse address
    const parts = (cust.address || "").split(",").map(s => s.trim());
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
    
    setFormType(cust.type);
    setFormStatus(cust.status);
    setFormIsVIP(cust.isVIP);
    setIsEditModalOpen(true);
  };

  const handleAddCustomer = () => {
    if (!formContact.trim()) return;
    const phoneStr = formPhones.map(p => p.trim()).filter(Boolean).join(", ") || "(555) 000-0000";
    const combinedAddress = [formAddress.trim(), formCityState.trim(), formZip.trim()].filter(Boolean).join(", ") || "100 Operational Way, Seattle, WA";
    
    const newCust: Customer = {
      id: "cust_" + Math.random().toString(36).substring(2, 9),
      company: formCompany.trim() || formContact.trim() + " Inc",
      contact: formContact.trim(),
      phone: phoneStr,
      email: formEmail.trim() || `${formContact.toLowerCase().replace(/\s+/g, "")}@example.com`,
      address: combinedAddress,
      openJobs: 0,
      outstandingBalance: 0,
      lifetimeValue: 0,
      status: formStatus,
      type: formType,
      isVIP: formIsVIP,
      recentlyAdded: true,
      upcomingJobDate: undefined,
      requireFollowUp: false
    };

    setCustomers(prev => [newCust, ...prev]);
    setIsAddModalOpen(false);

    if (logOperationalEvent) {
      logOperationalEvent("Customer Added", `New Customer '${newCust.contact}' registered`, "👤");
    }
  };

  const handleEditCustomer = () => {
    if (!selectedCustomer) return;
    const phoneStr = formPhones.map(p => p.trim()).filter(Boolean).join(", ");
    const combinedAddress = [formAddress.trim(), formCityState.trim(), formZip.trim()].filter(Boolean).join(", ");
    
    setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? {
      ...c,
      company: formCompany.trim() || formContact.trim() + " Inc",
      contact: formContact.trim(),
      phone: phoneStr,
      email: formEmail.trim(),
      address: combinedAddress,
      type: formType,
      status: formStatus,
      isVIP: formIsVIP
    } : c));
    setIsEditModalOpen(false);
    setSelectedCustomer(null);

    if (logOperationalEvent) {
      logOperationalEvent("Customer Updated", `Customer Profile for '${formContact}' updated`, "📝");
    }
  };

  const handleDeleteCustomer = () => {
    if (!selectedCustomer) return;
    setCustomers(prev => prev.filter(c => c.id !== selectedCustomer.id));
    setIsDeleteConfirmOpen(false);
    setSelectedCustomer(null);

    if (logOperationalEvent) {
      logOperationalEvent("Customer Deleted", `Customer '${selectedCustomer.contact}' profile removed`, "🗑️");
    }
  };

  // Filtered and searched customer list
  const filteredCustomers = useMemo(() => {
    return customers.filter((cust) => {
      // Search logic (Name, Company, Phone, Email, Address)
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q === "" ||
        cust.company.toLowerCase().includes(q) ||
        cust.contact.toLowerCase().includes(q) ||
        cust.phone.toLowerCase().includes(q) ||
        cust.email.toLowerCase().includes(q) ||
        cust.address.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      // Filter logic
      switch (activeFilter) {
        case "Residential":
          return cust.type === "Residential";
        case "Commercial":
          return cust.type === "Commercial";
        case "Active":
          return cust.status === "Active";
        case "Inactive":
          return cust.status === "Inactive";
        case "Past Due":
          return cust.status === "Past Due";
        case "VIP":
          return cust.isVIP;
        case "Recently Added":
          return cust.recentlyAdded;
        default:
          return true;
      }
    });
  }, [customers, searchQuery, activeFilter]);

  // Metrics calculators
  const metrics = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((c) => c.status === "Active").length;
    const pastDue = customers.filter((c) => c.status === "Past Due").length;
    const totalLtv = customers.reduce((acc, c) => acc + c.lifetimeValue, 0);

    return { total, active, pastDue, totalLtv };
  }, [customers]);

  // Insights filter arrays
  const recentlyAdded = useMemo(() => {
    return customers.filter((c) => c.recentlyAdded);
  }, [customers]);

  const highestLtv = useMemo(() => {
    return [...customers].sort((a, b) => b.lifetimeValue - a.lifetimeValue).slice(0, 2);
  }, [customers]);

  const upcomingJobs = useMemo(() => {
    return customers.filter((c) => c.upcomingJobDate);
  }, [customers]);

  const requiresFollowUp = useMemo(() => {
    return customers.filter((c) => c.requireFollowUp);
  }, [customers]);

  // Sample activities
  const activities = [
    {
      id: "act_1",
      type: "Estimate Sent",
      desc: "Estimate #E-1084 sent to Apex Plumb & Drain",
      time: "2 hours ago",
      customer: "Apex Plumb & Drain"
    },
    {
      id: "act_2",
      type: "Invoice Paid",
      desc: "Invoice #I-2049 paid by Chevron Logistics - $4,500.00",
      time: "5 hours ago",
      customer: "Chevron Logistics"
    },
    {
      id: "act_3",
      type: "Job Completed",
      desc: "Sewer Line Inspection completed for Oakridge Apartments",
      time: "Yesterday",
      customer: "Oakridge Apartments"
    },
    {
      id: "act_4",
      type: "Review Received",
      desc: "5-Star review received from Sarah Connor: 'Fast service!'",
      time: "2 days ago",
      customer: "Sarah Connor"
    },
    {
      id: "act_5",
      type: "Appointment Scheduled",
      desc: "System Maintenance scheduled for Emma Watson",
      time: "3 days ago",
      customer: "Emma Watson"
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in text-left">
      
      {/* 1. TOP CARD */}
      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-display font-extrabold text-[#1F3557] tracking-tight uppercase">
              Customer Database
            </h2>
            <p className="text-xs text-[#5E7393] font-sans font-semibold mt-1">
              Complete operational log, filters, and client statistics hub
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white border border-[#9EC8EF] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Customer
            </button>
            <button
              onClick={() => {
                setImportFileError(null);
                setImportPreviewList([]);
                setIsImportModalOpen(true);
              }}
              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Customers
            </button>
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export Customers
            </button>
            {onTakeSnapshot && (
              <button
                onClick={() => onTakeSnapshot("customers", "Customers", {
                  recordCount: filteredCustomers.length,
                  filters: activeFilter,
                  details: `Total listed customers: ${customers.length}. Total VIP clients: ${customers.filter(c => c.isVIP).length}. LTV total is $${metrics.totalLtv.toLocaleString()}.`
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
                onClick={() => onOpenAIAnalysis("customers", "Customers")}
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
              placeholder="Search customers..."
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
          </div>
        </div>
      </div>

      {/* 2. SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1 */}
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] text-[#1F3557] border border-[#9EC8EF] flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393]">
              Total Customers
            </p>
            <p className="text-lg font-display font-bold text-[#1F3557] mt-0.5">
              {metrics.total}
            </p>
          </div>
        </div>

        {/* CARD 2 */}
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] text-emerald-600 border border-[#9EC8EF] flex items-center justify-center">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393]">
              Active Customers
            </p>
            <p className="text-lg font-display font-bold text-[#1F3557] mt-0.5">
              {metrics.active}
            </p>
          </div>
        </div>

        {/* CARD 3 */}
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] text-rose-600 border border-[#9EC8EF] flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393]">
              Past Due Customers
            </p>
            <p className="text-lg font-display font-bold text-[#1F3557] mt-0.5">
              {metrics.pastDue}
            </p>
          </div>
        </div>

        {/* CARD 4 */}
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] text-[#1F3557] border border-[#9EC8EF] flex items-center justify-center">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#5E7393]">
              Lifetime Value
            </p>
            <p className="text-lg font-display font-bold text-[#1F3557] mt-0.5">
              ${metrics.totalLtv.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Grid containing FILTERS + TABLE */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* FILTERS PANEL */}
        <div className="space-y-4 lg:col-span-1">
          <div className="bg-[#C7E3FA] rounded-2xl p-4.5 border border-[#9EC8EF] shadow-sm">
            <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider mb-3 flex items-center gap-1.5 border-b border-[#9EC8EF]/40 pb-2">
              <Filter className="w-3.5 h-3.5 text-[#1F3557]" />
              Database Filters
            </h3>
            
            <div className="flex flex-col gap-1.5">
              {(
                [
                  "All",
                  "Residential",
                  "Commercial",
                  "Active",
                  "Inactive",
                  "Past Due",
                  "VIP",
                  "Recently Added"
                ] as const
              ).map((filter) => {
                const isActive = activeFilter === filter;
                return (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`px-3 py-2.5 rounded-xl border font-bold text-xs uppercase tracking-wider text-left transition-all cursor-pointer flex items-center justify-between ${
                      isActive
                        ? "bg-[#EAF5FF] border-[#9EC8EF] text-[#1F3557]"
                        : "bg-transparent border-transparent text-[#5E7393] hover:bg-[#EAF5FF]/40 hover:text-[#1F3557]"
                    }`}
                  >
                    <span>{filter}</span>
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
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-1.5">
              <button
                onClick={() => onOpenPlaceholder("estimates")}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <FileText className="w-3.5 h-3.5 text-[#1F3557]" />
                Create Estimate
              </button>
              <button
                onClick={() => {
                  if (onNavigateToScreen) {
                    onNavigateToScreen("scheduling", { customerId: selectedCustomer?.id });
                    if (logOperationalEvent) {
                      logOperationalEvent("Navigate", `Opened scheduling calendar for ${selectedCustomer ? selectedCustomer.company : "new booking"}`, "📅");
                    }
                  } else {
                    onOpenPlaceholder("scheduling", "📅");
                  }
                }}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <Calendar className="w-3.5 h-3.5 text-[#1F3557]" />
                Schedule Job
              </button>
              <button
                onClick={() => onOpenPlaceholder("estimates")}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <Briefcase className="w-3.5 h-3.5 text-[#1F3557]" />
                View Jobs
              </button>
              <button
                onClick={() => onOpenPlaceholder("estimates")}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <CreditCard className="w-3.5 h-3.5 text-[#1F3557]" />
                Create Invoice
              </button>
              <button
                onClick={() => onOpenPlaceholder("estimates")}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <MessageSquare className="w-3.5 h-3.5 text-[#1F3557]" />
                Message Customer
              </button>
              <button
                onClick={() => onOpenPlaceholder("estimates")}
                className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[11px] font-bold text-[#1F3557] text-left transition-colors cursor-pointer flex items-center gap-2"
              >
                <FolderOpen className="w-3.5 h-3.5 text-[#1F3557]" />
                View Documents
              </button>
            </div>
          </div>
        </div>

        {/* CUSTOMER TABLE */}
        <div className="lg:col-span-3 bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex flex-col justify-between overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-[#9EC8EF] text-[10px] font-extrabold uppercase text-[#1F3557] tracking-wider bg-[#EAF5FF]/30">
                  <th className="py-3 px-4">Company</th>
                  <th className="py-3 px-4">Primary Contact</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Address</th>
                  <th className="py-3 px-4 text-center">Open Jobs</th>
                  <th className="py-3 px-4 text-right">Outstanding</th>
                  <th className="py-3 px-4 text-right">Lifetime Value</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#9EC8EF]/40">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-[#5E7393] text-xs font-semibold">
                      No matching customers found. Try altering your filter or search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((cust) => (
                    <tr
                      key={cust.id}
                      onClick={() => setSelectedCustomer(cust)}
                      className="hover:bg-[#BDDDF8]/70 transition-colors cursor-pointer text-xs"
                    >
                      <td className="py-3 px-4 font-bold text-[#1F3557]">
                        <span className="flex items-center gap-1.5">
                          {cust.company}
                          {cust.isVIP && (
                            <span className="px-1 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-extrabold uppercase rounded">
                              VIP
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[#5E7393] font-medium">{cust.contact}</td>
                      <td className="py-3 px-4 font-mono text-[#5E7393]">{cust.phone}</td>
                      <td className="py-3 px-4 text-[#5E7393] truncate max-w-[120px]">{cust.email}</td>
                      <td className="py-3 px-4 text-[#5E7393] truncate max-w-[140px]">{cust.address}</td>
                      <td className="py-3 px-4 text-center font-bold text-[#1F3557] font-mono">{cust.openJobs}</td>
                      <td className={`py-3 px-4 text-right font-bold font-mono ${cust.outstandingBalance > 0 ? "text-rose-600" : "text-[#5E7393]"}`}>
                        ${cust.outstandingBalance.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-bold font-mono text-[#1F3557]">
                        ${cust.lifetimeValue.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                            cust.status === "Active"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              : cust.status === "Past Due"
                              ? "bg-rose-100 text-rose-800 border border-rose-200"
                              : "bg-gray-100 text-gray-800 border border-gray-200"
                          }`}
                        >
                          {cust.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Footer of the table card showing counter */}
          <div className="mt-4 pt-3 border-t border-[#9EC8EF]/40 flex justify-between items-center text-[10.5px] font-sans font-bold text-[#5E7393]">
            <span>
              Showing {filteredCustomers.length} of {customers.length} total customers
            </span>
            <span className="px-2 py-0.5 bg-[#EAF5FF] border border-[#9EC8EF]/60 rounded-lg text-[#1F3557]">
              Database Active
            </span>
          </div>
        </div>
        
      </div>

      {/* 3. CUSTOMER INSIGHTS */}
      <div className="space-y-3.5">
        <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          Customer Insights & Actionable Analytics
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* INSIGHT 1: Recently Added */}
          <div
            onClick={() => onOpenPlaceholder("estimates")}
            className="bg-[#C7E3FA] hover:bg-[#BDDDF8] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm cursor-pointer transition-all flex flex-col justify-between h-40 text-left"
          >
            <div>
              <div className="flex justify-between items-start">
                <span className="text-[9.5px] bg-[#EAF5FF] border border-[#9EC8EF] text-[#1F3557] px-2 py-0.5 rounded font-black uppercase tracking-wider">
                  Recently Added
                </span>
                <Clock className="w-4 h-4 text-[#1F3557]" />
              </div>
              <p className="text-xs font-extrabold text-[#1F3557] mt-3">New Sign-ups (This Week)</p>
              <div className="mt-1 space-y-0.5">
                {recentlyAdded.map((c) => (
                  <p key={c.id} className="text-[10px] text-[#5E7393] font-medium truncate">
                    • {c.company || c.contact}
                  </p>
                ))}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[#1F3557] hover:underline inline-flex items-center gap-1 mt-2">
              View details <ArrowUpRight className="w-3 h-3" />
            </p>
          </div>

          {/* INSIGHT 2: Highest LTV */}
          <div
            onClick={() => onOpenPlaceholder("estimates")}
            className="bg-[#C7E3FA] hover:bg-[#BDDDF8] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm cursor-pointer transition-all flex flex-col justify-between h-40 text-left"
          >
            <div>
              <div className="flex justify-between items-start">
                <span className="text-[9.5px] bg-[#EAF5FF] border border-[#9EC8EF] text-[#1F3557] px-2 py-0.5 rounded font-black uppercase tracking-wider">
                  Highest Value
                </span>
                <DollarSign className="w-4 h-4 text-[#1F3557]" />
              </div>
              <p className="text-xs font-extrabold text-[#1F3557] mt-3">VIP Accounts (Top LTV)</p>
              <div className="mt-1 space-y-0.5">
                {highestLtv.map((c) => (
                  <p key={c.id} className="text-[10px] text-[#5E7393] font-medium truncate">
                    • {c.company} (${c.lifetimeValue.toLocaleString()})
                  </p>
                ))}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[#1F3557] hover:underline inline-flex items-center gap-1 mt-2">
              Review accounts <ArrowUpRight className="w-3 h-3" />
            </p>
          </div>

          {/* INSIGHT 3: Upcoming Jobs */}
          <div
            onClick={() => {
              if (onNavigateToScreen) {
                onNavigateToScreen("scheduling");
              } else {
                onOpenPlaceholder("scheduling", "📅");
              }
            }}
            className="bg-[#C7E3FA] hover:bg-[#BDDDF8] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm cursor-pointer transition-all flex flex-col justify-between h-40 text-left"
          >
            <div>
              <div className="flex justify-between items-start">
                <span className="text-[9.5px] bg-[#EAF5FF] border border-[#9EC8EF] text-[#1F3557] px-2 py-0.5 rounded font-black uppercase tracking-wider">
                  Upcoming Jobs
                </span>
                <Calendar className="w-4 h-4 text-[#1F3557]" />
              </div>
              <p className="text-xs font-extrabold text-[#1F3557] mt-3">Scheduled Maintenance</p>
              <div className="mt-1 space-y-0.5">
                {upcomingJobs.slice(0, 2).map((c) => (
                  <p key={c.id} className="text-[10px] text-[#5E7393] font-medium truncate">
                    • {c.company || c.contact} ({c.upcomingJobDate})
                  </p>
                ))}
              </div>
            </div>
            <p className="text-[10px] font-bold text-[#1F3557] hover:underline inline-flex items-center gap-1 mt-2">
              View calendar <ArrowUpRight className="w-3 h-3" />
            </p>
          </div>

          {/* INSIGHT 4: Requiring Follow-up */}
          <div
            onClick={() => onOpenPlaceholder("estimates")}
            className="bg-[#C7E3FA] hover:bg-[#BDDDF8] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm cursor-pointer transition-all flex flex-col justify-between h-40 text-left"
          >
            <div>
              <div className="flex justify-between items-start">
                <span className="text-[9.5px] bg-[#EAF5FF] border border-[#9EC8EF] text-rose-600 px-2 py-0.5 rounded font-black uppercase tracking-wider">
                  Follow-up Required
                </span>
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              </div>
              <p className="text-xs font-extrabold text-[#1F3557] mt-3">Outstanding Touchpoints</p>
              <div className="mt-1 space-y-0.5">
                {requiresFollowUp.slice(0, 2).map((c) => (
                  <p key={c.id} className="text-[10px] text-[#5E7393] font-medium truncate">
                    • {c.company} (Balance Due)
                  </p>
                ))}
              </div>
            </div>
            <p className="text-[10px] font-bold text-rose-600 hover:underline inline-flex items-center gap-1 mt-2">
              Initiate follow-up <ArrowUpRight className="w-3 h-3" />
            </p>
          </div>

        </div>
      </div>

      {/* 4. CUSTOMER ACTIVITY FEED */}
      <div className="space-y-3">
        <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider">
          Customer Activity Feed
        </h3>
        
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm divide-y divide-[#9EC8EF]/40">
          {activities.map((act) => (
            <div
              key={act.id}
              onClick={() => onOpenPlaceholder("estimates")}
              className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4 cursor-pointer hover:bg-[#BDDDF8]/40 px-2 rounded-xl transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-base select-none">
                  {act.type === "Estimate Sent" ? "📝" :
                   act.type === "Invoice Paid" ? "💳" :
                   act.type === "Job Completed" ? "💼" :
                   act.type === "Review Received" ? "⭐" : "📅"}
                </span>
                <div>
                  <p className="text-xs font-bold text-[#1F3557]">{act.desc}</p>
                  <p className="text-[10px] text-[#5E7393] font-medium mt-0.5">
                    Account: {act.customer}
                  </p>
                </div>
              </div>
              <span className="text-[10.5px] font-mono text-[#5E7393]">{act.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-white" />
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">Add New Customer</h3>
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
                    value={formContact}
                    onChange={e => setFormContact(e.target.value)}
                    placeholder="e.g. Marcus Vance"
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Company Name</label>
                  <input 
                    type="text" 
                    value={formCompany}
                    onChange={e => setFormCompany(e.target.value)}
                    placeholder="e.g. Apex Plumb & Drain"
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
                        placeholder="e.g. (555) 234-5678"
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
                  placeholder="e.g. marcus@apexplumb.com"
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
                    placeholder="e.g. 1024 Industrial Pkwy, Ste B"
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
                      placeholder="e.g. Seattle, WA"
                      className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">Zip Code</label>
                    <input 
                      type="text" 
                      value={formZip}
                      onChange={e => setFormZip(e.target.value)}
                      placeholder="e.g. 98101"
                      className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Customer Type</label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value as any)}
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                  >
                    <option value="Residential">Residential</option>
                    <option value="Commercial">Commercial</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-[#5E7393]">Initial Status</label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as any)}
                    className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Past Due">Past Due</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox"
                  id="isVIPAdd"
                  checked={formIsVIP}
                  onChange={e => setFormIsVIP(e.target.checked)}
                  className="w-4 h-4 text-[#315C9F] bg-[#EAF5FF] border-[#9EC8EF] rounded focus:ring-blue-400 cursor-pointer"
                />
                <label htmlFor="isVIPAdd" className="text-xs font-bold text-[#1F3557] select-none cursor-pointer">
                  Mark as VIP Client
                </label>
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
                disabled={!formContact.trim()}
                onClick={handleAddCustomer}
                className={`px-4 py-2 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                  formContact.trim() ? "bg-[#315C9F] hover:bg-[#1F3557]" : "bg-slate-300 cursor-not-allowed"
                }`}
              >
                Save Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Customers Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-white" />
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">CSV Customer Importer</h3>
              </div>
              <button 
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportFileError(null);
                  setImportPreviewList([]);
                }}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-[#1F3557]">
              <div className="space-y-1">
                <h4 className="text-xs font-bold">Import Instructions:</h4>
                <p className="text-[11px] text-[#5E7393] leading-relaxed">
                  Upload a standard comma-separated values (CSV) file. The file should contain headers like 
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px] mx-1 text-slate-800">Company Name</code>, 
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px] mx-1 text-slate-800">Contact Person</code>, 
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px] mx-1 text-slate-800">Phone</code>, 
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px] mx-1 text-slate-800">Email</code>, and 
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px] mx-1 text-slate-800">Address</code>.
                </p>
              </div>

              {/* Drag & Drop Zone */}
              <div className="relative border-2 border-dashed border-[#9EC8EF] hover:border-[#315C9F] bg-[#EAF5FF]/30 hover:bg-[#EAF5FF]/50 rounded-2xl p-6 transition-colors text-center cursor-pointer">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        const text = evt.target?.result as string;
                        handleImportCSVData(text);
                      };
                      reader.readAsText(file);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-[#315C9F]" />
                  <p className="text-xs font-extrabold">Click to select or drag & drop a CSV file</p>
                  <p className="text-[10px] text-[#5E7393]">Supported files: .csv (Max 5MB)</p>
                </div>
              </div>

              {/* Preset Simulators */}
              <div className="bg-[#EAF5FF]/50 p-3 rounded-2xl border border-[#9EC8EF]/40 space-y-2 text-left">
                <span className="text-[10px] uppercase font-bold text-[#5E7393] block">No CSV on hand? Load instant test dataset:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => loadPresetImport("construction")}
                    className="px-3 py-1.5 bg-[#C7E3FA] hover:bg-[#BDDDF8] text-[#1F3557] text-[10.5px] font-bold rounded-xl transition-all border border-[#9EC8EF]/40 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-[#1F3557]" /> Stark Remodeling Preset (2 Leads)
                  </button>
                  <button
                    type="button"
                    onClick={() => loadPresetImport("hvac")}
                    className="px-3 py-1.5 bg-[#C7E3FA] hover:bg-[#BDDDF8] text-[#1F3557] text-[10.5px] font-bold rounded-xl transition-all border border-[#9EC8EF]/40 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-[#1F3557]" /> Ray Nelson HVAC Preset (3 Leads)
                  </button>
                </div>
              </div>

              {/* Error box */}
              {importFileError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl flex items-center gap-2 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span className="font-semibold">{importFileError}</span>
                </div>
              )}

              {/* Previews */}
              {importPreviewList.length > 0 && (
                <div className="space-y-2.5 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">
                      Previewing parsed customers ({importPreviewList.length}):
                    </span>
                    <button
                      type="button"
                      onClick={() => setImportPreviewList([])}
                      className="text-[10.5px] font-bold text-rose-600 hover:underline cursor-pointer"
                    >
                      Clear Preview
                    </button>
                  </div>
                  
                  <div className="border border-[#9EC8EF]/40 rounded-xl overflow-hidden max-h-40 overflow-y-auto divide-y divide-[#9EC8EF]/20 bg-slate-50">
                    {importPreviewList.map((parsed, idx) => (
                      <div key={idx} className="p-2.5 text-[11px] flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-bold truncate">{parsed.company}</p>
                          <p className="text-[10px] text-[#5E7393] font-medium mt-0.5 truncate">Contact: {parsed.contact} | {parsed.email}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-[#1F3557] rounded font-bold uppercase">{parsed.type}</span>
                          <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold uppercase">{parsed.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t border-[#9EC8EF]/40 px-6 py-4 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportFileError(null);
                  setImportPreviewList([]);
                }}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={importPreviewList.length === 0}
                onClick={() => {
                  setCustomers(prev => [...importPreviewList, ...prev]);
                  if (logOperationalEvent) {
                    logOperationalEvent("CSV Imported", `Imported ${importPreviewList.length} customer records into CRM database`, "📥");
                  }
                  setIsImportModalOpen(false);
                  setImportPreviewList([]);
                }}
                className={`px-4 py-2 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1 ${
                  importPreviewList.length > 0 ? "bg-[#315C9F] hover:bg-[#1F3557]" : "bg-slate-300 cursor-not-allowed"
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Confirm Import ({importPreviewList.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Details & Edit Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-[#1F3557]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border-2 border-[#9EC8EF] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="bg-[#315C9F] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isEditModalOpen ? (
                  <Edit3 className="w-5 h-5 text-white" />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
                <h3 className="font-display font-extrabold text-sm uppercase tracking-wider">
                  {isEditModalOpen ? "Edit Customer Profile" : "Customer Details"}
                </h3>
              </div>
              <button 
                onClick={() => {
                  setSelectedCustomer(null);
                  setIsEditModalOpen(false);
                  setIsDeleteConfirmOpen(false);
                }}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isEditModalOpen ? (
              /* EDIT FORM MODE */
              <>
                <div className="p-6 overflow-y-auto space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1 col-span-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Contact Person *</label>
                      <input 
                        type="text" 
                        value={formContact}
                        onChange={e => setFormContact(e.target.value)}
                        placeholder="e.g. Marcus Vance"
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                      />
                    </div>
                    
                    <div className="space-y-1 col-span-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Company Name</label>
                      <input 
                        type="text" 
                        value={formCompany}
                        onChange={e => setFormCompany(e.target.value)}
                        placeholder="e.g. Apex Plumb & Drain"
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
                            placeholder="e.g. (555) 234-5678"
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
                      placeholder="e.g. marcus@apexplumb.com"
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
                        placeholder="e.g. 1024 Industrial Pkwy, Ste B"
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
                          placeholder="e.g. Seattle, WA"
                          className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-[#5E7393]">Zip Code</label>
                        <input 
                          type="text" 
                          value={formZip}
                          onChange={e => setFormZip(e.target.value)}
                          placeholder="e.g. 98101"
                          className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1 col-span-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Customer Type</label>
                      <select
                        value={formType}
                        onChange={e => setFormType(e.target.value as any)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                      >
                        <option value="Residential">Residential</option>
                        <option value="Commercial">Commercial</option>
                      </select>
                    </div>

                    <div className="space-y-1 col-span-1">
                      <label className="text-[10px] uppercase font-bold text-[#5E7393]">Initial Status</label>
                      <select
                        value={formStatus}
                        onChange={e => setFormStatus(e.target.value as any)}
                        className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#4A86F7] font-bold text-[#1F3557] cursor-pointer"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="Past Due">Past Due</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <input 
                      type="checkbox"
                      id="isVIPEdit"
                      checked={formIsVIP}
                      onChange={e => setFormIsVIP(e.target.checked)}
                      className="w-4 h-4 text-[#315C9F] bg-[#EAF5FF] border-[#9EC8EF] rounded focus:ring-blue-400 cursor-pointer"
                    />
                    <label htmlFor="isVIPEdit" className="text-xs font-bold text-[#1F3557] select-none cursor-pointer">
                      Mark as VIP Client
                    </label>
                  </div>
                </div>

                <div className="bg-slate-50 border-t border-[#9EC8EF]/40 px-6 py-4 flex justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!formContact.trim()}
                    onClick={handleEditCustomer}
                    className={`px-4 py-2 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                      formContact.trim() ? "bg-[#315C9F] hover:bg-[#1F3557]" : "bg-slate-300 cursor-not-allowed"
                    }`}
                  >
                    Save Changes
                  </button>
                </div>
              </>
            ) : isDeleteConfirmOpen ? (
              /* DELETE CONFIRM MODE */
              <div className="p-6 space-y-6">
                <div className="flex items-center gap-3 text-rose-600">
                  <AlertTriangle className="w-8 h-8 text-rose-500 shrink-0" />
                  <div>
                    <h4 className="font-bold text-sm text-[#1F3557]">Delete Customer Record?</h4>
                    <p className="text-xs text-rose-700/80 font-medium">This action cannot be undone and will permanently remove this customer's record.</p>
                  </div>
                </div>

                <p className="text-xs text-[#5E7393] font-semibold">
                  Are you sure you want to delete <span className="text-[#1F3557] font-bold">"{selectedCustomer.company}"</span> (Contact: {selectedCustomer.contact})?
                </p>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsDeleteConfirmOpen(false)}
                    className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteCustomer}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-800 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Permanently Delete
                  </button>
                </div>
              </div>
            ) : (
              /* VIEW DETAILS MODE */
              <>
                <div className="p-6 overflow-y-auto space-y-6 text-[#1F3557] text-left">
                  
                  {/* Profile Info */}
                  <div className="flex items-center gap-4 border-b border-[#9EC8EF]/30 pb-4">
                    <div className="w-14 h-14 rounded-2xl bg-[#C7E3FA] text-[#1F3557] border border-[#9EC8EF] flex items-center justify-center font-display text-xl font-black shrink-0 select-none">
                      {selectedCustomer.contact.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-base font-extrabold tracking-tight flex items-center gap-1.5 flex-wrap">
                        <span>{selectedCustomer.company}</span>
                        {selectedCustomer.isVIP && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[8px] font-black uppercase rounded-lg border border-amber-200/50">
                            VIP Partner
                          </span>
                        )}
                      </h4>
                      <p className="text-xs font-semibold text-[#5E7393] mt-0.5">Primary Contact: {selectedCustomer.contact}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`inline-block px-2 py-0.5 rounded-lg text-[8.5px] font-extrabold uppercase ${
                          selectedCustomer.status === "Active"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : selectedCustomer.status === "Past Due"
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : "bg-gray-100 text-gray-800 border border-gray-200"
                        }`}>
                          {selectedCustomer.status}
                        </span>
                        <span className="inline-block px-2 py-0.5 rounded-lg text-[8.5px] bg-[#EAF5FF] text-[#1F3557] border border-[#9EC8EF] font-extrabold uppercase">
                          {selectedCustomer.type}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1 bg-[#EAF5FF]/40 p-3 rounded-2xl border border-[#9EC8EF]/30">
                      <span className="text-[9px] uppercase font-bold text-[#5E7393] block">Phone</span>
                      <span className="font-mono font-bold flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-[#315C9F]" />
                        {selectedCustomer.phone}
                      </span>
                    </div>
                    <div className="space-y-1 bg-[#EAF5FF]/40 p-3 rounded-2xl border border-[#9EC8EF]/30">
                      <span className="text-[9px] uppercase font-bold text-[#5E7393] block">Email</span>
                      <span className="font-semibold truncate block flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-[#315C9F]" />
                        {selectedCustomer.email}
                      </span>
                    </div>
                    <div className="sm:col-span-2 space-y-1 bg-[#EAF5FF]/40 p-3 rounded-2xl border border-[#9EC8EF]/30">
                      <span className="text-[9px] uppercase font-bold text-[#5E7393] block">Billing / Service Address</span>
                      <span className="font-semibold flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#315C9F] shrink-0" />
                        {selectedCustomer.address}
                      </span>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                      <span className="text-[8px] uppercase font-bold text-[#5E7393] block">Open Jobs</span>
                      <span className="text-sm font-black font-mono block mt-1">{selectedCustomer.openJobs}</span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                      <span className="text-[8px] uppercase font-bold text-[#5E7393] block">Outstanding</span>
                      <span className={`text-sm font-black font-mono block mt-1 ${selectedCustomer.outstandingBalance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        ${selectedCustomer.outstandingBalance.toLocaleString()}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                      <span className="text-[8px] uppercase font-bold text-[#5E7393] block">Lifetime Value</span>
                      <span className="text-sm font-black font-mono block mt-1">${selectedCustomer.lifetimeValue.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Action Shortcuts */}
                  <div className="space-y-2">
                    <span className="text-[9px] uppercase font-bold text-[#5E7393] block">Quick Actions</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          if (onNavigateToScreen) {
                            onNavigateToScreen("scheduling", { customerId: selectedCustomer.id });
                          } else {
                            onOpenPlaceholder("scheduling");
                          }
                          setSelectedCustomer(null);
                        }}
                        className="p-2.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-left text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer transition-colors"
                      >
                        <Calendar className="w-4 h-4 text-[#315C9F]" />
                        Schedule Job
                      </button>
                      <button
                        onClick={() => {
                          onOpenPlaceholder("estimates");
                          setSelectedCustomer(null);
                        }}
                        className="p-2.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-left text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer transition-colors"
                      >
                        <FileText className="w-4 h-4 text-[#315C9F]" />
                        Create Estimate
                      </button>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-slate-50 border-t border-[#9EC8EF]/40 px-6 py-4 flex justify-between items-center shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsDeleteConfirmOpen(true)}
                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 hover:text-rose-800 font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Record
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(selectedCustomer)}
                      className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit Profile
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer(null)}
                      className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-[#5E7393] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
