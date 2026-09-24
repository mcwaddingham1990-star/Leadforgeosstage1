import { auth } from "../firebase";

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

/**
 * Awaits any promise while honoring an AbortSignal even if the underlying
 * operation itself (Firebase getIdToken, for example) doesn't accept one.
 *
 * This matters because authedFetch used to wait for getIdToken() before the
 * actual fetch began. Callers such as PaymentsPage correctly supplied a
 * 15-second AbortSignal, but that signal only reached fetch(), so a stalled
 * Firebase token refresh could leave the UI in "loading" forever.
 */
async function awaitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) throw abortError();

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });

    promise.then(
      value => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      error => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

/**
 * fetch wrapper that attaches the signed-in user's Firebase ID token as a
 * Bearer Authorization header -- required by authenticated API routes.
 *
 * The caller's AbortSignal covers BOTH Firebase token acquisition and the
 * network fetch. This keeps retryable screens from hanging indefinitely if
 * Firebase token refresh stalls before a request is ever sent.
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const signal = init.signal ?? null;
  const user = auth.currentUser;

  const token = user
    ? await awaitWithSignal(user.getIdToken(), signal)
    : undefined;

  if (signal?.aborted) throw abortError();

  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
