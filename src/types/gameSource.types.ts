/**
 * Fetching games from an online account, for building an opening book on-device.
 *
 * Both supported sources are read one month at a time. chess.com only publishes whole
 * monthly archives, and Lichess — which would happily stream a whole account — cannot be
 * streamed here at all: React Native's fetch has no response body stream, so an unwindowed
 * request buffers the entire account in memory, which is the failure that made importing a
 * large PGN impossible in the first place.
 *
 * Windowing by month bounds every request, and makes an interrupted import resumable at
 * month granularity rather than starting over.
 */

/** Normalised speed buckets. Lichess calls these perfTypes, chess.com time_class. */
export const SPEEDS = ['ultrabullet', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence'] as const;
export type Speed = (typeof SPEEDS)[number];

export type GameSourceId = 'lichess' | 'chesscom';

/** One account to pull games from. A book may draw on several. */
export interface FetchAccount {
  source: GameSourceId;
  username: string;
}

/**
 * What to fetch and what to keep.
 *
 * `accounts` is a list because one player is often several accounts — a Lichess handle and
 * a chess.com handle, or an old username and a current one — and their games are one body
 * of play, not two. Everything else applies to all of them.
 */
export interface FetchSpec {
  accounts: FetchAccount[];
  /** Only games where the user had this colour. */
  color?: 'white' | 'black';
  speeds: Speed[];
  ratedOnly: boolean;
  /** Exclude variants (Chess960, Crazyhouse, …). */
  standardOnly: boolean;
  since?: Date;
  until?: Date;
  /** Optional Lichess API token — raises the rate limit, not required. */
  token?: string;
}

/** One month of one account's history. */
export interface FetchPeriod {
  /** Stable "YYYY-MM". Combined with the account to form the resume marker. */
  id: string;
  year: number;
  month: number; // 1-12
}

/**
 * The resume marker for one account-month.
 *
 * Scoped by account because two accounts have different archives: a bare month would let
 * one account's finished month mark another's as done, silently skipping those games.
 */
export function periodKey(account: FetchAccount, period: FetchPeriod): string {
  return `${account.source}:${account.username.trim().toLowerCase()}:${period.id}`;
}

export type FetchFailure =
  | 'user-not-found'
  | 'rate-limited'
  | 'network'
  | 'unsupported';

export class FetchError extends Error {
  constructor(public readonly reason: FetchFailure, message: string) {
    super(message);
    this.name = 'FetchError';
  }
}

/** Raised when the caller cancels; unwinds before anything is committed. */
export class FetchCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'FetchCancelled';
  }
}

/**
 * A source of games, read a month at a time.
 *
 * `listPeriods` is what makes an import resumable and incremental: the set of months is
 * known up front, so finished ones can be skipped on a retry and a later refresh only has
 * to fetch what is new.
 */
export interface GameSource {
  readonly id: GameSourceId;
  /** Months this account has games in, oldest first, already trimmed to the spec's range. */
  listPeriods(spec: FetchSpec, account: FetchAccount, signal: AbortSignal): Promise<FetchPeriod[]>;
  /** One month of PGNs, already filtered by the spec. One string per game. */
  fetchPeriod(
    spec: FetchSpec, account: FetchAccount, period: FetchPeriod, signal: AbortSignal
  ): Promise<string[]>;
}
