import React, { useState, useMemo, useRef, useEffect } from "react";
import { PDFEditor, EditorObject } from "./PDFEditor";
import {
  Search,
  Plus,
  Upload,
  Download,
  FileText,
  Camera,
  RefreshCw,
  Filter,
  CheckCircle,
  AlertTriangle,
  Clock,
  DollarSign,
  FolderOpen,
  Folder,
  ChevronRight,
  ChevronDown,
  Trash2,
  Edit3,
  Share2,
  Printer,
  User,
  Briefcase,
  Users,
  Eye,
  Star,
  Archive,
  ArrowUpRight,
  Sparkles,
  X,
  PlusCircle,
  Check,
  Send,
  Info,
  Layers,
  Image,
  Video,
  FileSpreadsheet,
  FileSignature,
  FilePlus,
  FolderPlus,
  BookOpen,
  Smartphone,
  Cloud,
  Images,
  Link,
  Mail,
  MessageCircle,
  ExternalLink,
  QrCode
} from "lucide-react";

export type { DocumentItem } from "../types/domain";
import type { DocumentItem } from "../types/domain";

interface DocumentsPageProps {
  onOpenPlaceholder: (label: string, icon: string) => void;
  onTakeSnapshot?: (pageId: string, pageName: string, meta?: any) => void;
  onOpenAIAnalysis?: (pageId: string, pageName: string, customContext?: string) => void;
  activeRole: string;
  loggedInUser?: any;
  logOperationalEvent?: (type: string, desc: string, icon: string) => void;
  onNavigateToScreen?: (screenId: string, params?: { customerId?: string; date?: string }) => void;
  documents: DocumentItem[];
  setDocuments: React.Dispatch<React.SetStateAction<DocumentItem[]>>;
  customersList?: any[];
}

