import React, { useState, useMemo, useEffect } from "react";
import {
  Clock,
  User,
  Users,
  CheckCircle,
  TrendingUp,
  Plus,
  Search,
  Filter,
  RefreshCw,
  MapPin,
  Truck,
  Navigation,
  Calendar,
  DollarSign,
  Activity,
  FileText,
  Check,
  Edit,
  PlusCircle,
  Lock,
  Unlock,
  ThumbsUp,
  AlertCircle,
  Briefcase,
  Layers,
  ChevronRight,
  Info,
  ExternalLink,
  SlidersHorizontal,
  X
} from "lucide-react";
import { SchedulingEvent } from "./SchedulingPage";

export interface TimeLog {
  id: string;
  employeeName: string;
  type: "Clock In" | "Clock Out" | "Break Start" | "Break End";
  date: string; // YYYY-MM-DD
  time: string; // HH:MM AM/PM
  gps: string; // simulated coordinates
  jobId?: string;
  jobTitle?: string;
  route?: string;
  vehicle?: string;
  approved?: boolean;
}

export interface EmployeeClockState {
  id: string;
  name: string;
  title: string;
  department: "Field" | "Dispatch" | "Office" | "Management";
  crew: "Crew Alpha" | "Crew Beta" | "Crew Gamma" | "Office Staff";
  hourlyRate: number;
  status: "Off Duty" | "Clocked In" | "On Break" | "Traveling" | "Working" | "Overtime" | "Clocked Out";
  currentJobId?: string;
  currentJobTitle?: string;
  currentCustomer?: string;
  assignedVehicle?: string;
  assignedRoute?: string;
  hoursToday: number;
  hoursThisPayPeriod: number;
  overtimeHours: number;
  approved: boolean;
  history: TimeLog[];
}

export interface TimeClockPageProps {
  onOpenPlaceholder: (label: string, icon: string) => void;
  onTakeSnapshot?: (pageId: string, pageName: string, meta?: any) => void;
  onOpenAIAnalysis?: (pageId: string, pageName: string, customContext?: string) => void;
  onNavigateToScreen?: (screenId: string, params?: { customerId?: string; date?: string }) => void;
  activeRole: string;
  loggedInUser: any;
  isClockedIn: boolean;
  setIsClockedIn: (val: boolean) => void;
  clockInTime: string | null;
  setClockInTime: (val: string | null) => void;
  clockInDuration: number;
  setClockInDuration: React.Dispatch<React.SetStateAction<number>>;
  logOperationalEvent?: (type: string, desc: string, icon: string) => void;
  events: SchedulingEvent[];
  setEvents: React.Dispatch<React.SetStateAction<SchedulingEvent[]>>;
}

// Initial robust employee list
const INITIAL_EMPLOYEES: EmployeeClockState[] = [
  {
    id: "emp_1",
    name: "Theresa W.",
    title: "Lead Plumber",
    department: "Field",
    crew: "Crew Alpha",
    hourlyRate: 35,
    status: "Working",
    currentJobId: "evt_1",
    currentJobTitle: "AC Leak Repair & Pipe Tuning",
    currentCustomer: "Theresa Webb",
    assignedVehicle: "Sprinter Van #14",
    assignedRoute: "Route Alpha",
    hoursToday: 6.5,
    hoursThisPayPeriod: 48.5,
    overtimeHours: 6.0,
    approved: false,
    history: [
      { id: "log_1", employeeName: "Theresa W.", type: "Clock In", date: "2026-07-06", time: "08:00 AM", gps: "47.6062° N, 122.3321° W", jobId: "evt_1", jobTitle: "AC Leak Repair & Pipe Tuning", route: "Route Alpha", vehicle: "Sprinter Van #14" },
      { id: "log_2", employeeName: "Theresa W.", type: "Break Start", date: "2026-07-06", time: "12:00 PM", gps: "47.6090° N, 122.3350° W" },
      { id: "log_3", employeeName: "Theresa W.", type: "Break End", date: "2026-07-06", time: "12:30 PM", gps: "47.6090° N, 122.3350° W" }
    ]
  },
  {
    id: "emp_2",
    name: "Albert F.",
    title: "Senior HVAC Tech",
    department: "Field",
    crew: "Crew Beta",
    hourlyRate: 32,
    status: "Clocked In",
    currentJobId: "evt_2",
    currentJobTitle: "Full Heat Pump Install",
    currentCustomer: "Albert Flores",
    assignedVehicle: "Service Truck #03",
    assignedRoute: "Route Beta",
    hoursToday: 4.25,
    hoursThisPayPeriod: 42.25,
    overtimeHours: 2.5,
    approved: false,
    history: [
      { id: "log_4", employeeName: "Albert F.", type: "Clock In", date: "2026-07-06", time: "08:30 AM", gps: "47.6101° N, 122.3421° W", jobId: "evt_2", jobTitle: "Full Heat Pump Install", route: "Route Beta", vehicle: "Service Truck #03" }
    ]
  },
  {
    id: "emp_3",
    name: "Esther H.",
    title: "Lead Dispatcher",
    department: "Dispatch",
    crew: "Office Staff",
    hourlyRate: 24,
    status: "On Break",
    hoursToday: 4.0,
    hoursThisPayPeriod: 40.0,
    overtimeHours: 0.0,
    approved: true,
    history: [
      { id: "log_5", employeeName: "Esther H.", type: "Clock In", date: "2026-07-06", time: "08:00 AM", gps: "47.6062° N, 122.3321° W" },
      { id: "log_6", employeeName: "Esther H.", type: "Break Start", date: "2026-07-06", time: "11:45 AM", gps: "47.6062° N, 122.3321° W" }
    ]
  },
  {
    id: "emp_4",
    name: "James W.",
    title: "Apprentice Helper",
    department: "Field",
    crew: "Crew Alpha",
    hourlyRate: 20,
    status: "Traveling",
    currentJobId: "evt_3",
    currentJobTitle: "Emergency Pipe Burst Diagnosis",
    currentCustomer: "Esther Howard",
    assignedVehicle: "Sprinter Van #14",
    assignedRoute: "Route Alpha",
    hoursToday: 3.5,
    hoursThisPayPeriod: 38.75,
    overtimeHours: 0.0,
    approved: false,
    history: [
      { id: "log_7", employeeName: "James W.", type: "Clock In", date: "2026-07-06", time: "09:00 AM", gps: "47.6062° N, 122.3321° W", jobId: "evt_3", jobTitle: "Emergency Pipe Burst Diagnosis", route: "Route Alpha", vehicle: "Sprinter Van #14" }
    ]
  },
  {
    id: "emp_5",
    name: "Brandon M.",
    title: "Commercial Plumber",
    department: "Field",
    crew: "Crew Gamma",
    hourlyRate: 34,
    status: "Overtime",
    currentJobId: "evt_4",
    currentJobTitle: "Sewer Line Hydrojetting",
    currentCustomer: "Commercial Plaza",
    assignedVehicle: "Flatbed Truck #07",
    assignedRoute: "Route Gamma",
    hoursToday: 8.0,
    hoursThisPayPeriod: 44.0,
    overtimeHours: 4.0,
    approved: false,
    history: [
      { id: "log_8", employeeName: "Brandon M.", type: "Clock In", date: "2026-07-06", time: "07:30 AM", gps: "47.5980° N, 122.3290° W", jobId: "evt_4", jobTitle: "Sewer Line Hydrojetting", route: "Route Gamma", vehicle: "Flatbed Truck #07" }
    ]
  }
];

