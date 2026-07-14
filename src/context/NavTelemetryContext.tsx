import { createContext, useContext } from "react";

export interface ActiveScreen {
  id: string;
  label: string;
  icon: string;
  url: string;
  [key: string]: any;
}

export interface NavTelemetryContextValue {
  activeScreen: ActiveScreen;
  setActiveScreen: (screen: ActiveScreen) => void;
  /**
   * Canonical cross-page navigation. Every entity reference anywhere in the
   * app (map pin, table row, dropdown, card) should route through this so
   * "many roads lead to the same record" behaves identically everywhere,
   * instead of each page redefining its own copy of this logic.
   */
  navigateToScreen: (screenId: string, params?: { customerId?: string; date?: string }) => void;
  logOperationalEvent: (type: string, desc: string, icon?: string) => void;
  takeSnapshot: (pageId: string, pageName: string, metaData?: any) => void;
  deleteSnapshot: (id: string) => void;
  openPageAIAnalysis: (pageId: string, pageName: string, customContext?: string) => void;
  openPlaceholderPage: (label: string, icon: string) => void;
  triggerNotification: (message: string) => void;
}

export const NavTelemetryContext = createContext<NavTelemetryContextValue | undefined>(undefined);

/**
 * The cross-cutting navigation/telemetry callback set every page component
 * needs (previously redefined as a near-identical inline closure at every
 * one of the 17 page call sites in App.tsx).
 */
export function useNavTelemetry(): NavTelemetryContextValue {
  const ctx = useContext(NavTelemetryContext);
  if (!ctx) {
    throw new Error("useNavTelemetry must be used within a NavTelemetryContext.Provider");
  }
  return ctx;
}
