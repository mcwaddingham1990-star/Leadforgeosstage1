// Granular per-module permissions. Replaces the old model where a role's
// `permissions: string[]` only gated whether a module was visible at all
// (view or nothing) with real per-action control.

export type PermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "export"
  | "manage"
  | "ai";

export const PERMISSION_ACTIONS: PermissionAction[] = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "export",
  "manage",
  "ai"
];

export type ModulePermissions = Record<PermissionAction, boolean>;

export type GranularPermissions = Record<string, ModulePermissions>;

const NO_ACCESS: ModulePermissions = {
  view: false,
  create: false,
  edit: false,
  delete: false,
  approve: false,
  export: false,
  manage: false,
  ai: false
};

export function hasPermission(
  granular: GranularPermissions | undefined,
  moduleId: string,
  action: PermissionAction
): boolean {
  if (!granular) return false;
  const mod = granular[moduleId];
  if (!mod) return false;
  // "manage" implies every other action within that module.
  if (mod.manage) return true;
  return !!mod[action];
}

/**
 * Builds a granular permission set from the legacy module-access list
 * (`permissions: string[]`), so existing roles/employees keep working
 * without needing to be manually reconfigured. Tier controls how much
 * beyond "view" a module gets by default.
 *
 * - "full": view/create/edit/export granted, delete/approve/manage withheld
 *   (owners and managers still need to explicitly grant delete/approve).
 * - "standard": view/create/edit granted, nothing destructive or admin.
 * - "view-only": view only — for reporting/reference-only roles.
 */
export function defaultGranularFromModuleList(
  modules: string[],
  tier: "full" | "standard" | "view-only" = "standard"
): GranularPermissions {
  const result: GranularPermissions = {};
  for (const moduleId of modules) {
    if (tier === "view-only") {
      result[moduleId] = { ...NO_ACCESS, view: true };
    } else if (tier === "full") {
      result[moduleId] = { ...NO_ACCESS, view: true, create: true, edit: true, export: true, ai: true };
    } else {
      result[moduleId] = { ...NO_ACCESS, view: true, create: true, edit: true, ai: true };
    }
  }
  return result;
}

export function emptyModulePermissions(): ModulePermissions {
  return { ...NO_ACCESS };
}

export function fullAccessGranular(modules: string[]): GranularPermissions {
  const result: GranularPermissions = {};
  for (const moduleId of modules) {
    result[moduleId] = { view: true, create: true, edit: true, delete: true, approve: true, export: true, manage: true, ai: true };
  }
  return result;
}
