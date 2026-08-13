import crypto from 'crypto';

// Lets SelfieSave render inside an Owners Local <iframe> without its own
// "Sign in with ChatGPT" gate blocking the load. SelfieSave's login page
// refuses to render when framed (standard OAuth anti-clickjacking behavior),
// and its session cookie can't reach a same-page iframe anyway (default
// SameSite=Lax). So instead of relying on cookies, Owners Local mints a
// short-lived signed ticket identifying the logged-in user; SelfieSave
// verifies it server-side, on its own "/" route, using the same shared
// secret, and skips its login gate for that one request.
//
// SELFIESAVE_EMBED_SECRET must be set to the SAME value on both this app's
// server and SelfieSave's server. Leave it unset here to keep Owners Local
// on the (working) popup-window fallback until SelfieSave's side implements
// the matching check -- see the ticket format below.
const TICKET_TTL_MS = 90_000;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export interface SelfieSaveEmbedTicketRequest {
  email?: string;
  name?: string;
}

export interface SelfieSaveEmbedTicket {
  token: string;
  expiresAt: number;
}

/**
 * Ticket format: `${base64url(JSON payload)}.${hex HMAC-SHA256 signature}`
 * Payload: { email, name, iat, exp } (epoch ms).
 *
 * SelfieSave should, on receiving `?embed_token=<token>`:
 *  1. Split on the last ".", recompute HMAC-SHA256(payloadB64, SELFIESAVE_EMBED_SECRET),
 *     and reject on mismatch (constant-time compare).
 *  2. Reject if `exp` has passed.
 *  3. Treat the request as authenticated for `email` and render the app
 *     directly instead of the "Sign in with ChatGPT" gate.
 *  4. Any missing/invalid/expired token must fall through to the normal
 *     sign-in flow -- direct (non-embedded) visits are unaffected.
 */
export function mintSelfieSaveEmbedTicket(req: SelfieSaveEmbedTicketRequest): SelfieSaveEmbedTicket {
  const secret = process.env.SELFIESAVE_EMBED_SECRET;
  if (!secret) {
    throw new Error('SELFIESAVE_EMBED_SECRET is not configured');
  }
  if (!req.email) {
    throw new Error('email is required to mint a SelfieSave embed ticket');
  }

  const expiresAt = Date.now() + TICKET_TTL_MS;
  const payload = { email: req.email, name: req.name || '', iat: Date.now(), exp: expiresAt };
  const payloadB64 = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

  return { token: `${payloadB64}.${sig}`, expiresAt };
}
