import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin, Connect} from 'vite';
import {handleAiAsk, handleScanReceipt, handleScanFinancialDocument} from './server/aiHandler';
import {getClientIp} from './server/clientInfo';
import {createPlaidLinkToken, exchangePlaidPublicToken} from './server/plaidHandler';
import {sendPushToRecipients} from './server/pushNotifications';
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
      server.middlewares.use('/api/ai/scan-financial-document', jsonRoute(handleScanFinancialDocument));
      server.middlewares.use('/api/plaid/create-link-token', jsonRoute(body =>
        createPlaidLinkToken(String(body?.clientUserId || 'ownerslocal-sandbox-owner'))
      ));
      server.middlewares.use('/api/plaid/exchange-public-token', jsonRoute(body =>
        exchangePlaidPublicToken(body?.publicToken, body?.institutionName)
      ));
      server.middlewares.use('/api/client-info', (req: IncomingMessage, res: ServerResponse) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ip: getClientIp(req) }));
      });
      server.middlewares.use('/api/notifications/send-push', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const { recipientEmails, title, body, data } = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
          if (!Array.isArray(recipientEmails) || !recipientEmails.length || !title || !body) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'recipientEmails (non-empty array), title, and body are required' }));
            return;
          }
          const result = await sendPushToRecipients({ recipientEmails, title, body, data });
          if (!result.configured) {
            res.statusCode = 503;
            res.end(JSON.stringify({ error: 'Push notifications are not configured yet', sent: 0 }));
            return;
          }
          res.end(JSON.stringify(result));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to send push notification' }));
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), aiApiDevMiddleware()],
    define: {
      // Render supplies the restricted browser key at build time through the
      // linked environment group. Do not hard-code credentials into the app.
      'process.env.GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(
        process.env.GOOGLE_MAPS_PLATFORM_KEY || ''
      ),
      // Map IDs are tied to a specific Google Cloud project — a Map ID from
      // a different project than the one the API key belongs to will fail
      // to render Advanced Markers. Configurable per-deployment instead of
      // hardcoded so each real business's own key/Map ID pair actually match.
      'process.env.GOOGLE_MAPS_MAP_ID': JSON.stringify(process.env.GOOGLE_MAPS_MAP_ID || ''),
      // Public by design (it authorizes this app's origin to request a push
      // subscription, nothing more) — pairs with the private
      // FIREBASE_SERVICE_ACCOUNT_JSON server-side secret that actually sends
      // pushes. See src/lib/pushNotifications.ts.
      'process.env.FIREBASE_VAPID_KEY': JSON.stringify(process.env.FIREBASE_VAPID_KEY || '')
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: parseInt(process.env.PORT || '3000'),
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
