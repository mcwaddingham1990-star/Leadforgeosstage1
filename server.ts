import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleAiAsk, AiAskRequest } from './server/aiHandler';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

app.post('/api/ai/ask', async (req, res) => {
  try {
    const body = req.body as AiAskRequest;
    const result = await handleAiAsk(body);
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
