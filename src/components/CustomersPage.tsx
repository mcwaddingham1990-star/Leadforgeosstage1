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
  Save
} from "lucide-react";

export interface Customer {
  id: string;
  company: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  openJobs: number;
  outstandingBalance: number;
  lifetimeValue: number;
  status: "Active" | "Inactive" | "Past Due";
  type: "Residential" | "Commercial";
  isVIP: boolean;
  recentlyAdded: boolean;
  upcomingJobDate?: string;
  requireFollowUp?: boolean;
}

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
export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: "1",
    company: "Apex Plumb & Drain",
    contact: "Marcus Vance",
    phone: "(555) 234-5678",
    email: "marcus@apexplumb.com",
    address: "1024 Industrial Pkwy, Ste B",
    openJobs: 3,
    outstandingBalance: 0,
    lifetimeValue: 24500,
    status: "Active",
    type: "Commercial",
    isVIP: true,
    recentlyAdded: false,
    upcomingJobDate: "July 12, 2026",
    requireFollowUp: false
  },
  {
    id: "2",
    company: "Sarah Connor",
    contact: "Sarah Connor",
    phone: "(555) 987-6543",
    email: "sconnor@cyberdyne.org",
    address: "742 Evergreen Terrace",
    openJobs: 1,
    outstandingBalance: 150,
    lifetimeValue: 3200,
    status: "Active",
    type: "Residential",
    isVIP: true,
    recentlyAdded: true,
    upcomingJobDate: "July 15, 2026",
    requireFollowUp: false
  },
  {
    id: "3",
    company: "Oakridge Apartments",
    contact: "Clara Oswald",
    phone: "(555) 876-5432",
    email: "manager@oakridgeapartments.net",
    address: "4400 Oakridge Ln, Bldg 4",
    openJobs: 2,
    outstandingBalance: 2450,
    lifetimeValue: 18900,
    status: "Past Due",
    type: "Commercial",
    isVIP: false,
    recentlyAdded: false,
    requireFollowUp: true
  },
  {
    id: "4",
    company: "John Miller Plastering",
    contact: "John Miller",
    phone: "(555) 345-6789",
    email: "john@millerplaster.com",
    address: "893 West End Ave",
    openJobs: 0,
    outstandingBalance: 0,
    lifetimeValue: 850,
    status: "Active",
    type: "Residential",
    isVIP: false,
    recentlyAdded: false,
    requireFollowUp: false
  },
  {
    id: "5",
    company: "Dynamic Retailers Inc.",
    contact: "Arthur Dent",
    phone: "(555) 456-7890",
    email: "adent@dynamicretail.com",
    address: "42 Towel Way",
    openJobs: 0,
    outstandingBalance: 0,
    lifetimeValue: 12400,
    status: "Inactive",
    type: "Commercial",
    isVIP: false,
    recentlyAdded: false,
    requireFollowUp: false
  },
  {
    id: "6",
    company: "Emma Watson",
    contact: "Emma Watson",
    phone: "(555) 567-8901",
    email: "emma@granger.co.uk",
    address: "12 Grimmauld Place",
    openJobs: 1,
    outstandingBalance: 0,
    lifetimeValue: 1450,
    status: "Active",
    type: "Residential",
    isVIP: false,
    recentlyAdded: false,
    upcomingJobDate: "July 20, 2026",
    requireFollowUp: false
  },
  {
    id: "7",
    company: "Downey Enterprises",
    contact: "Robert Downey",
    phone: "(555) 678-9012",
    email: "tony@starkindustries.com",
    address: "10880 Malibu Point",
    openJobs: 0,
    outstandingBalance: 1200,
    lifetimeValue: 4800,
    status: "Past Due",
    type: "Residential",
    isVIP: false,
    recentlyAdded: false,
    requireFollowUp: true
  },
  {
    id: "8",
    company: "Chevron Logistics",
    contact: "William Riker",
    phone: "(555) 789-0123",
    email: "riker@chevronlog.com",
    address: "1701 Enterprise Way",
    openJobs: 4,
    outstandingBalance: 0,
    lifetimeValue: 45000,
    status: "Active",
    type: "Commercial",
    isVIP: true,
    recentlyAdded: false,
    upcomingJobDate: "July 10, 2026",
    requireFollowUp: false
  },
  {
    id: "9",
    company: "Lisa Kudrow Home",
    contact: "Lisa Kudrow",
    phone: "(555) 890-1234",
    email: "phoebe@buffay.ms",
    address: "5 Ocean Dr",
    openJobs: 0,
    outstandingBalance: 0,
    lifetimeValue: 350,
    status: "Inactive",
    type: "Residential",
    isVIP: false,
    recentlyAdded: false,
    requireFollowUp: false
  },
  {
    id: "10",
    company: "Jordan Athletics",
    contact: "Michael Jordan",
    phone: "(555) 901-2345",
    email: "mj@jordan23.com",
    address: "23 Championship Dr",
    openJobs: 1,
    outstandingBalance: 350,
    lifetimeValue: 9500,
    status: "Active",
    type: "Residential",
    isVIP: true,
    recentlyAdded: true,
    upcomingJobDate: "July 24, 2026",
    requireFollowUp: false
  }
];

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

  // Form states
  const [formCompany, setFormCompany] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formType, setFormType] = useState<"Residential" | "Commercial">("Residential");
  const [formStatus, setFormStatus] = useState<"Active" | "Inactive" | "Past Due">("Active");
  const [formIsVIP, setFormIsVIP] = useState(false);

  const openAddModal = () => {
    setFormCompany("");
    setFormContact("");
    setFormPhone("");
    setFormEmail("");
    setFormAddress("");
    setFormType("Residential");
    setFormStatus("Active");
    setFormIsVIP(false);
    setIsAddModalOpen(true);
  };

  const openEditModal = (cust: Customer) => {
    setSelectedCustomer(cust);
    setFormCompany(cust.company);
    setFormContact(cust.contact);
    setFormPhone(cust.phone);
    setFormEmail(cust.email);
    setFormAddress(cust.address);
    setFormType(cust.type);
    setFormStatus(cust.status);
    setFormIsVIP(cust.isVIP);
    setIsEditModalOpen(true);
  };

  const handleAddCustomer = () => {
    if (!formContact.trim()) return;
    const newCust: Customer = {
      id: "cust_" + Math.random().toString(36).substring(2, 9),
      company: formCompany.trim() || formContact.trim() + " Inc",
      contact: formContact.trim(),
      phone: formPhone.trim() || "(555) 000-0000",
      email: formEmail.trim() || `${formContact.toLowerCase().replace(/\s+/g, "")}@example.com`,
      address: formAddress.trim() || "100 Operational Way",
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
    setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? {
      ...c,
      company: formCompany.trim() || formContact.trim() + " Inc",
      contact: formContact.trim(),
      phone: formPhone.trim(),
      email: formEmail.trim(),
      address: formAddress.trim(),
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
                onOpenPlaceholder("CSV Customer Importer Template", "📥");
              }}
              className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Customers
            </button>
            <button
              onClick={() => {
                // Mock downloading JSON/CSV database
                const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(customers, null, 2))}`;
                const downloadAnchor = document.createElement("a");
                downloadAnchor.setAttribute("href", jsonString);
                downloadAnchor.setAttribute("download", "leadforge_customer_database.json");
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();
              }}
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

    </div>
  );
};
