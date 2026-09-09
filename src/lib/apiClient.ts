import { auth } from "../firebase";

/**
 * fetch wrapper that attaches the signed-in user's Firebase ID token as a
 * Bearer Authorization header -- required by every /api/ai/*, /api/plaid/*,
 * and /api/notifications/send-push route (see server.ts's requireAuth /
 * vite.config.ts's dev-mode equivalent). Falls back to a plain fetch (and
 * lets the server's 401 explain why) if there's no signed-in user yet.
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
