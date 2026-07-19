// Per-module permissions. Every module gets exactly one setting, chosen
// from four levels -- no separate per-action toggles, no global switch
// that applies across modules. Each module is fully independent.

export type PermissionLevel = "none" | "view" | "edit" | "delete";

export const PERMISSION_LEVELS: PermissionLevel[] = ["none", "view", "edit", "delete"];

export const PERMISSION_LEVEL_LABELS: Record<PermissionLevel, string> = {
  none: "No Access",
  view: "View",
  edit: "Create & Edit",
  delete: "Delete"
};

// Levels are ordered/hierarchical: Delete implies Create & Edit implies View.
const LEVEL_RANK: Record<PermissionLevel, number> = { none: 0, view: 1, edit: 2, delete: 3 };

export type GranularPermissions = Record<string, PermissionLevel>;

/**
 * `action` is checked against the module's single level using the same
 * hierarchy the levels are ordered in -- e.g. hasPermission(perms, "jobs",
 * "view") is true for a module set to "edit" or "delete" too, since those
 * levels include viewing.
 */
export function hasPermission(
  granular: GranularPermissions | undefined,
  moduleId: string,
  action: "view" | "edit" | "delete"
): boolean {
  if (!granular) return false;
  const level = granular[moduleId] || "none";
  return LEVEL_RANK[level] >= LEVEL_RANK[action];
}

export function getPermissionLevel(granular: GranularPermissions | undefined, moduleId: string): PermissionLevel {
  if (!granular) return "none";
  return granular[moduleId] || "none";
}

/**
 * Builds a granular permission set with every listed module set to the
 * same level -- used for role-template defaults, e.g. a fresh custom
 * role starting at "view" until the owner customizes it further.
 */
export function defaultGranularFromModuleList(
  modules: string[],
  level: PermissionLevel = "view"
): GranularPermissions {
  const result: GranularPermissions = {};
  for (const moduleId of modules) {
    result[moduleId] = level;
  }
  return result;
}

/** Owners always have full (Delete-tier, i.e. everything) access to every module. */
export function fullAccessGranular(modules: string[]): GranularPermissions {
  const result: GranularPermissions = {};
  for (const moduleId of modules) {
    result[moduleId] = "delete";
  }
  return result;
}
