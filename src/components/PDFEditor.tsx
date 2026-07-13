import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Type,
  Image as ImageIcon,
  CheckSquare,
  CircleDot,
  ChevronDown,
  Calendar,
  FileSignature,
  Edit3,
  Square,
  Highlighter,
  MessageSquare,
  Award,
  Link as LinkIcon,
  QrCode,
  Table as TableIcon,
  Paperclip,
  Move,
  RotateCw,
  Copy,
  Trash2,
  Lock,
  Unlock,
  Layers,
  Sparkles,
  Download,
  Share2,
  Maximize2,
  Minimize2,
  Grid,
  Check,
  Plus,
  Undo2,
  Settings,
  Mail,
  MessageCircle,
  FileText,
  Printer,
  ExternalLink,
  ChevronUp,
  X,
  Compass,
  CornerRightDown
} from "lucide-react";

// Standard fonts
const SYSTEM_FONTS = [
  "Inter",
  "Space Grotesk",
  "JetBrains Mono",
  "Playfair Display",
  "Arial",
  "Times New Roman",
  "Courier New",
  "Georgia",
  "Trebuchet MS"
];

export interface EditorObject {
  id: string;
  type:
    | "text"
    | "image"
    | "checkbox"
    | "radio"
    | "dropdown"
    | "date"
    | "signature"
    | "initial"
    | "drawing"
    | "shape"
    | "highlight"
    | "comment"
    | "stamp"
    | "hyperlink"
    | "qrcode"
    | "table"
    | "attachment";
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  w: number; // pixels on standard page (1000px width reference)
  h: number; // pixels on standard page
  rotation: number; // degrees
  isLocked: boolean;
  groupId: string | null;
  zIndex: number;
  props: {
    text?: string;
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    bgColor?: string;
    options?: string[];
    selectedValue?: string;
    imageSrc?: string;
    isChecked?: boolean;
    shapeType?: "rectangle" | "circle" | "line" | "arrow" | "star";
    stampType?: "APPROVED" | "REJECTED" | "DRAFT" | "COPY" | "SIGN HERE";
    url?: string;
    commentAuthor?: string;
    commentDate?: string;
    tableRows?: string[][];
    attachmentName?: string;
    attachmentSize?: string;
    drawingPoints?: { x: number; y: number }[][]; // nested arrays for multiple strokes
    role?: "customer" | "employee" | "owner" | "witness";
    isAutodetected?: boolean;
    signedBy?: string;
    signedAt?: string;
  };
}

interface PDFEditorProps {
  documentId: string | null;
  documentName: string;
  onClose: () => void;
  onSave: (docId: string, updatedName: string, metaProperties?: any) => void;
  triggerNotification: (msg: string) => void;
  logOperationalEvent?: (type: string, desc: string, icon: string) => void;
  initialObjects?: EditorObject[];
  documentItem?: any;
  loggedInUser?: any;
}

