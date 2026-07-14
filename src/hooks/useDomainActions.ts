import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { Customer, Estimate, SchedulingEvent } from "../types/domain";

/**
 * Single home for the cross-domain writes that today happen ad hoc inside
 * individual page components (Lead -> Customer, Lead -> Estimate,
 * Estimate -> scheduled Job). Not the real Event Engine pub/sub yet — just
 * gives these existing imperative writes one shared module instead of three
 * scattered copies, so the future Event Engine has one obvious integration
 * point.
 */
export function useDomainActions() {
  const { leads, setLeads, setCustomers, estimates, setEstimates, setSchedulingEvents } = useDomainData();
  const { logOperationalEvent } = useNavTelemetry();

  const convertLeadToCustomer = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const newCustomer: Customer = {
      id: "cust_" + Math.random().toString(36).substring(2, 9),
      company: lead.company || lead.name + " Inc",
      contact: lead.name,
      phone: lead.phone,
      email: lead.email,
      address: lead.address || "100 Operational Way",
      openJobs: 0,
      outstandingBalance: 0,
      lifetimeValue: lead.estimatedValue || 0,
      status: "Active",
      type: "Residential",
      isVIP: false,
      recentlyAdded: true
    };

    setCustomers(prev => [newCustomer, ...prev]);
    setLeads(prev => prev.map(l => (l.id === leadId ? { ...l, status: "Won" } : l)));
    logOperationalEvent("Lead Converted", `${lead.name} converted to Customer`, "🤝");
  };

  const createEstimateFromLead = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const newEstimate: Estimate = {
      id: "est_" + Math.random().toString(36).substring(2, 9),
      number: "E-" + (1000 + Math.floor(Math.random() * 9000)),
      company: lead.company || lead.name + " Inc",
      customerName: lead.name,
      salesRep: lead.salesRep || "Unassigned",
      amount: lead.estimatedValue || 1500,
      status: "Draft",
      createdDate: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    };

    setEstimates(prev => [newEstimate, ...prev]);
    setLeads(prev => prev.map(l => (l.id === leadId ? { ...l, status: "Estimate Sent" } : l)));
    logOperationalEvent("Estimate Created", `Estimate ${newEstimate.number} generated from lead ${lead.name}`, "🧾");
  };

  const approveEstimateToJob = (estimateId: string) => {
    const estimate = estimates.find(e => e.id === estimateId);
    if (!estimate) return;

    const newJob: SchedulingEvent = {
      id: "job_" + Math.random().toString(36).substring(2, 9),
      eventType: "Job",
      date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" }),
      startTime: "09:00 AM",
      endTime: "12:00 PM",
      customer: estimate.customerName,
      customerPhone: "(555) 123-4567",
      customerEmail: "client@example.com",
      customerAddress: "1024 Industrial Pkwy, Seattle WA",
      assignedEmployee: "Theresa W.",
      assignedCrew: "Crew Alpha",
      location: "Seattle Area",
      priority: "Medium",
      notes: "Auto-generated from Approved Estimate " + estimate.number,
      status: "Scheduled",
      sourceEstimateId: estimate.id
    };

    setSchedulingEvents(prev => [newJob, ...prev]);
    setEstimates(prev => prev.map(e => (e.id === estimateId ? { ...e, status: "Accepted" } : e)));
    logOperationalEvent("Estimate Approved", `${estimate.number} converted to Scheduled Job`, "✅");
  };

  return { convertLeadToCustomer, createEstimateFromLead, approveEstimateToJob };
}
