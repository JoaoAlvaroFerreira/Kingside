/**
 * Lichess: the export API, requested one month at a time.
 *
 * Lichess would gladly stream a whole account from a single request, and that is how the
 * desktop tool reads it. Here it cannot be: React Native's fetch exposes no response body
 * stream, so the only way to consume a response is to buffer all of it. Asking month by
 * month bounds each buffer and, incidentally, gives the same resume points chess.com's
 * archives give for free.
 *
 * Unlike chess.com, Lichess filters server-side, so the spec is pushed into the query and
 * almost nothing is discarded locally.
 */

import { FetchSpec, FetchPeriod, GameSource, Speed, FetchError } from '@types';
import { httpGet } from './http';
import { splitGames } from './pgnScan';

const API = 'https://lichess.org/api';

const PERF: Record<Speed, string> = {
  ultrabullet: 'ultraBullet',
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  correspondence: 'correspondence',
};

class LichessSourceClass implements GameSource {
  readonly id = 'lichess' as const;

  /**
   * Every month between the account's creation and now (trimmed to the spec).
   *
   * Lichess publishes no archive index, so the range comes from the profile's `createdAt`.
   * Months with no games cost one cheap empty response rather than needing to be known
   * in advance.
   */
  async listPeriods(spec: FetchSpec, signal: AbortSignal): Promise<FetchPeriod[]> {
    const user = spec.username.trim();
    if (!user) throw new FetchError('user-not-found', 'Enter a Lichess username.');

    const body = await httpGet(`${API}/user/${encodeURIComponent(user)}`, signal, {
      accept: 'application/json',
      token: spec.token,
    });

    let createdAt: number | undefined;
    try {
      const profile = JSON.parse(body);
      createdAt = profile?.createdAt;
    } catch {
      throw new FetchError('network', 'Lichess returned an unreadable profile.');
    }

    const first = spec.since ?? (createdAt ? new Date(createdAt) : new Date(2010, 0, 1));
    const last = spec.until ?? new Date();
    return monthsBetween(first, last);
  }

  async fetchPeriod(spec: FetchSpec, period: FetchPeriod, signal: AbortSignal): Promise<string[]> {
    const since = Date.UTC(period.year, period.month - 1, 1);
    const until = Date.UTC(period.year, period.month, 1) - 1;

    const params = new URLSearchParams({
      since: String(clampSince(since, spec)),
      until: String(clampUntil(until, spec)),
      clocks: 'true',
      evals: 'true',
      opening: 'true',
      sort: 'dateAsc',
    });
    if (spec.color) params.set('color', spec.color);
    if (spec.ratedOnly) params.set('rated', 'true');
    // Requesting every perf is the same as requesting none, and a shorter URL is kinder.
    if (spec.speeds.length && spec.speeds.length < Object.keys(PERF).length) {
      params.set('perfType', spec.speeds.map(s => PERF[s]).join(','));
    }
    if (spec.standardOnly) params.set('variant', 'standard');

    const body = await httpGet(
      `${API}/games/user/${encodeURIComponent(spec.username.trim())}?${params.toString()}`,
      signal,
      // listPeriods already proved this account exists, so a 404 here cannot mean a
      // missing user — it is Lichess throttling, and must be backed off, not reported
      // as "account not found" halfway through a build.
      { accept: 'application/x-chess-pgn', token: spec.token, notFound: 'throttled' }
    );

    if (!body.trim()) return [];
    return splitGames(body);
  }
}

function clampSince(monthStart: number, spec: FetchSpec): number {
  return spec.since ? Math.max(monthStart, spec.since.getTime()) : monthStart;
}

function clampUntil(monthEnd: number, spec: FetchSpec): number {
  return spec.until ? Math.min(monthEnd, endOfDay(spec.until)) : monthEnd;
}

function endOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999);
}

export function monthsBetween(first: Date, last: Date): FetchPeriod[] {
  const periods: FetchPeriod[] = [];
  let year = first.getUTCFullYear();
  let month = first.getUTCMonth() + 1;
  const endYear = last.getUTCFullYear();
  const endMonth = last.getUTCMonth() + 1;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    periods.push({ id: `${year}-${String(month).padStart(2, '0')}`, year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return periods;
}

export const LichessSource = new LichessSourceClass();