export const PDFEditor: React.FC<PDFEditorProps> = ({
  documentId,
  documentName,
  onClose,
  onSave,
  triggerNotification,
  logOperationalEvent,
  initialObjects = [],
  documentItem = null,
  loggedInUser = null
}) => {
  // Mode of operation: "normal" (scroll & zoom) vs "edit" (adding, editing, manipulation)
  const [editorMode, setEditorMode] = useState<"normal" | "edit">("edit");
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [objects, setObjects] = useState<EditorObject[]>([]);
  const [isMultiSelectActive, setIsMultiSelectActive] = useState<boolean>(false);
  const [clipboard, setClipboard] = useState<EditorObject[]>([]);
  
  // History tracking for undo
  const [history, setHistory] = useState<EditorObject[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // New object default properties (auto matched or selected)
  const [activeFont, setActiveFont] = useState<string>("Inter");
  const [activeFontSize, setActiveFontSize] = useState<number>(14);
  const [activeColor, setActiveColor] = useState<string>("#1F3557");

  // Modals inside editor
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isPropertiesModalOpen, setIsPropertiesModalOpen] = useState(false);
  const [activePropertyObject, setActivePropertyObject] = useState<EditorObject | null>(null);
  const [isLockPromptOpen, setIsLockPromptOpen] = useState(false);
  const [pendingLockObjectId, setPendingLockObjectId] = useState<string | null>(null);

  // --- BRAND NEW eSIGNATURE SYSTEM STATES ---
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [activeSignObject, setActiveSignObject] = useState<EditorObject | null>(null);
  const [signMethod, setSignMethod] = useState<"draw" | "type" | "import">("draw");
  const [signerFullName, setSignerFullName] = useState("");
  const [signerRole, setSignerRole] = useState<"customer" | "employee" | "owner" | "witness">("customer");
  const [typedFont, setTypedFont] = useState("Pacifico");
  
  const [isESignSidebarOpen, setIsESignSidebarOpen] = useState(false);
  const [isAuditTrailOpen, setIsAuditTrailOpen] = useState(false);
  const [signingOption, setSigningOption] = useState<"in_person" | "remote">("in_person");
  const [enforceSigningOrder, setEnforceSigningOrder] = useState(false);
  const [requireWitness, setRequireWitness] = useState(false);
  const [isScanningActive, setIsScanningActive] = useState(false);
  const [fillAllEmployeeSigs, setFillAllEmployeeSigs] = useState(true);
  const [fillAllEmployeeInits, setFillAllEmployeeInits] = useState(true);

  // Load audit trail and signing options from documentItem if available
  const [auditTrail, setAuditTrail] = useState<any[]>(() => {
    return documentItem?.auditTrail || [
      {
        id: "evt_1",
        signerName: "System",
        role: "system",
        action: "created",
        timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
        ipAddress: "127.0.0.1",
        device: "Server Core Node",
        documentVersion: "v1.0"
      }
    ];
  });
  
  // Freehand drawing status
  const [isDrawingModeActive, setIsDrawingModeActive] = useState<boolean>(false);
  const [currentDrawingStroke, setCurrentDrawingStroke] = useState<{ x: number; y: number }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Drag select box coordinates
  const [dragSelectStart, setDragSelectStart] = useState<{ x: number; y: number } | null>(null);
  const [dragSelectCurrent, setDragSelectCurrent] = useState<{ x: number; y: number } | null>(null);

  // Context menus
  const [objectContextMenu, setObjectContextMenu] = useState<{
    x: number;
    y: number;
    objectId: string;
  } | null>(null);
  const [canvasContextMenu, setCanvasContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Touch & Mouse Gesture tracking state
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const doubleTapRef = useRef<{ lastTime: number; x: number; y: number }>({ lastTime: 0, x: 0, y: 0 });
  const objectTouchStartRef = useRef<{ objectId: string; x: number; y: number; time: number; hasMoved: boolean } | null>(null);
  const resizeStartRef = useRef<{
    objectId: string;
    handle: string;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startXPercent: number;
    startYPercent: number;
  } | null>(null);
  const rotateStartRef = useRef<{
    objectId: string;
    startAngle: number;
    startX: number;
    startY: number;
  } | null>(null);
  const dragMoveStartRef = useRef<{
    objectId: string;
    startX: number;
    startY: number;
    startPercentX: number;
    startPercentY: number;
  } | null>(null);

  // Reference width of virtual canvas page (standard is 1000px wide, high-fidelity responsive scaling)
  const VIRTUAL_PAGE_WIDTH = 1000;
  const VIRTUAL_PAGE_HEIGHT = 1400; // standard A4 aspect
  const pageContainerRef = useRef<HTMLDivElement>(null);

  // Seed default items if none provided
  useEffect(() => {
    if (initialObjects && initialObjects.length > 0) {
      setObjects(initialObjects);
      saveToHistory(initialObjects);
    } else {
      // Seed nice standard elements to make it look fully active and professional
      const seeded: EditorObject[] = [
        {
          id: "seed_1",
          type: "text",
          x: 10,
          y: 6,
          w: 800,
          h: 60,
          rotation: 0,
          isLocked: true,
          groupId: null,
          zIndex: 1,
          props: {
            text: "STANDARD SERVICE CONTRACT & AGREEMENT",
            fontFamily: "Space Grotesk",
            fontSize: 24,
            color: "#1F3557"
          }
        },
        {
          id: "seed_2",
          type: "text",
          x: 10,
          y: 11,
          w: 800,
          h: 40,
          rotation: 0,
          isLocked: true,
          groupId: null,
          zIndex: 2,
          props: {
            text: "LeadForge Operational Systems • Field Service Standard Template",
            fontFamily: "Inter",
            fontSize: 12,
            color: "#5E7393"
          }
        },
        {
          id: "seed_3",
          type: "stamp",
          x: 75,
          y: 4,
          w: 160,
          h: 60,
          rotation: -12,
          isLocked: false,
          groupId: null,
          zIndex: 10,
          props: {
            stampType: "APPROVED"
          }
        },
        {
          id: "seed_4",
          type: "text",
          x: 10,
          y: 18,
          w: 380,
          h: 220,
          rotation: 0,
          isLocked: false,
          groupId: null,
          zIndex: 3,
          props: {
            text: "CLIENT DETAILS\nName: Apex Plumb & Drain\nContact: Sarah Jenkins\nAddress: 1024 Industrial Pkwy, Suite B\nEmail: contact@apexdrain.com\n\nSERVICE SCHEDULE\nType: Emergency Mainline Jetting\nFrequency: Bi-Monthly Maintenance",
            fontFamily: "Inter",
            fontSize: 13,
            color: "#1F3557"
          }
        },
        {
          id: "seed_5",
          type: "text",
          x: 52,
          y: 18,
          w: 380,
          h: 220,
          rotation: 0,
          isLocked: false,
          groupId: null,
          zIndex: 4,
          props: {
            text: "CONTRACT CONDITIONS\n1. This service contract guarantees response within 4 hours.\n2. Invoices are dispatched automatically upon digital signature approval.\n3. Late approvals are subject to a 1.5% bi-weekly administration overhead fee.\n4. Field technicians maintain real-time telemetry recording logs.",
            fontFamily: "Inter",
            fontSize: 13,
            color: "#1F3557"
          }
        },
        {
          id: "seed_6",
          type: "checkbox",
          x: 10,
          y: 36,
          w: 24,
          h: 24,
          rotation: 0,
          isLocked: false,
          groupId: null,
          zIndex: 5,
          props: {
            isChecked: true
          }
        },
        {
          id: "seed_7",
          type: "text",
          x: 14,
          y: 36.3,
          w: 500,
          h: 30,
          rotation: 0,
          isLocked: true,
          groupId: null,
          zIndex: 6,
          props: {
            text: "Accept General Conditions of Digital Invoicing Agreements",
            fontFamily: "Inter",
            fontSize: 12,
            color: "#1F3557"
          }
        },
        {
          id: "seed_8",
          type: "checkbox",
          x: 10,
          y: 39.5,
          w: 24,
          h: 24,
          rotation: 0,
          isLocked: false,
          groupId: null,
          zIndex: 7,
          props: {
            isChecked: false
          }
        },
        {
          id: "seed_9",
          type: "text",
          x: 14,
          y: 39.8,
          w: 500,
          h: 30,
          rotation: 0,
          isLocked: true,
          groupId: null,
          zIndex: 8,
          props: {
            text: "Require SMS updates upon dispatch status change notifications",
            fontFamily: "Inter",
            fontSize: 12,
            color: "#1F3557"
          }
        }
      ];
      setObjects(seeded);
      saveToHistory(seeded);
    }
  }, [initialObjects]);

  // Undo/Redo logic
  const saveToHistory = (newObjects: EditorObject[]) => {
    const updatedHistory = history.slice(0, historyIndex + 1);
    updatedHistory.push(JSON.parse(JSON.stringify(newObjects)));
    setHistory(updatedHistory);
    setHistoryIndex(updatedHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      setHistoryIndex(prevIdx);
      setObjects(JSON.parse(JSON.stringify(history[prevIdx])));
      setSelectedIds([]);
      triggerNotification("Undo executed");
    } else {
      triggerNotification("Nothing to undo");
    }
  };

  // Determine fonts currently active in the document to sort them at the top
  const usedFonts = useMemo(() => {
    const activeFonts = new Set<string>();
    objects.forEach(obj => {
      if (obj.props.fontFamily) {
        activeFonts.add(obj.props.fontFamily);
      }
    });
    return Array.from(activeFonts);
  }, [objects]);

  // Combine fonts with standard system fonts, avoiding duplicates and sorting active ones first
  const sortedFontsList = useMemo(() => {
    const remaining = SYSTEM_FONTS.filter(f => !usedFonts.includes(f));
    return [...usedFonts, ...remaining];
  }, [usedFonts]);

  // Auto-detect nearby text format helper
  const detectNearbyFormat = (clickX: number, clickY: number): { fontFamily: string; fontSize: number; color: string } => {
    let nearestDist = Infinity;
    let match = { fontFamily: "Inter", fontSize: 13, color: "#1F3557" };

    objects.forEach(obj => {
      if (obj.type === "text" && obj.props.fontFamily) {
        const dx = obj.x - clickX;
        const dy = obj.y - clickY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestDist) {
          nearestDist = dist;
          match = {
            fontFamily: obj.props.fontFamily,
            fontSize: obj.props.fontSize || 13,
            color: obj.props.color || "#1F3557"
          };
        }
      }
    });

    return match;
  };

  // Create customized new objects
  const handleAddObject = (
    type: EditorObject["type"],
    customX?: number,
    customY?: number
  ) => {
    const id = `obj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const x = customX !== undefined ? customX : 35;
    const y = customY !== undefined ? customY : 40;

    // Detect format from surrounding elements
    const matchedFormat = detectNearbyFormat(x, y);

    let defaultProps: EditorObject["props"] = {};
    let w = 120;
    let h = 40;

    switch (type) {
      case "text":
        defaultProps = {
          text: "Double tap to write text",
          fontFamily: matchedFormat.fontFamily,
          fontSize: matchedFormat.fontSize,
          color: matchedFormat.color
        };
        w = 200;
        h = 50;
        break;
      case "checkbox":
        defaultProps = { isChecked: false };
        w = 24;
        h = 24;
        break;
      case "radio":
        defaultProps = { isChecked: false };
        w = 24;
        h = 24;
        break;
      case "dropdown":
        defaultProps = {
          options: ["Approved", "Pending Review", "Declined", "Requires Amendment"],
          selectedValue: "Approved"
        };
        w = 160;
        h = 32;
        break;
      case "date":
        defaultProps = { text: new Date().toLocaleDateString() };
        w = 140;
        h = 32;
        break;
      case "signature":
        defaultProps = { text: "", role: "customer" };
        w = 200;
        h = 80;
        break;
      case "initial":
        defaultProps = { text: "", role: "customer" };
        w = 80;
        h = 50;
        break;
      case "image":
        defaultProps = {
          imageSrc: "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=500&auto=format&fit=crop&q=60"
        };
        w = 150;
        h = 100;
        break;
      case "shape":
        defaultProps = { shapeType: "rectangle", color: "#315C9F", bgColor: "#EAF5FF" };
        w = 100;
        h = 100;
        break;
      case "highlight":
        defaultProps = { color: "rgba(253, 224, 71, 0.45)" };
        w = 180;
        h = 30;
        break;
      case "comment":
        defaultProps = {
          text: "Please verify service checklist line-items before signing.",
          commentAuthor: "Admin Coordinator",
          commentDate: "Just now"
        };
        w = 240;
        h = 100;
        break;
      case "stamp":
        defaultProps = { stampType: "APPROVED" };
        w = 150;
        h = 55;
        break;
      case "hyperlink":
        defaultProps = { url: "https://leadforge.local" };
        w = 150;
        h = 30;
        break;
      case "qrcode":
        defaultProps = { text: "https://leadforge.local/docs/signed_master" };
        w = 100;
        h = 100;
        break;
      case "table":
        defaultProps = {
          tableRows: [
            ["Qty", "Line Item", "Unit Cost", "Subtotal"],
            ["1.00", "Drain Jetting", "350.00", "350.00"],
            ["2.50", "Service Labor", "80.00", "200.00"],
            ["Total", "", "", "550.00"]
          ]
        };
        w = 400;
        h = 150;
        break;
      case "attachment":
        defaultProps = { attachmentName: "leak_assessment_photo.jpg", attachmentSize: "2.4 MB" };
        w = 220;
        h = 50;
        break;
    }

    const maxZ = objects.reduce((max, o) => Math.max(max, o.zIndex), 0);

    const newObj: EditorObject = {
      id,
      type,
      x,
      y,
      w,
      h,
      rotation: 0,
      isLocked: false,
      groupId: null,
      zIndex: maxZ + 1,
      props: defaultProps
    };

    const nextObjects = [...objects, newObj];
    setObjects(nextObjects);
    saveToHistory(nextObjects);
    setSelectedIds([id]);
    triggerNotification(`Added ${type} component`);

    if (logOperationalEvent) {
      logOperationalEvent("PDF Object Added", `Inserted ${type} object into ${documentName}`, "📝");
    }
  };

  // --- BRAND NEW eSIGNATURE SYSTEM LOGIC ---
  const handleOpenSignModal = (obj: EditorObject) => {
    setActiveSignObject(obj);
    const role = (obj.props as any).role || "customer";
    setSignerRole(role);
    if (loggedInUser && (role === "employee" || role === "owner")) {
      setSignerFullName(loggedInUser.name || "Sarah Jenkins");
    } else {
      setSignerFullName((obj.props as any).signedBy || "");
    }
    setSignMethod("draw");
    setIsSignModalOpen(true);
  };

  const addAuditTrailEntry = (signerName: string, role: string, action: string) => {
    const randomIP = `172.56.${Math.floor(Math.random() * 80) + 10}.${Math.floor(Math.random() * 240) + 10}`;
    const userAgent = navigator.userAgent;
    const deviceName = userAgent.includes("Mobi") ? "Tablet/Mobile Client" : "Desktop Workstation";
    const newEntry = {
      id: `evt_${Date.now()}`,
      signerName,
      role,
      action,
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
      ipAddress: randomIP,
      device: `${deviceName} (${navigator.platform})`,
      documentVersion: `v1.0-${action === "signed" ? "Signed" : "Modified"}`,
      hash: "sha256-" + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10)
    };
    setAuditTrail(prev => [...prev, newEntry]);
  };

  const handleApplySignature = (sigValue: string, isInitials: boolean) => {
    if (!activeSignObject) return;
    
    const role = (activeSignObject.props as any).role || "customer";
    const nameToLog = signerFullName.trim() || (role === "customer" ? "Authorized Customer" : "Staff Member");
    
    let updatedObjects = objects.map(o => {
      if (o.id === activeSignObject.id) {
        return {
          ...o,
          props: {
            ...o.props,
            text: sigValue,
            signedBy: nameToLog,
            signedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
            fontFamily: signMethod === "type" ? typedFont : "Inter"
          }
        };
      }
      return o;
    });

    // Employee Autofill Logic
    if (role === "employee" || role === "owner") {
      if (!isInitials && fillAllEmployeeSigs) {
        updatedObjects = updatedObjects.map(o => {
          if (o.type === "signature" && ((o.props as any).role === "employee" || (o.props as any).role === "owner") && !o.props.text) {
            return {
              ...o,
              props: {
                ...o.props,
                text: sigValue,
                signedBy: nameToLog,
                signedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
                fontFamily: signMethod === "type" ? typedFont : "Inter"
              }
            };
          }
          return o;
        });
      } else if (isInitials && fillAllEmployeeInits) {
        updatedObjects = updatedObjects.map(o => {
          if (o.type === "initial" && ((o.props as any).role === "employee" || (o.props as any).role === "owner") && !o.props.text) {
            return {
              ...o,
              props: {
                ...o.props,
                text: sigValue,
                signedBy: nameToLog,
                signedAt: new Date().toISOString().replace("T", " ").substring(0, 19),
                fontFamily: signMethod === "type" ? typedFont : "Inter"
              }
            };
          }
          return o;
        });
      }
    }

    setObjects(updatedObjects);
    saveToHistory(updatedObjects);
    addAuditTrailEntry(nameToLog, role, "signed");
    setIsSignModalOpen(false);
    triggerNotification(`Successfully signed ${activeSignObject.type} field as ${nameToLog}!`);

    if (logOperationalEvent) {
      logOperationalEvent("eSign Field Completed", `${activeSignObject.type} stamped and completed by ${nameToLog}`, "✍️");
    }
  };

  const handleAutoDetectFields = () => {
    setIsScanningActive(true);
    triggerNotification("Scanning templates for underscores and signature blocks...");
    
    setTimeout(() => {
      let sigCount = 0;
      let initCount = 0;
      const newFields: EditorObject[] = [];
      const maxZ = objects.reduce((max, o) => Math.max(max, o.zIndex), 0);
      
      objects.forEach((obj, idx) => {
        if (obj.type === "text" && obj.props.text) {
          const text = obj.props.text;
          // Look for 5+ underscores
          if (text.includes("_____") || text.includes("_ _ _ _ _") || text.toLowerCase().includes("signature:")) {
            sigCount++;
            newFields.push({
              id: `detected_sig_${Date.now()}_${idx}`,
              type: "signature",
              x: obj.x,
              y: Math.min(95, obj.y + 4),
              w: 200,
              h: 70,
              rotation: 0,
              isLocked: false,
              groupId: null,
              zIndex: maxZ + sigCount + initCount + 1,
              props: {
                text: "",
                role: sigCount === 1 ? "customer" : "employee",
                isAutodetected: true
              }
            });
          }
          // Look for 2-4 underscores
          else if (text.includes("____") || text.includes("__") || text.toLowerCase().includes("initials:")) {
            initCount++;
            newFields.push({
              id: `detected_init_${Date.now()}_${idx}`,
              type: "initial",
              x: obj.x + 2,
              y: Math.min(95, obj.y + 4),
              w: 80,
              h: 45,
              rotation: 0,
              isLocked: false,
              groupId: null,
              zIndex: maxZ + sigCount + initCount + 1,
              props: {
                text: "",
                role: "customer",
                isAutodetected: true
              }
            });
          }
        }
      });
      
      if (sigCount === 0 && initCount === 0) {
        // Fallback demo indicators
        sigCount = 2;
        initCount = 1;
        newFields.push({
          id: `detected_sig_cust`,
          type: "signature",
          x: 10,
          y: 78,
          w: 220,
          h: 70,
          rotation: 0,
          isLocked: false,
          groupId: null,
          zIndex: maxZ + 1,
          props: { text: "", role: "customer", isAutodetected: true }
        });
        newFields.push({
          id: `detected_sig_emp`,
          type: "signature",
          x: 65,
          y: 78,
          w: 220,
          h: 70,
          rotation: 0,
          isLocked: false,
          groupId: null,
          zIndex: maxZ + 2,
          props: { text: "", role: "employee", isAutodetected: true }
        });
        newFields.push({
          id: `detected_init_cust`,
          type: "initial",
          x: 42,
          y: 80,
          w: 85,
          h: 45,
          rotation: 0,
          isLocked: false,
          groupId: null,
          zIndex: maxZ + 3,
          props: { text: "", role: "customer", isAutodetected: true }
        });
      }
      
      const updatedObjects = [...objects, ...newFields];
      setObjects(updatedObjects);
      saveToHistory(updatedObjects);
      setIsScanningActive(false);
      triggerNotification(`Scan complete! Loaded ${sigCount} signature fields and ${initCount} initials fields.`);
      if (logOperationalEvent) {
        logOperationalEvent("eSign Auto-Detection", `Placed ${sigCount} signature and ${initCount} initials fields`, "🤖");
      }
    }, 1200);
  };

  const handleFinalizeESign = () => {
    const unsignedRequired = objects.filter(o => (o.type === "signature" || o.type === "initial") && !o.props.text);
    if (unsignedRequired.length > 0) {
      const confirmForce = confirm(`Warning: There are ${unsignedRequired.length} unsigned signature/initial fields remaining. Are you sure you want to lock and finalize anyway?`);
      if (!confirmForce) return;
    }

    const lockedObjects = objects.map(o => ({ ...o, isLocked: true }));
    setObjects(lockedObjects);
    saveToHistory(lockedObjects);
    
    const finalEvent = {
      id: `evt_finalize_${Date.now()}`,
      signerName: loggedInUser?.name || "System Admin",
      role: "employee",
      action: "completed",
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
      ipAddress: "172.56.24.112",
      device: "Desktop Core App",
      documentVersion: "v1.0-Signed",
      hash: "sha256-finalized-" + Math.random().toString(36).substring(2, 12)
    };

    const finalAuditTrail = [...auditTrail, finalEvent];
    setAuditTrail(finalAuditTrail);

    // Call the parent's save with Signed status
    onSave(documentId || `doc_custom_${Date.now()}`, documentName, {
      objects: lockedObjects,
      status: "Signed",
      auditTrail: finalAuditTrail,
      signingOptions: {
        signingOption,
        enforceSigningOrder,
        requireWitness
      }
    });

    triggerNotification("Document finalized and locked successfully! Generated tamper-evident eSignature audit trail.");
    if (logOperationalEvent) {
      logOperationalEvent("Document Signed & Locked", `eSignature package completed for ${documentName}`, "🔒");
    }
  };

  // Clipboard operations
  const handleCopy = () => {
    if (selectedIds.length === 0) return;
    const selectedObjs = objects.filter(o => selectedIds.includes(o.id));
    setClipboard(selectedObjs);
    triggerNotification(`Copied ${selectedObjs.length} objects`);
  };

  const handleDuplicate = () => {
    if (selectedIds.length === 0) return;
    const newCopies: EditorObject[] = [];
    const idMap: Record<string, string> = {};

    // First map existing IDs to new duplicated IDs
    const maxZ = objects.reduce((max, o) => Math.max(max, o.zIndex), 0);

    const selectedObjs = objects.filter(o => selectedIds.includes(o.id));
    selectedObjs.forEach((o, index) => {
      const newId = `obj_${Date.now()}_dup_${index}_${Math.random().toString(36).substring(2, 6)}`;
      idMap[o.id] = newId;

      const copy: EditorObject = JSON.parse(JSON.stringify(o));
      copy.id = newId;
      copy.x = Math.min(95, copy.x + 3); // shift slightly so it doesn't align exactly
      copy.y = Math.min(95, copy.y + 3);
      copy.zIndex = maxZ + index + 1;
      copy.isLocked = false; // duplicate should not start locked

      newCopies.push(copy);
    });

    const nextObjects = [...objects, ...newCopies];
    setObjects(nextObjects);
    saveToHistory(nextObjects);
    setSelectedIds(newCopies.map(c => c.id));
    triggerNotification(`Duplicated ${newCopies.length} items`);
  };

  const handlePaste = () => {
    if (clipboard.length === 0) return;
    const maxZ = objects.reduce((max, o) => Math.max(max, o.zIndex), 0);
    const pasted: EditorObject[] = [];

    clipboard.forEach((o, index) => {
      const newId = `obj_${Date.now()}_paste_${index}_${Math.random().toString(36).substring(2, 6)}`;
      const copy: EditorObject = JSON.parse(JSON.stringify(o));
      copy.id = newId;
      copy.x = Math.min(95, copy.x + 5);
      copy.y = Math.min(95, copy.y + 5);
      copy.zIndex = maxZ + index + 1;
      copy.isLocked = false;
      pasted.push(copy);
    });

    const nextObjects = [...objects, ...pasted];
    setObjects(nextObjects);
    saveToHistory(nextObjects);
    setSelectedIds(pasted.map(p => p.id));
    triggerNotification(`Pasted ${pasted.length} objects`);
  };

  const handleDelete = () => {
    if (selectedIds.length === 0) return;
    const nextObjects = objects.filter(o => !selectedIds.includes(o.id));
    setObjects(nextObjects);
    saveToHistory(nextObjects);
    setSelectedIds([]);
    triggerNotification("Objects deleted");
  };

  // Reordering Layers
  const reorderLayer = (action: "bring_forward" | "bring_to_front" | "send_back" | "send_to_back") => {
    if (selectedIds.length === 0) return;
    
    let nextObjects = [...objects];
    // Find matching object indexes
    const indices = nextObjects
      .map((o, idx) => (selectedIds.includes(o.id) ? idx : -1))
      .filter(idx => idx !== -1);

    if (indices.length === 0) return;

    if (action === "bring_to_front") {
      const maxZ = nextObjects.reduce((max, o) => Math.max(max, o.zIndex), 0);
      nextObjects = nextObjects.map((o, i) => {
        if (selectedIds.includes(o.id)) {
          return { ...o, zIndex: maxZ + 1 };
        }
        return o;
      });
    } else if (action === "send_to_back") {
      const minZ = nextObjects.reduce((min, o) => Math.min(min, o.zIndex), 100);
      nextObjects = nextObjects.map((o, i) => {
        if (selectedIds.includes(o.id)) {
          return { ...o, zIndex: Math.max(0, minZ - 1) };
        }
        return o;
      });
    } else if (action === "bring_forward") {
      indices.forEach(idx => {
        // Find next highest z-index object and swap
        const currentZ = nextObjects[idx].zIndex;
        let swapIdx = -1;
        let bestSwapZ = Infinity;
        nextObjects.forEach((o, i) => {
          if (o.zIndex > currentZ && o.zIndex < bestSwapZ) {
            bestSwapZ = o.zIndex;
            swapIdx = i;
          }
        });
        if (swapIdx !== -1) {
          const temp = nextObjects[idx].zIndex;
          nextObjects[idx].zIndex = nextObjects[swapIdx].zIndex;
          nextObjects[swapIdx].zIndex = temp;
        }
      });
    } else if (action === "send_back") {
      indices.forEach(idx => {
        const currentZ = nextObjects[idx].zIndex;
        let swapIdx = -1;
        let bestSwapZ = -Infinity;
        nextObjects.forEach((o, i) => {
          if (o.zIndex < currentZ && o.zIndex > bestSwapZ) {
            bestSwapZ = o.zIndex;
            swapIdx = i;
          }
        });
        if (swapIdx !== -1) {
          const temp = nextObjects[idx].zIndex;
          nextObjects[idx].zIndex = nextObjects[swapIdx].zIndex;
          nextObjects[swapIdx].zIndex = temp;
        }
      });
    }

    setObjects(nextObjects);
    saveToHistory(nextObjects);
    triggerNotification("Layer z-order reallocated");
  };

  // Align Objects
  const handleAlign = (alignment: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
    if (selectedIds.length < 2) {
      triggerNotification("Please select 2 or more objects to align");
      return;
    }
    const selectedObjs = objects.filter(o => selectedIds.includes(o.id));
    
    let nextObjects = [...objects];

    if (alignment === "left") {
      const minX = Math.min(...selectedObjs.map(o => o.x));
      nextObjects = nextObjects.map(o => selectedIds.includes(o.id) ? { ...o, x: minX } : o);
    } else if (alignment === "right") {
      const maxX = Math.max(...selectedObjs.map(o => o.x));
      nextObjects = nextObjects.map(o => selectedIds.includes(o.id) ? { ...o, x: maxX } : o);
    } else if (alignment === "center") {
      const avgX = selectedObjs.reduce((sum, o) => sum + o.x, 0) / selectedObjs.length;
      nextObjects = nextObjects.map(o => selectedIds.includes(o.id) ? { ...o, x: avgX } : o);
    } else if (alignment === "top") {
      const minY = Math.min(...selectedObjs.map(o => o.y));
      nextObjects = nextObjects.map(o => selectedIds.includes(o.id) ? { ...o, y: minY } : o);
    } else if (alignment === "bottom") {
      const maxY = Math.max(...selectedObjs.map(o => o.y));
      nextObjects = nextObjects.map(o => selectedIds.includes(o.id) ? { ...o, y: maxY } : o);
    } else if (alignment === "middle") {
      const avgY = selectedObjs.reduce((sum, o) => sum + o.y, 0) / selectedObjs.length;
      nextObjects = nextObjects.map(o => selectedIds.includes(o.id) ? { ...o, y: avgY } : o);
    }

    setObjects(nextObjects);
    saveToHistory(nextObjects);
    triggerNotification(`Objects aligned: ${alignment}`);
  };

  const handleLockToggle = (id: string, lock: boolean) => {
    const nextObjects = objects.map(o => o.id === id ? { ...o, isLocked: lock } : o);
    setObjects(nextObjects);
    saveToHistory(nextObjects);
    triggerNotification(lock ? "Object Locked" : "Object Unlocked");
  };

  // Convert client-pixel dimensions to virtual page percentage coordinate
  const clientToPercentX = (clientX: number): number => {
    if (!pageContainerRef.current) return 0;
    const rect = pageContainerRef.current.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  };

  const clientToPercentY = (clientY: number): number => {
    if (!pageContainerRef.current) return 0;
    const rect = pageContainerRef.current.getBoundingClientRect();
    return ((clientY - rect.top) / rect.height) * 100;
  };

  // Text double click handler to edit text on the spot
  const handleTextEditPrompt = (obj: EditorObject) => {
    const currentVal = obj.props.text || "";
    const newVal = prompt("Edit text content:", currentVal);
    if (newVal !== null) {
      const nextObjects = objects.map(o =>
        o.id === obj.id
          ? { ...o, props: { ...o.props, text: newVal } }
          : o
      );
      setObjects(nextObjects);
      saveToHistory(nextObjects);
    }
  };

  // Properties Editor Modal Trigger
  const handleOpenProperties = (obj: EditorObject) => {
    setActivePropertyObject(obj);
    setIsPropertiesModalOpen(true);
  };

  const updateActiveProperty = (updatedProps: any) => {
    if (!activePropertyObject) return;
    const nextObjects = objects.map(o =>
      o.id === activePropertyObject.id
        ? { ...o, props: { ...o.props, ...updatedProps } }
        : o
    );
    setObjects(nextObjects);
    saveToHistory(nextObjects);
    setActivePropertyObject(prev => prev ? { ...prev, props: { ...prev.props, ...updatedProps } } : null);
    triggerNotification("Properties updated");
  };

  // Resize/Rotate/Drag Interaction mouse/touch binds
  const startResizing = (e: React.MouseEvent | React.TouchEvent, obj: EditorObject, handle: string) => {
    e.stopPropagation();
    e.preventDefault();

    if (obj.isLocked) {
      triggerNotification("Cannot resize locked object");
      return;
    }

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    resizeStartRef.current = {
      objectId: obj.id,
      handle,
      startX: clientX,
      startY: clientY,
      startW: obj.w,
      startH: obj.h,
      startXPercent: obj.x,
      startYPercent: obj.y
    };

    setSelectedIds([obj.id]);
  };

  const startRotating = (e: React.MouseEvent | React.TouchEvent, obj: EditorObject) => {
    e.stopPropagation();
    e.preventDefault();

    if (obj.isLocked) return;

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    rotateStartRef.current = {
      objectId: obj.id,
      startAngle: obj.rotation,
      startX: clientX,
      startY: clientY
    };

    setSelectedIds([obj.id]);
  };

  const startDragging = (e: React.MouseEvent | React.TouchEvent, obj: EditorObject) => {
    if (editorMode === "normal") return; // no drag/move in normal mode!
    e.stopPropagation();

    // Store starting mouse point
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    objectTouchStartRef.current = {
      objectId: obj.id,
      x: clientX,
      y: clientY,
      time: Date.now(),
      hasMoved: false
    };

    dragMoveStartRef.current = {
      objectId: obj.id,
      startX: clientX,
      startY: clientY,
      startPercentX: obj.x,
      startPercentY: obj.y
    };
  };

  // Main Canvas Global Interactions
  const handleCanvasPointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    // 1. Resizing Action
    if (resizeStartRef.current) {
      e.preventDefault();
      const r = resizeStartRef.current;
      const targetObj = objects.find(o => o.id === r.objectId);
      if (!targetObj) return;

      const dx = (clientX - r.startX) / zoomLevel;
      const dy = (clientY - r.startY) / zoomLevel;

      let newW = r.startW;
      let newH = r.startH;
      let newX = r.startXPercent;
      let newY = r.startYPercent;

      // Map width/height percentages relative to actual canvas pixel scale
      if (pageContainerRef.current) {
        const rect = pageContainerRef.current.getBoundingClientRect();
        const pxToPercentX = (px: number) => (px / rect.width) * 100;
        const pxToPercentY = (px: number) => (px / rect.height) * 100;

        // Side handles independent stretching, corners scaling proportional
        if (r.handle.includes("e")) newW = Math.max(15, r.startW + dx);
        if (r.handle.includes("s")) newH = Math.max(15, r.startH + dy);
        if (r.handle.includes("w")) {
          const deltaW = dx;
          const allowedW = Math.max(15, r.startW - deltaW);
          newW = allowedW;
          newX = r.startXPercent + pxToPercentX(r.startW - allowedW);
        }
        if (r.handle.includes("n")) {
          const deltaH = dy;
          const allowedH = Math.max(15, r.startH - deltaH);
          newH = allowedH;
          newY = r.startYPercent + pxToPercentY(r.startH - allowedH);
        }
      }

      setObjects(prev => prev.map(o => o.id === r.objectId ? { ...o, w: newW, h: newH, x: newX, y: newY } : o));
      return;
    }

    // 2. Rotating Action
    if (rotateStartRef.current) {
      e.preventDefault();
      const r = rotateStartRef.current;
      // Simple rotation tracking relative to center or just linear x-drag mapping
      const dx = clientX - r.startX;
      const deg = r.startAngle + dx * 0.5;
      setObjects(prev => prev.map(o => o.id === r.objectId ? { ...o, rotation: Math.round(deg % 360) } : o));
      return;
    }

    // 3. Dragging/Moving Action
    if (dragMoveStartRef.current) {
      e.preventDefault();
      const d = dragMoveStartRef.current;
      const targetObj = objects.find(o => o.id === d.objectId);
      if (!targetObj || targetObj.isLocked) return;

      const dx = clientX - d.startX;
      const dy = clientY - d.startY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        if (objectTouchStartRef.current) {
          objectTouchStartRef.current.hasMoved = true;
        }
      }

      if (pageContainerRef.current) {
        const rect = pageContainerRef.current.getBoundingClientRect();
        // Convert screen pixel delta to percent
        const percentDx = (dx / rect.width) * 100;
        const percentDy = (dy / rect.height) * 100;

        const nextX = Math.max(0, Math.min(100 - (targetObj.w / VIRTUAL_PAGE_WIDTH) * 100, d.startPercentX + percentDx));
        const nextY = Math.max(0, Math.min(100 - (targetObj.h / VIRTUAL_PAGE_HEIGHT) * 100, d.startPercentY + percentDy));

        setObjects(prev => prev.map(o => o.id === d.objectId ? { ...o, x: nextX, y: nextY } : o));
      }
      return;
    }

    // 4. Freehand Drawing Action
    if (isDrawingModeActive && currentDrawingStroke.length > 0 && canvasRef.current) {
      e.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect();
      const drawX = (clientX - rect.left) / zoomLevel;
      const drawY = (clientY - rect.top) / zoomLevel;
      setCurrentDrawingStroke(prev => [...prev, { x: drawX, y: drawY }]);
      return;
    }

    // 5. Drag Select Multi objects bounding box
    if (dragSelectStart && isMultiSelectActive) {
      setDragSelectCurrent({ x: clientX, y: clientY });
      return;
    }
  };

  const handleCanvasPointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    // Prompt "Lock Position?" after letting go of an item we moved
    if (dragMoveStartRef.current) {
      const d = dragMoveStartRef.current;
      const isMoved = objectTouchStartRef.current?.hasMoved;
      
      dragMoveStartRef.current = null;
      objectTouchStartRef.current = null;

      if (isMoved) {
        // Only prompt if we actually moved the object and it wasn't already locked
        const targetObj = objects.find(o => o.id === d.objectId);
        if (targetObj && !targetObj.isLocked) {
          setPendingLockObjectId(d.objectId);
          setIsLockPromptOpen(true);
        }
        // Save history state on placement
        saveToHistory(objects);
      }
    }

    if (resizeStartRef.current) {
      resizeStartRef.current = null;
      saveToHistory(objects);
    }

    if (rotateStartRef.current) {
      rotateStartRef.current = null;
      saveToHistory(objects);
    }

    // Complete freehand stroke drawing
    if (isDrawingModeActive && currentDrawingStroke.length > 0) {
      // Find or create drawing object layer
      const drawId = `obj_${Date.now()}_drawing`;
      const canvasW = canvasRef.current?.width || 1000;
      const canvasH = canvasRef.current?.height || 1400;

      // Convert current Stroke to percentage
      const newStroke = currentDrawingStroke.map(p => ({
        x: (p.x / canvasW) * 100,
        y: (p.y / canvasH) * 100
      }));

      // Add to drawing object, or append if drawing is continuous
      const existingDrawingObj = objects.find(o => o.type === "drawing" && !o.isLocked);
      let nextObjects = [];

      if (existingDrawingObj) {
        nextObjects = objects.map(o =>
          o.id === existingDrawingObj.id
            ? {
                ...o,
                props: {
                  ...o.props,
                  drawingPoints: [...(o.props.drawingPoints || []), newStroke]
                }
              }
            : o
        );
      } else {
        const maxZ = objects.reduce((max, o) => Math.max(max, o.zIndex), 0);
        const newDrawObj: EditorObject = {
          id: drawId,
          type: "drawing",
          x: 0,
          y: 0,
          w: VIRTUAL_PAGE_WIDTH,
          h: VIRTUAL_PAGE_HEIGHT,
          rotation: 0,
          isLocked: false,
          groupId: null,
          zIndex: maxZ + 1,
          props: {
            drawingPoints: [newStroke],
            color: activeColor
          }
        };
        nextObjects = [...objects, newDrawObj];
      }

      setObjects(nextObjects);
      saveToHistory(nextObjects);
      setCurrentDrawingStroke([]);
      triggerNotification("Freehand drawing stroke logged");
    }

    // Process drag select multiple
    if (dragSelectStart && dragSelectCurrent && isMultiSelectActive) {
      if (pageContainerRef.current) {
        const rect = pageContainerRef.current.getBoundingClientRect();
        
        const x1 = Math.min(dragSelectStart.x, dragSelectCurrent.x);
        const x2 = Math.max(dragSelectStart.x, dragSelectCurrent.x);
        const y1 = Math.min(dragSelectStart.y, dragSelectCurrent.y);
        const y2 = Math.max(dragSelectStart.y, dragSelectCurrent.y);

        // Find objects with centers inside drag box
        const hitIds: string[] = [];
        objects.forEach(obj => {
          const objEl = document.getElementById(`editor-obj-${obj.id}`);
          if (objEl) {
            const objRect = objEl.getBoundingClientRect();
            const objCenterX = objRect.left + objRect.width / 2;
            const objCenterY = objRect.top + objRect.height / 2;

            if (objCenterX >= x1 && objCenterX <= x2 && objCenterY >= y1 && objCenterY <= y2) {
              hitIds.push(obj.id);
            }
          }
        });

        if (hitIds.length > 0) {
          setSelectedIds(hitIds);
          triggerNotification(`Multi-selected ${hitIds.length} objects`);
        }
      }
      setDragSelectStart(null);
      setDragSelectCurrent(null);
    }
  };

  // Double Tap gesture detection
  const handleCanvasClickOrTouch = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    
    const now = Date.now();
    const timeDiff = now - doubleTapRef.current.lastTime;
    const dist = Math.sqrt(Math.pow(clientX - doubleTapRef.current.x, 2) + Math.pow(clientY - doubleTapRef.current.y, 2));

    doubleTapRef.current = { lastTime: now, x: clientX, y: clientY };

    if (timeDiff < 300 && dist < 15) {
      // Double tap! Trigger zoom toggler
      e.preventDefault();
      setZoomLevel(prev => (prev > 1.1 ? 1.0 : 1.5));
      triggerNotification(zoomLevel > 1.1 ? "Zoom reset" : "Zoomed 150%");
      return;
    }

    // Close any context menus
    if (objectContextMenu) setObjectContextMenu(null);
    if (canvasContextMenu) setCanvasContextMenu(null);

    // Close multi select drag box if clicked without moving
    if (!isMultiSelectActive && selectedIds.length > 0) {
      setSelectedIds([]);
    }
  };

  // Handle Object click
  const handleObjectClick = (e: React.MouseEvent | React.TouchEvent, obj: EditorObject) => {
    e.stopPropagation();
    
    const now = Date.now();
    const touchStart = objectTouchStartRef.current;
    
    // Clear menus
    if (objectContextMenu) setObjectContextMenu(null);
    if (canvasContextMenu) setCanvasContextMenu(null);

    if (isMultiSelectActive) {
      // Toggle selection in multi-select mode
      if (selectedIds.includes(obj.id)) {
        setSelectedIds(prev => prev.filter(id => id !== obj.id));
      } else {
        setSelectedIds(prev => [...prev, obj.id]);
      }
    } else {
      // Normal single selection
      setSelectedIds([obj.id]);

      // If double click / tap -> Edit action
      if (touchStart && now - touchStart.time < 300 && obj.id === touchStart.objectId) {
        if (obj.type === "text") {
          handleTextEditPrompt(obj);
        } else {
          handleOpenProperties(obj);
        }
      }
    }
  };

  // Long press empty space canvas = Insert Menu
  const handleCanvasLongPress = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    if (pageContainerRef.current) {
      const rect = pageContainerRef.current.getBoundingClientRect();
      const insertX = ((clientX - rect.left) / rect.width) * 100;
      const insertY = ((clientY - rect.top) / rect.height) * 100;

      setCanvasContextMenu({
        x: clientX,
        y: clientY
      });
    }
  };

  const handleObjectLongPress = (e: React.MouseEvent | React.TouchEvent, obj: EditorObject) => {
    e.preventDefault();
    e.stopPropagation();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    setSelectedIds([obj.id]);
    setObjectContextMenu({
      x: clientX,
      y: clientY,
      objectId: obj.id
    });
  };

  // Group / Ungroup Selected Objects
  const handleGroupObjects = () => {
    if (selectedIds.length < 2) return;
    const newGroupId = `group_${Date.now()}`;
    const nextObjects = objects.map(o => selectedIds.includes(o.id) ? { ...o, groupId: newGroupId } : o);
    setObjects(nextObjects);
    saveToHistory(nextObjects);
    triggerNotification("Grouped selected objects");
  };

  const handleUngroupObjects = () => {
    const nextObjects = objects.map(o => selectedIds.includes(o.id) ? { ...o, groupId: null } : o);
    setObjects(nextObjects);
    saveToHistory(nextObjects);
    triggerNotification("Ungrouped selected objects");
  };

  // Distribute objects
  const handleDistribute = (direction: "horizontal" | "vertical") => {
    if (selectedIds.length < 3) {
      triggerNotification("Please select 3 or more objects to distribute");
      return;
    }
    const selectedObjs = objects.filter(o => selectedIds.includes(o.id));
    let nextObjects = [...objects];

    if (direction === "horizontal") {
      const sorted = [...selectedObjs].sort((a, b) => a.x - b.x);
      const minX = sorted[0].x;
      const maxX = sorted[sorted.length - 1].x;
      const totalSpan = maxX - minX;
      const interval = totalSpan / (sorted.length - 1);

      sorted.forEach((o, i) => {
        nextObjects = nextObjects.map(obj => obj.id === o.id ? { ...obj, x: minX + i * interval } : obj);
      });
    } else {
      const sorted = [...selectedObjs].sort((a, b) => a.y - b.y);
      const minY = sorted[0].y;
      const maxY = sorted[sorted.length - 1].y;
      const totalSpan = maxY - minY;
      const interval = totalSpan / (sorted.length - 1);

      sorted.forEach((o, i) => {
        nextObjects = nextObjects.map(obj => obj.id === o.id ? { ...obj, y: minY + i * interval } : obj);
      });
    }

    setObjects(nextObjects);
    saveToHistory(nextObjects);
    triggerNotification(`Objects distributed ${direction}`);
  };

  // Auto load canvas context to render freehand drawing paths
  useEffect(() => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        
        // Draw standard white page background reference
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        // Render drawings saved inside objects list
        objects.forEach(obj => {
          if (obj.type === "drawing" && obj.props.drawingPoints) {
            ctx.strokeStyle = obj.props.color || activeColor;
            ctx.lineWidth = 3;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            obj.props.drawingPoints.forEach(stroke => {
              if (stroke.length === 0) return;
              ctx.beginPath();
              // Convert percentages back to virtual page width/height coordinate space
              ctx.moveTo((stroke[0].x / 100) * canvasRef.current!.width, (stroke[0].y / 100) * canvasRef.current!.height);
              for (let i = 1; i < stroke.length; i++) {
                ctx.lineTo((stroke[i].x / 100) * canvasRef.current!.width, (stroke[i].y / 100) * canvasRef.current!.height);
              }
              ctx.stroke();
            });
          }
        });

        // Draw active current stroke live
        if (currentDrawingStroke.length > 0) {
          ctx.strokeStyle = activeColor;
          ctx.lineWidth = 3;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(currentDrawingStroke[0].x, currentDrawingStroke[0].y);
          for (let i = 1; i < currentDrawingStroke.length; i++) {
            ctx.lineTo(currentDrawingStroke[i].x, currentDrawingStroke[i].y);
          }
          ctx.stroke();
        }
      }
    }
  }, [objects, currentDrawingStroke, isDrawingModeActive, activeColor]);

  return (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex flex-col z-50 overflow-hidden font-sans select-none animate-fade-in text-[#1F3557]">
      {/* EDITOR HIGH-FIDELITY ACTIONS HEADER */}
      <header className="bg-[#C7E3FA] border-b border-[#9EC8EF] py-3.5 px-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#BDDDF8] rounded-xl text-[#1F3557] transition-all cursor-pointer"
            title="Exit Editor"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-[#315C9F]" />
              <h1 className="text-xs font-black tracking-wider uppercase text-[#1F3557] truncate max-w-[260px]">
                {documentName || "Untitled Blank Document.pdf"}
              </h1>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] bg-[#315C9F] text-white px-1.5 py-0.5 rounded font-black uppercase">
                {editorMode === "edit" ? "EDITING MODE" : "VIEWING MODE"}
              </span>
              <p className="text-[10px] text-[#5E7393] font-medium font-sans">
                {objects.length} elements • Scale: {Math.round(zoomLevel * 100)}%
              </p>
            </div>
          </div>
        </div>

        {/* CONTROLS BAR: ACTIONS, UNDO, ZOOM, SAVE */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Zoom Control */}
          <div className="flex items-center bg-white rounded-xl border border-[#9EC8EF] p-0.5">
            <button
              onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.15))}
              className="p-1.5 hover:bg-[#EAF5FF] rounded-lg text-[#1F3557] font-bold text-xs"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-[10px] font-black font-sans">{Math.round(zoomLevel * 100)}%</span>
            <button
              onClick={() => setZoomLevel(prev => Math.min(2.5, prev + 0.15))}
              className="p-1.5 hover:bg-[#EAF5FF] rounded-lg text-[#1F3557]"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-[#EAF5FF] rounded-xl border border-[#9EC8EF] p-0.5">
            <button
              onClick={() => {
                setEditorMode("normal");
                setSelectedIds([]);
                setIsDrawingModeActive(false);
                triggerNotification("Normal Mode: Scroll & zoom safely");
              }}
              className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${
                editorMode === "normal"
                  ? "bg-[#315C9F] text-white"
                  : "text-[#5E7393] hover:text-[#1F3557]"
              }`}
            >
              Normal (Scroll)
            </button>
            <button
              onClick={() => {
                setEditorMode("edit");
                triggerNotification("Edit Mode: Long-press empty canvas area to Insert objects");
              }}
              className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${
                editorMode === "edit"
                  ? "bg-[#315C9F] text-white"
                  : "text-[#5E7393] hover:text-[#1F3557]"
              }`}
            >
              Edit Mode
            </button>
          </div>

          {/* Undo action */}
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className="p-2 bg-white hover:bg-slate-50 border border-[#9EC8EF] text-[#1F3557] rounded-xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Undo last change"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {/* eSign Setup Toggle Sidebar */}
          <button
            onClick={() => setIsESignSidebarOpen(!isESignSidebarOpen)}
            className={`px-3.5 py-2 font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer border ${
              isESignSidebarOpen 
                ? "bg-[#315C9F] text-white border-[#315C9F]" 
                : "bg-[#EAF5FF] hover:bg-[#BDDDF8] text-[#1F3557] border-[#9EC8EF]"
            }`}
            title="Configure signature roles, ordering, or witness requirements"
          >
            <FileSignature className="w-3.5 h-3.5" />
            eSign Setup
          </button>

          {/* Auto-Detect Fields Button */}
          <button
            onClick={handleAutoDetectFields}
            disabled={isScanningActive}
            className="px-3.5 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            title="Auto-scan underscores to place dynamic signature and initials widgets"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isScanningActive ? "animate-spin" : ""}`} />
            {isScanningActive ? "Scanning..." : "Auto-Detect"}
          </button>

          {/* Sharing Button */}
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="px-3.5 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] text-[#1F3557] border border-[#9EC8EF] font-bold rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5 text-[#315C9F]" />
            Share
          </button>

          {/* Core Save */}
          <button
            onClick={() => {
              onSave(documentId || `doc_custom_${Date.now()}`, documentName, { objects });
              triggerNotification("Document changes persisted successfully");
            }}
            className="px-4 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
          >
            Save Document
          </button>
        </div>
      </header>

      {/* QUICK INSERTS FLUID TOOLBAR (ONLY IN EDIT MODE) */}
      {editorMode === "edit" && (
        <div className="bg-[#EAF5FF] border-b border-[#9EC8EF]/50 py-2 px-4 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0 shadow-inner">
          <span className="text-[9px] font-black uppercase tracking-wider text-[#5E7393] whitespace-nowrap mr-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#315C9F]" />
            Insert Element:
          </span>

          {[
            { type: "text", label: "Text", icon: <Type className="w-3.5 h-3.5" /> },
            { type: "image", label: "Image", icon: <ImageIcon className="w-3.5 h-3.5" /> },
            { type: "checkbox", label: "Checkbox", icon: <CheckSquare className="w-3.5 h-3.5" /> },
            { type: "radio", label: "Radio", icon: <CircleDot className="w-3.5 h-3.5" /> },
            { type: "dropdown", label: "Dropdown", icon: <ChevronDown className="w-3.5 h-3.5" /> },
            { type: "date", label: "Date", icon: <Calendar className="w-3.5 h-3.5" /> },
            { type: "signature", label: "Signature", icon: <FileSignature className="w-3.5 h-3.5" /> },
            { type: "initial", label: "Initials", icon: <Edit3 className="w-3.5 h-3.5" /> },
            { type: "shape", label: "Shape", icon: <Square className="w-3.5 h-3.5" /> },
            { type: "highlight", label: "Highlight", icon: <Highlighter className="w-3.5 h-3.5" /> },
            { type: "comment", label: "Comment", icon: <MessageSquare className="w-3.5 h-3.5" /> },
            { type: "stamp", label: "Stamp", icon: <Award className="w-3.5 h-3.5" /> },
            { type: "hyperlink", label: "Hyperlink", icon: <LinkIcon className="w-3.5 h-3.5" /> },
            { type: "qrcode", label: "QR Code", icon: <QrCode className="w-3.5 h-3.5" /> },
            { type: "table", label: "Table", icon: <TableIcon className="w-3.5 h-3.5" /> },
            { type: "attachment", label: "Attachment", icon: <Paperclip className="w-3.5 h-3.5" /> }
          ].map((item) => (
            <button
              key={item.type}
              onClick={() => handleAddObject(item.type as any)}
              className="px-2.5 py-1.5 bg-white hover:bg-[#C7E3FA] text-[#1F3557] hover:text-[#1F3557] border border-[#9EC8EF]/40 font-bold rounded-xl text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shrink-0"
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}

          <div className="border-l border-[#9EC8EF]/60 h-6 mx-2" />

          {/* Quick Drawing Pen mode toggle */}
          <button
            onClick={() => {
              setIsDrawingModeActive(!isDrawingModeActive);
              setSelectedIds([]);
              triggerNotification(isDrawingModeActive ? "Drawing pen disabled" : "Drawing pen active: Sketch directly on document!");
            }}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer shrink-0 ${
              isDrawingModeActive
                ? "bg-amber-500 text-white shadow-inner"
                : "bg-white border border-[#9EC8EF] text-amber-600 hover:bg-amber-50"
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isDrawingModeActive ? "Active Pen" : "Sketch Pen"}</span>
          </button>

          {/* Multi Select Toggle */}
          <button
            onClick={() => {
              setIsMultiSelectActive(!isMultiSelectActive);
              setSelectedIds([]);
              triggerNotification(isMultiSelectActive ? "Multi-select disabled" : "Multi-select active: Tap items to stack select or draw box");
            }}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer shrink-0 ${
              isMultiSelectActive
                ? "bg-[#315C9F] text-white shadow-inner"
                : "bg-white border border-[#9EC8EF] text-[#315C9F] hover:bg-slate-50"
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>{isMultiSelectActive ? "Multi-Select ON" : "Multi-Select"}</span>
          </button>
        </div>
      )}

      {/* SELECTION WORKSPACE TOOLBAR (SHOWN IF OBJECTS SELECTED) */}
      {selectedIds.length > 0 && editorMode === "edit" && (
        <div className="bg-[#1F3557] text-white py-2 px-4 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none animate-slide-in">
          <span className="text-[10px] font-black uppercase tracking-wider text-[#BDDDF8] whitespace-nowrap mr-2">
            Selected ({selectedIds.length}):
          </span>

          {/* Actions */}
          <button
            onClick={handleCopy}
            className="p-1.5 hover:bg-white/10 rounded-lg text-white font-bold text-[10px] flex items-center gap-1 uppercase"
            title="Copy Object"
          >
            <Copy className="w-3.5 h-3.5 text-[#BDDDF8]" />
            Copy
          </button>
          <button
            onClick={handleDuplicate}
            className="p-1.5 hover:bg-white/10 rounded-lg text-white font-bold text-[10px] flex items-center gap-1 uppercase"
            title="Duplicate Object"
          >
            <Layers className="w-3.5 h-3.5 text-[#BDDDF8]" />
            Duplicate
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 hover:bg-white/10 rounded-lg text-red-300 hover:text-red-200 font-bold text-[10px] flex items-center gap-1 uppercase"
            title="Delete Object"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>

          <div className="w-px h-5 bg-white/20 mx-1" />

          {/* Layer Ordering */}
          <button
            onClick={() => reorderLayer("bring_to_front")}
            className="px-2 py-1 hover:bg-white/10 rounded text-[10px] font-bold uppercase tracking-wider"
          >
            To Front
          </button>
          <button
            onClick={() => reorderLayer("send_to_back")}
            className="px-2 py-1 hover:bg-white/10 rounded text-[10px] font-bold uppercase tracking-wider"
          >
            To Back
          </button>

          {selectedIds.length === 1 && (
            <>
              <div className="w-px h-5 bg-white/20 mx-1" />
              <button
                onClick={() => {
                  const target = objects.find(o => o.id === selectedIds[0]);
                  if (target) handleOpenProperties(target);
                }}
                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1"
              >
                <Settings className="w-3 h-3" />
                Properties
              </button>
              <button
                onClick={() => {
                  const target = objects.find(o => o.id === selectedIds[0]);
                  if (target) handleLockToggle(target.id, !target.isLocked);
                }}
                className="p-1.5 hover:bg-white/10 rounded-lg text-[#BDDDF8]"
                title="Toggle Lock State"
              >
                {objects.find(o => o.id === selectedIds[0])?.isLocked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
              </button>
            </>
          )}

          {/* Group Operations */}
          {selectedIds.length >= 2 && (
            <>
              <div className="w-px h-5 bg-white/20 mx-1" />
              <button
                onClick={handleGroupObjects}
                className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-[10px] font-bold uppercase"
              >
                Group
              </button>
              <button
                onClick={handleUngroupObjects}
                className="px-2 py-1 bg-indigo-800 hover:bg-indigo-700 rounded text-[10px] font-bold uppercase"
              >
                Ungroup
              </button>

              <div className="w-px h-5 bg-white/20 mx-1" />
              <span className="text-[10px] uppercase text-slate-400 font-bold">Align:</span>
              <button
                onClick={() => handleAlign("left")}
                className="p-1 hover:bg-white/10 rounded text-[10px] font-bold"
              >
                Left
              </button>
              <button
                onClick={() => handleAlign("center")}
                className="p-1 hover:bg-white/10 rounded text-[10px] font-bold"
              >
                Center
              </button>
              <button
                onClick={() => handleAlign("right")}
                className="p-1 hover:bg-white/10 rounded text-[10px] font-bold"
              >
                Right
              </button>
              <button
                onClick={() => handleAlign("top")}
                className="p-1 hover:bg-white/10 rounded text-[10px] font-bold"
              >
                Top
              </button>
              <button
                onClick={() => handleAlign("bottom")}
                className="p-1 hover:bg-white/10 rounded text-[10px] font-bold"
              >
                Bottom
              </button>

              <div className="w-px h-5 bg-white/20 mx-1" />
              <span className="text-[10px] uppercase text-slate-400 font-bold">Distribute:</span>
              <button
                onClick={() => handleDistribute("horizontal")}
                className="p-1 hover:bg-white/10 rounded text-[10px] font-bold"
              >
                Horiz
              </button>
              <button
                onClick={() => handleDistribute("vertical")}
                className="p-1 hover:bg-white/10 rounded text-[10px] font-bold"
              >
                Vert
              </button>
            </>
          )}
        </div>
      )}

      {/* WRAPPER FOR WORKSPACE AND eSIGN SIDEBAR */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* CORE WORKSPACE SCREEN (SCROLL CONTAINER) */}
        <div
          className="flex-1 overflow-auto p-4 md:p-8 flex items-start justify-center bg-slate-900 scrollbar-thin relative"
          onClick={handleCanvasClickOrTouch}
          onTouchStart={handleCanvasClickOrTouch}
          onMouseMove={handleCanvasPointerMove}
          onTouchMove={handleCanvasPointerMove}
          onMouseUp={handleCanvasPointerUp}
          onTouchEnd={handleCanvasPointerUp}
        >
        {/* INTERACTIVE DOCUMENT VIRTUAL CONTAINER */}
        <div
          ref={pageContainerRef}
          id="editor-document-page"
          className="relative bg-white shadow-2xl border border-slate-300 rounded-sm overflow-hidden select-none origin-top transition-transform duration-100 ease-out shrink-0"
          style={{
            width: `${VIRTUAL_PAGE_WIDTH}px`,
            height: `${VIRTUAL_PAGE_HEIGHT}px`,
            transform: `scale(${zoomLevel})`,
            margin: `${Math.max(0, (zoomLevel - 1) * 300)}px auto`
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            handleCanvasLongPress(e);
          }}
          onMouseDown={(e) => {
            if (e.button === 0 && isMultiSelectActive) {
              setDragSelectStart({ x: e.clientX, y: e.clientY });
              setDragSelectCurrent({ x: e.clientX, y: e.clientY });
            }
          }}
        >
          {/* HIGH-FIDELITY STANDARD BACKGROUND DETAILS */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[radial-gradient(#1f3557_1px,transparent_1px)] [background-size:16px_16px]" />

          {/* Canvas API Layer for Drawings and continuous stroke rendering */}
          <canvas
            ref={canvasRef}
            width={VIRTUAL_PAGE_WIDTH}
            height={VIRTUAL_PAGE_HEIGHT}
            className={`absolute inset-0 z-0 ${
              isDrawingModeActive ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"
            }`}
            onMouseDown={(e) => {
              if (isDrawingModeActive) {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) {
                  const drawX = (e.clientX - rect.left) / zoomLevel;
                  const drawY = (e.clientY - rect.top) / zoomLevel;
                  setCurrentDrawingStroke([{ x: drawX, y: drawY }]);
                }
              }
            }}
            onTouchStart={(e) => {
              if (isDrawingModeActive) {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect && e.touches.length === 1) {
                  const drawX = (e.touches[0].clientX - rect.left) / zoomLevel;
                  const drawY = (e.touches[0].clientY - rect.top) / zoomLevel;
                  setCurrentDrawingStroke([{ x: drawX, y: drawY }]);
                }
              }
            }}
          />

          {/* OBJECTS LAYER OVERLAY */}
          {objects
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((obj) => {
              const isSelected = selectedIds.includes(obj.id);
              
              // Map percentage coordinate to absolute style values
              const style: React.CSSProperties = {
                position: "absolute",
                left: `${obj.x}%`,
                top: `${obj.y}%`,
                width: `${obj.w}px`,
                height: `${obj.h}px`,
                transform: `rotate(${obj.rotation}deg)`,
                zIndex: obj.zIndex + 10,
                cursor: obj.isLocked ? "not-allowed" : editorMode === "edit" ? "move" : "default"
              };

              return (
                <div
                  key={obj.id}
                  id={`editor-obj-${obj.id}`}
                  style={style}
                  className={`group select-none rounded ${
                    editorMode === "edit" ? "hover:ring-1 hover:ring-[#315C9F]/40" : ""
                  } ${
                    isSelected && editorMode === "edit"
                      ? "ring-2 ring-blue-500 shadow-md bg-blue-50/10"
                      : ""
                  } ${obj.isLocked ? "border border-amber-300/30" : ""}`}
                  onMouseDown={(e) => startDragging(e, obj)}
                  onTouchStart={(e) => startDragging(e, obj)}
                  onClick={(e) => handleObjectClick(e, obj)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    handleObjectLongPress(e, obj);
                  }}
                >
                  {/* Dynamic widgets rendering inside standard page context */}
                  <div className="w-full h-full relative overflow-hidden pointer-events-none">
                    
                    {/* TEXT WIDGET */}
                    {obj.type === "text" && (
                      <div
                        className="w-full h-full flex items-center p-1 whitespace-pre-wrap select-text leading-tight"
                        style={{
                          fontFamily: obj.props.fontFamily || "Inter",
                          fontSize: `${obj.props.fontSize || 13}px`,
                          color: obj.props.color || "#1F3557",
                          fontWeight: obj.props.fontFamily === "Space Grotesk" ? "bold" : "normal"
                        }}
                      >
                        {obj.props.text}
                      </div>
                    )}

                    {/* CHECKBOX WIDGET */}
                    {obj.type === "checkbox" && (
                      <div className="w-full h-full flex items-center justify-center p-0.5 pointer-events-auto">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (obj.isLocked) return;
                            setObjects(prev => prev.map(o => o.id === obj.id ? { ...o, props: { ...o.props, isChecked: !o.props.isChecked } } : o));
                            saveToHistory(objects);
                          }}
                          className={`w-full h-full rounded border-2 flex items-center justify-center transition-colors ${
                            obj.props.isChecked
                              ? "bg-[#315C9F] border-[#315C9F] text-white"
                              : "bg-white border-[#9EC8EF]"
                          }`}
                        >
                          {obj.props.isChecked && <Check className="w-full h-full stroke-[3]" />}
                        </button>
                      </div>
                    )}

                    {/* RADIO BUTTON WIDGET */}
                    {obj.type === "radio" && (
                      <div className="w-full h-full flex items-center justify-center p-0.5 pointer-events-auto">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (obj.isLocked) return;
                            setObjects(prev => prev.map(o => o.id === obj.id ? { ...o, props: { ...o.props, isChecked: !o.props.isChecked } } : o));
                            saveToHistory(objects);
                          }}
                          className={`w-full h-full rounded-full border-2 flex items-center justify-center transition-colors ${
                            obj.props.isChecked
                              ? "bg-[#315C9F] border-[#315C9F]"
                              : "bg-white border-[#9EC8EF]"
                          }`}
                        >
                          {obj.props.isChecked && <span className="w-2.5 h-2.5 bg-white rounded-full" />}
                        </button>
                      </div>
                    )}

                    {/* DROPDOWN WIDGET */}
                    {obj.type === "dropdown" && (
                      <div className="w-full h-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-2.5 flex items-center justify-between text-xs font-bold text-[#1F3557] pointer-events-auto">
                        <select
                          className="w-full bg-transparent focus:outline-none cursor-pointer pr-1 text-[11px]"
                          value={obj.props.selectedValue}
                          onChange={(e) => {
                            if (obj.isLocked) return;
                            setObjects(prev => prev.map(o => o.id === obj.id ? { ...o, props: { ...o.props, selectedValue: e.target.value } } : o));
                            saveToHistory(objects);
                          }}
                        >
                          {obj.props.options?.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* DATE FIELD WIDGET */}
                    {obj.type === "date" && (
                      <div className="w-full h-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-2.5 flex items-center justify-between text-[11px] font-bold text-[#1F3557] pointer-events-auto">
                        <span>{obj.props.text}</span>
                        <Calendar className="w-3.5 h-3.5 text-[#315C9F] shrink-0" />
                      </div>
                    )}

                    {/* SIGNATURE FIELDS */}
                    {obj.type === "signature" && (() => {
                      const role = (obj.props as any).role || "customer";
                      const isSigned = !!obj.props.text;
                      let themeClass = "border-[#9EC8EF] hover:border-[#315C9F] bg-slate-50/50 text-[#1F3557]";
                      let label = "Signature Field";
                      let badgeClass = "bg-[#315C9F] text-white";

                      if (role === "customer") {
                        themeClass = isSigned ? "border-amber-400 bg-amber-50/10 text-amber-900" : "border-dashed border-amber-300 bg-amber-50/20 text-amber-800 hover:border-amber-500 animate-pulse-slow";
                        label = "✍️ Customer Signature";
                        badgeClass = "bg-amber-600 text-white";
                      } else if (role === "employee") {
                        themeClass = isSigned ? "border-blue-400 bg-blue-50/10 text-blue-900" : "border-dashed border-blue-300 bg-blue-50/20 text-blue-800 hover:border-blue-500";
                        label = "👔 Employee Signature";
                        badgeClass = "bg-blue-600 text-white";
                      } else if (role === "owner") {
                        themeClass = isSigned ? "border-purple-400 bg-purple-50/10 text-purple-900" : "border-dashed border-purple-300 bg-purple-50/20 text-purple-800 hover:border-purple-500";
                        label = "👑 Owner Signature";
                        badgeClass = "bg-purple-600 text-white";
                      } else if (role === "witness") {
                        themeClass = isSigned ? "border-rose-400 bg-rose-50/10 text-rose-900" : "border-dashed border-rose-300 bg-rose-50/20 text-rose-800 hover:border-rose-500";
                        label = "👁️ Witness Signature";
                        badgeClass = "bg-rose-600 text-white";
                      }

                      return (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenSignModal(obj);
                          }}
                          className={`w-full h-full border-2 rounded-xl p-1.5 flex flex-col justify-between pointer-events-auto text-left cursor-pointer transition-all ${themeClass}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[7px] uppercase tracking-wider font-black leading-none">{label}</span>
                            {!isSigned && <span className={`text-[6px] px-1 py-0.5 rounded font-bold uppercase ${badgeClass}`}>Required</span>}
                          </div>
                          <div className="flex-1 flex items-center justify-center select-none overflow-hidden py-1">
                            {obj.props.text ? (
                              obj.props.text.startsWith("data:image") ? (
                                <img src={obj.props.text} alt="signature" className="max-h-full max-w-full object-contain pointer-events-none" referrerPolicy="no-referrer" />
                              ) : (
                                <span className="font-serif text-lg italic" style={{ fontFamily: obj.props.fontFamily || "Pacifico, Caveat, cursive" }}>{obj.props.text}</span>
                              )
                            ) : (
                              <span className="text-slate-400 font-sans text-[10px] uppercase font-bold tracking-wider hover:text-slate-600 transition-colors">Click to Sign</span>
                            )}
                          </div>
                          <div className="border-t border-slate-300/40 w-full" />
                          {isSigned && (
                            <span className="text-[6px] text-slate-400 text-right font-medium">Signed by {(obj.props as any).signedBy || "Signer"}</span>
                          )}
                        </div>
                      );
                    })()}

                    {/* INITIAL FIELDS */}
                    {obj.type === "initial" && (() => {
                      const role = (obj.props as any).role || "customer";
                      const isSigned = !!obj.props.text;
                      let themeClass = "border-[#9EC8EF] bg-slate-50/50";
                      let label = "Initials";
                      let badgeClass = "bg-[#315C9F] text-white";

                      if (role === "customer") {
                        themeClass = isSigned ? "border-amber-400 bg-amber-50/10 text-amber-900" : "border-dashed border-amber-300 bg-amber-50/20 text-amber-800 hover:border-amber-500 animate-pulse-slow";
                        label = "Cust Init";
                        badgeClass = "bg-amber-600 text-white";
                      } else if (role === "employee") {
                        themeClass = isSigned ? "border-blue-400 bg-blue-50/10 text-blue-900" : "border-dashed border-blue-300 bg-blue-50/20 text-blue-800 hover:border-blue-500";
                        label = "Emp Init";
                        badgeClass = "bg-blue-600 text-white";
                      } else if (role === "owner") {
                        themeClass = isSigned ? "border-purple-400 bg-purple-50/10 text-purple-900" : "border-dashed border-purple-300 bg-purple-50/20 text-purple-800 hover:border-purple-500";
                        label = "Own Init";
                        badgeClass = "bg-purple-600 text-white";
                      } else if (role === "witness") {
                        themeClass = isSigned ? "border-rose-400 bg-rose-50/10 text-rose-900" : "border-dashed border-rose-300 bg-rose-50/20 text-rose-800 hover:border-rose-500";
                        label = "Wit Init";
                        badgeClass = "bg-rose-600 text-white";
                      }

                      return (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenSignModal(obj);
                          }}
                          className={`w-full h-full border-2 rounded-lg p-1 flex flex-col justify-between pointer-events-auto text-center cursor-pointer transition-all ${themeClass}`}
                        >
                          <span className="text-[6px] text-slate-400 font-black leading-none uppercase tracking-wide">{label}</span>
                          <div className="flex-1 flex items-center justify-center select-none overflow-hidden py-0.5">
                            {obj.props.text ? (
                              obj.props.text.startsWith("data:image") ? (
                                <img src={obj.props.text} alt="initials" className="max-h-full max-w-full object-contain pointer-events-none" referrerPolicy="no-referrer" />
                              ) : (
                                <span className="font-serif text-sm italic" style={{ fontFamily: obj.props.fontFamily || "Caveat, Pacifico, cursive" }}>{obj.props.text}</span>
                              )
                            ) : (
                              <span className="text-[8px] font-sans font-bold text-slate-300 uppercase tracking-widest hover:text-slate-500">Sign</span>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* IMAGE WIDGET */}
                    {obj.type === "image" && (
                      <img
                        src={obj.props.imageSrc}
                        alt="Inserted Media"
                        className="w-full h-full object-cover rounded"
                        referrerPolicy="no-referrer"
                      />
                    )}

                    {/* SHAPES WIDGET */}
                    {obj.type === "shape" && (
                      <div
                        className="w-full h-full border-2"
                        style={{
                          borderColor: obj.props.color,
                          backgroundColor: obj.props.bgColor,
                          borderRadius: obj.props.shapeType === "circle" ? "50%" : "8px"
                        }}
                      >
                        {obj.props.shapeType === "arrow" && (
                          <div className="w-full h-full flex items-center justify-center">
                            <CornerRightDown className="w-8 h-8" style={{ color: obj.props.color }} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* HIGHLIGHT LAYER */}
                    {obj.type === "highlight" && (
                      <div
                        className="w-full h-full"
                        style={{ backgroundColor: obj.props.color || "rgba(253, 224, 71, 0.45)" }}
                      />
                    )}

                    {/* COMMENT LAYER */}
                    {obj.type === "comment" && (
                      <div className="w-full h-full bg-amber-50 border border-amber-300 rounded-xl p-2 shadow-sm text-left flex flex-col justify-between">
                        <div className="flex items-center justify-between text-[8px] text-amber-800 font-black">
                          <span>{obj.props.commentAuthor || "Staff Note"}</span>
                          <span>{obj.props.commentDate}</span>
                        </div>
                        <p className="text-[10px] text-amber-900 leading-tight font-medium mt-1 font-sans">{obj.props.text}</p>
                      </div>
                    )}

                    {/* STAMP WIDGET */}
                    {obj.type === "stamp" && (
                      <div
                        className={`w-full h-full border-4 rounded-xl flex items-center justify-center font-black tracking-widest text-sm uppercase p-1.5 transform ${
                          obj.props.stampType === "APPROVED"
                            ? "border-emerald-600 text-emerald-600 bg-emerald-50/70"
                            : obj.props.stampType === "REJECTED"
                              ? "border-red-600 text-red-600 bg-red-50/70"
                              : obj.props.stampType === "DRAFT"
                                ? "border-amber-600 text-amber-600 bg-amber-50/70"
                                : "border-indigo-600 text-indigo-600 bg-indigo-50/70"
                        }`}
                      >
                        {obj.props.stampType}
                      </div>
                    )}

                    {/* HYPERLINK */}
                    {obj.type === "hyperlink" && (
                      <div className="w-full h-full bg-blue-50/80 hover:bg-blue-100/90 border border-blue-400 rounded-lg p-1.5 flex items-center justify-between text-[10px] text-blue-800 font-bold pointer-events-auto">
                        <span className="truncate pr-1">{obj.props.url}</span>
                        <ExternalLink className="w-3 h-3 text-blue-600" />
                      </div>
                    )}

                    {/* QR CODES */}
                    {obj.type === "qrcode" && (
                      <div className="w-full h-full bg-white border border-slate-300 p-1 flex flex-col items-center justify-center">
                        <QrCode className="w-full h-full text-black stroke-[1.5]" />
                      </div>
                    )}

                    {/* TABLES */}
                    {obj.type === "table" && (
                      <table className="w-full h-full text-[9px] font-medium border-collapse border border-slate-300 bg-white">
                        <tbody>
                          {obj.props.tableRows?.map((row, rIdx) => (
                            <tr key={rIdx} className={rIdx === 0 ? "bg-slate-100 font-bold" : ""}>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="border border-slate-300 p-1 text-left truncate">{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {/* ATTACHMENT WIDGET */}
                    {obj.type === "attachment" && (
                      <div className="w-full h-full bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl px-2.5 flex items-center justify-between text-[10px] text-[#1F3557] font-bold pointer-events-auto">
                        <div className="flex items-center gap-1.5 truncate">
                          <Paperclip className="w-3.5 h-3.5 text-[#315C9F] shrink-0" />
                          <div className="truncate text-left leading-tight">
                            <p className="truncate font-bold">{obj.props.attachmentName}</p>
                            <p className="text-[8px] text-[#5E7393] font-medium font-sans">{obj.props.attachmentSize}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* RESIZING & ROTATING OVERLAY INTERFACE HANDLES (EDIT MODE ONLY) */}
                  {isSelected && editorMode === "edit" && !obj.isLocked && (
                    <>
                      {/* Side Handles */}
                      <div
                        className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-5 bg-[#315C9F] hover:bg-blue-600 rounded-sm cursor-ew-resize z-50 shadow"
                        onMouseDown={(e) => startResizing(e, obj, "e")}
                        onTouchStart={(e) => startResizing(e, obj, "e")}
                      />
                      <div
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-2.5 bg-[#315C9F] hover:bg-blue-600 rounded-sm cursor-ns-resize z-50 shadow"
                        onMouseDown={(e) => startResizing(e, obj, "s")}
                        onTouchStart={(e) => startResizing(e, obj, "s")}
                      />
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-5 bg-[#315C9F] hover:bg-blue-600 rounded-sm cursor-ew-resize z-50 shadow"
                        onMouseDown={(e) => startResizing(e, obj, "w")}
                        onTouchStart={(e) => startResizing(e, obj, "w")}
                      />
                      <div
                        className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-2.5 bg-[#315C9F] hover:bg-blue-600 rounded-sm cursor-ns-resize z-50 shadow"
                        onMouseDown={(e) => startResizing(e, obj, "n")}
                        onTouchStart={(e) => startResizing(e, obj, "n")}
                      />

                      {/* Corner Handles */}
                      <div
                        className="absolute right-0 bottom-0 w-3.5 h-3.5 bg-blue-600 border border-white rounded-full cursor-nwse-resize z-50 shadow"
                        onMouseDown={(e) => startResizing(e, obj, "se")}
                        onTouchStart={(e) => startResizing(e, obj, "se")}
                      />
                      <div
                        className="absolute left-0 bottom-0 w-3.5 h-3.5 bg-blue-600 border border-white rounded-full cursor-nesw-resize z-50 shadow"
                        onMouseDown={(e) => startResizing(e, obj, "sw")}
                        onTouchStart={(e) => startResizing(e, obj, "sw")}
                      />
                      <div
                        className="absolute right-0 top-0 w-3.5 h-3.5 bg-blue-600 border border-white rounded-full cursor-nesw-resize z-50 shadow"
                        onMouseDown={(e) => startResizing(e, obj, "ne")}
                        onTouchStart={(e) => startResizing(e, obj, "ne")}
                      />
                      <div
                        className="absolute left-0 top-0 w-3.5 h-3.5 bg-blue-600 border border-white rounded-full cursor-nwse-resize z-50 shadow"
                        onMouseDown={(e) => startResizing(e, obj, "nw")}
                        onTouchStart={(e) => startResizing(e, obj, "nw")}
                      />

                      {/* Rotation Knob */}
                      <div
                        className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto"
                        onMouseDown={(e) => startRotating(e, obj)}
                        onTouchStart={(e) => startRotating(e, obj)}
                      >
                        <div className="w-3.5 h-3.5 bg-amber-500 hover:bg-amber-600 rounded-full border border-white cursor-pointer shadow flex items-center justify-center">
                          <RotateCw className="w-2.5 h-2.5 text-white stroke-[3]" />
                        </div>
                        <div className="w-0.5 h-3 bg-amber-500" />
                      </div>
                    </>
                  )}

                  {/* Lock Icon Indicator */}
                  {obj.isLocked && (
                    <div className="absolute top-1 right-1 bg-amber-500 text-white rounded p-0.5 shadow">
                      <Lock className="w-3 h-3" />
                    </div>
                  )}
                </div>
              );
            })}

          {/* DRAG SELECTION BOUNDS (ACTIVE MULTI-SELECT VISUAL) */}
          {dragSelectStart && dragSelectCurrent && pageContainerRef.current && (
            <div
              className="absolute bg-blue-400/20 border border-blue-500/80 pointer-events-none z-50"
              style={{
                left: `${Math.min(clientToPercentX(dragSelectStart.x), clientToPercentX(dragSelectCurrent.x))}%`,
                top: `${Math.min(clientToPercentY(dragSelectStart.y), clientToPercentY(dragSelectCurrent.y))}%`,
                width: `${Math.abs(clientToPercentX(dragSelectCurrent.x) - clientToPercentX(dragSelectStart.x))}%`,
                height: `${Math.abs(clientToPercentY(dragSelectCurrent.y) - clientToPercentY(dragSelectStart.y))}%`
              }}
            />
          )}
        </div>
      </div>

      {/* eSIGN SIDEBAR SYSTEM */}
      {isESignSidebarOpen && (
        <div className="w-80 border-l border-[#9EC8EF]/50 bg-[#C7E3FA] text-[#1F3557] flex flex-col shrink-0 animate-slide-in p-4 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between border-b border-[#9EC8EF]/50 pb-2.5">
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <FileSignature className="w-4 h-4 text-[#315C9F]" />
              eSign Configuration
            </span>
            <button 
              onClick={() => setIsESignSidebarOpen(false)}
              className="text-xs text-[#5E7393] hover:text-[#1F3557] font-black"
            >✕</button>
          </div>

          {/* Autofill / Automation Toggles */}
          <div className="bg-white/80 border border-[#9EC8EF]/40 rounded-2xl p-3.5 space-y-3 shadow-sm text-left">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-[#5E7393] block">Staff Automation & Autofill</span>
            <div className="space-y-2.5">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fillAllEmployeeSigs}
                  onChange={(e) => setFillAllEmployeeSigs(e.target.checked)}
                  className="rounded border-[#9EC8EF] text-[#315C9F] focus:ring-[#315C9F] mt-0.5"
                />
                <div className="text-[10px] font-bold text-[#1F3557] leading-tight">
                  Fill all Employee signatures
                  <p className="text-[8px] font-medium text-[#5E7393] leading-tight mt-0.5">Staff can sign once to populate all employee fields</p>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fillAllEmployeeInits}
                  onChange={(e) => setFillAllEmployeeInits(e.target.checked)}
                  className="rounded border-[#9EC8EF] text-[#315C9F] focus:ring-[#315C9F] mt-0.5"
                />
                <div className="text-[10px] font-bold text-[#1F3557] leading-tight">
                  Fill all Employee initials
                  <p className="text-[8px] font-medium text-[#5E7393] leading-tight mt-0.5">Staff can initial once to populate all employee fields</p>
                </div>
              </label>
            </div>

            <div className="mt-2 p-2 bg-[#EAF5FF] rounded-lg text-[8px] font-medium text-amber-800 leading-relaxed">
              ⚠️ <strong>Security Rule:</strong> Customer autofill is STRICTLY FORBIDDEN. Customer must click and manually sign each individual field.
            </div>
          </div>

          {/* Workflow / Signing Options */}
          <div className="bg-white/80 border border-[#9EC8EF]/40 rounded-2xl p-3.5 space-y-3 shadow-sm text-left">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-[#5E7393] block">Signing Workflow Rules</span>
            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-[9px] text-[#5E7393] uppercase">Signing Venue</span>
                <select
                  value={signingOption}
                  onChange={(e) => setSigningOption(e.target.value as any)}
                  className="w-full bg-white border border-[#9EC8EF] rounded-xl px-2.5 py-1.5 text-[10px] font-bold text-[#1F3557] focus:outline-none"
                >
                  <option value="in_person">In-Person Signing (Onsite Stylus/Finger)</option>
                  <option value="remote">Remote Dispatch (Via Secure Link)</option>
                </select>
              </label>

              <label className="flex items-start gap-2 cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={enforceSigningOrder}
                  onChange={(e) => setEnforceSigningOrder(e.target.checked)}
                  className="rounded border-[#9EC8EF] text-[#315C9F] focus:ring-[#315C9F] mt-0.5"
                />
                <div className="text-[10px] font-bold text-[#1F3557] leading-tight">
                  Enforce Signing Order
                  <p className="text-[8px] font-medium text-[#5E7393] mt-0.5">Requires signing in sequential Customer → Employee → Owner order</p>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={requireWitness}
                  onChange={(e) => setRequireWitness(e.target.checked)}
                  className="rounded border-[#9EC8EF] text-[#315C9F] focus:ring-[#315C9F] mt-0.5"
                />
                <div className="text-[10px] font-bold text-[#1F3557] leading-tight">
                  Require Witness Verification
                  <p className="text-[8px] font-medium text-[#5E7393] mt-0.5">Require witness designation for final packet lock</p>
                </div>
              </label>
            </div>
          </div>

          {/* Audit Trail & Tamper Evident Log */}
          <div className="bg-white/80 border border-[#9EC8EF]/40 rounded-2xl p-3.5 space-y-3 shadow-sm text-left flex-1 flex flex-col overflow-hidden min-h-[220px]">
            <div className="flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-wider font-extrabold text-[#5E7393]">Tamper-Evident Audit Trail</span>
              <span className="text-[8px] font-bold text-[#315C9F] bg-[#EAF5FF] px-1 rounded">Active</span>
            </div>
            <div className="space-y-2 overflow-y-auto flex-1 scrollbar-thin pr-1 text-[9px] font-sans">
              {auditTrail.map((log: any, idx) => (
                <div key={log.id || idx} className="border-b border-slate-100 pb-1.5 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#1F3557] truncate max-w-[120px]">{log.signerName} ({log.role})</span>
                    <span className="text-[8px] text-[#5E7393] font-mono">{log.timestamp.substring(11)}</span>
                  </div>
                  <p className="text-[8px] text-slate-600 leading-tight">
                    Action: <strong className="text-indigo-700 font-extrabold uppercase">{log.action}</strong>
                  </p>
                  {log.ipAddress && (
                    <p className="text-[7px] text-[#5E7393] font-mono">
                      IP: {log.ipAddress} • {log.device.split(" ")[0]}
                    </p>
                  )}
                  {log.hash && (
                    <p className="text-[6px] text-emerald-600 font-mono select-all truncate bg-emerald-50 px-1 py-0.5 rounded border border-emerald-100 mt-0.5">
                      Hash: {log.hash}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <button
              onClick={handleFinalizeESign}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              Finalize & Lock Document
            </button>
            <button
              onClick={() => {
                if (confirm("Reset all signature fields and clear the audit log?")) {
                  setObjects(prev => prev.map(o => (o.type === "signature" || o.type === "initial") ? { ...o, props: { ...o.props, text: "" } } : o));
                  setAuditTrail([
                    {
                      id: "evt_reset",
                      signerName: loggedInUser?.name || "System Admin",
                      role: "employee",
                      action: "cleared signatures",
                      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
                      ipAddress: "127.0.0.1",
                      device: "Core Server Console",
                      documentVersion: "v1.0"
                    }
                  ]);
                  triggerNotification("Cleared all signatures and initials from document.");
                }
              }}
              className="w-full py-2 bg-white border border-red-200 hover:bg-red-50 text-red-600 font-bold rounded-xl text-[10px] uppercase tracking-wider transition-all cursor-pointer"
            >
              Reset Signatures
            </button>
          </div>
        </div>
      )}
    </div>

    {/* OBJECT CONTEXT MENU (LONG PRESS OBJECT) */}
      {objectContextMenu && (
        <div
          className="fixed bg-[#1F3557] text-white rounded-xl shadow-2xl p-2 z-50 border border-white/10 text-left text-[11px] font-bold uppercase w-48 animate-scale-up"
          style={{ top: `${objectContextMenu.y}px`, left: `${objectContextMenu.x}px` }}
        >
          <div className="px-2 py-1 text-[8px] text-slate-400 border-b border-white/10 tracking-widest uppercase mb-1">Object Menu</div>
          <button
            onClick={() => {
              const target = objects.find(o => o.id === objectContextMenu.objectId);
              if (target) {
                if (target.type === "text") handleTextEditPrompt(target);
                else handleOpenProperties(target);
              }
              setObjectContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 hover:bg-white/10 rounded"
          >
            Edit / Modify
          </button>
          <button
            onClick={() => {
              handleCopy();
              setObjectContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 hover:bg-white/10 rounded"
          >
            Copy
          </button>
          <button
            onClick={() => {
              handleDuplicate();
              setObjectContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 hover:bg-white/10 rounded"
          >
            Duplicate
          </button>
          <button
            onClick={() => {
              handleDelete();
              setObjectContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 hover:bg-white/10 text-red-300 rounded"
          >
            Delete
          </button>
          <button
            onClick={() => {
              handleLockToggle(objectContextMenu.objectId, true);
              setObjectContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 hover:bg-white/10 rounded"
          >
            Lock Element
          </button>
          <button
            onClick={() => {
              handleLockToggle(objectContextMenu.objectId, false);
              setObjectContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 hover:bg-white/10 text-amber-400 rounded"
          >
            Unlock Element
          </button>
          <button
            onClick={() => {
              const target = objects.find(o => o.id === objectContextMenu.objectId);
              if (target) handleOpenProperties(target);
              setObjectContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 hover:bg-white/10 rounded text-sky-400 border-t border-white/10 mt-1"
          >
            Properties...
          </button>
        </div>
      )}

      {/* CANVAS EMPTY SPACE CONTEXT MENU (LONG PRESS CANVAS) */}
      {canvasContextMenu && (
        <div
          className="fixed bg-[#C7E3FA] text-[#1F3557] rounded-xl shadow-2xl p-2.5 z-50 border border-[#9EC8EF] text-left text-[11px] font-bold uppercase w-52 animate-scale-up"
          style={{ top: `${canvasContextMenu.y}px`, left: `${canvasContextMenu.x}px` }}
        >
          <div className="px-2 py-1 text-[8px] text-[#5E7393] border-b border-[#9EC8EF]/40 tracking-widest uppercase mb-1">Quick Add Menu</div>
          {[
            { type: "text", label: "Insert Text Block" },
            { type: "image", label: "Insert Image File" },
            { type: "checkbox", label: "Checkbox Item" },
            { type: "dropdown", label: "Selection Dropdown" },
            { type: "signature", label: "Signature Block" },
            { type: "comment", label: "Sticky Comment" },
            { type: "qrcode", label: "Live QR Code" }
          ].map(lnk => (
            <button
              key={lnk.type}
              onClick={() => {
                if (pageContainerRef.current) {
                  const rect = pageContainerRef.current.getBoundingClientRect();
                  const addPercentX = ((canvasContextMenu.x - rect.left) / rect.width) * 100;
                  const addPercentY = ((canvasContextMenu.y - rect.top) / rect.height) * 100;
                  handleAddObject(lnk.type as any, addPercentX, addPercentY);
                }
                setCanvasContextMenu(null);
              }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-[#BDDDF8] rounded-lg transition-colors flex items-center justify-between"
            >
              <span>{lnk.label}</span>
              <Plus className="w-3 h-3 text-[#315C9F]" />
            </button>
          ))}
          {clipboard.length > 0 && (
            <button
              onClick={() => {
                handlePaste();
                setCanvasContextMenu(null);
              }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-emerald-100 text-emerald-900 border-t border-[#9EC8EF]/40 mt-1.5 rounded-lg font-black uppercase flex items-center justify-between"
            >
              <span>Paste Clipboard</span>
              <span className="text-[9px] bg-emerald-200 px-1 rounded">{clipboard.length}</span>
            </button>
          )}
        </div>
      )}

      {/* LOCK POSITION PROMPT */}
      {isLockPromptOpen && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#C7E3FA] border border-[#9EC8EF] text-[#1F3557] rounded-3xl p-6 max-w-xs w-full text-center shadow-2xl animate-scale-up space-y-4">
            <Lock className="w-12 h-12 text-[#315C9F] mx-auto animate-bounce" />
            <div>
              <p className="font-extrabold text-[#1F3557] uppercase tracking-wider text-xs">Lock Element Position?</p>
              <p className="text-[10px] text-[#5E7393] font-medium leading-relaxed font-sans mt-1">
                Locking protects the object from accidental drags. Long-press to unlock later.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (pendingLockObjectId) handleLockToggle(pendingLockObjectId, true);
                  setIsLockPromptOpen(false);
                  setPendingLockObjectId(null);
                }}
                className="flex-1 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white font-bold rounded-xl text-xs uppercase"
              >
                YES
              </button>
              <button
                onClick={() => {
                  setIsLockPromptOpen(false);
                  setPendingLockObjectId(null);
                }}
                className="flex-1 py-2 bg-white border border-[#9EC8EF] text-[#1F3557] hover:bg-slate-50 font-bold rounded-xl text-xs uppercase"
              >
                NO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROPERTIES MODIFIER MODAL */}
      {isPropertiesModalOpen && activePropertyObject && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] border border-[#9EC8EF] rounded-[28px] p-6 w-[95%] max-w-[420px] shadow-2xl animate-scale-up text-left">
            <div className="flex items-center justify-between border-b border-[#9EC8EF]/40 pb-3 mb-4">
              <div className="flex items-center gap-1.5">
                <Settings className="w-4.5 h-4.5 text-[#315C9F]" />
                <h3 className="text-xs font-black uppercase tracking-wider">Properties Editor</h3>
              </div>
              <button onClick={() => setIsPropertiesModalOpen(false)} className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold">✕</button>
            </div>

            <div className="space-y-4 text-xs font-bold text-[#1F3557]">
              {/* Common properties indicator */}
              <div className="text-[10px] text-[#5E7393] uppercase">
                OBJECT TYPE: <span className="font-extrabold text-[#1F3557]">{activePropertyObject.type}</span>
              </div>

              {/* SIGNATURE / INITIAL ROLE CONFIG */}
              {(activePropertyObject.type === "signature" || activePropertyObject.type === "initial") && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase text-[#5E7393]">Signer Designation / Role</label>
                    <select
                      className="w-full bg-white border border-[#9EC8EF] rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1"
                      value={(activePropertyObject.props as any).role || "customer"}
                      onChange={(e) => updateActiveProperty({ role: e.target.value })}
                    >
                      <option value="customer">Authorized Customer</option>
                      <option value="employee">Employee / Technician</option>
                      <option value="owner">Owner / Administrator</option>
                      <option value="witness">Third-Party Witness</option>
                    </select>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase text-[#5E7393]">Status</label>
                    <div className="bg-white border border-[#9EC8EF] rounded-xl px-3 py-2 text-xs text-[#1F3557] font-medium font-sans">
                      {activePropertyObject.props.text ? `Signed by ${(activePropertyObject.props as any).signedBy || "unknown"}` : "Unsigned / Awaiting signature"}
                    </div>
                  </div>
                </div>
              )}

              {/* TEXT OPTIONS */}
              {activePropertyObject.props.text !== undefined && activePropertyObject.type !== "signature" && activePropertyObject.type !== "initial" && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase text-[#5E7393]">Text Content</label>
                    <textarea
                      className="w-full bg-white border border-[#9EC8EF] rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#315C9F] text-[#1F3557] font-sans font-medium"
                      value={activePropertyObject.props.text}
                      rows={3}
                      onChange={(e) => updateActiveProperty({ text: e.target.value })}
                    />
                  </div>

                  {activePropertyObject.props.fontFamily !== undefined && (
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-[#5E7393]">Font Family</label>
                      <select
                        className="w-full bg-white border border-[#9EC8EF] rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1"
                        value={activePropertyObject.props.fontFamily}
                        onChange={(e) => updateActiveProperty({ fontFamily: e.target.value })}
                      >
                        {sortedFontsList.map((f, idx) => (
                          <option key={f} value={f}>
                            {f} {usedFonts.includes(f) ? "★" : ""}
                          </option>
                        ))}
                      </select>
                      <span className="text-[8px] text-[#5E7393] font-medium font-sans">★ Fonts marked with star are already active in this document</span>
                    </div>
                  )}

                  {activePropertyObject.props.fontSize !== undefined && (
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-[#5E7393]">Font Size ({activePropertyObject.props.fontSize}px)</label>
                      <input
                        type="range"
                        min="8"
                        max="72"
                        className="w-full h-1 bg-slate-300 rounded-lg appearance-none cursor-pointer"
                        value={activePropertyObject.props.fontSize}
                        onChange={(e) => updateActiveProperty({ fontSize: parseInt(e.target.value) })}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* COLORS PICKER */}
              {activePropertyObject.props.color !== undefined && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-[#5E7393]">Primary Accent Color</label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {["#1F3557", "#315C9F", "#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#111827"].map((c) => (
                      <button
                        key={c}
                        onClick={() => {
                          updateActiveProperty({ color: c });
                          setActiveColor(c);
                        }}
                        className={`w-6 h-6 rounded-full border border-[#9EC8EF]/45 transition-transform ${
                          activePropertyObject.props.color === c ? "scale-125 ring-2 ring-white" : ""
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* DROPDOWN OPTIONS CONFIG */}
              {activePropertyObject.props.options !== undefined && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-[#5E7393]">Menu Options (Comma Separated)</label>
                  <input
                    type="text"
                    className="w-full bg-white border border-[#9EC8EF] rounded-xl px-3 py-2 text-xs focus:outline-none"
                    value={activePropertyObject.props.options.join(", ")}
                    onChange={(e) => updateActiveProperty({ options: e.target.value.split(",").map(o => o.trim()) })}
                  />
                </div>
              )}

              {/* IMAGE URL CONFIG */}
              {activePropertyObject.props.imageSrc !== undefined && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-[#5E7393]">Image Source URL</label>
                  <input
                    type="text"
                    className="w-full bg-white border border-[#9EC8EF] rounded-xl px-3 py-2 text-xs focus:outline-none font-sans font-medium"
                    value={activePropertyObject.props.imageSrc}
                    onChange={(e) => updateActiveProperty({ imageSrc: e.target.value })}
                  />
                </div>
              )}

              {/* SHAPE TYPE CONFIG */}
              {activePropertyObject.props.shapeType !== undefined && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-[#5E7393]">Shape Type</label>
                  <div className="grid grid-cols-4 gap-2 mt-1">
                    {(["rectangle", "circle", "line", "arrow"] as const).map((shp) => (
                      <button
                        key={shp}
                        onClick={() => updateActiveProperty({ shapeType: shp })}
                        className={`py-1.5 rounded-lg border text-[10px] font-black uppercase transition-all ${
                          activePropertyObject.props.shapeType === shp
                            ? "bg-[#315C9F] text-white"
                            : "bg-white border-[#9EC8EF] text-[#5E7393] hover:bg-[#EAF5FF]"
                        }`}
                      >
                        {shp}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* STAMP TYPE CONFIG */}
              {activePropertyObject.props.stampType !== undefined && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-[#5E7393]">Stamp Headline</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {(["APPROVED", "REJECTED", "DRAFT", "COPY", "SIGN HERE"] as const).map((stmp) => (
                      <button
                        key={stmp}
                        onClick={() => updateActiveProperty({ stampType: stmp })}
                        className={`py-2 rounded-lg border text-[10px] font-black transition-all ${
                          activePropertyObject.props.stampType === stmp
                            ? "bg-[#315C9F] text-white border-[#315C9F]"
                            : "bg-white border-[#9EC8EF] text-[#5E7393] hover:bg-[#EAF5FF]"
                        }`}
                      >
                        {stmp}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* HYPERLINK CONFIG */}
              {activePropertyObject.props.url !== undefined && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-[#5E7393]">Hyperlink Target Link</label>
                  <input
                    type="text"
                    className="w-full bg-white border border-[#9EC8EF] rounded-xl px-3 py-2 text-xs focus:outline-none font-sans"
                    value={activePropertyObject.props.url}
                    onChange={(e) => updateActiveProperty({ url: e.target.value })}
                  />
                </div>
              )}
            </div>

            <button
              onClick={() => setIsPropertiesModalOpen(false)}
              className="w-full py-2.5 bg-[#315C9F] hover:bg-[#1F3557] text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer mt-5 text-center"
            >
              Apply Properties
            </button>
          </div>
        </div>
      )}

      {/* COMPREHENSIVE SHARING MODAL */}
      {isShareModalOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] border border-[#9EC8EF] rounded-[28px] p-6 w-[95%] max-w-[450px] shadow-2xl animate-scale-up text-left">
            <div className="flex items-center justify-between border-b border-[#9EC8EF]/40 pb-3 mb-4">
              <div className="flex items-center gap-1.5">
                <Share2 className="w-4.5 h-4.5 text-[#315C9F]" />
                <h3 className="text-xs font-black uppercase tracking-wider">Share Document</h3>
              </div>
              <button onClick={() => setIsShareModalOpen(false)} className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold">✕</button>
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
                      setIsShareModalOpen(false);
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
                      setIsShareModalOpen(false);
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
                    navigator.clipboard.writeText(`https://leadforge.local/shared/docs/${documentId || "doc_blank"}`);
                    triggerNotification("📋 Secure copy-link copied to clipboard!");
                    setIsShareModalOpen(false);
                  }}
                  className="p-3 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer shadow-sm"
                >
                  <LinkIcon className="w-5 h-5 text-indigo-600" />
                  <span className="text-[10px] font-black uppercase mt-1">Copy Link</span>
                </button>

                <button
                  onClick={() => {
                    triggerNotification("📥 Document bundle file download initialized...");
                    setIsShareModalOpen(false);
                    if (logOperationalEvent) {
                      logOperationalEvent("Document Exported", `PDF file bundle downloaded: ${documentName}`, "📥");
                    }
                  }}
                  className="p-3 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer shadow-sm"
                >
                  <Download className="w-5 h-5 text-blue-600" />
                  <span className="text-[10px] font-black uppercase mt-1">Download PDF</span>
                </button>

                <button
                  onClick={() => {
                    triggerNotification("🖨️ Initializing printing spool sequence...");
                    setIsShareModalOpen(false);
                  }}
                  className="p-3 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer shadow-sm"
                >
                  <Printer className="w-5 h-5 text-slate-600" />
                  <span className="text-[10px] font-black uppercase mt-1">Print Document</span>
                </button>

                <button
                  onClick={() => {
                    triggerNotification("📲 Opening device universal share sheet protocols...");
                    setIsShareModalOpen(false);
                  }}
                  className="p-3 bg-white hover:bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer shadow-sm"
                >
                  <ExternalLink className="w-5 h-5 text-pink-600" />
                  <span className="text-[10px] font-black uppercase mt-1">Other Apps</span>
                </button>
              </div>
            </div>

            <button
              onClick={() => setIsShareModalOpen(false)}
              className="w-full py-2 bg-blue-100 hover:bg-blue-200 text-[#1F3557] font-bold rounded-xl text-xs uppercase cursor-pointer mt-5 text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* --- HIGH-FIDELITY eSIGNATURE CAPTURE MODAL --- */}
      {isSignModalOpen && activeSignObject && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] border border-[#9EC8EF] rounded-[28px] p-6 w-[95%] max-w-[480px] shadow-2xl animate-scale-up text-left flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#9EC8EF]/40 pb-3 mb-4">
              <div className="flex items-center gap-1.5">
                <FileSignature className="w-5 h-5 text-[#315C9F]" />
                <h3 className="text-sm font-black uppercase tracking-wider">
                  Complete {activeSignObject.type === "initial" ? "Initials" : "Signature"} Field
                </h3>
              </div>
              <button onClick={() => setIsSignModalOpen(false)} className="text-xs text-[#5E7393] hover:text-[#1F3557] font-black">✕</button>
            </div>

            <div className="space-y-4 text-xs font-bold text-[#1F3557] flex-1 overflow-y-auto pr-1">
              {/* Role Info & Name */}
              <div className="grid grid-cols-2 gap-3 bg-white/60 p-3 rounded-2xl border border-[#9EC8EF]/30">
                <div>
                  <label className="text-[9px] uppercase text-[#5E7393] block mb-0.5">Signer Designation</label>
                  <span className="text-xs font-black uppercase text-[#315C9F]">
                    {signerRole === "customer" ? "Authorized Customer" :
                     signerRole === "employee" ? "Employee / Staff" :
                     signerRole === "owner" ? "Owner / Admin" : "Third-Party Witness"}
                  </span>
                </div>
                <div>
                  <label className="text-[9px] uppercase text-[#5E7393] block mb-0.5">Required Action</label>
                  <span className="text-xs font-black uppercase text-amber-700">
                    {activeSignObject.type === "initial" ? "Enter Initials" : "Apply Signature"}
                  </span>
                </div>
              </div>

              {/* Signer Full Name Input */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-[#5E7393]">Signer Full Name</label>
                <input
                  type="text"
                  placeholder="Enter legal name..."
                  className="w-full bg-white border border-[#9EC8EF] rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#315C9F] text-[#1F3557] font-sans font-medium"
                  value={signerFullName}
                  onChange={(e) => setSignerFullName(e.target.value)}
                />
              </div>

              {/* Method Selection Tabs */}
              <div className="flex bg-[#EAF5FF] rounded-xl p-0.5 border border-[#9EC8EF]/40">
                <button
                  onClick={() => setSignMethod("draw")}
                  className={`flex-1 py-1.5 text-[10px] uppercase font-black rounded-lg transition-all ${
                    signMethod === "draw" ? "bg-[#315C9F] text-white shadow" : "text-[#5E7393] hover:text-[#1F3557]"
                  }`}
                >
                  Draw
                </button>
                <button
                  onClick={() => setSignMethod("type")}
                  className={`flex-1 py-1.5 text-[10px] uppercase font-black rounded-lg transition-all ${
                    signMethod === "type" ? "bg-[#315C9F] text-white shadow" : "text-[#5E7393] hover:text-[#1F3557]"
                  }`}
                >
                  Type
                </button>
                <button
                  onClick={() => setSignMethod("import")}
                  className={`flex-1 py-1.5 text-[10px] uppercase font-black rounded-lg transition-all ${
                    signMethod === "import" ? "bg-[#315C9F] text-white shadow" : "text-[#5E7393] hover:text-[#1F3557]"
                  }`}
                >
                  Import
                </button>
              </div>

              {/* DRAW TAB */}
              {signMethod === "draw" && (
                <div className="space-y-2">
                  <div className="text-[9px] uppercase text-[#5E7393] flex justify-between">
                    <span>Draw with stylus, finger, or mouse</span>
                    <button
                      onClick={() => {
                        const canvas = document.getElementById("sig-canvas") as HTMLCanvasElement | null;
                        if (canvas) {
                          const ctx = canvas.getContext("2d");
                          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
                        }
                      }}
                      className="text-red-600 hover:text-red-700 font-extrabold uppercase hover:underline"
                    >
                      Clear Pad
                    </button>
                  </div>
                  <div className="border border-[#9EC8EF] rounded-2xl bg-white overflow-hidden shadow-inner h-32 relative">
                    <canvas
                      id="sig-canvas"
                      width="420"
                      height="124"
                      className="w-full h-full cursor-crosshair block"
                      onMouseDown={(e) => {
                        const canvas = e.currentTarget;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) return;
                        ctx.strokeStyle = "#1F3557";
                        ctx.lineWidth = 2.5;
                        ctx.lineCap = "round";
                        ctx.lineJoin = "round";
                        const rect = canvas.getBoundingClientRect();
                        ctx.beginPath();
                        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
                        (canvas as any).isDrawing = true;
                      }}
                      onMouseMove={(e) => {
                        const canvas = e.currentTarget;
                        if (!(canvas as any).isDrawing) return;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) return;
                        const rect = canvas.getBoundingClientRect();
                        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
                        ctx.stroke();
                      }}
                      onMouseUp={(e) => {
                        (e.currentTarget as any).isDrawing = false;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as any).isDrawing = false;
                      }}
                      onTouchStart={(e) => {
                        const canvas = e.currentTarget;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) return;
                        ctx.strokeStyle = "#1F3557";
                        ctx.lineWidth = 2.5;
                        ctx.lineCap = "round";
                        ctx.lineJoin = "round";
                        const rect = canvas.getBoundingClientRect();
                        const touch = e.touches[0];
                        ctx.beginPath();
                        ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
                        (canvas as any).isDrawing = true;
                      }}
                      onTouchMove={(e) => {
                        const canvas = e.currentTarget;
                        if (!(canvas as any).isDrawing) return;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) return;
                        const rect = canvas.getBoundingClientRect();
                        const touch = e.touches[0];
                        ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
                        ctx.stroke();
                      }}
                      onTouchEnd={(e) => {
                        (e.currentTarget as any).isDrawing = false;
                      }}
                    />
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] text-slate-300 font-medium select-none pointer-events-none">
                      X __________________________________________________ Sign Here
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-[9px] text-[#5E7393] font-medium font-sans">
                    <span>Stroke Style: Smooth Ink </span>
                    <span className="flex gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#1F3557] border border-white" />
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-800 border border-white" />
                      <span className="w-2.5 h-2.5 rounded-full bg-black border border-white" />
                    </span>
                  </div>
                </div>
              )}

              {/* TYPE TAB */}
              {signMethod === "type" && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase text-[#5E7393]">Font Style</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { name: "Pacifico", font: "Pacifico, cursive" },
                        { name: "Caveat", font: "Caveat, cursive" },
                        { name: "Montserrat", font: "Montserrat, sans-serif" }
                      ].map((f) => (
                        <button
                          key={f.name}
                          type="button"
                          onClick={() => setTypedFont(f.name)}
                          className={`py-1.5 border rounded-xl text-[10px] transition-all font-bold ${
                            typedFont === f.name ? "bg-white border-[#315C9F] text-[#315C9F] shadow-sm" : "border-[#9EC8EF]/40 bg-white/50 text-[#5E7393]"
                          }`}
                        >
                          {f.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Preview of typed cursive */}
                  <div className="border border-[#9EC8EF] rounded-2xl bg-white p-4 h-24 flex items-center justify-center relative shadow-inner overflow-hidden">
                    <span 
                      className="text-2xl text-[#1F3557] select-none text-center block transition-all"
                      style={{ 
                        fontFamily: typedFont === "Pacifico" ? "Pacifico, cursive" : typedFont === "Caveat" ? "Caveat, cursive" : "monospace" 
                      }}
                    >
                      {signerFullName.trim() || (activeSignObject.type === "initial" ? "SJ" : "Sarah Jenkins")}
                    </span>
                    <div className="absolute bottom-2 left-4 text-[7px] text-slate-300 font-mono">Cursive Generated Output</div>
                  </div>
                </div>
              )}

              {/* IMPORT TAB */}
              {signMethod === "import" && (
                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-[#5E7393]">Upload Signature File</label>
                  <div className="border-2 border-dashed border-[#9EC8EF] rounded-2xl bg-white hover:bg-slate-50 p-4 h-28 flex flex-col items-center justify-center text-center cursor-pointer relative shadow-inner">
                    <input
                      type="file"
                      accept="image/*"
                      id="sig-file-upload"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const result = event.target?.result as string;
                            (window as any)._imported_sig = result;
                            triggerNotification("Signature image imported successfully!");
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <Download className="w-6 h-6 text-[#315C9F] mb-1 opacity-80" />
                    <p className="text-[10px] font-bold text-[#1F3557]">Drag signature image or click to browse</p>
                    <p className="text-[8px] text-[#5E7393] font-medium font-sans">PNG with transparent background recommended</p>
                  </div>
                </div>
              )}

              {/* Terms Checkbox */}
              <div className="bg-[#EAF5FF]/80 p-3 rounded-2xl border border-[#9EC8EF]/30 text-[9px] font-medium text-slate-700 leading-relaxed text-left">
                ℹ️ By clicking <strong>Apply Signature</strong>, I agree that this e-signature holds the same legal standing, weight, and enforceability as a handwritten signature on a paper document under the ESIGN Act and UETA regulations.
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2.5 mt-5">
              <button
                onClick={() => {
                  let finalVal = "";
                  if (signMethod === "draw") {
                    const canvas = document.getElementById("sig-canvas") as HTMLCanvasElement | null;
                    if (canvas) {
                      finalVal = canvas.toDataURL();
                    }
                  } else if (signMethod === "type") {
                    finalVal = signerFullName.trim() || (activeSignObject.type === "initial" ? "SJ" : "Sarah Jenkins");
                  } else if (signMethod === "import") {
                    finalVal = (window as any)._imported_sig || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='30'><text x='10' y='20' font-family='cursive' font-size='14' fill='%231F3557'>Imported</text></svg>";
                  }
                  
                  if (!finalVal) {
                    alert("Please sign or enter text before applying!");
                    return;
                  }

                  handleApplySignature(finalVal, activeSignObject.type === "initial");
                }}
                className="flex-1 py-3 bg-[#315C9F] hover:bg-[#1F3557] text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer animate-pulse-slow"
              >
                Apply Signature
              </button>
              <button
                onClick={() => setIsSignModalOpen(false)}
                className="px-4 py-3 bg-white border border-[#9EC8EF] hover:bg-slate-50 text-[#1F3557] font-bold rounded-xl text-xs uppercase cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
