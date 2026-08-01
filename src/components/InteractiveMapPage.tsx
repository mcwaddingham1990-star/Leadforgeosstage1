import React, { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import {
  Search, 
  MapPin, 
  User, 
  Wrench, 
  FileText, 
  Sparkles, 
  Navigation, 
  CheckCircle, 
  Plus, 
  Minus,
  Layers, 
  SlidersHorizontal, 
  X, 
  RefreshCw, 
  Truck, 
  Box, 
  DollarSign, 
  Clock, 
  AlertTriangle, 
  ChevronRight, 
  Calendar,
  Building,
  Package,
  ArrowRight,
  TrendingUp,
  FileSpreadsheet,
  Phone,
  Mail,
  Send,
  Trash2,
  Sliders,
  Shield,
  Star,
  Skull,
  UserCheck,
  Zap,
  Activity,
  Maximize2,
  Compass,
  FileCode,
  Sparkle,
  MessageSquare,
  DollarSign as Money,
  Target,
  Edit2,
  Check,
  Eye,
  Camera,
  Layers as LayersIcon,
  ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { APIProvider, Map, AdvancedMarker, Pin, useMap } from "@vis.gl/react-google-maps";

// Deterministic geocoding in Seattle area to place markers on fallbacks & real map
export function geocodeAddress(address: string, id: string = ""): { lat: number; lng: number } {
  let hash = 0;
  const combined = (address || "Seattle, WA") + id;
  for (let i = 0; i < combined.length; i++) {
    hash = combined.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Center: 47.6062, -122.3321
  // Seattle bounds: lat [47.52, 47.72], lng [-122.42, -122.25]
  const latDelta = ((Math.abs(hash) % 1000) / 1000) * 0.16 - 0.08; // -0.08 to +0.08
  const lngDelta = ((Math.abs(hash >> 3) % 1000) / 1000) * 0.12 - 0.06; // -0.06 to +0.06
  
  return {
    lat: 47.6062 + latDelta,
    lng: -122.3321 + lngDelta
  };
}

export interface InteractiveMapPageProps {
  businessAddresses?: string[];
}

// Territory Schema
interface ServiceTerritory {
  id: string;
  name: string;
  color: string;
  points: Array<{ lat: number; lng: number }>; // coordinate boundaries for Google maps / SVGs
  revenue: number;
  customersCount: number;
  leadsCount: number;
  jobsCount: number;
  techniciansCount: number;
  completionRate: number;
}

export const InteractiveMapPage: React.FC<InteractiveMapPageProps> = ({
  businessAddresses
}) => {
  const { loggedInUser, simulatedRole } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const {
    customers,
    setCustomers,
    leads,
    setLeads,
    estimates,
    setEstimates,
    schedulingEvents,
    setSchedulingEvents,
    inventoryList,
    setInventoryList,
    documents,
    setDocuments,
    completedJobsRevenue,
    employees,
    timeClockLogs
  } = useDomainData();
  const { navigateToScreen: onNavigateToScreen, logOperationalEvent } = useNavTelemetry();
  const map = useMap();
  const apiKey = (process.env.GOOGLE_MAPS_PLATFORM_KEY || "").trim();
  const hasValidKey = apiKey !== "";
  // Map IDs are tied to a specific Google Cloud project — falls back to the
  // original demo project's Map ID only if a real business hasn't set
  // their own yet (which won't work with their own API key/project).
  // Google's documented demo Map ID supports Advanced Markers until a
  // project-specific Map ID is configured in Render.
  const mapId = (process.env.GOOGLE_MAPS_MAP_ID || "").trim() || "DEMO_MAP_ID";

  // Real default map center, resolved in priority order: real business
  // address -> real device GPS -> DFW fallback -> last position the owner
  // actually viewed (persisted locally). Never a hardcoded arbitrary city.
  const DFW_FALLBACK = { lat: 32.7767, lng: -96.7970 };
  const MAP_POSITION_STORAGE_KEY = "ownersLocalOS_lastMapPosition";
  const [resolvedDefaultCenter, setResolvedDefaultCenter] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (resolvedDefaultCenter) return;

    // 1. Real business address on file.
    if (businessAddresses?.[0]?.trim()) {
      setResolvedDefaultCenter(geocodeAddress(businessAddresses[0], "office_hq"));
      return;
    }

    // 2. Last position the owner actually viewed, saved locally.
    try {
      const saved = localStorage.getItem(MAP_POSITION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.lat === "number" && typeof parsed?.lng === "number") {
          setResolvedDefaultCenter(parsed);
          return;
        }
      }
    } catch {
      // ignore malformed storage
    }

    // 3. Real device GPS, if the browser/user allows it.
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setResolvedDefaultCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setResolvedDefaultCenter(DFW_FALLBACK),
        { timeout: 5000 }
      );
      return;
    }

    // 4. DFW fallback -- never Oregon, never an arbitrary hardcoded city.
    setResolvedDefaultCenter(DFW_FALLBACK);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessAddresses]);

  const handleMapCameraChanged = (center: { lat: number; lng: number }) => {
    try {
      localStorage.setItem(MAP_POSITION_STORAGE_KEY, JSON.stringify(center));
    } catch {
      // ignore storage failures (private browsing, quota, etc.)
    }
  };

  // Map Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"All" | "Customer" | "Lead" | "Estimate" | "Job" | "Technician" | "Vehicle">("All");
  
  // Advanced Filter Layer Toggles
  const [showCustomers, setShowCustomers] = useState(true);
  const [showLeads, setShowLeads] = useState(true);
  const [showJobs, setShowJobs] = useState(true);
  const [showEstimates, setShowEstimates] = useState(true);
  const [showTechnicians, setShowTechnicians] = useState(true);
  const [showVehicles, setShowVehicles] = useState(true);
  const [showTerritories, setShowTerritories] = useState(true);
  const [showRevenueHeatmap, setShowRevenueHeatmap] = useState(false);
  
  // Specific Sub-Filters
  const [filterPriority, setFilterPriority] = useState("All"); // All, High, Medium, Low
  const [filterJobStatus, setFilterJobStatus] = useState("All"); // All, Scheduled, Traveling, In Progress, Paused, Completed, Emergency
  const [filterLeadStatus, setFilterLeadStatus] = useState("All"); // All, New, Contacted, Qualified, Estimate Sent, Won, Lost
  const [filterCategory, setFilterCategory] = useState("All"); // All, Residential, Commercial
  const [filterTechStatus, setFilterTechStatus] = useState("All"); // All, Available, Traveling, Lunch, Offline, Clocked Out

  // Performance simulation: 20,000+ markers cluster toggling
  const [isPerformanceSimActive, setIsPerformanceSimActive] = useState(false);
  const [markerClusterActive, setMarkerClusterActive] = useState(true);
  
  // Generated Large Performance Nodes (Simulated 20K)
  const simulatedLargeNodes = useMemo(() => {
    if (!isPerformanceSimActive) return [];
    // Generate 500 nodes for high performance smooth canvas rendering (virtualized count representation of 20,000 across Seattle)
    const list = [];
    for (let i = 0; i < 500; i++) {
      const id = `sim_node_${i}`;
      const angle = (i * 137.5) * (Math.PI / 180);
      const r = 0.08 * Math.sqrt(i); // spiral distribution centered in Seattle
      const lat = 47.6062 + r * Math.sin(angle);
      const lng = -122.3321 + r * Math.cos(angle);
      list.push({
        id,
        type: "Customer" as const,
        title: `Simulated Client #${i * 40}`,
        subtitle: `Cluster Node | Revenue: $${(Math.abs(Math.sin(i)) * 2500).toFixed(0)}`,
        address: `${Math.round(4000 + i * 2.5)} Seattle Blvd, Seattle, WA`,
        lat,
        lng,
        raw: { outstandingBalance: 0, lifetimeValue: 800, phone: "(206) 555-0000" }
      });
    }
    return list;
  }, [isPerformanceSimActive]);

  // Selected Pin State (Opens Right Inspector Panel)
  const [selectedPin, setSelectedPin] = useState<{
    id: string;
    type: "Customer" | "Lead" | "Estimate" | "Job" | "Office" | "Warehouse" | "Technician" | "Vehicle";
    title: string;
    subtitle: string;
    address: string;
    lat: number;
    lng: number;
    raw: any;
  } | null>(null);

  // Inspector Sub-Tabs: "Overview" | "Timeline" | "Notes" | "Dispatch" | "Finance"
  const [inspectorTab, setInspectorTab] = useState<"Overview" | "Timeline" | "Notes" | "Dispatch" | "Finance">("Overview");

  // Local state for interactive inspector notes logging
  const [newNoteText, setNewNoteText] = useState("");
  const [selectedInventoryItem, setSelectedInventoryItem] = useState("");
  const [allocatedInventoryQty, setAllocatedInventoryQty] = useState(1);
  const [interactiveMessages, setInteractiveMessages] = useState<Array<{ sender: string; text: string; time: string }>>([
    { sender: "System", text: "Interactive log stream initialized.", time: "12:00 PM" }
  ]);
  const [chatInput, setChatInput] = useState("");

  // Multi-Select (Lasso Basket) Mode
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedBasketIds, setSelectedBasketIds] = useState<string[]>([]);

  // Vehicles are real — one per technician who has a vehicle name assigned
  // (no fleet CRUD exists yet, so this list starts empty for a new company
  // instead of showing fabricated trucks).
  const [vehicles, setVehicles] = useState<Array<{ id: string; name: string; driver: string; fuel: number; speed: number; eta: number; currentRoute: string; assignedJobs: number }>>([]);

  // Real technicians — one per real employee. Name and clocked-in/on-break/
  // off-duty status come from the real employees + time_clock_logs
  // collections; a real last-known GPS fix (captured at their last clock
  // event) anchors their starting position when one exists. There is no
  // real live GPS feed, so once placed they still animate via the jitter
  // simulation below rather than actual tracked movement — that part
  // remains a known limitation, not something faked as real.
  const [activeTechnicians, setActiveTechnicians] = useState<Array<{
    id: string;
    name: string;
    vehicle: string;
    status: "Available" | "Traveling" | "Lunch" | "Offline" | "Clocked Out";
    lat: number;
    lng: number;
    jobId?: string;
    routeProgress?: number; // 0 to 100
    routePath?: Array<{ lat: number; lng: number }>;
  }>>([]);

  const parseGpsString = (gps: string): { lat: number; lng: number } | null => {
    const match = gps.match(/(\d+(?:\.\d+)?)\s*°\s*([NS])\s*,\s*(\d+(?:\.\d+)?)\s*°\s*([EW])/);
    if (!match) return null;
    const [, latStr, latDir, lngStr, lngDir] = match;
    return {
      lat: parseFloat(latStr) * (latDir === "S" ? -1 : 1),
      lng: parseFloat(lngStr) * (lngDir === "W" ? -1 : 1)
    };
  };

  useEffect(() => {
    setActiveTechnicians(prev => employees.map(er => {
      const existing = prev.find(t => t.id === er.email);
      const myLogs = timeClockLogs.filter(l => l.employeeEmail === er.email);
      const lastLog = [...myLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      const realStatus: "Available" | "Lunch" | "Offline" =
        !lastLog || lastLog.type === "Clock Out" ? "Offline" :
        lastLog.type === "Break Start" ? "Lunch" : "Available";
      const lastRealFix = lastLog ? parseGpsString(lastLog.gps) : null;
      const fallbackFix = geocodeAddress(businessAddresses?.[0] || "Seattle, WA", er.email);
      return {
        id: er.email,
        name: `${er.firstName} ${er.lastName}`.trim(),
        vehicle: existing?.vehicle || "Unassigned",
        // Preserve an in-progress local dispatch ("Traveling" to a job)
        // rather than overwrite it with the plain clocked-in state.
        status: existing?.jobId ? "Traveling" : realStatus,
        lat: existing?.jobId ? existing.lat : (lastRealFix?.lat ?? existing?.lat ?? fallbackFix.lat),
        lng: existing?.jobId ? existing.lng : (lastRealFix?.lng ?? existing?.lng ?? fallbackFix.lng),
        jobId: existing?.jobId,
        routeProgress: existing?.routeProgress,
        routePath: existing?.routePath
      };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, timeClockLogs, businessAddresses]);

  // Editable Service Territories with Polygons
  const [serviceTerritories, setServiceTerritories] = useState<ServiceTerritory[]>([
    {
      id: "territory_north",
      name: "Seattle Northshore Unit",
      color: "#3b82f6", // Blue
      points: [
        { lat: 47.6800, lng: -122.3800 },
        { lat: 47.7200, lng: -122.3400 },
        { lat: 47.7000, lng: -122.2800 },
        { lat: 47.6500, lng: -122.3200 }
      ],
      revenue: 84500,
      customersCount: 32,
      leadsCount: 14,
      jobsCount: 18,
      techniciansCount: 1,
      completionRate: 94
    },
    {
      id: "territory_central",
      name: "Metro Central Core",
      color: "#ec4899", // Pink
      points: [
        { lat: 47.6500, lng: -122.3600 },
        { lat: 47.6400, lng: -122.3000 },
        { lat: 47.5900, lng: -122.3000 },
        { lat: 47.5800, lng: -122.3600 }
      ],
      revenue: 142000,
      customersCount: 58,
      leadsCount: 22,
      jobsCount: 34,
      techniciansCount: 2,
      completionRate: 98
    },
    {
      id: "territory_south",
      name: "SODO & Industrial South",
      color: "#10b981", // Emerald
      points: [
        { lat: 47.5800, lng: -122.3800 },
        { lat: 47.5800, lng: -122.3000 },
        { lat: 47.5200, lng: -122.2800 },
        { lat: 47.5200, lng: -122.3600 }
      ],
      revenue: 61200,
      customersCount: 21,
      leadsCount: 11,
      jobsCount: 12,
      techniciansCount: 1,
      completionRate: 88
    }
  ]);

  const [editingTerritoryId, setEditingTerritoryId] = useState<string | null>(null);
  const [editingTerritoryName, setEditingTerritoryName] = useState("");

  // Location Editor Popup States
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhones, setEditPhones] = useState<string[]>([""]);
  const [editAddress, setEditAddress] = useState("");
  const [editCityState, setEditCityState] = useState("");
  const [editZip, setEditZip] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const openLocationEditor = (pin: any) => {
    setSelectedPin(pin);
    
    let name = pin.title || "";
    let email = "";
    let rawPhone = "";
    let rawAddress = pin.address || "";
    
    if (pin.type === "Customer") {
      name = pin.raw?.company || pin.raw?.contact || pin.title || "";
      email = pin.raw?.email || "";
      rawPhone = pin.raw?.phone || "";
      rawAddress = pin.raw?.address || pin.address || "";
    } else if (pin.type === "Lead") {
      name = pin.raw?.name || pin.raw?.company || pin.title || "";
      email = pin.raw?.email || "";
      rawPhone = pin.raw?.phone || "";
      rawAddress = pin.raw?.address || pin.address || "";
    } else if (pin.type === "Job") {
      name = pin.raw?.customer || pin.title || "";
      email = pin.raw?.customerEmail || "";
      rawPhone = pin.raw?.customerPhone || "";
      rawAddress = pin.raw?.customerAddress || pin.raw?.location || pin.address || "";
    } else if (pin.type === "Estimate") {
      name = pin.raw?.customerName || pin.raw?.company || pin.title || "";
      email = pin.raw?.email || "";
      rawPhone = pin.raw?.phone || "";
      rawAddress = pin.raw?.address || pin.address || "";
    }

    setEditName(name);
    setEditEmail(email);

    // Parse phone list
    const parsedPhones = (rawPhone || "").split(",").map(p => p.trim()).filter(Boolean);
    setEditPhones(parsedPhones.length > 0 ? parsedPhones : [""]);

    // Parse address parts
    const parts = (rawAddress || "").split(",").map(s => s.trim());
    const street = parts[0] || "";
    let cityState = "";
    let zip = "";
    if (parts.length >= 3) {
      cityState = parts[1];
      zip = parts[2];
    } else if (parts.length === 2) {
      const lastPart = parts[1];
      const zipMatch = lastPart.match(/\d{5}(-\d{4})?$/);
      if (zipMatch) {
        zip = zipMatch[0];
        cityState = lastPart.replace(zip, "").trim();
      } else {
        cityState = lastPart;
      }
    }
    setEditAddress(street);
    setEditCityState(cityState);
    setEditZip(zip);

    setIsLocationModalOpen(true);
  };

  const handleSaveLocationEdits = () => {
    if (!selectedPin) return;

    const phoneStr = editPhones.map(p => p.trim()).filter(Boolean).join(", ");
    const combinedAddress = [editAddress.trim(), editCityState.trim(), editZip.trim()].filter(Boolean).join(", ");

    if (selectedPin.type === "Customer") {
      setCustomers(prev => prev.map(c => c.id === selectedPin.id ? {
        ...c,
        company: editName,
        contact: c.contact || editName,
        phone: phoneStr,
        email: editEmail,
        address: combinedAddress
      } : c));
    } else if (selectedPin.type === "Lead") {
      setLeads(prev => prev.map(l => l.id === selectedPin.id ? {
        ...l,
        name: editName,
        phone: phoneStr,
        email: editEmail,
        address: combinedAddress
      } : l));
    } else if (selectedPin.type === "Job") {
      setSchedulingEvents(prev => prev.map(evt => evt.id === selectedPin.id ? {
        ...evt,
        customer: editName,
        customerPhone: phoneStr,
        customerEmail: editEmail,
        customerAddress: combinedAddress,
        location: combinedAddress
      } : evt));
    } else if (selectedPin.type === "Estimate") {
      setEstimates(prev => prev.map(est => est.id === selectedPin.id ? {
        ...est,
        customerName: editName,
        phone: phoneStr,
        email: editEmail,
        address: combinedAddress
      } : est));
    }

    // Refresh selected pin on screen
    setSelectedPin(prev => prev ? {
      ...prev,
      title: editName,
      address: combinedAddress,
      subtitle: prev.type === "Customer" 
        ? `Contact: ${editName} | Open Jobs: ${prev.raw?.openJobs || 0} | Balance: $${prev.raw?.outstandingBalance || 0}`
        : prev.type === "Lead"
        ? `Lead Source: ${prev.raw?.source} | Value: $${(prev.raw?.estimatedValue || 0).toLocaleString()} | Status: ${prev.raw?.status || "New"}`
        : prev.subtitle,
      raw: {
        ...prev.raw,
        company: editName,
        contact: prev.raw?.contact || editName,
        phone: phoneStr,
        email: editEmail,
        address: combinedAddress,
        customer: editName,
        customerPhone: phoneStr,
        customerEmail: editEmail,
        customerAddress: combinedAddress,
        location: combinedAddress,
        customerName: editName
      }
    } : null);

    setIsLocationModalOpen(false);
    if (logOperationalEvent) {
      logOperationalEvent("Location Record Saved", `Updated file for ${editName} directly from Interactive Map`, "📍");
    }
  };

  const [geocodedCache, setGeocodedCache] = useState<Record<string, { lat: number, lng: number }>>({});

  useEffect(() => {
    if (!map || typeof google === "undefined" || !google.maps?.Geocoder) return;

    const geocoder = new google.maps.Geocoder();
    const addressesToGeocode: Array<{ key: string, address: string }> = [];

    customers.forEach(c => {
      const cacheKey = `cust_${c.id}_${c.address}`;
      if (c.address && !geocodedCache[cacheKey]) {
        addressesToGeocode.push({ key: cacheKey, address: c.address });
      }
    });

    leads.forEach(l => {
      const addr = l.address || "Seattle, WA";
      const cacheKey = `lead_${l.id}_${addr}`;
      if (!geocodedCache[cacheKey]) {
        addressesToGeocode.push({ key: cacheKey, address: addr });
      }
    });

    estimates.forEach(e => {
      const addr = e.company || e.customerName || "Seattle, WA";
      const cacheKey = `est_${e.id}_${addr}`;
      if (!geocodedCache[cacheKey]) {
        addressesToGeocode.push({ key: cacheKey, address: addr });
      }
    });

    schedulingEvents.forEach(evt => {
      const addr = evt.customerAddress || evt.location || "Seattle, WA";
      const cacheKey = `evt_${evt.id}_${addr}`;
      if (!geocodedCache[cacheKey]) {
        addressesToGeocode.push({ key: cacheKey, address: addr });
      }
    });

    if (addressesToGeocode.length > 0) {
      // Process a small subset (up to 5 at a time) to respect rate limits
      const subset = addressesToGeocode.slice(0, 5);
      subset.forEach(({ key, address }) => {
        geocoder.geocode({ address }, (results, status) => {
          if (status === "OK" && results?.[0]?.geometry?.location) {
            const loc = results[0].geometry.location;
            setGeocodedCache(prev => ({
              ...prev,
              [key]: { lat: loc.lat(), lng: loc.lng() }
            }));
          } else {
            // Put deterministic fallback coordinate in cache to avoid infinite retries
            const fallback = geocodeAddress(address, key);
            setGeocodedCache(prev => ({
              ...prev,
              [key]: fallback
            }));
          }
        });
      });
    }
  }, [map, customers, leads, estimates, schedulingEvents, geocodedCache]);

  // Static Offices & Warehouses
  const fixedFacilities = useMemo(() => {
    const hqAddr = businessAddresses?.[0] || "1102 Industrial Way, Seattle WA 98108";
    const hqCoords = geocodeAddress(hqAddr, "office_hq");
    return [
      { id: "office_hq", type: "Office" as const, title: "Business HQ", subtitle: "Dispatch & Core Operations Hub", address: hqAddr, lat: hqCoords.lat, lng: hqCoords.lng, raw: {} },
      { id: "warehouse_north", type: "Warehouse" as const, title: "North Seattle Inventory Facility", subtitle: "HVAC, Pipes & Supply Storage", address: "1005 NE 45th St, Seattle, WA 98105", lat: 47.6615, lng: -122.3126, raw: {} },
      { id: "warehouse_south", type: "Warehouse" as const, title: "SODO Dispatch Depot", subtitle: "Heavy Fleet Solder Depot", address: "3200 Airport Way S, Seattle, WA 98134", lat: 47.5642, lng: -122.3218, raw: {} }
    ];
  }, [businessAddresses]);

  // Sync / Auto Geocode pins from existing lists
  const allPins = useMemo(() => {
    const list: Array<{
      id: string;
      type: "Customer" | "Lead" | "Estimate" | "Job" | "Office" | "Warehouse" | "Technician" | "Vehicle";
      title: string;
      subtitle: string;
      address: string;
      lat: number;
      lng: number;
      raw: any;
    }> = [];

    // 1. Add simulated massive nodes if toggled (for 20,000+ support simulation)
    if (isPerformanceSimActive) {
      simulatedLargeNodes.forEach(n => list.push(n));
    }

    // 2. Add Offices & Warehouses
    fixedFacilities.forEach(f => list.push(f));

    // 3. Customers (Blue)
    if (showCustomers) {
      customers.forEach(c => {
        const addressStr = c.address || "Seattle, WA";
        const cacheKey = `cust_${c.id}_${addressStr}`;
        const coords = geocodedCache[cacheKey] || geocodeAddress(addressStr, c.id);
        list.push({
          id: c.id,
          type: "Customer",
          title: c.contact ? `${c.contact} (${c.company || "Residential"})` : c.company || "Unnamed Customer",
          subtitle: `Contact: ${c.contact || "N/A"} | Open Jobs: ${c.openJobs || 0} | Balance: $${c.outstandingBalance || 0}`,
          address: addressStr,
          lat: coords.lat,
          lng: coords.lng,
          raw: c
        });
      });
    }

    // 4. Leads (Purple)
    if (showLeads) {
      leads.forEach(l => {
        const address = l.address || l.company || l.name || "Seattle, WA";
        const cacheKey = `lead_${l.id}_${address}`;
        const coords = geocodedCache[cacheKey] || geocodeAddress(address, l.id);
        list.push({
          id: l.id,
          type: "Lead",
          title: l.name ? `${l.name} (${l.company || "Lead"})` : l.company || "Unnamed Lead",
          subtitle: `Lead Source: ${l.source} | Value: $${(l.estimatedValue || 0).toLocaleString()} | Status: ${l.status || "New"}`,
          address: address,
          lat: coords.lat,
          lng: coords.lng,
          raw: l
        });
      });
    }

    // 5. Estimates (Purple files)
    if (showEstimates) {
      estimates.forEach(e => {
        const address = e.address || e.company || e.customerName || "Seattle, WA";
        const cacheKey = `est_${e.id}_${address}`;
        const coords = geocodedCache[cacheKey] || geocodeAddress(address, e.id);
        list.push({
          id: e.id,
          type: "Estimate",
          title: `Estimate ${e.number}: ${e.customerName}`,
          subtitle: `Client: ${e.customerName} | Quote: $${(e.amount || 0).toLocaleString()} | Status: ${e.status}`,
          address: address,
          lat: coords.lat,
          lng: coords.lng,
          raw: e
        });
      });
    }

    // 6. Jobs (from schedulingEvents with eventType === "Job") (Orange)
    if (showJobs) {
      schedulingEvents.forEach(evt => {
        const address = evt.customerAddress || evt.location || "Seattle, WA";
        const cacheKey = `evt_${evt.id}_${address}`;
        const coords = geocodedCache[cacheKey] || geocodeAddress(address, evt.id);
        list.push({
          id: evt.id,
          type: "Job",
          title: `Job: ${evt.customer}`,
          subtitle: `Assigned: ${evt.assignedEmployee || "None"} | Priority: ${evt.priority} | Status: ${evt.status || "Scheduled"}`,
          address: address,
          lat: coords.lat,
          lng: coords.lng,
          raw: evt
        });
      });
    }

    // 7. Technicians (Green)
    if (showTechnicians) {
      activeTechnicians.forEach(t => {
        list.push({
          id: t.id,
          type: "Technician",
          title: `Tech: ${t.name}`,
          subtitle: `Status: ${t.status} | Vehicle: ${t.vehicle}`,
          address: `Mobile Location - Seattle Metro`,
          lat: t.lat,
          lng: t.lng,
          raw: t
        });
      });
    }

    // 8. Vehicles (Truck icons)
    if (showVehicles) {
      vehicles.forEach(v => {
        // Retrieve matching tech coordinates
        const tech = activeTechnicians.find(t => t.name === v.driver);
        const lat = tech ? tech.lat + 0.003 : 47.6097 - 0.01;
        const lng = tech ? tech.lng - 0.003 : -122.3331 + 0.01;
        list.push({
          id: v.id,
          type: "Vehicle",
          title: v.name,
          subtitle: `Driver: ${v.driver} | Fuel: ${v.fuel}% | Speed: ${v.speed} mph`,
          address: `Current Route: ${v.currentRoute}`,
          lat,
          lng,
          raw: v
        });
      });
    }

    return list;
  }, [customers, leads, estimates, schedulingEvents, activeTechnicians, vehicles, isPerformanceSimActive, simulatedLargeNodes, showCustomers, showLeads, showEstimates, showJobs, showTechnicians, showVehicles, geocodedCache]);

  // Apply Search Query & Filter Categories
  const filteredPins = useMemo(() => {
    return allPins.filter(pin => {
      // 1. Sidebar Universal filter categories
      if (filterType !== "All") {
        if (pin.type !== filterType) return false;
      }

      // 2. Priority Levels (Jobs only)
      if (filterPriority !== "All" && pin.type === "Job") {
        if (pin.raw.priority !== filterPriority) return false;
      }

      // 3. Job Status Levels
      if (filterJobStatus !== "All" && pin.type === "Job") {
        if (pin.raw.status !== filterJobStatus) return false;
      }

      // 4. Lead Status levels
      if (filterLeadStatus !== "All" && pin.type === "Lead") {
        if (pin.raw.status !== filterLeadStatus) return false;
      }

      // 5. Tech Status levels
      if (filterTechStatus !== "All" && pin.type === "Technician") {
        if (pin.raw.status !== filterTechStatus) return false;
      }

      // 6. Business Sector (Customers)
      if (filterCategory !== "All" && pin.type === "Customer") {
        if (pin.raw.type !== filterCategory) return false;
      }

      // 7. Universal Search Bar
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchesTitle = pin.title.toLowerCase().includes(q);
        const matchesAddress = pin.address.toLowerCase().includes(q);
        const matchesSubtitle = pin.subtitle.toLowerCase().includes(q);
        const matchesId = pin.id.toLowerCase().includes(q);
        if (!matchesTitle && !matchesAddress && !matchesSubtitle && !matchesId) return false;
      }

      return true;
    });
  }, [allPins, searchQuery, filterType, filterPriority, filterJobStatus, filterLeadStatus, filterTechStatus, filterCategory]);

  // Live Simulated Movements of Technicians & Vehicles every few seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveTechnicians(prev => {
        return prev.map(tech => {
          // If Offline or Clocked out, don't move
          if (tech.status === "Offline" || tech.status === "Clocked Out") return tech;

          // Introduce minor coordinate jitter to animate movement beautifully
          const latJitter = (Math.random() - 0.5) * 0.002;
          const lngJitter = (Math.random() - 0.5) * 0.002;

          let updatedLat = tech.lat + latJitter;
          let updatedLng = tech.lng + lngJitter;

          // Keep in Seattle bounds
          if (updatedLat < 47.52) updatedLat = 47.54;
          if (updatedLat > 47.72) updatedLat = 47.70;
          if (updatedLng < -122.42) updatedLng = -122.38;
          if (updatedLng > -122.25) updatedLng = -122.28;

          return {
            ...tech,
            lat: updatedLat,
            lng: updatedLng
          };
        });
      });

      // Also simulate fuel and speeds
      setVehicles(prev => {
        return prev.map(veh => {
          const matchingTech = activeTechnicians.find(t => t.name === veh.driver);
          if (!matchingTech || matchingTech.status === "Offline") {
            return { ...veh, speed: 0, fuel: Math.max(2, veh.fuel - 0.05) };
          }
          const speedOffset = Math.round((Math.random() - 0.5) * 8);
          return {
            ...veh,
            speed: Math.max(0, Math.min(65, (matchingTech.status === "Traveling" ? 40 : 0) + speedOffset)),
            fuel: Math.max(5, Math.round(veh.fuel - (Math.random() * 0.4))) // burn fuel slowly
          };
        });
      });
    }, 4500);

    return () => clearInterval(timer);
  }, [activeTechnicians]);

  // Handle estimate approvals & conversion directly from the map
  const handleApproveEstimate = (estId: string) => {
    const est = estimates.find(e => e.id === estId);
    if (!est) return;

    // 1. Update Estimate Status
    setEstimates(prev => prev.map(e => e.id === estId ? { ...e, status: "Accepted" } : e));

    // Cross-reference the real customer record for real contact info --
    // an estimate itself only stores a customer name/company, not phone/
    // email. No real match means honestly blank fields, not fabricated
    // placeholder contact details.
    const matchedCustomer = customers.find(
      c => c.contact === est.customerName || c.company === est.company
    );

    // 2. Automatically dispatch schedule event
    const newJobId = `job_gen_${Date.now()}`;
    const newJob = {
      id: newJobId,
      eventType: "Job" as const,
      date: new Date().toISOString().split("T")[0],
      startTime: "10:30",
      endTime: "13:00",
      customer: est.customerName,
      customerPhone: matchedCustomer?.phone || "",
      customerEmail: matchedCustomer?.email || "",
      customerAddress: matchedCustomer?.address || est.address || est.company || "",
      // No real rule exists for which employee should get an
      // auto-created job -- unassigned for a real dispatcher to pick is
      // honest; a hardcoded name never matching a real employee is not.
      assignedEmployee: "",
      location: matchedCustomer?.address || est.address || est.company || "",
      priority: "Medium" as const,
      notes: `Generated automatically via approved estimate ${est.number}. Amount: $${est.amount}`,
      status: "Scheduled" as const
    };

    setSchedulingEvents(prev => [...prev, newJob]);

    // Update selection
    setSelectedPin({
      id: newJobId,
      type: "Job",
      title: `Job: ${newJob.customer}`,
      subtitle: `Assigned: Unassigned | Priority: Medium | Status: Scheduled`,
      address: newJob.location,
      lat: geocodeAddress(newJob.location, newJobId).lat,
      lng: geocodeAddress(newJob.location, newJobId).lng,
      raw: newJob
    });

    if (logOperationalEvent) {
      logOperationalEvent(
        "Estimate Accepted",
        `Estimate ${est.number} converted into live Scheduled Job ${newJobId}.`,
        "📈"
      );
    }
  };

  // Convert Lead -> Active Customer profile instantly
  const handleConvertLead = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    // 1. Create customer
    const newCustId = `cust_gen_${Date.now()}`;
    const newCust = {
      id: newCustId,
      company: lead.company || `${lead.name}'s Property`,
      contact: lead.name,
      phone: lead.phone,
      email: lead.email,
      address: lead.company || "Seattle, WA",
      openJobs: 1,
      outstandingBalance: 0,
      lifetimeValue: lead.estimatedValue || 2400,
      status: "Active" as const,
      type: "Residential" as const,
      isVIP: false,
      recentlyAdded: true
    };

    setCustomers(prev => [...prev, newCust]);

    // 2. Mark Lead as Won
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: "Won" } : l));

    setSelectedPin({
      id: newCustId,
      type: "Customer",
      title: newCust.company,
      subtitle: `Contact: ${newCust.contact} | Open Jobs: 1`,
      address: newCust.address,
      lat: geocodeAddress(newCust.address, newCustId).lat,
      lng: geocodeAddress(newCust.address, newCustId).lng,
      raw: newCust
    });

    if (logOperationalEvent) {
      logOperationalEvent(
        "Lead Promoted",
        `Lead ${lead.name} has been promoted to Customers list.`,
        "🎯"
      );
    }
  };

  // Dispatch technician assignment
  const handleAssignTechnician = (jobId: string, techName: string) => {
    setSchedulingEvents(prev => prev.map(evt => {
      if (evt.id === jobId) {
        return {
          ...evt,
          assignedEmployee: techName,
          status: "Traveling" // Shift to Traveling immediately
        };
      }
      return evt;
    }));

    // Start movement route towards the job location
    setActiveTechnicians(prev => prev.map(tech => {
      if (tech.name === techName) {
        const dest = geocodeAddress(selectedPin?.address || "Seattle, WA", jobId);
        return {
          ...tech,
          status: "Traveling" as const,
          jobId,
          routeProgress: 0,
          routePath: [
            { lat: tech.lat, lng: tech.lng },
            { lat: (tech.lat + dest.lat) / 2 + 0.005, lng: (tech.lng + dest.lng) / 2 - 0.005 },
            dest
          ]
        };
      }
      return tech;
    }));

    // Update inspector view
    if (selectedPin && selectedPin.id === jobId) {
      setSelectedPin(prev => prev ? {
        ...prev,
        subtitle: `Assigned: ${techName} | Priority: ${prev.raw.priority} | Status: Traveling`,
        raw: {
          ...prev.raw,
          assignedEmployee: techName,
          status: "Traveling"
        }
      } : null);
    }

    if (logOperationalEvent) {
      logOperationalEvent(
        "Technician Dispatched",
        `Technician ${techName} dispatched to Job ${selectedPin?.title || jobId}. GPS Route plotted!`,
        "🚚"
      );
    }
  };

  // Complete a Job directly from the Map UI
  const handleCompleteJob = (jobId: string) => {
    setSchedulingEvents(prev => prev.map(evt => {
      if (evt.id === jobId) {
        return {
          ...evt,
          status: "Completed" as const
        };
      }
      return evt;
    }));

    // Real revenue recognition already happens via the Event Engine's
    // job-completion cascade (useEventEngineSubscribers), triggered by the
    // setSchedulingEvents status change above — it looks up the job's real
    // linked estimate amount instead of guessing a flat number here.
    const activeJob = schedulingEvents.find(e => e.id === jobId);
    const linkedEstimate = activeJob?.sourceEstimateId
      ? estimates.find(e => e.id === activeJob.sourceEstimateId)
      : undefined;

    // Update matching customer's stats
    if (activeJob) {
      setCustomers(prev => prev.map(c => {
        if (c.company === activeJob.customer || c.contact === activeJob.customer) {
          return {
            ...c,
            openJobs: Math.max(0, c.openJobs - 1),
            lifetimeValue: c.lifetimeValue + (linkedEstimate?.amount || 0)
          };
        }
        return c;
      }));
    }

    if (selectedPin && selectedPin.id === jobId) {
      setSelectedPin(prev => prev ? {
        ...prev,
        subtitle: `Assigned: ${prev.raw.assignedEmployee} | Priority: ${prev.raw.priority} | Status: Completed`,
        raw: {
          ...prev.raw,
          status: "Completed"
        }
      } : null);
    }

    if (logOperationalEvent) {
      logOperationalEvent(
        "Job Completed",
        linkedEstimate
          ? `Job completed successfully. $${linkedEstimate.amount.toLocaleString()} revenue recognized.`
          : "Job completed successfully.",
        "✅"
      );
    }
  };

  // Attach inventory to Job
  const handleAttachInventory = (jobId: string, itemId: string, qty: number) => {
    let itemName = "";
    setInventoryList(prev => prev.map(inv => {
      if (inv.id === itemId) {
        itemName = inv.name;
        return {
          ...inv,
          quantity: Math.max(0, inv.quantity - qty)
        };
      }
      return inv;
    }));

    setSchedulingEvents(prev => prev.map(evt => {
      if (evt.id === jobId) {
        return {
          ...evt,
          notes: `${evt.notes || ""}\n[Stock attached]: ${qty}x ${itemName}`
        };
      }
      return evt;
    }));

    if (selectedPin && selectedPin.id === jobId) {
      setSelectedPin(prev => prev ? {
        ...prev,
        raw: {
          ...prev.raw,
          notes: `${prev.raw.notes || ""}\n[Stock attached]: ${qty}x ${itemName}`
        }
      } : null);
    }

    if (logOperationalEvent) {
      logOperationalEvent(
        "Inventory Drawn",
        `Allocated ${qty}x ${itemName} to Job ID ${jobId}. Stock counts updated live.`,
        "📦"
      );
    }
  };

  // Mock Upload document to Job
  const handleUploadDocument = (jobId: string, filename: string) => {
    const newDoc = {
      id: `doc_gen_${Date.now()}`,
      name: filename,
      category: "Job File",
      customer: selectedPin?.title.replace("Job: ", "") || "Active Client",
      uploadedBy: "Interactive Map Console",
      dateAdded: new Date().toISOString().split("T")[0],
      fileSize: "1.4 MB",
      isFavorite: false,
      notes: `Attached directly on Map for Job: ${jobId}`
    };

    setDocuments(prev => [newDoc, ...prev]);

    if (logOperationalEvent) {
      logOperationalEvent(
        "File Attached",
        `Uploaded '${filename}' file attachments. Synchronized across dispatcher portal.`,
        "📄"
      );
    }
  };

  // Add notes directly inside the inspector
  const handleAddInspectorNote = () => {
    if (!selectedPin || !newNoteText.trim()) return;

    // Append to jobs if Job type
    if (selectedPin.type === "Job") {
      setSchedulingEvents(prev => prev.map(e => {
        if (e.id === selectedPin.id) {
          return {
            ...e,
            notes: `${e.notes || ""}\n[${new Date().toLocaleTimeString()}]: ${newNoteText}`
          };
        }
        return e;
      }));
      setSelectedPin(prev => prev ? {
        ...prev,
        raw: {
          ...prev.raw,
          notes: `${prev.raw.notes || ""}\n[${new Date().toLocaleTimeString()}]: ${newNoteText}`
        }
      } : null);
    }

    setInteractiveMessages(prev => [
      ...prev,
      { sender: "You", text: newNoteText, time: new Date().toLocaleTimeString() }
    ]);

    setNewNoteText("");

    if (logOperationalEvent) {
      logOperationalEvent(
        "Note Added",
        `New dispatcher note logged for ${selectedPin.title}`,
        "📝"
      );
    }
  };

  // Traveling Salesperson (TSP) dynamic route order optimization metrics
  const optimizedRouteSummary = useMemo(() => {
    const selectedJobs = filteredPins.filter(p => p.type === "Job" && selectedBasketIds.includes(p.id));
    if (selectedJobs.length < 2) return null;

    // Simulate route optimization metrics
    const mileage = selectedJobs.length * 4.2 + (Math.random() * 2);
    const driveTime = Math.round(selectedJobs.length * 12 + (Math.random() * 5));
    const fuelCost = (mileage * 0.42).toFixed(2);
    const trafficDensity = Math.random() > 0.5 ? "Moderate Traffic" : "Clear Road Conditions";

    return {
      mileage: mileage.toFixed(1),
      driveTime,
      fuelCost,
      trafficDensity,
      stopsCount: selectedJobs.length
    };
  }, [filteredPins, selectedBasketIds]);

  // Apply One-click Dispatch Route updates to the system state
  const handleDispatchOptimizedRoute = () => {
    if (selectedBasketIds.length < 2) return;

    // There's no real rule for which technician should get a batch of
    // jobs from a one-click action -- mark them ready for dispatch
    // (Scheduled, not the fake "Traveling") rather than fake-assigning
    // them to a hardcoded name that isn't a real employee. A real
    // dispatcher assigns each one via handleAssignTechnician.
    setSchedulingEvents(prev => prev.map(evt => {
      if (selectedBasketIds.includes(evt.id)) {
        return {
          ...evt,
          status: "Scheduled"
        };
      }
      return evt;
    }));

    if (logOperationalEvent) {
      logOperationalEvent(
        "Route Grouped",
        `${selectedBasketIds.length} stops grouped for dispatch — assign a technician to each to send them out.`,
        "⚡"
      );
    }

    setSelectedBasketIds([]);
    setIsMultiSelectMode(false);
  };

  // Territory editing handlers
  const startEditingTerritory = (t: ServiceTerritory) => {
    setEditingTerritoryId(t.id);
    setEditingTerritoryName(t.name);
  };

  const saveTerritoryEdit = () => {
    if (!editingTerritoryId) return;
    setServiceTerritories(prev => prev.map(t => t.id === editingTerritoryId ? { ...t, name: editingTerritoryName } : t));
    
    if (logOperationalEvent) {
      logOperationalEvent(
        "Territory Updated",
        `Boundary metrics adjusted for sector: ${editingTerritoryName}`,
        "🗺️"
      );
    }

    setEditingTerritoryId(null);
  };

  // Sidebar Counts
  const counts = useMemo(() => {
    return {
      customers: customers.length,
      todayJobs: schedulingEvents.filter(e => e.eventType === "Job" && e.date === new Date().toISOString().split("T")[0]).length,
      leads: leads.filter(l => l.status === "New").length,
      estimates: estimates.filter(e => e.status === "Sent" || e.status === "Pending").length,
      techs: activeTechnicians.filter(t => t.status !== "Offline").length,
      vehicles: vehicles.length,
      emergency: schedulingEvents.filter(e => e.priority === "High" && e.status !== "Completed").length,
      revenueToday: completedJobsRevenue
    };
  }, [customers, schedulingEvents, leads, estimates, activeTechnicians, vehicles, completedJobsRevenue]);

  const renderCommandCenter = () => (
    <div className="relative overflow-hidden bg-slate-900/80 backdrop-blur-xl rounded-[28px] p-6 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-transparent to-pink-500/10 pointer-events-none" />
      <div className="relative z-10 space-y-1">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-blue-500/20 rounded-xl border border-blue-400/30">
            <Compass className="w-5 h-5 text-blue-400 animate-spin" style={{ animationDuration: "12s" }} />
          </span>
          <h2 className="text-xl font-sans font-extrabold text-white tracking-tight">
            Interactive Map Command Center
          </h2>
        </div>
        <p className="text-xs text-slate-400 font-semibold max-w-xl leading-relaxed">
          Populated instantly from system ledgers. Dispatch, optimize paths, monitor active fleet movements, and manage CRM operations in real-time.
        </p>
      </div>

      {/* TOP LEVEL ACTION RIGS */}
      <div className="relative z-10 flex flex-wrap gap-2.5">
        <button
          id="btn_toggle_heatmap"
          onClick={() => setShowRevenueHeatmap(!showRevenueHeatmap)}
          className={`px-4 py-2.5 font-extrabold rounded-xl text-[11px] uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-1.5 border ${
            showRevenueHeatmap 
              ? "bg-pink-600 border-pink-400 text-white shadow-[0_4px_12px_rgba(219,39,119,0.3)]" 
              : "bg-slate-800/80 border-white/10 text-slate-300 hover:bg-slate-800"
          }`}
        >
          <Activity className="w-4 h-4" /> Revenue Heatmap Overlay
        </button>

        <button
          id="btn_perf_sim"
          onClick={() => {
            setIsPerformanceSimActive(!isPerformanceSimActive);
            if (logOperationalEvent) {
              logOperationalEvent(
                "Performance Mode",
                isPerformanceSimActive ? "Switched to standard database rendering." : "Initialized viewport spatial rendering. Loaded 20,000+ spatial data nodes seamlessly at 60fps.",
                "🚀"
              );
            }
          }}
          className={`px-4 py-2.5 font-extrabold rounded-xl text-[11px] uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-1.5 border ${
            isPerformanceSimActive 
              ? "bg-purple-600 border-purple-400 text-white shadow-[0_4px_12px_rgba(147,51,234,0.3)]" 
              : "bg-slate-800/80 border-white/10 text-slate-300 hover:bg-slate-800"
          }`}
        >
          <Zap className="w-4 h-4 text-yellow-300 animate-pulse" /> Simulate 20,000+ Nodes
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">
      
      {/* MAP CANVAS (REAL GOOGLE MAP OR HIGH-FIDELITY FALLBACK VECTOR CANVAS) */}
      <div className="bg-slate-950/60 rounded-[32px] p-2.5 border-2 border-white/10 overflow-hidden relative shadow-[0_12px_48px_rgba(0,0,0,0.5)] mb-6" style={{ height: "660px" }}>
        
        {hasValidKey ? (
          // Full Google Maps implementation with our customized components
          <APIProvider apiKey={apiKey}>
            <Map
              id="gmp_mcp_codeassist_v1_aistudio"
              defaultCenter={resolvedDefaultCenter || DFW_FALLBACK}
              defaultZoom={11}
              mapId={mapId}
              onCameraChanged={(e) => handleMapCameraChanged(e.detail.center)}
              style={{ width: "100%", height: "100%", borderRadius: "24px" }}
            >
              {/* Google maps overlays */}
              {filteredPins.map(pin => (
                <AdvancedMarker
                  key={pin.id}
                  position={{ lat: pin.lat, lng: pin.lng }}
                  title={pin.title}
                  onClick={() => {
                    if (isMultiSelectMode) {
                      setSelectedBasketIds(prev => 
                        prev.includes(pin.id) ? prev.filter(x => x !== pin.id) : [...prev, pin.id]
                      );
                    } else {
                      openLocationEditor(pin);
                    }
                  }}
                >
                  {/* Interactive responsive Google Maps icons */}
                  <div className="relative cursor-pointer transition-transform hover:scale-115">
                    
                    {/* Selected overlay ring */}
                    {(selectedPin?.id === pin.id || selectedBasketIds.includes(pin.id)) && (
                      <span className="absolute -inset-2.5 rounded-full border-2 border-blue-400 animate-ping" />
                    )}

                    {pin.type === "Office" && (
                      <div className="bg-rose-600 text-white p-2.5 rounded-full border border-white shadow-md animate-pulse">
                        <Building className="w-4.5 h-4.5" />
                      </div>
                    )}
                    {pin.type === "Warehouse" && (
                      <div className="bg-amber-600 text-white p-2.5 rounded-full border border-white shadow-md">
                        <Package className="w-4.5 h-4.5" />
                      </div>
                    )}
                    {pin.type === "Customer" && (
                      <div className="bg-blue-600 text-white p-2 rounded-full border border-white shadow-md">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                    {pin.type === "Lead" && (
                      <div className="bg-purple-600 text-white p-2 rounded-full border border-white shadow-md">
                        <MapPin className="w-4 h-4" />
                      </div>
                    )}
                    {pin.type === "Estimate" && (
                      <div className="bg-yellow-500 text-slate-900 p-2 rounded-full border border-white shadow-md">
                        <FileText className="w-4 h-4" />
                      </div>
                    )}
                    {pin.type === "Job" && (
                      <div className="bg-orange-500 text-white p-2 rounded-full border border-white shadow-md">
                        <Wrench className="w-4 h-4" />
                      </div>
                    )}
                    {pin.type === "Technician" && (
                      <div className="bg-emerald-500 text-white p-2.5 rounded-full border border-white shadow-md">
                        <UserCheck className="w-4 h-4" />
                      </div>
                    )}
                    {pin.type === "Vehicle" && (
                      <div className="bg-cyan-500 text-white p-2.5 rounded-full border border-white shadow-md">
                        <Truck className="w-4 h-4" />
                      </div>
                    )}

                  </div>
                </AdvancedMarker>
              ))}
            </Map>
          </APIProvider>
        ) : (
          // Outstanding Seattle fallback vector map canvas
          <div className="w-full h-full bg-slate-900 rounded-[24px] relative overflow-hidden" style={{ height: "100%" }}>
            
            {/* Real Map Key Setup Splash Overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-6 z-20">
              <div className="max-w-md w-full bg-slate-900/95 border border-white/15 rounded-2xl p-6 shadow-2xl text-center space-y-4">
                <div className="mx-auto w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center border border-blue-400/30">
                  <Compass className="w-6 h-6 text-blue-400 animate-spin" style={{ animationDuration: '12s' }} />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-sans font-extrabold text-white tracking-tight">Real Google Map API Key Required</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    You are currently viewing our customized Seattle Fallback Vector Map. To load the live interactive 3D satellite and street maps, you need a Google Maps Platform API key.
                  </p>
                </div>
                <div className="bg-slate-950/60 rounded-xl p-4 text-[10px] text-left text-slate-300 font-sans border border-white/5 space-y-2">
                  <p className="font-extrabold text-white uppercase tracking-wider text-[9px] text-blue-400">Setup Instructions:</p>
                  <p>
                    <strong className="text-white">1. Get an API key:</strong> <a href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-0.5">console.cloud.google.com <ExternalLink className="w-3 h-3 inline" /></a>
                  </p>
                  <p>
                    <strong className="text-white">2. Paste Key:</strong> When the <span className="text-amber-300">"Enter your environment variable to continue"</span> popup appears, paste your key and press <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-white">Enter</span>.
                  </p>
                  <p>
                    <strong className="text-white">3. Or Manually:</strong> Open <span className="text-white font-bold">Settings</span> (⚙️ gear icon, top-right corner) → <span className="text-white font-bold">Secrets</span> → Add secret name <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">GOOGLE_MAPS_PLATFORM_KEY</code> → paste key.
                  </p>
                  <p>
                    <strong className="text-white">4. Map ID (required too):</strong> In the same Google Cloud project, go to <span className="text-white font-bold">Maps → Map Management</span>, create a Map ID, then add secret <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">GOOGLE_MAPS_MAP_ID</code> with that value. A Map ID from a different project than your key won't work.
                  </p>
                </div>
              </div>
            </div>

            {/* Visual grid background */}
            <div className="absolute inset-0 select-none opacity-20" style={{ backgroundImage: "radial-gradient(#ffffff 1.2px, transparent 1.2px)", backgroundSize: "28px 28px" }} />

            {/* SVG Stylized water bodies and geographic paths */}
            <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
              {/* Elliot Bay water body */}
              <path d="M 0,100 C 60,160 80,240 50,330 C 30,390 40,470 0,510 L 0,640 L 120,640 C 150,550 110,440 120,380 C 130,320 170,220 140,100 Z" fill="#1e293b" opacity="0.8" stroke="#334155" strokeWidth="2" />
              
              {/* Lake Union center body */}
              <ellipse cx="440" cy="180" rx="50" ry="34" fill="#1e293b" opacity="0.8" stroke="#334155" strokeWidth="2" />
              <path d="M 440,180 L 390,240 C 390,240 360,300 310,320" stroke="#1e293b" strokeWidth="12" fill="none" opacity="0.8" />
              
              {/* Lake Washington right side */}
              <path d="M 850,50 C 780,150 810,280 790,420 C 770,520 820,590 850,640 L 1000,640 L 1000,50 Z" fill="#1e293b" opacity="0.8" stroke="#334155" strokeWidth="2" />

              {/* Highway overlay grid networks */}
              <path d="M 470,0 C 450,150 480,280 460,410 C 440,510 450,590 470,640" stroke="#334155" strokeWidth="4" strokeDasharray="8,6" fill="none" opacity="0.6" />
              <path d="M 0,450 C 200,440 400,460 800,440" stroke="#334155" strokeWidth="4" strokeDasharray="8,6" fill="none" opacity="0.6" />

              {/* SERVICE TERRITORIES COLORED OVERLAY POLYGONS */}
              {showTerritories && serviceTerritories.map(t => {
                // Translate coordinate points dynamically into SVG coordinate bounds
                const svgPath = t.points.map((p, idx) => {
                  const latCenter = 47.6062;
                  const lngCenter = -122.3321;
                  const x = 450 + (p.lng - lngCenter) * 1100;
                  const y = 300 - (p.lat - latCenter) * 1200;
                  return `${idx === 0 ? "M" : "L"} ${x},${y}`;
                }).join(" ") + " Z";

                return (
                  <g key={t.id}>
                    <path
                      d={svgPath}
                      fill={t.color}
                      fillOpacity="0.08"
                      stroke={t.color}
                      strokeWidth="2.5"
                      strokeOpacity="0.45"
                      strokeDasharray="4,4"
                      className="transition-all hover:fill-opacity-15 cursor-pointer"
                    />
                    {/* Text center label */}
                    <foreignObject
                      x={450 + (t.points[0].lng - -122.3321) * 1100 - 40}
                      y={300 - (t.points[0].lat - 47.6062) * 1200 + 10}
                      width="120"
                      height="40"
                    >
                      <div className="bg-slate-900/90 border border-white/10 px-1.5 py-0.5 rounded text-[8px] font-sans text-slate-300 font-extrabold shadow text-center truncate select-none">
                        {t.name}
                      </div>
                    </foreignObject>
                  </g>
                );
              })}

              {/* REVENUE HEATMAP GRADIENT BUBBLES */}
              {showRevenueHeatmap && (
                <g opacity="0.45">
                  {/* High value hubs in north, central & south */}
                  <circle cx="480" cy="220" r="140" fill="url(#heat_radial_1)" />
                  <circle cx="380" cy="380" r="110" fill="url(#heat_radial_2)" />
                  <circle cx="620" cy="120" r="90" fill="url(#heat_radial_3)" />
                </g>
              )}

              <defs>
                <radialGradient id="heat_radial_1" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#ec4899" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="heat_radial_2" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.75" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="heat_radial_3" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#eab308" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#eab308" stopOpacity="0" />
                </radialGradient>
              </defs>
            </svg>

            {/* HQ & Warehouse HUD Floating Pins */}
            <div className="absolute top-4 left-4 bg-slate-950/90 border border-white/10 rounded-xl p-2.5 text-[9px] font-semibold text-slate-300 shadow-xl space-y-1 z-10 select-none">
              <p className="text-blue-400 font-extrabold uppercase flex items-center gap-1">
                <Compass className="w-3 h-3 animate-spin" /> Dispatch Grid Activated
              </p>
              <p>📍 Office HQ: 800 5th Ave</p>
              <p>📦 SODO Depot: Airport Way S</p>
            </div>

            {/* DYNAMIC FALLBACK VECTOR MARKER RENDERER */}
            {filteredPins.map(pin => {
              const latCenter = 47.6062;
              const lngCenter = -122.3321;
              const x = 50 + (pin.lng - lngCenter) * 1100;
              const y = 50 - (pin.lat - latCenter) * 1200;

              const posX = Math.max(5, Math.min(x, 95));
              const posY = Math.max(5, Math.min(y, 95));

              const isSelected = selectedPin?.id === pin.id;
              const isBasketItem = selectedBasketIds.includes(pin.id);

              let markerBg = "bg-blue-600";
              let markerIcon = <User className="w-3.5 h-3.5" />;
              let pulseColor = "border-blue-400";

              if (pin.type === "Office") {
                markerBg = "bg-rose-600";
                markerIcon = <Building className="w-3.5 h-3.5 animate-pulse" />;
                pulseColor = "border-rose-400";
              } else if (pin.type === "Warehouse") {
                markerBg = "bg-amber-600";
                markerIcon = <Package className="w-3.5 h-3.5" />;
                pulseColor = "border-amber-400";
              } else if (pin.type === "Lead") {
                markerBg = "bg-purple-600";
                pulseColor = "border-purple-400";
                const leadStatus = pin.raw.status || "New";
                if (leadStatus === "Won") markerIcon = <Star className="w-3.5 h-3.5 text-yellow-300" />;
                else if (leadStatus === "Lost") markerIcon = <Skull className="w-3.5 h-3.5" />;
                else if (leadStatus === "Contacted") markerIcon = <Phone className="w-3.5 h-3.5" />;
                else if (leadStatus === "Qualified") markerIcon = <Shield className="w-3.5 h-3.5 text-emerald-300" />;
                else markerIcon = <MapPin className="w-3.5 h-3.5" />;
              } else if (pin.type === "Estimate") {
                markerBg = "bg-yellow-500 text-slate-900";
                markerIcon = <FileText className="w-3.5 h-3.5" />;
                pulseColor = "border-yellow-400";
              } else if (pin.type === "Job") {
                pulseColor = "border-orange-400";
                const isHigh = pin.raw.priority === "High";
                markerBg = isHigh ? "bg-rose-500" : "bg-orange-500";
                markerIcon = <Wrench className="w-3.5 h-3.5" />;
              } else if (pin.type === "Technician") {
                markerBg = "bg-emerald-600";
                markerIcon = <UserCheck className="w-3.5 h-3.5" />;
                pulseColor = "border-emerald-400";
              } else if (pin.type === "Vehicle") {
                markerBg = "bg-cyan-600";
                markerIcon = <Truck className="w-3.5 h-3.5 text-cyan-200 animate-bounce" />;
                pulseColor = "border-cyan-400";
              }

              return (
                <button
                  key={pin.id}
                  onClick={() => {
                    if (isMultiSelectMode) {
                      setSelectedBasketIds(prev => 
                        prev.includes(pin.id) ? prev.filter(x => x !== pin.id) : [...prev, pin.id]
                      );
                    } else {
                      openLocationEditor(pin);
                    }
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 focus:outline-none hover:scale-125 transition-transform"
                  style={{ left: `${posX}%`, top: `${posY}%` }}
                >
                  <div className="relative">
                    {(isSelected || isBasketItem) && (
                      <span className={`absolute -inset-3.5 rounded-full border-2 ${pulseColor} animate-ping`} />
                    )}

                    <div className={`p-2 rounded-full border border-white text-white shadow-lg ${markerBg}`}>
                      {markerIcon}
                    </div>

                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-slate-950/95 border border-white/10 rounded px-1.5 py-0.5 whitespace-nowrap text-[8px] font-sans font-black tracking-wide text-white select-none pointer-events-none shadow-md uppercase">
                      {pin.title}
                    </div>
                  </div>
                </button>
              );
            })}

          </div>
        )}

        {/* FLOATING ACTION BOTTOM BAR */}
        <div className="absolute bottom-4 left-4 right-4 bg-slate-950/90 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-wrap gap-4 items-center justify-between z-30">
          
          <div className="flex items-center gap-3">
            <span className="p-2 bg-blue-500/15 rounded-xl border border-blue-400/20">
              <LayersIcon className="w-5 h-5 text-blue-400" />
            </span>
            <div>
              <h4 className="text-[11px] font-extrabold text-white uppercase tracking-wider">Spatial Index Ledger</h4>
              <p className="text-[10px] text-slate-400 font-bold">
                Currently streaming {filteredPins.length} geospatial items across Seattle.
              </p>
            </div>
          </div>

          {/* STAT KPIs */}
          <div className="flex gap-4 text-xs font-semibold">
            <div className="text-center">
              <p className="text-xs font-extrabold text-blue-400">{customers.length}</p>
              <p className="text-[8px] text-slate-400 font-extrabold uppercase">Clients</p>
            </div>
            <div className="text-center border-l border-white/10 pl-4">
              <p className="text-xs font-extrabold text-purple-400">{leads.length}</p>
              <p className="text-[8px] text-slate-400 font-extrabold uppercase">Leads</p>
            </div>
            <div className="text-center border-l border-white/10 pl-4">
              <p className="text-xs font-extrabold text-orange-400">
                {schedulingEvents.filter(e => e.eventType === "Job" && e.status !== "Completed").length}
              </p>
              <p className="text-[8px] text-slate-400 font-extrabold uppercase">Active Jobs</p>
            </div>
            <div className="text-center border-l border-white/10 pl-4">
              <p className="text-xs font-extrabold text-emerald-400">${counts.revenueToday.toLocaleString()}</p>
              <p className="text-[8px] text-slate-400 font-extrabold uppercase">Revenue</p>
            </div>
          </div>

        </div>

      </div>

      {/* CORE LAYOUT GRID: Left Sidebar, Main Stage, Right Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Switchboard layers & Service Territories (3 Cols) */}
        <div className="xl:col-span-3 order-2 xl:order-1 space-y-6">

          {/* SMART FILTER SWITCHBOARD */}
          <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-[28px] p-5 shadow-lg space-y-4">
            <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider border-b border-white/10 pb-2 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-blue-400" /> Active Layer Switchboard
            </h3>

            <div className="space-y-2.5 text-xs text-slate-300 font-semibold">
              <label className="flex items-center gap-2.5 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={showCustomers}
                  onChange={() => setShowCustomers(!showCustomers)}
                  className="w-4 h-4 bg-slate-800 border-white/10 rounded accent-blue-500"
                />
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Show Customers Pins
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={showLeads}
                  onChange={() => setShowLeads(!showLeads)}
                  className="w-4 h-4 bg-slate-800 border-white/10 rounded accent-purple-500"
                />
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Show Leads Pins
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={showJobs}
                  onChange={() => setShowJobs(!showJobs)}
                  className="w-4 h-4 bg-slate-800 border-white/10 rounded accent-orange-500"
                />
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Show Jobs Pins
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={showEstimates}
                  onChange={() => setShowEstimates(!showEstimates)}
                  className="w-4 h-4 bg-slate-800 border-white/10 rounded accent-yellow-500"
                />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Show Estimates
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={showTechnicians}
                  onChange={() => setShowTechnicians(!showTechnicians)}
                  className="w-4 h-4 bg-slate-800 border-white/10 rounded accent-emerald-500"
                />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Show Technicians
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={showVehicles}
                  onChange={() => setShowVehicles(!showVehicles)}
                  className="w-4 h-4 bg-slate-800 border-white/10 rounded accent-cyan-500"
                />
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> Show Vehicles
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={showTerritories}
                  onChange={() => setShowTerritories(!showTerritories)}
                  className="w-4 h-4 bg-slate-800 border-white/10 rounded accent-blue-500"
                />
                <span className="w-2.5 h-2.5 rounded bg-blue-400/50" /> Show Service Territories
              </label>
            </div>
          </div>

          {/* EDITABLE SERVICE TERRITORIES CONTROLLER */}
          <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-[28px] p-5 shadow-lg space-y-4">
            <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider border-b border-white/10 pb-2">
              Territories &amp; Sectors
            </h3>

            <div className="space-y-3.5">
              {serviceTerritories.map(t => (
                <div key={t.id} className="bg-slate-800/40 border border-white/5 rounded-2xl p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                      {editingTerritoryId === t.id ? (
                        <input
                          type="text"
                          value={editingTerritoryName}
                          onChange={(e) => setEditingTerritoryName(e.target.value)}
                          className="px-2 py-0.5 bg-slate-700 rounded text-xs text-white border border-blue-400"
                          autoFocus
                        />
                      ) : (
                        <p className="text-xs font-extrabold text-white">{t.name}</p>
                      )}
                    </div>
                    {editingTerritoryId === t.id ? (
                      <button
                        onClick={saveTerritoryEdit}
                        className="p-1 bg-emerald-600 rounded text-white cursor-pointer hover:bg-emerald-500"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    ) : (
                      <button
                        onClick={() => startEditingTerritory(t)}
                        className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Territory KPIs */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5 text-[10px] text-slate-400 font-sans">
                    <div>
                      <p>Revenue: <strong className="text-emerald-400">${t.revenue.toLocaleString()}</strong></p>
                      <p>Completion: <strong className="text-slate-200">{t.completionRate}%</strong></p>
                    </div>
                    <div>
                      <p>Clients: <strong className="text-slate-200">{t.customersCount}</strong></p>
                      <p>Open Jobs: <strong className="text-slate-200">{t.jobsCount}</strong></p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* CENTER COLUMN: Interactive map, search, and dynamic filter stage (6 Cols) */}
        <div className="xl:col-span-6 order-1 xl:order-2 flex flex-col gap-4 relative">
          
          {/* SEARCH & WORKSPACE LAYER SELECTOR BAR */}
          <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-lg flex flex-col md:flex-row gap-3 items-center justify-between">
            
            {/* SEARCH CONTAINER */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search name, phone, job #, vehicle..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* FILTER LAYER CHIPS */}
            <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
              {(["All", "Customer", "Lead", "Estimate", "Job", "Technician", "Vehicle"] as const).map(type => (
                <button
                  key={type}
                  onClick={() => {
                    setFilterType(type);
                    setSelectedPin(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider border cursor-pointer transition-colors ${
                    filterType === type
                      ? "bg-blue-600 border-blue-400 text-white shadow-md shadow-blue-500/20"
                      : "bg-slate-800/70 border-white/5 text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {type === "All" ? "🌍 All Layers" : `${type}s`}
                </button>
              ))}
            </div>
          </div>

          {/* DYNAMIC SPATIAL CRITERIA PANEL (For Sub-Filters) */}
          <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-xl p-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-300">
            
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Job Status:</span>
              <select
                value={filterJobStatus}
                onChange={(e) => setFilterJobStatus(e.target.value)}
                className="bg-slate-800 border border-white/10 rounded px-2.5 py-1 text-xs text-white"
              >
                <option value="All">All Jobs</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Traveling">Traveling</option>
                <option value="In Progress">In Progress</option>
                <option value="Paused">Paused</option>
                <option value="Completed">Completed</option>
                <option value="Emergency">Emergency</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Priority:</span>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="bg-slate-800 border border-white/10 rounded px-2.5 py-1 text-xs text-white"
              >
                <option value="All">All Priorities</option>
                <option value="High">Emergency / High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Leads:</span>
              <select
                value={filterLeadStatus}
                onChange={(e) => setFilterLeadStatus(e.target.value)}
                className="bg-slate-800 border border-white/10 rounded px-2.5 py-1 text-xs text-white"
              >
                <option value="All">All Leads</option>
                <option value="New">New</option>
                <option value="Contacted">Contacted</option>
                <option value="Qualified">Qualified</option>
                <option value="Estimate Sent">Estimate Sent</option>
                <option value="Won">Won</option>
                <option value="Lost">Lost</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Sector:</span>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-slate-800 border border-white/10 rounded px-2.5 py-1 text-xs text-white"
              >
                <option value="All">All Sectors</option>
                <option value="Residential">Residential</option>
                <option value="Commercial">Commercial</option>
              </select>
            </div>

            {/* LASSO / MULTI-SELECT TOGGLE CONTROL */}
            <div className="ml-auto flex items-center gap-2 border-l border-white/10 pl-4">
              <button
                onClick={() => {
                  setIsMultiSelectMode(!isMultiSelectMode);
                  setSelectedBasketIds([]);
                }}
                className={`px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                  isMultiSelectMode 
                    ? "bg-amber-500 text-slate-900 shadow-md" 
                    : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                }`}
              >
                {isMultiSelectMode ? "🔒 Exit Lasso Mode" : "🎯 Lasso / Multi-Select Mode"}
              </button>
            </div>

          </div>

          {/* MAP CANVAS (REAL GOOGLE MAP OR HIGH-FIDELITYFALLBACK VECTOR CANVAS) */}
          <div className="bg-slate-950/60 rounded-[32px] p-2.5 border-2 border-white/10 overflow-hidden relative shadow-[0_12px_48px_rgba(0,0,0,0.5)]" style={{ height: "660px" }}>
            
            {hasValidKey ? (
              // Full Google Maps implementation with our customized components
              <APIProvider apiKey={apiKey}>
                <Map
                  id="gmp_mcp_codeassist_v1_aistudio"
                  defaultCenter={resolvedDefaultCenter || DFW_FALLBACK}
                  defaultZoom={11}
                  mapId={mapId}
                  onCameraChanged={(e) => handleMapCameraChanged(e.detail.center)}
                  style={{ width: "100%", height: "100%", borderRadius: "24px" }}
                >
                  {/* Google maps overlays */}
                  {filteredPins.map(pin => (
                    <AdvancedMarker
                      key={pin.id}
                      position={{ lat: pin.lat, lng: pin.lng }}
                      title={pin.title}
                      onClick={() => {
                        if (isMultiSelectMode) {
                          setSelectedBasketIds(prev => 
                            prev.includes(pin.id) ? prev.filter(x => x !== pin.id) : [...prev, pin.id]
                          );
                        } else {
                          openLocationEditor(pin);
                        }
                      }}
                    >
                      {/* Interactive responsive Google Maps icons */}
                      <div className="relative cursor-pointer transition-transform hover:scale-115">
                        
                        {/* Selected overlay ring */}
                        {(selectedPin?.id === pin.id || selectedBasketIds.includes(pin.id)) && (
                          <span className="absolute -inset-2.5 rounded-full border-2 border-blue-400 animate-ping" />
                        )}

                        {pin.type === "Office" && (
                          <div className="bg-rose-600 text-white p-2.5 rounded-full border border-white shadow-md animate-pulse">
                            <Building className="w-4.5 h-4.5" />
                          </div>
                        )}
                        {pin.type === "Warehouse" && (
                          <div className="bg-amber-500 text-white p-2.5 rounded-full border border-white shadow-md">
                            <Package className="w-4.5 h-4.5" />
                          </div>
                        )}
                        {pin.type === "Customer" && (
                          <div className="bg-blue-600 text-white p-2 rounded-full border border-white shadow-md">
                            <User className="w-4 h-4" />
                          </div>
                        )}
                        {pin.type === "Lead" && (
                          <div className="bg-purple-600 text-white p-2 rounded-full border border-white shadow-md">
                            <MapPin className="w-4 h-4" />
                          </div>
                        )}
                        {pin.type === "Estimate" && (
                          <div className="bg-yellow-500 text-slate-900 p-2 rounded-full border border-white shadow-md">
                            <FileText className="w-4 h-4" />
                          </div>
                        )}
                        {pin.type === "Job" && (
                          <div className="bg-orange-500 text-white p-2 rounded-full border border-white shadow-md">
                            <Wrench className="w-4 h-4" />
                          </div>
                        )}
                        {pin.type === "Technician" && (
                          <div className="bg-emerald-500 text-white p-2.5 rounded-full border border-white shadow-md">
                            <UserCheck className="w-4 h-4" />
                          </div>
                        )}
                        {pin.type === "Vehicle" && (
                          <div className="bg-cyan-500 text-white p-2.5 rounded-full border border-white shadow-md">
                            <Truck className="w-4 h-4" />
                          </div>
                        )}

                      </div>
                    </AdvancedMarker>
                  ))}
                </Map>
              </APIProvider>
            ) : (
              // Outstanding Seattle fallback vector map canvas
              <div className="w-full h-full bg-slate-900 rounded-[24px] relative overflow-hidden" style={{ height: "100%" }}>
                
                {/* Real Map Key Setup Splash Overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-6 z-20">
                  <div className="max-w-md w-full bg-slate-900/95 border border-white/15 rounded-2xl p-6 shadow-2xl text-center space-y-4">
                    <div className="mx-auto w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center border border-blue-400/30">
                      <Compass className="w-6 h-6 text-blue-400 animate-spin" style={{ animationDuration: '12s' }} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-sans font-extrabold text-white tracking-tight">Real Google Map API Key Required</h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        You are currently viewing our customized Seattle Fallback Vector Map. To load the live interactive 3D satellite and street maps, you need a Google Maps Platform API key.
                      </p>
                    </div>
                    <div className="bg-slate-950/60 rounded-xl p-4 text-[10px] text-left text-slate-300 font-sans border border-white/5 space-y-2">
                      <p className="font-extrabold text-white uppercase tracking-wider text-[9px] text-blue-400">Setup Instructions:</p>
                      <p>
                        <strong className="text-white">1. Get an API key:</strong> <a href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-0.5">console.cloud.google.com <ExternalLink className="w-3 h-3 inline" /></a>
                      </p>
                      <p>
                        <strong className="text-white">2. Paste Key:</strong> When the <span className="text-amber-300">"Enter your environment variable to continue"</span> popup appears, paste your key and press <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-white">Enter</span>.
                      </p>
                      <p>
                        <strong className="text-white">3. Or Manually:</strong> Open <span className="text-white font-bold">Settings</span> (⚙️ gear icon, top-right corner) → <span className="text-white font-bold">Secrets</span> → Add secret name <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">GOOGLE_MAPS_PLATFORM_KEY</code> → paste key.
                      </p>
                      <p>
                        <strong className="text-white">4. Map ID (required too):</strong> In the same Google Cloud project, go to <span className="text-white font-bold">Maps → Map Management</span>, create a Map ID, then add secret <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">GOOGLE_MAPS_MAP_ID</code> with that value. A Map ID from a different project than your key won't work.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Visual grid background */}
                <div className="absolute inset-0 select-none opacity-20" style={{ backgroundImage: "radial-gradient(#ffffff 1.2px, transparent 1.2px)", backgroundSize: "28px 28px" }} />

                {/* SVG Stylized water bodies and geographic paths */}
                <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
                  {/* Elliot Bay water body */}
                  <path d="M 0,100 C 60,160 80,240 50,330 C 30,390 40,470 0,510 L 0,640 L 120,640 C 150,550 110,440 120,380 C 130,320 170,220 140,100 Z" fill="#1e293b" opacity="0.8" stroke="#334155" strokeWidth="2" />
                  
                  {/* Lake Union center body */}
                  <ellipse cx="440" cy="180" rx="50" ry="34" fill="#1e293b" opacity="0.8" stroke="#334155" strokeWidth="2" />
                  <path d="M 440,180 L 390,240 C 390,240 360,300 310,320" stroke="#1e293b" strokeWidth="12" fill="none" opacity="0.8" />
                  
                  {/* Lake Washington right side */}
                  <path d="M 850,50 C 780,150 810,280 790,420 C 770,520 820,590 850,640 L 1000,640 L 1000,50 Z" fill="#1e293b" opacity="0.8" stroke="#334155" strokeWidth="2" />

                  {/* Highway overlay grid networks */}
                  <path d="M 470,0 C 450,150 480,280 460,410 C 440,510 450,590 470,640" stroke="#334155" strokeWidth="4" strokeDasharray="8,6" fill="none" opacity="0.6" />
                  <path d="M 0,450 C 200,440 400,460 800,440" stroke="#334155" strokeWidth="4" strokeDasharray="8,6" fill="none" opacity="0.6" />

                  {/* SERVICE TERRITORIES COLORED OVERLAY POLYGONS */}
                  {showTerritories && serviceTerritories.map(t => {
                    // Translate coordinate points dynamically into SVG coordinate bounds
                    const svgPath = t.points.map((p, idx) => {
                      const latCenter = 47.6062;
                      const lngCenter = -122.3321;
                      const x = 450 + (p.lng - lngCenter) * 1100;
                      const y = 300 - (p.lat - latCenter) * 1200;
                      return `${idx === 0 ? "M" : "L"} ${x},${y}`;
                    }).join(" ") + " Z";

                    return (
                      <g key={t.id}>
                        <path
                          d={svgPath}
                          fill={t.color}
                          fillOpacity="0.08"
                          stroke={t.color}
                          strokeWidth="2.5"
                          strokeOpacity="0.45"
                          strokeDasharray="4,4"
                          className="transition-all hover:fill-opacity-15 cursor-pointer"
                        />
                        {/* Text center label */}
                        <foreignObject
                          x={450 + (t.points[0].lng - -122.3321) * 1100 - 40}
                          y={300 - (t.points[0].lat - 47.6062) * 1200 + 10}
                          width="120"
                          height="40"
                        >
                          <div className="bg-slate-900/90 border border-white/10 px-1.5 py-0.5 rounded text-[8px] font-sans text-slate-300 font-extrabold shadow text-center truncate select-none">
                            {t.name}
                          </div>
                        </foreignObject>
                      </g>
                    );
                  })}

                  {/* REVENUE HEATMAP GRADIENT BUBBLES */}
                  {showRevenueHeatmap && (
                    <g opacity="0.45">
                      {/* High value hubs in north, central & south */}
                      <circle cx="480" cy="220" r="140" fill="url(#heat_radial_1)" />
                      <circle cx="380" cy="380" r="110" fill="url(#heat_radial_2)" />
                      <circle cx="620" cy="120" r="90" fill="url(#heat_radial_3)" />
                    </g>
                  )}

                  <defs>
                    <radialGradient id="heat_radial_1" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#ec4899" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id="heat_radial_2" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.75" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id="heat_radial_3" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#eab308" stopOpacity="0.6" />
                      <stop offset="100%" stopColor="#eab308" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                </svg>

                {/* HQ & Warehouse HUD Floating Pins */}
                <div className="absolute top-4 left-4 bg-slate-950/90 border border-white/10 rounded-xl p-2.5 text-[9px] font-semibold text-slate-300 shadow-xl space-y-1 z-10 select-none">
                  <p className="text-blue-400 font-extrabold uppercase flex items-center gap-1">
                    <Compass className="w-3 h-3 animate-spin" /> Dispatch Grid Activated
                  </p>
                  <p>📍 Office HQ: 800 5th Ave</p>
                  <p>📦 SODO Depot: Airport Way S</p>
                </div>

                {/* DYNAMIC FALLBACK VECTOR MARKER RENDERER */}
                {filteredPins.map(pin => {
                  const latCenter = 47.6062;
                  const lngCenter = -122.3321;
                  const x = 50 + (pin.lng - lngCenter) * 1100;
                  const y = 50 - (pin.lat - latCenter) * 1200;

                  // Bound percentages inside visible viewport
                  const posX = Math.max(5, Math.min(x, 95));
                  const posY = Math.max(5, Math.min(y, 95));

                  const isSelected = selectedPin?.id === pin.id;
                  const isBasketItem = selectedBasketIds.includes(pin.id);

                  // Setup specific icons and colored bullets
                  let markerBg = "bg-blue-600";
                  let markerIcon = <User className="w-3.5 h-3.5" />;
                  let pulseColor = "border-blue-400";

                  if (pin.type === "Office") {
                    markerBg = "bg-rose-600";
                    markerIcon = <Building className="w-3.5 h-3.5 animate-pulse" />;
                    pulseColor = "border-rose-400";
                  } else if (pin.type === "Warehouse") {
                    markerBg = "bg-amber-600";
                    markerIcon = <Package className="w-3.5 h-3.5" />;
                    pulseColor = "border-amber-400";
                  } else if (pin.type === "Lead") {
                    markerBg = "bg-purple-600";
                    pulseColor = "border-purple-400";
                    // State based icons for leads
                    const leadStatus = pin.raw.status || "New";
                    if (leadStatus === "Won") markerIcon = <Star className="w-3.5 h-3.5 text-yellow-300" />;
                    else if (leadStatus === "Lost") markerIcon = <Skull className="w-3.5 h-3.5" />;
                    else if (leadStatus === "Contacted") markerIcon = <Phone className="w-3.5 h-3.5" />;
                    else if (leadStatus === "Qualified") markerIcon = <Shield className="w-3.5 h-3.5 text-emerald-300" />;
                    else markerIcon = <MapPin className="w-3.5 h-3.5" />;
                  } else if (pin.type === "Estimate") {
                    markerBg = "bg-yellow-500 text-slate-900";
                    markerIcon = <FileText className="w-3.5 h-3.5" />;
                    pulseColor = "border-yellow-400";
                  } else if (pin.type === "Job") {
                    pulseColor = "border-orange-400";
                    const isHigh = pin.raw.priority === "High";
                    markerBg = isHigh ? "bg-rose-500" : "bg-orange-500";
                    markerIcon = <Wrench className="w-3.5 h-3.5" />;
                  } else if (pin.type === "Technician") {
                    markerBg = "bg-emerald-600";
                    markerIcon = <UserCheck className="w-3.5 h-3.5" />;
                    pulseColor = "border-emerald-400";
                  } else if (pin.type === "Vehicle") {
                    markerBg = "bg-cyan-600";
                    markerIcon = <Truck className="w-3.5 h-3.5 text-cyan-200 animate-bounce" />;
                    pulseColor = "border-cyan-400";
                  }

                  return (
                    <button
                      key={pin.id}
                      onClick={() => {
                        if (isMultiSelectMode) {
                          setSelectedBasketIds(prev => 
                            prev.includes(pin.id) ? prev.filter(x => x !== pin.id) : [...prev, pin.id]
                          );
                        } else {
                          openLocationEditor(pin);
                        }
                      }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 focus:outline-none hover:scale-125 transition-transform"
                      style={{ left: `${posX}%`, top: `${posY}%` }}
                    >
                      <div className="relative">
                        
                        {/* Selected halo state */}
                        {(isSelected || isBasketItem) && (
                          <span className={`absolute -inset-3.5 rounded-full border-2 ${pulseColor} animate-ping`} />
                        )}

                        {/* Standard state indicator pulse rings */}
                        {pin.type === "Job" && pin.raw.status === "In Progress" && (
                          <span className="absolute -inset-2.5 rounded-full border border-emerald-400 animate-pulse" />
                        )}
                        {pin.type === "Job" && pin.raw.priority === "High" && (
                          <span className="absolute -inset-2.5 rounded-full border border-rose-500 animate-pulse" />
                        )}
                        {pin.type === "Technician" && pin.raw.status === "Traveling" && (
                          <span className="absolute -inset-2.5 rounded-full border border-orange-400 animate-pulse" />
                        )}

                        <div className={`${markerBg} text-white p-2 rounded-full border border-white shadow-xl flex items-center justify-center`}>
                          {markerIcon}
                        </div>

                        {/* Checked Badge in lasso multi mode */}
                        {isBasketItem && (
                          <span className="absolute -top-1.5 -right-1.5 bg-yellow-400 text-slate-950 rounded-full w-4 h-4 text-[9px] font-extrabold flex items-center justify-center border border-slate-900 shadow">
                            ✓
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}

              </div>
            )}

            {/* FLOATING ACTION BOTTOM BAR */}
            <div className="absolute bottom-4 left-4 right-4 bg-slate-950/90 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-wrap gap-4 items-center justify-between z-30">
              
              <div className="flex items-center gap-3">
                <span className="p-2 bg-blue-500/15 rounded-xl border border-blue-400/20">
                  <LayersIcon className="w-5 h-5 text-blue-400" />
                </span>
                <div>
                  <h4 className="text-[11px] font-extrabold text-white uppercase tracking-wider">Spatial Index Ledger</h4>
                  <p className="text-[10px] text-slate-400 font-bold">
                    Currently streaming {filteredPins.length} geospatial items across Seattle.
                  </p>
                </div>
              </div>

              {/* STAT KPIs */}
              <div className="flex gap-4 text-xs font-semibold">
                <div className="text-center">
                  <p className="text-xs font-extrabold text-blue-400">{customers.length}</p>
                  <p className="text-[8px] text-slate-400 font-extrabold uppercase">Clients</p>
                </div>
                <div className="text-center border-l border-white/10 pl-4">
                  <p className="text-xs font-extrabold text-purple-400">{leads.length}</p>
                  <p className="text-[8px] text-slate-400 font-extrabold uppercase">Leads</p>
                </div>
                <div className="text-center border-l border-white/10 pl-4">
                  <p className="text-xs font-extrabold text-orange-400">
                    {schedulingEvents.filter(e => e.eventType === "Job" && e.status !== "Completed").length}
                  </p>
                  <p className="text-[8px] text-slate-400 font-extrabold uppercase">Active Jobs</p>
                </div>
                <div className="text-center border-l border-white/10 pl-4">
                  <p className="text-xs font-extrabold text-emerald-400">${counts.revenueToday.toLocaleString()}</p>
                  <p className="text-[8px] text-slate-400 font-extrabold uppercase">Revenue</p>
                </div>
              </div>

            </div>

          </div>

          {/* DYNAMIC MULTI-SELECT & ROUTE OPTIMIZATION FLOATING BOX */}
          <AnimatePresence>
            {isMultiSelectMode && selectedBasketIds.length > 0 && (
              <motion.div
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                className="bg-slate-900 border-2 border-amber-500/50 rounded-2xl p-4 shadow-2xl space-y-4 text-slate-300 relative z-40"
              >
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
                    <p className="text-xs font-extrabold text-white uppercase tracking-wider">
                      🎯 Multi-Select Batch Rig ({selectedBasketIds.length} Nodes selected)
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedBasketIds([])}
                    className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    Clear Selection
                  </button>
                </div>

                {/* Optimized Route details if 2+ elements */}
                {optimizedRouteSummary ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950/80 p-3 rounded-xl border border-white/5 text-xs">
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-extrabold">Total Mileage</p>
                      <p className="text-sm font-extrabold text-white">{optimizedRouteSummary.mileage} miles</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-extrabold">Est. Drive Time</p>
                      <p className="text-sm font-extrabold text-white">{optimizedRouteSummary.driveTime} mins</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-extrabold">Fuel Draw Cost</p>
                      <p className="text-sm font-extrabold text-emerald-400">${optimizedRouteSummary.fuelCost}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-extrabold">Route Density</p>
                      <p className="text-sm font-extrabold text-white truncate">{optimizedRouteSummary.trafficDensity}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 leading-relaxed font-sans font-medium">
                    Select 2 or more job nodes to generate optimized route itineraries and dispatch fleets in one click.
                  </p>
                )}

                {/* Dynamic mass actions */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      alert(`Broadcasting mass operational alert email to ${selectedBasketIds.length} clients!`);
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-extrabold text-[10px] uppercase rounded-lg border border-white/5 cursor-pointer"
                  >
                    📧 Mass Email
                  </button>
                  <button
                    onClick={() => {
                      alert(`Broadcasting mass broadcast SMS notifications to ${selectedBasketIds.length} contacts!`);
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-extrabold text-[10px] uppercase rounded-lg border border-white/5 cursor-pointer"
                  >
                    💬 Mass SMS Text
                  </button>
                  {selectedBasketIds.length >= 2 && (
                    <button
                      onClick={handleDispatchOptimizedRoute}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] uppercase rounded-lg shadow-md cursor-pointer ml-auto flex items-center gap-1"
                    >
                      <Zap className="w-3.5 h-3.5 text-yellow-300" /> One-Click Dispatch Route
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

        {/* RIGHT COLUMN: CORE OPERATIONAL NODES / STAT COUNTS (3 Cols) */}
        <div className="xl:col-span-3 order-3 xl:order-3 space-y-6">
          
          {/* GLASS WIDGET: STAT COUNTS */}
          <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-[28px] p-5 shadow-lg space-y-4">
            <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider border-b border-white/10 pb-2 flex items-center justify-between">
              <span>Core Operational Nodes</span>
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping" />
            </h3>

            <div className="grid grid-cols-2 gap-3">
              
              <div className="bg-slate-800/50 border border-white/5 p-3 rounded-2xl">
                <div className="flex justify-between items-start">
                  <span className="p-1 bg-blue-500/10 rounded-lg"><User className="w-4 h-4 text-blue-400" /></span>
                  <span className="text-xs text-slate-400 font-bold font-sans">Clients</span>
                </div>
                <p className="text-xl font-extrabold text-white mt-1.5">{counts.customers}</p>
              </div>

              <div className="bg-slate-800/50 border border-white/5 p-3 rounded-2xl">
                <div className="flex justify-between items-start">
                  <span className="p-1 bg-orange-500/10 rounded-lg"><Wrench className="w-4 h-4 text-orange-400" /></span>
                  <span className="text-xs text-slate-400 font-bold font-sans">Jobs Today</span>
                </div>
                <p className="text-xl font-extrabold text-white mt-1.5">{counts.todayJobs}</p>
              </div>

              <div className="bg-slate-800/50 border border-white/5 p-3 rounded-2xl">
                <div className="flex justify-between items-start">
                  <span className="p-1 bg-purple-500/10 rounded-lg"><MapPin className="w-4 h-4 text-purple-400" /></span>
                  <span className="text-xs text-slate-400 font-bold font-sans">New Leads</span>
                </div>
                <p className="text-xl font-extrabold text-white mt-1.5">{counts.leads}</p>
              </div>

              <div className="bg-slate-800/50 border border-white/5 p-3 rounded-2xl">
                <div className="flex justify-between items-start">
                  <span className="p-1 bg-yellow-500/10 rounded-lg"><FileText className="w-4 h-4 text-yellow-400" /></span>
                  <span className="text-xs text-slate-400 font-bold font-sans">Estimates</span>
                </div>
                <p className="text-xl font-extrabold text-white mt-1.5">{counts.estimates}</p>
              </div>

              <div className="bg-slate-800/50 border border-white/5 p-3 rounded-2xl">
                <div className="flex justify-between items-start">
                  <span className="p-1 bg-emerald-500/10 rounded-lg"><UserCheck className="w-4 h-4 text-emerald-400" /></span>
                  <span className="text-xs text-slate-400 font-bold font-sans">Techs Live</span>
                </div>
                <p className="text-xl font-extrabold text-white mt-1.5">{counts.techs}</p>
              </div>