export const DocumentsPage: React.FC<DocumentsPageProps> = ({
  onOpenPlaceholder,
  onTakeSnapshot,
  onOpenAIAnalysis,
  activeRole,
  loggedInUser,
  logOperationalEvent,
  onNavigateToScreen,
  documents,
  setDocuments,
  customersList = []
}) => {
  // Navigation filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string | null>(null);
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<string | null>(null);
  const [searchByField, setSearchByField] = useState<string>("all");

  // Advanced filters state
  const [filterCustomer, setFilterCustomer] = useState("All");
  const [filterEmployee, setFilterEmployee] = useState("All");
  const [filterVendor, setFilterVendor] = useState("All");
  const [filterJob, setFilterJob] = useState("All");
  const [filterDocType, setFilterDocType] = useState("All");
  const [filterSignedStatus, setFilterSignedStatus] = useState<"All" | "Signed" | "Unsigned">("All");
  const [filterFavorite, setFilterFavorite] = useState<boolean>(false);
  const [filterArchived, setFilterArchived] = useState<boolean>(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Selected Document for details pane
  const [selectedDocId, setSelectedDocId] = useState<string | null>("doc_1");
  const activeDoc = useMemo(() => {
    return documents.find((d) => d.id === selectedDocId) || documents[0] || null;
  }, [documents, selectedDocId]);

  // Native PDF Editor States
  const [isPDFEditorOpen, setIsPDFEditorOpen] = useState(false);
  const [pdfEditorDocId, setPdfEditorDocId] = useState<string | null>(null);
  const [pdfEditorDocName, setPdfEditorDocName] = useState("");
  const [pdfEditorInitialObjects, setPdfEditorInitialObjects] = useState<any[]>([]);

  // Dynamic directory lists for Create Folder action
  const [foldersList, setFoldersList] = useState<string[]>([
    "Inventory", "Fleet", "Insurance", "Legal", "Training", "Templates", "Standard Templates", "Custom Folders"
  ]);

  // Secondary high-fidelity interactive modals
  const [isGoogleDriveModalOpen, setIsGoogleDriveModalOpen] = useState(false);
  const [isPhoneUploadModalOpen, setIsPhoneUploadModalOpen] = useState(false);
  const [isPhotoToPDFModalOpen, setIsPhotoToPDFModalOpen] = useState(false);
  const [isMainShareModalOpen, setIsMainShareModalOpen] = useState(false);
  const [shareDocItem, setShareDocItem] = useState<DocumentItem | null>(null);

  // Photo-to-PDF selection state
  const [photoToPdfName, setPhotoToPdfName] = useState("Photo Compilation.pdf");
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([
    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=500",
    "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=500"
  ]);

  // Seed standard unchanged templates inside local state on component mount
  useEffect(() => {
    const hasTemplate1 = documents.some(d => d.name === "Standard Service Agreement (TEMPLATE).pdf");
    if (!hasTemplate1) {
      const standardTemplates: DocumentItem[] = [
        {
          id: "doc_template_1",
          name: "Standard Service Agreement (TEMPLATE).pdf",
          customer: "None",
          employee: "System Core",
          vendor: "None",
          job: "None",
          type: "Contracts",
          uploadedBy: "System admin",
          date: "2026-07-01",
          size: "450 KB",
          status: "Unsigned",
          isFavorite: true,
          isArchived: false,
          notes: "Standard master service contract. This template remains unchanged; duplicate or open in PDF editor to create copy.",
          tags: ["Template", "Standard", "Legal"],
          estimateId: "None",
          invoiceId: "None",
          lastModified: "2026-07-01 09:00 AM"
        },
        {
          id: "doc_template_2",
          name: "Standard Field Assessment (TEMPLATE).pdf",
          customer: "None",
          employee: "System Core",
          vendor: "None",
          job: "None",
          type: "Estimates",
          uploadedBy: "System admin",
          date: "2026-07-01",
          size: "320 KB",
          status: "Unsigned",
          isFavorite: false,
          isArchived: false,
          notes: "Standard on-site damage and service assessment sheet. Intact template files.",
          tags: ["Template", "Standard"],
          estimateId: "None",
          invoiceId: "None",
          lastModified: "2026-07-01 09:00 AM"
        }
      ];
      setDocuments(prev => [...prev, ...standardTemplates]);
    }
  }, [documents, setDocuments]);

  // Handler to open PDF Editor
  const handleOpenPDFEditor = (doc: DocumentItem | null) => {
    if (doc) {
      setPdfEditorDocId(doc.id);
      setPdfEditorDocName(doc.name);
      setPdfEditorInitialObjects((doc as any).metaObjects || []);
    } else {
      setPdfEditorDocId(null);
      setPdfEditorDocName("New Blank Document.pdf");
      setPdfEditorInitialObjects([]);
    }
    setIsPDFEditorOpen(true);
    triggerNotification(doc ? `Opening PDF Editor for ${doc.name}` : "Opening clean blank PDF Canvas");
  };

  // Handler to save PDF Editor modifications
  const handleSavePDFEditor = (docId: string, updatedName: string, metaProperties?: any) => {
    setDocuments(prev => {
      const exists = prev.some(d => d.id === docId);
      if (exists) {
        return prev.map(d => {
          if (d.id === docId) {
            // Anti-frustration: protect standard templates from being altered!
            if (d.id.startsWith("doc_template_")) {
              triggerNotification("⚠️ Standard templates are locked. Creating a custom copy with your edits!");
              const copyId = `doc_dup_${Date.now()}`;
              return {
                ...d,
                id: copyId,
                name: `Copy of ${updatedName}`,
                isFavorite: false,
                status: metaProperties?.status || "Draft",
                lastModified: new Date().toISOString().replace('T', ' ').substring(0, 19),
                metaObjects: metaProperties?.objects || [],
                auditTrail: metaProperties?.auditTrail || [],
                signingOptions: metaProperties?.signingOptions || {}
              };
            }
            return {
              ...d,
              name: updatedName,
              status: metaProperties?.status || d.status,
              lastModified: new Date().toISOString().replace('T', ' ').substring(0, 19),
              metaObjects: metaProperties?.objects || [],
              auditTrail: metaProperties?.auditTrail || (d as any).auditTrail || [],
              signingOptions: metaProperties?.signingOptions || (d as any).signingOptions || {}
            };
          }
          return d;
        });
      } else {
        // Create brand new blank PDF document item
        const newDoc: DocumentItem = {
          id: docId,
          name: updatedName,
          customer: "None",
          employee: loggedInUser?.name || "Staff Administrator",
          vendor: "None",
          job: "None",
          type: "Contracts",
          uploadedBy: loggedInUser?.name || "Staff Administrator",
          date: new Date().toISOString().split('T')[0],
          size: "150 KB",
          status: metaProperties?.status || "Draft",
          isFavorite: false,
          isArchived: false,
          notes: "Generated from Owner'sLocal Native PDF Editor tool.",
          tags: ["Editor", "Draft"],
          estimateId: "None",
          invoiceId: "None",
          lastModified: new Date().toISOString().replace('T', ' ').substring(0, 19),
          metaObjects: metaProperties?.objects || []
        };
        (newDoc as any).auditTrail = metaProperties?.auditTrail || [];
        (newDoc as any).signingOptions = metaProperties?.signingOptions || {};
        return [...prev, newDoc];
      }
    });

    setIsPDFEditorOpen(false);
    triggerNotification(`💾 Saved changes to: ${updatedName}`);
    if (logOperationalEvent) {
      logOperationalEvent("PDF Editor Save", `Updated elements inside ${updatedName}`, "💾");
    }
  };

  const handleCreateFolder = () => {
    const name = prompt("Enter new folder directory name:");
    if (name && name.trim()) {
      const trimmed = name.trim();
      if (foldersList.includes(trimmed)) {
        triggerNotification("⚠️ Folder directory already exists");
        return;
      }
      setFoldersList(prev => [...prev, trimmed]);
      triggerNotification(`📁 Created folder directory: ${trimmed}`);
      if (logOperationalEvent) {
        logOperationalEvent("Folder Created", `New directory '${trimmed}' added to local structure`, "📁");
      }
    }
  };

  // Modal States
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "json" | "tsv">("csv");
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);
  const [exportContent, setExportContent] = useState<string>("");

  // Snapshot Camera Simulation States
  const [snapshotStep, setSnapshotStep] = useState<"camera" | "scanning" | "ai_review" | "done">("camera");
  const [scannedDocType, setScannedDocType] = useState<string>("Receipts");
  const [cameraProgress, setCameraProgress] = useState(0);
  const [aiConfidenceCheck, setAiConfidenceCheck] = useState(true);
  const [aiInterpretationIssue, setAiInterpretationIssue] = useState<"customer" | "vendor" | "none">("none");
  const [resolvedCustomer, setResolvedCustomer] = useState("");
  const [resolvedVendor, setResolvedVendor] = useState("");
  const [tempDocName, setTempDocName] = useState("");

  // Form states
  const [uploadName, setUploadName] = useState("");
  const [uploadType, setUploadType] = useState("Contracts");
  const [uploadCustomer, setUploadCustomer] = useState("None");
  const [uploadEmployee, setUploadEmployee] = useState("None");
  const [uploadVendor, setUploadVendor] = useState("None");
  const [uploadJob, setUploadJob] = useState("None");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"Signed" | "Unsigned" | "Pending">("Signed");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [renameName, setRenameName] = useState("");

  // Attach state
  const [attachTargetType, setAttachTargetType] = useState<"Customer" | "Job" | "Employee">("Customer");
  const [attachValue, setAttachValue] = useState("");

  // Folder sidebar state
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    "eSignStatus": true,
    "Customers": true,
    "Jobs": true,
    "Employees": false,
    "Finance": false
  });

  const toggleFolder = (folderName: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderName]: !prev[folderName]
    }));
  };

  // Helper arrays for unique list values
  const customers = useMemo(() => {
    const list = new Set(documents.map(d => d.customer).filter(c => c !== "None"));
    return ["All", "None", ...Array.from(list)];
  }, [documents]);

  const employees = useMemo(() => {
    const list = new Set(documents.map(d => d.employee).filter(e => e !== "None"));
    return ["All", "None", ...Array.from(list)];
  }, [documents]);

  const vendors = useMemo(() => {
    const list = new Set(documents.map(d => d.vendor).filter(v => v !== "None"));
    return ["All", "None", ...Array.from(list)];
  }, [documents]);

  const jobs = useMemo(() => {
    const list = new Set(documents.map(d => d.job).filter(j => j !== "None"));
    return ["All", "None", ...Array.from(list)];
  }, [documents]);

  // Document Types List
  const docTypes = [
    "Contracts", "Estimates", "Invoices", "Receipts", "Purchase Orders",
    "Packing Slips", "Warranties", "Insurance", "Licenses", "Permits",
    "Blueprints", "Photos", "Videos", "Employee Files", "Payroll Documents",
    "Vehicle Records", "Custom"
  ];

  // Role permissions check
  const hasManagePermission = useMemo(() => {
    const managers = ["Owner", "General Manager", "Office Manager", "Operations Manager", "HR", "Payroll", "HR Manager", "Payroll Manager"];
    return managers.includes(activeRole);
  }, [activeRole]);

  // Filtered documents
  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      // Role permission security check
      if (!hasManagePermission) {
        // Regular employees can only see files they uploaded or related to them
        const uName = loggedInUser?.name || "Sarah Jenkins";
        if (doc.type === "Employee Files" || doc.type === "Payroll Documents") {
          if (doc.employee !== uName && doc.uploadedBy !== uName) {
            return false;
          }
        }
      }

      // Sidebar Folder Filter
      if (selectedFolderFilter) {
        if (selectedFolderFilter === "Favorites") {
          if (!doc.isFavorite) return false;
        } else if (selectedFolderFilter === "Archived") {
          if (!doc.isArchived) return false;
        } else {
          // Check if folder constraint fits
          const lowerFolder = selectedFolderFilter.toLowerCase();
          if (lowerFolder === "customers" && doc.customer === "None") return false;
          if (lowerFolder === "employees" && doc.employee === "None") return false;
          if (lowerFolder === "jobs" && doc.job === "None") return false;
          if (lowerFolder === "inventory" && !doc.tags.includes("Materials") && !doc.name.toLowerCase().includes("inventory") && doc.type !== "Purchase Orders") return false;
          if (lowerFolder === "revenue" && doc.type !== "Invoices" && doc.type !== "Receipts") return false;
          if (lowerFolder === "payroll" && doc.type !== "Payroll Documents") return false;
          if (lowerFolder === "vendors" && doc.vendor === "None") return false;
          if (lowerFolder === "fleet" && doc.type !== "Vehicle Records" && !doc.tags.includes("Fleet")) return false;
          if (lowerFolder === "insurance" && doc.type !== "Insurance") return false;
          if (lowerFolder === "legal" && doc.type !== "Contracts" && !doc.tags.includes("Legal")) return false;
          if (lowerFolder === "training" && !doc.tags.includes("Training")) return false;
          if (lowerFolder === "templates" && !doc.tags.includes("Template")) return false;
          if (lowerFolder === "awaiting" && doc.status !== "Awaiting Signature") return false;
          if (lowerFolder === "sent" && doc.status !== "Sent") return false;
          if (lowerFolder === "signed" && doc.status !== "Signed") return false;
          if (lowerFolder === "declined" && doc.status !== "Declined") return false;
          if (lowerFolder === "expired" && doc.status !== "Expired") return false;
          if (lowerFolder === "draft" && doc.status !== "Draft") return false;
        }
      }

      // Summary Card Type Filter
      if (selectedTypeFilter) {
        if (selectedTypeFilter === "Recently Added") {
          // Simulated last 5 days
          const docDate = new Date(doc.date);
          const limitDate = new Date("2026-07-02");
          if (docDate < limitDate) return false;
        } else if (selectedTypeFilter === "Employee Documents") {
          if (doc.type !== "Employee Files" && doc.type !== "Payroll Documents") return false;
        } else {
          if (doc.type !== selectedTypeFilter) return false;
        }
      }

      // Search Match
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = doc.name.toLowerCase().includes(query);
        const matchesCustomer = doc.customer.toLowerCase().includes(query);
        const matchesEmployee = doc.employee.toLowerCase().includes(query);
        const matchesVendor = doc.vendor.toLowerCase().includes(query);
        const matchesJob = doc.job.toLowerCase().includes(query);
        const matchesInvoice = doc.invoiceId.toLowerCase().includes(query);
        const matchesEstimate = doc.estimateId.toLowerCase().includes(query);
        const matchesType = doc.type.toLowerCase().includes(query);
        const matchesTags = doc.tags.some(t => t.toLowerCase().includes(query));

        if (searchByField === "all") {
          if (!matchesName && !matchesCustomer && !matchesEmployee && !matchesVendor && !matchesJob && !matchesInvoice && !matchesEstimate && !matchesType && !matchesTags) {
            return false;
          }
        } else if (searchByField === "customer") {
          if (!matchesCustomer) return false;
        } else if (searchByField === "employee") {
          if (!matchesEmployee) return false;
        } else if (searchByField === "vendor") {
          if (!matchesVendor) return false;
        } else if (searchByField === "job") {
          if (!matchesJob) return false;
        } else if (searchByField === "invoice") {
          if (!matchesInvoice) return false;
        } else if (searchByField === "estimate") {
          if (!matchesEstimate) return false;
        } else if (searchByField === "name") {
          if (!matchesName) return false;
        } else if (searchByField === "tags") {
          if (!matchesTags) return false;
        }
      }

      // Advanced Filters
      if (filterCustomer !== "All") {
        if (doc.customer !== filterCustomer) return false;
      }
      if (filterEmployee !== "All") {
        if (doc.employee !== filterEmployee) return false;
      }
      if (filterVendor !== "All") {
        if (doc.vendor !== filterVendor) return false;
      }
      if (filterJob !== "All") {
        if (doc.job !== filterJob) return false;
      }
      if (filterDocType !== "All") {
        if (doc.type !== filterDocType) return false;
      }
      if (filterSignedStatus === "Signed") {
        if (doc.status !== "Signed") return false;
      } else if (filterSignedStatus === "Unsigned") {
        if (doc.status !== "Unsigned") return false;
      }
      if (filterFavorite && !doc.isFavorite) return false;
      if (filterArchived) {
        if (!doc.isArchived) return false;
      } else {
        if (doc.isArchived) return false;
      }

      return true;
    });
  }, [documents, searchQuery, selectedTypeFilter, selectedFolderFilter, searchByField, filterCustomer, filterEmployee, filterVendor, filterJob, filterDocType, filterSignedStatus, filterFavorite, filterArchived, hasManagePermission, loggedInUser]);

  // Metrics calculators
  const typeMetrics = useMemo(() => {
    const total = documents.length;
    const contracts = documents.filter(d => d.type === "Contracts").length;
    const estimates = documents.filter(d => d.type === "Estimates").length;
    const invoices = documents.filter(d => d.type === "Invoices").length;
    const receipts = documents.filter(d => d.type === "Receipts").length;
    const photos = documents.filter(d => d.type === "Photos").length;
    const empDocs = documents.filter(d => d.type === "Employee Files" || d.type === "Payroll Documents").length;
    const recentlyAdded = documents.filter(d => new Date(d.date) >= new Date("2026-07-02")).length;

    return { total, contracts, estimates, invoices, receipts, photos, empDocs, recentlyAdded };
  }, [documents]);

  // Trigger simulated Refresh
  const handleRefresh = () => {
    if (logOperationalEvent) {
      logOperationalEvent("Documents Refreshed", "Operational files system synced with Cloud Storage nodes", "🔄");
    }
    setSearchQuery("");
    setSelectedTypeFilter(null);
    setSelectedFolderFilter(null);
    triggerNotification("📁 Documents Database synchronized successfully");
  };

  // State utility for alerts
  const [alertText, setAlertText] = useState<string | null>(null);
  const triggerNotification = (text: string) => {
    setAlertText(text);
    setTimeout(() => {
      setAlertText(null);
    }, 3000);
  };

  // Upload actions
  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      triggerNotification("⚠️ Please select a file to upload.");
      return;
    }
    if (!uploadName.trim()) {
      triggerNotification("⚠️ Please specify a document name.");
      return;
    }

    const tagsArray = uploadTags.split(",").map(t => t.trim()).filter(t => t.length > 0);
    const uName = loggedInUser?.name || "Sarah Jenkins";

    // Use actual file size
    const sizeStr = uploadFile.size > 1024 * 1024
      ? `${(uploadFile.size / (1024 * 1024)).toFixed(2)} MB`
      : `${(uploadFile.size / 1024).toFixed(1)} KB`;

    // Retain exact original extension if they didn't specify one
    const hasExtension = uploadName.includes(".");
    const fileExt = uploadFile.name.split(".").pop() || "pdf";
    const finalName = hasExtension ? uploadName : `${uploadName}.${fileExt}`;

    const newDoc: DocumentItem = {
      id: "doc_" + Math.random().toString(36).substring(2, 9),
      name: finalName,
      customer: uploadCustomer,
      employee: uploadEmployee,
      vendor: uploadVendor,
      job: uploadJob,
      type: uploadType,
      uploadedBy: uName,
      date: new Date().toISOString().slice(0, 10),
      size: sizeStr,
      status: uploadStatus === "Pending" ? "Pending" : uploadStatus,
      isFavorite: false,
      isArchived: false,
      notes: uploadNotes.trim() || `Uploaded via document dashboard console. File type: ${uploadFile.type || "unknown"}`,
      tags: tagsArray.length > 0 ? tagsArray : [uploadType.replace("s", "")],
      estimateId: uploadType === "Estimates" ? `EST-${Math.floor(1000 + Math.random() * 9000)}` : "None",
      invoiceId: uploadType === "Invoices" ? `INV-${Math.floor(1000 + Math.random() * 9000)}` : "None",
      lastModified: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      url: URL.createObjectURL(uploadFile)
    };

    setDocuments(prev => [newDoc, ...prev]);
    setIsUploadModalOpen(false);
    setSelectedDocId(newDoc.id);

    // Event engine integration
    if (logOperationalEvent) {
      logOperationalEvent("Document Uploaded", `New document '${newDoc.name}' attached to ${uploadCustomer !== "None" ? uploadCustomer : "General Folder"}`, "📤");
    }

    triggerNotification(`✅ Document uploaded successfully: ${newDoc.name}`);

    // Reset fields
    setUploadName("");
    setUploadNotes("");
    setUploadTags("");
    setUploadFile(null);
  };

  // Rename action
  const handleRenameSubmit = () => {
    if (!renameName.trim() || !activeDoc) return;
    const oldName = activeDoc.name;
    const finalName = renameName.includes(".") ? renameName : `${renameName}.pdf`;

    setDocuments(prev => prev.map(d => d.id === activeDoc.id ? { ...d, name: finalName, lastModified: "Just now" } : d));
    setIsRenameModalOpen(false);

    if (logOperationalEvent) {
      logOperationalEvent("Document Renamed", `Renamed '${oldName}' to '${finalName}'`, "📝");
    }
    triggerNotification(`📝 Document renamed to ${finalName}`);
  };

  // Delete action
  const handleDeleteSubmit = () => {
    if (!activeDoc) return;
    setDocuments(prev => prev.filter(d => d.id !== activeDoc.id));
    setIsDeleteModalOpen(false);
    setSelectedDocId(null);

    if (logOperationalEvent) {
      logOperationalEvent("Document Deleted", `Document '${activeDoc.name}' deleted permanently`, "🗑️");
    }
    triggerNotification(`🗑️ Document deleted successfully`);
  };

  // Archive action
  const handleToggleArchive = (doc: DocumentItem) => {
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, isArchived: !d.isArchived, lastModified: "Just now" } : d));
    if (logOperationalEvent) {
      logOperationalEvent(doc.isArchived ? "Document Restored" : "Document Archived", `'${doc.name}' ${doc.isArchived ? "restored from archive" : "moved to archives"}`, "📁");
    }
    triggerNotification(doc.isArchived ? "📁 Document restored to active index" : "📦 Document moved to Archive Folder");
  };

  // Favorite action
  const handleToggleFavorite = (doc: DocumentItem) => {
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, isFavorite: !d.isFavorite } : d));
    triggerNotification(doc.isFavorite ? "⭐ Removed from Favorites" : "⭐ Added to Favorites");
  };

  // Attach action
  const handleAttachSubmit = () => {
    if (!activeDoc || !attachValue.trim()) return;

    setDocuments(prev => prev.map(d => {
      if (d.id === activeDoc.id) {
        return {
          ...d,
          customer: attachTargetType === "Customer" ? attachValue : d.customer,
          job: attachTargetType === "Job" ? attachValue : d.job,
          employee: attachTargetType === "Employee" ? attachValue : d.employee,
          lastModified: "Just now"
        };
      }
      return d;
    }));

    setIsAttachModalOpen(false);
    if (logOperationalEvent) {
      logOperationalEvent("Document Connected", `Document '${activeDoc.name}' connected to ${attachTargetType}: ${attachValue}`, "🔗");
    }
    triggerNotification(`🔗 Attached to ${attachTargetType}: ${attachValue}`);
  };

  // Export actions
  const convertToCSV = (docs: DocumentItem[]) => {
    const headers = ["ID", "Document Name", "Customer Link", "Employee Link", "Vendor Link", "Job Link", "Type", "Uploaded By", "Date Created", "File Size", "Status", "Is Favorite", "Is Archived", "Notes", "Tags", "Estimate ID", "Invoice ID", "Last Modified"];
    const rows = docs.map(d => [
      d.id,
      `"${(d.name || "").replace(/"/g, '""')}"`,
      `"${(d.customer || "").replace(/"/g, '""')}"`,
      `"${(d.employee || "").replace(/"/g, '""')}"`,
      `"${(d.vendor || "").replace(/"/g, '""')}"`,
      `"${(d.job || "").replace(/"/g, '""')}"`,
      `"${(d.type || "").replace(/"/g, '""')}"`,
      `"${(d.uploadedBy || "").replace(/"/g, '""')}"`,
      d.date,
      d.size,
      d.status,
      d.isFavorite ? "TRUE" : "FALSE",
      d.isArchived ? "TRUE" : "FALSE",
      `"${(d.notes || "").replace(/"/g, '""')}"`,
      `"${(d.tags || []).join(", ").replace(/"/g, '""')}"`,
      d.estimateId,
      d.invoiceId,
      d.lastModified
    ]);
    return [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
  };

  const convertToTSV = (docs: DocumentItem[]) => {
    const headers = ["ID", "Document Name", "Customer Link", "Employee Link", "Vendor Link", "Job Link", "Type", "Uploaded By", "Date Created", "File Size", "Status", "Is Favorite", "Is Archived", "Notes", "Tags", "Estimate ID", "Invoice ID", "Last Modified"];
    const rows = docs.map(d => [
      d.id,
      (d.name || "").replace(/\t/g, ' '),
      (d.customer || "").replace(/\t/g, ' '),
      (d.employee || "").replace(/\t/g, ' '),
      (d.vendor || "").replace(/\t/g, ' '),
      (d.job || "").replace(/\t/g, ' '),
      (d.type || "").replace(/\t/g, ' '),
      (d.uploadedBy || "").replace(/\t/g, ' '),
      d.date,
      d.size,
      d.status,
      d.isFavorite ? "TRUE" : "FALSE",
      d.isArchived ? "TRUE" : "FALSE",
      (d.notes || "").replace(/\t/g, ' '),
      (d.tags || []).join(", ").replace(/\t/g, ' '),
      d.estimateId,
      d.invoiceId,
      d.lastModified
    ]);
    return [headers.join("\t"), ...rows.map(r => r.join("\t"))].join("\r\n");
  };

  const executeExport = (format: "csv" | "json" | "tsv") => {
    let content = "";
    let fileName = "";
    let mimeType = "";

    if (format === "json") {
      content = JSON.stringify(documents, null, 2);
      fileName = "leadforge_documents_database.json";
      mimeType = "application/json";
    } else if (format === "tsv") {
      content = convertToTSV(documents);
      fileName = "leadforge_documents_database.tsv";
      mimeType = "text/tab-separated-values";
    } else {
      content = convertToCSV(documents);
      fileName = "leadforge_documents_database.csv";
      mimeType = "text/csv";
    }

    setExportContent(content);
    setExportSuccessMessage(`Generating database export in ${format.toUpperCase()} format...`);

    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setExportSuccessMessage(`Successfully downloaded ${fileName}!`);
      if (logOperationalEvent) {
        logOperationalEvent("Database Exported", `Documents database exported as ${format.toUpperCase()}`, "📥");
      }
      triggerNotification(`✅ Export downloaded: ${fileName}`);
    } catch (err) {
      console.error(err);
      setExportSuccessMessage(`Download initiated. Since you are in an iframe workspace, we've also provided a copy/paste option below!`);
    }
  };

  // Snapshot AI simulated scan step trigger
  const runCameraSnapshotAI = () => {
    setSnapshotStep("scanning");
    setCameraProgress(0);

    const interval = setInterval(() => {
      setCameraProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setSnapshotStep("ai_review");
          const initialDocName = `AI_SCAN_${scannedDocType}_${Math.floor(100 + Math.random() * 900)}.pdf`;
          setTempDocName(initialDocName);
          // Custom detection simulation based on scanned type
          if (scannedDocType === "Receipts") {
            setResolvedCustomer("Apex Plumb & Drain");
            setResolvedVendor("Home Depot");
          } else if (scannedDocType === "Contracts") {
            setResolvedCustomer("Chevron Logistics");
            setResolvedVendor("None");
          } else {
            setResolvedCustomer("None");
            setResolvedVendor("None");
          }
          return 100;
        }
        return prev + 10;
      });
    }, 150);
  };

  // Approve Snapshot AI Document
  const handleApproveSnapshotAI = () => {
    const docName = tempDocName || `AI_SCAN_${scannedDocType}_${Math.floor(100 + Math.random() * 900)}.pdf`;
    const uName = loggedInUser?.name || "Sarah Jenkins";

    const newDoc: DocumentItem = {
      id: "doc_ai_" + Math.random().toString(36).substring(2, 9),
      name: docName,
      customer: resolvedCustomer || "None",
      employee: uName,
      vendor: resolvedVendor || "None",
      job: "Job #1024",
      type: scannedDocType,
      uploadedBy: "LeadForge AI Scanner",
      date: new Date().toISOString().slice(0, 10),
      size: "240 KB",
      status: scannedDocType === "Contracts" ? "Signed" : "Signed",
      isFavorite: false,
      isArchived: false,
      notes: `Scanned and generated via Snapshot AI Scanner. Automatically categorized under ${scannedDocType}.`,
      tags: ["AI Scanned", scannedDocType.replace("s", "")],
      estimateId: scannedDocType === "Estimates" ? "E-1084" : "None",
      invoiceId: scannedDocType === "Invoices" ? "I-2049" : "None",
      lastModified: "Just now"
    };

    setDocuments(prev => [newDoc, ...prev]);
    setIsSnapshotModalOpen(false);
    setSelectedDocId(newDoc.id);

    if (logOperationalEvent) {
      logOperationalEvent("Snapshot AI Scan", `Snapshot AI successfully scanned and cataloged '${docName}'`, "🤖");
    }

    triggerNotification(`🤖 Snapshot AI scanned & saved: ${docName}`);
  };

  // Helper function to return nice file icons
  const getFileIcon = (type: string) => {
    switch (type) {
      case "Contracts":
        return <FileSignature className="w-8 h-8 text-blue-600" />;
      case "Estimates":
        return <FileText className="w-8 h-8 text-emerald-600" />;
      case "Invoices":
        return <FileSpreadsheet className="w-8 h-8 text-indigo-600" />;
      case "Receipts":
        return <DollarSign className="w-8 h-8 text-amber-600" />;
      case "Blueprints":
        return <Layers className="w-8 h-8 text-cyan-600" />;
      case "Photos":
        return <Image className="w-8 h-8 text-pink-600" />;
      case "Videos":
        return <Video className="w-8 h-8 text-rose-600" />;
      default:
        return <FileText className="w-8 h-8 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {alertText && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-blue-500/30 shadow-lg rounded-2xl px-4 py-3.5 flex items-center gap-3 z-50 text-xs md:text-sm animate-fade-in text-slate-100 max-w-sm">
          <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-white mb-0.5">Documents Alert</p>
            <p className="text-slate-400 font-medium text-xs leading-tight">{alertText}</p>
          </div>
        </div>
      )}

      {/* TOP CARD */}
      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm flex flex-col gap-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-display font-extrabold text-[#1F3557] tracking-tight uppercase">
              Documents Hub
            </h2>
            <p className="text-xs text-[#5E7393] font-sans font-semibold mt-1">
              AI-Powered records database, optical character capture, and cross-module connections
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setUploadName("");
                setUploadNotes("");
                setIsUploadModalOpen(true);
              }}
              className="px-3.5 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Document
            </button>
            <button
              onClick={() => {
                setSnapshotStep("camera");
                setIsSnapshotModalOpen(true);
              }}
              className="px-3.5 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#315C9F] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              Snapshot AI
            </button>
            <button
              onClick={() => {
                setSnapshotStep("camera");
                setIsSnapshotModalOpen(true);
              }}
              className="px-3.5 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              Scan Document
            </button>
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`px-3.5 py-2 border rounded-xl text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer ${
                showAdvancedFilters
                  ? "bg-[#315C9F] border-[#315C9F] text-white"
                  : "bg-[#EAF5FF] border-[#9EC8EF] text-[#1F3557] hover:bg-[#BDDDF8]"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
            </button>
            <button
              disabled
              className="px-3 py-2 bg-slate-100 border border-slate-200 text-slate-400 font-bold rounded-xl text-xs uppercase tracking-wider cursor-not-allowed opacity-60"
              title="This feature is coming soon"
            >
              Import (Coming Soon)
            </button>
            <button
              onClick={() => {
                setIsExportModalOpen(true);
                setExportSuccessMessage(null);
                setExportContent("");
              }}
              className="px-3 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
            >
              Export
            </button>
            <button
              onClick={handleRefresh}
              className="p-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] rounded-xl cursor-pointer"
              title="Refresh Sync"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* MOBILE-FIRST PDF CREATOR & CAPTURE LAUNCHPAD */}
        <div className="bg-gradient-to-r from-[#1F3557] to-[#315C9F] text-white p-5 rounded-3xl border border-[#9EC8EF]/30 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/10 pb-2 gap-2">
            <h3 className="text-xs font-display font-black text-[#BDDDF8] uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              Native Document & PDF Creator Hub
            </h3>
            <span className="text-[9px] bg-sky-500/35 px-2 py-0.5 rounded font-black tracking-wider uppercase text-sky-200">
              ⚡ OWNER'SLOCAL PRO
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            {/* 1. Create Blank Document */}
            <button
              onClick={() => handleOpenPDFEditor(null)}
              className="flex flex-col items-center justify-between p-3 bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-2xl transition-all text-center cursor-pointer group min-h-[92px]"
            >
              <FilePlus className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase mt-1.5 tracking-wide leading-tight">Blank Canvas</span>
            </button>

            {/* 2. Create Folder */}
            <button
              onClick={handleCreateFolder}
              className="flex flex-col items-center justify-between p-3 bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-2xl transition-all text-center cursor-pointer group min-h-[92px]"
            >
              <FolderPlus className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase mt-1.5 tracking-wide leading-tight">Create Folder</span>
            </button>

            {/* 3. Standard Folders / Templates */}
            <button
              onClick={() => {
                setSelectedFolderFilter("Standard Templates");
                triggerNotification("Filtering Standard Templates folder (Unchanged templates)");
              }}
              className="flex flex-col items-center justify-between p-3 bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-2xl transition-all text-center cursor-pointer group min-h-[92px]"
            >
              <BookOpen className="w-5 h-5 text-sky-300 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase mt-1.5 tracking-wide leading-tight">Standard Docs</span>
            </button>

            {/* 4. Upload from Phone */}
            <button
              onClick={() => setIsPhoneUploadModalOpen(true)}
              className="flex flex-col items-center justify-between p-3 bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-2xl transition-all text-center cursor-pointer group min-h-[92px]"
            >
              <Smartphone className="w-5 h-5 text-indigo-300 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase mt-1.5 tracking-wide leading-tight">From Phone</span>
            </button>

            {/* 5. Upload from Google Drive */}
            <button
              onClick={() => setIsGoogleDriveModalOpen(true)}
              className="flex flex-col items-center justify-between p-3 bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-2xl transition-all text-center cursor-pointer group min-h-[92px]"
            >
              <Cloud className="w-5 h-5 text-cyan-300 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase mt-1.5 tracking-wide leading-tight">Google Drive</span>
            </button>

            {/* 6. Upload PDF */}
            <button
              onClick={() => {
                setUploadName("");
                setUploadType("Contracts");
                setIsUploadModalOpen(true);
              }}
              className="flex flex-col items-center justify-between p-3 bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-2xl transition-all text-center cursor-pointer group min-h-[92px]"
            >
              <Upload className="w-5 h-5 text-teal-400 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase mt-1.5 tracking-wide leading-tight">Upload PDF</span>
            </button>

            {/* 7. Scan Document */}
            <button
              onClick={() => {
                setSnapshotStep("camera");
                setIsSnapshotModalOpen(true);
              }}
              className="flex flex-col items-center justify-between p-3 bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-2xl transition-all text-center cursor-pointer group min-h-[92px]"
            >
              <Camera className="w-5 h-5 text-pink-400 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase mt-1.5 tracking-wide leading-tight">Scan Camera</span>
            </button>

            {/* 8. PDF from Photos */}
            <button
              onClick={() => setIsPhotoToPDFModalOpen(true)}
              className="flex flex-col items-center justify-between p-3 bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-2xl transition-all text-center cursor-pointer group min-h-[92px]"
            >
              <Images className="w-5 h-5 text-amber-300 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase mt-1.5 tracking-wide leading-tight">from Photos</span>
            </button>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div className="bg-[#EAF5FF] p-4.5 rounded-2xl border border-[#9EC8EF] space-y-3">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5E7393]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documents by name, customer, employee, tags, invoice #, estimate #..."
                className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-[#4A86F7] font-medium font-sans text-[#1F3557]"
              />
            </div>
            <select
              value={searchByField}
              onChange={(e) => setSearchByField(e.target.value)}
              className="bg-[#EAF5FF] border border-[#9EC8EF] text-xs text-[#1F3557] font-bold rounded-xl px-3 py-2.5 focus:outline-none"
            >
              <option value="all">Search All Fields</option>
              <option value="name">Document Name</option>
              <option value="customer">Customer</option>
              <option value="employee">Employee</option>
              <option value="vendor">Vendor</option>
              <option value="job">Job #</option>
              <option value="invoice">Invoice #</option>
              <option value="estimate">Estimate #</option>
              <option value="tags">Tags</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-sans font-bold text-[#5E7393]">
            <span>Search fields:</span>
            {["Customer", "Employee", "Vendor", "Job", "Invoice #", "Estimate #", "Receipt", "Document Name", "Tags"].map((field) => (
              <span key={field} className="flex items-center gap-1 px-2 py-0.5 bg-[#C7E3FA] text-[#1F3557] rounded-lg border border-[#9EC8EF]/40 text-[9.5px]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#315C9F]" /> {field}
              </span>
            ))}
          </div>
        </div>

        {/* ADVANCED FILTERS PANEL */}
        {showAdvancedFilters && (
          <div className="bg-[#EAF5FF] p-4.5 rounded-2xl border border-[#9EC8EF] grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 text-xs font-bold text-[#1F3557] animate-fade-in">
            <div className="space-y-1 flex flex-col text-left">
              <label>Customer</label>
              <select
                value={filterCustomer}
                onChange={(e) => setFilterCustomer(e.target.value)}
                className="bg-[#F5FAFF] border border-[#9EC8EF] rounded-xl px-2.5 py-2 focus:outline-none"
              >
                {customers.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1 flex flex-col text-left">
              <label>Employee</label>
              <select
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                className="bg-[#F5FAFF] border border-[#9EC8EF] rounded-xl px-2.5 py-2 focus:outline-none"
              >
                {employees.map((emp) => (
                  <option key={emp} value={emp}>{emp}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1 flex flex-col text-left">
              <label>Vendor</label>
              <select
                value={filterVendor}
                onChange={(e) => setFilterVendor(e.target.value)}
                className="bg-[#F5FAFF] border border-[#9EC8EF] rounded-xl px-2.5 py-2 focus:outline-none"
              >
                {vendors.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1 flex flex-col text-left">
              <label>Job Related</label>
              <select
                value={filterJob}
                onChange={(e) => setFilterJob(e.target.value)}
                className="bg-[#F5FAFF] border border-[#9EC8EF] rounded-xl px-2.5 py-2 focus:outline-none"
              >
                {jobs.map((j) => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1 flex flex-col text-left">
              <label>Document Type</label>
              <select
                value={filterDocType}
                onChange={(e) => setFilterDocType(e.target.value)}
                className="bg-[#F5FAFF] border border-[#9EC8EF] rounded-xl px-2.5 py-2 focus:outline-none"
              >
                <option value="All">All Types</option>
                {docTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1 flex flex-col text-left">
              <label>Signed Status</label>
              <select
                value={filterSignedStatus}
                onChange={(e) => setFilterSignedStatus(e.target.value as any)}
                className="bg-[#F5FAFF] border border-[#9EC8EF] rounded-xl px-2.5 py-2 focus:outline-none"
              >
                <option value="All">All Statuses</option>
                <option value="Signed">Signed Only</option>
                <option value="Unsigned">Unsigned/Pending Only</option>
              </select>
            </div>

            <div className="flex items-center gap-5 mt-5">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterFavorite}
                  onChange={(e) => setFilterFavorite(e.target.checked)}
                  className="rounded border-[#9EC8EF] text-[#315C9F] focus:ring-[#315C9F] w-4 h-4"
                />
                <span>Favorites ⭐</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterArchived}
                  onChange={(e) => setFilterArchived(e.target.checked)}
                  className="rounded border-[#9EC8EF] text-[#315C9F] focus:ring-[#315C9F] w-4 h-4"
                />
                <span>Archived Only</span>
              </label>
            </div>

            <div className="flex items-end justify-end">
              <button
                onClick={() => {
                  setFilterCustomer("All");
                  setFilterEmployee("All");
                  setFilterVendor("All");
                  setFilterJob("All");
                  setFilterDocType("All");
                  setFilterSignedStatus("All");
                  setFilterFavorite(false);
                  setFilterArchived(false);
                  triggerNotification("Filters Reset");
                }}
                className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-[#1F3557] rounded-xl cursor-pointer"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SUMMARY CARDS (HORIZONTAL CARDS FILTERING DOCUMENTS LIST) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { key: "all", label: "Total Documents", count: typeMetrics.total, icon: "📁", filterVal: null },
          { key: "Contracts", label: "Contracts", count: typeMetrics.contracts, icon: "✍️", filterVal: "Contracts" },
          { key: "Estimates", label: "Estimates", count: typeMetrics.estimates, icon: "📝", filterVal: "Estimates" },
          { key: "Invoices", label: "Invoices", count: typeMetrics.invoices, icon: "💳", filterVal: "Invoices" },
          { key: "Receipts", label: "Receipts", count: typeMetrics.receipts, icon: "🧾", filterVal: "Receipts" },
          { key: "Photos", label: "Photos", count: typeMetrics.photos, icon: "📸", filterVal: "Photos" },
          { key: "Employee Documents", label: "Employee Files", count: typeMetrics.empDocs, icon: "👥", filterVal: "Employee Documents" },
          { key: "Recently Added", label: "Recently Added", count: typeMetrics.recentlyAdded, icon: "⚡", filterVal: "Recently Added" }
        ].map((card) => {
          const isActive = selectedTypeFilter === card.filterVal;
          return (
            <div
              key={card.key}
              onClick={() => {
                setSelectedTypeFilter(isActive ? null : card.filterVal);
                triggerNotification(`Filtered by: ${card.label}`);
              }}
              className={`p-3 rounded-2xl border transition-all cursor-pointer text-left flex flex-col justify-between h-[105px] shadow-sm select-none ${
                isActive
                  ? "bg-[#315C9F] text-white border-[#1F3557] scale-[1.03]"
                  : "bg-[#C7E3FA] hover:bg-[#BDDDF8] text-[#1F3557] border-[#9EC8EF]"
              }`}
            >
              <div className="flex justify-between items-start">
                <span className="text-lg">{card.icon}</span>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
              </div>
              <div>
                <p className={`text-[15px] font-mono font-black ${isActive ? "text-white" : "text-[#1F3557]"}`}>
                  {card.count}
                </p>
                <p className={`text-[9px] font-sans font-black uppercase tracking-wider leading-tight ${isActive ? "text-blue-100" : "text-[#5E7393]"} mt-0.5`}>
                  {card.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* CORE LAYOUT: EXPANDABLE FOLDERS SIDEBAR + DOCUMENTS LIST TABLE + DOCUMENT DETAIL PANE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* FOLDERS SIDEBAR PANEL (3 COLS) */}
        <div className="lg:col-span-3 bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#9EC8EF]/40 pb-2">
            <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5" />
              Document Folders
            </h3>
            <button
              onClick={handleCreateFolder}
              className="p-1 hover:bg-[#BDDDF8] text-[#1F3557] rounded-lg"
              title="Add Custom Folder"
            >
              <PlusCircle className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            {/* Folder 1: Favorites */}
            <button
              onClick={() => {
                setSelectedFolderFilter(selectedFolderFilter === "Favorites" ? null : "Favorites");
                triggerNotification("Filtering Favorites");
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold text-left transition-colors ${
                selectedFolderFilter === "Favorites"
                  ? "bg-[#EAF5FF] text-[#1F3557] border border-[#9EC8EF]"
                  : "text-[#5E7393] hover:bg-[#EAF5FF]/30 hover:text-[#1F3557]"
              }`}
            >
              <span className="flex items-center gap-2">
                <Star className={`w-4 h-4 ${selectedFolderFilter === "Favorites" ? "text-amber-500 fill-amber-500" : ""}`} />
                Favorites Folder
              </span>
              <span className="text-[10px] bg-[#EAF5FF] px-1.5 py-0.5 rounded border border-[#9EC8EF]/30 text-[#1F3557]">
                {documents.filter(d => d.isFavorite).length}
              </span>
            </button>

            {/* Folder 2: Archive */}
            <button
              onClick={() => {
                setSelectedFolderFilter(selectedFolderFilter === "Archived" ? null : "Archived");
                triggerNotification("Filtering Archives");
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold text-left transition-colors ${
                selectedFolderFilter === "Archived"
                  ? "bg-[#EAF5FF] text-[#1F3557] border border-[#9EC8EF]"
                  : "text-[#5E7393] hover:bg-[#EAF5FF]/30 hover:text-[#1F3557]"
              }`}
            >
              <span className="flex items-center gap-2">
                <Archive className="w-4 h-4" />
                Archives Archive
              </span>
              <span className="text-[10px] bg-[#EAF5FF] px-1.5 py-0.5 rounded border border-[#9EC8EF]/30 text-[#1F3557]">
                {documents.filter(d => d.isArchived).length}
              </span>
            </button>

            <div className="border-t border-[#9EC8EF]/40 my-2 pt-2" />

            {/* Expandable Folder Groups */}
            {[
              { id: "eSignStatus", label: "eSignature Folders", icon: "✍️", items: ["Awaiting Signature", "Sent", "Signed", "Declined", "Expired", "Draft"] },
              { id: "Customers", label: "Customers", icon: "👥", items: ["Apex Plumb & Drain", "Chevron Logistics", "Oakridge Apartments"] },
              { id: "Employees", label: "Employees", icon: "👤", items: ["Sarah Jenkins", "Marcus Vance", "Sarah Connor"] },
              { id: "Jobs", label: "Jobs", icon: "💼", items: ["Job #1024", "Job #1085", "Job #1022"] },
              { id: "Finance", label: "Finance & Accounting", icon: "📈", items: ["Revenue Folder", "Payroll Folder", "Vendors Folder"] }
            ].map((grp) => {
              const isExpanded = expandedFolders[grp.id];
              return (
                <div key={grp.id} className="space-y-1 text-left">
                  <button
                    onClick={() => toggleFolder(grp.id)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-[#EAF5FF]/30 text-[#1F3557] text-xs font-bold rounded-lg transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Folder className="w-4 h-4 text-[#315C9F]" />
                      {grp.label}
                    </span>
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>

                  {isExpanded && (
                    <div className="pl-6 space-y-0.5 border-l border-[#9EC8EF] ml-4 mt-0.5">
                      {grp.items.map((sub) => {
                        const folderSlug = sub.split(" ")[0];
                        const isActive = selectedFolderFilter === folderSlug;
                        return (
                          <button
                            key={sub}
                            onClick={() => {
                              setSelectedFolderFilter(isActive ? null : folderSlug);
                              triggerNotification(`Showing files connected with ${sub}`);
                            }}
                            className={`w-full text-left text-[11px] py-1 px-1.5 rounded font-medium flex items-center gap-1.5 transition-colors ${
                              isActive
                                ? "bg-[#EAF5FF] text-[#1F3557] font-bold"
                                : "text-[#5E7393] hover:text-[#1F3557]"
                            }`}
                          >
                            <ChevronRight className="w-2.5 h-2.5" />
                            {sub}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="border-t border-[#9EC8EF]/40 my-2 pt-2" />

            {/* Folder targets listed in requirements */}
            {foldersList.map((fld) => {
              const isActive = selectedFolderFilter === fld;
              return (
                <button
                  key={fld}
                  onClick={() => {
                    setSelectedFolderFilter(isActive ? null : fld);
                    triggerNotification(`Showing ${fld} Folder`);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-bold text-left transition-colors ${
                    isActive
                      ? "bg-[#EAF5FF] text-[#1F3557] border border-[#9EC8EF]"
                      : "text-[#5E7393] hover:bg-[#EAF5FF]/30 hover:text-[#1F3557]"
                  }`}
                >
                  <Folder className="w-4 h-4 text-sky-500" />
                  {fld}
                </button>
              );
            })}
          </div>

          <div className="bg-[#EAF5FF] p-3.5 rounded-xl border border-[#9EC8EF] text-[10px] font-sans font-bold text-slate-500 text-left">
            <p className="uppercase text-[#315C9F]">Favorites System</p>
            <p className="mt-1 font-medium font-sans">Favorites override defaults. Frequently used templates, customer directories, and contracts can be pinned to appear first.</p>
          </div>
        </div>

        {/* DOCUMENTS TABLE (5 COLS) */}
        <div className="lg:col-span-5 bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm flex flex-col justify-between overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr className="border-b border-[#9EC8EF] text-[10px] font-extrabold uppercase text-[#1F3557] tracking-wider bg-[#EAF5FF]/30">
                  <th className="py-2.5 px-3">Doc Name</th>
                  <th className="py-2.5 px-3">Connection</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Uploaded</th>
                  <th className="py-2.5 px-3">Size</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#9EC8EF]/40">
                {filteredDocs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#5E7393] text-xs font-semibold">
                      No matching files or documents located.
                    </td>
                  </tr>
                ) : (
                  filteredDocs.map((doc) => {
                    const isSelected = doc.id === selectedDocId;
                    return (
                      <tr
                        key={doc.id}
                        onClick={() => setSelectedDocId(doc.id)}
                        className={`hover:bg-[#BDDDF8]/50 transition-colors cursor-pointer text-xs ${
                          isSelected ? "bg-[#EAF5FF] border-l-4 border-l-[#315C9F]" : ""
                        }`}
                      >
                        <td className="py-2.5 px-3 font-bold text-[#1F3557]">
                          <div className="flex items-center gap-1.5 max-w-[140px] truncate">
                            <span className="shrink-0">{doc.name.endsWith(".png") || doc.name.endsWith(".jpg") ? "📸" : "📄"}</span>
                            <span className="truncate" title={doc.name}>{doc.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[#5E7393] font-medium max-w-[100px] truncate">
                          {doc.customer !== "None" ? doc.customer : doc.vendor !== "None" ? doc.vendor : doc.job !== "None" ? doc.job : "General"}
                        </td>
                        <td className="py-2.5 px-3 text-[#5E7393] font-mono text-[10px] font-bold">
                          {doc.type}
                        </td>
                        <td className="py-2.5 px-3 text-[#5E7393] font-mono text-[10px]">
                          {doc.date}
                        </td>
                        <td className="py-2.5 px-3 text-[#5E7393] font-mono text-[10px]">
                          {doc.size}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                              doc.status === "Signed"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : doc.status === "Awaiting Signature"
                                ? "bg-amber-100 text-amber-800 border border-amber-300 animate-pulse"
                                : doc.status === "Sent"
                                ? "bg-blue-100 text-blue-800 border border-blue-300"
                                : doc.status === "Viewed"
                                ? "bg-indigo-100 text-indigo-800 border border-indigo-300"
                                : doc.status === "Declined"
                                ? "bg-rose-100 text-rose-800 border border-rose-300"
                                : doc.status === "Expired"
                                ? "bg-slate-100 text-slate-500 border border-slate-300"
                                : doc.status === "Draft"
                                ? "bg-sky-100 text-sky-800 border border-sky-300"
                                : "bg-slate-100 text-slate-800 border border-slate-300"
                            }`}
                          >
                            {doc.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenPDFEditor(doc)}
                              className="p-1 hover:bg-[#BDDDF8]/50 text-[#315C9F] rounded transition-colors"
                              title="Edit Document"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setShareDocItem(doc);
                                setIsMainShareModalOpen(true);
                              }}
                              className="p-1 hover:bg-[#BDDDF8]/50 text-sky-600 rounded transition-colors"
                              title="Share Document"
                            >
                              <Share2 className="w-3.5 h-3.5" />
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

          <div className="mt-4 pt-3 border-t border-[#9EC8EF]/40 flex justify-between items-center text-[10px] font-sans font-bold text-[#5E7393]">
            <span>
              Showing {filteredDocs.length} of {documents.length} files
            </span>
            <span className="px-2 py-0.5 bg-[#EAF5FF] border border-[#9EC8EF]/60 rounded-lg text-[#1F3557]">
              Synced Storage Active
            </span>
          </div>
        </div>

        {/* DOCUMENT DETAILS PANEL (4 COLS) */}
        <div className="lg:col-span-4 bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#9EC8EF]/40 pb-2">
            <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              Document Inspector
            </h3>
            {activeDoc && (
              <button
                onClick={() => handleToggleFavorite(activeDoc)}
                className="p-1 hover:bg-[#BDDDF8] rounded-lg"
                title="Favorite"
              >
                <Star className={`w-4 h-4 ${activeDoc.isFavorite ? "text-amber-500 fill-amber-500" : "text-[#1F3557]"}`} />
              </button>
            )}
          </div>

          {activeDoc ? (
            <div className="space-y-4">
              {/* Document Mockup Preview Container */}
              <div className="bg-[#EAF5FF] rounded-xl border border-[#9EC8EF] p-4 flex flex-col items-center justify-center text-center min-h-[140px] relative overflow-hidden group shadow-inner">
                {getFileIcon(activeDoc.type)}
                <p className="text-xs font-extrabold text-[#1F3557] mt-2 max-w-[200px] truncate uppercase">{activeDoc.name}</p>
                <p className="text-[9px] font-mono text-slate-400 mt-1 uppercase tracking-widest">{activeDoc.size} • {activeDoc.type}</p>
                <div className="absolute inset-0 bg-[#315C9F]/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="bg-[#315C9F] text-white px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider">Simulated Preview</span>
                </div>
              </div>

              {/* HIGH-FIDELITY PDF EDITOR LAUNCH TRIGGER */}
              <button
                onClick={() => handleOpenPDFEditor(activeDoc)}
                className="w-full py-3 bg-gradient-to-r from-[#1F3557] to-[#315C9F] hover:from-[#315C9F] hover:to-[#1F3557] text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                Launch Native PDF Editor
              </button>

              {/* Information Ledger */}
              <div className="space-y-2 text-xs font-bold text-[#1F3557]">
                <div className="flex justify-between border-b border-[#9EC8EF]/30 pb-1">
                  <span className="text-[#5E7393] uppercase text-[9px]">Document ID</span>
                  <span className="font-mono text-slate-500">{activeDoc.id}</span>
                </div>

                <div className="flex justify-between border-b border-[#9EC8EF]/30 pb-1">
                  <span className="text-[#5E7393] uppercase text-[9px]">Customer Name</span>
                  <span className="text-right">{activeDoc.customer !== "None" ? activeDoc.customer : <span className="text-slate-400 font-normal">Unassigned</span>}</span>
                </div>

                <div className="flex justify-between border-b border-[#9EC8EF]/30 pb-1">
                  <span className="text-[#5E7393] uppercase text-[9px]">Related Employee</span>
                  <span className="text-right">{activeDoc.employee !== "None" ? activeDoc.employee : <span className="text-slate-400 font-normal">Unassigned</span>}</span>
                </div>

                <div className="flex justify-between border-b border-[#9EC8EF]/30 pb-1">
                  <span className="text-[#5E7393] uppercase text-[9px]">Related Vendor</span>
                  <span className="text-right">{activeDoc.vendor !== "None" ? activeDoc.vendor : <span className="text-slate-400 font-normal">Unassigned</span>}</span>
                </div>

                <div className="flex justify-between border-b border-[#9EC8EF]/30 pb-1">
                  <span className="text-[#5E7393] uppercase text-[9px]">Related Job</span>
                  <span className="text-right">{activeDoc.job !== "None" ? activeDoc.job : <span className="text-slate-400 font-normal">Unassigned</span>}</span>
                </div>

                <div className="flex justify-between border-b border-[#9EC8EF]/30 pb-1">
                  <span className="text-[#5E7393] uppercase text-[9px]">Estimate ID</span>
                  <span className="font-mono text-right">{activeDoc.estimateId !== "None" ? activeDoc.estimateId : "None"}</span>
                </div>

                <div className="flex justify-between border-b border-[#9EC8EF]/30 pb-1">
                  <span className="text-[#5E7393] uppercase text-[9px]">Invoice ID</span>
                  <span className="font-mono text-right">{activeDoc.invoiceId !== "None" ? activeDoc.invoiceId : "None"}</span>
                </div>

                <div className="flex justify-between border-b border-[#9EC8EF]/30 pb-1">
                  <span className="text-[#5E7393] uppercase text-[9px]">Upload Date</span>
                  <span className="font-mono text-[#5E7393]">{activeDoc.date}</span>
                </div>

                <div className="flex justify-between border-b border-[#9EC8EF]/30 pb-1">
                  <span className="text-[#5E7393] uppercase text-[9px]">Last Modified</span>
                  <span className="font-mono text-[#5E7393]">{activeDoc.lastModified}</span>
                </div>

                <div className="flex justify-between border-b border-[#9EC8EF]/30 pb-1">
                  <span className="text-[#5E7393] uppercase text-[9px]">Uploaded By</span>
                  <span className="text-[#5E7393]">{activeDoc.uploadedBy}</span>
                </div>

                <div className="space-y-1 pt-1">
                  <span className="text-[#5E7393] uppercase text-[9px] block">Notes & Overview</span>
                  <p className="text-[11px] font-sans font-medium text-slate-600 bg-[#EAF5FF] p-2.5 rounded-xl border border-[#9EC8EF]/60 leading-relaxed">
                    {activeDoc.notes}
                  </p>
                </div>

                {/* Tags chips */}
                <div className="space-y-1.5 pt-1.5">
                  <span className="text-[#5E7393] uppercase text-[9px] block">Document Tags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeDoc.tags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 bg-[#EAF5FF] border border-[#9EC8EF] text-[10px] text-[#315C9F] rounded-lg">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* ACTION BUTTONS (NO DEAD BUTTONS) */}
              <div className="grid grid-cols-2 gap-1.5 pt-2">
                <button
                  onClick={() => {
                    if (activeDoc.url) {
                      const link = document.createElement('a');
                      link.href = activeDoc.url;
                      link.target = "_blank";
                      link.rel = "noopener noreferrer";
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }
                    triggerNotification(`📂 Opened document file: ${activeDoc.name}`);
                  }}
                  className="px-2.5 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-xs font-bold text-[#1F3557] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Open File
                </button>
                <button
                  onClick={() => {
                    if (activeDoc.url) {
                      const link = document.createElement('a');
                      link.href = activeDoc.url;
                      link.download = activeDoc.name;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      triggerNotification(`📥 Downloading document: ${activeDoc.name}`);
                    } else {
                      // Create simulated plain text file download for seed data
                      const textContent = `LeadForge Document Meta: ${JSON.stringify(activeDoc, null, 2)}`;
                      const blob = new Blob([textContent], { type: 'text/plain' });
                      const blobUrl = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = blobUrl;
                      link.download = activeDoc.name.endsWith(".pdf") ? activeDoc.name.replace(".pdf", ".txt") : activeDoc.name + ".txt";
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(blobUrl);
                      triggerNotification(`📥 Downloading document: ${activeDoc.name}`);
                    }
                  }}
                  className="px-2.5 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-xs font-bold text-[#1F3557] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                <button
                  onClick={() => {
                    setRenameName(activeDoc.name);
                    setIsRenameModalOpen(true);
                  }}
                  className="px-2.5 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-xs font-bold text-[#1F3557] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Rename
                </button>
                <button
                  onClick={() => {
                    setUploadName(activeDoc.name);
                    setUploadType(activeDoc.type);
                    setUploadCustomer(activeDoc.customer);
                    setUploadEmployee(activeDoc.employee);
                    setUploadVendor(activeDoc.vendor);
                    setUploadJob(activeDoc.job);
                    setUploadNotes(activeDoc.notes);
                    setUploadTags(activeDoc.tags.join(", "));
                    setIsUploadModalOpen(true);
                  }}
                  className="px-2.5 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-xs font-bold text-[#1F3557] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Replace
                </button>
                <button
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="px-2.5 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-bold text-rose-600 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
                <button
                  onClick={() => handleToggleArchive(activeDoc)}
                  className="px-2.5 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-xs font-bold text-[#1F3557] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5" />
                  {activeDoc.isArchived ? "Restore" : "Archive"}
                </button>
              </div>

              <div className="border-t border-[#9EC8EF]/40 my-2 pt-2" />

              {/* QUICK CONNECTIONS CARD */}
              <div className="space-y-1.5 text-left">
                <span className="text-[#5E7393] uppercase text-[9.5px] font-extrabold block">Quick Connections</span>
                <div className="grid grid-cols-1 gap-1.5">
                  <button
                    onClick={() => {
                      setAttachTargetType("Customer");
                      setAttachValue(activeDoc.customer !== "None" ? activeDoc.customer : "");
                      setIsAttachModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[10.5px] font-bold text-[#1F3557] text-left transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5" />
                    Attach To Customer...
                  </button>
                  <button
                    onClick={() => {
                      setAttachTargetType("Job");
                      setAttachValue(activeDoc.job !== "None" ? activeDoc.job : "");
                      setIsAttachModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[10.5px] font-bold text-[#1F3557] text-left transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    Attach To Job...
                  </button>
                  <button
                    onClick={() => {
                      setAttachTargetType("Employee");
                      setAttachValue(activeDoc.employee !== "None" ? activeDoc.employee : "");
                      setIsAttachModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-[10.5px] font-bold text-[#1F3557] text-left transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Attach To Employee...
                  </button>
                </div>
              </div>

              {/* CORPORATE ACTIONS */}
              <div className="space-y-1.5 pt-2">
                <span className="text-[#5E7393] uppercase text-[9.5px] font-extrabold block">Digital Actions</span>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { label: "Generate PDF", icon: "📑" },
                    { label: "Merge PDFs", icon: "🔗" },
                    { label: "Email Document", icon: "✉️" },
                    { label: "Print Document", icon: "🖨️" },
                    { label: "Share Access", icon: "🤝" },
                    { label: "Sign Packet", icon: "✍️" }
                  ].map((act) => (
                    <button
                      key={act.label}
                      onClick={() => triggerNotification(`⚡ Triggered: ${act.label} on ${activeDoc.name}`)}
                      className="px-2 py-1.5 bg-white/50 hover:bg-[#BDDDF8] border border-[#9EC8EF]/50 rounded-lg text-[10px] font-bold text-[#1F3557] transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span>{act.icon}</span>
                      <span className="truncate">{act.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-[#5E7393] text-xs font-semibold">
              Select a file on the table to inspect details and triggers.
            </div>
          )}
        </div>
      </div>

      {/* FRAMEWORK CONNECTIONS MAP (DASHBOARD VISUALIZATION NODES) */}
      <div className="bg-[#C7E3FA] rounded-2xl p-4.5 border border-[#9EC8EF] shadow-sm space-y-3">
        <div>
          <h3 className="text-xs font-display font-black text-[#1F3557] uppercase tracking-wider">
            Connected Module Sync Grid
          </h3>
          <p className="text-[10.5px] text-[#5E7393] font-semibold mt-0.5">
            Real-time visual node mapping of cross-module database connections
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3.5 pt-2">
          {[
            { label: "Dashboard Node", connected: true, desc: "Captures corporate documents totals" },
            { label: "Revenue Ledger", connected: true, desc: "Matches incoming invoices with Stripe payouts" },
            { label: "Customer Profiles", connected: true, desc: "Appends estimates/MSA sign-offs instantly" },
            { label: "Leads Pipelines", connected: true, desc: "Attaches initial proposal queries" },
            { label: "Estimates & Bids", connected: true, desc: "Auto-generates printable customer contract PDFs" },
            { label: "Scheduling Calendar", connected: true, desc: "Logs safety briefing slips on dispatcher board" },
            { label: "Dispatch Board", connected: true, desc: "Auto-connects blueprints to travel routes" },
            { label: "Travel Routes", connected: true, desc: "Secures truck licensing slips digitally" },
            { label: "Job Folders", connected: true, desc: "Archives permit papers and signed invoices" },
            { label: "Time Clock Slips", connected: true, desc: "Verifies payroll timesheets and W4 files" },
            { label: "Inventory Stock", connected: true, desc: "Indexes packing slips and vendor purchase receipts" },
            { label: "Messages Chat", connected: false, desc: "Awaiting API socket connection framework" },
            { label: "Roster Hub", connected: false, desc: "Awaiting HR payroll verification setup" },
            { label: "AI Assistant Node", connected: false, desc: "Awaiting LLM webhook deployment token" },
            { label: "Training Hub", connected: false, desc: "Awaiting cert template integration" }
          ].map((node) => (
            <div
              key={node.label}
              onClick={() => {
                if (!node.connected) {
                  onOpenPlaceholder(node.label, "🔗");
                } else {
                  triggerNotification(`🔗 ${node.label} database connection verified active`);
                }
              }}
              className="p-3 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF]/80 rounded-xl flex flex-col justify-between h-[105px] transition-all cursor-pointer shadow-sm relative overflow-hidden"
            >
              <div>
                <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wider">{node.label}</h4>
                <p className="text-[9px] text-[#5E7393] font-medium leading-tight mt-1 line-clamp-2">{node.desc}</p>
              </div>

              <div className="flex items-center justify-between mt-1">
                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded font-mono border ${
                  node.connected
                    ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                    : "bg-blue-50 text-blue-500 border-blue-200"
                }`}>
                  {node.connected ? "Connected" : "Ready"}
                </span>
                <span className="text-xs">{node.connected ? "✓" : "□"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* NATIVE PDF EDITOR OVERLAY */}
      {isPDFEditorOpen && (
        <PDFEditor
          documentId={pdfEditorDocId}
          documentName={pdfEditorDocName}
          initialObjects={pdfEditorInitialObjects}
          documentItem={documents.find(d => d.id === pdfEditorDocId) || null}
          onClose={() => setIsPDFEditorOpen(false)}
          onSave={handleSavePDFEditor}
          triggerNotification={triggerNotification}
          logOperationalEvent={logOperationalEvent}
        />
      )}

      {/* GOOGLE DRIVE SYNC IMPORT MODAL */}
      {isGoogleDriveModalOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[500px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#9EC8EF]/45 pb-3 mb-4">
              <div className="flex items-center gap-1.5">
                <Cloud className="w-5 h-5 text-cyan-600 animate-pulse" />
                <h3 className="text-sm font-black uppercase tracking-wider text-[#1F3557]">Google Drive Cloud Picker</h3>
              </div>
              <button onClick={() => setIsGoogleDriveModalOpen(false)} className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold">✕</button>
            </div>
            <div className="space-y-3.5 text-xs">
              <p className="text-[10px] text-[#5E7393] font-black uppercase tracking-widest">Connect and Import Cloud Files:</p>
              <div className="space-y-2">
                {[
                  { name: "Apex_Plumb_Main_Contract_Draft.gdoc", size: "12 KB", type: "Contracts", date: "Yesterday" },
                  { name: "Q2_Corporate_Revenue_Tax_Filing.gsheet", size: "480 KB", type: "Payroll Documents", date: "July 2" },
                  { name: "Commercial_Site_Blueprint_v3.gdraw", size: "4.2 MB", type: "Blueprints", date: "June 28" },
                  { name: "Field_Service_Terms_Master.gdoc", size: "18 KB", type: "Contracts", date: "June 15" }
                ].map((file, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      const importedDoc: DocumentItem = {
                        id: `doc_gdrive_${Date.now()}_${i}`,
                        name: file.name.replace(".gdoc", ".pdf").replace(".gsheet", ".pdf").replace(".gdraw", ".pdf"),
                        customer: "Apex Plumb & Drain",
                        employee: loggedInUser?.name || "System Admin",
                        vendor: "None",
                        job: "None",
                        type: file.type,
                        uploadedBy: "Google Drive Sync",
                        date: new Date().toISOString().split('T')[0],
                        size: file.size,
                        status: "Unsigned",
                        isFavorite: false,
                        isArchived: false,
                        notes: `Imported directly from connected GDrive directory. Originally saved: ${file.date}`,
                        tags: ["GDrive", "Cloud", "Imported"],
                        estimateId: "None",
                        invoiceId: "None",
                        lastModified: "Just now"
                      };
                      setDocuments(prev => [...prev, importedDoc]);
                      setIsGoogleDriveModalOpen(false);
                      triggerNotification(`✅ Successfully imported and synchronized '${importedDoc.name}' from Google Drive!`);
                      if (logOperationalEvent) {
                        logOperationalEvent("GDrive Import", `Synchronized cloud file '${importedDoc.name}'`, "☁️");
                      }
                    }}
                    className="w-full bg-white hover:bg-[#BDDDF8] border border-[#9EC8EF]/40 rounded-xl p-3 flex items-center justify-between text-left transition-colors cursor-pointer shadow-sm group"
                  >
                    <div className="flex items-center gap-2.5">
                      <Cloud className="w-5 h-5 text-cyan-600" />
                      <div>
                        <p className="font-bold text-[#1F3557] group-hover:text-cyan-800 truncate max-w-[240px]">{file.name}</p>
                        <p className="text-[9px] text-[#5E7393] font-medium font-sans">Google Cloud Sync • {file.size}</p>
                      </div>
                    </div>
                    <span className="text-[9px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-bold uppercase">IMPORT</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => setIsGoogleDriveModalOpen(false)}
              className="w-full py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] text-[#1F3557] font-bold rounded-xl text-xs uppercase cursor-pointer mt-4 text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* SMARTPHONE REMOTE CAMERA CAPTURE CONNECT MODAL */}
      {isPhoneUploadModalOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[420px] shadow-2xl border border-[#9EC8EF] text-center animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b border-[#9EC8EF]/45 pb-3 text-left">
              <div className="flex items-center gap-1.5">
                <Smartphone className="w-5 h-5 text-indigo-600 animate-bounce" />
                <h3 className="text-sm font-black uppercase tracking-wider text-[#1F3557]">Upload from Phone</h3>
              </div>
              <button onClick={() => setIsPhoneUploadModalOpen(false)} className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold">✕</button>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-[#9EC8EF]/50 flex flex-col items-center gap-3">
              {/* QR code simulation */}
              <div className="bg-slate-100 p-3 rounded-xl border border-slate-300 shadow-inner flex items-center justify-center">
                <QrCode className="w-32 h-32 text-slate-800" />
              </div>
              <p className="text-[10px] text-[#5E7393] leading-relaxed font-sans font-semibold">
                Scan this QR Code with your smartphone camera to connect device, or click below to simulate immediate phone snapshot uploads!
              </p>
            </div>
            <button
              onClick={() => {
                const simulatedUpload: DocumentItem = {
                  id: `doc_phone_${Date.now()}`,
                  name: `Phone_Snapshot_${new Date().toISOString().slice(0,10).replace(/-/g,"_")}.pdf`,
                  customer: "Apex Plumb & Drain",
                  employee: loggedInUser?.name || "Field Agent",
                  vendor: "None",
                  job: "None",
                  type: "Photos",
                  uploadedBy: "Phone Camera",
                  date: new Date().toISOString().split('T')[0],
                  size: "940 KB",
                  status: "Unsigned",
                  isFavorite: false,
                  isArchived: false,
                  notes: "Synchronized immediately from remote smartphone camera session.",
                  tags: ["Camera", "Mobile", "Live Capture"],
                  estimateId: "None",
                  invoiceId: "None",
                  lastModified: "Just now"
                };
                setDocuments(prev => [...prev, simulatedUpload]);
                setIsPhoneUploadModalOpen(false);
                triggerNotification("📱 Phone photo received and uploaded successfully!");
                if (logOperationalEvent) {
                  logOperationalEvent("Mobile Upload", "Transferred remote smartphone photo capture to records", "📱");
                }
              }}
              className="w-full py-2.5 bg-[#315C9F] hover:bg-[#1F3557] text-white font-black rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow"
            >
              <Plus className="w-4 h-4" />
              Simulate Phone Photo Upload
            </button>
            <button
              onClick={() => setIsPhoneUploadModalOpen(false)}
              className="w-full py-2 bg-white border border-[#9EC8EF] text-[#1F3557] hover:bg-slate-50 font-bold rounded-xl text-xs uppercase cursor-pointer text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* PHOTO-TO-PDF MULTI-IMAGE COMPILER */}
      {isPhotoToPDFModalOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[500px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b border-[#9EC8EF]/45 pb-3">
              <div className="flex items-center gap-1.5">
                <Images className="w-5 h-5 text-amber-500 animate-pulse" />
                <h3 className="text-sm font-black uppercase tracking-wider text-[#1F3557]">Compile PDF from Photos</h3>
              </div>
              <button onClick={() => setIsPhotoToPDFModalOpen(false)} className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold">✕</button>
            </div>
            <div className="space-y-3.5 text-xs font-bold text-[#1F3557]">
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-[#5E7393]">Output Document Name</label>
                <input
                  type="text"
                  className="w-full bg-white border border-[#9EC8EF] rounded-xl px-3.5 py-2.5 focus:outline-none"
                  value={photoToPdfName}
                  onChange={(e) => setPhotoToPdfName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase text-[#5E7393]">Selected Photos to Compile (Drag-order or Click to Select)</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {[
                    { id: "p1", url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400", title: "Drain Jetting Site Rig" },
                    { id: "p2", url: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=400", title: "Excavation Layout" },
                    { id: "p3", url: "https://images.unsplash.com/photo-1581094288338-2314dddb7ecc?w=400", title: "Inspected Mainline Valve" },
                    { id: "p4", url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400", title: "Technician Dispatch Rig" }
                  ].map((photo, index) => {
                    const isSel = selectedPhotos.includes(photo.url);
                    return (
                      <button
                        key={photo.id}
                        onClick={() => {
                          if (isSel) {
                            setSelectedPhotos(prev => prev.filter(u => u !== photo.url));
                          } else {
                            setSelectedPhotos(prev => [...prev, photo.url]);
                          }
                        }}
                        className={`relative rounded-xl border p-1 transition-all text-left ${
                          isSel ? "border-[#315C9F] bg-white ring-2 ring-[#315C9F]" : "border-slate-300 bg-slate-100"
                        }`}
                      >
                        <img src={photo.url} alt="Compile asset" className="w-full h-24 object-cover rounded-lg" referrerPolicy="no-referrer" />
                        <div className="p-1 text-[9px] truncate">{photo.title}</div>
                        {isSel && (
                          <div className="absolute top-2 right-2 bg-[#315C9F] text-white rounded-full w-4.5 h-4.5 flex items-center justify-center text-[9px] font-black">
                            {selectedPhotos.indexOf(photo.url) + 1}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                if (selectedPhotos.length === 0) {
                  triggerNotification("⚠️ Please select at least one photo to compile");
                  return;
                }
                const compiledObjects: EditorObject[] = selectedPhotos.map((photoUrl, index) => ({
                  id: `compiled_photo_${Date.now()}_${index}`,
                  type: "image",
                  x: 15 + index * 5,
                  y: 15 + index * 10,
                  w: 400,
                  h: 240,
                  rotation: 0,
                  isLocked: false,
                  groupId: null,
                  zIndex: index + 1,
                  props: { imageSrc: photoUrl }
                }));

                setPdfEditorDocId(`doc_compile_${Date.now()}`);
                setPdfEditorDocName(photoToPdfName);
                setPdfEditorInitialObjects(compiledObjects);
                setIsPhotoToPDFModalOpen(false);
                setIsPDFEditorOpen(true);
                triggerNotification("📸 Photo compiling session complete! Opening compiled documents inside Editor.");
              }}
              className="w-full py-2.5 bg-[#315C9F] hover:bg-[#1F3557] text-white font-black rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              Compile into PDF & Edit
            </button>
          </div>
        </div>
      )}

      {/* UNIVERSAL DOCUMENT SHARE FLOW MODAL */}
      {isMainShareModalOpen && shareDocItem && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] border border-[#9EC8EF] rounded-[28px] p-6 w-[95%] max-w-[450px] shadow-2xl animate-scale-up text-left">
            <div className="flex items-center justify-between border-b border-[#9EC8EF]/45 pb-3 mb-4">
              <div className="flex items-center gap-1.5">
                <Share2 className="w-4.5 h-4.5 text-[#315C9F]" />
                <h3 className="text-xs font-black uppercase tracking-wider">Share: {shareDocItem.name}</h3>
              </div>
              <button onClick={() => { setIsMainShareModalOpen(false); setShareDocItem(null); }} className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold">✕</button>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] text-[#5E7393] uppercase tracking-wider">Choose Delivery / Export Channels:</p>

              {/* Share Channels */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    const email = prompt("Enter recipient email address:");
                    if (email) {
                      triggerNotification(`📧 Document shared via secure email link to ${email}`);
                      setIsMainShareModalOpen(false);
                      setShareDocItem(null);
                      if (logOperationalEvent) {
                        logOperationalEvent("Document Shared", `Document emailed to ${email}`, "📧");
                      }
                    }
                  }}
                  className="p-3 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer shadow-sm"
                >
                  <Mail className="w-5 h-5 text-sky-600" />
                  <span className="text-[10px] font-black uppercase mt-1">Send Email</span>
                </button>

                <button
                  onClick={() => {
                    const phone = prompt("Enter recipient phone number:");
                    if (phone) {
                      triggerNotification(`💬 Document link shared via SMS to ${phone}`);
                      setIsMainShareModalOpen(false);
                      setShareDocItem(null);
                      if (logOperationalEvent) {
                        logOperationalEvent("Document Shared", `Document text-messaged to ${phone}`, "💬");
                      }
                    }
                  }}
                  className="p-3 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer shadow-sm"
                >
                  <MessageCircle className="w-5 h-5 text-emerald-600" />
                  <span className="text-[10px] font-black uppercase mt-1">Send Text SMS</span>
                </button>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`https://ownerslocal.local/shared/docs/${shareDocItem.id}`);
                    triggerNotification("📋 Secure copy-link copied to clipboard!");
                    setIsMainShareModalOpen(false);
                    setShareDocItem(null);
                  }}
                  className="p-3 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer shadow-sm"
                >
                  <Link className="w-5 h-5 text-indigo-600" />
                  <span className="text-[10px] font-black uppercase mt-1">Copy Link</span>
                </button>

                <button
                  onClick={() => {
                    triggerNotification(`📥 PDF Download initialized: ${shareDocItem.name}`);
                    setIsMainShareModalOpen(false);
                    setShareDocItem(null);
                  }}
                  className="p-3 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer shadow-sm"
                >
                  <Download className="w-5 h-5 text-blue-600" />
                  <span className="text-[10px] font-black uppercase mt-1">Download PDF</span>
                </button>

                <button
                  onClick={() => {
                    triggerNotification("🖨️ Spooling printing protocol service...");
                    setIsMainShareModalOpen(false);
                    setShareDocItem(null);
                  }}
                  className="p-3 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer shadow-sm"
                >
                  <Printer className="w-5 h-5 text-slate-600" />
                  <span className="text-[10px] font-black uppercase mt-1">Print Document</span>
                </button>

                <button
                  onClick={() => {
                    triggerNotification("📲 Triggering phone system universal transfer protocols...");
                    setIsMainShareModalOpen(false);
                    setShareDocItem(null);
                  }}
                  className="p-3 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer shadow-sm"
                >
                  <ExternalLink className="w-5 h-5 text-pink-600" />
                  <span className="text-[10px] font-black uppercase mt-1">Other Apps</span>
                </button>
              </div>
            </div>

            <button
              onClick={() => { setIsMainShareModalOpen(false); setShareDocItem(null); }}
              className="w-full py-2 bg-blue-100 hover:bg-blue-200 text-[#1F3557] font-bold rounded-xl text-xs uppercase cursor-pointer mt-5 text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* MODAL 1: UPLOAD / REPLACE DOCUMENT */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[480px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3.5 mb-4">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-[#315C9F]" />
                <h3 className="text-sm font-black text-[#1F3557] uppercase tracking-wider">Upload New Document</h3>
              </div>
              <button onClick={() => setIsUploadModalOpen(false)} className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold">✕</button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs font-bold text-[#1F3557]">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Select File (Required)</label>
                <div 
                  className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all duration-200 cursor-pointer ${
                    dragActive 
                      ? "border-[#4A86F7] bg-[#EAF5FF]" 
                      : uploadFile 
                        ? "border-emerald-500 bg-[#EAF5FF]/30" 
                        : "border-[#9EC8EF] hover:border-[#4A86F7] bg-[#EAF5FF]/15"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    const file = e.dataTransfer.files?.[0] || null;
                    if (file) {
                      setUploadFile(file);
                      setUploadName(file.name.substring(0, file.name.lastIndexOf('.')) || file.name);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setUploadFile(file);
                      if (file) {
                        setUploadName(file.name.substring(0, file.name.lastIndexOf('.')) || file.name);
                      }
                    }}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center justify-center gap-1">
                    <Upload className="w-6 h-6 text-[#315C9F] animate-pulse" />
                    <p className="text-xs font-bold text-[#1F3557] max-w-full truncate">
                      {uploadFile ? `Selected: ${uploadFile.name}` : "Drag & drop file here, or click to browse"}
                    </p>
                    <p className="text-[9px] text-[#5E7393]">PDF, PNG, JPG, DOCX (Max 50MB)</p>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Document Title</label>
                <input
                  type="text"
                  placeholder="e.g. Master Lease Suite B"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  className="w-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 flex flex-col">
                  <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Doc Type</label>
                  <select
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value)}
                    className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none"
                  >
                    {docTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 flex flex-col">
                  <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Signed Status</label>
                  <select
                    value={uploadStatus}
                    onChange={(e) => setUploadStatus(e.target.value as any)}
                    className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none"
                  >
                    <option value="Signed">Signed</option>
                    <option value="Unsigned">Unsigned</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 flex flex-col">
                  <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Customer Link</label>
                  <select
                    value={uploadCustomer}
                    onChange={(e) => setUploadCustomer(e.target.value)}
                    className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none"
                  >
                    <option value="None">None</option>
                    <option value="Apex Plumb & Drain">Apex Plumb & Drain</option>
                    <option value="Chevron Logistics">Chevron Logistics</option>
                    <option value="Oakridge Apartments">Oakridge Apartments</option>
                  </select>
                </div>

                <div className="space-y-1 flex flex-col">
                  <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Job Link</label>
                  <select
                    value={uploadJob}
                    onChange={(e) => setUploadJob(e.target.value)}
                    className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none"
                  >
                    <option value="None">None</option>
                    <option value="Job #1024">Job #1024</option>
                    <option value="Job #1085">Job #1085</option>
                    <option value="Job #1022">Job #1022</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 flex flex-col">
                  <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Employee Link</label>
                  <select
                    value={uploadEmployee}
                    onChange={(e) => setUploadEmployee(e.target.value)}
                    className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none"
                  >
                    <option value="None">None</option>
                    <option value="Sarah Jenkins">Sarah Jenkins</option>
                    <option value="Marcus Vance">Marcus Vance</option>
                    <option value="Sarah Connor">Sarah Connor</option>
                  </select>
                </div>

                <div className="space-y-1 flex flex-col">
                  <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Vendor Link</label>
                  <select
                    value={uploadVendor}
                    onChange={(e) => setUploadVendor(e.target.value)}
                    className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none"
                  >
                    <option value="None">None</option>
                    <option value="Home Depot">Home Depot</option>
                    <option value="Progressive Commercial">Progressive Commercial</option>
                    <option value="Seattle Real Estate Partners">Seattle Real Estate Partners</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1 flex flex-col">
                <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Description & Notes</label>
                <textarea
                  placeholder="Specify descriptive file notes..."
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  className="w-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2 focus:outline-none font-medium font-sans"
                  rows={2}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Metadata Tags (Comma separated)</label>
                <input
                  type="text"
                  placeholder="e.g. Legal, Contract, Lease"
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                  className="w-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none"
                />
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="flex-1 py-2.5 bg-blue-100 hover:bg-blue-200 rounded-xl transition-colors cursor-pointer text-center font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#315C9F] hover:bg-[#1F3557] text-white rounded-xl transition-colors cursor-pointer text-center font-bold shadow-md"
                >
                  Confirm Upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: SNAPSHOT AI OCR CAMERA */}
      {isSnapshotModalOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-[#315C9F]/40 rounded-[28px] p-6 w-[95%] max-w-[500px] shadow-2xl text-left text-slate-100 animate-scale-up">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-400 animate-pulse" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Snapshot AI Scanner</h3>
              </div>
              <button onClick={() => { setIsSnapshotModalOpen(false); triggerNotification("Document processing canceled."); }} className="text-slate-400 hover:text-white font-bold text-sm">✕</button>
            </div>

            {snapshotStep === "camera" && (
              <div className="space-y-4">
                <p className="text-[11px] text-slate-300">
                  Select a document format and trigger the camera simulation to parse content using Google LLM OCR models.
                </p>

                <div className="space-y-1.5 text-xs font-bold text-slate-200">
                  <label className="text-[9px] uppercase tracking-wider text-slate-400">Document Type to Scan</label>
                  <select
                    value={scannedDocType}
                    onChange={(e) => setScannedDocType(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 focus:outline-none"
                  >
                    <option value="Receipts">Receipts (Auto detects Vendor / Total)</option>
                    <option value="Contracts">Contracts (Auto detects Customer / MSA terms)</option>
                    <option value="Estimates">Estimates (Auto detects Client / Approved items)</option>
                    <option value="Invoices">Invoices (Auto detects Invoice # / Balances)</option>
                    <option value="Blueprints">Blueprints (Auto parses subterranean plans)</option>
                    <option value="Employee Files">Employee IDs / Permits</option>
                  </select>
                </div>

                {/* Camera Viewfinder Simulation */}
                <div className="relative aspect-video bg-slate-950 rounded-2xl border border-slate-800 flex flex-col items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.15)_0%,transparent_70%)]" />
                  {/* Focus Overlays */}
                  <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-blue-500 rounded-tl" />
                  <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-blue-500 rounded-tr" />
                  <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-blue-500 rounded-bl" />
                  <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-blue-500 rounded-br" />

                  {/* Simulated Document Sheet */}
                  <div className="w-28 h-36 bg-slate-800 rounded border border-slate-700 p-2 shadow-lg flex flex-col gap-1 text-[4px] text-slate-500 select-none animate-pulse">
                    <div className="w-12 h-2 bg-slate-600 rounded mb-2" />
                    <div className="w-20 h-1 bg-slate-700 rounded" />
                    <div className="w-16 h-1 bg-slate-700 rounded" />
                    <div className="w-18 h-1 bg-slate-700 rounded" />
                    <div className="flex justify-between mt-auto">
                      <div className="w-6 h-1.5 bg-slate-600 rounded" />
                      <div className="w-8 h-1.5 bg-blue-500 rounded" />
                    </div>
                  </div>

                  <span className="text-[9px] uppercase tracking-widest text-slate-500 font-mono mt-3">Viewfinder active • 1080p 60fps</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setIsSnapshotModalOpen(false); triggerNotification("Document processing canceled."); }}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-bold rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={runCameraSnapshotAI}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-lg flex items-center justify-center gap-1.5 uppercase tracking-wider"
                  >
                    <Camera className="w-4 h-4" />
                    Capture Photo
                  </button>
                </div>
              </div>
            )}

            {snapshotStep === "scanning" && (
              <div className="space-y-6 text-center py-6">
                <div className="relative w-16 h-16 mx-auto bg-blue-500/10 rounded-full flex items-center justify-center border border-blue-500/30">
                  <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">AI Reading Optical Vectors</h4>
                  <p className="text-[10px] text-slate-400 font-mono">Confidence rating: {(70 + cameraProgress * 0.25).toFixed(1)}%</p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full transition-all" style={{ width: `${cameraProgress}%` }} />
                </div>
                <p className="text-[10.5px] text-slate-300">Parsing itemized figures, vendor billing logs, and signature validation fields...</p>
              </div>
            )}

            {snapshotStep === "ai_review" && (
              <div className="space-y-4">
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-400 shrink-0" />
                  <p className="text-[10.5px] text-blue-200">
                    <strong>AI Optical Result:</strong> Parsed file data with simulated ambiguity. Please confirm or edit fields before saving.
                  </p>
                </div>

                {/* Confidence issue mock simulation */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-3.5 space-y-2.5">
                  <h4 className="text-xs font-black text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Verify and Edit Parsed Fields
                  </h4>

                  <div className="grid grid-cols-1 gap-1.5">
                    {[
                      "Apex Plumb & Drain (Matched address)",
                      "Chevron Logistics (Matched primary name)",
                      "Oakridge Apartments (Matched local phone)"
                    ].map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setResolvedCustomer(opt.split(" (")[0]);
                          triggerNotification(`Approved client link: ${opt.split(" (")[0]}`);
                        }}
                        className={`w-full text-left text-[11px] p-2 rounded-lg font-bold border transition-colors ${
                          resolvedCustomer === opt.split(" (")[0]
                            ? "bg-blue-600 border-blue-500 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        }`}
                      >
                        {resolvedCustomer === opt.split(" (")[0] ? "✓ " : ""}
                        {opt}
                      </button>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-700 text-[10.5px] text-slate-300 space-y-3">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 mb-1 uppercase tracking-wider">Document Name</label>
                      <input 
                        type="text" 
                        value={tempDocName} 
                        onChange={(e) => setTempDocName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors" 
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 mb-1 uppercase tracking-wider">Vendor Name</label>
                        <input 
                          type="text" 
                          value={resolvedVendor} 
                          onChange={(e) => setResolvedVendor(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors" 
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 mb-1 uppercase tracking-wider">Customer Link</label>
                        <input 
                          type="text" 
                          value={resolvedCustomer} 
                          onChange={(e) => setResolvedCustomer(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors" 
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setIsSnapshotModalOpen(false); triggerNotification("Document processing canceled."); }}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-bold rounded-xl cursor-pointer text-center"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApproveSnapshotAI}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-lg text-center uppercase tracking-wider"
                  >
                    Approve & Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: RENAME */}
      {isRenameModalOpen && activeDoc && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[380px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3 mb-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-[#1F3557]">Rename Document</h3>
              <button onClick={() => setIsRenameModalOpen(false)} className="text-xs font-bold text-[#5E7393]">✕</button>
            </div>

            <div className="space-y-4 text-xs font-bold">
              <div className="space-y-1">
                <label className="text-[#5E7393]">Specify New File Name</label>
                <input
                  type="text"
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  className="w-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none text-[#1F3557]"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setIsRenameModalOpen(false)}
                  className="flex-1 py-2 bg-blue-100 hover:bg-blue-200 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRenameSubmit}
                  className="flex-1 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white rounded-xl cursor-pointer shadow-md"
                >
                  Rename File
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: DELETE CONFIRMATION */}
      {isDeleteModalOpen && activeDoc && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[380px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3 mb-4">
              <h3 className="text-sm font-black uppercase text-rose-600 tracking-wider">Confirm permanent deletion</h3>
              <button onClick={() => setIsDeleteModalOpen(false)} className="text-xs font-bold text-[#5E7393]">✕</button>
            </div>

            <div className="space-y-4 text-xs font-bold">
              <p className="text-[#5E7393] font-sans font-medium leading-relaxed">
                Are you certain you wish to delete <strong>'{activeDoc.name}'</strong> from Cloud Storage? This action is permanent and cannot be undone.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 py-2 bg-blue-100 hover:bg-blue-200 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteSubmit}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl cursor-pointer shadow-md"
                >
                  Delete permanently
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: ATTACH TO RECORD */}
      {isAttachModalOpen && activeDoc && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[400px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3 mb-4">
              <h3 className="text-sm font-black uppercase text-[#1F3557] tracking-wider">Attach Document</h3>
              <button onClick={() => setIsAttachModalOpen(false)} className="text-xs font-bold text-[#5E7393]">✕</button>
            </div>

            <div className="space-y-4 text-xs font-bold text-[#1F3557]">
              <div className="space-y-1.5 flex flex-col">
                <label className="text-[#5E7393]">Select Connection Target</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["Customer", "Job", "Employee"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAttachTargetType(t)}
                      className={`py-2 rounded-xl border text-[11px] font-bold text-center transition-all ${
                        attachTargetType === t
                          ? "bg-[#315C9F] text-white border-[#315C9F]"
                          : "bg-white border-[#9EC8EF] text-[#5E7393] hover:bg-[#EAF5FF]"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[#5E7393]">Link Record Name / ID</label>
                {attachTargetType === "Customer" ? (
                  <select
                    value={attachValue}
                    onChange={(e) => setAttachValue(e.target.value)}
                    className="w-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none text-[#1F3557]"
                  >
                    <option value="">-- Choose Customer --</option>
                    <option value="Apex Plumb & Drain">Apex Plumb & Drain</option>
                    <option value="Chevron Logistics">Chevron Logistics</option>
                    <option value="Oakridge Apartments">Oakridge Apartments</option>
                  </select>
                ) : attachTargetType === "Job" ? (
                  <select
                    value={attachValue}
                    onChange={(e) => setAttachValue(e.target.value)}
                    className="w-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none text-[#1F3557]"
                  >
                    <option value="">-- Choose Job --</option>
                    <option value="Job #1024">Job #1024 (Apex sewer install)</option>
                    <option value="Job #1085">Job #1085 (Chevron dig)</option>
                    <option value="Job #1022">Job #1022 (Oakridge repair)</option>
                  </select>
                ) : (
                  <select
                    value={attachValue}
                    onChange={(e) => setAttachValue(e.target.value)}
                    className="w-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-3 py-2.5 focus:outline-none text-[#1F3557]"
                  >
                    <option value="">-- Choose Employee --</option>
                    <option value="Sarah Jenkins">Sarah Jenkins (Office Manager)</option>
                    <option value="Marcus Vance">Marcus Vance (Excavator)</option>
                    <option value="Sarah Connor">Sarah Connor (Field Tech)</option>
                  </select>
                )}
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setIsAttachModalOpen(false)}
                  className="flex-1 py-2 bg-blue-100 hover:bg-blue-200 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAttachSubmit}
                  className="flex-1 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white rounded-xl cursor-pointer shadow-md"
                >
                  Apply Connection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: EXPORT CONFIGURATION */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[480px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up flex flex-col max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-3.5 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-[#315C9F]" />
                <h3 className="text-sm font-black text-[#1F3557] uppercase tracking-wider">Export Documents</h3>
              </div>
              <button onClick={() => setIsExportModalOpen(false)} className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold">✕</button>
            </div>

            <div className="space-y-4 text-xs font-bold text-[#1F3557] overflow-y-auto pr-1">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-[#5E7393]">Choose Export Format</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["csv", "json", "tsv"] as const).map((format) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() => {
                        setExportFormat(format);
                        setExportSuccessMessage(null);
                        setExportContent("");
                      }}
                      className={`py-2.5 rounded-xl border text-[11px] font-bold text-center transition-all ${
                        exportFormat === format
                          ? "bg-[#315C9F] text-white border-[#315C9F]"
                          : "bg-white border-[#9EC8EF] text-[#5E7393] hover:bg-[#EAF5FF]"
                      }`}
                    >
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[#5E7393] leading-relaxed font-sans font-medium">
                  {exportFormat === "csv" && "• CSV Format: Perfect for importing into Microsoft Excel, Google Sheets, or any other spreadsheet editor."}
                  {exportFormat === "json" && "• JSON Format: Full structured data backup of all document meta-properties, tags, links, and details."}
                  {exportFormat === "tsv" && "• TSV Format: Tab-Separated Values, ideal for copy-pasting directly into active spreadsheet cells."}
                </p>
              </div>

              <div className="bg-[#EAF5FF] rounded-2xl p-4 border border-[#9EC8EF]/40 space-y-2">
                <p className="text-[11px] text-[#1F3557] font-extrabold">Data Summary to Export:</p>
                <ul className="text-[10px] text-[#5E7393] space-y-1 font-medium font-sans">
                  <li>• Total Documents: <strong className="text-[#1F3557] font-bold">{documents.length}</strong></li>
                  <li>• Database Schema: ID, Name, Customer, Employee, Vendor, Job, Type, Date, Size, Status</li>
                </ul>
              </div>

              <button
                onClick={() => executeExport(exportFormat)}
                className="w-full py-3 bg-[#4A86F7] hover:bg-[#3977EE] text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download {exportFormat.toUpperCase()} Export File
              </button>

              {exportSuccessMessage && (
                <div className="mt-3 bg-emerald-50 border border-emerald-300 text-emerald-800 p-3.5 rounded-2xl space-y-2 animate-fade-in">
                  <div className="flex items-start gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-extrabold text-emerald-900">{exportSuccessMessage}</p>
                      <p className="text-[10px] text-emerald-700/80 font-sans font-medium">If the automatic file download did not start, you can view or copy the exported data below.</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] uppercase tracking-wider text-emerald-700">Raw Data Content</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(exportContent);
                          triggerNotification("📋 Copied exported data to clipboard!");
                        }}
                        className="text-[10px] text-emerald-800 hover:underline font-bold animate-pulse"
                      >
                        Copy Data
                      </button>
                    </div>
                    <textarea
                      readOnly
                      value={exportContent}
                      className="w-full h-24 bg-white/70 border border-emerald-200 rounded-lg p-2 font-mono text-[9px] text-emerald-950 focus:outline-none resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[#9EC8EF] pt-3.5 mt-4 shrink-0">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="w-full py-2 bg-blue-100 hover:bg-blue-200 text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer text-center"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
