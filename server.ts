import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleAiAsk, handleScanReceipt, AiAskRequest, ScanReceiptRequest } from './server/aiHandler';

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

const distDir = path.join(__dirname, 'dist');
app.use(express.static(distDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => {
  console.log(`Owner'sLocal server listening on port ${port}`);
});
