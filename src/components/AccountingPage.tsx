import React, { useState, useMemo } from "react";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { useAuth } from "../context/AuthContext";
import { hasPermission } from "../types/permissions";
import {
  Account,
  JournalEntry,
  Invoice,
  Bill,
  Vendor,
  BankAccount,
  RecurringTransaction,
  MileageLog,
  Budget,
  InvoiceLineItem,
  BankAccountType,
  computeAccountBalance,
  isBalancedEntry
} from "../types/accounting";
import {
  postInvoiceCreatedEntry,
  postInvoicePaymentEntry,
  postBillCreatedEntry,
  postBillPaymentEntry,
  postRefundEntry,
  invoiceTotal
} from "../lib/accountingEngine";
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Landmark,
  Wallet,
  BookOpen,
  PieChart,
  Car,
  Repeat,
  Target,
  Sparkles,
  Plus,
  X,
  Check,
  Lock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Users,
  ChevronRight,
  Download,
  Loader2,
  CreditCard,
  Building,
  Trash2,
  ClipboardList,
  ScrollText
} from "lucide-react";

type AccountingTab =
  | "dashboard"
  | "invoices"
  | "bills"
  | "vendors"
  | "banking"
  | "chart_of_accounts"
  | "journal"
  | "reports"
  | "mileage"
  | "recurring"
  | "budgets"
  | "ai";

const TABS: Array<{ id: AccountingTab; label: string; icon: React.ReactNode }> = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  { id: "invoices", label: "Invoices", icon: <FileText className="w-3.5 h-3.5" /> },
  { id: "bills", label: "Bills", icon: <Receipt className="w-3.5 h-3.5" /> },
  { id: "vendors", label: "Vendors", icon: <Users className="w-3.5 h-3.5" /> },
  { id: "banking", label: "Banking", icon: <Landmark className="w-3.5 h-3.5" /> },
  { id: "chart_of_accounts", label: "Chart of Accounts", icon: <BookOpen className="w-3.5 h-3.5" /> },
  { id: "journal", label: "Journal Entries", icon: <ScrollText className="w-3.5 h-3.5" /> },
  { id: "reports", label: "Reports", icon: <PieChart className="w-3.5 h-3.5" /> },
  { id: "mileage", label: "Mileage", icon: <Car className="w-3.5 h-3.5" /> },
  { id: "recurring", label: "Recurring", icon: <Repeat className="w-3.5 h-3.5" /> },
  { id: "budgets", label: "Budgets", icon: <Target className="w-3.5 h-3.5" /> },
  { id: "ai", label: "AI Insights", icon: <Sparkles className="w-3.5 h-3.5" /> }
];