export const TimeClockPage: React.FC<TimeClockPageProps> = ({
  onOpenPlaceholder,
  onTakeSnapshot,
  onOpenAIAnalysis,
  onNavigateToScreen,
  activeRole,
  loggedInUser,
  isClockedIn,
  setIsClockedIn,
  clockInTime,
  setClockInTime,
  clockInDuration,
  setClockInDuration,
  logOperationalEvent,
  events,
  setEvents
}) => {
  const [employees, setEmployees] = useState<EmployeeClockState[]>(INITIAL_EMPLOYEES);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSummaryFilter, setActiveSummaryFilter] = useState<string>("All");
  
  // Advanced filters state
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [filterCrew, setFilterCrew] = useState("All");
  const [filterDepartment, setFilterDepartment] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterJob, setFilterJob] = useState("All");
  const [filterPayPeriod, setFilterPayPeriod] = useState("Current");
  
  // Selected Employee for Details Panel
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>("emp_1");
  
  // Modal states
  const [showClockInModal, setShowClockInModal] = useState(false);
  const [showManualTimeModal, setShowManualTimeModal] = useState(false);
  const [showEditTimeModal, setShowEditTimeModal] = useState(false);
  
  // Clock In fields
  const [clockInJobId, setClockInJobId] = useState("");
  const [clockInRoute, setClockInRoute] = useState("Route Alpha");
  const [clockInVehicle, setClockInVehicle] = useState("Sprinter Van #14");
  
  // Manual Time fields
  const [manualEmpId, setManualEmpId] = useState("emp_1");
  const [manualDate, setManualDate] = useState("2026-07-06");
  const [manualType, setManualType] = useState<"Clock In" | "Clock Out" | "Break Start" | "Break End">("Clock In");
  const [manualHours, setManualHours] = useState("8.0");
  const [manualTimeStr, setManualTimeStr] = useState("08:00 AM");
  const [manualJobId, setManualJobId] = useState("");
  const [manualRoute, setManualRoute] = useState("Route Alpha");
  const [manualVehicle, setManualVehicle] = useState("Sprinter Van #14");

  // Edit Time fields
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editType, setEditType] = useState<"Clock In" | "Clock Out" | "Break Start" | "Break End">("Clock In");
  const [editTimeStr, setEditTimeStr] = useState("");
  const [editDateStr, setEditDateStr] = useState("");
  const [editGpsStr, setEditGpsStr] = useState("");

  // Simulated GPS Coordinates
  const simulatedGPS = "47.6062° N, 122.3321° W (Seattle HQ)";

  // Is current user allowed to edit records? (Owner, Manager, Office, Payroll)
  const canEditAllRecords = useMemo(() => {
    const rolesWithPermission = ["Owner", "General Manager", "Office Manager", "Operations Manager", "Payroll", "Accountant / Bookkeeper", "Accountant"];
    return rolesWithPermission.includes(activeRole);
  }, [activeRole]);

  // Sync Logged-In User's state to Sarah Jenkins (or currently simulated profile)
  // We'll create or update the logged-in user in our employees array dynamically if clocked in
  useEffect(() => {
    const userName = loggedInUser?.name || "Sarah Jenkins";
    const userRole = activeRole || "Owner";
    
    setEmployees(prev => {
      // Find or create Sarah's record
      const exists = prev.find(e => e.name === userName);
      
      const newStatus = isClockedIn 
        ? (prev.find(e => e.name === userName)?.status === "On Break" ? "On Break" : "Clocked In")
        : "Off Duty";

      if (exists) {
        return prev.map(e => {
          if (e.name === userName) {
            // Update live state
            const todayHrs = isClockedIn ? parseFloat((clockInDuration / 3600).toFixed(2)) : e.hoursToday;
            return {
              ...e,
              status: newStatus as any,
              hoursToday: todayHrs,
              clockInTime: clockInTime || undefined,
            };
          }
          return e;
        });
      } else {
        // Create new
        const newRecord: EmployeeClockState = {
          id: `emp_logged_in`,
          name: userName,
          title: userRole,
          department: "Management",
          crew: "Office Staff",
          hourlyRate: 45,
          status: newStatus as any,
          hoursToday: isClockedIn ? parseFloat((clockInDuration / 3600).toFixed(2)) : 0,
          hoursThisPayPeriod: 40.0,
          overtimeHours: 0.0,
          approved: false,
          history: clockInTime ? [
            { id: "log_user_1", employeeName: userName, type: "Clock In", date: "2026-07-06", time: clockInTime, gps: simulatedGPS }
          ] : []
        };
        return [...prev, newRecord];
      }
    });
  }, [isClockedIn, clockInTime, clockInDuration, loggedInUser, activeRole]);

  // Reset Filters helper
  const handleResetFilters = () => {
    setSearchQuery("");
    setFilterCrew("All");
    setFilterDepartment("All");
    setFilterStatus("All");
    setFilterJob("All");
    setFilterPayPeriod("Current");
    setActiveSummaryFilter("All");
    if (logOperationalEvent) {
      logOperationalEvent("Filters Reset", "All time clock search queries and dropdown filters have been cleared", "🔄");
    }
  };

  // List of active jobs for dropdowns
  const activeJobs = useMemo(() => {
    return events.filter(e => e.eventType === "Job" || e.eventType === "Estimate");
  }, [events]);

  // Core filter logic
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      // Search Box matches name or title
      const matchesSearch = searchQuery === "" || 
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.title.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      // Summary Card selection filters
      if (activeSummaryFilter === "ClockedIn" && emp.status === "Off Duty") return false;
      if (activeSummaryFilter === "Working" && !["Working", "Traveling", "Clocked In", "Overtime"].includes(emp.status)) return false;
      if (activeSummaryFilter === "OnBreak" && emp.status !== "On Break") return false;
      if (activeSummaryFilter === "Overtime" && emp.overtimeHours === 0) return false;

      // Dropdown filters
      if (filterCrew !== "All" && emp.crew !== filterCrew) return false;
      if (filterDepartment !== "All" && emp.department !== filterDepartment) return false;
      if (filterStatus !== "All" && emp.status !== filterStatus) return false;
      if (filterJob !== "All") {
        if (filterJob === "Unassigned" && emp.currentJobId) return false;
        if (filterJob !== "Unassigned" && emp.currentJobId !== filterJob) return false;
      }

      return true;
    });
  }, [employees, searchQuery, activeSummaryFilter, filterCrew, filterDepartment, filterStatus, filterJob]);

  // Selected Employee object
  const selectedEmployee = useMemo(() => {
    return employees.find(e => e.id === selectedEmpId) || employees[0];
  }, [employees, selectedEmpId]);

  // Top Summary Metric Cards calculations
  const summaryMetrics = useMemo(() => {
    const clockedIn = employees.filter(e => e.status !== "Off Duty").length;
    const working = employees.filter(e => ["Working", "Traveling", "Clocked In", "Overtime"].includes(e.status)).length;
    const onBreak = employees.filter(e => e.status === "On Break").length;
    const totalHoursToday = employees.reduce((sum, e) => sum + e.hoursToday, 0);
    const overtimeHours = employees.reduce((sum, e) => sum + e.overtimeHours, 0);
    
    // Estimate payroll
    const totalPayroll = employees.reduce((sum, e) => {
      const regHrs = Math.max(0, e.hoursThisPayPeriod - e.overtimeHours);
      const regPay = regHrs * e.hourlyRate;
      const otPay = e.overtimeHours * e.hourlyRate * 1.5;
      return sum + regPay + otPay;
    }, 0);

    return {
      clockedIn,
      working,
      onBreak,
      totalHoursToday: parseFloat(totalHoursToday.toFixed(2)),
      overtimeHours: parseFloat(overtimeHours.toFixed(2)),
      totalPayroll: Math.round(totalPayroll)
    };
  }, [employees]);

  // Action: Clock In
  const handleClockIn = (jobId: string, route: string, vehicle: string) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toISOString().split('T')[0];
    
    setIsClockedIn(true);
    setClockInTime(timeStr);
    setClockInDuration(0);

    const userName = loggedInUser?.name || "Sarah Jenkins";
    const selectedJob = activeJobs.find(j => j.id === jobId);

    // Add entry to state
    setEmployees(prev => prev.map(e => {
      if (e.name === userName) {
        const newLog: TimeLog = {
          id: `log_self_${Date.now()}`,
          employeeName: userName,
          type: "Clock In",
          date: dateStr,
          time: timeStr,
          gps: simulatedGPS,
          jobId: jobId || undefined,
          jobTitle: selectedJob?.eventType ? `${selectedJob.eventType} - ${selectedJob.customer}` : undefined,
          route: route || undefined,
          vehicle: vehicle || undefined
        };
        return {
          ...e,
          status: "Clocked In",
          currentJobId: jobId || undefined,
          currentJobTitle: selectedJob?.eventType ? `${selectedJob.eventType} - ${selectedJob.customer}` : undefined,
          currentCustomer: selectedJob?.customer || undefined,
          assignedVehicle: vehicle || undefined,
          assignedRoute: route || undefined,
          history: [newLog, ...e.history]
        };
      }
      return e;
    }));

    // Update shared Event Engine (create framework action / log event)
    if (logOperationalEvent) {
      logOperationalEvent("Clocked In", `${userName} punched in to shift. Assigned: ${route}, vehicle ${vehicle}.`, "⏱️");
    }
    
    // Trigger notification
    triggerLocalNotification(`Punched in successfully at ${timeStr}`);
    setShowClockInModal(false);
  };

  // Action: Clock Out
  const handleClockOut = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toISOString().split('T')[0];
    
    const userName = loggedInUser?.name || "Sarah Jenkins";

    setEmployees(prev => prev.map(e => {
      if (e.name === userName) {
        const newLog: TimeLog = {
          id: `log_self_${Date.now()}`,
          employeeName: userName,
          type: "Clock Out",
          date: dateStr,
          time: timeStr,
          gps: simulatedGPS
        };
        // Calculate accrued hours
        const sessionHours = parseFloat((clockInDuration / 3600).toFixed(2));
        return {
          ...e,
          status: "Off Duty",
          currentJobId: undefined,
          currentJobTitle: undefined,
          currentCustomer: undefined,
          assignedVehicle: undefined,
          assignedRoute: undefined,
          hoursToday: parseFloat((e.hoursToday + sessionHours).toFixed(2)),
          hoursThisPayPeriod: parseFloat((e.hoursThisPayPeriod + sessionHours).toFixed(2)),
          history: [newLog, ...e.history]
        };
      }
      return e;
    }));

    setIsClockedIn(false);
    setClockInTime(null);
    setClockInDuration(0);

    if (logOperationalEvent) {
      logOperationalEvent("Clocked Out", `${userName} punched out of shift safely. Completed operational telemetry.`, "🚪");
    }
    triggerLocalNotification(`Punched out successfully at ${timeStr}`);
  };

  // Action: Start Break
  const handleStartBreak = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toISOString().split('T')[0];
    const userName = loggedInUser?.name || "Sarah Jenkins";

    setEmployees(prev => prev.map(e => {
      if (e.name === userName) {
        const newLog: TimeLog = {
          id: `log_self_${Date.now()}`,
          employeeName: userName,
          type: "Break Start",
          date: dateStr,
          time: timeStr,
          gps: simulatedGPS
        };
        return {
          ...e,
          status: "On Break",
          history: [newLog, ...e.history]
        };
      }
      return e;
    }));

    if (logOperationalEvent) {
      logOperationalEvent("Break Started", `${userName} started an administrative break.`, "☕");
    }
    triggerLocalNotification(`Break started at ${timeStr}`);
  };

  // Action: End Break
  const handleEndBreak = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toISOString().split('T')[0];
    const userName = loggedInUser?.name || "Sarah Jenkins";

    setEmployees(prev => prev.map(e => {
      if (e.name === userName) {
        const newLog: TimeLog = {
          id: `log_self_${Date.now()}`,
          employeeName: userName,
          type: "Break End",
          date: dateStr,
          time: timeStr,
          gps: simulatedGPS
        };
        return {
          ...e,
          status: "Clocked In",
          history: [newLog, ...e.history]
        };
      }
      return e;
    }));

    if (logOperationalEvent) {
      logOperationalEvent("Break Ended", `${userName} resumed active shift duty.`, "🛠️");
    }
    triggerLocalNotification(`Break ended at ${timeStr}`);
  };

  // Action: Add Manual Time Entry
  const handleAddManualTime = () => {
    const selectedEmp = employees.find(e => e.id === manualEmpId);
    if (!selectedEmp) return;

    const newLog: TimeLog = {
      id: `log_manual_${Date.now()}`,
      employeeName: selectedEmp.name,
      type: manualType,
      date: manualDate,
      time: manualTimeStr,
      gps: "Manual Entry (Overridden by Admin)",
      jobId: manualJobId || undefined,
      route: manualRoute || undefined,
      vehicle: manualVehicle || undefined,
      approved: true
    };

    const addedHrs = parseFloat(manualHours) || 0;

    setEmployees(prev => prev.map(e => {
      if (e.id === manualEmpId) {
        return {
          ...e,
          hoursThisPayPeriod: parseFloat((e.hoursThisPayPeriod + addedHrs).toFixed(2)),
          overtimeHours: addedHrs > 8 ? parseFloat((e.overtimeHours + (addedHrs - 8)).toFixed(2)) : e.overtimeHours,
          history: [newLog, ...e.history]
        };
      }
      return e;
    }));

    if (logOperationalEvent) {
      logOperationalEvent("Manual Time Inserted", `Admin manually posted ${addedHrs} hours to ${selectedEmp.name}'s time ledger.`, "📝");
    }
    triggerLocalNotification(`Manually added ${addedHrs} hours to ${selectedEmp.name}`);
    setShowManualTimeModal(false);
  };

  // Action: Approve Employee Time
  const handleApproveEmployeeTime = (empId: string) => {
    setEmployees(prev => prev.map(e => {
      if (e.id === empId) {
        return {
          ...e,
          approved: true,
          history: e.history.map(h => ({ ...h, approved: true }))
        };
      }
      return e;
    }));

    const targetEmp = employees.find(e => e.id === empId);
    if (logOperationalEvent && targetEmp) {
      logOperationalEvent("Time Card Approved", `Time logs for ${targetEmp.name} have been fully approved for current pay period.`, "✅");
    }
    triggerLocalNotification(`Timecard approved for ${targetEmp?.name}`);
  };

  // Action: Edit Time History Entry
  const handleEditTimeEntry = () => {
    if (!editingLogId) return;

    setEmployees(prev => prev.map(e => {
      const logExists = e.history.find(h => h.id === editingLogId);
      if (logExists) {
        return {
          ...e,
          history: e.history.map(h => {
            if (h.id === editingLogId) {
              return {
                ...h,
                type: editType,
                time: editTimeStr,
                date: editDateStr,
                gps: editGpsStr
              };
            }
            return h;
          })
        };
      }
      return e;
    }));

    if (logOperationalEvent) {
      logOperationalEvent("Time Entry Overwritten", `Time entry log ID ${editingLogId} was successfully modified by administrator.`, "🔧");
    }
    triggerLocalNotification("Time record modified successfully");
    setShowEditTimeModal(false);
    setEditingLogId(null);
  };

  const triggerLocalNotification = (text: string) => {
    const alertBox = document.createElement("div");
    alertBox.className = "fixed bottom-5 right-5 bg-slate-900 text-white font-sans text-xs font-bold px-4 py-3 rounded-xl border border-slate-700 shadow-2xl z-[9999] transition-all duration-300 transform translate-y-0 opacity-100 flex items-center gap-2 animate-fade-in";
    alertBox.innerHTML = `<span>🔔</span> <span>${text}</span>`;
    document.body.appendChild(alertBox);
    setTimeout(() => {
      alertBox.style.opacity = "0";
      setTimeout(() => alertBox.remove(), 300);
    }, 3000);
  };

  return (
    <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm space-y-6 animate-fade-in text-left">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-[#A9CDEE] pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[#E3F3FF] text-[#4A9BFF] rounded-xl border border-[#A9CDEE]">
              <Clock className="w-5 h-5" />
            </span>
            <h2 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">Corporate Time Clock Dashboard</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-sans font-semibold">
            Track shifts, breaks, and payroll live syncing across all terminal nodes.
          </p>
        </div>
        
        {/* Connection status tag */}
        <span className="px-3 py-1.5 bg-emerald-50 text-emerald-600 text-[10px] font-mono font-bold rounded-xl border border-emerald-200 uppercase tracking-wider flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          Event Sync Connected
        </span>
      </div>

      {/* TOP ACTION CONTROL BAR */}
      <div className="bg-[#E3F3FF] p-4.5 rounded-2xl border border-[#A9CDEE] space-y-3.5 shadow-xs">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          
          {/* Punch Actions */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {!isClockedIn ? (
              <button
                onClick={() => {
                  setClockInJobId("");
                  setShowClockInModal(true);
                }}
                className="px-4.5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle className="w-4 h-4" />
                Clock In
              </button>
            ) : (
              <button
                onClick={handleClockOut}
                className="px-4.5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <X className="w-4 h-4" />
                Clock Out
              </button>
            )}

            <button
              onClick={handleStartBreak}
              disabled={!isClockedIn || selectedEmployee.status === "On Break"}
              className={`px-4 py-2.5 rounded-xl text-xs uppercase font-extrabold tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${
                isClockedIn && selectedEmployee.status !== "On Break"
                  ? "bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] border border-[#9EC8EF]"
                  : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60"
              }`}
            >
              Break Start
            </button>

            <button
              onClick={handleEndBreak}
              disabled={!isClockedIn || selectedEmployee.status !== "On Break"}
              className={`px-4 py-2.5 rounded-xl text-xs uppercase font-extrabold tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${
                isClockedIn && selectedEmployee.status === "On Break"
                  ? "bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] border border-[#9EC8EF]"
                  : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60"
              }`}
            >
              Break End
            </button>

            <button
              onClick={() => {
                setShowFiltersPanel(!showFiltersPanel);
              }}
              className={`px-4 py-2.5 border rounded-xl text-xs uppercase font-extrabold tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${
                showFiltersPanel || filterCrew !== "All" || filterDepartment !== "All" || filterStatus !== "All" || filterJob !== "All"
                  ? "bg-[#315C9F] text-white border-[#315C9F]"
                  : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
            </button>

            <button
              onClick={handleResetFilters}
              className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-extrabold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
              title="Refresh time logs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          {/* Quick Search Box */}
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employee name/title..."
              className="w-full text-xs bg-white border border-slate-200 rounded-xl pl-9.5 pr-4 py-2.5 focus:outline-none focus:border-[#4A9BFF] font-medium text-slate-700"
            />
          </div>

        </div>

        {/* ADVANCED FILTER PANEL */}
        {showFiltersPanel && (
          <div className="bg-white border border-slate-200 p-4 rounded-xl mt-3 grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-in">
            <div className="space-y-1">
              <label className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">Crew Branch</label>
              <select
                value={filterCrew}
                onChange={(e) => setFilterCrew(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-[#4A9BFF] font-medium text-slate-700"
              >
                <option value="All">All Crews</option>
                <option value="Crew Alpha">Crew Alpha</option>
                <option value="Crew Beta">Crew Beta</option>
                <option value="Crew Gamma">Crew Gamma</option>
                <option value="Office Staff">Office Staff</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">Department</label>
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-[#4A9BFF] font-medium text-slate-700"
              >
                <option value="All">All Departments</option>
                <option value="Field">Field Operations</option>
                <option value="Dispatch">Dispatch Crew</option>
                <option value="Office">Office Admin</option>
                <option value="Management">Management</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">Current Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-[#4A9BFF] font-medium text-slate-700"
              >
                <option value="All">All Statuses</option>
                <option value="Off Duty">Off Duty</option>
                <option value="Clocked In">Clocked In</option>
                <option value="On Break">On Break</option>
                <option value="Traveling">Traveling</option>
                <option value="Working">Working</option>
                <option value="Overtime">Overtime</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">Assigned Job</label>
              <select
                value={filterJob}
                onChange={(e) => setFilterJob(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:border-[#4A9BFF] font-medium text-slate-700"
              >
                <option value="All">All Jobs</option>
                <option value="Unassigned">Unassigned / Admin</option>
                {activeJobs.map(j => (
                  <option key={j.id} value={j.id}>{j.eventType} - {j.customer}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* SUMMARY STATS METRIC CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3.5">
        {[
          { key: "ClockedIn", label: "Clocked In", value: summaryMetrics.clockedIn, sub: "Active shift", color: "text-[#315C9F] border-blue-200 bg-blue-50/50" },
          { key: "Working", label: "Working", value: summaryMetrics.working, sub: "Field & dispatch", color: "text-emerald-700 border-emerald-200 bg-emerald-50/40" },
          { key: "OnBreak", label: "On Break", value: summaryMetrics.onBreak, sub: "Rest periods", color: "text-amber-700 border-amber-200 bg-amber-50/40" },
          { key: "TotalHours", label: "Labor Hours Today", value: `${summaryMetrics.totalHoursToday} hrs`, sub: "Accrued shift total", color: "text-slate-800 border-slate-200 bg-slate-50/50" },
          { key: "Payroll", label: "Payroll Projected", value: `$${summaryMetrics.totalPayroll.toLocaleString()}`, sub: "This period gross", color: "text-purple-700 border-purple-200 bg-purple-50/40" },
          { key: "Overtime", label: "Overtime Hours", value: `${summaryMetrics.overtimeHours} hrs`, sub: "1.5x Premium rate", color: "text-rose-700 border-rose-200 bg-rose-50/40" }
        ].map((card) => {
          const isSelected = activeSummaryFilter === card.key;
          return (
            <div
              key={card.key}
              onClick={() => {
                if (card.key === "TotalHours" || card.key === "Payroll") return; // static metrics
                setActiveSummaryFilter(prev => prev === card.key ? "All" : card.key);
              }}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-left space-y-1 hover:scale-[1.02] shadow-xs ${card.color} ${
                isSelected ? "ring-2 ring-blue-500 ring-offset-2 scale-[1.02]" : ""
              }`}
            >
              <p className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 font-sans leading-none">{card.label}</p>
              <p className="text-lg font-black font-mono tracking-tight leading-none mt-1">{card.value}</p>
              <p className="text-[9.5px] font-sans font-bold text-slate-500 leading-none">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* TEAM STATUS ROW (LIVE INDICATORS) */}
      <div className="bg-[#E3F3FF] p-4 rounded-2xl border border-[#A9CDEE]">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-[#342D7E] mb-3 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-[#4A9BFF] animate-pulse" /> Live Operational Team Status
        </h4>
        <div className="flex flex-wrap gap-2.5">
          {employees.map((emp) => {
            const statusColors: Record<string, string> = {
              "Off Duty": "bg-slate-100 text-slate-600 border-slate-200",
              "Clocked In": "bg-blue-100 text-[#315C9F] border-[#9EC8EF]",
              "On Break": "bg-amber-100 text-amber-700 border-amber-200",
              "Traveling": "bg-teal-50 text-teal-700 border-teal-200 animate-pulse",
              "Working": "bg-emerald-100 text-emerald-800 border-emerald-200",
              "Overtime": "bg-rose-100 text-rose-700 border-rose-200",
              "Clocked Out": "bg-slate-100 text-slate-400 border-slate-200"
            };

            return (
              <div
                key={emp.id}
                onClick={() => setSelectedEmpId(emp.id)}
                className={`px-3 py-2 rounded-xl border flex items-center gap-2 cursor-pointer transition-all hover:translate-y-[-1px] shadow-xs bg-white ${
                  selectedEmpId === emp.id ? "ring-2 ring-blue-400" : ""
                }`}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300 relative">
                  <span className={`absolute inset-0 rounded-full ${
                    emp.status === "Off Duty" ? "bg-slate-400" :
                    emp.status === "On Break" ? "bg-amber-500" :
                    emp.status === "Traveling" ? "bg-teal-500 animate-ping" :
                    emp.status === "Working" ? "bg-emerald-500" :
                    emp.status === "Overtime" ? "bg-rose-500 animate-pulse" : "bg-blue-500"
                  }`} />
                </div>
                <div className="text-left">
                  <p className="text-xs font-black text-slate-800 font-sans leading-tight">{emp.name}</p>
                  <p className={`text-[9px] font-bold tracking-wider uppercase ${statusColors[emp.status] || "text-slate-500"}`}>
                    {emp.status}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CORE TWO-COLUMN GRID (EMPLOYEE LIST VS SELECTED DETAILS) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        
        {/* EMPLOYEE LIST TABLE (7 cols) */}
        <div className="xl:col-span-7 bg-white rounded-2xl border border-[#A9CDEE] overflow-hidden shadow-sm">
          <div className="bg-[#E3F3FF]/50 px-4 py-3.5 border-b border-[#A9CDEE] flex items-center justify-between">
            <h3 className="text-xs font-black uppercase text-[#342D7E] tracking-wider font-sans">
              Active Shift Ledger ({filteredEmployees.length} listed)
            </h3>
            {activeSummaryFilter !== "All" && (
              <button
                onClick={() => setActiveSummaryFilter("All")}
                className="text-[9.5px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-all uppercase"
              >
                Clear Card Filter
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Employee / Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Hours Today</th>
                  <th className="px-4 py-3 text-right">Period Hours</th>
                  <th className="px-4 py-3 text-right">Overtime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-400 font-medium">
                      No employees match current filters or search term.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => {
                    const isSelected = selectedEmpId === emp.id;
                    const statusStyles: Record<string, string> = {
                      "Off Duty": "bg-slate-100 text-slate-500",
                      "Clocked In": "bg-blue-100 text-blue-700 font-bold",
                      "On Break": "bg-amber-100 text-amber-800",
                      "Traveling": "bg-teal-100 text-teal-800",
                      "Working": "bg-emerald-100 text-emerald-800 font-semibold",
                      "Overtime": "bg-rose-100 text-rose-800 font-bold"
                    };

                    return (
                      <tr
                        key={emp.id}
                        onClick={() => setSelectedEmpId(emp.id)}
                        className={`hover:bg-[#E3F3FF]/40 transition-colors cursor-pointer ${
                          isSelected ? "bg-[#E3F3FF] font-medium" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-50 text-[#315C9F] border border-blue-200 text-xs font-black flex items-center justify-center shadow-xs">
                              {emp.name.split(" ").map(n => n[0]).join("")}
                            </div>
                            <div>
                              <p className="font-extrabold text-slate-800 font-sans">{emp.name}</p>
                              <p className="text-[10px] text-slate-400 font-medium">{emp.title}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-lg text-[9.5px] uppercase tracking-wider font-extrabold ${statusStyles[emp.status] || "bg-slate-100"}`}>
                            {emp.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 font-bold">
                          {emp.hoursToday.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 font-bold">
                          {emp.hoursThisPayPeriod.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {emp.overtimeHours > 0 ? (
                            <span className="text-rose-600 font-black">+{emp.overtimeHours.toFixed(2)}</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* EMPLOYEE DETAILS PANEL (5 cols) */}
        <div className="xl:col-span-5 bg-white rounded-2xl border border-[#A9CDEE] shadow-sm overflow-hidden flex flex-col">
          <div className="bg-[#E3F3FF]/50 px-4 py-3.5 border-b border-[#A9CDEE] flex items-center justify-between">
            <h3 className="text-xs font-black uppercase text-[#342D7E] tracking-wider font-sans">
              Employee Ledger Details
            </h3>
            {selectedEmployee.approved ? (
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded text-[9px] font-mono font-bold uppercase">
                Approved
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 rounded text-[9px] font-mono font-bold uppercase">
                Pending Approval
              </span>
            )}
          </div>

          <div className="p-5 space-y-5 text-left">
            
            {/* Primary Info Header */}
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-base font-sans font-black text-slate-800 leading-tight">
                  {selectedEmployee.name}
                </h4>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  {selectedEmployee.title} • {selectedEmployee.crew}
                </p>
                <p className="text-[10px] text-slate-400 font-mono mt-1">
                  Rate: ${selectedEmployee.hourlyRate}/hr regular • ${selectedEmployee.hourlyRate * 1.5}/hr Overtime
                </p>
              </div>
              
              <span className="px-3 py-1 bg-[#F3F4F6] text-slate-700 text-xs font-bold rounded-lg border border-slate-200 uppercase tracking-wider">
                {selectedEmployee.department}
              </span>
            </div>

            {/* Current Work State details */}
            {selectedEmployee.status !== "Off Duty" && (
              <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3 space-y-1.5">
                <p className="text-[9px] font-black uppercase text-[#315C9F] tracking-wider">Active Assignment Duty</p>
                <div className="text-xs font-sans text-slate-700 space-y-1">
                  <p className="font-extrabold flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5 text-[#4A9BFF]" />
                    Job: {selectedEmployee.currentJobTitle || "General Corporate Admin"}
                  </p>
                  {selectedEmployee.currentCustomer && (
                    <p className="text-slate-500 text-[11px] font-semibold">
                      Customer: {selectedEmployee.currentCustomer}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500 pt-1 border-t border-blue-200/40">
                    {selectedEmployee.assignedVehicle && (
                      <span className="flex items-center gap-0.5"><Truck className="w-3 h-3" /> {selectedEmployee.assignedVehicle}</span>
                    )}
                    {selectedEmployee.assignedRoute && (
                      <span className="flex items-center gap-0.5"><Navigation className="w-3 h-3" /> {selectedEmployee.assignedRoute}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Accrued Labor Hours Card */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#F9FAFB] border border-slate-100 rounded-xl p-2.5 text-center">
                <p className="text-[8.5px] font-black text-slate-400 uppercase">Today</p>
                <p className="text-sm font-black font-mono text-slate-700 mt-1">{selectedEmployee.hoursToday.toFixed(2)}</p>
                <p className="text-[8px] text-slate-400">hours</p>
              </div>
              <div className="bg-[#F9FAFB] border border-slate-100 rounded-xl p-2.5 text-center">
                <p className="text-[8.5px] font-black text-slate-400 uppercase">Weekly</p>
                <p className="text-sm font-black font-mono text-slate-700 mt-1">{(selectedEmployee.hoursThisPayPeriod * 0.9).toFixed(2)}</p>
                <p className="text-[8px] text-slate-400">hours est.</p>
              </div>
              <div className="bg-[#F9FAFB] border border-slate-100 rounded-xl p-2.5 text-center">
                <p className="text-[8.5px] font-black text-slate-400 uppercase">Pay Period</p>
                <p className="text-sm font-black font-mono text-slate-700 mt-1">{selectedEmployee.hoursThisPayPeriod.toFixed(2)}</p>
                <p className="text-[8px] text-slate-400">total hours</p>
              </div>
            </div>

            {/* Payroll calculation values */}
            <div className="bg-[#F9FAFB] border border-slate-200 rounded-xl p-3.5 space-y-2">
              <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Period Payroll Estimate</h5>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between font-semibold text-slate-600">
                  <span>Regular (Max 40 hrs):</span>
                  <span className="font-mono">${Math.min(40, selectedEmployee.hoursThisPayPeriod - selectedEmployee.overtimeHours) * selectedEmployee.hourlyRate}</span>
                </div>
                {selectedEmployee.overtimeHours > 0 && (
                  <div className="flex justify-between font-semibold text-rose-600">
                    <span>Overtime Premium (1.5x):</span>
                    <span className="font-mono">+${selectedEmployee.overtimeHours * selectedEmployee.hourlyRate * 1.5}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-slate-800 border-t border-slate-200 pt-1.5 text-sm">
                  <span>Gross Pay:</span>
                  <span className="font-mono text-emerald-600">
                    ${(
                      Math.min(40, selectedEmployee.hoursThisPayPeriod - selectedEmployee.overtimeHours) * selectedEmployee.hourlyRate +
                      selectedEmployee.overtimeHours * selectedEmployee.hourlyRate * 1.5
                    ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* History logs & break histories */}
            <div className="space-y-2">
              <h5 className="text-[10px] font-black text-[#342D7E] uppercase tracking-wider">Punch Log History</h5>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {selectedEmployee.history.length === 0 ? (
                  <p className="text-xs text-slate-400 font-semibold italic text-center py-4">No logged history for current pay period.</p>
                ) : (
                  selectedEmployee.history.map((log) => (
                    <div key={log.id} className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex justify-between items-start text-xs transition-colors">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            log.type === "Clock In" ? "bg-emerald-500" :
                            log.type === "Clock Out" ? "bg-rose-500" : "bg-amber-500"
                          }`} />
                          <p className="font-extrabold text-slate-800">{log.type}</p>
                        </div>
                        {log.jobTitle && (
                          <p className="text-[10.5px] text-slate-500 font-semibold leading-tight">{log.jobTitle}</p>
                        )}
                        <p className="text-[9.5px] text-slate-400 font-semibold font-mono flex items-center gap-0.5">
                          <MapPin className="w-2.5 h-2.5" /> {log.gps}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-slate-600">{log.time}</p>
                        <p className="text-[9px] text-slate-400 font-semibold">{log.date}</p>
                        
                        {canEditAllRecords && (
                          <button
                            onClick={() => {
                              setEditingLogId(log.id);
                              setEditType(log.type);
                              setEditTimeStr(log.time);
                              setEditDateStr(log.date);
                              setEditGpsStr(log.gps);
                              setShowEditTimeModal(true);
                            }}
                            className="text-[9.5px] font-black text-blue-500 hover:underline mt-1 inline-block uppercase"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* BUTTON BAR */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
              <button
                onClick={() => onNavigateToScreen ? onNavigateToScreen("roster") : onOpenPlaceholder("Corporate Roster Database", "📋")}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-lg text-[10px] uppercase tracking-wider cursor-pointer flex items-center gap-1"
                title="Navigate to Roster page"
              >
                <User className="w-3.5 h-3.5" />
                View Employee
              </button>

              <button
                onClick={() => onNavigateToScreen ? onNavigateToScreen("jobs") : onOpenPlaceholder("Active Operational Jobs Ledger", "💼")}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-lg text-[10px] uppercase tracking-wider cursor-pointer flex items-center gap-1"
                title="Navigate to Jobs placeholder"
              >
                <Briefcase className="w-3.5 h-3.5" />
                View Job
              </button>

              <button
                onClick={() => onNavigateToScreen ? onNavigateToScreen("routes") : onOpenPlaceholder("Live Dispatch Map Routing", "🗺️")}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-lg text-[10px] uppercase tracking-wider cursor-pointer flex items-center gap-1"
                title="Navigate to Routes placeholder"
              >
                <Navigation className="w-3.5 h-3.5" />
                View Route
              </button>

              <button
                onClick={() => onNavigateToScreen ? onNavigateToScreen("scheduling") : onOpenPlaceholder("Calendar Shift Dispatcher", "📅")}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-lg text-[10px] uppercase tracking-wider cursor-pointer flex items-center gap-1"
                title="Navigate to Scheduling Calendar"
              >
                <Calendar className="w-3.5 h-3.5" />
                View Schedule
              </button>

              {canEditAllRecords && (
                <>
                  <button
                    onClick={() => {
                      setManualEmpId(selectedEmployee.id);
                      setShowManualTimeModal(true);
                    }}
                    className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-extrabold rounded-lg text-[10px] uppercase tracking-wider cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Manual Time
                  </button>

                  <button
                    onClick={() => handleApproveEmployeeTime(selectedEmployee.id)}
                    disabled={selectedEmployee.approved}
                    className={`px-3 py-2 font-extrabold rounded-lg text-[10px] uppercase tracking-wider flex items-center gap-1 ${
                      selectedEmployee.approved
                        ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    {selectedEmployee.approved ? "Approved" : "Approve Time"}
                  </button>
                </>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* PAYROLL REPORT ARCHIVE GRID & HISTORY */}
      <div className="bg-white rounded-2xl border border-[#A9CDEE] p-5 space-y-4">
        <div>
          <h4 className="text-xs font-black uppercase text-[#342D7E] tracking-wider font-sans">
            Historical Payroll & Timecard Ledger
          </h4>
          <p className="text-[11px] text-slate-400 font-semibold font-sans mt-0.5">
            Audit logs matching company-wide active tax projections. Search for any technician to reveal pay historicals.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#F5FAFF] border border-[#A9CDEE]/50 p-4 rounded-xl text-xs">
          <div className="space-y-0.5">
            <span className="text-[9px] font-black text-slate-400 uppercase">Regular Shift Hours</span>
            <p className="text-base font-mono font-black text-slate-800">
              {employees.reduce((sum, e) => sum + Math.min(40, e.hoursThisPayPeriod - e.overtimeHours), 0).toFixed(2)} hrs
            </p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[9px] font-black text-slate-400 uppercase">Premium Overtime Hours</span>
            <p className="text-base font-mono font-black text-rose-600">
              {employees.reduce((sum, e) => sum + e.overtimeHours, 0).toFixed(2)} hrs
            </p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[9px] font-black text-slate-400 uppercase">Estimated Period Gross Payroll</span>
            <p className="text-base font-mono font-black text-emerald-600">
              ${employees.reduce((sum, e) => {
                const reg = Math.min(40, e.hoursThisPayPeriod - e.overtimeHours);
                return sum + (reg * e.hourlyRate) + (e.overtimeHours * e.hourlyRate * 1.5);
              }, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[9px] font-black text-slate-400 uppercase">Audit Status</span>
            <span className="px-2.5 py-1 bg-blue-100 text-[#315C9F] border border-[#9EC8EF] text-[10px] font-mono font-bold rounded-lg uppercase tracking-wider block w-fit mt-1">
              Active Pay Period
            </span>
          </div>
        </div>

        {/* Quick link to Roster */}
        <div className="flex items-center justify-between bg-amber-50/50 border border-amber-100 p-3 rounded-xl text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <Info className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Need to change employee profile rates, job roles, or authorization codes?</span>
          </div>
          <button
            onClick={() => onNavigateToScreen ? onNavigateToScreen("roster") : onOpenPlaceholder("Corporate Roster Database", "📋")}
            className="px-3.5 py-1.5 bg-white hover:bg-amber-100/50 text-slate-700 border border-slate-200 rounded-lg text-[10.5px] font-extrabold uppercase tracking-wider cursor-pointer flex items-center gap-1 transition-all"
          >
            Go to Corporate Roster
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* CLOCK IN MODAL */}
      {showClockInModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[9999] animate-fade-in p-4">
          <div className="bg-[#C7E3FB] max-w-md w-full rounded-3xl p-6 border border-[#A9CDEE] shadow-2xl space-y-4 text-left">
            <div className="flex justify-between items-center border-b border-[#A9CDEE] pb-3">
              <h4 className="text-sm font-black uppercase text-[#342D7E] tracking-wider font-sans">
                Active Terminal Clock In
              </h4>
              <button onClick={() => setShowClockInModal(false)} className="text-slate-500 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              
              {/* Job selection */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Assigned Job Duty</label>
                <select
                  value={clockInJobId}
                  onChange={(e) => setClockInJobId(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#4A9BFF] font-medium text-slate-700"
                >
                  <option value="">General Office / No Specific Job</option>
                  {activeJobs.map(j => (
                    <option key={j.id} value={j.id}>{j.eventType} for {j.customer} ({j.startTime} - {j.date})</option>
                  ))}
                </select>
              </div>

              {/* Route selection */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Assigned Dispatch Route</label>
                <select
                  value={clockInRoute}
                  onChange={(e) => setClockInRoute(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#4A9BFF] font-medium text-slate-700"
                >
                  <option value="Route Alpha">Route Alpha (Seattle Downtown)</option>
                  <option value="Route Beta">Route Beta (Bellevue East)</option>
                  <option value="Route Gamma">Route Gamma (Tacoma South)</option>
                  <option value="Route Delta">Route Delta (Everett North)</option>
                  <option value="None">None / Office Only</option>
                </select>
              </div>

              {/* Vehicle selection */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Assigned Service Vehicle</label>
                <select
                  value={clockInVehicle}
                  onChange={(e) => setClockInVehicle(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-[#4A9BFF] font-medium text-slate-700"
                >
                  <option value="Sprinter Van #14">Sprinter Van #14</option>
                  <option value="Service Truck #03">Service Truck #03</option>
                  <option value="Flatbed Truck #07">Flatbed Truck #07</option>
                  <option value="Transit Van #09">Transit Van #09</option>
                  <option value="None">No Corporate Vehicle (Personal)</option>
                </select>
              </div>

              {/* Simulated GPS Indicator */}
              <div className="p-3 bg-[#E3F3FF] rounded-xl border border-[#A9CDEE] text-[10.5px] leading-tight space-y-1">
                <p className="font-bold text-slate-700 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#4A9BFF]" />
                  Geofenced Location Verification
                </p>
                <p className="text-slate-500 font-medium">GPS Signal: {simulatedGPS}</p>
              </div>

            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowClockInModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold rounded-xl text-xs uppercase"
              >
                Cancel
              </button>
              <button
                onClick={() => handleClockIn(clockInJobId, clockInRoute, clockInVehicle)}
                className="px-4.5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold rounded-xl text-xs uppercase shadow-xs cursor-pointer"
              >
                Confirm Clock In
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD MANUAL TIME MODAL */}
      {showManualTimeModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[9999] animate-fade-in p-4">
          <div className="bg-[#C7E3FB] max-w-md w-full rounded-3xl p-6 border border-[#A9CDEE] shadow-2xl space-y-4 text-left">
            <div className="flex justify-between items-center border-b border-[#A9CDEE] pb-3">
              <h4 className="text-sm font-black uppercase text-[#342D7E] tracking-wider font-sans">
                Insert Administrative Manual Time Record
              </h4>
              <button onClick={() => setShowManualTimeModal(false)} className="text-slate-500 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Select Employee</label>
                <select
                  value={manualEmpId}
                  onChange={(e) => setManualEmpId(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none font-medium text-slate-700"
                >
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name} ({e.title})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Punch Date</label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full p-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none font-medium text-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Punch Time (e.g. 08:30 AM)</label>
                  <input
                    type="text"
                    value={manualTimeStr}
                    onChange={(e) => setManualTimeStr(e.target.value)}
                    placeholder="08:00 AM"
                    className="w-full p-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none font-medium text-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Action Type</label>
                  <select
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value as any)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl focus:outline-none font-medium text-slate-700"
                  >
                    <option value="Clock In">Clock In</option>
                    <option value="Clock Out">Clock Out</option>
                    <option value="Break Start">Break Start</option>
                    <option value="Break End">Break End</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Accrued Hours Today</label>
                  <input
                    type="number"
                    step="0.25"
                    value={manualHours}
                    onChange={(e) => setManualHours(e.target.value)}
                    className="w-full p-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none font-medium text-slate-700"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Link to Job Event</label>
                <select
                  value={manualJobId}
                  onChange={(e) => setManualJobId(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none font-medium text-slate-700"
                >
                  <option value="">No Job Linkage</option>
                  {activeJobs.map(j => (
                    <option key={j.id} value={j.id}>{j.eventType} for {j.customer}</option>
                  ))}
                </select>
              </div>

            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowManualTimeModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold rounded-xl text-xs uppercase"
              >
                Cancel
              </button>
              <button
                onClick={handleAddManualTime}
                className="px-4.5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold rounded-xl text-xs uppercase shadow-xs cursor-pointer"
              >
                Confirm Insert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TIME RECORD MODAL */}
      {showEditTimeModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[9999] animate-fade-in p-4">
          <div className="bg-[#C7E3FB] max-w-md w-full rounded-3xl p-6 border border-[#A9CDEE] shadow-2xl space-y-4 text-left">
            <div className="flex justify-between items-center border-b border-[#A9CDEE] pb-3">
              <h4 className="text-sm font-black uppercase text-[#342D7E] tracking-wider font-sans">
                Override Extant Punch Log Record
              </h4>
              <button onClick={() => setShowEditTimeModal(false)} className="text-slate-500 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Punch Type Action</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as any)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none font-medium text-slate-700"
                >
                  <option value="Clock In">Clock In</option>
                  <option value="Clock Out">Clock Out</option>
                  <option value="Break Start">Break Start</option>
                  <option value="Break End">Break End</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Date</label>
                  <input
                    type="text"
                    value={editDateStr}
                    onChange={(e) => setEditDateStr(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl focus:outline-none font-mono text-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Time</label>
                  <input
                    type="text"
                    value={editTimeStr}
                    onChange={(e) => setEditTimeStr(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl focus:outline-none font-mono text-slate-700"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Override GPS Location Coordinates</label>
                <input
                  type="text"
                  value={editGpsStr}
                  onChange={(e) => setEditGpsStr(e.target.value)}
                  className="w-full p-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none font-medium text-slate-700"
                />
              </div>

            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowEditTimeModal(false);
                  setEditingLogId(null);
                }}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold rounded-xl text-xs uppercase"
              >
                Cancel
              </button>
              <button
                onClick={handleEditTimeEntry}
                className="px-4.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl text-xs uppercase shadow-xs cursor-pointer"
              >
                Save Log Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FRAMEWORK CONNECTIONS (As required by the guideline exactly) */}
      <div className="bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl p-4 text-left">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-[#342D7E] mb-2">
          LeadForgeOS Framework Connections
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] font-sans">
          <div>
            <p className="font-extrabold text-[#315C9F] uppercase text-[9px] mb-1">CONNECTED</p>
            <div className="grid grid-cols-2 gap-1 font-semibold text-slate-600">
              <span className="flex items-center gap-1 text-emerald-600">✓ Dashboard</span>
              <span className="flex items-center gap-1 text-emerald-600">✓ Revenue</span>
              <span className="flex items-center gap-1 text-emerald-600">✓ Scheduling</span>
              <span className="flex items-center gap-1 text-emerald-600">✓ Dispatch</span>
              <span className="flex items-center gap-1 text-emerald-600">✓ Routes</span>
              <span className="flex items-center gap-1 text-emerald-600">✓ Jobs</span>
              <span className="flex items-center gap-1 text-emerald-600">✓ Inventory</span>
              <span className="flex items-center gap-1 text-emerald-600">✓ Documents</span>
              <span className="flex items-center gap-1 text-emerald-600">✓ Messages</span>
            </div>
          </div>
          <div>
            <p className="font-extrabold text-[#315C9F] uppercase text-[9px] mb-1">READY TO CONNECT</p>
            <div className="grid grid-cols-2 gap-1 font-semibold text-slate-400">
              <span className="flex items-center gap-1 text-slate-600 font-bold">✓ Roster (Active)</span>
              <span className="flex items-center gap-1">□ AI Assistant</span>
              <span className="flex items-center gap-1">□ Notifications</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
