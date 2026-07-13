import React, { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  Search,
  Plus,
  Camera,
  Filter,
  Check,
  X,
  Trash2,
  Edit,
  RefreshCw,
  Download,
  Upload,
  History,
  Eye,
  Star,
  Info,
  Layers,
  Hammer,
  Briefcase,
  DollarSign,
  Activity,
  FileText,
  QrCode,
  CheckSquare,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  ShoppingCart,
  ArrowRight,
  Package,
  Wrench,
  Flame,
  Truck,
  Droplet,
  Grid,
  FileSpreadsheet,
  Settings,
  Shield,
  Clock,
  MapPin,
  Barcode
} from "lucide-react";
import { SchedulingEvent } from "./SchedulingPage";

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  vendor: string;
  manufacturer: string;
  sku: string;
  barcode: string;
  qrCode: string;
  description: string;
  quantity: number;
  unit: string;
  minQuantity: number;
  maxQuantity: number;
  location: string;
  unitCost: number;
  sellingPrice: number;
  notes: string;
  photo: string;
  isFavorite: boolean;
  assignedVehicle?: string;
  assignedEmployee?: string;
  lastUpdated: string;
  customFields?: Array<{ key: string; value: string }>;
  quantityHistory: Array<{ date: string; type: string; amount: number; previous: number; current: number; notes: string }>;
  purchaseHistory: Array<{ date: string; vendor: string; amount: number; unitCost: number; total: number }>;
  usageHistory: Array<{ date: string; jobName: string; amount: number; employee: string }>;
}

export interface PurchaseRecord {
  id: string;
  vendor: string;
  receiptNumber: string;
  date: string;
  employee: string;
  itemsPurchased: string;
  totalCost: number;
}

export interface InventoryPageProps {
  onOpenPlaceholder: (label: string, icon: string) => void;
  onTakeSnapshot?: (pageId: string, pageName: string, meta?: any) => void;
  onOpenAIAnalysis?: (pageId: string, pageName: string, customContext?: string) => void;
  onNavigateToScreen?: (screenId: string, params?: { customerId?: string; date?: string }) => void;
  activeRole: string;
  loggedInUser: any;
  logOperationalEvent?: (type: string, desc: string, icon: string) => void;
  events?: SchedulingEvent[];
  setEvents?: React.Dispatch<React.SetStateAction<SchedulingEvent[]>>;
  inventoryList?: InventoryItem[];
  setInventoryList?: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
}

const INITIAL_PURCHASES: PurchaseRecord[] = [];

export const INITIAL_INVENTORY: InventoryItem[] = [];

export const TimeClockPage: React.FC = () => null; // Placeholder to avoid compilation issues if imported directly
export const TimeClockPageProps: any = null;

