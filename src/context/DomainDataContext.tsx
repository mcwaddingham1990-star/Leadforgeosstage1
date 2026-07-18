import { createContext, useContext, Dispatch, SetStateAction } from "react";
import { Customer, Lead, Estimate, InventoryItem, DocumentItem, SchedulingEvent, RevenueEvent } from "../types/domain";

export interface RosterEntry {
  id?: string;
  name: string;
  role: string;
  code: string;
  status: string;
}

export interface DomainDataContextValue {
  customers: Customer[];
  setCustomers: Dispatch<SetStateAction<Customer[]>>;
  leads: Lead[];
  setLeads: Dispatch<SetStateAction<Lead[]>>;
  estimates: Estimate[];
  setEstimates: Dispatch<SetStateAction<Estimate[]>>;
  schedulingEvents: SchedulingEvent[];
  setSchedulingEvents: Dispatch<SetStateAction<SchedulingEvent[]>>;
  inventoryList: InventoryItem[];
  setInventoryList: Dispatch<SetStateAction<InventoryItem[]>>;
  documents: DocumentItem[];
  setDocuments: Dispatch<SetStateAction<DocumentItem[]>>;
  recentRoster: RosterEntry[];
  setRecentRoster: Dispatch<SetStateAction<RosterEntry[]>>;
  bulletins: any[];
  setBulletins: Dispatch<SetStateAction<any[]>>;
  notifications: any[];
  setNotifications: Dispatch<SetStateAction<any[]>>;
  recentAiActions: any[];
  setRecentAiActions: Dispatch<SetStateAction<any[]>>;
  snapshots: any[];
  setSnapshots: Dispatch<SetStateAction<any[]>>;
  revenueEvents: RevenueEvent[];
  setRevenueEvents: Dispatch<SetStateAction<RevenueEvent[]>>;
  /** Derived sum of revenueEvents — provided so consumers don't each re-implement the reduce. */
  completedJobsRevenue: number;
  preSelectedDate: string | undefined;
  setPreSelectedDate: Dispatch<SetStateAction<string | undefined>>;
  preSelectedCustomerId: string | undefined;
  setPreSelectedCustomerId: Dispatch<SetStateAction<string | undefined>>;
}

export const DomainDataContext = createContext<DomainDataContextValue | undefined>(undefined);

/**
 * The 12 Firestore-backed business collections (customers, leads, estimates,
 * scheduling events, inventory, documents, roster, bulletins, notifications,
 * recent AI actions, snapshots, revenue events) plus the handful of
 * cross-page scalars that travel with them. Page components should use this
 * instead of taking each collection as a pair of props.
 */
export function useDomainData(): DomainDataContextValue {
  const ctx = useContext(DomainDataContext);
  if (!ctx) {
    throw new Error("useDomainData must be used within a DomainDataContext.Provider");
  }
  return ctx;
}
