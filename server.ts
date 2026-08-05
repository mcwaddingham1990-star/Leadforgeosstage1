import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleAiAsk, handleScanReceipt, handleScanFinancialDocument, AiAskRequest, ScanReceiptRequest, ScanFinancialDocumentRequest } from './server/aiHandler';
import { getClientIp } from './server/clientInfo';
import { createPlaidLinkToken, exchangePlaidPublicToken } from './server/plaidHandler';

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

const distDir = path.join(__dirname, 'dist');
app.use(express.static(distDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => {
  console.log(`Owner'sLocal server listening on port ${port}`);
});
