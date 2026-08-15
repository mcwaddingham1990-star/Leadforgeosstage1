Warning: truncated output (original token count: 154433)
Total output lines: 7621

import React, { useState, useEffect, useRef } from "react";
import { db, auth } from "./firebase";
import { doc, setDoc, getDoc, writeBatch } from "firebase/firestore";
import { fullAccessGranular, defaultGranularFromModuleList, hasPermission, GranularPermissions } from "./types/permissions";
import { RevenueEvent, EmployeeRecord, TimeClockLog, Transaction } from "./types/domain";
import { Account, JournalEntry, Invoice, Bill, Vendor, BankAccount, RecurringTransaction, MileageLog, Budget, SalesTaxRate, DEFAULT_CHART_OF_ACCOUNTS } from "./types/accounting";
import { postTransactionEntry } from "./lib/accountingEngine";
import { registerForPushNotifications } from "./lib/pushNotifications";
import { TimeClockApprovalModal } from "./components/TimeClockApprovalModal";
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
const BRAND_ICON_DATA_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAXqBgADASIAAhEBAxEB/8QAHgAAAQUAAwEBAAAAAAAAAAAAAAECAwQFBgcICQr/xABUEAACAQMBBQUACwwIBgEDBAMAAQIDBBExBRITIWEGBxRBUQgWIjJSVHGBkaGxCRcZNDZCU2Jzg6PRFSMkJSYzN5I1Q0STosFysuHwRVVjgvEnGP/EAB0BAAEFAQEBAQAAAAAAAAAAAAABAgMEBQYHCAn/xAA+EQACAgECAggDBwMDBAIDAQAAAQIDEQQSBRMGFCExNFFScRZBkQcVIjI1YXIkM1MjQrFDgaHBJWKC0fBE/9oADAMBAAIRAxEAPwD5VAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+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…94433 tokens truncated…/span>
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
                            <span className="select-none text-xl">📈</span> Company Revenue Tracking
                          </h2>
                          <p className="text-xs text-[#5E7393] font-sans font-semibold">Track revenue, labor costs, expenses, and estimated taxes</p>
                        </div>
                        <PlaidConnectButton />
                      </div>

                      {/* CHOOSE GRAPH DATA BLOCK */}
                      <div className="bg-[#C7E3FA] p-4 rounded-2xl border border-[#9EC8EF] shadow-sm space-y-2.5">
                        <h3 className="text-xs font-extrabold text-[#1F3557] uppercase tracking-wider">Choose Graph Data</h3>
                        <div className="flex flex-wrap gap-2">
                          {([
                            { value: "revenue",  label: "Total Revenue" },
                            { value: "expenses", label: "Total Expenses" },
                            { value: "profit",   label: "Total Profit" },
                          ] as const).map(({ value, label }) => (
                            <button
                              key={value}
                              onClick={() => setGraphDataType(value)}
                              className={`px-3 py-1.5 text-[10.5px] rounded-lg font-bold transition-all duration-200 cursor-pointer ${
                                graphDataType === value
                                  ? "bg-[#4A86F7] text-white shadow-sm"
                                  : "bg-[#EAF5FF] text-[#5E7393] border border-[#9EC8EF] hover:text-[#1F3557]"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {([
                            { value: "Day",        label: "Day" },
                            { value: "Week",       label: "Week" },
                            { value: "Pay Period", label: "Pay Period" },
                            { value: "Quarter",    label: "Quarter" },
                            { value: "Annual",     label: "Annual" },
                          ] as const).map(({ value, label }) => (
                            <button
                              key={value}
                              onClick={() => setRevenuePageFilter(value)}
                              className={`px-3 py-1.5 text-[10.5px] rounded-lg font-bold transition-all duration-200 cursor-pointer ${
                                revenuePageFilter === value
                                  ? "bg-[#1F3557] text-white shadow-sm"
                                  : "bg-[#EAF5FF] text-[#5E7393] border border-[#9EC8EF] hover:text-[#1F3557]"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
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
                                  if (revenuePageFilter === "Week") return `Daily activity — last 7 days (through ${now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })})`;
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
                              { value: "Week", label: "View by Week" },
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

                        {/* Recharts Live Multi-line Graph — horizontally scrollable */}
                        {(() => {
                          const chartSeries = getRevenueChartData(revenuePageFilter, revenueEvents, transactions).series;
                          const chartWidth = Math.max(340, chartSeries.length * 78);
                          return (
                            <div className="pt-2">
                              {chartSeries.length > 5 && (
                                <p className="text-[10px] text-[#5E7393] font-sans text-right pr-2 pb-1 opacity-60 select-none">← swipe to scroll →</p>
                              )}
                              <div className="overflow-x-auto overflow-y-hidden rounded-xl" style={{ WebkitOverflowScrolling: 'touch' as any }}>
                                <LineChart
                                  width={chartWidth}
                                  height={280}
                                  data={chartSeries}
                                  margin={{ top: 10, right: 24, left: 14, bottom: 0 }}
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
                                    tickFormatter={(val) => val >= 1000 ? `$${(val / 1000).toFixed(0)}k` : `$${val}`}
                                    className="font-mono"
                                    width={48}
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
                                  <Line type="monotone" dataKey="Revenue" stroke="#4A86F7" strokeWidth={3} dot={{ r: 4, strokeWidth: 1 }} activeDot={{ r: 6 }} name="Revenue" />
                                  <Line type="monotone" dataKey="Expenses" stroke="#F43F5E" strokeWidth={2} dot={{ r: 3, strokeWidth: 1 }} activeDot={{ r: 5 }} name="Expenses" />
                                  <Line type="monotone" dataKey="Profit" stroke="#22C55E" strokeWidth={2} dot={{ r: 3, strokeWidth: 1 }} activeDot={{ r: 5 }} name="Profit" />
                                </LineChart>
                              </div>
                            </div>
                          );
                        })()}
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