const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (dateStr: string, days: number) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.floor((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function invoiceBalanceDue(inv: Invoice): number {
  return Math.max(0, invoiceTotal(inv) - inv.amountPaid);
}
function billTotal(bill: Bill): number {
  return bill.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
}
function billBalanceDue(bill: Bill): number {
  return Math.max(0, billTotal(bill) - bill.amountPaid);
}

const BANK_TYPE_LABELS: Record<BankAccountType, string> = {
  checking: "Checking Account",
  savings: "Savings Account",
  credit_card: "Business Credit Card",
  loan: "Loan",
  line_of_credit: "Line of Credit",
  merchant_account: "Merchant Account"
};

export const AccountingPage: React.FC = () => {
  const {
    accounts,
    setAccounts,
    journalEntries,
    setJournalEntries,
    invoices,
    setInvoices,
    bills,
    setBills,
    vendors,
    setVendors,
    bankAccounts,
    setBankAccounts,
    recurringTransactions,
    setRecurringTransactions,
    mileageLogs,
    setMileageLogs,
    budgets,
    setBudgets,
    salesTaxRates,
    setSalesTaxRates,
    transactions,
    revenueEvents,
    customers,
    estimates,
    employees,
    inventoryList
  } = useDomainData();
  const { triggerNotification, logOperationalEvent } = useNavTelemetry();
  const { loggedInUser, simulatedRole } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const canEdit = activeRole === "Owner" || hasPermission(loggedInUser?.granularPermissions, "accounting", "edit");
  const canDelete = activeRole === "Owner" || hasPermission(loggedInUser?.granularPermissions, "accounting", "delete");

  const [activeTab, setActiveTab] = useState<AccountingTab>("dashboard");

  // ---- Derived, real numbers -- every figure below is computed from real
  // journal entries / invoices / bills, never a separately-tracked total. ----
  const accountBalances = useMemo(() => {
    const map: Record<string, number> = {};
    for (const acct of accounts) map[acct.id] = computeAccountBalance(acct, journalEntries);
    return map;
  }, [accounts, journalEntries]);

  const cashBalance = accountBalances["acct_cash"] || 0;
  const arBalance = accountBalances["acct_ar"] || 0;
  const apBalance = accountBalances["acct_ap"] || 0;

  const totalRevenue = useMemo(
    () => accounts.filter(a => a.type === "revenue").reduce((s, a) => s + (accountBalances[a.id] || 0), 0),
    [accounts, accountBalances]
  );
  const totalExpenses = useMemo(
    () => accounts.filter(a => a.type === "expense").reduce((s, a) => s + (accountBalances[a.id] || 0), 0),
    [accounts, accountBalances]
  );
  const netIncome = totalRevenue - totalExpenses;

  const totalAssets = useMemo(
    () => accounts.filter(a => a.type === "asset").reduce((s, a) => s + (accountBalances[a.id] || 0), 0),
    [accounts, accountBalances]
  );
  const totalLiabilities = useMemo(
    () => accounts.filter(a => a.type === "liability").reduce((s, a) => s + (accountBalances[a.id] || 0), 0),
    [accounts, accountBalances]
  );
  const totalEquityAccounts = useMemo(
    () => accounts.filter(a => a.type === "equity").reduce((s, a) => s + (accountBalances[a.id] || 0), 0),
    [accounts, accountBalances]
  );
  // Books aren't formally "closed" each period (no separate closing-entry
  // step), so current-year net income is shown as its own equity line
  // rather than folded into Retained Earnings -- the accounting equation
  // (Assets = Liabilities + Equity) holds exactly because every entry that
  // touches Revenue/Expense also touches a real Asset/Liability account.
  const totalEquity = totalEquityAccounts + netIncome;

  const pendingRevenue = useMemo(() => {
    const invoicedEstimateIds = new Set(invoices.map(i => i.estimateId).filter(Boolean));
    return estimates
      .filter(e => e.status === "Accepted" && !invoicedEstimateIds.has(e.id))
      .reduce((s, e) => s + e.amount, 0);
  }, [estimates, invoices]);

  const openInvoices = useMemo(() => invoices.filter(i => i.status !== "paid" && i.status !== "void"), [invoices]);
  const openBills = useMemo(() => bills.filter(b => b.status !== "paid" && b.status !== "void"), [bills]);

  const arAging = useMemo(() => {
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    const today = todayStr();
    for (const inv of openInvoices) {
      const bal = invoiceBalanceDue(inv);
      if (bal <= 0) continue;
      const overdue = daysBetween(today, inv.dueDate) * -1;
      if (overdue <= 0) buckets.current += bal;
      else if (overdue <= 30) buckets.d30 += bal;
      else if (overdue <= 60) buckets.d60 += bal;
      else if (overdue <= 90) buckets.d90 += bal;
      else buckets.d90plus += bal;
    }
    return buckets;
  }, [openInvoices]);

  const apAging = useMemo(() => {
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    const today = todayStr();
    for (const bill of openBills) {
      const bal = billBalanceDue(bill);
      if (bal <= 0) continue;
      const overdue = daysBetween(today, bill.dueDate) * -1;
      if (overdue <= 0) buckets.current += bal;
      else if (overdue <= 30) buckets.d30 += bal;
      else if (overdue <= 60) buckets.d60 += bal;
      else if (overdue <= 90) buckets.d90 += bal;
      else buckets.d90plus += bal;
    }
    return buckets;
  }, [openBills]);

  if (!canEdit && !hasPermission(loggedInUser?.granularPermissions, "accounting", "view")) {
    return (
      <div className="p-8 bg-white border border-[#9EC8EF] rounded-[28px] text-center max-w-md mx-auto my-12 space-y-4">
        <Lock className="w-12 h-12 text-[#5E7393] mx-auto" />
        <h2 className="text-lg font-bold text-[#1F3557]">Restricted Access</h2>
        <p className="text-xs text-[#5E7393] font-sans leading-relaxed">
          Your role ({activeRole}) doesn't have permission to view Accounting & Bookkeeping.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in text-left">
      {/* HEADER */}
      <div className="bg-[#C7E3FA] rounded-3xl p-5 border border-[#9EC8EF] shadow-sm">
        <h2 className="text-lg font-sans font-extrabold text-[#1F3557] uppercase tracking-wider flex items-center gap-2">
          <Landmark className="w-5 h-5 text-[#315C9F]" /> Accounting &amp; Bookkeeping
        </h2>
        <p className="text-xs text-[#5E7393] font-sans font-semibold mt-1">
          Real double-entry books, synced automatically with every real event across the app.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 rounded-xl text-[10.5px] font-bold uppercase tracking-wide flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === t.id ? "bg-[#315C9F] text-white shadow-sm" : "bg-[#EAF5FF] text-[#1F3557] hover:bg-white"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "dashboard" && (
        <DashboardTab
          cashBalance={cashBalance}
          arBalance={arBalance}
          apBalance={apBalance}
          totalRevenue={totalRevenue}
          totalExpenses={totalExpenses}
          netIncome={netIncome}
          pendingRevenue={pendingRevenue}
          arAging={arAging}
          apAging={apBalance > 0 ? apAging : apAging}
          openInvoiceCount={openInvoices.length}
          openBillCount={openBills.length}
        />
      )}

      {activeTab === "invoices" && (
        <InvoicesTab
          invoices={invoices}
          setInvoices={setInvoices}
          setJournalEntries={setJournalEntries}
          customers={customers}
          salesTaxRates={salesTaxRates}
          canEdit={canEdit}
          triggerNotification={triggerNotification}
          logOperationalEvent={logOperationalEvent}
          loggedInUser={loggedInUser}
        />
      )}

      {activeTab === "bills" && (
        <BillsTab
          bills={bills}
          setBills={setBills}
          setJournalEntries={setJournalEntries}
          vendors={vendors}
          canEdit={canEdit}
          triggerNotification={triggerNotification}
          logOperationalEvent={logOperationalEvent}
          loggedInUser={loggedInUser}
        />
      )}

      {activeTab === "vendors" && (
        <VendorsTab vendors={vendors} setVendors={setVendors} bills={bills} canEdit={canEdit} canDelete={canDelete} triggerNotification={triggerNotification} />
      )}

      {activeTab === "banking" && (
        <BankingTab bankAccounts={bankAccounts} setBankAccounts={setBankAccounts} accounts={accounts} canEdit={canEdit} triggerNotification={triggerNotification} />
      )}

      {activeTab === "chart_of_accounts" && (
        <ChartOfAccountsTab accounts={accounts} setAccounts={setAccounts} accountBalances={accountBalances} canEdit={canEdit} triggerNotification={triggerNotification} />
      )}

      {activeTab === "journal" && (
        <JournalTab
          journalEntries={journalEntries}
          setJournalEntries={setJournalEntries}
          accounts={accounts}
          canEdit={canEdit}
          triggerNotification={triggerNotification}
          loggedInUser={loggedInUser}
        />
      )}

      {activeTab === "reports" && (
        <ReportsTab
          accounts={accounts}
          journalEntries={journalEntries}
          invoices={invoices}
          bills={bills}
          transactions={transactions}
          revenueEvents={revenueEvents}
          estimates={estimates}
          inventoryList={inventoryList}
          accountBalances={accountBalances}
          totalRevenue={totalRevenue}
          totalExpenses={totalExpenses}
          netIncome={netIncome}
        />
      )}

      {activeTab === "mileage" && (
        <MileageTab mileageLogs={mileageLogs} setMileageLogs={setMileageLogs} loggedInUser={loggedInUser} canEdit={canEdit} triggerNotification={triggerNotification} />
      )}

      {activeTab === "recurring" && (
        <RecurringTab
          recurringTransactions={recurringTransactions}
          setRecurringTransactions={setRecurringTransactions}
          setInvoices={setInvoices}
          setBills={setBills}
          setJournalEntries={setJournalEntries}
          canEdit={canEdit}
          triggerNotification={triggerNotification}
        />
      )}

      {activeTab === "budgets" && (
        <BudgetsTab budgets={budgets} setBudgets={setBudgets} accounts={accounts} accountBalances={accountBalances} canEdit={canEdit} triggerNotification={triggerNotification} />
      )}

      {activeTab === "ai" && (
        <AIInsightsTab
          totalRevenue={totalRevenue}
          totalExpenses={totalExpenses}
          netIncome={netIncome}
          cashBalance={cashBalance}
          arBalance={arBalance}
          apBalance={apBalance}
          accounts={accounts}
          accountBalances={accountBalances}
          invoices={invoices}
          bills={bills}
          transactions={transactions}
          loggedInUser={loggedInUser}
        />
      )}
    </div>
  );
};

// ============================================================================
// DASHBOARD
// ============================================================================
function AgingBar({ label, buckets }: { label: string; buckets: { current: number; d30: number; d60: number; d90: number; d90plus: number } }) {
  const total = buckets.current + buckets.d30 + buckets.d60 + buckets.d90 + buckets.d90plus;
  return (
    <div className="bg-white/70 border border-[#9EC8EF]/40 rounded-2xl p-3.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase font-black text-[#5E7393]">{label}</span>
        <span className="text-xs font-black text-[#1F3557]">{fmt(total)}</span>
      </div>
      <div className="grid grid-cols-5 gap-1 text-center">
        {[
          { l: "Current", v: buckets.current },
          { l: "1-30", v: buckets.d30 },
          { l: "31-60", v: buckets.d60 },
          { l: "61-90", v: buckets.d90 },
          { l: "90+", v: buckets.d90plus }
        ].map(b => (
          <div key={b.l} className="bg-[#EAF5FF] rounded-lg py-1.5">
            <p className="text-[8px] text-[#5E7393] font-bold uppercase">{b.l}</p>
            <p className="text-[10px] font-black text-[#1F3557]">{fmt(b.v)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardTab({
  cashBalance,
  arBalance,
  apBalance,
  totalRevenue,
  totalExpenses,
  netIncome,
  pendingRevenue,
  arAging,
  apAging,
  openInvoiceCount,
  openBillCount
}: {
  cashBalance: number;
  arBalance: number;
  apBalance: number;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  pendingRevenue: number;
  arAging: { current: number; d30: number; d60: number; d90: number; d90plus: number };
  apAging: { current: number; d30: number; d60: number; d90: number; d90plus: number };
  openInvoiceCount: number;
  openBillCount: number;
}) {
  const cards = [
    { label: "Cash Balance", val: cashBalance, icon: Wallet, color: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "Accounts Receivable", val: arBalance, icon: FileText, color: "text-blue-600", bg: "bg-blue-500/10", sub: `${openInvoiceCount} open invoice${openInvoiceCount === 1 ? "" : "s"}` },
    { label: "Accounts Payable", val: apBalance, icon: Receipt, color: "text-rose-600", bg: "bg-rose-500/10", sub: `${openBillCount} open bill${openBillCount === 1 ? "" : "s"}` },
    { label: "Net Income (All Time)", val: netIncome, icon: netIncome >= 0 ? TrendingUp : TrendingDown, color: netIncome >= 0 ? "text-emerald-600" : "text-rose-600", bg: netIncome >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10" }
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-[#5E7393] uppercase tracking-wide">{c.label}</span>
              <div className={`p-1.5 rounded-lg ${c.bg} ${c.color}`}>
                <c.icon className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl font-black text-[#1F3557]">{fmt(c.val)}</p>
            {c.sub && <p className="text-[9px] text-[#5E7393] font-semibold mt-0.5">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm">
          <p className="text-[10px] font-bold text-[#5E7393] uppercase">Revenue (All Time)</p>
          <p className="text-lg font-black text-emerald-600 mt-1">{fmt(totalRevenue)}</p>
        </div>
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm">
          <p className="text-[10px] font-bold text-[#5E7393] uppercase">Expenses (All Time)</p>
          <p className="text-lg font-black text-rose-600 mt-1">{fmt(totalExpenses)}</p>
        </div>
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF] shadow-sm">
          <p className="text-[10px] font-bold text-[#5E7393] uppercase flex items-center gap-1">
            Pending Revenue <AlertTriangle className="w-3 h-3 text-amber-500" />
          </p>
          <p className="text-lg font-black text-amber-600 mt-1">{fmt(pendingRevenue)}</p>
          <p className="text-[8.5px] text-[#5E7393] font-medium mt-0.5">Accepted estimates not yet invoiced — not counted in revenue yet</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AgingBar label="Accounts Receivable Aging" buckets={arAging} />
        <AgingBar label="Accounts Payable Aging" buckets={apAging} />
      </div>
    </div>
  );
}

// ============================================================================
// CUSTOMER STATEMENTS -- real per-customer invoice/payment history, derived
// from the same real Invoice records the Invoices table above already shows.
// ============================================================================
function CustomerStatementPicker({ invoices, customers }: { invoices: Invoice[]; customers: any[] }) {
  const [selected, setSelected] = useState("");
  const customerInvoices = useMemo(
    () => invoices.filter(i => i.customer === selected).sort((a, b) => new Date(b.issuedDate).getTime() - new Date(a.issuedDate).getTime()),
    [invoices, selected]
  );
  const totalBilled = customerInvoices.reduce((s, i) => s + invoiceTotal(i), 0);
  const totalPaid = customerInvoices.reduce((s, i) => s + i.amountPaid, 0);
  const totalOwed = totalBilled - totalPaid;

  const printStatement = () => window.print();

  return (
    <div className="bg-white/70 border border-[#9EC8EF]/40 rounded-2xl p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase font-black text-[#5E7393]">Customer Statement</span>
        <div className="flex items-center gap-2">
          <select value={selected} onChange={e => setSelected(e.target.value)} className="border border-[#9EC8EF] rounded-lg px-2 py-1 text-[10px]">
            <option value="">Choose a customer...</option>
            {customers.map((c: any) => <option key={c.id} value={c.company}>{c.company}</option>)}
            {Array.from(new Set(invoices.map(i => i.customer))).filter(c => !customers.some((cu: any) => cu.company === c)).map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {selected && (
            <button onClick={printStatement} className="text-[#315C9F] font-bold text-[10px] hover:underline cursor-pointer">Print</button>
          )}
        </div>
      </div>
      {selected && (
        <div className="text-xs space-y-1.5">
          {customerInvoices.length === 0 ? (
            <p className="text-[#5E7393] text-center py-3">No invoices for {selected} yet.</p>
          ) : (
            <>
              {customerInvoices.map(inv => (
                <div key={inv.id} className="flex justify-between border-b border-[#9EC8EF]/20 py-1">
                  <span>{inv.invoiceNumber} — {inv.issuedDate}</span>
                  <span className="font-mono">{fmt(invoiceTotal(inv))} ({inv.status})</span>
                </div>
              ))}
              <div className="flex justify-between font-bold pt-1.5 border-t border-[#9EC8EF]/40">
                <span>Total Billed / Paid / Owed</span>
                <span className="font-mono">{fmt(totalBilled)} / {fmt(totalPaid)} / {fmt(totalOwed)}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// INVOICES
// ============================================================================
function InvoicesTab({
  invoices,
  setInvoices,
  setJournalEntries,
  customers,
  salesTaxRates,
  canEdit,
  triggerNotification,
  logOperationalEvent,
  loggedInUser
}: any) {
  const [isCreating, setIsCreating] = useState(false);
  const [customer, setCustomer] = useState("");
  const [dueInDays, setDueInDays] = useState(30);
  const [taxRate, setTaxRate] = useState<number>(salesTaxRates.find((r: any) => r.isDefault)?.rate || 0);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([{ id: genId("li"), description: "", quantity: 1, unitPrice: 0 }]);
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");

  const resetForm = () => {
    setCustomer("");
    setDueInDays(30);
    setLineItems([{ id: genId("li"), description: "", quantity: 1, unitPrice: 0 }]);
  };

  const handleCreate = () => {
    if (!customer.trim() || lineItems.every(li => !li.description.trim())) {
      triggerNotification("Add a customer and at least one line item.");
      return;
    }
    const invoice: Invoice = {
      id: genId("inv"),
      invoiceNumber: `INV-${1000 + invoices.length + 1}`,
      customer: customer.trim(),
      lineItems: lineItems.filter(li => li.description.trim()),
      taxRate,
      issuedDate: todayStr(),
      dueDate: addDays(todayStr(), dueInDays),
      status: "sent",
      amountPaid: 0,
      createdAt: new Date().toISOString(),
      createdBy: loggedInUser?.email
    };
    setInvoices((prev: Invoice[]) => [...prev, invoice]);
    setJournalEntries((prev: JournalEntry[]) => [...prev, postInvoiceCreatedEntry(invoice, loggedInUser?.email)]);
    if (logOperationalEvent) logOperationalEvent("Invoice Created", `${invoice.invoiceNumber} for ${invoice.customer}: ${fmt(invoiceTotal(invoice))}`, "🧾");
    triggerNotification(`Invoice ${invoice.invoiceNumber} created for ${fmt(invoiceTotal(invoice))}.`);
    resetForm();
    setIsCreating(false);
  };

  const handleRecordPayment = () => {
    if (!payingInvoice) return;
    const amount = parseFloat(paymentAmount);
    const balanceDue = invoiceBalanceDue(payingInvoice);
    if (!amount || amount <= 0 || amount > balanceDue + 0.01) {
      triggerNotification(`Enter an amount up to the balance due (${fmt(balanceDue)}).`);
      return;
    }
    const newAmountPaid = payingInvoice.amountPaid + amount;
    const total = invoiceTotal(payingInvoice);
    const newStatus: Invoice["status"] = newAmountPaid >= total - 0.01 ? "paid" : "partial";
    setInvoices((prev: Invoice[]) => prev.map(i => (i.id === payingInvoice.id ? { ...i, amountPaid: newAmountPaid, status: newStatus } : i)));
    setJournalEntries((prev: JournalEntry[]) => [...prev, postInvoicePaymentEntry(payingInvoice, amount, loggedInUser?.email)]);
    if (logOperationalEvent) logOperationalEvent("Invoice Payment", `${fmt(amount)} received on ${payingInvoice.invoiceNumber}`, "💰");
    triggerNotification(`Payment of ${fmt(amount)} recorded on ${payingInvoice.invoiceNumber}.`);
    setPayingInvoice(null);
    setPaymentAmount("");
  };

  const overdueUpdated = useMemo(() => {
    const today = todayStr();
    return invoices.map((i: Invoice) => (i.status === "sent" && i.dueDate < today ? { ...i, status: "overdue" as const } : i));
  }, [invoices]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-black text-[#1F3557] uppercase">Invoices</h3>
        {canEdit && (
          <button
            onClick={() => setIsCreating(true)}
            className="px-3 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-bold rounded-xl uppercase tracking-wide flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> New Invoice
          </button>
        )}
      </div>

      <CustomerStatementPicker invoices={invoices} customers={customers} />

      <div className="bg-[#C7E3FA] rounded-2xl border border-[#9EC8EF] shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-[#EAF5FF] text-[10px] font-bold text-[#1F3557] uppercase">
              <th className="px-4 py-3">Invoice #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Balance Due</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#9EC8EF]/30">
            {overdueUpdated.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[#5E7393]">No invoices yet.</td>
              </tr>
            )}
            {overdueUpdated.map((inv: Invoice) => (
              <tr key={inv.id} className="hover:bg-[#BDDDF8]">
                <td className="px-4 py-3 font-bold text-[#1F3557]">{inv.invoiceNumber}</td>
                <td className="px-4 py-3">{inv.customer}</td>
                <td className="px-4 py-3 text-right font-mono">{fmt(invoiceTotal(inv))}</td>
                <td className="px-4 py-3 text-right font-mono font-bold">{fmt(invoiceBalanceDue(inv))}</td>
                <td className="px-4 py-3 font-mono text-[#5E7393]">{inv.dueDate}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                      inv.status === "paid"
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                        : inv.status === "overdue"
                        ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                        : "bg-slate-500/10 text-slate-600 border-slate-500/20"
                    }`}
                  >
                    {inv.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {canEdit && invoiceBalanceDue(inv) > 0 && (
                    <button
                      onClick={() => {
                        setPayingInvoice(inv);
                        setPaymentAmount(invoiceBalanceDue(inv).toFixed(2));
                      }}
                      className="text-[#315C9F] font-bold text-[10px] hover:underline cursor-pointer"
                    >
                      Record Payment
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isCreating && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-5 w-[95%] max-w-[520px] shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-black text-[#1F3557] uppercase">New Invoice</h3>
              <button onClick={() => setIsCreating(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[9px] uppercase text-slate-400 font-bold">Customer</label>
                <input list="customer-options" value={customer} onChange={e => setCustomer(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1" placeholder="Customer name" />
                <datalist id="customer-options">
                  {customers.map((c: any) => <option key={c.id} value={c.company} />)}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] uppercase text-slate-400 font-bold">Due In (Days)</label>
                  <input type="number" value={dueInDays} onChange={e => setDueInDays(parseInt(e.target.value) || 0)} className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1" />
                </div>
                <div>
                  <label className="text-[9px] uppercase text-slate-400 font-bold">Tax Rate (%)</label>
                  <input type="number" step="0.01" value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] uppercase text-slate-400 font-bold">Line Items</label>
                {lineItems.map((li, idx) => (
                  <div key={li.id} className="grid grid-cols-[1fr_60px_80px_24px] gap-1.5 items-center">
                    <input
                      value={li.description}
                      onChange={e => setLineItems(prev => prev.map(x => (x.id === li.id ? { ...x, description: e.target.value } : x)))}
                      placeholder="Description"
                      className="border border-slate-200 rounded-lg px-2 py-1.5"
                    />
                    <input
                      type="number"
                      value={li.quantity}
                      onChange={e => setLineItems(prev => prev.map(x => (x.id === li.id ? { ...x, quantity: parseFloat(e.target.value) || 0 } : x)))}
                      className="border border-slate-200 rounded-lg px-2 py-1.5"
                    />
                    <input
                      type="number"
                      value={li.unitPrice}
                      onChange={e => setLineItems(prev => prev.map(x => (x.id === li.id ? { ...x, unitPrice: parseFloat(e.target.value) || 0 } : x)))}
                      placeholder="$"
                      className="border border-slate-200 rounded-lg px-2 py-1.5"
                    />
                    <button onClick={() => setLineItems(prev => prev.filter(x => x.id !== li.id))}><Trash2 className="w-3.5 h-3.5 text-rose-400" /></button>
                  </div>
                ))}
                <button
                  onClick={() => setLineItems(prev => [...prev, { id: genId("li"), description: "", quantity: 1, unitPrice: 0 }])}
                  className="text-[#315C9F] font-bold text-[10px] flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Line
                </button>
              </div>
              <div className="text-right font-black text-[#1F3557] text-sm pt-2 border-t border-slate-100">
                Total: {fmt(lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0) * (1 + taxRate / 100))}
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setIsCreating(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold">Cancel</button>
              <button onClick={handleCreate} className="flex-1 py-2 bg-[#315C9F] text-white rounded-xl text-xs font-bold">Create Invoice</button>
            </div>
          </div>
        </div>
      )}

      {payingInvoice && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-5 w-[95%] max-w-[380px] shadow-2xl">
            <h3 className="text-sm font-black text-[#1F3557] uppercase mb-3">Record Payment — {payingInvoice.invoiceNumber}</h3>
            <p className="text-[10px] text-slate-500 mb-2">Balance Due: {fmt(invoiceBalanceDue(payingInvoice))}</p>
            <input
              type="number"
              value={paymentAmount}
              onChange={e => setPaymentAmount(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPayingInvoice(null)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold">Cancel</button>
              <button onClick={handleRecordPayment} className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold">Record Payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// BILLS
// ============================================================================
function BillsTab({ bills, setBills, setJournalEntries, vendors, canEdit, triggerNotification, logOperationalEvent, loggedInUser }: any) {
  const [isCreating, setIsCreating] = useState(false);
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("Materials");
  const [dueInDays, setDueInDays] = useState(30);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([{ id: genId("li"), description: "", quantity: 1, unitPrice: 0 }]);
  const [payingBill, setPayingBill] = useState<Bill | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");

  const handleCreate = () => {
    if (!vendor.trim() || lineItems.every(li => !li.description.trim())) {
      triggerNotification("Add a vendor and at least one line item.");
      return;
    }
    const bill: Bill = {
      id: genId("bill"),
      billNumber: `BILL-${1000 + bills.length + 1}`,
      vendor: vendor.trim(),
      lineItems: lineItems.filter(li => li.description.trim()),
      category,
      issuedDate: todayStr(),
      dueDate: addDays(todayStr(), dueInDays),
      status: "unpaid",
      amountPaid: 0,
      createdAt: new Date().toISOString(),
      createdBy: loggedInUser?.email
    };
    setBills((prev: Bill[]) => [...prev, bill]);
    setJournalEntries((prev: JournalEntry[]) => [...prev, postBillCreatedEntry(bill, loggedInUser?.email)]);
    if (logOperationalEvent) logOperationalEvent("Bill Created", `${bill.billNumber} from ${bill.vendor}: ${fmt(billTotal(bill))}`, "🧾");
    triggerNotification(`Bill ${bill.billNumber} created for ${fmt(billTotal(bill))}.`);
    setVendor("");
    setLineItems([{ id: genId("li"), description: "", quantity: 1, unitPrice: 0 }]);
    setIsCreating(false);
  };

  const handleRecordPayment = () => {
    if (!payingBill) return;
    const amount = parseFloat(paymentAmount);
    const balanceDue = billBalanceDue(payingBill);
    if (!amount || amount <= 0 || amount > balanceDue + 0.01) {
      triggerNotification(`Enter an amount up to the balance due (${fmt(balanceDue)}).`);
      return;
    }
    const newAmountPaid = payingBill.amountPaid + amount;
    const total = billTotal(payingBill);
    const newStatus: Bill["status"] = newAmountPaid >= total - 0.01 ? "paid" : "partial";
    setBills((prev: Bill[]) => prev.map(b => (b.id === payingBill.id ? { ...b, amountPaid: newAmountPaid, status: newStatus } : b)));
    setJournalEntries((prev: JournalEntry[]) => [...prev, postBillPaymentEntry(payingBill, amount, loggedInUser?.email)]);
    triggerNotification(`Payment of ${fmt(amount)} recorded on ${payingBill.billNumber}.`);
    setPayingBill(null);
    setPaymentAmount("");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-black text-[#1F3557] uppercase">Bills</h3>
        {canEdit && (
          <button onClick={() => setIsCreating(true)} className="px-3 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-bold rounded-xl uppercase flex items-center gap-1.5 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> New Bill
          </button>
        )}
      </div>
      <div className="bg-[#C7E3FA] rounded-2xl border border-[#9EC8EF] shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-[#EAF5FF] text-[10px] font-bold text-[#1F3557] uppercase">
              <th className="px-4 py-3">Bill #</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Balance Due</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#9EC8EF]/30">
            {bills.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-[#5E7393]">No bills yet.</td></tr>
            )}
            {bills.map((bill: Bill) => (
              <tr key={bill.id} className="hover:bg-[#BDDDF8]">
                <td className="px-4 py-3 font-bold text-[#1F3557]">{bill.billNumber}</td>
                <td className="px-4 py-3">{bill.vendor}</td>
                <td className="px-4 py-3">{bill.category}</td>
                <td className="px-4 py-3 text-right font-mono">{fmt(billTotal(bill))}</td>
                <td className="px-4 py-3 text-right font-mono font-bold">{fmt(billBalanceDue(bill))}</td>
                <td className="px-4 py-3 font-mono text-[#5E7393]">{bill.dueDate}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${bill.status === "paid" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-slate-500/10 text-slate-600 border-slate-500/20"}`}>
                    {bill.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {canEdit && billBalanceDue(bill) > 0 && (
                    <button onClick={() => { setPayingBill(bill); setPaymentAmount(billBalanceDue(bill).toFixed(2)); }} className="text-[#315C9F] font-bold text-[10px] hover:underline cursor-pointer">
                      Pay Bill
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isCreating && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-5 w-[95%] max-w-[520px] shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-black text-[#1F3557] uppercase">New Bill</h3>
              <button onClick={() => setIsCreating(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[9px] uppercase text-slate-400 font-bold">Vendor</label>
                <input list="vendor-options" value={vendor} onChange={e => setVendor(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1" placeholder="Vendor name" />
                <datalist id="vendor-options">
                  {vendors.map((v: Vendor) => <option key={v.id} value={v.name} />)}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] uppercase text-slate-400 font-bold">Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1">
                    {["Materials", "Fuel", "Vehicle Maintenance", "Office Supplies", "Marketing", "Utilities", "Insurance", "Other"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] uppercase text-slate-400 font-bold">Due In (Days)</label>
                  <input type="number" value={dueInDays} onChange={e => setDueInDays(parseInt(e.target.value) || 0)} className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] uppercase text-slate-400 font-bold">Line Items</label>
                {lineItems.map(li => (
                  <div key={li.id} className="grid grid-cols-[1fr_60px_80px_24px] gap-1.5 items-center">
                    <input value={li.description} onChange={e => setLineItems(prev => prev.map(x => (x.id === li.id ? { ...x, description: e.target.value } : x)))} placeholder="Description" className="border border-slate-200 rounded-lg px-2 py-1.5" />
                    <input type="number" value={li.quantity} onChange={e => setLineItems(prev => prev.map(x => (x.id === li.id ? { ...x, quantity: parseFloat(e.target.value) || 0 } : x)))} className="border border-slate-200 rounded-lg px-2 py-1.5" />
                    <input type="number" value={li.unitPrice} onChange={e => setLineItems(prev => prev.map(x => (x.id === li.id ? { ...x, unitPrice: parseFloat(e.target.value) || 0 } : x)))} placeholder="$" className="border border-slate-200 rounded-lg px-2 py-1.5" />
                    <button onClick={() => setLineItems(prev => prev.filter(x => x.id !== li.id))}><Trash2 className="w-3.5 h-3.5 text-rose-400" /></button>
                  </div>
                ))}
                <button onClick={() => setLineItems(prev => [...prev, { id: genId("li"), description: "", quantity: 1, unitPrice: 0 }])} className="text-[#315C9F] font-bold text-[10px] flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add Line
                </button>
              </div>
              <div className="text-right font-black text-[#1F3557] text-sm pt-2 border-t border-slate-100">
                Total: {fmt(lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0))}
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setIsCreating(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold">Cancel</button>
              <button onClick={handleCreate} className="flex-1 py-2 bg-[#315C9F] text-white rounded-xl text-xs font-bold">Create Bill</button>
            </div>
          </div>
        </div>
      )}

      {payingBill && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-5 w-[95%] max-w-[380px] shadow-2xl">
            <h3 className="text-sm font-black text-[#1F3557] uppercase mb-3">Pay Bill — {payingBill.billNumber}</h3>
            <p className="text-[10px] text-slate-500 mb-2">Balance Due: {fmt(billBalanceDue(payingBill))}</p>
            <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPayingBill(null)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold">Cancel</button>
              <button onClick={handleRecordPayment} className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold">Pay Bill</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// VENDORS
// ============================================================================
function VendorsTab({ vendors, setVendors, bills, canEdit, canDelete, triggerNotification }: any) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("");

  const handleAdd = () => {
    if (!name.trim()) {
      triggerNotification("Enter a vendor name.");
      return;
    }
    setVendors((prev: Vendor[]) => [...prev, { id: genId("vend"), name: name.trim(), contact, email, phone, category, createdAt: new Date().toISOString() }]);
    triggerNotification(`Vendor "${name}" added.`);
    setName(""); setContact(""); setEmail(""); setPhone(""); setCategory("");
    setIsAdding(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-black text-[#1F3557] uppercase">Vendors &amp; Suppliers</h3>
        {canEdit && (
          <button onClick={() => setIsAdding(true)} className="px-3 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-bold rounded-xl uppercase flex items-center gap-1.5 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Add Vendor
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {vendors.length === 0 && <p className="text-xs text-[#5E7393] col-span-full text-center py-8">No vendors yet.</p>}
        {vendors.map((v: Vendor) => {
          const vendorBills = bills.filter((b: Bill) => b.vendor === v.name);
          const totalSpent = vendorBills.reduce((s: number, b: Bill) => s + billTotal(b), 0);
          return (
            <div key={v.id} className="bg-[#C7E3FA] rounded-2xl p-3.5 border border-[#9EC8EF] shadow-sm space-y-1.5">
              <div className="flex justify-between items-start">
                <p className="font-black text-[#1F3557] text-xs">{v.name}</p>
                {canDelete && (
                  <button onClick={() => setVendors((prev: Vendor[]) => prev.filter(x => x.id !== v.id))}>
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  </button>
                )}
              </div>
              {v.category && <p className="text-[9px] text-[#5E7393] font-bold uppercase">{v.category}</p>}
              {v.contact && <p className="text-[10px] text-[#1F3557]">{v.contact}</p>}
              {v.email && <p className="text-[10px] text-[#5E7393]">{v.email}</p>}
              {v.phone && <p className="text-[10px] text-[#5E7393]">{v.phone}</p>}
              <div className="pt-1.5 border-t border-[#9EC8EF]/30 text-[10px] text-[#1F3557] font-bold">
                {vendorBills.length} bill{vendorBills.length === 1 ? "" : "s"} · {fmt(totalSpent)} total
              </div>
            </div>
          );
        })}
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-5 w-[95%] max-w-[400px] shadow-2xl space-y-2.5 text-xs">
            <h3 className="text-sm font-black text-[#1F3557] uppercase mb-2">Add Vendor</h3>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Vendor name" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <input value={contact} onChange={e => setContact(e.target.value)} placeholder="Contact person" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Category (e.g. Materials)" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <div className="flex gap-2 pt-2">
              <button onClick={() => setIsAdding(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold">Cancel</button>
              <button onClick={handleAdd} className="flex-1 py-2 bg-[#315C9F] text-white rounded-xl font-bold">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// BANKING (real BankAccount CRUD now; Plaid/sync features honestly Coming Soon)
// ============================================================================
function BankingTab({ bankAccounts, setBankAccounts, accounts, canEdit, triggerNotification }: any) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<BankAccountType>("checking");
  const [last4, setLast4] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");

  const handleAdd = () => {
    if (!name.trim() || !openingBalance) {
      triggerNotification("Enter an account name and opening balance.");
      return;
    }
    setBankAccounts((prev: BankAccount[]) => [
      ...prev,
      {
        id: genId("bank"),
        name: name.trim(),
        type,
        accountNumberLast4: last4 || undefined,
        openingBalance: parseFloat(openingBalance) || 0,
        openingBalanceDate: todayStr(),
        isPlaidConnected: false,
        createdAt: new Date().toISOString()
      }
    ]);
    triggerNotification(`${BANK_TYPE_LABELS[type]} "${name}" added.`);
    setName(""); setLast4(""); setOpeningBalance("");
    setIsAdding(false);
  };

  const comingSoon = [
    "Connect via Plaid",
    "Automatic Bank Sync",
    "Credit Card Sync",
    "Automatic Transaction Import",
    "Transaction Matching",
    "Duplicate Detection",
    "Automatic Categorization",
    "Payment Processor Sync (Stripe/Square/PayPal)",
    "Payroll Provider Sync",
    "Tax Filing Integration"
  ];

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-black text-[#1F3557] uppercase">Bank &amp; Financial Accounts</h3>
        {canEdit && (
          <button onClick={() => setIsAdding(true)} className="px-3 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-bold rounded-xl uppercase flex items-center gap-1.5 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Add Account
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {bankAccounts.length === 0 && <p className="text-xs text-[#5E7393] col-span-full text-center py-6">No bank/financial accounts added yet.</p>}
        {bankAccounts.map((b: BankAccount) => (
          <div key={b.id} className="bg-[#C7E3FA] rounded-2xl p-3.5 border border-[#9EC8EF] shadow-sm">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#315C9F]" />
              <p className="font-black text-[#1F3557] text-xs">{b.name}</p>
            </div>
            <p className="text-[9px] text-[#5E7393] font-bold uppercase mt-0.5">{BANK_TYPE_LABELS[b.type]}{b.accountNumberLast4 ? ` •••• ${b.accountNumberLast4}` : ""}</p>
            <p className="text-base font-black text-[#1F3557] mt-1.5">{fmt(b.openingBalance)}</p>
            <p className="text-[8px] text-[#5E7393] mt-0.5">Manually entered balance as of {b.openingBalanceDate} — updates until bank sync is connected.</p>
          </div>
        ))}
      </div>

      <div className="bg-white/60 border border-dashed border-[#9EC8EF] rounded-2xl p-4">
        <p className="text-[10px] font-black uppercase text-[#5E7393] mb-3">Coming Soon — the architecture already exists, these just need real credentials to enable</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {comingSoon.map(feature => (
            <div key={feature} className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-center opacity-60 grayscale">
              <Building className="w-4 h-4 text-slate-400 mx-auto mb-1" />
              <p className="text-[9px] font-bold text-slate-500 leading-tight">{feature}</p>
              <span className="inline-block mt-1 px-1.5 py-0.5 bg-slate-300 text-slate-600 text-[7.5px] font-black uppercase rounded">Coming Soon</span>
            </div>
          ))}
        </div>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-5 w-[95%] max-w-[400px] shadow-2xl space-y-2.5 text-xs">
            <h3 className="text-sm font-black text-[#1F3557] uppercase mb-2">Add Bank/Financial Account</h3>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Account name (e.g. Chase Business Checking)" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <select value={type} onChange={e => setType(e.target.value as BankAccountType)} className="w-full border border-slate-200 rounded-xl px-3 py-2">
              {(Object.keys(BANK_TYPE_LABELS) as BankAccountType[]).map(t => <option key={t} value={t}>{BANK_TYPE_LABELS[t]}</option>)}
            </select>
            <input value={last4} onChange={e => setLast4(e.target.value.slice(0, 4))} placeholder="Last 4 digits (optional)" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <input type="number" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="Current balance" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <div className="flex gap-2 pt-2">
              <button onClick={() => setIsAdding(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold">Cancel</button>
              <button onClick={handleAdd} className="flex-1 py-2 bg-[#315C9F] text-white rounded-xl font-bold">Add Account</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CHART OF ACCOUNTS
// ============================================================================
function ChartOfAccountsTab({ accounts, setAccounts, accountBalances, canEdit, triggerNotification }: any) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<Account["type"]>("expense");
  const [subtype, setSubtype] = useState("Operating Expense");

  const grouped = useMemo(() => {
    const g: Record<string, Account[]> = { asset: [], liability: [], equity: [], revenue: [], expense: [] };
    for (const a of accounts) g[a.type].push(a);
    return g;
  }, [accounts]);

  const handleAdd = () => {
    if (!name.trim()) {
      triggerNotification("Enter an account name.");
      return;
    }
    const codePrefix = { asset: "1", liability: "2", equity: "3", revenue: "4", expense: "6" }[type];
    const existingCodes = accounts.filter((a: Account) => a.type === type).map((a: Account) => parseInt(a.code));
    const nextCode = `${codePrefix}${String((Math.max(0, ...existingCodes.map((c: number) => c % 1000)) + 10)).padStart(3, "0")}`;
    setAccounts((prev: Account[]) => [...prev, { id: genId("acct"), code: nextCode, name: name.trim(), type, subtype, isSystemAccount: false, createdAt: new Date().toISOString() }]);
    triggerNotification(`Account "${name}" added to the Chart of Accounts.`);
    setName("");
    setIsAdding(false);
  };

  const labels: Record<string, string> = { asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Revenue", expense: "Expenses" };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-black text-[#1F3557] uppercase">Chart of Accounts</h3>
        {canEdit && (
          <button onClick={() => setIsAdding(true)} className="px-3 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-bold rounded-xl uppercase flex items-center gap-1.5 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Add Account
          </button>
        )}
      </div>

      {Object.entries(grouped).map(([type, accts]) => (
        <div key={type} className="bg-[#C7E3FA] rounded-2xl border border-[#9EC8EF] shadow-sm overflow-hidden">
          <p className="px-4 py-2 bg-[#EAF5FF] text-[10px] font-black uppercase text-[#1F3557]">{labels[type]}</p>
          <table className="w-full text-left text-xs">
            <tbody className="divide-y divide-[#9EC8EF]/30">
              {(accts as Account[]).map(a => (
                <tr key={a.id}>
                  <td className="px-4 py-2 font-mono text-[#5E7393] w-16">{a.code}</td>
                  <td className="px-4 py-2 font-bold text-[#1F3557]">{a.name} {a.isSystemAccount && <Lock className="w-2.5 h-2.5 inline text-slate-300 ml-1" />}</td>
                  <td className="px-4 py-2 text-[#5E7393]">{a.subtype}</td>
                  <td className="px-4 py-2 text-right font-mono font-bold">{fmt(accountBalances[a.id] || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {isAdding && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-5 w-[95%] max-w-[380px] shadow-2xl space-y-2.5 text-xs">
            <h3 className="text-sm font-black text-[#1F3557] uppercase mb-2">Add Account</h3>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Account name" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <select value={type} onChange={e => setType(e.target.value as Account["type"])} className="w-full border border-slate-200 rounded-xl px-3 py-2">
              {["asset", "liability", "equity", "revenue", "expense"].map(t => <option key={t} value={t}>{labels[t]}</option>)}
            </select>
            <input value={subtype} onChange={e => setSubtype(e.target.value)} placeholder="Subtype (e.g. Operating Expense)" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <div className="flex gap-2 pt-2">
              <button onClick={() => setIsAdding(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold">Cancel</button>
              <button onClick={handleAdd} className="flex-1 py-2 bg-[#315C9F] text-white rounded-xl font-bold">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// JOURNAL ENTRIES
// ============================================================================
function JournalTab({ journalEntries, setJournalEntries, accounts, canEdit, triggerNotification, loggedInUser }: any) {
  const [isAdding, setIsAdding] = useState(false);
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<Array<{ accountId: string; debit: string; credit: string }>>([
    { accountId: accounts[0]?.id || "", debit: "", credit: "" },
    { accountId: accounts[0]?.id || "", debit: "", credit: "" }
  ]);

  const accountName = (id: string) => accounts.find((a: Account) => a.id === id)?.name || id;

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;

  const handleAdd = () => {
    const builtLines = lines
      .filter(l => l.accountId && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
      .map(l => ({ accountId: l.accountId, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 }));
    if (!isBalancedEntry(builtLines) || builtLines.length < 2) {
      triggerNotification("Debits must equal credits, with at least 2 lines.");
      return;
    }
    const entry: JournalEntry = {
      id: genId("je"),
      date: todayStr(),
      memo: memo.trim() || "Manual journal entry",
      source: "manual",
      lines: builtLines,
      createdAt: new Date().toISOString(),
      createdBy: loggedInUser?.email
    };
    setJournalEntries((prev: JournalEntry[]) => [...prev, entry]);
    triggerNotification("Journal entry posted.");
    setMemo("");
    setLines([{ accountId: accounts[0]?.id || "", debit: "", credit: "" }, { accountId: accounts[0]?.id || "", debit: "", credit: "" }]);
    setIsAdding(false);
  };

  const sorted = useMemo(() => [...journalEntries].sort((a: JournalEntry, b: JournalEntry) => new Date(b.date).getTime() - new Date(a.date).getTime()), [journalEntries]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-black text-[#1F3557] uppercase">Journal Entries</h3>
        {canEdit && (
          <button onClick={() => setIsAdding(true)} className="px-3 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-bold rounded-xl uppercase flex items-center gap-1.5 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Manual Entry
          </button>
        )}
      </div>

      <div className="space-y-2">
        {sorted.length === 0 && <p className="text-xs text-[#5E7393] text-center py-8">No journal entries yet.</p>}
        {sorted.map((je: JournalEntry) => (
          <div key={je.id} className="bg-[#C7E3FA] rounded-xl border border-[#9EC8EF] p-3 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-bold text-[#1F3557]">{je.memo}</span>
              <span className="text-[9px] text-[#5E7393] font-mono">{je.date} · {je.source}</span>
            </div>
            <div className="mt-1.5 space-y-0.5">
              {je.lines.map((l, i) => (
                <div key={i} className="flex justify-between text-[10px] font-mono">
                  <span className="text-[#5E7393]">{accountName(l.accountId)}</span>
                  <span>{l.debit > 0 ? `Dr ${fmt(l.debit)}` : `Cr ${fmt(l.credit)}`}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-5 w-[95%] max-w-[480px] shadow-2xl max-h-[90vh] overflow-y-auto space-y-3 text-xs">
            <h3 className="text-sm font-black text-[#1F3557] uppercase">Manual Journal Entry</h3>
            <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="Memo" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_70px_70px] gap-1.5">
                <select value={l.accountId} onChange={e => setLines(prev => prev.map((x, i) => (i === idx ? { ...x, accountId: e.target.value } : x)))} className="border border-slate-200 rounded-lg px-2 py-1.5">
                  {accounts.map((a: Account) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <input type="number" value={l.debit} onChange={e => setLines(prev => prev.map((x, i) => (i === idx ? { ...x, debit: e.target.value, credit: "" } : x)))} placeholder="Debit" className="border border-slate-200 rounded-lg px-2 py-1.5" />
                <input type="number" value={l.credit} onChange={e => setLines(prev => prev.map((x, i) => (i === idx ? { ...x, credit: e.target.value, debit: "" } : x)))} placeholder="Credit" className="border border-slate-200 rounded-lg px-2 py-1.5" />
              </div>
            ))}
            <button onClick={() => setLines(prev => [...prev, { accountId: accounts[0]?.id || "", debit: "", credit: "" }])} className="text-[#315C9F] font-bold text-[10px] flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Line
            </button>
            <div className={`text-right font-bold text-xs ${balanced ? "text-emerald-600" : "text-rose-600"}`}>
              Debits {fmt(totalDebit)} / Credits {fmt(totalCredit)} {balanced ? "✓ Balanced" : "— must balance"}
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setIsAdding(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold">Cancel</button>
              <button disabled={!balanced} onClick={handleAdd} className="flex-1 py-2 bg-[#315C9F] disabled:opacity-40 text-white rounded-xl font-bold">Post Entry</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// REPORTS
// ============================================================================
function ReportsTab({ accounts, invoices, bills, transactions, revenueEvents, estimates, inventoryList, accountBalances, totalRevenue, totalExpenses, netIncome }: any) {
  const [report, setReport] = useState("pnl");

  const revenueByCustomer = useMemo(() => {
    const map: Record<string, number> = {};
    for (const inv of invoices as Invoice[]) {
      const total = invoiceTotal(inv);
      map[inv.customer] = (map[inv.customer] || 0) + total;
    }
    for (const re of revenueEvents) map[re.customer] = (map[re.customer] || 0) + re.amount;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [invoices, revenueEvents]);

  const revenueByEmployee = useMemo(() => {
    const map: Record<string, number> = {};
    for (const re of revenueEvents) {
      const est = estimates.find((e: any) => e.id === re.estimateId);
      const rep = est?.salesRep || "Unassigned";
      map[rep] = (map[rep] || 0) + re.amount;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [revenueEvents, estimates]);

  const revenueByService = useMemo(() => {
    const map: Record<string, number> = {};
    for (const inv of invoices as Invoice[]) {
      for (const li of inv.lineItems) {
        const key = li.description || "Unlabeled";
        map[key] = (map[key] || 0) + li.quantity * li.unitPrice;
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [invoices]);

  const expensesByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      map[t.category || "Uncategorized"] = (map[t.category || "Uncategorized"] || 0) + t.amount;
    }
    for (const b of bills as Bill[]) map[b.category] = (map[b.category] || 0) + billTotal(b);
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [transactions, bills]);

  const expensesByVendor = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of bills as Bill[]) map[b.vendor] = (map[b.vendor] || 0) + billTotal(b);
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [bills]);

  const salesTaxCollected = useMemo(() => {
    return (invoices as Invoice[]).reduce((s, inv) => {
      const subtotal = inv.lineItems.reduce((ss, li) => ss + li.quantity * li.unitPrice, 0);
      return s + subtotal * (inv.taxRate / 100);
    }, 0);
  }, [invoices]);

  const payrollTotal = useMemo(() => transactions.filter((t: any) => t.source === "payroll").reduce((s: number, t: any) => s + t.amount, 0), [transactions]);

  const inventoryValuation = useMemo(() => inventoryList.reduce((s: number, i: any) => s + (i.quantity || 0) * (i.unitCost || 0), 0), [inventoryList]);

  const reportOptions = [
    { id: "pnl", label: "Profit & Loss" },
    { id: "balance_sheet", label: "Balance Sheet" },
    { id: "rev_customer", label: "Revenue by Customer" },
    { id: "rev_employee", label: "Revenue by Employee" },
    { id: "rev_service", label: "Revenue by Service" },
    { id: "exp_category", label: "Expenses by Category" },
    { id: "exp_vendor", label: "Expenses by Vendor" },
    { id: "sales_tax", label: "Sales Tax" },
    { id: "payroll", label: "Payroll" },
    { id: "inventory_val", label: "Inventory Valuation" }
  ];

  const exportCsv = (rows: Array<[string, number]>, filename: string) => {
    const csv = "Label,Amount\n" + rows.map(([l, v]) => `"${l}",${v.toFixed(2)}`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {reportOptions.map(r => (
          <button key={r.id} onClick={() => setReport(r.id)} className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase cursor-pointer ${report === r.id ? "bg-[#315C9F] text-white" : "bg-[#EAF5FF] text-[#1F3557]"}`}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="bg-[#C7E3FA] rounded-2xl border border-[#9EC8EF] p-4 shadow-sm">
        {report === "pnl" && (
          <div className="space-y-2 text-xs">
            <p className="text-sm font-black text-[#1F3557] uppercase mb-2">Profit &amp; Loss</p>
            {(accounts as Account[]).filter(a => a.type === "revenue").map(a => (
              <div key={a.id} className="flex justify-between"><span>{a.name}</span><span className="font-mono">{fmt(accountBalances[a.id] || 0)}</span></div>
            ))}
            <div className="flex justify-between font-bold border-t border-[#9EC8EF]/40 pt-1"><span>Total Revenue</span><span className="font-mono">{fmt(totalRevenue)}</span></div>
            <div className="h-2" />
            {(accounts as Account[]).filter(a => a.type === "expense").map(a => (
              <div key={a.id} className="flex justify-between"><span>{a.name}</span><span className="font-mono">{fmt(accountBalances[a.id] || 0)}</span></div>
            ))}
            <div className="flex justify-between font-bold border-t border-[#9EC8EF]/40 pt-1"><span>Total Expenses</span><span className="font-mono">{fmt(totalExpenses)}</span></div>
            <div className={`flex justify-between font-black text-sm pt-2 border-t border-[#9EC8EF] ${netIncome >= 0 ? "text-emerald-700" : "text-rose-700"}`}><span>Net Income</span><span className="font-mono">{fmt(netIncome)}</span></div>
          </div>
        )}
        {report === "balance_sheet" && (
          <div className="space-y-2 text-xs">
            <p className="text-sm font-black text-[#1F3557] uppercase mb-2">Balance Sheet</p>
            <p className="font-bold text-[#1F3557]">Assets</p>
            {(accounts as Account[]).filter(a => a.type === "asset").map(a => (
              <div key={a.id} className="flex justify-between pl-2"><span>{a.name}</span><span className="font-mono">{fmt(accountBalances[a.id] || 0)}</span></div>
            ))}
            <p className="font-bold text-[#1F3557] pt-2">Liabilities</p>
            {(accounts as Account[]).filter(a => a.type === "liability").map(a => (
              <div key={a.id} className="flex justify-between pl-2"><span>{a.name}</span><span className="font-mono">{fmt(accountBalances[a.id] || 0)}</span></div>
            ))}
            <p className="font-bold text-[#1F3557] pt-2">Equity</p>
            {(accounts as Account[]).filter(a => a.type === "equity").map(a => (
              <div key={a.id} className="flex justify-between pl-2"><span>{a.name}</span><span className="font-mono">{fmt(accountBalances[a.id] || 0)}</span></div>
            ))}
            <div className="flex justify-between pl-2"><span>Current Year Earnings</span><span className="font-mono">{fmt(netIncome)}</span></div>
          </div>
        )}
        {report === "rev_customer" && <RankedTable rows={revenueByCustomer} onExport={() => exportCsv(revenueByCustomer, "revenue_by_customer.csv")} />}
        {report === "rev_employee" && <RankedTable rows={revenueByEmployee} onExport={() => exportCsv(revenueByEmployee, "revenue_by_employee.csv")} />}
        {report === "rev_service" && <RankedTable rows={revenueByService} onExport={() => exportCsv(revenueByService, "revenue_by_service.csv")} />}
        {report === "exp_category" && <RankedTable rows={expensesByCategory} onExport={() => exportCsv(expensesByCategory, "expenses_by_category.csv")} />}
        {report === "exp_vendor" && <RankedTable rows={expensesByVendor} onExport={() => exportCsv(expensesByVendor, "expenses_by_vendor.csv")} />}
        {report === "sales_tax" && (
          <div className="text-xs">
            <p className="text-sm font-black text-[#1F3557] uppercase mb-2">Sales Tax Collected</p>
            <p className="text-lg font-black text-[#1F3557]">{fmt(salesTaxCollected)}</p>
            <p className="text-[9px] text-[#5E7393] mt-1">Sum of tax charged across all invoices. Doesn't file anything — consult your accountant/state tax authority.</p>
          </div>
        )}
        {report === "payroll" && (
          <div className="text-xs">
            <p className="text-sm font-black text-[#1F3557] uppercase mb-2">Payroll Total</p>
            <p className="text-lg font-black text-[#1F3557]">{fmt(payrollTotal)}</p>
          </div>
        )}
        {report === "inventory_val" && (
          <div className="text-xs">
            <p className="text-sm font-black text-[#1F3557] uppercase mb-2">Inventory Valuation</p>
            <p className="text-lg font-black text-[#1F3557]">{fmt(inventoryValuation)}</p>
            <p className="text-[9px] text-[#5E7393] mt-1">Real quantity × unit cost across current Inventory.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RankedTable({ rows, onExport }: { rows: Array<[string, number]>; onExport: () => void }) {
  return (
    <div className="text-xs">
      <div className="flex justify-between items-center mb-2">
        <p className="text-sm font-black text-[#1F3557] uppercase">Results</p>
        <button onClick={onExport} className="flex items-center gap-1 text-[#315C9F] font-bold text-[10px]"><Download className="w-3 h-3" /> Export CSV</button>
      </div>
      {rows.length === 0 && <p className="text-[#5E7393] text-center py-6">No data yet.</p>}
      {rows.map(([label, val]) => (
        <div key={label} className="flex justify-between py-1 border-b border-[#9EC8EF]/20">
          <span>{label}</span>
          <span className="font-mono font-bold">{fmt(val)}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// MILEAGE
// ============================================================================
function MileageTab({ mileageLogs, setMileageLogs, loggedInUser, canEdit, triggerNotification }: any) {
  const [isAdding, setIsAdding] = useState(false);
  const [startLocation, setStartLocation] = useState("");
  const [endLocation, setEndLocation] = useState("");
  const [miles, setMiles] = useState("");
  const [purpose, setPurpose] = useState("");
  const IRS_RATE = 0.67;

  const handleAdd = () => {
    const milesNum = parseFloat(miles);
    if (!startLocation.trim() || !endLocation.trim() || !milesNum) {
      triggerNotification("Fill in start/end locations and miles driven.");
      return;
    }
    const log: MileageLog = {
      id: genId("mile"),
      employeeEmail: loggedInUser?.email || "",
      date: todayStr(),
      startLocation,
      endLocation,
      miles: milesNum,
      purpose,
      rateApplied: IRS_RATE,
      amount: Math.round(milesNum * IRS_RATE * 100) / 100,
      createdAt: new Date().toISOString()
    };
    setMileageLogs((prev: MileageLog[]) => [...prev, log]);
    triggerNotification(`Logged ${milesNum} miles = ${fmt(log.amount)} at the IRS standard rate.`);
    setStartLocation(""); setEndLocation(""); setMiles(""); setPurpose("");
    setIsAdding(false);
  };

  const totalMiles = mileageLogs.reduce((s: number, m: MileageLog) => s + m.miles, 0);
  const totalAmount = mileageLogs.reduce((s: number, m: MileageLog) => s + m.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-black text-[#1F3557] uppercase">Mileage Tracking</h3>
        {canEdit && (
          <button onClick={() => setIsAdding(true)} className="px-3 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-bold rounded-xl uppercase flex items-center gap-1.5 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Log Trip
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF]"><p className="text-[10px] uppercase text-[#5E7393] font-bold">Total Miles</p><p className="text-lg font-black text-[#1F3557]">{totalMiles.toFixed(1)}</p></div>
        <div className="bg-[#C7E3FA] rounded-2xl p-4 border border-[#9EC8EF]"><p className="text-[10px] uppercase text-[#5E7393] font-bold">Deductible Amount ({IRS_RATE}/mi)</p><p className="text-lg font-black text-[#1F3557]">{fmt(totalAmount)}</p></div>
      </div>
      <div className="bg-[#C7E3FA] rounded-2xl border border-[#9EC8EF] overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead><tr className="bg-[#EAF5FF] text-[10px] font-bold text-[#1F3557] uppercase"><th className="px-4 py-2">Date</th><th className="px-4 py-2">From → To</th><th className="px-4 py-2">Purpose</th><th className="px-4 py-2 text-right">Miles</th><th className="px-4 py-2 text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-[#9EC8EF]/30">
            {mileageLogs.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-[#5E7393]">No trips logged yet.</td></tr>}
            {mileageLogs.map((m: MileageLog) => (
              <tr key={m.id}><td className="px-4 py-2 font-mono">{m.date}</td><td className="px-4 py-2">{m.startLocation} → {m.endLocation}</td><td className="px-4 py-2">{m.purpose}</td><td className="px-4 py-2 text-right font-mono">{m.miles}</td><td className="px-4 py-2 text-right font-mono font-bold">{fmt(m.amount)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-5 w-[95%] max-w-[380px] shadow-2xl space-y-2.5 text-xs">
            <h3 className="text-sm font-black text-[#1F3557] uppercase mb-2">Log Trip</h3>
            <input value={startLocation} onChange={e => setStartLocation(e.target.value)} placeholder="Start location" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <input value={endLocation} onChange={e => setEndLocation(e.target.value)} placeholder="End location" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <input type="number" value={miles} onChange={e => setMiles(e.target.value)} placeholder="Miles driven" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Business purpose" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <div className="flex gap-2 pt-2">
              <button onClick={() => setIsAdding(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold">Cancel</button>
              <button onClick={handleAdd} className="flex-1 py-2 bg-[#315C9F] text-white rounded-xl font-bold">Log Trip</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// RECURRING TRANSACTIONS
// ============================================================================
function RecurringTab({ recurringTransactions, setRecurringTransactions, setInvoices, setBills, setJournalEntries, canEdit, triggerNotification }: any) {
  const [isAdding, setIsAdding] = useState(false);
  const [type, setType] = useState<"invoice" | "bill">("invoice");
  const [templateName, setTemplateName] = useState("");
  const [customerOrVendor, setCustomerOrVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<RecurringTransaction["frequency"]>("monthly");

  const nextDateForFrequency = (freq: RecurringTransaction["frequency"]) => {
    const days = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, yearly: 365 }[freq];
    return addDays(todayStr(), days);
  };

  const handleAdd = () => {
    const amt = parseFloat(amount);
    if (!templateName.trim() || !customerOrVendor.trim() || !amt) {
      triggerNotification("Fill in the template name, customer/vendor, and amount.");
      return;
    }
    const rec: RecurringTransaction = {
      id: genId("rec"),
      type,
      templateName: templateName.trim(),
      frequency,
      nextRunDate: nextDateForFrequency(frequency),
      active: true,
      payload: {
        customerOrVendor: customerOrVendor.trim(),
        lineItems: [{ id: genId("li"), description: templateName.trim(), quantity: 1, unitPrice: amt }],
        taxRate: 0,
        category: "Other",
        dueInDays: 30
      },
      createdAt: new Date().toISOString()
    };
    setRecurringTransactions((prev: RecurringTransaction[]) => [...prev, rec]);
    triggerNotification(`Recurring ${type} "${templateName}" scheduled ${frequency}.`);
    setTemplateName(""); setCustomerOrVendor(""); setAmount("");
    setIsAdding(false);
  };

  const runNow = (rec: RecurringTransaction) => {
    if (rec.type === "invoice") {
      const invoice: Invoice = {
        id: genId("inv"),
        invoiceNumber: `INV-REC-${Date.now().toString().slice(-6)}`,
        customer: rec.payload.customerOrVendor,
        lineItems: rec.payload.lineItems,
        taxRate: rec.payload.taxRate || 0,
        issuedDate: todayStr(),
        dueDate: addDays(todayStr(), rec.payload.dueInDays),
        status: "sent",
        amountPaid: 0,
        createdAt: new Date().toISOString()
      };
      setInvoices((prev: Invoice[]) => [...prev, invoice]);
      setJournalEntries((prev: JournalEntry[]) => [...prev, postInvoiceCreatedEntry(invoice)]);
    } else {
      const bill: Bill = {
        id: genId("bill"),
        billNumber: `BILL-REC-${Date.now().toString().slice(-6)}`,
        vendor: rec.payload.customerOrVendor,
        lineItems: rec.payload.lineItems,
        category: rec.payload.category || "Other",
        issuedDate: todayStr(),
        dueDate: addDays(todayStr(), rec.payload.dueInDays),
        status: "unpaid",
        amountPaid: 0,
        createdAt: new Date().toISOString()
      };
      setBills((prev: Bill[]) => [...prev, bill]);
      setJournalEntries((prev: JournalEntry[]) => [...prev, postBillCreatedEntry(bill)]);
    }
    setRecurringTransactions((prev: RecurringTransaction[]) =>
      prev.map(r => (r.id === rec.id ? { ...r, nextRunDate: nextDateForFrequency(r.frequency) } : r))
    );
    triggerNotification(`Generated a new ${rec.type} from "${rec.templateName}".`);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-black text-[#1F3557] uppercase">Recurring Invoices &amp; Bills</h3>
        {canEdit && (
          <button onClick={() => setIsAdding(true)} className="px-3 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-bold rounded-xl uppercase flex items-center gap-1.5 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> New Recurring
          </button>
        )}
      </div>
      <p className="text-[10px] text-[#5E7393] bg-white/60 border border-dashed border-[#9EC8EF] rounded-xl p-2.5">
        No server-side scheduler exists in this client app yet, so recurring items don't fire themselves — click "Run Now" when one is due. A real backend cron job is the natural next step to automate this.
      </p>
      <div className="space-y-2">
        {recurringTransactions.length === 0 && <p className="text-xs text-[#5E7393] text-center py-6">No recurring items yet.</p>}
        {recurringTransactions.map((r: RecurringTransaction) => (
          <div key={r.id} className="bg-[#C7E3FA] rounded-xl border border-[#9EC8EF] p-3 flex justify-between items-center text-xs">
            <div>
              <p className="font-bold text-[#1F3557]">{r.templateName} <span className="text-[9px] text-[#5E7393] uppercase">({r.type})</span></p>
              <p className="text-[10px] text-[#5E7393]">{r.payload.customerOrVendor} · {r.frequency} · Next: {r.nextRunDate}</p>
            </div>
            {canEdit && (
              <button onClick={() => runNow(r)} className="text-[#315C9F] font-bold text-[10px] hover:underline cursor-pointer">Run Now</button>
            )}
          </div>
        ))}
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-5 w-[95%] max-w-[400px] shadow-2xl space-y-2.5 text-xs">
            <h3 className="text-sm font-black text-[#1F3557] uppercase mb-2">New Recurring Item</h3>
            <select value={type} onChange={e => setType(e.target.value as any)} className="w-full border border-slate-200 rounded-xl px-3 py-2">
              <option value="invoice">Recurring Invoice</option>
              <option value="bill">Recurring Bill</option>
            </select>
            <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Name (e.g. Monthly Maintenance Plan)" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <input value={customerOrVendor} onChange={e => setCustomerOrVendor(e.target.value)} placeholder={type === "invoice" ? "Customer" : "Vendor"} className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <select value={frequency} onChange={e => setFrequency(e.target.value as any)} className="w-full border border-slate-200 rounded-xl px-3 py-2">
              {["weekly", "biweekly", "monthly", "quarterly", "yearly"].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setIsAdding(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold">Cancel</button>
              <button onClick={handleAdd} className="flex-1 py-2 bg-[#315C9F] text-white rounded-xl font-bold">Schedule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// BUDGETS
// ============================================================================
function BudgetsTab({ budgets, setBudgets, accounts, accountBalances, canEdit, triggerNotification }: any) {
  const [isAdding, setIsAdding] = useState(false);
  const [accountId, setAccountId] = useState(accounts.find((a: Account) => a.type === "expense")?.id || "");
  const [amount, setAmount] = useState("");
  const currentMonth = new Date().toISOString().slice(0, 7);

  const handleAdd = () => {
    const amt = parseFloat(amount);
    if (!accountId || !amt) {
      triggerNotification("Choose an account and enter a budget amount.");
      return;
    }
    setBudgets((prev: Budget[]) => [...prev.filter(b => !(b.accountId === accountId && b.period === currentMonth)), { id: genId("budget"), accountId, period: currentMonth, amount: amt }]);
    triggerNotification("Budget saved.");
    setAmount("");
    setIsAdding(false);
  };

  const expenseAccounts = accounts.filter((a: Account) => a.type === "expense");

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-black text-[#1F3557] uppercase">Budget vs Actual — {currentMonth}</h3>
        {canEdit && (
          <button onClick={() => setIsAdding(true)} className="px-3 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-bold rounded-xl uppercase flex items-center gap-1.5 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Set Budget
          </button>
        )}
      </div>
      <div className="bg-[#C7E3FA] rounded-2xl border border-[#9EC8EF] overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead><tr className="bg-[#EAF5FF] text-[10px] font-bold text-[#1F3557] uppercase"><th className="px-4 py-2">Account</th><th className="px-4 py-2 text-right">Budgeted</th><th className="px-4 py-2 text-right">Actual (All Time)</th><th className="px-4 py-2 text-right">Remaining</th></tr></thead>
          <tbody className="divide-y divide-[#9EC8EF]/30">
            {expenseAccounts.map((a: Account) => {
              const b = budgets.find((bd: Budget) => bd.accountId === a.id && bd.period === currentMonth);
              const actual = accountBalances[a.id] || 0;
              const budgetAmt = b?.amount || 0;
              return (
                <tr key={a.id}>
                  <td className="px-4 py-2 font-bold text-[#1F3557]">{a.name}</td>
                  <td className="px-4 py-2 text-right font-mono">{b ? fmt(budgetAmt) : <span className="text-[#5E7393]">Not set</span>}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(actual)}</td>
                  <td className={`px-4 py-2 text-right font-mono font-bold ${b && actual > budgetAmt ? "text-rose-600" : "text-emerald-600"}`}>{b ? fmt(budgetAmt - actual) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-5 w-[95%] max-w-[380px] shadow-2xl space-y-2.5 text-xs">
            <h3 className="text-sm font-black text-[#1F3557] uppercase mb-2">Set Monthly Budget</h3>
            <select value={accountId} onChange={e => setAccountId(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2">
              {expenseAccounts.map((a: Account) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Monthly budget amount" className="w-full border border-slate-200 rounded-xl px-3 py-2" />
            <div className="flex gap-2 pt-2">
              <button onClick={() => setIsAdding(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold">Cancel</button>
              <button onClick={handleAdd} className="flex-1 py-2 bg-[#315C9F] text-white rounded-xl font-bold">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// AI FINANCIAL INSIGHTS
// ============================================================================
function AIInsightsTab({ totalRevenue, totalExpenses, netIncome, cashBalance, arBalance, apBalance, accounts, accountBalances, invoices, bills, transactions, loggedInUser }: any) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Real, deterministic detection -- not hallucinated by the LLM. The AI
  // narrates over these actual computed candidates.
  const possibleDuplicates = useMemo(() => {
    const dups: string[] = [];
    const expenseTxns = transactions.filter((t: any) => t.type === "expense");
    for (let i = 0; i < expenseTxns.length; i++) {
      for (let j = i + 1; j < expenseTxns.length; j++) {
        const a = expenseTxns[i], b = expenseTxns[j];
        if (a.amount === b.amount && a.date === b.date && a.description === b.description) {
          dups.push(`${a.description} — ${fmt(a.amount)} on ${a.date} (logged twice)`);
        }
      }
    }
    return Array.from(new Set(dups));
  }, [transactions]);

  const unusualTransactions = useMemo(() => {
    const expenseTxns = transactions.filter((t: any) => t.type === "expense");
    if (expenseTxns.length < 3) return [];
    const avg = expenseTxns.reduce((s: number, t: any) => s + t.amount, 0) / expenseTxns.length;
    return expenseTxns.filter((t: any) => t.amount > avg * 3).map((t: any) => `${t.description} — ${fmt(t.amount)} (${(t.amount / avg).toFixed(1)}x your average expense)`);
  }, [transactions]);

  const customersWhoOwe = useMemo(() => {
    return (invoices as Invoice[])
      .filter(i => i.status !== "paid" && i.status !== "void")
      .map(i => ({ customer: i.customer, balance: invoiceTotal(i) - i.amountPaid }))
      .filter(x => x.balance > 0)
      .sort((a, b) => b.balance - a.balance);
  }, [invoices]);

  const suggestions = [
    "Explain why profit changed this month.",
    "Show my biggest expenses.",
    "Which customers owe me money?",
    "Predict my cash flow for next month.",
    "Find duplicate expenses.",
    "Find unusual transactions.",
    "Recommend tax deductions I might be missing."
  ];

  const askAI = async (q: string) => {
    setQuestion(q);
    setIsLoading(true);
    setAnswer(null);
    const businessSummary = [
      `Cash: ${fmt(cashBalance)}, Accounts Receivable: ${fmt(arBalance)}, Accounts Payable: ${fmt(apBalance)}.`,
      `All-time Revenue: ${fmt(totalRevenue)}, Expenses: ${fmt(totalExpenses)}, Net Income: ${fmt(netIncome)}.`,
      `Chart of Accounts balances: ${accounts.map((a: Account) => `${a.name}: ${fmt(accountBalances[a.id] || 0)}`).join("; ")}.`,
      `Customers with an open balance: ${customersWhoOwe.length === 0 ? "none" : customersWhoOwe.map(c => `${c.customer} owes ${fmt(c.balance)}`).join("; ")}.`,
      `Possible duplicate expenses detected (same amount/date/description): ${possibleDuplicates.length === 0 ? "none found" : possibleDuplicates.join("; ")}.`,
      `Unusually large expenses detected (3x+ the average): ${unusualTransactions.length === 0 ? "none found" : unusualTransactions.join("; ")}.`,
      `Open bills: ${bills.filter((b: Bill) => b.status !== "paid").length}.`
    ].join(" ");

    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: "accounting",
          pageName: "Accounting & Bookkeeping",
          isOwnerOrAdmin: true,
          businessSummary,
          query: q
        })
      });
      const data = await res.json();
      setAnswer(data.text || "No response.");
    } catch {
      setAnswer("Couldn't reach the AI right now — check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-black text-[#1F3557] uppercase flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-[#315C9F]" /> AI Financial Insights</h3>
      <p className="text-[10px] text-[#5E7393]">Real Gemini AI, grounded in your actual ledger balances — not canned responses.</p>

      <div className="flex flex-wrap gap-1.5">
        {suggestions.map(s => (
          <button key={s} onClick={() => askAI(s)} className="px-2.5 py-1.5 bg-[#EAF5FF] hover:bg-white border border-[#9EC8EF] rounded-xl text-[10px] font-bold text-[#1F3557] cursor-pointer">
            {s}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === "Enter" && question.trim() && askAI(question)}
          placeholder="Ask about your finances..."
          className="flex-1 border border-[#9EC8EF] rounded-xl px-3 py-2 text-xs bg-white"
        />
        <button onClick={() => question.trim() && askAI(question)} className="px-4 py-2 bg-[#315C9F] text-white rounded-xl text-xs font-bold">Ask</button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-[#5E7393]"><Loader2 className="w-4 h-4 animate-spin" /> Thinking...</div>
      )}
      {answer && (
        <div className="bg-[#C7E3FA] rounded-2xl border border-[#9EC8EF] p-4 text-xs text-[#1F3557] whitespace-pre-wrap leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
};
