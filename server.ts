import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleAiAsk, handleScanReceipt, handleScanFinancialDocument, handleScanBusinessRecord, AiAskRequest, ScanReceiptRequest, ScanFinancialDocumentRequest, ScanBusinessRecordRequest } from './server/aiHandler';
import { getClientIp } from './server/clientInfo';
import { sendPushToRecipients } from './server/pushNotifications';
import { handleWebLeadFormSubmit, WebLeadFormSubmission, recordWebsiteVisit } from './server/webLeadFormHandler';
import { processDueRecurringTransactions, processDueMembershipMaintenance, processDueMembershipBilling, processDueReviewRequests, startRecurringScheduler } from './server/recurringScheduler';
import { getRemoteSigningInfo, submitRemoteSignature, RemoteSignSubmission } from './server/remoteSigning';
import { requireAuth } from './server/verifyAuth';
import { rateLimit } from './server/rateLimit';
import { handleStripeWebhook } from './server/stripeWebhook';
import { handleStripeConnectWebhook } from './server/stripeConnectWebhook';
import { handleGetOrCreateAccount, handleCreateAccountSession, handleGetAccountStatus } from './server/stripeConnectRoutes';
import { getPortalData, getPortalDocumentPdf, submitEstimateDecision, submitServiceRequest, submitPortalMessage, createInvoiceCheckout, ServiceRequestSubmission } from './server/customerPortal';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Stripe webhook signature verification needs the exact raw request body
// Stripe signed, not the parsed-and-reserialized object the global
// express.json() below would produce -- so this has to be registered (with
// its own express.raw()) before that global JSON parser runs, or the body
// would already be consumed/transformed by the time this route sees it.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// Separate endpoint, separate signing secret (STRIPE_CONNECT_WEBHOOK_SECRET)
// for events on businesses' own connected accounts (connect: true in the
// Stripe Dashboard) -- see server/stripeConnectWebhook.ts.
app.post('/api/stripe/connect-webhook', express.raw({ type: 'application/json' }), handleStripeConnectWebhook);

// 10mb limit: base64-encoded receipt/label photos for /api/ai/scan-receipt are larger than express's 100kb default.
app.use(express.json({ limit: '10mb' }));

// Every /api/ai/* route below spends real Gemini API quota on each call and
// previously had no authentication at all -- anyone on the internet could
// call them directly (bypassing the app entirely) for free, unmetered use
// of this server's paid AI key. requireAuth confines them to real signed-in
// app users; the rate limit caps how much any single account can spend.
app.use('/api/ai', requireAuth, rateLimit('ai', 60_000, 20));

app.post('/api/ai/ask', async (req, res) => {
  try {
    const body = req.body as AiAskRequest;
    const result = await handleAiAsk(body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'AI request failed' });
  }
});

app.post('/api/ai/scan-receipt', async (req, res) => {
  try {
    const body = req.body as ScanReceiptRequest;
    const result = await handleScanReceipt(body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'AI request failed' });
  }
});

app.post('/api/ai/scan-financial-document', async (req, res) => {
  try {
    const body = req.body as ScanFinancialDocumentRequest;
    const result = await handleScanFinancialDocument(body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'AI request failed' });
  }
});

app.post('/api/ai/scan-business-record', async (req, res) => {
  try {
    const result = await handleScanBusinessRecord(req.body as ScanBusinessRecordRequest);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'AI record scan failed' });
  }
});

app.get('/api/client-info', (req, res) => {
  res.json({ ip: getClientIp(req) });
});

// Stripe Connect: a business's own payments account, embedded inside the
// Payments tab rather than a separate Stripe-hosted page. All three need
// the caller's real, verified identity -- the connected account is
// resolved server-side from their own business (see stripeConnectRoutes.ts's
// resolveBusinessId), never a client-supplied business id, so one business's
// member can't touch another business's Stripe account this way.
app.post('/api/stripe/connect/account', requireAuth, rateLimit('stripe-connect', 60_000, 20), handleGetOrCreateAccount);
app.post('/api/stripe/connect/account-session', requireAuth, rateLimit('stripe-connect', 60_000, 20), handleCreateAccountSession);
app.get('/api/stripe/connect/status', requireAuth, rateLimit('stripe-connect', 60_000, 30), handleGetAccountStatus);

app.post('/api/notifications/send-push', requireAuth, async (req, res) => {
  try {
    const { recipientEmails, title, body, data } = req.body || {};
    if (!Array.isArray(recipientEmails) || !recipientEmails.length || !title || !body) {
      res.status(400).json({ error: 'recipientEmails (non-empty array), title, and body are required' });
      return;
    }
    const result = await sendPushToRecipients({ recipientEmails, title, body, data, callerUid: req.firebaseUser!.uid });
    if (!result.configured) {
      // Expected/normal until FIREBASE_SERVICE_ACCOUNT_JSON is configured --
      // the in-app notification (Firestore `notifications` collection,
      // already real-time) already delivered regardless of this response.
      res.status(503).json({ error: 'Push notifications are not configured yet', sent: 0 });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send push notification' });
  }
});

app.post('/api/jobs/process-recurring', async (req, res) => {
  const expected = process.env.RECURRING_CRON_SECRET;
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!expected || supplied !== expected) {
    res.status(expected ? 401 : 503).json({ error: expected ? 'Unauthorized' : 'Recurring cron is not configured' });
    return;
  }
  try {
    const [transactions, membershipMaintenance, membershipBilling, reviewRequests] = await Promise.all([
      processDueRecurringTransactions(),
      processDueMembershipMaintenance(),
      processDueMembershipBilling(),
      processDueReviewRequests(),
    ]);
    const configured = transactions.configured;
    res.status(configured ? 200 : 503).json(
      configured
        ? { configured, transactions, membershipMaintenance, membershipBilling, reviewRequests }
        : { configured, transactions, membershipMaintenance, membershipBilling, reviewRequests, error: 'Firebase Admin is not configured' }
    );
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Recurring processing failed' });
  }
});

