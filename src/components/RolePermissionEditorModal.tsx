import React, { useState } from "react";
import { Shield, Settings } from "lucide-react";
import {
  GranularPermissions,
  PermissionLevel,
  PERMISSION_LEVELS,
  PERMISSION_LEVEL_LABELS,
  getPermissionLevel
} from "../types/permissions";

export interface EditableRole {
  id: string;
  name: string;
  // Derived from modulePermissions (every module not set to "none"), kept
  // for the places elsewhere in the app that still read a plain module
  // list -- it is never independently edited anymore.
  permissions: string[];
  modulePermissions: GranularPermissions;
}

// The full module catalog every role's permissions are configured against.
// Dashboard isn't included -- like Bulletins/Snapshots/Notifications, it's
// always visible to everyone, not a module an owner needs to gate.
export const MODULE_CATALOG: Array<{ id: string; label: string }> = [
  { id: "customers", label: "Customers" },
  { id: "leads", label: "Leads" },
  { id: "estimates", label: "Estimates" },
  { id: "invoices", label: "Invoices" },
  { id: "accounting", label: "Accounting & Bookkeeping" },
  { id: "jobs", label: "Jobs" },
  { id: "scheduling", label: "Scheduling" },
  { id: "dispatch", label: "Dispatch" },
  { id: "routes", label: "Routes" },
  { id: "interactive_map", label: "Interactive Map" },
  { id: "inventory", label: "Inventory" },
  { id: "documents", label: "Documents" },
  { id: "pdf_editor", label: "PDF Editor" },
  { id: "esign", label: "eSign" },
  { id: "messages", label: "Messages" },
  { id: "timeclock", label: "Time Clock" },
  { id: "fleet", label: "Fleet" },
  { id: "marketing", label: "Marketing" },
  { id: "reports", label: "Reports" },
  { id: "ai_assistant", label: "AI Assistant" },
  { id: "settings", label: "Settings" }
];

function derivePermissionsList(modulePermissions: GranularPermissions): string[] {
  return Object.entries(modulePermissions)
    .filter(([, level]) => level !== "none")
    .map(([moduleId]) => moduleId);
}

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
  const [modulePermissions, setModulePermissions] = useState<GranularPermissions>(role.modulePermissions);

  const setLevel = (moduleId: string, level: PermissionLevel) => {
    setModulePermissions(prev => ({ ...prev, [moduleId]: level }));
  };

  const handleSave = () => {
    onSave({
      ...role,
      modulePermissions,
      permissions: derivePermissionsList(modulePermissions)
    });
  };

  return (
    <div className={`${position} inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-3 z-30 animate-fade-in`}>
      <div className="bg-white text-slate-800 rounded-3xl p-5 w-[95%] max-w-[440px] max-h-[92%] shadow-2xl border border-blue-100 flex flex-col justify-between overflow-hidden">

        <div className="flex items-center justify-between pb-2 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-xs font-extrabold text-blue-950 uppercase tracking-tight flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-blue-600" />
              <span>Module Permissions</span>
            </h3>
            <p style={{ fontSize: "9.5px" }} className="text-blue-600 font-sans font-bold block">
              Editing: {role.name}
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

        <div className="flex-1 overflow-y-auto my-3 pr-1 space-y-2 scrollbar-thin scrollbar-thumb-blue-100">
          <p style={{ fontSize: "9px" }} className="text-slate-400 font-sans leading-normal pb-1">
            Every module is independent — pick one level for each. No Access hides it entirely.
          </p>

          {MODULE_CATALOG.map((mod) => {
            const currentLevel = getPermissionLevel(modulePermissions, mod.id);
            return (
              <div key={mod.id} className="p-2 bg-slate-50/70 border border-slate-100 rounded-xl">
                <p style={{ fontSize: "10.5px" }} className="font-sans font-extrabold text-slate-700 mb-1.5">
                  {mod.label}
                </p>
                <div className="grid grid-cols-4 gap-1">
                  {PERMISSION_LEVELS.map((level) => {
                    const isSelected = currentLevel === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setLevel(mod.id, level)}
                        className={`px-1 py-1.5 text-[8.5px] font-black rounded-lg border cursor-pointer select-none transition-all uppercase leading-tight ${
                          isSelected
                            ? level === "none"
                              ? "bg-slate-200 text-slate-600 border-slate-300"
                              : level === "delete"
                              ? "bg-rose-100 text-rose-700 border-rose-300"
                              : "bg-indigo-100 text-indigo-700 border-indigo-300"
                            : "bg-white text-slate-400 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {PERMISSION_LEVEL_LABELS[level]}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
            onClick={handleSave}
            className="flex-1 py-2 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-xl shadow-md transition-all cursor-pointer font-sans"
          >
            <Settings className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            Save Permissions
          </button>
        </div>

      </div>
    </div>
  );
}
