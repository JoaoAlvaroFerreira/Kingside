/**
 * chess.com: monthly archives.
 *
 * The API publishes whole months and offers no server-side filtering, so everything in the
 * spec is applied here. Each archive is a JSON array of games carrying `rules`, `rated`,
 * `time_class` and `end_time` alongside the PGN — cheap fields to filter on before any
 * parsing happens.
 */

import { FetchSpec, FetchAccount, FetchPeriod, GameSource, Speed, FetchError } from '@types';
import { httpGet, throwIfAborted } from './http';

const API = 'https://api.chess.com/pub';

/** chess.com says "daily" where everyone else says correspondence. */
const TIME_CLASS: Record<string, Speed> = {
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  daily: 'correspondence',
};

interface ChessComGame {
  pgn?: string;
  rules?: string;
  rated?: boolean;
  time_class?: string;
  end_time?: number;
  white?: { username?: string };
  black?: { username?: string };
}

class ChessComSourceClass implements GameSource {
  readonly id = 'chesscom' as const;

  async listPeriods(
    spec: FetchSpec, account: FetchAccount, signal: AbortSignal
  ): Promise<FetchPeriod[]> {
    const user = account.username.trim().toLowerCase();
    if (!user) throw new FetchError('user-not-found', 'Enter a chess.com username.');

    const body = await httpGet(`${API}/player/${encodeURIComponent(user)}/games/archives`, signal);
    let archives: string[] = [];
    try {
      archives = JSON.parse(body)?.archives ?? [];
    } catch {
      throw new FetchError('network', 'chess.com returned an unreadable archive list.');
    }

    const periods: FetchPeriod[] = [];
    for (const url of archives) {
      // Archive URLs end .../games/YYYY/MM
      const match = /\/(\d{4})\/(\d{2})$/.exec(url);
      if (!match) continue;
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (!inRange(year, month, spec)) continue;
      periods.push({ id: `${match[1]}-${match[2]}`, year, month });
    }
    return periods;
  }

  async fetchPeriod(
    spec: FetchSpec, account: FetchAccount, period: FetchPeriod, signal: AbortSignal
  ): Promise<string[]> {
    const user = account.username.trim().toLowerCase();
    const month = String(period.month).padStart(2, '0');
    const body = await httpGet(
      `${API}/player/${encodeURIComponent(user)}/games/${period.year}/${month}`,
      signal
    );

    let games: ChessComGame[] = [];
    try {
      games = JSON.parse(body)?.games ?? [];
    } catch {
      return [];
    }

    const speeds = new Set(spec.speeds);
    const kept: string[] = [];
    for (const game of games) {
      throwIfAborted(signal);
      if (!game.pgn) continue;
      if (spec.standardOnly && game.rules !== 'chess') continue;
      if (spec.ratedOnly && !game.rated) continue;

      const speed = TIME_CLASS[game.time_class ?? ''];
      if (!speed || !speeds.has(speed)) continue;

      if (spec.color) {
        const lower = user;
        const isWhite = (game.white?.username ?? '').toLowerCase() === lower;
        const isBlack = (game.black?.username ?? '').toLowerCase() === lower;
        if (spec.color === 'white' && !isWhite) continue;
        if (spec.color === 'black' && !isBlack) continue;
      }

      if (game.end_time) {
        const played = new Date(game.end_time * 1000);
        if (spec.since && played < startOfDay(spec.since)) continue;
        if (spec.until && played > endOfDay(spec.until)) continue;
      }

      kept.push(game.pgn);
    }
    return kept;
  }
}

/** A month is in range if it overlaps the spec's window at all. */
function inRange(year: number, month: number, spec: FetchSpec): boolean {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  if (spec.since && last < startOfDay(spec.since)) return false;
  if (spec.until && first > endOfDay(spec.until)) return false;
  return true;
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function endOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

export const ChessComSource = new ChessComSourceClass();
