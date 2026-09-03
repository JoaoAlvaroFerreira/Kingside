/**
 * HTTP for the game sources: retries, rate-limit backoff, and cancellation.
 *
 * Both APIs answer a burst of monthly requests with 429s, so backing off is not optional —
 * an import that ignores it gets a few months in and then fails for the rest.
 */

import { FetchError, FetchCancelled } from '@types';

const USER_AGENT = 'Kingside/1.0 (personal chess trainer)';
/** Lichess asks clients to back off for a minute; chess.com is less strict. */
const RATE_LIMIT_WAIT_MS = 60_000;
const MAX_ATTEMPTS = 4;
/**
 * How long one request gets before it is abandoned and retried.
 *
 * fetch has no timeout of its own, so a connection that stalls mid-month never settles:
 * the build stops with no error and no progress until the user cancels it. A month of a
 * busy account is a large response, so this is generous — it is a stall detector, not a
 * latency budget.
 */
const REQUEST_TIMEOUT_MS = 120_000;

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new FetchCancelled();
}

/** Sleep that wakes early on cancel, so a 60s backoff never blocks a cancel that long. */
async function delay(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new FetchCancelled());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export interface GetOptions {
  accept?: string;
  token?: string;
  /**
   * What a 404 means for this endpoint.
   *
   * Lichess answers unauthenticated bursts on its game-export endpoint with a 404 and its
   * ordinary HTML page, not a JSON API error — the same status a genuinely missing account
   * gives. Callers that already know the account exists say `'throttled'` so the request is
   * backed off and retried instead of reported as a missing user.
   */
  notFound?: 'missing' | 'throttled';
}

/** GET with 429 backoff and 5xx retry. Returns the raw body. */
export async function httpGet(
  url: string,
  signal: AbortSignal,
  options: GetOptions = {},
  onStatus?: (message: string) => void
): Promise<string> {
  let lastWasRateLimit = false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    throwIfAborted(signal);

    const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
    if (options.accept) headers.Accept = options.accept;
    if (options.token) headers.Authorization = `Bearer ${options.token.trim()}`;

    // The caller's signal still cancels; this one additionally fires on a stall. The body
    // is read inside the same window, because a response can arrive and then stop midway.
    const attemptAbort = new AbortController();
    const relayAbort = () => attemptAbort.abort();
    signal.addEventListener('abort', relayAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; attemptAbort.abort(); }, REQUEST_TIMEOUT_MS);

    let response: Response;
    let body: string;
    try {
      response = await fetch(url, { headers, signal: attemptAbort.signal });
      body = await response.text();
    } catch (e: any) {
      if (signal.aborted) throw new FetchCancelled();
      const what = timedOut
        ? `${hostOf(url)} stopped responding after ${REQUEST_TIMEOUT_MS / 1000}s`
        : `Could not reach ${hostOf(url)}: ${e?.message ?? e}`;
      if (attempt === MAX_ATTEMPTS - 1) throw new FetchError('network', what);
      onStatus?.(`${what} — retrying…`);
      await delay(2000 * (attempt + 1), signal);
      continue;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', relayAbort);
    }

    if (response.status === 404 && options.notFound !== 'throttled') {
      throw new FetchError('user-not-found', 'That account was not found.');
    }
    if (response.status === 429 || response.status === 404) {
      onStatus?.('Rate limited — waiting 60s…');
      lastWasRateLimit = true;
      await delay(RATE_LIMIT_WAIT_MS, signal);
      continue;
    }
    if (response.status >= 500 && attempt < MAX_ATTEMPTS - 1) {
      await delay(2000 * (attempt + 1), signal);
      continue;
    }
    if (!response.ok) {
      // The body is worth carrying: both APIs explain a refusal there, and "HTTP 403" on
      // its own is not something a report can be acted on.
      const detail = body.trim().slice(0, 200);
      throw new FetchError(
        'network',
        `HTTP ${response.status} from ${hostOf(url)}${detail ? `: ${detail}` : ''}`
      );
    }
    return body;
  }
  throw new FetchError(
    'rate-limited',
    lastWasRateLimit
      ? `${hostOf(url)} is rate limiting this device. Wait a few minutes and try again.`
      : `Gave up on ${hostOf(url)} after repeated failures.`
  );
}

function hostOf(url: string): string {
  const match = url.match(/^https?:\/\/([^/]+)/);
  return match ? match[1] : url;
}
