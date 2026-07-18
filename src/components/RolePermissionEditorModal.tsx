import React, { useState } from "react";
import { CheckSquare, Shield, Settings } from "lucide-react";
import {
  GranularPermissions,
  ModulePermissions,
  defaultGranularFromModuleList,
  emptyModulePermissions
} from "../types/permissions";

export interface EditableRole {
  id: string;
  name: string;
  permissions: string[];
  modulePermissions: GranularPermissions;
}

export const MODULE_CATALOG: Array<{ id: string; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "leads", label: "Leads / CRM" },
  { id: "jobs", label: "Jobs List" },
  { id: "customers", label: "Customers" },
  { id: "messages", label: "Messages" },
  { id: "scheduling", label: "Scheduling" },
  { id: "dispatch", label: "Dispatch Board" },
  { id: "timeclock", label: "Time Clock" },
  { id: "routes", label: "Routes & Stops" },
  { id: "estimates", label: "Estimates" },
  { id: "documents", label: "Documents" },
  { id: "ai_assistant", label: "AI Assistant" },
  { id: "inventory", label: "Inventory" },
  { id: "settings", label: "Settings" },
  { id: "training", label: "Employee Training" }
];

const CAPABILITY_KEYS: Array<{ key: keyof ModulePermissions; label: string }> = [
  { key: "view", label: "View" },
  { key: "create", label: "Create" },
  { key: "edit", label: "Edit" },
  { key: "delete", label: "Delete" },
  { key: "approve", label: "Approve" },
  { key: "export", label: "Export" },
  { key: "ai", label: "AI" }
];

interface RolePermissionEditorModalProps<T extends EditableRole> {
  role: T;
  onSave: (updated: T) => void;
  onClose: () => void;
  /**
   * "fixed" (default) covers the real browser viewport — correct for a
   * regular scrolling page like Settings. "absolute" stays within the
   * nearest positioned ancestor — needed inside the onboarding flow's
   * bounded interactive card, where the whole UI already lives in an
   * `absolute inset-0` card rather than the real viewport.
   */
  position?: "fixed" | "absolute";
}

