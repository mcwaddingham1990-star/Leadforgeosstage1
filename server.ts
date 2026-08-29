import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleAiAsk, handleScanReceipt, handleScanFinancialDocument, handleScanBusinessRecord, AiAskRequest, ScanReceiptRequest, ScanFinancialDocumentRequest, ScanBusinessRecordRequest } from './server/aiHandler';
import { getClientIp } from './server/clientInfo';
import { createPlaidLinkToken, exchangePlaidPublicToken } from './server/plaidHandler';
import { sendPushToRecipients } from './server/pushNotifications';
import { handleWebLeadFormSubmit, WebLeadFormSubmission } from './server/webLeadFormHandler';
import { processDueRecurringTransactions, startRecurringScheduler } from './server/recurringScheduler';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
// 10mb limit: base64-encoded receipt/label photos for /api/ai/scan-receipt are larger than express's 100kb default.
app.use(express.json({ limit: '10mb' }));

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

app.post('/api/plaid/create-link-token', async (req, res) => {
  try {
    res.json(await createPlaidLinkToken(String(req.body?.clientUserId || 'ownerslocal-sandbox-owner')));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to start Plaid Link' });
  }
});

app.post('/api/plaid/exchange-public-token', async (req, res) => {
  try {
    res.json(await exchangePlaidPublicToken(req.body?.publicToken, req.body?.institutionName));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to connect bank account' });
  }
});

app.post('/api/notifications/send-push', async (req, res) => {
  try {
    const { recipientEmails, title, body, data } = req.body || {};
    if (!Array.isArray(recipientEmails) || !recipientEmails.length || !title || !body) {
      res.status(400).json({ error: 'recipientEmails (non-empty array), title, and body are required' });
      return;
    }
    const result = await sendPushToRecipients({ recipientEmails, title, body, data });
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
    const result = await processDueRecurringTransactions();
    res.status(result.configured ? 200 : 503).json(result.configured ? result : { ...result, error: 'Firebase Admin is not configured' });
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
app.post('/api/leads/submit-web-form', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const result = await handleWebLeadFormSubmit(req.body as WebLeadFormSubmission);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Lead form submission failed' });
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