// Embeddable website lead-capture form: submitted from a business's own
// external website, so it has to accept requests from any origin (there's
// no OwnersLocal login on that page to prove tenancy -- the embed token
// does that instead) and answer a CORS preflight.
app.options('/api/leads/submit-web-form', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});
app.post('/api/leads/submit-web-form', rateLimit('web-lead-form', 60_000, 10), async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const result = await handleWebLeadFormSubmit(req.body as WebLeadFormSubmission);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Lead form submission failed' });
  }
});

// Daily + total visitor count for the same embedded website (see the
// Integrations page's embed snippet) -- fires once per real page load, not
// per keystroke like a form submit, so this gets a much higher rate-limit
// ceiling than the form itself; it's just a cheap atomic counter increment.
app.options('/api/leads/track-visit', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});
app.post('/api/leads/track-visit', rateLimit('site-visit', 60_000, 120), async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const result = await recordWebsiteVisit(String(req.body?.token || ''));
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Could not record this visit' });
  }
});

// Remote e-signing: a customer opening a "sign this remotely" link has no
// OwnersLocal login, so these two endpoints are the only way that flow can
// read/write the one document its token points to (see server/remoteSigning.ts).
// Rate-limited since the token is the only thing standing between a
// visitor and someone else's document/signature.
app.get('/api/sign/:token', rateLimit('sign-get', 60_000, 20), async (req, res) => {
  try {
    const result = await getRemoteSigningInfo(req.params.token);
    res.status(result.ok ? 200 : 404).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Could not load this signing link' });
  }
});
app.post('/api/sign/:token', rateLimit('sign-post', 60_000, 10), async (req, res) => {
  try {
    const body = { ...(req.body as RemoteSignSubmission), token: req.params.token };
    const result = await submitRemoteSignature(body);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Could not submit this signature' });
  }
});

// Customer Portal: a customer opening their portal link has no OwnersLocal
// login of their own, so every one of these is gated only by the random
// portalToken on their own Customer record (see server/customerPortal.ts) --
// same model as the remote-signing endpoints just above. Rate-limited for
// the same reason: the token is the only thing standing between a visitor
// and one customer's own records.
app.get('/api/portal/:token', rateLimit('portal-get', 60_000, 30), async (req, res) => {
  try {
    const result = await getPortalData(req.params.token);
    res.status(result.ok ? 200 : 404).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Could not load your portal' });
  }
});
app.get('/api/portal/:token/documents/:documentId', rateLimit('portal-doc', 60_000, 30), async (req, res) => {
  try {
    const result = await getPortalDocumentPdf(req.params.token, req.params.documentId);
    res.status(result.ok ? 200 : 404).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Could not load this document' });
  }
});
app.post('/api/portal/:token/estimates/:estimateId/decision', rateLimit('portal-estimate-decision', 60_000, 15), async (req, res) => {
  try {
    const decision = req.body?.decision === 'Accepted' || req.body?.decision === 'Declined' ? req.body.decision : null;
    if (!decision) {
      res.status(400).json({ ok: false, error: 'decision must be Accepted or Declined' });
      return;
    }
    const result = await submitEstimateDecision(req.params.token, req.params.estimateId, decision);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Could not submit your decision' });
  }
});
app.post('/api/portal/:token/service-request', rateLimit('portal-service-request', 60_000, 15), async (req, res) => {
  try {
    const result = await submitServiceRequest(req.params.token, req.body as ServiceRequestSubmission);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Could not submit your request' });
  }
});
app.post('/api/portal/:token/messages', rateLimit('portal-messages', 60_000, 30), async (req, res) => {
  try {
    const result = await submitPortalMessage(req.params.token, String(req.body?.body || ''));
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Could not send your message' });
  }
});
app.post('/api/portal/:token/invoices/:invoiceId/checkout', rateLimit('portal-checkout', 60_000, 10), async (req, res) => {
  try {
    const origin = `${req.protocol}://${req.get('host')}/?portal=${encodeURIComponent(req.params.token)}`;
    const result = await createInvoiceCheckout(req.params.token, req.params.invoiceId, origin);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Could not start checkout' });
  }
});

const distDir = path.join(__dirname, 'dist');
app.use(express.static(distDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => {
  console.log(`OwnersLOCAL server listening on port ${port}`);
  startRecurringScheduler();
});