export function RolePermissionEditorModal<T extends EditableRole>({
  role,
  onSave,
  onClose,
  position = "fixed"
}: RolePermissionEditorModalProps<T>) {
  const [draft, setDraft] = useState<T>(role);

  const toggleScreen = (moduleId: string, checked: boolean) => {
    setDraft(prev => {
      const nextPermissions = checked
        ? [...prev.permissions, moduleId]
        : prev.permissions.filter(p => p !== moduleId);
      const nextModulePermissions = { ...prev.modulePermissions };
      if (checked && !nextModulePermissions[moduleId]) {
        // Newly authorized module starts at the safe "standard" default —
        // view/create/edit only, nothing destructive or admin.
        nextModulePermissions[moduleId] = defaultGranularFromModuleList([moduleId], "standard")[moduleId];
      }
      return { ...prev, permissions: nextPermissions, modulePermissions: nextModulePermissions };
    });
  };

  const toggleCapability = (moduleId: string, capKey: keyof ModulePermissions, checked: boolean) => {
    setDraft(prev => {
      const current = prev.modulePermissions[moduleId] || emptyModulePermissions();
      return {
        ...prev,
        modulePermissions: {
          ...prev.modulePermissions,
          [moduleId]: { ...current, [capKey]: checked }
        }
      };
    });
  };

  const applyTierToAllModules = (tier: "full" | "standard" | "view-only") => {
    setDraft(prev => ({
      ...prev,
      modulePermissions: defaultGranularFromModuleList(prev.permissions, tier)
    }));
  };

  return (
    <div className={`${position} inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-3 z-30 animate-fade-in`}>
      <div className="bg-white text-slate-800 rounded-3xl p-5 w-[95%] max-w-[440px] max-h-[92%] shadow-2xl border border-blue-100 flex flex-col justify-between overflow-hidden">

        <div className="flex items-center justify-between pb-2 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-xs font-extrabold text-blue-950 uppercase tracking-tight flex items-center gap-1.5">
              <Settings className="w-4 h-4 text-blue-600 animate-spin-slow" />
              <span>Custom Permissions Template</span>
            </h3>
            <p style={{ fontSize: "9.5px" }} className="text-blue-600 font-sans font-bold block">
              Editing Profile: {draft.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-sans font-bold text-lg select-none cursor-pointer"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto my-3 pr-1 space-y-3.5 scrollbar-thin scrollbar-thumb-blue-100">

          <div className="space-y-1.5">
            <p style={{ fontSize: "10.5px" }} className="font-sans font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
              <CheckSquare className="w-3.5 h-3.5 text-blue-500" /> Authorized OS Screens
            </p>
            <p style={{ fontSize: "9px" }} className="text-slate-400 font-sans leading-normal">
              Toggle screens that are rendered in this employee's sidebar navigation menu.
            </p>
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {MODULE_CATALOG.map((screen) => {
                const isPermitted = draft.permissions.includes(screen.id);
                return (
                  <label
                    key={screen.id}
                    className={`flex items-center gap-2 p-1.5 rounded-lg border text-[10.5px] cursor-pointer transition-all ${
                      isPermitted ? "bg-blue-50/50 border-blue-200 text-blue-900 font-bold" : "bg-slate-50/50 border-transparent text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isPermitted}
                      onChange={(e) => toggleScreen(screen.id, e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 focus:ring-0 cursor-pointer"
                    />
                    <span className="truncate">{screen.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <p style={{ fontSize: "10.5px" }} className="font-sans font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-blue-500" /> Per-Module Capabilities
            </p>
            <p style={{ fontSize: "9px" }} className="text-slate-400 font-sans leading-normal">
              Each authorized module gets its own capabilities — e.g. Dispatcher can have Routes: Edit while Driver has Routes: View only.
            </p>

            <div className="flex gap-1.5 pt-1">
              <span style={{ fontSize: "9px" }} className="text-slate-400 font-sans font-bold self-center">Apply to all:</span>
              {(["view-only", "standard", "full"] as const).map(tier => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => applyTierToAllModules(tier)}
                  className="px-2 py-1 text-[9px] font-bold uppercase rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700 cursor-pointer transition-all"
                >
                  {tier === "view-only" ? "View Only" : tier === "standard" ? "Standard" : "Full"}
                </button>
              ))}
            </div>

            <div className="space-y-2 pt-1">
              {draft.permissions.length === 0 && (
                <p style={{ fontSize: "9.5px" }} className="text-slate-400 font-sans italic">
                  No modules authorized yet — toggle screens above first.
                </p>
              )}
              {draft.permissions.map((moduleId) => {
                const label = MODULE_CATALOG.find(m => m.id === moduleId)?.label || moduleId;
                const modPerms = draft.modulePermissions[moduleId] || emptyModulePermissions();
                return (
                  <div key={moduleId} className="p-2 bg-slate-50/70 border border-slate-100 rounded-xl">
                    <p style={{ fontSize: "10px" }} className="font-sans font-extrabold text-slate-700 mb-1">{label}</p>
                    <div className="flex flex-wrap gap-1">
                      {CAPABILITY_KEYS.map(cap => {
                        const isEnabled = !!modPerms[cap.key];
                        return (
                          <button
                            key={cap.key}
                            type="button"
                            onClick={() => toggleCapability(moduleId, cap.key, !isEnabled)}
                            className={`px-1.5 py-0.5 text-[8.5px] font-black rounded border cursor-pointer select-none transition-all uppercase ${
                              isEnabled
                                ? "bg-indigo-50 text-indigo-600 border-indigo-200"
                                : "bg-white text-slate-400 border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            {cap.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        <div className="flex gap-2.5 pt-2 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="flex-1 py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl shadow-md transition-all cursor-pointer font-sans"
          >
            Save Template
          </button>
        </div>

      </div>
    </div>
  );
}
