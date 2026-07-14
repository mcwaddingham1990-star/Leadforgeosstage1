import type { IncomingMessage } from 'http';

// Real connecting IP, honoring a reverse proxy's X-Forwarded-For when present.
// No fabricated fallback: if neither is available, the caller gets "unknown".
export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}
