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

/** What to fetch and what to keep. */
export interface FetchSpec {
  source: GameSourceId;
  username: string;
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

/** One month of an account's history. */
export interface FetchPeriod {
  /** Stable "YYYY-MM", used as the resume marker. */
  id: string;
  year: number;
  month: number; // 1-12
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
  listPeriods(spec: FetchSpec, signal: AbortSignal): Promise<FetchPeriod[]>;
  /** One month of PGNs, already filtered by the spec. One string per game. */
  fetchPeriod(spec: FetchSpec, period: FetchPeriod, signal: AbortSignal): Promise<string[]>;
}
