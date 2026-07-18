import React, { useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import {
  Link2,
  Plus,
  Brain,
  Upload,
  Download,
  Search,
  SlidersHorizontal,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  ShieldCheck,
  UserCheck,
  Settings,
  Database,
  Calendar,
  DollarSign,
  Briefcase,
  TrendingUp,
  Map,
  FileText,
  Mail,
  Users,
  BarChart,
  MessageSquare,
  Globe,
  Lock,
  ArrowRightLeft,
  X,
  Play,
  Key,
  Info,
  Layers,
  BookOpen,
  Wifi,
  HelpCircle
} from "lucide-react";
import { SchedulingEvent } from "./SchedulingPage";
import { Customer } from "./CustomersPage";
import { DocumentItem } from "./DocumentsPage";

// Let's define interfaces for custom integration items
export interface Integration {
  id: string;
  name: string;
  category: "Business" | "Accounting" | "Marketing" | "Communication" | "Maps" | "AI" | "CRM" | "Storage" | "Payments" | "Custom";
  developer: string;
  apiType: "REST" | "GraphQL" | "SOAP" | "gRPC";
  logo: string; // Emoji
  description: string;
  connected: boolean;
  lastSync: string;
  aiEnabled: boolean;
  aiMode: "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO";
  apiUsage: { current: number; limit: number };
  scopes: string[];
  permissions: string[];
  syncFrequency: "Manual" | "Every 5 Minutes" | "Every 15 Minutes" | "Every Hour" | "Daily" | "Weekly" | "Custom";
  apiKey?: string;
  apiSecret?: string;
  webhookUrl?: string;
  redirectUri?: string;
}

export interface SyncLogEntry {
  id: string;
  date: string;
  time: string;
  integrationId: string;
  integrationName: string;
  recordsUpdated: number;
  warnings: number;
  errors: number;
  status: "Success" | "Failed" | "Warning";
  message: string;
}

export interface WebhookHistoryEntry {
  id: string;
  type: "Incoming" | "Outgoing";
  eventType: string;
  timestamp: string;
  payloadSize: string;
  status: "Delivered" | "Failed" | "Retrying";
  retryCount: number;
}

interface IntegrationsPageProps {
  dashboardLeads: any[];
  setDashboardLeads: React.Dispatch<React.SetStateAction<any[]>>;
}

export const IntegrationsPage: React.FC<IntegrationsPageProps> = ({
  dashboardLeads,
  setDashboardLeads
}) => {
  const { loggedInUser, simulatedRole } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const {
    schedulingEvents,
    setSchedulingEvents,
    customers,
    setCustomers,
    documents,
    setDocuments,
    recentAiActions,
    setRecentAiActions
  } = useDomainData();
  const {
    takeSnapshot: onTakeSnapshot,
    openPageAIAnalysis: onOpenAIAnalysis,
    navigateToScreen: onNavigateToScreen,
    logOperationalEvent,
    triggerNotification
  } = useNavTelemetry();
  // Check authorization - Owners full access, managers configurable, employees limited
  const isAuthorized = useMemo(() => {
    if (activeRole === "Owner") return true;
    if (activeRole === "Office Manager" || activeRole === "Manager") return true;
    return false; // Employees only see configured view but cannot change setup
  }, [activeRole]);

  // Initial list of 32 integrations requested
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: "google_business",
      name: "Google Business Profile",
      category: "Marketing",
      developer: "Google",
      apiType: "REST",
      logo: "🏪",
      description: "Synchronize customer reviews, business hours, and auto-import new search engine leads.",
      connected: true,
      lastSync: "2026-07-06 18:30",
      aiEnabled: true,
      aiMode: "ASSIST + APPROVAL",
      apiUsage: { current: 1240, limit: 10000 },
      scopes: ["gprofile.business.manage", "gprofile.reviews.read"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Every 15 Minutes",
      apiKey: "AIzaSyD_gBusiness2026KeyX",
      apiSecret: "sec_g_business_prod_99x",
      webhookUrl: "https://ownerslocal.api.local/webhooks/google_business",
      redirectUri: "https://ownerslocal.local/oauth/google_business/callback"
    },
    {
      id: "google_calendar",
      name: "Google Calendar",
      category: "Communication",
      developer: "Google",
      apiType: "REST",
      logo: "📅",
      description: "Bi-directional real-time schedule sync with corporate calendars and dispatch planners.",
      connected: true,
      lastSync: "2026-07-06 18:40",
      aiEnabled: true,
      aiMode: "AUTO",
      apiUsage: { current: 4890, limit: 50000 },
      scopes: ["calendar.events", "calendar.readonly"],
      permissions: ["Owner", "Manager", "Technician"],
      syncFrequency: "Every 5 Minutes",
      apiKey: "AIzaSyB_gCalendar2026KeyY",
      apiSecret: "sec_g_cal_prod_44w",
      webhookUrl: "https://ownerslocal.api.local/webhooks/google_calendar",
      redirectUri: "https://ownerslocal.local/oauth/google_calendar/callback"
    },
    {
      id: "google_maps",
      name: "Google Maps",
      category: "Maps",
      developer: "Google",
      apiType: "REST",
      logo: "🗺️",
      description: "Optimized route rendering, traffic-aware dispatch timing, and employee live location vectors.",
      connected: true,
      lastSync: "2026-07-06 18:41",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 8900, limit: 100000 },
      scopes: ["maps.routes.optimal", "maps.geocode"],
      permissions: ["Owner", "Manager", "Technician", "Driver"],
      syncFrequency: "Every 5 Minutes",
      apiKey: "AIzaSyC_gMaps2026KeyZ",
      apiSecret: "sec_g_maps_prod_11a",
      webhookUrl: "https://ownerslocal.api.local/webhooks/google_maps",
      redirectUri: "https://ownerslocal.local/oauth/google_maps/callback"
    },
    {
      id: "google_drive",
      name: "Google Drive",
      category: "Storage",
      developer: "Google",
      apiType: "REST",
      logo: "💾",
      description: "Automatic backup of PDF estimates, service contracts, and site photographic surveys.",
      connected: true,
      lastSync: "2026-07-06 18:15",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 3120, limit: 20000 },
      scopes: ["drive.files.create", "drive.readonly"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Every Hour",
      apiKey: "AIzaSyD_gDrive2026KeyW",
      apiSecret: "sec_g_drive_prod_55q",
      webhookUrl: "https://ownerslocal.api.local/webhooks/google_drive",
      redirectUri: "https://ownerslocal.local/oauth/google_drive/callback"
    },
    {
      id: "gmail",
      name: "Gmail",
      category: "Communication",
      developer: "Google",
      apiType: "REST",
      logo: "✉️",
      description: "Auto-send estimate sheets, scheduling alerts, and invoice payment receipts to clients.",
      connected: false,
      lastSync: "Never",
      aiEnabled: true,
      aiMode: "ASSIST",
      apiUsage: { current: 0, limit: 15000 },
      scopes: ["gmail.send", "gmail.modify"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Every 5 Minutes",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "https://ownerslocal.api.local/webhooks/gmail",
      redirectUri: "https://ownerslocal.local/oauth/gmail/callback"
    },
    {
      id: "google_contacts",
      name: "Google Contacts",
      category: "CRM",
      developer: "Google",
      apiType: "REST",
      logo: "👥",
      description: "Import mobile customer directories and sync newly forged CRM leads automatically.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 10000 },
      scopes: ["contacts.readonly", "contacts.write"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Daily",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "google_analytics",
      name: "Google Analytics",
      category: "Marketing",
      developer: "Google",
      apiType: "REST",
      logo: "📈",
      description: "Track lead generation campaigns, website conversions, and click-to-call response rates.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 5000 },
      scopes: ["analytics.readonly"],
      permissions: ["Owner"],
      syncFrequency: "Daily",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "google_ads",
      name: "Google Ads",
      category: "Marketing",
      developer: "Google",
      apiType: "REST",
      logo: "🎯",
      description: "Import phone call leads and map conversion actions directly back to service purchases.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 5000 },
      scopes: ["ads.manage"],
      permissions: ["Owner"],
      syncFrequency: "Daily",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "facebook_business",
      name: "Facebook Business",
      category: "Marketing",
      developer: "Facebook",
      apiType: "REST",
      logo: "📘",
      description: "Import Meta Lead Generation Ad records, tracking ad expenditure and performance metrics.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 5000 },
      scopes: ["ads_management", "business_management"],
      permissions: ["Owner"],
      syncFrequency: "Every Hour",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "facebook_messenger",
      name: "Facebook Messenger",
      category: "Communication",
      developer: "Facebook",
      apiType: "REST",
      logo: "💬",
      description: "Inject customer direct-messages directly into the Owner's Local OS unified Message center.",
      connected: false,
      lastSync: "Never",
      aiEnabled: true,
      aiMode: "ASSIST",
      apiUsage: { current: 0, limit: 10000 },
      scopes: ["pages_messaging", "pages_read_engagement"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Every 5 Minutes",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "instagram",
      name: "Instagram",
      category: "Marketing",
      developer: "Facebook",
      apiType: "REST",
      logo: "📸",
      description: "Auto-sync direct comments and customer visual requests into local dispatch threads.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 10000 },
      scopes: ["instagram_basic", "instagram_manage_messages"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Every 15 Minutes",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "whatsapp_business",
      name: "WhatsApp Business",
      category: "Communication",
      developer: "Facebook",
      apiType: "REST",
      logo: "🟢",
      description: "Reach mobile clients on their primary chat medium with digital invoice triggers.",
      connected: false,
      lastSync: "Never",
      aiEnabled: true,
      aiMode: "ASSIST + APPROVAL",
      apiUsage: { current: 0, limit: 20000 },
      scopes: ["whatsapp_business_messaging", "whatsapp_business_management"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Every 5 Minutes",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "twilio",
      name: "Twilio",
      category: "Communication",
      developer: "Twilio",
      apiType: "REST",
      logo: "📱",
      description: "Secure virtual tracking phone numbers and trigger robust SMS automated customer confirmations.",
      connected: true,
      lastSync: "2026-07-06 18:40",
      aiEnabled: true,
      aiMode: "AUTO",
      apiUsage: { current: 2840, limit: 15000 },
      scopes: ["twilio.sms.send", "twilio.numbers.read"],
      permissions: ["Owner", "Manager", "Technician"],
      syncFrequency: "Every 5 Minutes",
      apiKey: "ACtwilioAccountSid2026X",
      apiSecret: "sec_twilio_auth_token_9x",
      webhookUrl: "https://ownerslocal.api.local/webhooks/twilio",
      redirectUri: ""
    },
    {
      id: "stripe",
      name: "Stripe",
      category: "Payments",
      developer: "Stripe",
      apiType: "REST",
      logo: "💳",
      description: "Accept card payments, send digital secure checkout links, and process job deposits.",
      connected: true,
      lastSync: "2026-07-06 18:41",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 3120, limit: 50000 },
      scopes: ["charges.create", "invoices.send", "payment_intents.manage"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Every 5 Minutes",
      apiKey: "sk_test_leadForgeStripe2026KeyX",
      apiSecret: "whsec_stripe_signing_key_44y",
      webhookUrl: "https://ownerslocal.api.local/webhooks/stripe",
      redirectUri: ""
    },
    {
      id: "square",
      name: "Square",
      category: "Payments",
      developer: "Square",
      apiType: "REST",
      logo: "🔲",
      description: "Process in-person chip payments via hardware terminals synchronized to field tablet orders.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 25000 },
      scopes: ["payments.write", "terminals.manage"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Every 15 Minutes",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "quickbooks",
      name: "QuickBooks",
      category: "Accounting",
      developer: "Intuit",
      apiType: "REST",
      logo: "💼",
      description: "Translate operational invoices, employee billable hours, and job costing into ledger records.",
      connected: true,
      lastSync: "2026-07-06 18:00",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 1560, limit: 10000 },
      scopes: ["accounting.transactions", "accounting.customers"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Every Hour",
      apiKey: "qb_auth_accessToken2026X",
      apiSecret: "qb_client_secret_xyz112",
      webhookUrl: "https://ownerslocal.api.local/webhooks/quickbooks",
      redirectUri: "https://ownerslocal.local/oauth/quickbooks/callback"
    },
    {
      id: "xero",
      name: "Xero",
      category: "Accounting",
      developer: "Xero",
      apiType: "REST",
      logo: "✖️",
      description: "Alternative accounting bridge for synchronization of customer profiles, tax receipts, and asset rosters.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 10000 },
      scopes: ["xero.accounting.transactions", "xero.contacts"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Every Hour",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "outlook",
      name: "Outlook",
      category: "Communication",
      developer: "Microsoft",
      apiType: "REST",
      logo: "📬",
      description: "Import Microsoft Exchange service inboxes into CRM threads to coordinate customer email responses.",
      connected: false,
      lastSync: "Never",
      aiEnabled: true,
      aiMode: "ASSIST",
      apiUsage: { current: 0, limit: 15000 },
      scopes: ["mail.send", "mail.readwrite"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Every 5 Minutes",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "microsoft365",
      name: "Microsoft 365",
      category: "Storage",
      developer: "Microsoft",
      apiType: "REST",
      logo: "🏢",
      description: "Access and generate Excel estimates or Word documents inside client folders.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 10000 },
      scopes: ["files.readwrite.all"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Every Hour",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "dropbox",
      name: "Dropbox",
      category: "Storage",
      developer: "Dropbox",
      apiType: "REST",
      logo: "📦",
      description: "Sync PDF service sheets and technical blueprints into shared backup folders.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 10000 },
      scopes: ["files.metadata.read", "files.content.write"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Daily",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "onedrive",
      name: "OneDrive",
      category: "Storage",
      developer: "Microsoft",
      apiType: "REST",
      logo: "☁️",
      description: "Synchronize client site layout photos and diagnostic PDFs securely on the cloud.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 10000 },
      scopes: ["onedrive.readonly", "onedrive.write"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Daily",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "slack",
      name: "Slack",
      category: "Communication",
      developer: "Slack",
      apiType: "REST",
      logo: "🟪",
      description: "Deliver instant dispatcher alerts, employee clock status, and urgent job dispatches to internal channels.",
      connected: false,
      lastSync: "Never",
      aiEnabled: true,
      aiMode: "ASSIST + APPROVAL",
      apiUsage: { current: 0, limit: 15000 },
      scopes: ["chat:write", "channels:read"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Every 5 Minutes",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "zoom",
      name: "Zoom",
      category: "Communication",
      developer: "Zoom",
      apiType: "REST",
      logo: "📹",
      description: "Automate scheduling of live video consultations with estimators and remote inspectors.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 5000 },
      scopes: ["meeting:write", "meeting:read"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Every Hour",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "zapier",
      name: "Zapier",
      category: "Custom",
      developer: "Zapier",
      apiType: "REST",
      logo: "🧡",
      description: "Trigger multi-app workflow automations with standard inbound and outbound payload packets.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 50000 },
      scopes: ["zapier.webhook.trigger"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Manual",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "https://ownerslocal.api.local/webhooks/zapier",
      redirectUri: ""
    },
    {
      id: "make_com",
      name: "Make.com",
      category: "Custom",
      developer: "Make",
      apiType: "REST",
      logo: "💜",
      description: "Build robust scenario mappings with comprehensive custom module connections.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 50000 },
      scopes: ["make.scenario.trigger"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Manual",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "https://ownerslocal.api.local/webhooks/make",
      redirectUri: ""
    },
    {
      id: "webhook",
      name: "Webhook",
      category: "Custom",
      developer: "Custom",
      apiType: "REST",
      logo: "🔗",
      description: "Direct server-to-server HTTP request endpoints for custom Owner's Local OS automation.",
      connected: true,
      lastSync: "2026-07-06 18:35",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 412, limit: 50000 },
      scopes: ["webhook.incoming", "webhook.outgoing"],
      permissions: ["Owner"],
      syncFrequency: "Every 5 Minutes",
      apiKey: "wh_endpoint_signing_token_abc123",
      apiSecret: "sec_webhook_secret_77u",
      webhookUrl: "https://ownerslocal.api.local/webhooks/custom_receiver",
      redirectUri: ""
    },
    {
      id: "openai",
      name: "OpenAI",
      category: "AI",
      developer: "OpenAI",
      apiType: "REST",
      logo: "🤖",
      description: "Power GPT intelligence for auto-categorization of client files and smart messaging.",
      connected: false,
      lastSync: "Never",
      aiEnabled: true,
      aiMode: "ASSIST",
      apiUsage: { current: 0, limit: 100000 },
      scopes: ["chat.completions", "embeddings.create"],
      permissions: ["Owner"],
      syncFrequency: "Manual",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "gemini",
      name: "Gemini",
      category: "AI",
      developer: "Google",
      apiType: "REST",
      logo: "✨",
      description: "Underpin local AI assistant operations, auto-evaluating dispatch paths and estimator records.",
      connected: true,
      lastSync: "2026-07-06 18:41",
      aiEnabled: true,
      aiMode: "AUTO",
      apiUsage: { current: 15302, limit: 500000 },
      scopes: ["gemini.generateContent", "gemini.models.manage"],
      permissions: ["Owner", "Manager"],
      syncFrequency: "Every 5 Minutes",
      apiKey: "AIzaSyGeminiAssistant2026KeyY",
      apiSecret: "sec_gemini_prod_key_77r",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "claude",
      name: "Claude",
      category: "AI",
      developer: "Anthropic",
      apiType: "REST",
      logo: "🦉",
      description: "Alternative LLM core for intricate document drafting, checklist reviews, and compliance checks.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 100000 },
      scopes: ["messages.create"],
      permissions: ["Owner"],
      syncFrequency: "Manual",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "anthropic",
      name: "Anthropic",
      category: "AI",
      developer: "Anthropic",
      apiType: "REST",
      logo: "🌐",
      description: "Secondary LLM pipeline connection to distribute processing loads for deep background analysis.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 100000 },
      scopes: ["anthropic.readonly"],
      permissions: ["Owner"],
      syncFrequency: "Manual",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "custom_rest",
      name: "Custom REST API",
      category: "Custom",
      developer: "Custom",
      apiType: "REST",
      logo: "📡",
      description: "Plug in your own customized server endpoint utilizing standard JSON REST payload guidelines.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 50000 },
      scopes: ["api.read", "api.write"],
      permissions: ["Owner"],
      syncFrequency: "Manual",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    },
    {
      id: "custom_graphql",
      name: "Custom GraphQL API",
      category: "Custom",
      developer: "Custom",
      apiType: "GraphQL",
      logo: "📊",
      description: "Define a tailored GraphQL schema interface to request specific fields from personal databases.",
      connected: false,
      lastSync: "Never",
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 50000 },
      scopes: ["graphql.query", "graphql.mutation"],
      permissions: ["Owner"],
      syncFrequency: "Manual",
      apiKey: "",
      apiSecret: "",
      webhookUrl: "",
      redirectUri: ""
    }
  ]);

  // Sync log entries
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([
    { id: "log_1", date: "2026-07-06", time: "18:41", integrationId: "google_maps", integrationName: "Google Maps", recordsUpdated: 4, warnings: 0, errors: 0, status: "Success", message: "Optimized 4 current routing paths for Dispatch." },
    { id: "log_2", date: "2026-07-06", time: "18:40", integrationId: "google_calendar", integrationName: "Google Calendar", recordsUpdated: 1, warnings: 0, errors: 0, status: "Success", message: "Synchronized active appointment 'Apex Plumb & Drain' to scheduling master." },
    { id: "log_3", date: "2026-07-06", time: "18:40", integrationId: "twilio", integrationName: "Twilio", recordsUpdated: 3, warnings: 1, errors: 0, status: "Warning", message: "Received 3 inbound customer SMS logs. 1 delivery receipt warning." },
    { id: "log_4", date: "2026-07-06", time: "18:35", integrationId: "webhook", integrationName: "Webhook", recordsUpdated: 0, warnings: 0, errors: 1, status: "Failed", message: "Connection refused (503 Service Unavailable) on external receiver. Will retry." },
    { id: "log_5", date: "2026-07-06", time: "18:30", integrationId: "google_business", integrationName: "Google Business Profile", recordsUpdated: 2, warnings: 0, errors: 0, status: "Success", message: "Imported 2 new leads from search profile: Albert F., Theresa W." },
    { id: "log_6", date: "2026-07-06", time: "18:15", integrationId: "google_drive", integrationName: "Google Drive", recordsUpdated: 12, warnings: 0, errors: 0, status: "Success", message: "Backed up 12 documents to folder '/OwnersLocal_Backups'." },
    { id: "log_7", date: "2026-07-06", time: "18:00", integrationId: "quickbooks", integrationName: "QuickBooks", recordsUpdated: 1, warnings: 0, errors: 0, status: "Success", message: "Sent completed job E-1084 ledger updates to bookkeeping ledger." }
  ]);

  // Webhook history logs
  const [webhookLogs, setWebhookLogs] = useState<WebhookHistoryEntry[]>([
    { id: "wh_1", type: "Incoming", eventType: "lead.created", timestamp: "2026-07-06 18:30:15", payloadSize: "1.4 KB", status: "Delivered", retryCount: 0 },
    { id: "wh_2", type: "Outgoing", eventType: "invoice.updated", timestamp: "2026-07-06 18:00:22", payloadSize: "3.2 KB", status: "Delivered", retryCount: 0 },
    { id: "wh_3", type: "Outgoing", eventType: "job.completed", timestamp: "2026-07-06 17:45:00", payloadSize: "2.8 KB", status: "Failed", retryCount: 3 },
    { id: "wh_4", type: "Incoming", eventType: "sms.received", timestamp: "2026-07-06 17:32:10", payloadSize: "0.8 KB", status: "Delivered", retryCount: 0 },
    { id: "wh_5", type: "Outgoing", eventType: "calendar.event_shifted", timestamp: "2026-07-06 16:15:05", payloadSize: "2.1 KB", status: "Retrying", retryCount: 1 }
  ]);

  // UI state filters
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory, setSearchCategory] = useState("All");
  const [searchStatus, setSearchStatus] = useState("All");
  const [searchApi, setSearchApi] = useState("All");
  const [searchDeveloper, setSearchDeveloper] = useState("All");
  
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"grid" | "webhooks" | "logs">("grid");

  // Selected Integration for Details Popup / Configuration Modal
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [isDetailPopupOpen, setIsDetailPopupOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"overview" | "api_keys" | "webhooks" | "logs" | "ai_setup">("overview");

  // Add integration dialog state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newIntegrationName, setNewIntegrationName] = useState("");
  const [newIntegrationCategory, setNewIntegrationCategory] = useState<Integration["category"]>("Custom");
  const [newIntegrationDesc, setNewIntegrationDesc] = useState("");

  // AI Setup Dialog State
  const [isAiSetupOpen, setIsAiSetupOpen] = useState(false);

  // Computations for summary card counts
  const summaryCounts = useMemo(() => {
    const connected = integrations.filter((i) => i.connected).length;
    const available = integrations.length - connected;
    const errors = syncLogs.filter((l) => l.status === "Failed").length;
    const pendingAuth = integrations.filter((i) => !i.connected && i.scopes.length > 0).length;
    return {
      connected,
      available,
      errors,
      pendingAuth,
      lastSync: syncLogs[0] ? `${syncLogs[0].date} ${syncLogs[0].time}` : "N/A",
      apiHealth: "98.4%"
    };
  }, [integrations, syncLogs]);

  // Click summary card filters integrations
  const [activeSummaryFilter, setActiveSummaryFilter] = useState<string | null>(null);

  const filteredIntegrations = useMemo(() => {
    return integrations.filter((item) => {
      // 1. Search Query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesDesc = item.description.toLowerCase().includes(query);
        const matchesDev = item.developer.toLowerCase().includes(query);
        if (!matchesName && !matchesDesc && !matchesDev) return false;
      }
      
      // 2. Facet Selectors
      if (searchCategory !== "All" && item.category !== searchCategory) return false;
      if (searchStatus !== "All") {
        if (searchStatus === "Connected" && !item.connected) return false;
        if (searchStatus === "Disconnected" && item.connected) return false;
        if (searchStatus === "Needs Authentication" && (item.connected || !item.apiKey)) {
          // If it's connected or already has a key, it doesn't "need auth" in our mock criteria
          if (!item.connected && item.apiKey) return true; // wait, let's keep it simple: disconnected with empty keys
          if (item.connected) return false;
        }
      }
      if (searchApi !== "All" && item.apiType !== searchApi) return false;
      if (searchDeveloper !== "All" && item.developer !== searchDeveloper) return false;

      // 3. Category Buttons
      if (selectedFilterCategory) {
        if (selectedFilterCategory === "Connected" && !item.connected) return false;
        if (selectedFilterCategory === "Disconnected" && item.connected) return false;
        if (selectedFilterCategory === "Needs Authentication" && item.connected) return false;
        if (
          selectedFilterCategory !== "Connected" && 
          selectedFilterCategory !== "Disconnected" && 
          selectedFilterCategory !== "Needs Authentication" && 
          item.category !== selectedFilterCategory
        ) {
          return false;
        }
      }

      // 4. Summary Card Filter
      if (activeSummaryFilter) {
        if (activeSummaryFilter === "Connected" && !item.connected) return false;
        if (activeSummaryFilter === "Available" && item.connected) return false;
        if (activeSummaryFilter === "Pending" && item.connected) return false;
      }

      return true;
    });
  }, [integrations, searchQuery, searchCategory, searchStatus, searchApi, searchDeveloper, selectedFilterCategory, activeSummaryFilter]);

  // Toggle Connection Handler
  const handleToggleConnection = (id: string) => {
    if (!isAuthorized) {
      triggerNotification("🚫 Permissions denied: Only Owners or Managers can configure system integrations.");
      return;
    }
    setIntegrations((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const newConnected = !item.connected;
          triggerNotification(
            newConnected
              ? `🔌 Connected to ${item.name} successfully!`
              : `🛑 Disconnected ${item.name} integration.`
          );
          
          // Log operational event
          if (logOperationalEvent) {
            logOperationalEvent(
              newConnected ? "Connect Integration" : "Disconnect Integration",
              `Service ${item.name} status updated to: ${newConnected ? "ACTIVE" : "INACTIVE"}`,
              "🔗"
            );
          }

          // Trigger Event Engine Sync side effects!
          if (newConnected) {
            triggerEventEngineSync(id);
          }

          return {
            ...item,
            connected: newConnected,
            lastSync: newConnected ? new Date().toISOString().replace("T", " ").substring(0, 16) : "Never"
          };
        }
        return item;
      })
    );
  };

  // Perform Manual Sync side effect on specific integration
  const triggerEventEngineSync = (id: string) => {
    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 16);
    const currentDateStr = new Date().toISOString().substring(0, 10);
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

    // Custom updates per request instructions
    if (id === "google_calendar") {
      // "Google Calendar updates Scheduling."
      const newEvt: SchedulingEvent = {
        id: `evt_google_${Date.now()}`,
        eventType: "Job",
        date: currentDateStr,
        startTime: "11:30",
        endTime: "13:30",
        customer: "Theresa Webb (Google Calendar Sync)",
        customerPhone: "(206) 555-0153",
        customerEmail: "theresa@webb.com",
        customerAddress: "1102 Industrial Way, Seattle WA 98108",
        assignedEmployee: "Theresa W.",
        assignedCrew: "Crew Alpha",
        location: "1102 Industrial Way, Seattle WA 98108",
        priority: "High",
        notes: "Inbound calendar appointment generated from Google Business Profile synchronization suite.",
        status: "Scheduled"
      };
      setSchedulingEvents((prev) => [newEvt, ...prev]);
      triggerNotification("📅 Shared Event Engine: Synced Google Calendar events to Scheduling module.");
    } else if (id === "quickbooks") {
      // "QuickBooks updates Revenue."
      triggerNotification("💼 Shared Event Engine: Synced invoice registers with QuickBooks Online ledger.");
    } else if (id === "stripe") {
      // "Stripe updates Payments."
      triggerNotification("💳 Shared Event Engine: Active downpayments and secure checkout metrics updated.");
    } else if (id === "google_business") {
      // "Google Business updates Leads."
      const newLead = {
        id: `lead_google_${Date.now()}`,
        name: "Darren Finch (Google Lead)",
        phone: "(206) 555-8902",
        service: "Water Line Replacement",
        status: "New Inquiry",
        date: "Today, 18:41 PM"
      };
      setDashboardLeads((prev) => [newLead, ...prev]);
      triggerNotification("🏪 Shared Event Engine: Imported 1 brand new customer lead from Google Business Profile.");
    } else if (id === "twilio") {
      // "Twilio updates Messages."
      triggerNotification("📱 Shared Event Engine: Pulled recent Twilio text messaging queues securely.");
    } else if (id === "google_drive") {
      // "Google Drive updates Documents."
      const newDoc: DocumentItem = {
        id: `doc_google_${Date.now()}`,
        name: "Site_Survey_Map_GoogleDrive.pdf",
        customer: "Theresa Webb",
        employee: "John Doe",
        vendor: "Google Drive Sync",
        job: "Drainage Project",
        type: "Blueprint",
        uploadedBy: "Google Drive Sync",
        date: currentDateStr,
        size: "3.4 MB",
        status: "Pending",
        isFavorite: false,
        isArchived: false,
        notes: "Synced technical blueprint PDF from Google Drive folder.",
        tags: ["Google Sync", "Blueprint"],
        estimateId: "",
        invoiceId: "",
        lastModified: currentDateStr,
        url: "#"
      };
      setDocuments((prev) => [newDoc, ...prev]);
      triggerNotification("💾 Shared Event Engine: Synced 1 new technical PDF schematic from Google Drive.");
    } else if (id === "google_maps") {
      // "Maps updates Routes."
      triggerNotification("🗺️ Shared Event Engine: Refreshed high-fidelity transit lines for active technicians.");
    } else if (id === "gemini" || id === "openai") {
      // "AI services update AI Assistant."
      const newAct = {
        id: `act_ai_${Date.now()}`,
        time: timeStr,
        module: "Integrations",
        action: "AI Assistant Sync",
        reason: `${id.toUpperCase()} model analysis updated client-interaction parameters.`,
        status: "Completed" as const,
        approvedBy: loggedInUser?.name || "Unknown User"
      };
      setRecentAiActions((prev) => [newAct, ...prev]);
      triggerNotification(`✨ Shared Event Engine: ${id.toUpperCase()} LLM pipeline verified with AI Assistant.`);
    }

    // Add success log entry
    const matchingInt = integrations.find((i) => i.id === id);
    const intName = matchingInt ? matchingInt.name : id;
    const newLog: SyncLogEntry = {
      id: `log_manual_${Date.now()}`,
      date: currentDateStr,
      time: timeStr,
      integrationId: id,
      integrationName: intName,
      recordsUpdated: Math.floor(Math.random() * 5) + 1,
      warnings: 0,
      errors: 0,
      status: "Success",
      message: `Manual sync completed. Event Engine state updated successfully.`
    };
    setSyncLogs((prev) => [newLog, ...prev]);
  };

  // Sync Now button handler
  const handleSyncNow = (id: string) => {
    triggerNotification(`🔄 Syncing ${integrations.find(i => i.id === id)?.name || id}...`);
    setTimeout(() => {
      setIntegrations(prev => prev.map(item => {
        if (item.id === id) {
          triggerEventEngineSync(id);
          return {
            ...item,
            lastSync: new Date().toISOString().replace("T", " ").substring(0, 16)
          };
        }
        return item;
      }));
    }, 400);
  };

  // Global Refresh All Handler
  const handleRefreshAll = () => {
    triggerNotification("🔄 Dispatching global sync signals across all active Event Engine nodes...");
    
    // Simulate refreshing all connected integrations
    setTimeout(() => {
      let syncCount = 0;
      setIntegrations((prev) =>
        prev.map((item) => {
          if (item.connected) {
            syncCount++;
            return {
              ...item,
              lastSync: new Date().toISOString().replace("T", " ").substring(0, 16)
            };
          }
          return item;
        })
      );

      // Add a fresh log
      const currentDateStr = new Date().toISOString().substring(0, 10);
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      const newGlobalLog: SyncLogEntry = {
        id: `log_global_${Date.now()}`,
        date: currentDateStr,
        time: timeStr,
        integrationId: "global_engine",
        integrationName: "Event Engine Router",
        recordsUpdated: syncCount * 2,
        warnings: 1,
        errors: 0,
        status: "Success",
        message: `Global engine synchronized ${syncCount} active enterprise integrations.`
      };
      setSyncLogs((prev) => [newGlobalLog, ...prev]);
      triggerNotification(`✅ Unified Event Engine updated. Refreshed ${syncCount} integrations!`);
    }, 600);
  };

  // Open Details Modal Configuration
  const handleOpenConfigure = (item: Integration) => {
    setSelectedIntegration(item);
    setDetailTab("overview");
    setIsDetailPopupOpen(true);
  };

  // Save Config inside Modal
  const handleSaveIntegrationConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIntegration) return;

    if (!isAuthorized) {
      triggerNotification("🚫 Permissions denied: Administrative override required.");
      return;
    }

    setIntegrations((prev) =>
      prev.map((item) => (item.id === selectedIntegration.id ? selectedIntegration : item))
    );
    setIsDetailPopupOpen(false);
    triggerNotification(`💾 Saved custom settings for ${selectedIntegration.name} successfully.`);
    
    if (logOperationalEvent) {
      logOperationalEvent("Configure Integration", `Configured scopes & credentials for ${selectedIntegration.name}`, "⚙️");
    }
  };

  // Import Settings Handler
  const handleImportSettings = () => {
    triggerNotification("📥 Upload config trigger: Selected 'OwnersLocal_Settings_v4_Backup.json' configuration blueprint.");
    setTimeout(() => {
      triggerNotification("✅ System settings file successfully imported and merged with current Event Engine.");
    }, 500);
  };

  // Export Settings Handler
  const handleExportSettings = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ integrations, syncLogs, date: "2026-07-06" }));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `OwnersLocal_LocalOS_Integrations_Backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    triggerNotification("📤 Exported system integration backup packet successfully!");
  };

  // Add Custom Integration Form Handler
  const handleCreateCustomIntegration = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIntegrationName.trim()) return;

    const newInt: Integration = {
      id: `custom_${Date.now()}`,
      name: newIntegrationName,
      category: newIntegrationCategory,
      developer: "Custom Client",
      apiType: "REST",
      logo: "📡",
      description: newIntegrationDesc || "User specified REST endpoint mapped securely to Owner's Local OS internal JSON schemas.",
      connected: true,
      lastSync: new Date().toISOString().replace("T", " ").substring(0, 16),
      aiEnabled: false,
      aiMode: "OFF",
      apiUsage: { current: 0, limit: 10000 },
      scopes: ["custom.api.access"],
      permissions: ["Owner"],
      syncFrequency: "Manual",
      apiKey: "custom_key_temp_token_val_99",
      apiSecret: "",
      webhookUrl: "https://ownerslocal.api.local/webhooks/custom_" + newIntegrationName.toLowerCase().replace(/[^a-z]/g, ""),
      redirectUri: ""
    };

    setIntegrations((prev) => [...prev, newInt]);
    setIsAddModalOpen(false);
    setNewIntegrationName("");
    setNewIntegrationDesc("");
    triggerNotification(`📡 Registered custom node '${newIntegrationName}' in enterprise grid!`);
  };

  // Test API keys handler inside details
  const handleTestConnection = (id: string) => {
    triggerNotification(`⚡ Sending ping signal to ${id} API servers...`);
    setTimeout(() => {
      const isSuccess = Math.random() > 0.15; // 85% success rate simulation
      if (isSuccess) {
        triggerNotification(`✅ Connection test passed! Response status: 200 OK.`);
      } else {
        triggerNotification(`❌ Connection test failed. Timeout or invalid authentication payload.`);
      }
    }, 800);
  };

  return (
    <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm space-y-6 animate-fade-in text-left">
      {/* TOP HEADER CARD */}
      <div className="bg-[#E3F3FF] p-6 rounded-2xl border border-[#A9CDEE] flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 bg-[#C7E3FB] text-[#342D7E] rounded-xl border border-[#A9CDEE]">
              <Link2 className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">
                Integrations Control Node
              </h1>
              <p className="text-xs text-slate-500 font-sans font-medium">
                Owner's Local OS Central API Bridge & Real-Time Event Engine Sync
              </p>
            </div>
          </div>
        </div>

        {/* TOP BUTTON ACTIONS */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3 py-1.5 bg-[#315C9F] text-white hover:bg-[#254A84] rounded-xl text-xs font-bold font-sans flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Integration
          </button>
          
          <button
            onClick={() => setIsAiSetupOpen(true)}
            className="px-3 py-1.5 bg-indigo-550 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold font-sans flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <Brain className="h-3.5 w-3.5" />
            AI Setup
          </button>

          <button
            onClick={handleImportSettings}
            className="px-3 py-1.5 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] border border-[#9EC8EF] rounded-xl text-xs font-bold font-sans flex items-center gap-1.5 transition-all cursor-pointer"
            title="Import setup configuration json"
          >
            <Upload className="h-3.5 w-3.5" />
            Import Settings
          </button>

          <button
            onClick={handleExportSettings}
            className="px-3 py-1.5 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] border border-[#9EC8EF] rounded-xl text-xs font-bold font-sans flex items-center gap-1.5 transition-all cursor-pointer"
            title="Export integration definitions"
          >
            <Download className="h-3.5 w-3.5" />
            Export Settings
          </button>

          <button
            onClick={handleRefreshAll}
            className="px-3 py-1.5 bg-[#315C9F] hover:bg-[#254A84] text-white rounded-xl text-xs font-bold font-sans flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 animate-hover-spin" />
            Refresh All
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS SECTION */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { key: "Connected", label: "Connected Integrations", count: summaryCounts.connected, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
          { key: "Available", label: "Available Integrations", count: summaryCounts.available, color: "text-[#315C9F] bg-[#E3F3FF] border-[#A9CDEE]" },
          { key: "Errors", label: "Sync Errors", count: summaryCounts.errors, color: "text-rose-600 bg-rose-50 border-rose-200" },
          { key: "LastSync", label: "Last Sync Time", value: summaryCounts.lastSync, color: "text-amber-700 bg-amber-50 border-amber-200" },
          { key: "Health", label: "API Health", value: summaryCounts.apiHealth, color: "text-teal-600 bg-teal-50 border-teal-200" },
          { key: "Pending", label: "Pending Auth", count: summaryCounts.pendingAuth, color: "text-purple-600 bg-purple-50 border-purple-200" }
        ].map((card) => {
          const isActive = activeSummaryFilter === card.key;
          return (
            <div
              key={card.key}
              onClick={() => {
                if (isActive) {
                  setActiveSummaryFilter(null);
                } else {
                  setActiveSummaryFilter(card.key);
                }
              }}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none text-left flex flex-col justify-between h-24 shadow-xs relative overflow-hidden ${
                isActive ? "ring-2 ring-[#315C9F] scale-98 shadow-sm" : "hover:translate-y-[-2px]"
              } ${card.color}`}
            >
              <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 line-clamp-1">
                {card.label}
              </div>
              <div className="text-xl font-extrabold tracking-tight mt-1">
                {card.count !== undefined ? card.count : card.value}
              </div>
              <div className="text-[9px] text-slate-400 mt-1 flex items-center justify-between">
                <span>{isActive ? "● Active Filter" : "Click to filter"}</span>
                {isActive && <span className="h-1.5 w-1.5 rounded-full bg-[#315C9F] animate-ping" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* CORE VIEW NAVIGATION TABS */}
      <div className="flex border-b border-[#A9CDEE] gap-2 pb-px">
        {[
          { key: "grid", label: "Integrations Registry", count: filteredIntegrations.length },
          { key: "webhooks", label: "Webhook Receivers", count: webhookLogs.length },
          { key: "logs", label: "Event Sync Ledger", count: syncLogs.length }
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 font-sans font-bold text-xs uppercase tracking-wider border-t border-x rounded-t-xl transition-all cursor-pointer ${
              activeTab === tab.key
                ? "bg-[#E3F3FF] text-[#342D7E] border-[#A9CDEE] border-b-[#E3F3FF] translate-y-[1px]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label} <span className="text-[10px] ml-1 px-1.5 py-0.5 bg-slate-200/50 rounded-full font-mono font-medium text-slate-600">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* INTEGRATIONS REGISTRY VIEW */}
      {activeTab === "grid" && (
        <div className="space-y-4">
          {/* SEARCH & FILTERS CONTROLS */}
          <div className="bg-[#E3F3FF] p-4.5 rounded-2xl border border-[#A9CDEE] space-y-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-[#315C9F]" />
              <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">
                Multi-faceted Search & Registry Filtering
              </h3>
            </div>

            {/* Faceted Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Keyword Search */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Keyword (Service/Dev)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#A9CDEE] rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#315C9F]"
                />
              </div>

              {/* Category Dropdown */}
              <div>
                <select
                  value={searchCategory}
                  onChange={(e) => setSearchCategory(e.target.value)}
                  className="w-full bg-white border border-[#A9CDEE] rounded-xl px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
                >
                  <option value="All">All Categories</option>
                  <option value="Business">Business</option>
                  <option value="Accounting">Accounting</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Communication">Communication</option>
                  <option value="Maps">Maps</option>
                  <option value="AI">AI</option>
                  <option value="CRM">CRM</option>
                  <option value="Storage">Storage</option>
                  <option value="Payments">Payments</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>

              {/* Status Dropdown */}
              <div>
                <select
                  value={searchStatus}
                  onChange={(e) => setSearchStatus(e.target.value)}
                  className="w-full bg-white border border-[#A9CDEE] rounded-xl px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
                >
                  <option value="All">All Connection Status</option>
                  <option value="Connected">Connected Only</option>
                  <option value="Disconnected">Disconnected Only</option>
                  <option value="Needs Authentication">Needs Authentication</option>
                </select>
              </div>

              {/* API Format Dropdown */}
              <div>
                <select
                  value={searchApi}
                  onChange={(e) => setSearchApi(e.target.value)}
                  className="w-full bg-white border border-[#A9CDEE] rounded-xl px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
                >
                  <option value="All">All API Formats</option>
                  <option value="REST">REST API</option>
                  <option value="GraphQL">GraphQL</option>
                </select>
              </div>

              {/* Developer Dropdown */}
              <div>
                <select
                  value={searchDeveloper}
                  onChange={(e) => setSearchDeveloper(e.target.value)}
                  className="w-full bg-white border border-[#A9CDEE] rounded-xl px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
                >
                  <option value="All">All Developers</option>
                  <option value="Google">Google Suite</option>
                  <option value="Facebook">Meta (Facebook)</option>
                  <option value="Twilio">Twilio</option>
                  <option value="Stripe">Stripe</option>
                  <option value="Microsoft">Microsoft Corp</option>
                  <option value="Custom">Custom / In-house</option>
                </select>
              </div>
            </div>

            {/* Quick Filter Pill Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#A9CDEE]/50">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#315C9F] mr-2">
                Quick Categories:
              </span>
              {[
                { label: "All Registry", val: null },
                { label: "Connected", val: "Connected" },
                { label: "Disconnected", val: "Disconnected" },
                { label: "Needs Authentication", val: "Needs Authentication" },
                { label: "Business", val: "Business" },
                { label: "Accounting", val: "Accounting" },
                { label: "Marketing", val: "Marketing" },
                { label: "Communication", val: "Communication" },
                { label: "Maps", val: "Maps" },
                { label: "AI", val: "AI" },
                { label: "CRM", val: "CRM" },
                { label: "Storage", val: "Storage" },
                { label: "Payments", val: "Payments" },
                { label: "Custom", val: "Custom" }
              ].map((pill) => {
                const isActive = selectedFilterCategory === pill.val;
                return (
                  <button
                    key={pill.label}
                    onClick={() => setSelectedFilterCategory(pill.val)}
                    className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                      isActive
                        ? "bg-[#315C9F] text-white border-[#315C9F]"
                        : "bg-[#F5FAFF] hover:bg-[#BDDDF8] text-slate-600 border-[#A9CDEE]"
                    }`}
                  >
                    {pill.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* FRAMEWORK CONNECTION SUMMARY BADGES */}
          <div className="bg-[#E3F3FF] p-4 rounded-2xl border border-[#A9CDEE] space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <Database className="h-4 w-4 text-[#315C9F]" />
                <span className="text-xs font-bold text-slate-800 font-sans uppercase tracking-wider">
                  Framework Connections (Shared Event Engine Matrix)
                </span>
              </div>
              <span className="px-2 py-0.5 bg-[#C7E3FB] text-[#315C9F] text-[9.5px] font-extrabold uppercase rounded-lg border border-[#A9CDEE]">
                No Duplicate Data
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 xl:grid-cols-9 gap-2">
              {[
                { name: "Dashboard", status: "CONNECTED" },
                { name: "Revenue", status: "CONNECTED" },
                { name: "Customers", status: "CONNECTED" },
                { name: "Leads", status: "CONNECTED" },
                { name: "Estimates & Bids", status: "CONNECTED" },
                { name: "Scheduling", status: "CONNECTED" },
                { name: "Dispatch", status: "CONNECTED" },
                { name: "Routes", status: "CONNECTED" },
                { name: "Jobs", status: "CONNECTED" },
                { name: "Time Clock", status: "CONNECTED" },
                { name: "Inventory", status: "CONNECTED" },
                { name: "Documents", status: "CONNECTED" },
                { name: "Messages", status: "CONNECTED" },
                { name: "Roster", status: "CONNECTED" },
                { name: "Training", status: "CONNECTED" },
                { name: "AI Assistant", status: "CONNECTED" },
                { name: "Settings", status: "CONNECTED" },
                { name: "Notifications", status: "READY" },
                { name: "Owner Console", status: "READY" }
              ].map((fw) => (
                <div
                  key={fw.name}
                  className={`p-1.5 rounded-xl border text-center transition-all ${
                    fw.status === "CONNECTED"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-[#F5FAFF] text-slate-500 border-[#A9CDEE] border-dashed"
                  }`}
                >
                  <div className="text-[10px] font-extrabold truncate">{fw.name}</div>
                  <div className="text-[8px] font-mono font-bold uppercase mt-0.5">
                    {fw.status === "CONNECTED" ? "✓ Linked" : "□ Ready"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CORE INTEGRATION GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredIntegrations.map((item) => (
              <div
                key={item.id}
                className="bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl p-4.5 flex flex-col justify-between gap-4 shadow-xs relative overflow-hidden group hover:shadow-sm hover:border-[#91BEE6] transition-all text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl select-none w-11 h-11 rounded-xl bg-[#C7E3FB] border border-[#A9CDEE] flex items-center justify-center shadow-xs">
                      {item.logo}
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider font-sans group-hover:text-[#315C9F] transition-colors">
                        {item.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono font-bold mt-0.5">
                        {item.developer} • {item.category}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Slider Switch */}
                  <button
                    onClick={() => handleToggleConnection(item.id)}
                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      item.connected ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out mt-[1px] ${
                        item.connected ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>

                <p className="text-[11px] text-slate-600 font-medium font-sans leading-relaxed min-h-12">
                  {item.description}
                </p>

                {/* Status Badges Row */}
                <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-[#A9CDEE]/50">
                  <span
                    className={`text-[8.5px] px-1.5 py-0.5 rounded-lg font-mono font-bold uppercase border ${
                      item.connected
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-[#F5FAFF] text-slate-400 border-[#A9CDEE]"
                    }`}
                  >
                    {item.connected ? "Connected" : "Disconnected"}
                  </span>

                  <span className="text-[9px] text-slate-400 font-medium font-sans">
                    Sync: {item.lastSync}
                  </span>

                  {item.aiEnabled ? (
                    <span className="ml-auto text-[8.5px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-mono font-bold uppercase flex items-center gap-1">
                      <Brain className="h-2 w-2" />
                      AI: {item.aiMode}
                    </span>
                  ) : (
                    <span className="ml-auto text-[8.5px] px-1.5 py-0.5 bg-[#F5FAFF] text-slate-400 border border-[#A9CDEE] rounded-lg font-mono font-medium uppercase">
                      AI OFF
                    </span>
                  )}
                </div>

                {/* Grid Item Buttons */}
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    onClick={() => handleOpenConfigure(item)}
                    className="px-2.5 py-1.5 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] border border-[#9EC8EF] rounded-xl text-[10.5px] font-bold font-sans transition-all cursor-pointer text-center"
                  >
                    Configure
                  </button>
                  {item.connected ? (
                    <button
                      onClick={() => handleSyncNow(item.id)}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10.5px] font-bold font-sans transition-all cursor-pointer text-center flex items-center justify-center gap-1"
                    >
                      <RefreshCw className="h-3 w-3 animate-hover-spin" />
                      Sync Now
                    </button>
                  ) : (
                    <button
                      onClick={() => handleToggleConnection(item.id)}
                      className="px-2.5 py-1.5 bg-[#315C9F] hover:bg-[#254A84] text-white rounded-xl text-[10.5px] font-bold font-sans transition-all cursor-pointer text-center"
                    >
                      Connect
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between text-[9px] text-slate-400 pt-1">
                  <span>API: {item.apiType} format</span>
                  <button
                    onClick={() => {
                      handleOpenConfigure(item);
                      setDetailTab("logs");
                    }}
                    className="hover:underline text-[#315C9F]"
                  >
                    View Logs ({syncLogs.filter(l => l.integrationId === item.id).length})
                  </button>
                </div>
              </div>
            ))}

            {filteredIntegrations.length === 0 && (
              <div className="col-span-full py-12 text-center bg-[#E3F3FF] rounded-2xl border border-[#A9CDEE] space-y-2">
                <AlertCircle className="h-8 w-8 text-slate-400 mx-auto" />
                <h4 className="text-xs font-extrabold text-[#342D7E] uppercase">No Match Found</h4>
                <p className="text-xs text-slate-500 font-medium font-sans">
                  Try clearing active faceted options or keyword query.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSearchCategory("All");
                    setSearchStatus("All");
                    setSearchApi("All");
                    setSearchDeveloper("All");
                    setSelectedFilterCategory(null);
                    setActiveSummaryFilter(null);
                  }}
                  className="px-3 py-1 bg-[#315C9F] text-white rounded-xl text-xs font-sans font-bold cursor-pointer"
                >
                  Clear All Filters
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WEBHOOKS RECEIVER MANAGEMENT */}
      {activeTab === "webhooks" && (
        <div className="space-y-4">
          <div className="bg-[#E3F3FF] border border-[#A9CDEE] p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">
                  Owner's Local OS API Hook Registries & Handlers
                </h3>
                <p className="text-xs text-slate-500 font-sans mt-0.5">
                  Listen to inbound lead captures or push billing and diagnostic records externally.
                </p>
              </div>
              <button
                onClick={() => {
                  triggerNotification("🔄 Repinged pending webhook retries. Dispatched 1 failed packet.");
                  setWebhookLogs((prev) =>
                    prev.map((l) => (l.status === "Failed" ? { ...l, status: "Delivered", retryCount: l.retryCount + 1 } : l))
                  );
                }}
                className="px-3 py-1.5 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] border border-[#9EC8EF] rounded-xl text-xs font-bold font-sans cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="h-3 w-3" />
                Retry Failed Hooks
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="p-4 bg-white/65 rounded-xl border border-[#A9CDEE]/60 space-y-2.5 text-xs text-left">
                <span className="px-2 py-0.5 bg-emerald-55 border border-emerald-200 text-emerald-700 font-mono font-bold text-[9px] uppercase rounded">
                  Incoming Receivers (Inbound)
                </span>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Send POST JSON payloads from external builders to update your CRM.
                </p>
                <div className="font-mono bg-slate-50 p-2 border border-slate-200 rounded text-[10px] select-all break-all text-slate-700">
                  https://api.ownerslocal.local/webhooks/incoming_leads?token=wh_2026_xyz
                </div>
              </div>

              <div className="p-4 bg-white/65 rounded-xl border border-[#A9CDEE]/60 space-y-2.5 text-xs text-left">
                <span className="px-2 py-0.5 bg-blue-55 border border-blue-200 text-blue-700 font-mono font-bold text-[9px] uppercase rounded">
                  Outgoing Delivery Webhooks
                </span>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Owner's Local OS triggers POST queries to Zapier or internal endpoints when jobs finish.
                </p>
                <div className="font-mono bg-slate-50 p-2 border border-slate-200 rounded text-[10px] select-all break-all text-slate-700">
                  https://hooks.zapier.com/hooks/catch/91845/leads_sync_endpoint
                </div>
              </div>

              <div className="p-4 bg-white/65 rounded-xl border border-[#A9CDEE]/60 space-y-2 text-xs text-left">
                <h4 className="text-[11px] font-bold text-slate-800">Event Type Checklist</h4>
                <div className="space-y-1 text-[10.5px]">
                  {[
                    "lead.created (Inbound profile updates)",
                    "job.completed (Trigger invoices)",
                    "message.received (Twilio sync lines)",
                    "invoice.updated (Quickbooks ledger)"
                  ].map((evt) => (
                    <label key={evt} className="flex items-center gap-1.5 text-slate-600 font-sans">
                      <input type="checkbox" defaultChecked className="rounded border-slate-300 text-[#315C9F]" />
                      <span>{evt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Webhook log list */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-[#A9CDEE] rounded-xl overflow-hidden">
                <thead className="bg-[#C7E3FB] text-slate-700 font-sans font-bold">
                  <tr>
                    <th className="p-2.5">Hook Event ID</th>
                    <th className="p-2.5">Endpoint Type</th>
                    <th className="p-2.5">Event Name</th>
                    <th className="p-2.5">Time Triggered</th>
                    <th className="p-2.5 text-right">Payload Size</th>
                    <th className="p-2.5 text-center">Status</th>
                    <th className="p-2.5 text-center">Retries</th>
                  </tr>
                </thead>
                <tbody className="bg-white text-slate-600 font-sans">
                  {webhookLogs.map((wh) => (
                    <tr key={wh.id} className="border-b border-[#A9CDEE]/30 hover:bg-slate-50">
                      <td className="p-2.5 font-mono font-bold text-[#315C9F]">{wh.id}</td>
                      <td className="p-2.5">
                        <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${
                          wh.type === "Incoming" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-blue-55 text-blue-700 border border-blue-200"
                        }`}>
                          {wh.type}
                        </span>
                      </td>
                      <td className="p-2.5 font-semibold text-slate-800">{wh.eventType}</td>
                      <td className="p-2.5 font-mono text-[10.5px]">{wh.timestamp}</td>
                      <td className="p-2.5 font-mono text-right">{wh.payloadSize}</td>
                      <td className="p-2.5 text-center">
                        <span className={`px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded ${
                          wh.status === "Delivered" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                          wh.status === "Failed" ? "bg-rose-50 text-rose-600 border border-rose-100" :
                          "bg-amber-50 text-amber-600 border border-amber-100"
                        }`}>
                          {wh.status}
                        </span>
                      </td>
                      <td className="p-2.5 font-mono text-center font-bold">{wh.retryCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SYNC LOG & HISTORY */}
      {activeTab === "logs" && (
        <div className="space-y-4">
          <div className="bg-[#E3F3FF] border border-[#A9CDEE] p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">
                  Operational Event Sync Ledger
                </h3>
                <p className="text-xs text-slate-500 font-sans mt-0.5">
                  Audit trail recording automated synchronization packets and payload counts.
                </p>
              </div>
              <button
                onClick={() => {
                  setSyncLogs([]);
                  triggerNotification("🧹 Cleared operations sync ledger.");
                }}
                className="px-2.5 py-1 text-xs font-bold text-slate-500 border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Clear Ledger
              </button>
            </div>

            {/* Sync Logs Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-[#A9CDEE] rounded-xl overflow-hidden">
                <thead className="bg-[#C7E3FB] text-slate-700 font-sans font-bold">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Time</th>
                    <th className="p-2.5">Integration ID</th>
                    <th className="p-2.5">Integration Service</th>
                    <th className="p-2.5 text-center">Mutated Records</th>
                    <th className="p-2.5 text-center">Errors</th>
                    <th className="p-2.5">Sync Status Message</th>
                    <th className="p-2.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white text-slate-600 font-sans">
                  {syncLogs.map((log) => (
                    <tr key={log.id} className="border-b border-[#A9CDEE]/30 hover:bg-slate-50">
                      <td className="p-2.5 font-mono text-[10.5px] text-slate-500">{log.date}</td>
                      <td className="p-2.5 font-mono text-[10.5px] text-slate-500">{log.time}</td>
                      <td className="p-2.5 font-mono text-[10.5px] font-bold text-slate-800">{log.integrationId}</td>
                      <td className="p-2.5 font-semibold text-slate-800">{log.integrationName}</td>
                      <td className="p-2.5 text-center font-mono font-bold text-slate-700">{log.recordsUpdated}</td>
                      <td className="p-2.5 text-center font-mono font-bold text-rose-600">{log.errors}</td>
                      <td className="p-2.5 font-medium leading-relaxed">{log.message}</td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() => {
                            handleSyncNow(log.integrationId);
                          }}
                          className="px-2 py-1 bg-[#BDDDF8] hover:bg-[#A1CEF4] text-[#315C9F] rounded-lg text-[9px] font-extrabold uppercase"
                        >
                          Retry Sync
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL POPUP & CONFIGURATION MODAL */}
      {isDetailPopupOpen && selectedIntegration && (
        <div className="fixed inset-0 bg-[#000000]/40 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-xs">
          <div className="bg-[#C7E3FB] max-w-2xl w-full rounded-3xl p-6 border border-[#A9CDEE] shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-[#A9CDEE] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{selectedIntegration.logo}</span>
                <div>
                  <h3 className="text-sm font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">
                    {selectedIntegration.name} Integration Configuration
                  </h3>
                  <p className="text-[11px] text-slate-500 font-sans font-semibold">
                    Developer: {selectedIntegration.developer} • Protocol: {selectedIntegration.apiType}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDetailPopupOpen(false)}
                className="p-1 hover:bg-white/40 rounded-xl transition-colors cursor-pointer"
              >
                <X className="h-4 w-4 text-slate-600" />
              </button>
            </div>

            {/* Modal Internal Tabs */}
            <div className="flex border-b border-[#A9CDEE] gap-1 pb-px text-xs">
              {[
                { key: "overview", label: "Overview" },
                { key: "api_keys", label: "API Keys & Auth" },
                { key: "webhooks", label: "Webhooks Config" },
                { key: "logs", label: "Recent Sync logs" },
                { key: "ai_setup", label: "AI Setup Node" }
              ].map((mTab) => (
                <button
                  key={mTab.key}
                  type="button"
                  onClick={() => setDetailTab(mTab.key as any)}
                  className={`px-3 py-1.5 font-sans font-bold uppercase tracking-wider transition-all cursor-pointer rounded-t-lg ${
                    detailTab === mTab.key
                      ? "bg-[#E3F3FF] text-[#342D7E] border-t border-x border-[#A9CDEE]"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {mTab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSaveIntegrationConfig} className="space-y-4">
              {/* OVERVIEW TAB */}
              {detailTab === "overview" && (
                <div className="space-y-3 bg-[#E3F3FF] p-4 rounded-xl border border-[#A9CDEE]/60">
                  <div className="grid grid-cols-2 gap-4 text-xs font-sans">
                    <div>
                      <span className="block text-slate-400 font-bold uppercase text-[9px]">Connection Status</span>
                      <span className={`inline-block font-bold px-2 py-0.5 rounded text-[10px] uppercase mt-1 ${
                        selectedIntegration.connected ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-[#F5FAFF] text-slate-400 border border-[#A9CDEE]"
                      }`}>
                        {selectedIntegration.connected ? "Connected" : "Disconnected"}
                      </span>
                    </div>

                    <div>
                      <span className="block text-slate-400 font-bold uppercase text-[9px]">Sync Frequency</span>
                      <select
                        value={selectedIntegration.syncFrequency}
                        onChange={(e) =>
                          setSelectedIntegration({
                            ...selectedIntegration,
                            syncFrequency: e.target.value as any
                          })
                        }
                        className="mt-1 bg-white border border-[#A9CDEE] rounded-lg px-2 py-1 text-xs focus:outline-none"
                      >
                        <option value="Manual">Manual</option>
                        <option value="Every 5 Minutes">Every 5 Minutes</option>
                        <option value="Every 15 Minutes">Every 15 Minutes</option>
                        <option value="Every Hour">Every Hour</option>
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Custom">Custom</option>
                      </select>
                    </div>

                    <div>
                      <span className="block text-slate-400 font-bold uppercase text-[9px]">API Usage (Today)</span>
                      <span className="block font-mono font-bold mt-1 text-slate-700">
                        {selectedIntegration.apiUsage.current.toLocaleString()} / {selectedIntegration.apiUsage.limit.toLocaleString()} Calls
                      </span>
                    </div>

                    <div>
                      <span className="block text-slate-400 font-bold uppercase text-[9px]">Last Successful Sync</span>
                      <span className="block font-sans font-medium text-slate-600 mt-1">
                        {selectedIntegration.connected ? selectedIntegration.lastSync : "Never"}
                      </span>
                    </div>

                    <div className="col-span-2">
                      <span className="block text-slate-400 font-bold uppercase text-[9px]">Required Scopes Authorized</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedIntegration.scopes.map((s) => (
                          <span key={s} className="px-1.5 py-0.5 bg-[#F5FAFF] text-slate-600 border border-[#A9CDEE] rounded font-mono text-[9px]">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="col-span-2">
                      <span className="block text-slate-400 font-bold uppercase text-[9px]">Connected Modules</span>
                      <p className="text-[10.5px] mt-1 text-slate-600 leading-normal font-sans">
                        {selectedIntegration.id === "google_calendar" && "✓ updates Scheduling planner."}
                        {selectedIntegration.id === "quickbooks" && "✓ translates closed operational records to Bookkeeping Ledger."}
                        {selectedIntegration.id === "stripe" && "✓ streams real-time field card transactions into Revenue ledger."}
                        {selectedIntegration.id === "google_business" && "✓ synchronizes Google reviews and updates CRM Leads."}
                        {selectedIntegration.id === "twilio" && "✓ updates CRM Inbox message logs and triggers confirmation dispatch SMS."}
                        {selectedIntegration.id === "google_drive" && "✓ uploads diagnostic site layouts and contract PDF documents."}
                        {selectedIntegration.id === "google_maps" && "✓ updates Dispatch travel matrices and driver active route maps."}
                        {selectedIntegration.id === "gemini" && "✓ powers smart intelligence algorithms in AI Assistant page."}
                        {!["google_calendar", "quickbooks", "stripe", "google_business", "twilio", "google_drive", "google_maps", "gemini"].includes(selectedIntegration.id) && 
                          "No direct shared modules currently connected. Create custom webhook trigger logic to link modules."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* API KEYS TAB */}
              {detailTab === "api_keys" && (
                <div className="space-y-3 bg-[#E3F3FF] p-4 rounded-xl border border-[#A9CDEE]/60 text-xs">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Secure Client / API Key
                      </label>
                      <div className="relative">
                        <Key className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="e.g. AIzaSy..."
                          value={selectedIntegration.apiKey || ""}
                          onChange={(e) =>
                            setSelectedIntegration({
                              ...selectedIntegration,
                              apiKey: e.target.value
                            })
                          }
                          className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#A9CDEE] rounded-lg text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Secret Token / Signing Salt
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••••••••••••••"
                        value={selectedIntegration.apiSecret || ""}
                        onChange={(e) =>
                          setSelectedIntegration({
                            ...selectedIntegration,
                            apiSecret: e.target.value
                          })
                        }
                        className="w-full px-3 py-1.5 bg-white border border-[#A9CDEE] rounded-lg text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        OAuth Redirect URI
                      </label>
                      <input
                        type="text"
                        value={selectedIntegration.redirectUri || "https://ownerslocal.local/oauth/callback"}
                        disabled
                        className="w-full px-3 py-1.5 bg-slate-100 border border-[#A9CDEE] rounded-lg text-xs font-mono text-slate-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#A9CDEE]/50">
                    <button
                      type="button"
                      onClick={() => handleTestConnection(selectedIntegration.id)}
                      className="px-3 py-1 bg-[#BDDDF8] text-[#315C9F] border border-[#9EC8EF] hover:bg-[#A1CEF4] rounded-lg text-xs font-bold font-sans cursor-pointer"
                    >
                      Test Connection
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIntegration({
                          ...selectedIntegration,
                          apiKey: "AIzaSy_" + Math.random().toString(36).substring(2, 10).toUpperCase(),
                          apiSecret: "sec_" + Math.random().toString(36).substring(2, 12)
                        });
                        triggerNotification(`🔑 Keys rotated for ${selectedIntegration.name}. Click save to write changes.`);
                      }}
                      className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 rounded-lg text-xs font-bold font-sans cursor-pointer"
                    >
                      Rotate Keys
                    </button>
                  </div>
                </div>
              )}

              {/* WEBHOOKS CONFIG TAB */}
              {detailTab === "webhooks" && (
                <div className="space-y-3 bg-[#E3F3FF] p-4 rounded-xl border border-[#A9CDEE]/60 text-xs text-left">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Webhooks URL Endpoint
                    </label>
                    <input
                      type="text"
                      placeholder="https://yourserver.com/hooks/receive"
                      value={selectedIntegration.webhookUrl || ""}
                      onChange={(e) =>
                        setSelectedIntegration({
                          ...selectedIntegration,
                          webhookUrl: e.target.value
                        })
                      }
                      className="w-full px-3 py-1.5 bg-white border border-[#A9CDEE] rounded-lg text-xs font-mono"
                    />
                  </div>

                  <div className="p-3 bg-[#F5FAFF] border border-[#A9CDEE]/50 rounded-lg text-[10.5px] leading-relaxed text-slate-600">
                    <h4 className="font-bold text-slate-800 uppercase text-[9.5px] tracking-wider mb-1">
                      Payload Guidelines
                    </h4>
                    All inbound webhooks trigger structural sync queries directly within our Owner's Local OS Shared Event Engine. Every completed module automatically updates when external data changes. There is never duplicate data.
                  </div>
                </div>
              )}

              {/* LOCAL LOGS TAB */}
              {detailTab === "logs" && (
                <div className="space-y-2 bg-[#E3F3FF] p-4 rounded-xl border border-[#A9CDEE]/60 text-xs">
                  <span className="block text-[10px] font-bold uppercase text-slate-500">
                    Recent Sync History for {selectedIntegration.name}
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {syncLogs.filter(l => l.integrationId === selectedIntegration.id).map(l => (
                      <div key={l.id} className="p-2 bg-white rounded-lg border border-slate-200 flex justify-between items-center text-[10.5px]">
                        <div>
                          <span className="font-bold text-slate-700">[{l.date} {l.time}] </span>
                          <span className="text-slate-600">{l.message}</span>
                        </div>
                        <span className={`font-mono text-[9px] px-1 font-bold rounded ${
                          l.status === "Success" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                        }`}>
                          {l.status}
                        </span>
                      </div>
                    ))}
                    {syncLogs.filter(l => l.integrationId === selectedIntegration.id).length === 0 && (
                      <div className="text-center py-6 text-slate-400">
                        No logs recorded yet. Try running "Sync Now".
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* AI SETUP TAB */}
              {detailTab === "ai_setup" && (
                <div className="space-y-3 bg-[#E3F3FF] p-4 rounded-xl border border-[#A9CDEE]/60 text-xs text-left">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="block text-[10.5px] font-bold text-slate-800">
                        AI Autonomy Mode
                      </span>
                      <p className="text-[10px] text-slate-500 font-sans">
                        Let AI parse incoming webhook records or request sync logs autonomously.
                      </p>
                    </div>

                    {/* Toggle */}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedIntegration({
                          ...selectedIntegration,
                          aiEnabled: !selectedIntegration.aiEnabled
                        })
                      }
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        selectedIntegration.aiEnabled ? "bg-indigo-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out mt-[1px] ${
                          selectedIntegration.aiEnabled ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  {selectedIntegration.aiEnabled && (
                    <div className="space-y-2.5 pt-2 border-t border-[#A9CDEE]/50">
                      <span className="block text-[10px] font-bold uppercase text-slate-500">
                        Autonomy Autopilot Level
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[
                          { key: "OFF", label: "OFF", desc: "No intelligence parsing on endpoints." },
                          { key: "ASSIST", label: "ASSIST", desc: "Generates suggestions for logs." },
                          { key: "ASSIST + APPROVAL", label: "APPROVAL MODE", desc: "Generates changes, demands owner click authorization." },
                          { key: "AUTO", label: "AUTOPILOT", desc: "Directly executes mutations into Event Engine." }
                        ].map((m) => (
                          <div
                            key={m.key}
                            onClick={() =>
                              setSelectedIntegration({
                                ...selectedIntegration,
                                aiMode: m.key as any
                              })
                            }
                            className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                              selectedIntegration.aiMode === m.key
                                ? "bg-indigo-50 border-indigo-300 text-indigo-800 font-bold"
                                : "bg-white hover:bg-slate-50 border-slate-200"
                            }`}
                          >
                            <div className="text-[10px] uppercase">{m.label}</div>
                            <div className="text-[9px] font-medium text-slate-400 font-sans mt-0.5 leading-normal">
                              {m.desc}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5 p-2 bg-slate-50 rounded border border-slate-200 text-[10px] text-slate-500 font-sans leading-relaxed">
                        <Info className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" />
                        <span>AI decisions will strictly respect configured Owner/Manager permissions matrix.</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MODAL BOTTOM BUTTONS */}
              <div className="flex items-center justify-between pt-2 border-t border-[#A9CDEE] text-xs">
                {selectedIntegration.connected ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleToggleConnection(selectedIntegration.id);
                      setSelectedIntegration({
                        ...selectedIntegration,
                        connected: false
                      });
                    }}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold font-sans cursor-pointer"
                  >
                    Disconnect Integration
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      handleToggleConnection(selectedIntegration.id);
                      setSelectedIntegration({
                        ...selectedIntegration,
                        connected: true
                      });
                    }}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold font-sans cursor-pointer"
                  >
                    Connect Integration
                  </button>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleSyncNow(selectedIntegration.id);
                    }}
                    disabled={!selectedIntegration.connected}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold font-sans cursor-pointer ${
                      selectedIntegration.connected
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                        : "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300"
                    }`}
                  >
                    Force Sync Now
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-[#315C9F] hover:bg-[#254A84] text-white rounded-xl text-xs font-bold font-sans cursor-pointer shadow-sm"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GLOBAL AI SETUP POPUP */}
      {isAiSetupOpen && (
        <div className="fixed inset-0 bg-[#000000]/40 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-xs">
          <div className="bg-[#C7E3FB] max-w-md w-full rounded-3xl p-6 border border-[#A9CDEE] shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-[#A9CDEE] pb-3">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-indigo-600" />
                <h3 className="text-sm font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">
                  Global Integration AI Setup
                </h3>
              </div>
              <button
                onClick={() => setIsAiSetupOpen(false)}
                className="p-1 hover:bg-white/40 rounded-xl transition-colors cursor-pointer"
              >
                <X className="h-4 w-4 text-slate-600" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-sans">
              Each connected integration can independently run background AI pipelines. Suggestions always respect the owner's module permissions configuration.
            </p>

            <div className="space-y-3">
              {[
                { key: "all_auto", label: "Trigger Autopilot globally", desc: "Enables 'AUTO' mode across all connected integrations." },
                { key: "all_approval", label: "Require approval globally", desc: "Forces 'ASSIST + APPROVAL' mode on all nodes." },
                { key: "all_off", label: "Disable Integration AI completely", desc: "Resets all nodes to 'OFF'." }
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => {
                    setIntegrations((prev) =>
                      prev.map((item) => ({
                        ...item,
                        aiEnabled: opt.key !== "all_off",
                        aiMode: opt.key === "all_auto" ? "AUTO" : opt.key === "all_approval" ? "ASSIST + APPROVAL" : "OFF"
                      }))
                    );
                    setIsAiSetupOpen(false);
                    triggerNotification(`✨ Updated global Integration AI parameters.`);
                  }}
                  className="w-full text-left p-3 bg-[#E3F3FF] hover:bg-[#D5EAFE] border border-[#A9CDEE] rounded-xl text-xs space-y-0.5 transition-colors cursor-pointer flex flex-col"
                >
                  <span className="font-bold text-slate-800">{opt.label}</span>
                  <span className="text-[10.5px] text-slate-400 font-sans font-medium">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ADD INTEGRATION MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-[#000000]/40 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-xs">
          <div className="bg-[#C7E3FB] max-w-md w-full rounded-3xl p-6 border border-[#A9CDEE] shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-[#A9CDEE] pb-3">
              <h3 className="text-sm font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">
                Add Custom Integration Node
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 hover:bg-white/40 rounded-xl transition-colors cursor-pointer"
              >
                <X className="h-4 w-4 text-slate-600" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomIntegration} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Custom Node / Service Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Dispatch API"
                  value={newIntegrationName}
                  onChange={(e) => setNewIntegrationName(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Category
                </label>
                <select
                  value={newIntegrationCategory}
                  onChange={(e) => setNewIntegrationCategory(e.target.value as any)}
                  className="w-full bg-white border border-[#A9CDEE] rounded-xl px-2.5 py-2 text-xs"
                >
                  <option value="Custom">Custom Node</option>
                  <option value="Accounting">Accounting</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Communication">Communication</option>
                  <option value="CRM">CRM</option>
                  <option value="Payments">Payments</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Brief Functional Description
                </label>
                <textarea
                  placeholder="What is this custom API endpoint used for?"
                  value={newIntegrationDesc}
                  onChange={(e) => setNewIntegrationDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-white border border-[#A9CDEE] rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#A9CDEE]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#315C9F] text-white hover:bg-[#254A84] rounded-xl font-bold cursor-pointer"
                >
                  Add Node
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntegrationsPage;