export const InventoryPage: React.FC<InventoryPageProps> = ({
  onOpenPlaceholder,
  onTakeSnapshot,
  onOpenAIAnalysis,
  onNavigateToScreen,
  activeRole,
  loggedInUser,
  logOperationalEvent,
  events,
  setEvents,
  inventoryList: propsInventoryList,
  setInventoryList: propsSetInventoryList
}) => {
  // State variables
  const [localInventoryList, setLocalInventoryList] = useState<InventoryItem[]>(INITIAL_INVENTORY);
  const inventoryList = propsInventoryList || localInventoryList;
  const setInventoryList = propsSetInventoryList || setLocalInventoryList;

  const [purchases, setPurchases] = useState<PurchaseRecord[]>(INITIAL_PURCHASES);

  useEffect(() => {
    if (loggedInUser && loggedInUser.email !== "operations@ironcladservices.com") {
      setInventoryList([]);
      setPurchases([]);
    } else {
      setInventoryList(propsInventoryList || INITIAL_INVENTORY);
      setPurchases(INITIAL_PURCHASES);
    }
  }, [loggedInUser, propsInventoryList]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeTabFilter, setActiveTabFilter] = useState<string>("all"); // "all", "low_stock", "out_of_stock", "favorites", "recently_added"
  const [activeFilterDrawer, setActiveFilterDrawer] = useState(false);
  const [filterWarehouse, setFilterWarehouse] = useState("all");
  const [filterVendor, setFilterVendor] = useState("all");

  // Popup Modals
  const [isAddPopupOpen, setIsAddPopupOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDetailsPopupOpen, setIsDetailsPopupOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);
  const [reorderModalOpen, setReorderModalOpen] = useState(false);
  const [reorderCandidates, setReorderCandidates] = useState<InventoryItem[]>([]);

  // Snapshot AI Simulator Modal
  const [isSnapshotAIModalOpen, setIsSnapshotAIModalOpen] = useState(false);
  const [snapshotStage, setSnapshotStage] = useState<"camera" | "processing" | "review" | " SPF_learn">("camera");
  const [selectedSnapshotType, setSelectedSnapshotType] = useState("SPF 2x4x8 KD Receipt");
  const [aiSuggestions, setAiSuggestions] = useState<any>(null);
  const [userMappingSPF, setUserMappingSPF] = useState<string | null>(null);

  // Barcode / QR Scanner Simulator Modal
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [scannerType, setScannerType] = useState<"barcode" | "qr">("barcode");
  const [scanInputCode, setScanInputCode] = useState("");

  // Import / Export states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importText, setImportText] = useState("");

  // Quick Action State inside details
  const [isQuickActionModalOpen, setIsQuickActionModalOpen] = useState(false);
  const [quickActionType, setQuickActionType] = useState<string>("Receive"); // Receive, Remove, Transfer, Correct, Waste, Damage, Reserve, AssignJob, AssignVehicle, AssignEmployee
  const [quickActionQty, setQuickActionQty] = useState(1);
  const [quickActionNotes, setQuickActionNotes] = useState("");
  const [quickActionTarget, setQuickActionTarget] = useState("");

  // Add Item / Edit Item Form State
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("Materials");
  const [formVendor, setFormVendor] = useState("");
  const [formManufacturer, setFormManufacturer] = useState("");
  const [formSku, setFormSku] = useState("");
  const [formBarcode, setFormBarcode] = useState("");
  const [formQrCode, setFormQrCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formQuantity, setFormQuantity] = useState(0);
  const [formMinQty, setFormMinQty] = useState(5);
  const [formMaxQty, setFormMaxQty] = useState(100);
  const [formLocation, setFormLocation] = useState("Warehouse A");
  const [formUnitCost, setFormUnitCost] = useState(0);
  const [formSellingPrice, setFormSellingPrice] = useState(0);
  const [formNotes, setFormNotes] = useState("");
  const [formPhoto, setFormPhoto] = useState("📦");
  const [formIsFavorite, setFormIsFavorite] = useState(false);
  const [formCustomFields, setFormCustomFields] = useState<Array<{ key: string; value: string }>>([]);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  // Views Toggle (List view vs Purchase History view)
  const [currentView, setCurrentView] = useState<"list" | "purchases">("list");

  // Role permissions checking
  const canEdit = useMemo(() => {
    const role = activeRole || "Owner";
    return ["Owner", "General Manager", "Office Manager", "Operations Manager", "Warehouse / Inventory Manager", "Inventory Manager", "Warehouse Manager"].includes(role);
  }, [activeRole]);

  // Calculations
  const stats = useMemo(() => {
    let totalItems = inventoryList.length;
    let totalVal = inventoryList.reduce((acc, item) => acc + (item.quantity * item.unitCost), 0);
    let lowStockCount = inventoryList.filter(item => item.quantity > 0 && item.quantity <= item.minQuantity).length;
    let outOfStockCount = inventoryList.filter(item => item.quantity === 0).length;
    let favoriteCount = inventoryList.filter(item => item.isFavorite).length;

    return {
      totalItems,
      totalVal,
      lowStockCount,
      outOfStockCount,
      favoriteCount
    };
  }, [inventoryList]);

  // Quick categories list with custom icons
  const CATEGORIES = [
    { name: "Materials", icon: "🧱" },
    { name: "Tools", icon: "🔧" },
    { name: "Equipment", icon: "⚙️" },
    { name: "Electrical", icon: "⚡" },
    { name: "Plumbing", icon: "💧" },
    { name: "Concrete", icon: "🪨" },
    { name: "Lumber", icon: "🪵" },
    { name: "Drywall", icon: "⬜" },
    { name: "Fasteners", icon: "🔩" },
    { name: "Paint", icon: "🎨" },
    { name: "Roofing", icon: "🏠" },
    { name: "HVAC", icon: "🔥" },
    { name: "Landscaping", icon: "🌱" },
    { name: "Safety", icon: "🛡️" },
    { name: "Office Supplies", icon: "📎" },
    { name: "Cleaning", icon: "🧹" },
    { name: "Vehicles", icon: "🚚" },
    { name: "Fuel", icon: "⛽" }
  ];

  // Filter & Search Logic
  const filteredInventory = useMemo(() => {
    return inventoryList.filter(item => {
      // Search Box matching
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          item.name.toLowerCase().includes(query) ||
          item.sku.toLowerCase().includes(query) ||
          item.vendor.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query) ||
          item.barcode.toLowerCase().includes(query) ||
          item.qrCode.toLowerCase().includes(query) ||
          item.manufacturer.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.location.toLowerCase().includes(query);

        if (!matchesSearch) return false;
      }

      // Summary Card / Tab filter
      if (activeTabFilter === "low_stock" && !(item.quantity > 0 && item.quantity <= item.minQuantity)) return false;
      if (activeTabFilter === "out_of_stock" && item.quantity !== 0) return false;
      if (activeTabFilter === "favorites" && !item.isFavorite) return false;

      // Category Icon click matching
      if (selectedCategory && item.category !== selectedCategory) return false;

      // Drawer detailed filters
      if (filterWarehouse !== "all" && !item.location.toLowerCase().includes(filterWarehouse.toLowerCase())) return false;
      if (filterVendor !== "all" && item.vendor !== filterVendor) return false;

      return true;
    }).sort((a, b) => {
      // Favorites appear first
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return 0;
    });
  }, [inventoryList, searchQuery, selectedCategory, activeTabFilter, filterWarehouse, filterVendor]);

  const triggerToast = (msg: string) => {
    if (logOperationalEvent) {
      logOperationalEvent("Inventory Update", msg, "📦");
    }
  };

  // Actions
  const handleRefresh = () => {
    triggerToast("Inventory cache successfully updated!");
  };

  const handleExport = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + ["Name,Category,Vendor,SKU,Barcode,Quantity,Unit,UnitCost,SellingPrice,Location"].join(",") + "\n"
      + inventoryList.map(item => `"${item.name}","${item.category}","${item.vendor}","${item.sku}","${item.barcode}",${item.quantity},"${item.unit}",${item.unitCost},${item.sellingPrice},"${item.location}"`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `leadforge_inventory_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast("Inventory ledger exported to local spreadsheet format!");
  };

  const handleImport = () => {
    if (!importText.trim()) {
      triggerToast("Import cancelled: Empty spreadsheet contents");
      return;
    }
    const lines = importText.split("\n");
    let count = 0;
    const newItems: InventoryItem[] = [];
    lines.forEach((line, idx) => {
      if (idx === 0 || !line.trim()) return;
      const parts = line.split(",");
      if (parts.length >= 6) {
        newItems.push({
          id: `imported_${Date.now()}_${idx}`,
          name: parts[0]?.trim() || "Imported Item",
          category: parts[1]?.trim() || "Materials",
          vendor: parts[2]?.trim() || "Various",
          manufacturer: "Imported",
          sku: parts[3]?.trim() || `SKU-IMP-${idx}`,
          barcode: parts[4]?.trim() || "",
          qrCode: "",
          description: "Spreadsheet imported stock",
          quantity: parseFloat(parts[5]?.trim()) || 0,
          unit: parts[6]?.trim() || "pcs",
          minQuantity: 5,
          maxQuantity: 100,
          location: parts[7]?.trim() || "Warehouse A",
          unitCost: parseFloat(parts[8]?.trim()) || 1.00,
          sellingPrice: parseFloat(parts[9]?.trim()) || 1.50,
          notes: "Imported via ledger script",
          photo: "📦",
          isFavorite: false,
          lastUpdated: new Date().toISOString(),
          quantityHistory: [{ date: "2026-07-06", type: "Correction", amount: parseFloat(parts[5]?.trim()) || 0, previous: 0, current: parseFloat(parts[5]?.trim()) || 0, notes: "Imported" }],
          purchaseHistory: [],
          usageHistory: []
        });
        count++;
      }
    });

    if (newItems.length > 0) {
      setInventoryList(prev => [...prev, ...newItems]);
      triggerToast(`Successfully loaded ${count} items from sheet!`);
    } else {
      triggerToast("Failed to parse sheet columns. Ensure comma-separated layout is correct.");
    }
    setIsImportModalOpen(false);
    setImportText("");
  };

  // Add Item Submit
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      triggerToast("Access Denied: Technicians can only request or consume inventory.");
      return;
    }
    if (!formName.trim()) return;

    const newItem: InventoryItem = {
      id: isEditMode && selectedItem ? selectedItem.id : `item_${Date.now()}`,
      name: formName,
      category: formCategory,
      vendor: formVendor || "Unknown Vendor",
      manufacturer: formManufacturer || "Unknown Manufacturer",
      sku: formSku || `SKU-${Math.floor(Math.random() * 900000)}`,
      barcode: formBarcode || `${Math.floor(Math.random() * 1000000000000)}`,
      qrCode: formQrCode || `QR-${Math.floor(Math.random() * 90000)}`,
      description: formDescription,
      quantity: formQuantity,
      unit: formUnitCost > 0 ? "pcs" : "bags",
      minQuantity: formMinQty,
      maxQuantity: formMaxQty,
      location: formLocation,
      unitCost: formUnitCost,
      sellingPrice: formSellingPrice,
      notes: formNotes,
      photo: formPhoto,
      isFavorite: formIsFavorite,
      customFields: formCustomFields,
      lastUpdated: "2026-07-06 04:00 PM",
      quantityHistory: isEditMode && selectedItem ? selectedItem.quantityHistory : [
        { date: "2026-07-06", type: "Correction", amount: formQuantity, previous: 0, current: formQuantity, notes: "Initial provision" }
      ],
      purchaseHistory: isEditMode && selectedItem ? selectedItem.purchaseHistory : [],
      usageHistory: isEditMode && selectedItem ? selectedItem.usageHistory : []
    };

    if (isEditMode) {
      setInventoryList(prev => prev.map(item => item.id === newItem.id ? newItem : item));
      triggerToast(`Updated inventory records for ${formName}`);
    } else {
      setInventoryList(prev => [...prev, newItem]);
      triggerToast(`Added ${formName} to ledger catalog!`);
    }

    setIsAddPopupOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setFormName("");
    setFormCategory("Materials");
    setFormVendor("");
    setFormManufacturer("");
    setFormSku("");
    setFormBarcode("");
    setFormQrCode("");
    setFormDescription("");
    setFormQuantity(0);
    setFormMinQty(5);
    setFormMaxQty(100);
    setFormLocation("Warehouse A");
    setFormUnitCost(0);
    setFormSellingPrice(0);
    setFormNotes("");
    setFormPhoto("📦");
    setFormIsFavorite(false);
    setFormCustomFields([]);
    setIsEditMode(false);
  };

  const handleEditClick = (item: InventoryItem) => {
    setSelectedItem(item);
    setFormName(item.name);
    setFormCategory(item.category);
    setFormVendor(item.vendor);
    setFormManufacturer(item.manufacturer);
    setFormSku(item.sku);
    setFormBarcode(item.barcode);
    setFormQrCode(item.qrCode);
    setFormDescription(item.description);
    setFormQuantity(item.quantity);
    setFormMinQty(item.minQuantity);
    setFormMaxQty(item.maxQuantity);
    setFormLocation(item.location);
    setFormUnitCost(item.unitCost);
    setFormSellingPrice(item.sellingPrice);
    setFormNotes(item.notes);
    setFormPhoto(item.photo);
    setFormIsFavorite(item.isFavorite);
    setFormCustomFields(item.customFields || []);
    setIsEditMode(true);
    setIsAddPopupOpen(true);
    setIsDetailsPopupOpen(false);
  };

  const handleDeleteItem = (id: string) => {
    if (!canEdit) {
      triggerToast("Access Denied: Technicians cannot delete inventory.");
      return;
    }
    const item = inventoryList.find(e => e.id === id);
    if (item) {
      setDeletingItem(item);
    }
  };

  const handleConfirmDelete = () => {
    if (!deletingItem) return;
    setInventoryList(prev => prev.filter(item => item.id !== deletingItem.id));
    triggerToast(`Purged ${deletingItem.name} from catalog!`);
    setIsDetailsPopupOpen(false);
    setDeletingItem(null);
  };

  const addCustomField = () => {
    if (newKey.trim() && newValue.trim()) {
      setFormCustomFields(prev => [...prev, { key: newKey.trim(), value: newValue.trim() }]);
      setNewKey("");
      setNewValue("");
    }
  };

  // Perform Quick Action Adjustments
  const executeQuickAction = () => {
    if (!selectedItem) return;

    let qtyChange = 0;
    let desc = "";

    switch (quickActionType) {
      case "Receive":
        qtyChange = Math.abs(quickActionQty);
        desc = `Received shipment of ${qtyChange} ${selectedItem.unit}`;
        break;
      case "Remove":
        qtyChange = -Math.abs(quickActionQty);
        desc = `Removed ${Math.abs(qtyChange)} ${selectedItem.unit} for field consumption`;
        break;
      case "Transfer":
        qtyChange = -Math.abs(quickActionQty);
        desc = `Transferred ${Math.abs(qtyChange)} ${selectedItem.unit} to ${quickActionTarget}`;
        break;
      case "Correct":
        qtyChange = quickActionQty - selectedItem.quantity;
        desc = `Adjusted stock count. Set to absolute ${quickActionQty}`;
        break;
      case "Waste":
        qtyChange = -Math.abs(quickActionQty);
        desc = `Scrapped ${Math.abs(qtyChange)} ${selectedItem.unit} as waste. Reason: ${quickActionNotes || "Not specified"}`;
        break;
      case "Damage":
        qtyChange = -Math.abs(quickActionQty);
        desc = `Logged damaged stock of ${Math.abs(qtyChange)} units.`;
        break;
      case "Reserve":
        desc = `Reserved ${quickActionQty} units for future Job schedule.`;
        break;
      case "AssignJob":
        qtyChange = -Math.abs(quickActionQty);
        desc = `Assigned ${Math.abs(qtyChange)} units to Active Job #${quickActionTarget || "Unassigned"}`;
        // EVENT ENGINE INTEGRATION
        if (setEvents && events) {
          const newEvent: SchedulingEvent = {
            id: `evt_inv_${Date.now()}`,
            eventType: "Inventory Delivery",
            date: "2026-07-06",
            startTime: "16:00",
            endTime: "17:00",
            customer: `Material Dispatch: ${selectedItem.name}`,
            location: quickActionTarget || "Main Site",
            priority: "Medium",
            notes: `Auto dispatched ${Math.abs(qtyChange)} ${selectedItem.unit} to Job site.`,
            status: "Scheduled",
            assignedEmployee: selectedItem.assignedEmployee || "Sarah Jenkins"
          };
          setEvents(prev => [...prev, newEvent]);
        }
        break;
      case "AssignVehicle":
        desc = `Dispatched storage of ${selectedItem.name} onto ${quickActionTarget}`;
        break;
      case "AssignEmployee":
        desc = `Assigned tracking custodian for ${selectedItem.name} to ${quickActionTarget}`;
        break;
    }

    const currentQty = quickActionType === "Correct" ? quickActionQty : (selectedItem.quantity + qtyChange);

    const updatedItem: InventoryItem = {
      ...selectedItem,
      quantity: Math.max(0, currentQty),
      assignedVehicle: quickActionType === "AssignVehicle" ? quickActionTarget : selectedItem.assignedVehicle,
      assignedEmployee: quickActionType === "AssignEmployee" ? quickActionTarget : selectedItem.assignedEmployee,
      quantityHistory: [
        {
          date: "2026-07-06",
          type: quickActionType,
          amount: qtyChange !== 0 ? qtyChange : quickActionQty,
          previous: selectedItem.quantity,
          current: Math.max(0, currentQty),
          notes: quickActionNotes || desc
        },
        ...selectedItem.quantityHistory
      ],
      lastUpdated: "2026-07-06 03:10 PM"
    };

    setInventoryList(prev => prev.map(item => item.id === selectedItem.id ? updatedItem : item));
    setSelectedItem(updatedItem);
    triggerToast(desc);
    setIsQuickActionModalOpen(false);
    setQuickActionNotes("");
    setQuickActionTarget("");
  };

  // Barcode / QR Simulation scanning
  const handleScannerSubmit = () => {
    if (!scanInputCode.trim()) return;
    const found = inventoryList.find(item => 
      item.barcode === scanInputCode || 
      item.sku.toLowerCase() === scanInputCode.toLowerCase() ||
      item.qrCode.toLowerCase() === scanInputCode.toLowerCase()
    );

    if (found) {
      setSelectedItem(found);
      setIsScannerModalOpen(false);
      setIsDetailsPopupOpen(true);
      triggerToast(`Barcode recognized! Loaded ${found.name}`);
    } else {
      if (window.confirm(`Product SKU/Code "${scanInputCode}" not found in local catalog. Create new catalog entry?`)) {
        setIsScannerModalOpen(false);
        resetForm();
        setFormSku(scanInputCode);
        setFormBarcode(scanInputCode);
        setIsAddPopupOpen(true);
      }
    }
    setScanInputCode("");
  };

  const localCameraInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleLocalCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      runCameraAI();
    }
  };

  // AI Camera Mock
  const runCameraAI = () => {
    setSnapshotStage("processing");
    setTimeout(() => {
      if (selectedSnapshotType === "SPF 2x4x8 KD Receipt") {
        setSnapshotStage("review");
        setAiSuggestions({
          name: "SPF 2x4x8 KD",
          vendor: "Home Depot Pro",
          sku: "SPF-248-KD",
          barcode: "032054110022",
          qrCode: "QR-SPF-248",
          quantity: 50,
          unit: "pcs",
          cost: 4.50,
          tax: 18.00,
          purchaseDate: "2026-07-06",
          category: "Lumber",
          manufacturer: "Weyerhaeuser",
          serialNumber: "SN-9281-WEY",
          isUnrecognized: true
        });
      } else {
        setSnapshotStage("review");
        setAiSuggestions({
          name: "Copper Pipe Type L 3/4in x 10ft",
          vendor: "Home Depot Pro",
          sku: "COP-34-10",
          barcode: "685711200155",
          qrCode: "QR-COP-34",
          quantity: 20,
          unit: "ft",
          cost: 23.50,
          tax: 37.60,
          purchaseDate: "2026-07-06",
          category: "Plumbing",
          manufacturer: "Mueller Streamline",
          isUnrecognized: false
        });
      }
    }, 1500);
  };

  const handleApproveAISuggestion = () => {
    if (!aiSuggestions) return;

    // Apply the interpretation rule
    if (aiSuggestions.isUnrecognized && !userMappingSPF) {
      setSnapshotStage(" SPF_learn");
      return;
    }

    let matchId = "";
    let updatedList = [...inventoryList];
    const newItemId = `ai_${Date.now()}`;

    const newItem: InventoryItem = {
      id: newItemId,
      name: aiSuggestions.name,
      category: aiSuggestions.category,
      vendor: aiSuggestions.vendor,
      manufacturer: aiSuggestions.manufacturer,
      sku: aiSuggestions.sku,
      barcode: aiSuggestions.barcode,
      qrCode: aiSuggestions.qrCode,
      description: "Auto generated from scanned receipt",
      quantity: aiSuggestions.quantity,
      unit: aiSuggestions.unit,
      minQuantity: 5,
      maxQuantity: 100,
      location: "Warehouse A",
      unitCost: aiSuggestions.cost,
      sellingPrice: aiSuggestions.cost * 1.5,
      notes: "Created via Snapshot AI Camera OCR",
      photo: "🪵",
      isFavorite: false,
      lastUpdated: new Date().toLocaleTimeString(),
      quantityHistory: [{ date: "2026-07-06", type: "AI Scanned New", amount: aiSuggestions.quantity, previous: 0, current: aiSuggestions.quantity, notes: "Created new catalog entry" }],
      purchaseHistory: [],
      usageHistory: []
    };

    if (userMappingSPF === "match" || !aiSuggestions.isUnrecognized) {
      // match with existing lumber SPF
      const match = inventoryList.find(e => e.sku === "SPF-248-KD");
      if (match) {
        matchId = match.id;
        const updated = {
          ...match,
          quantity: match.quantity + aiSuggestions.quantity,
          quantityHistory: [
            { date: "2026-07-06", type: "AI Receipt Scan", amount: aiSuggestions.quantity, previous: match.quantity, current: match.quantity + aiSuggestions.quantity, notes: `Scanned at ${aiSuggestions.vendor} receipt` },
            ...match.quantityHistory
          ]
        };
        updatedList = inventoryList.map(e => e.id === match.id ? updated : e);
        setInventoryList(updatedList);
      }
    } else if (userMappingSPF === "new") {
      updatedList = [...inventoryList, newItem];
      setInventoryList(updatedList);
    }

    // Add to local purchases
    const newPurchase: PurchaseRecord = {
      id: `P-${Math.floor(100 + Math.random() * 900)}`,
      vendor: aiSuggestions.vendor,
      receiptNumber: `AI-${Math.floor(100000 + Math.random() * 900000)}`,
      date: aiSuggestions.purchaseDate,
      employee: loggedInUser?.name || "Marcus Vance",
      itemsPurchased: `${aiSuggestions.name} (${aiSuggestions.quantity})`,
      totalCost: (aiSuggestions.quantity * aiSuggestions.cost) + (aiSuggestions.tax || 0)
    };
    setPurchases(prev => [newPurchase, ...prev]);

    setIsSnapshotAIModalOpen(false);
    setSnapshotStage("camera");
    setAiSuggestions(null);
    setUserMappingSPF(null);

    // Calculate new stats
    const newTotalQty = updatedList.reduce((acc, item) => acc + item.quantity, 0);
    const newLedgerVal = updatedList.reduce((acc, item) => acc + (item.quantity * item.unitCost), 0);

    triggerToast(`Inventory updated successfully. New total stock: ${newTotalQty} units, Ledger value: $${newLedgerVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`);
  };

  // Generate a automatic Purchase order list from low stock items
  const generateLowStockPurchaseList = () => {
    const lowStock = inventoryList.filter(item => item.quantity <= item.minQuantity);
    if (lowStock.length === 0) {
      triggerToast("No stock items are currently below minimum levels!");
      return;
    }
    setReorderCandidates(lowStock);
    setReorderModalOpen(true);
  };

  const handleReplenishStock = () => {
    if (reorderCandidates.length === 0) return;
    setInventoryList(prev => prev.map(item => {
      const match = reorderCandidates.find(rc => rc.id === item.id);
      if (match) {
        const reorderAmount = match.maxQuantity - match.quantity;
        return {
          ...item,
          quantity: match.maxQuantity,
          quantityHistory: [
            {
              date: new Date().toISOString().slice(0, 10),
              type: "Purchase" as const,
              amount: reorderAmount,
              previous: match.quantity,
              current: match.maxQuantity,
              notes: `Auto-replenishment order from ${match.vendor}`
            },
            ...(item.quantityHistory || [])
          ]
        };
      }
      return item;
    }));

    triggerToast(`🎉 Successfully reordered and replenished ${reorderCandidates.length} low-stock items!`);
    setReorderModalOpen(false);
    setReorderCandidates([]);
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      
      {/* TOP INVENTORY MANAGEMENT CARD */}
      <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#E3F3FF]/30 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="px-3 py-1 bg-[#E3F3FF] text-[#4A9BFF] text-[9.5px] font-mono font-bold rounded-xl border border-[#A9CDEE] uppercase">
              Operational Ledger
            </span>
            <h1 className="text-xl font-sans font-extrabold text-[#342D7E] uppercase tracking-wider flex items-center gap-2">
              <Package className="w-5 h-5 text-[#4A9BFF]" /> Inventory Management
            </h1>
            <p className="text-xs text-slate-500 font-sans font-semibold">
              Master material database with dynamic geofencing, receipts optical character logic, and asset tracking.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                resetForm();
                setIsAddPopupOpen(true);
              }}
              className="px-3 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>

            <button
              onClick={() => {
                setSnapshotStage("camera");
                setIsSnapshotAIModalOpen(true);
              }}
              className="px-3 py-2 bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all hover:opacity-90 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" /> Snapshot AI
            </button>

            <button
              onClick={() => {
                setScannerType("barcode");
                setIsScannerModalOpen(true);
              }}
              className="px-3 py-2 bg-[#E3F3FF] text-[#342D7E] border border-[#A9CDEE] hover:bg-[#D5EAFF] text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Barcode className="w-3.5 h-3.5" /> Scan Barcode
            </button>

            <button
              onClick={() => {
                setScannerType("qr");
                setIsScannerModalOpen(true);
              }}
              className="px-3 py-2 bg-[#E3F3FF] text-[#342D7E] border border-[#A9CDEE] hover:bg-[#D5EAFF] text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5" /> Scan QR
            </button>

            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-2.5 py-2 bg-[#E3F3FF] text-slate-600 border border-[#A9CDEE] hover:bg-[#D5EAFF] text-xs font-bold rounded-xl transition-all cursor-pointer"
              title="Import spreadsheet CSV ledger data"
            >
              <Upload className="w-3.5 h-3.5 inline mr-1" /> Import
            </button>

            <button
              onClick={handleExport}
              className="px-2.5 py-2 bg-[#E3F3FF] text-slate-600 border border-[#A9CDEE] hover:bg-[#D5EAFF] text-xs font-bold rounded-xl transition-all cursor-pointer"
              title="Export dynamic spreadsheet CSV"
            >
              <Download className="w-3.5 h-3.5 inline mr-1" /> Export
            </button>

            <button
              onClick={() => setCurrentView(currentView === "list" ? "purchases" : "list")}
              className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 border transition-all cursor-pointer ${
                currentView === "purchases" 
                  ? "bg-amber-100 text-amber-800 border-amber-300"
                  : "bg-[#E3F3FF] text-[#342D7E] border-[#A9CDEE] hover:bg-[#D5EAFF]"
              }`}
            >
              <History className="w-3.5 h-3.5" /> Purchase History
            </button>

            <button
              onClick={handleRefresh}
              className="p-2 bg-[#E3F3FF] text-slate-600 border border-[#A9CDEE] hover:bg-[#D5EAFF] rounded-xl transition-all cursor-pointer"
              title="Refresh inventory system state"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* SUMMARY STATS CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        
        <div 
          onClick={() => { setActiveTabFilter("all"); setSelectedCategory(null); }}
          className={`bg-[#E3F3FF] p-3.5 rounded-2xl border transition-all cursor-pointer ${activeTabFilter === "all" && !selectedCategory ? "border-blue-500 ring-2 ring-blue-200" : "border-[#A9CDEE] hover:border-blue-400"}`}
        >
          <span className="p-1.5 bg-[#C7E3FB] rounded-lg inline-block mb-1.5 text-[#342D7E]">
            <Layers className="w-4 h-4" />
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-tight">Total Catalog</p>
          <p className="text-lg font-mono font-black text-slate-800 mt-0.5">{stats.totalItems}</p>
        </div>

        <div 
          onClick={() => { setActiveTabFilter("all"); }}
          className="bg-[#E3F3FF] p-3.5 rounded-2xl border border-[#A9CDEE] hover:border-blue-400 transition-all cursor-pointer"
        >
          <span className="p-1.5 bg-[#C7E3FB] rounded-lg inline-block mb-1.5 text-emerald-600">
            <DollarSign className="w-4 h-4" />
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-tight">Ledger Value</p>
          <p className="text-lg font-mono font-black text-slate-800 mt-0.5">${stats.totalVal.toLocaleString()}</p>
        </div>

        <div 
          onClick={() => { setActiveTabFilter("low_stock"); setSelectedCategory(null); }}
          className={`bg-[#E3F3FF] p-3.5 rounded-2xl border transition-all cursor-pointer ${activeTabFilter === "low_stock" ? "border-amber-500 ring-2 ring-amber-100" : "border-[#A9CDEE] hover:border-amber-400"}`}
        >
          <span className="p-1.5 bg-amber-100 rounded-lg inline-block mb-1.5 text-amber-600">
            <AlertTriangle className="w-4 h-4" />
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-tight">Low Stock</p>
          <p className="text-lg font-mono font-black text-slate-800 mt-0.5">{stats.lowStockCount}</p>
        </div>

        <div 
          onClick={() => { setActiveTabFilter("out_of_stock"); setSelectedCategory(null); }}
          className={`bg-[#E3F3FF] p-3.5 rounded-2xl border transition-all cursor-pointer ${activeTabFilter === "out_of_stock" ? "border-rose-500 ring-2 ring-rose-100" : "border-[#A9CDEE] hover:border-rose-400"}`}
        >
          <span className="p-1.5 bg-rose-100 rounded-lg inline-block mb-1.5 text-rose-600">
            <Trash2 className="w-4 h-4" />
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-tight">Out of Stock</p>
          <p className="text-lg font-mono font-black text-slate-800 mt-0.5">{stats.outOfStockCount}</p>
        </div>

        <div 
          onClick={() => { setActiveTabFilter("favorites"); setSelectedCategory(null); }}
          className={`bg-[#E3F3FF] p-3.5 rounded-2xl border transition-all cursor-pointer ${activeTabFilter === "favorites" ? "border-indigo-500 ring-2 ring-indigo-100" : "border-[#A9CDEE] hover:border-indigo-400"}`}
        >
          <span className="p-1.5 bg-indigo-100 rounded-lg inline-block mb-1.5 text-indigo-600">
            <Star className="w-4 h-4" />
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-tight">My Favorites</p>
          <p className="text-lg font-mono font-black text-slate-800 mt-0.5">{stats.favoriteCount}</p>
        </div>

        <div 
          onClick={() => { triggerToast("Filtered to materials consumed on tasks today."); }}
          className="bg-[#E3F3FF] p-3.5 rounded-2xl border border-[#A9CDEE] hover:border-blue-400 transition-all cursor-pointer"
        >
          <span className="p-1.5 bg-sky-100 rounded-lg inline-block mb-1.5 text-sky-600">
            <CheckSquare className="w-4 h-4" />
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-tight">Used Today</p>
          <p className="text-lg font-mono font-black text-slate-800 mt-0.5">3 items</p>
        </div>

        <div 
          onClick={() => { triggerToast("Opening inbound supply shipments schedule."); }}
          className="bg-[#E3F3FF] p-3.5 rounded-2xl border border-[#A9CDEE] hover:border-blue-400 transition-all cursor-pointer"
        >
          <span className="p-1.5 bg-orange-100 rounded-lg inline-block mb-1.5 text-orange-600">
            <Truck className="w-4 h-4" />
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-tight">Pending Deliveries</p>
          <p className="text-lg font-mono font-black text-slate-800 mt-0.5">2 POs</p>
        </div>

        <div 
          onClick={() => { triggerToast("Report compiled for Today's material usage."); }}
          className="bg-[#E3F3FF] p-3.5 rounded-2xl border border-[#A9CDEE] hover:border-blue-400 transition-all cursor-pointer"
        >
          <span className="p-1.5 bg-purple-100 rounded-lg inline-block mb-1.5 text-purple-600">
            <FileSpreadsheet className="w-4 h-4" />
          </span>
          <p className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-tight">Daily Usage</p>
          <p className="text-lg font-mono font-black text-[#342D7E] mt-0.5">$315.00</p>
        </div>

      </div>

      {/* SEARCH AND FILTERS */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            type="text"
            placeholder="Search by name, SKU, manufacturer, barcode, storage location, vendor..."
            className="w-full text-xs bg-[#E3F3FF] border border-[#A9CDEE] rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-[#4A9BFF] font-medium text-slate-700"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2 w-full md:w-auto shrink-0 justify-end">
          <button
            onClick={() => setActiveFilterDrawer(!activeFilterDrawer)}
            className={`px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeFilterDrawer 
                ? "bg-blue-100 border-blue-400 text-blue-800" 
                : "bg-[#E3F3FF] border-[#A9CDEE] text-slate-700 hover:bg-[#D5EAFF]"
            }`}
          >
            <Filter className="w-4 h-4" />
            {activeFilterDrawer ? "Close Filters" : "Filters"}
          </button>

          {activeTabFilter !== "all" || selectedCategory || filterWarehouse !== "all" || filterVendor !== "all" ? (
            <button
              onClick={() => {
                setActiveTabFilter("all");
                setSelectedCategory(null);
                setFilterWarehouse("all");
                setFilterVendor("all");
              }}
              className="px-3 py-2 bg-slate-100 text-slate-600 border border-slate-300 rounded-xl text-xs font-semibold cursor-pointer hover:bg-slate-200 transition-all"
            >
              Clear Active Filters
            </button>
          ) : null}

          <button
            onClick={generateLowStockPurchaseList}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" /> Reorder Low Stock
          </button>
        </div>

      </div>

      {/* FILTER DRAWER ACCORDION */}
      {activeFilterDrawer && (
        <div className="p-4 bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-medium text-slate-600 animate-slide-in-right">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-[#342D7E]">Storage Warehouse</label>
            <select
              value={filterWarehouse}
              onChange={(e) => setFilterWarehouse(e.target.value)}
              className="w-full p-2 bg-[#F5FAFF] border border-[#A9CDEE] rounded-lg focus:outline-none cursor-pointer"
            >
              <option value="all">All Warehouses & Vehicles</option>
              <option value="Warehouse A">Warehouse A</option>
              <option value="Warehouse B">Warehouse B</option>
              <option value="Truck 4">Truck 4</option>
              <option value="Truck 1">Truck 1</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-[#342D7E]">Default Supplier / Vendor</label>
            <select
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
              className="w-full p-2 bg-[#F5FAFF] border border-[#A9CDEE] rounded-lg focus:outline-none cursor-pointer"
            >
              <option value="all">All Vendors</option>
              <option value="Home Depot Pro">Home Depot Pro</option>
              <option value="Grainger Industrial">Grainger Industrial</option>
              <option value="Platt Electric">Platt Electric</option>
            </select>
          </div>

          <div className="space-y-1.5 flex flex-col justify-end">
            <div className="flex gap-2">
              <button
                onClick={() => { setSelectedCategory("Materials"); setActiveFilterDrawer(false); }}
                className="flex-1 p-2 bg-[#F5FAFF] border border-[#A9CDEE] hover:border-blue-400 rounded-lg text-center font-bold"
              >
                Materials Only
              </button>
              <button
                onClick={() => { setSelectedCategory("Tools"); setActiveFilterDrawer(false); }}
                className="flex-1 p-2 bg-[#F5FAFF] border border-[#A9CDEE] hover:border-blue-400 rounded-lg text-center font-bold"
              >
                Tools Only
              </button>
              <button
                onClick={() => { setSelectedCategory("Equipment"); setActiveFilterDrawer(false); }}
                className="flex-1 p-2 bg-[#F5FAFF] border border-[#A9CDEE] hover:border-blue-400 rounded-lg text-center font-bold"
              >
                Equipment Only
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONDITIONAL RENDER: LIST VIEW VS PURCHASE HISTORY */}
      {currentView === "purchases" ? (
        <div className="bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl p-5 space-y-4">
          <div className="flex justify-between items-center border-b border-[#A9CDEE]/40 pb-3">
            <div>
              <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Purchase History Ledger</h3>
              <p className="text-[10.5px] mt-0.5 text-slate-500">Chronological list of all scanned invoices, receipts, and material procurements.</p>
            </div>
            <button
              onClick={() => {
                if (onNavigateToScreen) {
                  onNavigateToScreen("documents");
                } else {
                  onOpenPlaceholder("Documents", "📁");
                }
              }}
              className="text-xs text-[#4A9BFF] font-bold hover:underline flex items-center gap-1"
            >
              Open Documents Cabinet <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#A9CDEE]/40 text-[#342D7E] uppercase text-[10px] font-bold">
                  <th className="py-2.5 px-3">Receipt #</th>
                  <th className="py-2.5 px-3">Vendor</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Purchased By</th>
                  <th className="py-2.5 px-3">Items Included</th>
                  <th className="py-2.5 px-3 text-right">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map(rec => (
                  <tr 
                    key={rec.id}
                    onClick={() => {
                      if (onNavigateToScreen) {
                        onNavigateToScreen("documents");
                      } else {
                        onOpenPlaceholder("Documents", "📁");
                      }
                      triggerToast(`Opening receipt document: ${rec.receiptNumber}`);
                    }}
                    className="border-b border-[#A9CDEE]/20 hover:bg-[#F5FAFF]/50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-3 font-mono font-black text-[#4A9BFF]">{rec.receiptNumber}</td>
                    <td className="py-3 px-3 font-semibold text-slate-700">{rec.vendor}</td>
                    <td className="py-3 px-3 font-mono text-slate-500">{rec.date}</td>
                    <td className="py-3 px-3 text-slate-600 font-medium">{rec.employee}</td>
                    <td className="py-3 px-3 text-slate-500 italic max-w-xs truncate">{rec.itemsPurchased}</td>
                    <td className="py-3 px-3 text-right font-mono font-black text-slate-800">${rec.totalCost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* MAIN INVENTORY LIST AND DETAILS */
        <div className="space-y-4">
          
          <div className="bg-[#E3F3FF] border border-[#A9CDEE] rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-[#C7E3FB] text-[#342D7E] font-extrabold uppercase text-[9.5px] border-b border-[#A9CDEE] tracking-wider">
                    <th className="py-3 px-3 text-center w-12">Photo</th>
                    <th className="py-3 px-4">Item Name</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Vendor</th>
                    <th className="py-3 px-3 font-mono">SKU / Model</th>
                    <th className="py-3 px-3 text-right font-mono">On Hand</th>
                    <th className="py-3 px-2">Unit</th>
                    <th className="py-3 px-3 text-right">Unit Cost</th>
                    <th className="py-3 px-3 text-right">Selling Price</th>
                    <th className="py-3 px-3 text-right">Value</th>
                    <th className="py-3 px-3">Storage Pin</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3 text-center w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-12 text-center text-slate-400 font-semibold uppercase tracking-wider">
                        No matches found in active inventory nodes. Try adjusting query or filters.
                      </td>
                    </tr>
                  ) : (
                    filteredInventory.map(item => {
                      const value = item.quantity * item.unitCost;
                      const isLow = item.quantity > 0 && item.quantity <= item.minQuantity;
                      const isOut = item.quantity === 0;

                      return (
                        <tr
                          key={item.id}
                          onClick={() => {
                            setSelectedItem(item);
                            setIsDetailsPopupOpen(true);
                          }}
                          className={`border-b border-[#A9CDEE]/30 hover:bg-[#F5FAFF] transition-all cursor-pointer relative group ${item.isFavorite ? "bg-amber-50/20" : ""}`}
                        >
                          <td className="py-2.5 px-3 text-center text-lg">{item.photo}</td>
                          <td className="py-2.5 px-4 font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                            {item.isFavorite && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                            {item.name}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-500 uppercase tracking-tight text-[10px]">{item.category}</td>
                          <td className="py-2.5 px-3 text-slate-600 font-medium">{item.vendor}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-400 font-bold">{item.sku}</td>
                          <td className={`py-2.5 px-3 text-right font-mono font-extrabold text-xs ${isOut ? "text-rose-600" : isLow ? "text-amber-600" : "text-slate-800"}`}>
                            {item.quantity}
                          </td>
                          <td className="py-2.5 px-2 text-slate-400 font-mono text-[10px]">{item.unit}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-500">${item.unitCost.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700">${item.sellingPrice.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-800">${value.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-slate-500 font-medium flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-[#4A9BFF]" /> {item.location}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                              isOut 
                                ? "bg-rose-100 text-rose-700 border border-rose-300"
                               : isLow
                                ? "bg-amber-100 text-amber-700 border border-amber-300"
                                : "bg-emerald-100 text-emerald-700 border border-emerald-300"
                            }`}>
                              {isOut ? "Out" : isLow ? "Low" : "In Stock"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditClick(item);
                                }}
                                className="p-1 bg-white hover:bg-blue-100 border border-[#A9CDEE] rounded-lg text-[#315C9F] transition-colors cursor-pointer"
                                title="Edit Item"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteItem(item.id);
                                }}
                                className="p-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-rose-600 transition-colors cursor-pointer"
                                title="Delete Item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* VISUAL CATEGORY GRID */}
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Fast Category Navigators</h4>
            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-9 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.name}
                  onClick={() => setSelectedCategory(selectedCategory === cat.name ? null : cat.name)}
                  className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                    selectedCategory === cat.name
                      ? "bg-blue-100 border-blue-500 text-blue-900 ring-2 ring-blue-100"
                      : "bg-[#E3F3FF] border-[#A9CDEE] text-slate-700 hover:bg-[#D5EAFF]"
                  }`}
                >
                  <span className="text-xl select-none">{cat.icon}</span>
                  <span className="text-[9.5px] font-extrabold tracking-tight truncate w-full">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ADD / EDIT ITEM POPUP MODAL */}
      {isAddPopupOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 text-left space-y-5">
            
            <div className="flex justify-between items-center border-b border-[#A9CDEE]/50 pb-3">
              <h3 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="w-5 h-5 text-[#4A9BFF]" /> {isEditMode ? "Modify Catalog Item" : "Create Custom Item Node"}
              </h3>
              <button 
                onClick={() => { setIsAddPopupOpen(false); resetForm(); }}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs font-semibold text-slate-700">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Item Name *</label>
                  <input
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    type="text"
                    placeholder="e.g. Copper Pipe Type L"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none focus:border-[#4A9BFF]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Category Class</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none cursor-pointer"
                  >
                    {CATEGORIES.map(cat => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
                    <option value="Custom">Custom / Special</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Vendor / Supplier</label>
                  <input
                    value={formVendor}
                    onChange={(e) => setFormVendor(e.target.value)}
                    type="text"
                    placeholder="Home Depot, Platt, etc."
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Manufacturer</label>
                  <input
                    value={formManufacturer}
                    onChange={(e) => setFormManufacturer(e.target.value)}
                    type="text"
                    placeholder="Weyerhaeuser, Southwire"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">SKU / Model Number</label>
                  <input
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    type="text"
                    placeholder="SPF-248-KD"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Barcode (UPC)</label>
                  <input
                    value={formBarcode}
                    onChange={(e) => setFormBarcode(e.target.value)}
                    type="text"
                    placeholder="e.g. 032054110022"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">QR Code Label</label>
                  <input
                    value={formQrCode}
                    onChange={(e) => setFormQrCode(e.target.value)}
                    type="text"
                    placeholder="QR-SPF-248"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Storage Location Pin</label>
                  <input
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    type="text"
                    placeholder="e.g. Warehouse A - Bay 2"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Qty On Hand</label>
                  <input
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(parseFloat(e.target.value) || 0)}
                    type="number"
                    min="0"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none font-mono text-right"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Min Threshold</label>
                  <input
                    value={formMinQty}
                    onChange={(e) => setFormMinQty(parseFloat(e.target.value) || 0)}
                    type="number"
                    min="0"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none font-mono text-right"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Max Threshold</label>
                  <input
                    value={formMaxQty}
                    onChange={(e) => setFormMaxQty(parseFloat(e.target.value) || 0)}
                    type="number"
                    min="0"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none font-mono text-right"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Unit Cost ($)</label>
                  <input
                    value={formUnitCost}
                    onChange={(e) => setFormUnitCost(parseFloat(e.target.value) || 0)}
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none font-mono text-right"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Selling Price ($)</label>
                  <input
                    value={formSellingPrice}
                    onChange={(e) => setFormSellingPrice(parseFloat(e.target.value) || 0)}
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none font-mono text-right"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Item Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Technical specifications, structural usage guidelines..."
                  rows={2}
                  className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl focus:outline-none"
                />
              </div>

              {/* CUSTOM DYNAMIC FIELDS AREA */}
              <div className="p-3.5 bg-[#F5FAFF] rounded-2xl border border-[#A9CDEE]/60 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[9.5px] uppercase font-bold text-[#342D7E] tracking-wider">Dynamic Attributes & Custom Fields</span>
                  <span className="text-[9px] text-slate-400 font-medium">Add specifications (e.g., Color, Gauge, Weight)</span>
                </div>
                
                {formCustomFields.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formCustomFields.map((field, index) => (
                      <span 
                        key={index} 
                        className="px-2.5 py-1 bg-blue-50 border border-[#A9CDEE]/80 rounded-lg text-[10.5px] font-bold text-slate-700 flex items-center gap-1.5 shadow-xs"
                      >
                        <span className="text-[#342D7E]">{field.key}:</span> {field.value}
                        <button
                          type="button"
                          onClick={() => setFormCustomFields(prev => prev.filter((_, i) => i !== index))}
                          className="text-slate-400 hover:text-slate-600 font-black cursor-pointer"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    type="text"
                    placeholder="Field Name"
                    className="flex-1 p-2 bg-white border border-[#A9CDEE] rounded-lg"
                  />
                  <input
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    type="text"
                    placeholder="Field Value"
                    className="flex-1 p-2 bg-white border border-[#A9CDEE] rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={addCustomField}
                    className="px-3 bg-[#E3F3FF] text-[#342D7E] border border-[#A9CDEE] hover:bg-[#C7E3FB] rounded-lg text-xs font-bold"
                  >
                    + Add Field
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[#A9CDEE]/50 pt-4">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      checked={formIsFavorite}
                      onChange={(e) => setFormIsFavorite(e.target.checked)}
                      type="checkbox"
                      className="w-4 h-4 rounded text-blue-500 border-slate-300"
                    />
                    Save to Favorite Materials
                  </label>

                  <div className="flex items-center gap-2">
                    <span className="text-[9.5px] uppercase font-bold text-slate-400">Selector Glyph:</span>
                    <select
                      value={formPhoto}
                      onChange={(e) => setFormPhoto(e.target.value)}
                      className="p-1 border border-[#A9CDEE] rounded cursor-pointer"
                    >
                      <option value="📦">📦 Generic Box</option>
                      <option value="🪵">🪵 Lumber Wood</option>
                      <option value="🔧">🔧 Tool Wrench</option>
                      <option value="🔌">🔌 Drill Plug</option>
                      <option value="💧">💧 Fluid/Copper</option>
                      <option value="⚡">⚡ Electrical wire</option>
                      <option value="🧱">🧱 Concrete brick</option>
                      <option value="⚙️">⚙️ Heavy Equipment</option>
                      <option value="🎨">🎨 Paint can</option>
                      <option value="🛡️">🛡️ Safety shield</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setIsAddPopupOpen(false); resetForm(); }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white rounded-xl text-xs font-black shadow-sm"
                  >
                    {isEditMode ? "Save Catalog Record" : "Add Catalog Record"}
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* INVENTORY DETAILS POPUP MODAL */}
      {isDetailsPopupOpen && selectedItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl p-6 text-left space-y-6">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-[#A9CDEE]/50 pb-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl select-none">{selectedItem.photo}</span>
                <div>
                  <h3 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider flex items-center gap-1.5">
                    {selectedItem.name}
                    {selectedItem.isFavorite && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">
                    SKU: {selectedItem.sku} • Category: {selectedItem.category}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsDetailsPopupOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              
              <div className="bg-[#F5FAFF] p-3.5 rounded-2xl border border-[#A9CDEE]/60">
                <p className="text-[9.5px] uppercase text-slate-400 font-bold">Qty On Hand</p>
                <p className="text-2xl font-mono font-black text-slate-800 mt-0.5">{selectedItem.quantity} <span className="text-xs text-slate-400 font-sans font-semibold">{selectedItem.unit}</span></p>
                <span className="text-[9px] text-slate-400 block mt-1">Min Level: {selectedItem.minQuantity} | Max: {selectedItem.maxQuantity}</span>
              </div>

              <div className="bg-[#F5FAFF] p-3.5 rounded-2xl border border-[#A9CDEE]/60">
                <p className="text-[9.5px] uppercase text-slate-400 font-bold">Unit Cost</p>
                <p className="text-2xl font-mono font-black text-slate-800 mt-0.5">${selectedItem.unitCost.toFixed(2)}</p>
                <span className="text-[9px] text-slate-400 block mt-1">Avg Cost: ${(selectedItem.unitCost * 0.98).toFixed(2)} (Last Order)</span>
              </div>

              <div className="bg-[#F5FAFF] p-3.5 rounded-2xl border border-[#A9CDEE]/60">
                <p className="text-[9.5px] uppercase text-slate-400 font-bold">Selling / Retail Price</p>
                <p className="text-2xl font-mono font-black text-[#4A9BFF] mt-0.5">${selectedItem.sellingPrice.toFixed(2)}</p>
                <span className="text-[9px] text-slate-400 block mt-1">Gross Margin: {(((selectedItem.sellingPrice - selectedItem.unitCost) / selectedItem.sellingPrice) * 100).toFixed(1)}%</span>
              </div>

              <div className="bg-[#F5FAFF] p-3.5 rounded-2xl border border-[#A9CDEE]/60">
                <p className="text-[9.5px] uppercase text-slate-400 font-bold">Calculated Assets Value</p>
                <p className="text-2xl font-mono font-black text-emerald-600 mt-0.5">${(selectedItem.quantity * selectedItem.unitCost).toLocaleString()}</p>
                <span className="text-[9px] text-slate-400 block mt-1">Selling Value: ${(selectedItem.quantity * selectedItem.sellingPrice).toLocaleString()}</span>
              </div>

            </div>

            {/* Left/Right Main layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs text-slate-600 font-semibold">
              
              {/* Left 2 Columns */}
              <div className="lg:col-span-2 space-y-5">
                
                <div className="bg-[#F5FAFF] p-4 rounded-2xl border border-[#A9CDEE]/40 space-y-3">
                  <h4 className="text-[10px] uppercase font-bold text-[#342D7E] tracking-wider">Specifications & Coordinates</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-4">
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Barcode (UPC)</span>
                      <span className="font-mono text-slate-700 font-black">{selectedItem.barcode || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">QR Label</span>
                      <span className="font-mono text-slate-700 font-black">{selectedItem.qrCode || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Manufacturer</span>
                      <span className="text-slate-700 font-black">{selectedItem.manufacturer || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Storage Coordinates</span>
                      <span className="text-slate-700 font-black">{selectedItem.location}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Custodian Employee</span>
                      <span className="text-slate-700 font-black">{selectedItem.assignedEmployee || "Pete Rogers (Warehouse)"}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase font-bold">Primary Supplier</span>
                      <span className="text-slate-700 font-black">{selectedItem.vendor}</span>
                    </div>
                  </div>

                  {selectedItem.customFields && selectedItem.customFields.length > 0 && (
                    <div className="border-t border-[#A9CDEE]/20 pt-3 space-y-1.5">
                      <span className="text-[9.5px] uppercase text-[#342D7E] font-bold block">Special Custom Attributes</span>
                      <div className="flex flex-wrap gap-2">
                        {selectedItem.customFields.map((field, i) => (
                          <span key={i} className="px-2 py-1 bg-[#E3F3FF] border border-[#A9CDEE]/40 rounded text-[10.5px] font-bold text-slate-700">
                            <span className="text-blue-700">{field.key}:</span> {field.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-[#A9CDEE]/20 pt-3 space-y-1">
                    <span className="text-[9px] text-slate-400 block uppercase font-bold">Usage Description</span>
                    <p className="text-slate-600 leading-normal font-sans font-medium">{selectedItem.description || "No manual product description logged yet."}</p>
                  </div>
                  
                  {selectedItem.notes && (
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-slate-600 text-[11px] font-sans font-medium">
                      <span className="font-bold text-blue-700 block mb-0.5">Custody & Handling Notes</span>
                      {selectedItem.notes}
                    </div>
                  )}
                </div>

                {/* HISTORICAL QUANTITY ADJUSTMENT JOURNAL */}
                <div className="bg-[#F5FAFF] p-4 rounded-2xl border border-[#A9CDEE]/40 space-y-3">
                  <h4 className="text-[10px] uppercase font-bold text-[#342D7E] tracking-wider flex items-center justify-between">
                    <span>Audit Trail & Quantity History</span>
                    <span className="text-[9px] font-mono text-slate-400 font-bold">Activity Log</span>
                  </h4>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto">
                    {selectedItem.quantityHistory.length === 0 ? (
                      <p className="text-slate-400 text-center py-4">No logged adjustments for this material node.</p>
                    ) : (
                      selectedItem.quantityHistory.map((log, idx) => (
                        <div key={idx} className="p-2.5 bg-white border border-[#A9CDEE]/20 rounded-xl flex items-center justify-between text-[11px]">
                          <div className="space-y-0.5">
                            <p className="font-bold text-slate-700">{log.notes || `Stock adjusted via ${log.type}`}</p>
                            <span className="text-[9px] text-slate-400 font-mono">{log.date} • {log.type}</span>
                          </div>
                          <div className="text-right">
                            <span className={`font-mono font-black text-xs block ${log.amount > 0 ? "text-emerald-600" : log.amount < 0 ? "text-rose-600" : "text-slate-600"}`}>
                              {log.amount > 0 ? `+${log.amount}` : log.amount}
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono block">End Stock: {log.current}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

              {/* Right Sidebar actions */}
              <div className="space-y-4">
                
                <div className="bg-[#F5FAFF] p-4 rounded-2xl border border-[#A9CDEE]/40 space-y-2.5">
                  <h4 className="text-[10px] uppercase font-bold text-[#342D7E] tracking-wider">Custodian Dispatch</h4>
                  
                  <div className="space-y-1">
                    <span className="text-[9px] text-slate-400 block uppercase font-bold">Assigned Crew / Vehicle</span>
                    <span className="text-slate-700 font-bold block bg-white p-2 border border-[#A9CDEE]/30 rounded-lg">
                      {selectedItem.assignedVehicle || "Unassigned (Main Warehouse Stock)"}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] text-slate-400 block uppercase font-bold">Material Custodian</span>
                    <span className="text-slate-700 font-bold block bg-white p-2 border border-[#A9CDEE]/30 rounded-lg">
                      {selectedItem.assignedEmployee || "Pete Rogers"}
                    </span>
                  </div>
                </div>

                <div className="bg-[#F5FAFF] p-4 rounded-2xl border border-[#A9CDEE]/40 space-y-2">
                  <h4 className="text-[10px] uppercase font-bold text-[#342D7E] tracking-wider">Actions Registry</h4>

                  <button
                    onClick={() => {
                      setQuickActionType("Receive");
                      setIsQuickActionModalOpen(true);
                    }}
                    className="w-full text-left p-2.5 bg-white hover:bg-slate-50 border border-[#A9CDEE]/40 rounded-xl text-xs font-bold text-[#342D7E] flex items-center justify-between"
                  >
                    <span>Receive / Check-in Shipment</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  <button
                    onClick={() => {
                      setQuickActionType("Remove");
                      setIsQuickActionModalOpen(true);
                    }}
                    className="w-full text-left p-2.5 bg-white hover:bg-slate-50 border border-[#A9CDEE]/40 rounded-xl text-xs font-bold text-[#342D7E] flex items-center justify-between"
                  >
                    <span>Remove / Consume Inventory</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  <button
                    onClick={() => {
                      setQuickActionType("Transfer");
                      setIsQuickActionModalOpen(true);
                    }}
                    className="w-full text-left p-2.5 bg-white hover:bg-slate-50 border border-[#A9CDEE]/40 rounded-xl text-xs font-bold text-[#342D7E] flex items-center justify-between"
                  >
                    <span>Transfer Storage Location</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  <button
                    onClick={() => {
                      setQuickActionType("AssignJob");
                      setIsQuickActionModalOpen(true);
                    }}
                    className="w-full text-left p-2.5 bg-white hover:bg-slate-50 border border-[#A9CDEE]/40 rounded-xl text-xs font-bold text-blue-700 flex items-center justify-between"
                  >
                    <span>Dispatch Material to Active Job</span>
                    <Briefcase className="w-4 h-4 text-blue-400" />
                  </button>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      onClick={() => handleEditClick(selectedItem)}
                      className="p-2.5 bg-white hover:bg-slate-50 border border-[#A9CDEE]/40 rounded-xl text-center font-bold text-slate-600 text-xs"
                    >
                      Edit Catalog
                    </button>
                    <button
                      onClick={() => handleDeleteItem(selectedItem.id)}
                      className="p-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl text-center font-bold text-rose-600 text-xs"
                    >
                      Delete Item
                    </button>
                  </div>
                </div>

                <div className="p-3.5 bg-[#F5FAFF] rounded-2xl border border-[#A9CDEE]/40 space-y-2">
                  <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Module Integrations</h4>
                  <div className="flex flex-col gap-1.5 text-[10.5px]">
                    <button
                      onClick={() => {
                        setIsDetailsPopupOpen(false);
                        if (onNavigateToScreen) {
                          onNavigateToScreen("jobs");
                        } else {
                          onOpenPlaceholder("Jobs", "💼");
                        }
                        triggerToast(`Opening jobs related to ${selectedItem.name}`);
                      }}
                      className="text-left font-bold text-[#4A9BFF] hover:underline block"
                    >
                      💼 View Jobs Using This Material
                    </button>
                    <button
                      onClick={() => {
                        setIsDetailsPopupOpen(false);
                        if (onNavigateToScreen) {
                          onNavigateToScreen("revenue");
                        } else {
                          onOpenPlaceholder("Revenue", "📈");
                        }
                      }}
                      className="text-left font-bold text-[#4A9BFF] hover:underline block"
                    >
                      📈 View Cost / Revenue Contribution
                    </button>
                    <button
                      onClick={() => {
                        setIsDetailsPopupOpen(false);
                        if (onNavigateToScreen) {
                          onNavigateToScreen("documents");
                        } else {
                          onOpenPlaceholder("Documents", "📁");
                        }
                      }}
                      className="text-left font-bold text-[#4A9BFF] hover:underline block"
                    >
                      📁 View Material Quality Certificates
                    </button>
                  </div>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

      {/* QUICK ACTIONS MODAL DIALOG (INSIDE DETAILS) */}
      {isQuickActionModalOpen && selectedItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-[60] p-4 animate-fade-in">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-3xl w-full max-w-md shadow-2xl p-6 text-left space-y-4">
            
            <div className="flex justify-between items-center border-b border-[#A9CDEE]/40 pb-2">
              <h4 className="text-xs font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">
                Quick Action: {quickActionType}
              </h4>
              <button 
                onClick={() => setIsQuickActionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-semibold text-slate-700">
              
              {["Receive", "Remove", "Correct", "Waste", "Damage", "Reserve", "AssignJob"].includes(quickActionType) && (
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Quantity ({selectedItem.unit})</label>
                  <input
                    value={quickActionQty}
                    onChange={(e) => setQuickActionQty(parseFloat(e.target.value) || 0)}
                    type="number"
                    min="1"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl font-mono text-right"
                  />
                </div>
              )}

              {["Transfer", "AssignJob", "AssignVehicle", "AssignEmployee"].includes(quickActionType) && (
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                    {quickActionType === "Transfer" ? "New Warehouse Bin / Shelf" :
                     quickActionType === "AssignJob" ? "Target Job / Coordinates" :
                     quickActionType === "AssignVehicle" ? "Target Vehicle / Truck" : "Target Employee Name"}
                  </label>
                  <input
                    value={quickActionTarget}
                    onChange={(e) => setQuickActionTarget(e.target.value)}
                    type="text"
                    placeholder="e.g. Truck 4, Job #1021, Warehouse B"
                    className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Adjustment Audit Note</label>
                <input
                  value={quickActionNotes}
                  onChange={(e) => setQuickActionNotes(e.target.value)}
                  type="text"
                  placeholder="e.g. Restocked post framing repairs"
                  className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl"
                />
              </div>

              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-[10.5px] font-sans font-medium text-slate-600 flex items-start gap-1.5">
                <Info className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Every manual inventory adjustment triggers an activity log for tracking purposes.</span>
              </div>

              <div className="flex gap-2 justify-end border-t border-[#A9CDEE]/40 pt-3">
                <button
                  onClick={() => setIsQuickActionModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={executeQuickAction}
                  className="px-5 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white font-bold rounded-lg"
                >
                  Verify & Log Adjustments
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* SNAPSHOT AI CAMERA POPUP DIALOG */}
      {isSnapshotAIModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-3xl w-full max-w-xl shadow-2xl p-6 text-left space-y-4">
            
            <div className="flex justify-between items-center border-b border-[#A9CDEE]/40 pb-2">
              <h3 className="text-xs font-sans font-extrabold text-[#342D7E] uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-5 h-5 text-indigo-500 animate-pulse" /> LeadForge Snapshot AI Camera
              </h3>
              <button 
                onClick={() => { 
                  setIsSnapshotAIModalOpen(false); 
                  setSnapshotStage("camera"); 
                  triggerToast("Inventory update canceled.");
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {snapshotStage === "camera" && (
              <div className="space-y-4">
                <input
                  type="file"
                  ref={localCameraInputRef}
                  onChange={handleLocalCameraCapture}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  style={{ display: "none" }}
                />

                <div className="bg-slate-950 aspect-video rounded-2xl relative overflow-hidden flex items-center justify-center border-2 border-dashed border-[#A9CDEE]">
                  {/* Camera view simulation */}
                  <div className="absolute inset-x-0 h-0.5 bg-indigo-500/80 shadow-[0_0_8px_rgba(99,102,241,1)] animate-bounce" style={{ animationDuration: "3s" }} />
                  <div className="absolute top-3 left-3 bg-red-600 text-white font-mono font-black text-[9px] px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" /> Live Camera Stream
                  </div>
                  
                  <div className="text-center p-6 text-slate-500 space-y-1.5 z-10">
                    <Camera className="w-10 h-10 mx-auto text-slate-600" />
                    <p className="text-xs font-bold font-sans text-slate-400">Position receipt, delivery pallet, shelf labels inside screen frame</p>
                    <p className="text-[10px] font-mono text-slate-600">Inventory status checked and updated dynamically</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-2 text-xs font-semibold text-slate-700">
                    <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Select Simulated Target</label>
                    <select
                      value={selectedSnapshotType}
                      onChange={(e) => setSelectedSnapshotType(e.target.value)}
                      className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl cursor-pointer font-bold"
                    >
                      <option value="SPF 2x4x8 KD Receipt">🧾 Store Receipt (Weyerhaeuser SPF 2x4x8 KD Studs)</option>
                      <option value="Copper Pipe Delivery Receipt">🧾 Inbound Bill of Lading (3/4in x 10ft Copper Tube)</option>
                    </select>
                  </div>

                  <div className="flex flex-col justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (localCameraInputRef.current) {
                          localCameraInputRef.current.click();
                        } else {
                          runCameraAI();
                        }
                      }}
                      className="w-full py-2.5 bg-[#342D7E] hover:bg-indigo-950 text-white font-black text-[10.5px] uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Camera className="w-4 h-4 text-emerald-400 animate-pulse" /> Launch Phone Camera
                    </button>
                  </div>
                </div>

                <button
                  onClick={runCameraAI}
                  className="w-full py-3 bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md transition-all hover:opacity-90"
                >
                  Process with LeadForge Snapshot AI
                </button>
              </div>
            )}

            {snapshotStage === "processing" && (
              <div className="py-12 text-center space-y-4">
                <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">Processing Scanned Items</h4>
                  <p className="text-[10.5px] text-slate-500 max-w-xs mx-auto leading-relaxed font-sans font-medium">
                    OCR engines are reading scanned receipts and matching vendor SKU abbreviations directly to company master inventory index...
                  </p>
                </div>
              </div>
            )}

            {snapshotStage === "review" && aiSuggestions && (
              <div className="space-y-4 text-xs text-slate-600 font-semibold">
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-2 text-[11px] font-sans font-medium">
                  <Sparkles className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-indigo-800 block">AI Snapshot Analysis Successful!</span>
                    Found matching purchase coordinates from <strong className="text-slate-800">{aiSuggestions.vendor}</strong>. Review and confirm ledger changes.
                  </div>
                </div>

                <div className="bg-[#F5FAFF] border border-[#A9CDEE]/50 p-4 rounded-xl space-y-3">
                  <h4 className="text-[10px] uppercase font-bold text-[#342D7E] tracking-wider border-b border-[#A9CDEE]/30 pb-1.5">Extracted Structured Parameters</h4>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-y-2.5 gap-x-4">
                    <div>
                      <span className="text-[9px] text-slate-400 block font-bold">Suggested Item Name</span>
                      <span className="text-slate-800 font-black">{aiSuggestions.name}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block font-bold">Category Match</span>
                      <span className="text-slate-800 font-black">{aiSuggestions.category}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block font-bold">Vendor Name</span>
                      <span className="text-slate-800 font-black">{aiSuggestions.vendor}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block font-bold">Extracted SKU</span>
                      <span className="font-mono text-slate-800 font-black">{aiSuggestions.sku}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block font-bold">Scanned Quantity</span>
                      <span className="font-mono text-slate-800 font-black">+{aiSuggestions.quantity} {aiSuggestions.unit}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block font-bold">Extracted Cost</span>
                      <span className="font-mono text-slate-800 font-black">${aiSuggestions.cost.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    onClick={() => { 
                      setIsSnapshotAIModalOpen(false); 
                      setSnapshotStage("camera"); 
                      setAiSuggestions(null); 
                      setUserMappingSPF(null);
                      triggerToast("Inventory update canceled.");
                    }}
                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { setSnapshotStage("camera"); setAiSuggestions(null); }}
                    className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-bold"
                  >
                    Retake Photo
                  </button>
                  <button
                    onClick={handleApproveAISuggestion}
                    className="px-5 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white font-black rounded-lg uppercase tracking-wider"
                  >
                    Confirm & Update Ledger
                  </button>
                </div>
              </div>
            )}

            {snapshotStage === " SPF_learn" && aiSuggestions && (
              <div className="space-y-4 text-xs text-slate-600 font-semibold">
                
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="text-amber-800 font-black uppercase text-[10.5px] block">AI Interpretation Ambiguity Warning</strong>
                    <p className="text-[11px] font-sans font-medium text-slate-600">
                      The OCR extracted receipt abbreviation <strong className="text-slate-800">"SPF 2x4x8 KD"</strong> is unrecognized in your standard company catalog names. AI never guesses.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-white border border-[#A9CDEE]/60 rounded-xl space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#342D7E]">What is the correct mapping for SPF 2x4x8 KD?</p>
                  
                  <div className="space-y-2">
                    <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-200 hover:border-blue-400 rounded-xl cursor-pointer">
                      <input
                        type="radio"
                        name="spf_mapping"
                        checked={userMappingSPF === "match"}
                        onChange={() => setUserMappingSPF("match")}
                        className="w-4 h-4 text-blue-500"
                      />
                      <div>
                        <strong className="text-slate-800 text-[11px] block">Match to Existing Standard Stud Item</strong>
                        <span className="text-[9.5px] text-slate-400 font-medium">Link "SPF 2x4x8 KD" to "2x4 Stud Spruce-Pine-Fir" catalog item.</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-200 hover:border-blue-400 rounded-xl cursor-pointer">
                      <input
                        type="radio"
                        name="spf_mapping"
                        checked={userMappingSPF === "new"}
                        onChange={() => setUserMappingSPF("new")}
                        className="w-4 h-4 text-blue-500"
                      />
                      <div>
                        <strong className="text-slate-800 text-[11px] block">Create Brand New Catalog Item</strong>
                        <span className="text-[9.5px] text-slate-400 font-medium">Establish a brand new ledger entry for SPF 2x4x8 KD Spruce.</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-200 hover:border-blue-400 rounded-xl cursor-pointer">
                      <input
                        type="radio"
                        name="spf_mapping"
                        checked={userMappingSPF === "ignore"}
                        onChange={() => setUserMappingSPF("ignore")}
                        className="w-4 h-4 text-blue-500"
                      />
                      <div>
                        <strong className="text-slate-800 text-[11px] block">Ignore / Cancel Item Addition</strong>
                        <span className="text-[9.5px] text-slate-400 font-medium">Skip adding this material on receipt. Add to cash spent ledger only.</span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { 
                      setIsSnapshotAIModalOpen(false); 
                      setSnapshotStage("camera"); 
                      setAiSuggestions(null); 
                      setUserMappingSPF(null);
                      triggerToast("Inventory update canceled.");
                    }}
                    className="px-4 py-2 bg-slate-100 text-rose-600 rounded-lg font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { setSnapshotStage("review"); setUserMappingSPF(null); }}
                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg"
                  >
                    Back
                  </button>
                  <button
                    disabled={!userMappingSPF}
                    onClick={handleApproveAISuggestion}
                    className="px-5 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white font-bold rounded-lg disabled:opacity-50"
                  >
                    Learn Mapping & Update Stock
                  </button>
                </div>

              </div>
            )}

          </div>
        </div>
      )}

      {/* BARCODE / QR SCANNER SIMULATION POPUP */}
      {isScannerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-3xl w-full max-w-sm shadow-2xl p-6 text-left space-y-4">
            
            <div className="flex justify-between items-center border-b border-[#A9CDEE]/40 pb-2">
              <h3 className="text-xs font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">
                Simulated {scannerType === "barcode" ? "Barcode Scan" : "QR Code Scan"}
              </h3>
              <button 
                onClick={() => setIsScannerModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-semibold text-slate-700">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-[10.5px]">
                Type in an existing SKU or code below to simulate a laser scan trigger, or enter a new SKU to test catalog onboarding.
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Simulated Optical Scan Code</label>
                <input
                  value={scanInputCode}
                  onChange={(e) => setScanInputCode(e.target.value)}
                  type="text"
                  placeholder="e.g. SPF-248-KD, 032054110022"
                  className="w-full p-2.5 bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl font-mono text-center text-sm font-bold tracking-widest uppercase focus:outline-none"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleScannerSubmit(); }}
                />
              </div>

              <div className="flex flex-col gap-1 text-[10px] text-slate-400">
                <p>💡 Quick Reference SKU Nodes to scan:</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <span 
                    onClick={() => setScanInputCode("032054110022")}
                    className="px-2 py-0.5 bg-white border rounded cursor-pointer hover:border-blue-400 font-mono font-bold"
                  >
                    032054110022
                  </span>
                  <span 
                    onClick={() => setScanInputCode("DEW-DCD771")}
                    className="px-2 py-0.5 bg-white border rounded cursor-pointer hover:border-blue-400 font-mono font-bold"
                  >
                    DEW-DCD771
                  </span>
                  <span 
                    onClick={() => setScanInputCode("COP-34-10")}
                    className="px-2 py-0.5 bg-white border rounded cursor-pointer hover:border-blue-400 font-mono font-bold"
                  >
                    COP-34-10
                  </span>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-[#A9CDEE]/30">
                <button
                  onClick={() => setIsScannerModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleScannerSubmit}
                  className="px-5 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white font-bold rounded-lg"
                >
                  Simulate Scan Gun
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* SPREADSHEET IMPORT MODAL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-3xl w-full max-w-lg shadow-2xl p-6 text-left space-y-4">
            
            <div className="flex justify-between items-center border-b border-[#A9CDEE]/40 pb-2">
              <h3 className="text-xs font-sans font-extrabold text-[#342D7E] uppercase tracking-wider flex items-center gap-1.5">
                <Upload className="w-5 h-5 text-blue-500" /> Import Ledger Columns
              </h3>
              <button 
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-semibold text-slate-700">
              <p className="text-[11px] text-slate-500 font-sans font-medium">
                Upload a CSV spreadsheet file, or paste comma-separated rows directly below.
              </p>

              <div className="bg-white p-3 rounded-xl border border-[#A9CDEE] space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 block">Select CSV or Excel (.xlsx, .xls) File</label>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const fileExt = file.name.split('.').pop()?.toLowerCase();
                      if (fileExt === 'xlsx' || fileExt === 'xls') {
                        const fileReader = new FileReader();
                        fileReader.onload = (event) => {
                          try {
                            const data = new Uint8Array(event.target?.result as ArrayBuffer);
                            const workbook = XLSX.read(data, { type: 'array' });
                            const firstSheetName = workbook.SheetNames[0];
                            const worksheet = workbook.Sheets[firstSheetName];
                            const csv = XLSX.utils.sheet_to_csv(worksheet);
                            setImportText(csv);
                            triggerToast(`📂 Excel sheet loaded: ${file.name}`);
                          } catch (err) {
                            triggerToast("⚠️ Failed to parse Excel spreadsheet file.");
                          }
                        };
                        fileReader.readAsArrayBuffer(file);
                      } else {
                        const fileReader = new FileReader();
                        fileReader.onload = (event) => {
                          const text = event.target?.result as string;
                          setImportText(text);
                          triggerToast(`📂 CSV file loaded: ${file.name}`);
                        };
                        fileReader.readAsText(file);
                      }
                    }
                  }}
                  className="w-full text-xs text-slate-600 cursor-pointer focus:outline-none"
                />
              </div>

              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Name,Category,Vendor,SKU,Barcode,Quantity,Unit,Location,UnitCost,SellingPrice&#10;OSB Framing Sheet,Lumber,Home Depot,OSB-12-8,03992110292,80,pcs,Warehouse B,21.50,34.00"
                rows={4}
                className="w-full p-2.5 bg-white border border-[#A9CDEE] rounded-xl font-mono text-xs focus:outline-none"
              />

              <div className="flex gap-2 justify-end pt-2 border-t border-[#A9CDEE]/30">
                <button
                  onClick={() => { setIsImportModalOpen(false); setImportText(""); }}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  className="px-5 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white font-bold rounded-lg cursor-pointer"
                >
                  Import Rows Now
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-3xl w-full max-w-md shadow-2xl p-6 text-left space-y-4">
            <div className="flex justify-between items-center border-b border-[#A9CDEE]/40 pb-2">
              <h3 className="text-xs font-sans font-extrabold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
                <Trash2 className="w-5 h-5 text-rose-500" /> Remove Catalog Item
              </h3>
              <button 
                onClick={() => setDeletingItem(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="text-xs font-semibold text-slate-700 space-y-2">
              <p className="text-sm text-slate-800">
                Are you sure you want to permanently delete <span className="font-extrabold text-rose-600">{deletingItem.name}</span> from the inventory catalog?
              </p>
              <p className="text-[11px] text-slate-500">
                SKU: {deletingItem.sku} | Location: {deletingItem.location}
              </p>
              <p className="text-[10px] text-amber-600 font-bold bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                ⚠️ Warning: This action cannot be undone. All transaction and usage logs for this item will be removed.
              </p>
            </div>

            <div className="flex gap-2.5 justify-end pt-2 border-t border-[#A9CDEE]/30">
              <button
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs cursor-pointer transition-colors"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REORDER LOW STOCK MODAL */}
      {reorderModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-3xl w-full max-w-xl shadow-2xl p-6 text-left space-y-4">
            <div className="flex justify-between items-center border-b border-[#A9CDEE]/40 pb-2">
              <h3 className="text-sm font-sans font-extrabold text-[#342D7E] uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingCart className="w-5 h-5 text-amber-500 animate-bounce" /> Auto-Generate Purchase Reorder
              </h3>
              <button 
                onClick={() => setReorderModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs font-semibold text-slate-700 space-y-3">
              <p className="text-xs text-slate-600 font-medium">
                The following {reorderCandidates.length} stock nodes have fallen below minimum safety threshold levels. We have calculated optimal replenishment quantities to bring them up to maximum capacities:
              </p>

              <div className="max-h-[220px] overflow-y-auto border border-[#A9CDEE] rounded-2xl bg-white divide-y divide-slate-100">
                {reorderCandidates.map(e => {
                  const reorderQty = e.maxQuantity - e.quantity;
                  const totalCost = reorderQty * e.unitCost;
                  return (
                    <div key={e.id} className="p-3 flex justify-between items-center hover:bg-slate-50 transition-colors">
                      <div>
                        <span className="text-lg mr-2 select-none">{e.photo}</span>
                        <span className="font-extrabold text-slate-800 text-xs">{e.name}</span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          SKU: {e.sku} | Vendor: {e.vendor}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xs font-black text-[#342D7E]">
                          +{reorderQty} {e.unit}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Est. Cost: ${totalCost.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex justify-between items-center">
                <span className="text-[11px] text-blue-700 font-extrabold uppercase tracking-wider">Total Proposed Purchase Order:</span>
                <span className="font-mono text-xs font-black text-blue-900">
                  ${reorderCandidates.reduce((acc, e) => acc + ((e.maxQuantity - e.quantity) * e.unitCost), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="flex gap-2.5 justify-end pt-2 border-t border-[#A9CDEE]/30">
              <button
                onClick={() => setReorderModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-200 transition-colors"
              >
                Cancel PO
              </button>
              <button
                onClick={handleReplenishStock}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-xs cursor-pointer transition-colors shadow-md flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Approve & Replenish Stock Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FRAMEWORK CONNECTIONS SUMMARY */}
      <div className="p-4 bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl space-y-3 font-sans font-medium text-slate-600">
        <h4 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Framework Connections Summary</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-4 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Dashboard</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Revenue</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Customers</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Leads</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Estimates & Bids</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Scheduling</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Dispatch</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Routes</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Jobs</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span className="text-slate-700">Time Clock</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>□</span>
            <span>Documents</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>□</span>
            <span>Messages</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>□</span>
            <span>Roster</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>□</span>
            <span>AI Assistant</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>□</span>
            <span>Training</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>□</span>
            <span>Settings</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>□</span>
            <span>Integrations</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>□</span>
            <span>Notifications</span>
          </div>
        </div>
      </div>

    </div>
  );
};
