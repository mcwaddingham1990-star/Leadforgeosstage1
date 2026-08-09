import React, { useState, useMemo, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { useAuth } from "../context/AuthContext";
import { MODULE_CATALOG } from "./RolePermissionEditorModal";
import { defaultGranularFromModuleList, GranularPermissions, getPermissionFlags, PermissionAction } from "../types/permissions";
import { Search, UserPlus, Edit3, X, Copy, Shield, Phone, Mail, MapPin } from "lucide-react";
import type { EmployeeRecord } from "../types/domain";

function genInviteCode(role: string): string {
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const cleanRolePrefix = role.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8) || "STAFF";
  return `${cleanRolePrefix}-${randomStr}`;
}

type InviteRole = { id: string; name: string; permissions: string[]; modulePermissions: GranularPermissions; isCustom?: boolean };

const ONBOARDING_ROLE_TEMPLATES: Array<[string, string, string[]]> = [
  ["owner", "Owner", MODULE_CATALOG.map(m => m.id)],
  ["general_manager", "General Manager", ["customers","leads","estimates","jobs","scheduling","dispatch","routes","inventory","documents","messages","timeclock","ai_assistant","settings"]],
  ["office_manager", "Office Manager", ["customers","leads","estimates","invoices","scheduling","documents","pdf_editor","esign","messages","reports","settings"]],
  ["operations_manager", "Operations Manager", ["scheduling","dispatch","routes","jobs","inventory","documents","messages"]],
  ["dispatcher", "Dispatcher", ["dispatch","routes","scheduling","jobs","customers"]],
  ["scheduler", "Scheduler", ["scheduling","customers","jobs","messages"]],
  ["sales_manager", "Sales Manager", ["customers","leads","estimates","messages","ai_assistant"]],
  ["sales_representative", "Sales Representative", ["customers","leads","estimates","messages","ai_assistant"]],
  ["estimator", "Estimator", ["customers","leads","estimates","documents","pdf_editor","esign"]],
  ["project_manager", "Project Manager", ["customers","scheduling","dispatch","routes","jobs","inventory","documents","messages"]],
  ["field_supervisor", "Field Supervisor", ["jobs","scheduling","dispatch","routes","inventory","documents","messages"]],
  ["technician", "Technician", ["jobs","timeclock","messages","documents"]],
  ["apprentice", "Apprentice", ["jobs","timeclock","messages"]],
  ["installer", "Installer", ["jobs","timeclock","inventory","documents","messages"]],
  ["driver", "Driver", ["routes","jobs","timeclock","messages"]],
  ["warehouse_manager", "Warehouse / Inventory Manager", ["inventory","documents","messages"]],
  ["purchasing_manager", "Purchasing Manager", ["inventory","documents"]],
  ["customer_service", "Customer Service Representative", ["customers","leads","scheduling","messages"]],
  ["marketing_manager", "Marketing Manager", ["customers","leads","marketing","ai_assistant"]],
  ["accountant", "Accountant / Bookkeeper", ["customers","estimates","invoices","accounting","reports"]],
  ["hr_manager", "HR Manager", ["documents","timeclock"]],
  ["safety_manager", "Safety Manager", ["jobs","documents"]],
  ["it_administrator", "IT Administrator", MODULE_CATALOG.map(m => m.id)]
];

const DEFAULT_INVITE_ROLES: InviteRole[] = ONBOARDING_ROLE_TEMPLATES.map(([id, name, permissions]) => ({
  id, name, permissions, modulePermissions: defaultGranularFromModuleList(permissions, id === "owner" ? "delete" : "edit")
}));

import { StructuredAddressFields } from "./StructuredAddressFields";

