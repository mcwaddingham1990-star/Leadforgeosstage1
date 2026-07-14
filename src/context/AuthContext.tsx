import { createContext, useContext } from "react";

export interface LoggedInUser {
  email: string;
  role: string;
  permissions: string[];
  isEmployee?: boolean;
  name?: string;
  goals?: string;
}

export interface AuthContextValue {
  loggedInUser: LoggedInUser | null;
  isLoggedIn: boolean;
  currentView: string;
  setCurrentView: (view: string) => void;
  simulatedRole: string | null;
  setSimulatedRole: (role: string | null) => void;
  /** Tenant key used to scope every Firestore-backed collection (currently the owner's business email). */
  businessId: string | undefined;
  handleLogout: () => void | Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Session/account info for the logged-in user. Page components should use this
 * instead of taking loggedInUser/isLoggedIn/simulatedRole/etc as props.
 *
 * The full sign-up/sign-in/onboarding form state and handlers still live in
 * App.tsx for now (they're only used by the pre-login screens, which are
 * slated to move into their own components under src/components/auth/ in a
 * later pass) — this context only exposes what post-login pages need.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthContext.Provider");
  }
  return ctx;
}
