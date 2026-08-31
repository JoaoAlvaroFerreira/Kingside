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
}

/** GET with 429 backoff and 5xx retry. Returns the raw body. */
export async function httpGet(
  url: string,
  signal: AbortSignal,
  options: GetOptions = {},
  onStatus?: (message: string) => void
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    throwIfAborted(signal);

    const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
    if (options.accept) headers.Accept = options.accept;
    if (options.token) headers.Authorization = `Bearer ${options.token.trim()}`;

    let response: Response;
    try {
      response = await fetch(url, { headers, signal });
    } catch (e: any) {
      if (signal.aborted) throw new FetchCancelled();
      if (attempt === MAX_ATTEMPTS - 1) {
        throw new FetchError('network', `Could not reach ${hostOf(url)}: ${e?.message ?? e}`);
      }
      await delay(2000 * (attempt + 1), signal);
      continue;
    }

    if (response.status === 404) {
      throw new FetchError('user-not-found', 'That account was not found.');
    }
    if (response.status === 429) {
      onStatus?.('Rate limited — waiting 60s…');
      await delay(RATE_LIMIT_WAIT_MS, signal);
      continue;
    }
    if (response.status >= 500 && attempt < MAX_ATTEMPTS - 1) {
      await delay(2000 * (attempt + 1), signal);
      continue;
    }
    if (!response.ok) {
      throw new FetchError('network', `HTTP ${response.status} from ${hostOf(url)}`);
    }
    return response.text();
  }
  throw new FetchError('rate-limited', `Gave up on ${hostOf(url)} after repeated rate limiting.`);
}

function hostOf(url: string): string {
  const match = url.match(/^https?:\/\/([^/]+)/);
  return match ? match[1] : url;
}