export const RosterPage: React.FC = () => {
  const { employees, setEmployees, timeClockLogs } = useDomainData();
  const { triggerNotification, logOperationalEvent } = useNavTelemetry();
  const { loggedInUser, businessId } = useAuth();

  const [search, setSearch] = useState("");
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRecord | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<InviteRole[]>(DEFAULT_INVITE_ROLES);
  const [inviteRoleId, setInviteRoleId] = useState("technician");
  const [invitePermissions, setInvitePermissions] = useState<GranularPermissions>(DEFAULT_INVITE_ROLES.find(r => r.id === "technician")!.modulePermissions);
  const [customRoleName, setCustomRoleName] = useState("");
  const [customRoleReady, setCustomRoleReady] = useState(false);
  const [requireTimeClockVerification, setRequireTimeClockVerification] = useState(false);
  const [generatedInviteCode, setGeneratedInviteCode] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    getDoc(doc(db, "business_profiles", businessId)).then(snap => {
      const saved = snap.data()?.selectedRoles as InviteRole[] | undefined;
      if (!saved?.length) return;
      const merged = [...DEFAULT_INVITE_ROLES];
      for (const role of saved) {
        const normalized = { ...role, modulePermissions: role.modulePermissions || defaultGranularFromModuleList(role.permissions || [], "edit") };
        const index = merged.findIndex(r => r.id === normalized.id);
        if (index >= 0) merged[index] = normalized; else merged.push(normalized);
      }
      setAvailableRoles(merged);
    }).catch(err => console.error("Couldn't load onboarding roles:", err));
  }, [businessId]);

  const selectedInviteRole = availableRoles.find(r => r.id === inviteRoleId);
  const chooseRole = (roleId: string) => {
    setInviteRoleId(roleId);
    setCustomRoleName("");
    setCustomRoleReady(false);
    const role = availableRoles.find(r => r.id === roleId);
    setInvitePermissions(role ? structuredClone(role.modulePermissions) : {});
  };

  const togglePermission = (moduleId: string, action: PermissionAction) => {
    setInvitePermissions(prev => {
      const flags = getPermissionFlags(prev, moduleId);
      return { ...prev, [moduleId]: { ...flags, [action]: !flags[action] } };
    });
  };

  const statusFor = (email: string): "Clocked In" | "On Break" | "Off Duty" | "Not Clocked In Yet" => {
    const logs = timeClockLogs.filter(l => l.employeeEmail === email);
    if (logs.length === 0) return "Not Clocked In Yet";
    const last = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    if (last.type === "Break Start") return "On Break";
    if (last.type === "Clock Out") return "Off Duty";
    return "Clocked In";
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return employees;
    return employees.filter(e =>
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      e.role.toLowerCase().includes(q)
    );
  }, [employees, search]);

  const handleSaveEdit = () => {
    if (!editingEmployee) return;
    setEmployees(prev => prev.map(e => (e.email === editingEmployee.email ? editingEmployee : e)));
    triggerNotification(`Updated ${editingEmployee.firstName} ${editingEmployee.lastName}.`);
    if (logOperationalEvent) logOperationalEvent("Employee Updated", `${editingEmployee.firstName} ${editingEmployee.lastName}`, "👤");
    setEditingEmployee(null);
  };

  const handleGenerateInvite = async () => {
    if (!businessId) {
      triggerNotification("Missing business account — please sign in again.");
      return;
    }
    const roleName = inviteRoleId === "__custom__" ? customRoleName.trim() : selectedInviteRole?.name;
    if (!roleName) { triggerNotification("Enter a name for the custom role."); return; }
    const code = genInviteCode(roleName);
    const permissions = MODULE_CATALOG.filter(m => {
      const flags = getPermissionFlags(invitePermissions, m.id);
      return flags.view || flags.edit || flags.delete;
    }).map(m => m.id);
    try {
      await setDoc(doc(db, "employee_invites", code), {
        code,
        role: roleName,
        businessEmail: businessId,
        permissions,
        granularPermissions: invitePermissions,
        requireTimeClockVerification,
        status: "pending",
        createdAt: new Date().toISOString()
      });
      setGeneratedInviteCode(code);
      triggerNotification(`Invite code generated for ${roleName}.`);
    } catch (err) {
      console.error("Error generating invite:", err);
      triggerNotification("Couldn't generate an invite code — check your connection and try again.");
    }
  };

  const statusColor = (status: string) =>
    status === "Clocked In"
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
      : status === "On Break"
      ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
      : status === "Off Duty"
      ? "bg-slate-500/10 text-slate-600 border-slate-500/20"
      : "bg-slate-200 text-slate-500 border-slate-300";

  return (
    <div className="space-y-4 animate-fade-in text-left">
      <div className="bg-[#C7E3FA] rounded-3xl p-5 border border-[#9EC8EF] shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-lg font-sans font-extrabold text-[#1F3557] uppercase tracking-wider">Roster</h2>
            <p className="text-xs text-[#5E7393] font-sans font-semibold mt-0.5">Real employee directory — {employees.length} team member{employees.length === 1 ? "" : "s"}</p>
          </div>
          <button
            onClick={() => { setIsInviting(true); setGeneratedInviteCode(null); }}
            className="px-3.5 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-bold rounded-xl uppercase tracking-wide flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" /> Invite Employee
          </button>
        </div>

        <div className="relative mt-4">
          <Search className="w-4 h-4 text-[#5E7393] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or role..."
            className="w-full pl-9 pr-4 py-2.5 text-xs bg-white border border-[#9EC8EF] rounded-xl focus:outline-none focus:border-[#4A86F7] text-[#1F3557] font-medium"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#C7E3FA] rounded-3xl p-10 border border-[#9EC8EF] shadow-sm text-center">
          <UserPlus className="w-10 h-10 text-[#5E7393] mx-auto mb-3" />
          <h3 className="text-sm font-black text-[#1F3557] uppercase">
            {employees.length === 0 ? "No Employees Yet" : "No Matches"}
          </h3>
          <p className="text-xs text-[#5E7393] font-sans mt-1 max-w-sm mx-auto">
            {employees.length === 0
              ? "Invite your first team member to start assigning jobs, tracking hours, and managing permissions."
              : "Try a different search."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(emp => {
            const status = statusFor(emp.email);
            const initials = `${emp.firstName[0] || ""}${emp.lastName[0] || ""}`.toUpperCase();
            return (
              <div key={emp.email} className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm space-y-2.5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-[#EAF5FF] text-[#315C9F] border border-[#9EC8EF] font-black text-xs flex items-center justify-center shadow-sm">
                      {initials}
                    </div>
                    <div>
                      <p className="font-black text-[#1F3557] text-xs">{emp.firstName} {emp.lastName}</p>
                      <p className="text-[10px] text-[#5E7393] font-bold uppercase tracking-wide">{emp.role}</p>
                    </div>
                  </div>
                  <button onClick={() => setEditingEmployee(emp)} title="Edit employee" className="text-[#5E7393] hover:text-[#1F3557] cursor-pointer">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1 text-[10.5px] text-[#1F3557]">
                  <div className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-[#5E7393] shrink-0" /> <span className="truncate">{emp.email}</span></div>
                  {emp.phone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-[#5E7393] shrink-0" /> {emp.phone}</div>}
                  {emp.address && <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3 text-[#5E7393] shrink-0" /> <span className="truncate">{emp.address}</span></div>}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#9EC8EF]/30">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${statusColor(status)}`}>{status}</span>
                  {emp.hourlyRate > 0 && <span className="text-[10px] font-bold text-[#1F3557]">${emp.hourlyRate}/hr</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-white/60 border border-dashed border-[#9EC8EF] rounded-2xl p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[#1F3557]">
          <Shield className="w-4 h-4 text-[#315C9F] shrink-0" />
          <span>Permissions are managed by role, not per person — configure what each role can access.</span>
        </div>
        <button
          onClick={() => triggerNotification("Open Settings → Roles to configure permissions.")}
          className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-white border border-[#9EC8EF] text-[#315C9F] text-[10.5px] font-bold rounded-xl uppercase whitespace-nowrap cursor-pointer"
        >
          Manage Roles
        </button>
      </div>

      {editingEmployee && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-5 w-[95%] max-w-[420px] shadow-2xl space-y-2.5 text-xs">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-sm font-black text-[#1F3557] uppercase">Edit Employee</h3>
              <button onClick={() => setEditingEmployee(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={editingEmployee.firstName} onChange={e => setEditingEmployee({ ...editingEmployee, firstName: e.target.value })} placeholder="First name" className="border border-slate-200 rounded-xl px-3 py-2" />
              <input value={editingEmployee.lastName} onChange={e => setEditingEmployee({ ...editingEmployee, lastName: e.target.value })} placeholder="Last name" className="border border-slate-200 rounded-xl px-3 py-2" />
            </div>
            <input value={editingEmployee.phone} onChange={e => setEditingEmployee({ ...editingEmployee, phone: e.target.value })} placeholder="Phone" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <StructuredAddressFields
              label="Home Address"
              value={editingEmployee.address}
              onChange={address => setEditingEmployee({ ...editingEmployee, address })}
              compact
              inputClassName="w-full border border-slate-200 rounded-xl px-3 py-2"
            />
            <input value={editingEmployee.role} onChange={e => setEditingEmployee({ ...editingEmployee, role: e.target.value })} placeholder="Role" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <input type="number" value={editingEmployee.hourlyRate} onChange={e => setEditingEmployee({ ...editingEmployee, hourlyRate: parseFloat(e.target.value) || 0 })} placeholder="Hourly rate" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3">
              <input type="checkbox" checked={!!editingEmployee.requireTimeClockVerification} onChange={e => setEditingEmployee({ ...editingEmployee, requireTimeClockVerification: e.target.checked })} className="mt-0.5" />
              <span><strong className="block text-[#1F3557]">Require clock verification</strong><span className="text-[9px] text-slate-500">An owner or manager must verify this employee's clock-in and clock-out.</span></span>
            </label>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditingEmployee(null)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold">Cancel</button>
              <button onClick={handleSaveEdit} className="flex-1 py-2 bg-[#315C9F] text-white rounded-xl font-bold">Save</button>
            </div>
          </div>
        </div>
      )}

      {isInviting && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-5 w-[95%] max-w-[400px] shadow-2xl space-y-2.5 text-xs">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-sm font-black text-[#1F3557] uppercase">Invite Employee</h3>
              <button onClick={() => setIsInviting(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            {!generatedInviteCode ? (
              <>
                <label className="text-[9px] uppercase text-slate-400 font-bold">Choose position / role</label>
                <select value={inviteRoleId} onChange={e => chooseRole(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white">
                  {availableRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                  <option value="__custom__">+ Add Custom Role</option>
                </select>
                {inviteRoleId === "__custom__" && (
                  <div className="flex gap-2">
                    <input autoFocus value={customRoleName} onChange={e => { setCustomRoleName(e.target.value); setCustomRoleReady(false); }} placeholder="Enter custom role name" className="flex-1 border border-slate-200 rounded-xl px-3 py-2" />
                    <button type="button" disabled={!customRoleName.trim()} onClick={() => setCustomRoleReady(true)} className="px-4 rounded-xl bg-[#315C9F] text-white font-bold disabled:opacity-40">OK</button>
                  </div>
                )}
                {(inviteRoleId !== "__custom__" || customRoleReady) && <details className="border border-slate-200 rounded-xl overflow-hidden" open>
                  <summary className="px-3 py-2 bg-slate-50 font-bold text-[#1F3557] cursor-pointer">Choose permissions</summary>
                  <div className="max-h-[260px] overflow-y-auto p-2 space-y-1.5">
                    {MODULE_CATALOG.map(mod => {
                      const flags = getPermissionFlags(invitePermissions, mod.id);
                      return <div key={mod.id} className="rounded-lg border border-slate-100 p-2">
                        <div className="font-bold text-[10px] text-[#1F3557] mb-1.5">{mod.label}</div>
                        <div className="flex flex-wrap gap-2">
                          {(["view","edit","delete"] as PermissionAction[]).map(action => <label key={action} className="flex items-center gap-1 text-[9px] text-slate-600">
                            <input type="checkbox" checked={flags[action]} onChange={() => togglePermission(mod.id, action)} />
                            {action === "edit" ? "Create & Edit" : action[0].toUpperCase() + action.slice(1)}
                          </label>)}
                        </div>
                      </div>;
                    })}
                  </div>
                </details>}
                <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <input type="checkbox" checked={requireTimeClockVerification} onChange={e => setRequireTimeClockVerification(e.target.checked)} className="mt-0.5" />
                  <span><strong className="block text-[#1F3557]">Require owner/manager clock verification</strong><span className="text-[9px] text-slate-500">The employee cannot clock in or out until an owner or manager authenticates.</span></span>
                </label>
                <button disabled={inviteRoleId === "__custom__" && !customRoleReady} onClick={handleGenerateInvite} className="w-full py-2 bg-[#315C9F] text-white rounded-xl font-bold mt-2 disabled:opacity-40">Generate Invite Code</button>
              </>
            ) : (
              <>
                <p className="text-[10px] text-slate-500">Share this code with your new hire to complete signup:</p>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                  <span className="font-mono font-black text-[#1F3557] text-sm flex-1">{generatedInviteCode}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedInviteCode);
                      triggerNotification("Invite code copied.");
                    }}
                    className="text-[#315C9F]"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <button onClick={() => setIsInviting(false)} className="w-full py-2 bg-slate-100 text-slate-600 rounded-xl font-bold mt-2">Done</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
