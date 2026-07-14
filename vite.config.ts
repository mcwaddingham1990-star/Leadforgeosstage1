import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin, Connect} from 'vite';
import {handleAiAsk, handleScanReceipt} from './server/aiHandler';
import {getClientIp} from './server/clientInfo';
import type {IncomingMessage, ServerResponse} from 'http';

// Dev-only middleware so `npm run dev` (pure Vite, no separate process) can
// serve /api/ai/* the same way the production server.ts does. GEMINI_API_KEY
// is read from process.env here (Node/server context) and is never bundled
// into client code — do not add it to the `define` block below.
function jsonRoute(handler: (body: any) => Promise<unknown>): Connect.NextHandleFunction {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
      const result = await handler(body);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'AI request failed' }));
    }
  };
}

function aiApiDevMiddleware(): Plugin {
  return {
    name: 'ai-api-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/api/ai/ask', jsonRoute(handleAiAsk));
      server.middlewares.use('/api/ai/scan-receipt', jsonRoute(handleScanReceipt));
      server.middlewares.use('/api/client-info', (req: IncomingMessage, res: ServerResponse) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ip: getClientIp(req) }));
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), aiApiDevMiddleware()],
    define: {
      'process.env.GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(process.env.GOOGLE_MAPS_PLATFORM_KEY || '')
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
