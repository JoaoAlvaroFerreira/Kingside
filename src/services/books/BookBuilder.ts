/**
 * BookBuilder — builds a .kbook on the device from an online account.
 *
 * The same aggregation the desktop generator does, driven by a month-at-a-time fetch
 * instead of a 452MB file. Nothing is ever held beyond one month of games.
 *
 * Measured on device, the costs are lopsided and the design follows from that:
 *
 *   chess.js SAN replay      1,067 plies/sec  <- the floor; everything else is noise
 *   INSERT, row per call     1,586 rows/sec
 *   INSERT, 250-row VALUES  26,346 rows/sec   <- 16.6x, and why rows are batched
 *   GROUP BY over 4.19M rows          ~10 sec
 *
 * Replay dominates, so only the plies that are actually indexed go through chess.js: a
 * game runs ~95 plies and the book indexes 30, and replaying the rest to no purpose cost
 * roughly 3x the whole build.
 *
 * An ordinary account is seconds; only a many-year backfill of a prolific account is long,
 * which is what the resume markers are for.
 */

import { Platform } from 'react-native';
import { Chess } from 'chess.js';
import {
  FetchSpec,
  FetchPeriod,
  FetchCancelled,
  FetchError,
  BookRecord,
  normalizeFen,
  BOOK_SCHEMA_VERSION,
} from '@types';
import { getGameSource } from '@services/gameSources';
import { scanGame } from '@services/gameSources/pgnScan';
import { BookService } from './BookService';
import * as FileSystem from 'expo-file-system';

let SQLite: any = null;
if (Platform.OS !== 'web') {
  SQLite = require('expo-sqlite');
}

/** Depth the book indexes. Past this, repetition is too rare to rank. */
const MAX_PLY = 30;
/** Keep every pair to here; beyond it a pair needs MIN_COUNT_DEEP occurrences. */
const FULL_PLY = 16;
const MIN_COUNT_DEEP = 2;
const SAMPLE_GAMES = 8;

/**
 * Rows per multi-row INSERT, derived from the column count rather than hardcoded: SQLite
 * builds before 3.32 cap bind variables at 999 and reject a larger statement outright.
 */
const STAGING_COLUMNS = 6;
const MAX_BIND_PARAMS = 900;
const STAGING_CHUNK = Math.floor(MAX_BIND_PARAMS / STAGING_COLUMNS);

/** Rows buffered in JS before a flush. Bounds memory without shrinking the batches. */
const FLUSH_THRESHOLD = 5000;

/**
 * How long a build or refresh may run before it stops and hands back a usable book.
 *
 * Deliberately a time budget rather than a month cap, because months are not comparable
 * between accounts: measured at ~35 games/sec, two minutes is ~4,150 games, which is about
 * 1.7 months of a streamer's bullet output and over 130 months of a casual player's. A
 * month count that suited one would be absurd for the other. Time also self-corrects for a
 * slower or faster phone, which a game count would not.
 *
 * Checked at month boundaries only: a month is the resume unit, and stopping mid-month
 * could not be marked complete without risking those games being fetched twice. Overshoot
 * is therefore bounded by one month.
 */
const BUILD_BUDGET_MS = 120_000;

const RESULT_CODE: Record<string, number> = { '1-0': 1, '1/2-1/2': 0, '0-1': -1 };
const UNKNOWN_RESULT = 2;

export interface BuildProgress {
  phase: string;
  periodsDone: number;
  periodsTotal: number;
  games: number;
  plies: number;
}

export interface RefreshResult {
  record: BookRecord;
  newGames: number;
  newPositions: number;
  months: number;
  /** Months still missing because the time budget ran out. Refresh again to continue. */
  remaining: number;
  seconds: number;
  /** True when the book already covered every month the source has. */
  upToDate: boolean;
}

export interface BuildResult {
  record: BookRecord;
  games: number;
  positions: number;
  unparsed: number;
  seconds: number;
  /** Months left unfetched because the time budget ran out. Refresh continues from here. */
  remaining: number;
}

type StagingRow = [string, string, number, number, number, number];

class BookBuilderClass {
  /**
   * Build (or resume) a book for the given account.
   *
   * Resumable at month granularity: each finished month is recorded in the book's own
   * `book_meta`, so a cancelled or failed run continues where it stopped instead of
   * re-fetching and re-replaying everything.
   */
  async build(
    spec: FetchSpec,
    displayName: string,
    onProgress: (p: BuildProgress) => void,
    signal: AbortSignal,
    resumeFileName?: string
  ): Promise<BuildResult> {
    if (Platform.OS === 'web') {
      throw new Error('Building books is not supported on web.');
    }

    const started = Date.now();
    const source = getGameSource(spec.source);
    const fileName = resumeFileName
      ?? `book_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.kbook`;
    const path = `${FileSystem.documentDirectory}SQLite/${fileName}`;
    await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}SQLite/`, {
      intermediates: true,
    }).catch(() => {});

    const db = await SQLite.openDatabaseAsync(fileName);
    await db.execAsync('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');
    await this.createSchema(db);
    await BookService.setPendingBuild({ fileName, displayName, spec: serialiseSpec(spec) });

    let games = 0;
    let plies = 0;
    let unparsed = 0;
    let gameId = 0;
    let remaining = 0;

    try {
      onProgress({ phase: 'Listing months…', periodsDone: 0, periodsTotal: 0, games, plies });
      // Newest first. A build that runs out of budget must leave behind the months a player
      // actually prepares against; oldest-first would spend the whole budget on games from
      // a decade ago and stop before reaching anything current.
      const periods = (await source.listPeriods(spec, signal)).reverse();
      const done = await this.completedPeriods(db);

      for (let i = 0; i < periods.length; i++) {
        const period = periods[i];
        if (signal.aborted) throw new FetchCancelled();
        if (done.has(period.id)) continue;

        onProgress({
          phase: `Fetching ${period.id}…`,
          periodsDone: i, periodsTotal: periods.length, games, plies,
        });
        const pgns = await source.fetchPeriod(spec, period, signal);

        onProgress({
          phase: `Reading ${period.id} (${pgns.length} games)…`,
          periodsDone: i, periodsTotal: periods.length, games, plies,
        });

        const staging: StagingRow[] = [];
        for (const pgn of pgns) {
          if (signal.aborted) throw new FetchCancelled();
          gameId += 1;
          const outcome = this.ingestGame(pgn, spec, gameId, staging);
          if (outcome.broke) unparsed += 1;
          plies += outcome.plies;
          games += 1;
          await this.insertGameRow(db, gameId, outcome);

          if (staging.length >= FLUSH_THRESHOLD) {
            await this.flushStaging(db, staging);
            // Replay blocks the JS thread; yielding here keeps the UI and the cancel
            // button alive through a long month.
            await yieldToUi();
            onProgress({
              phase: `Reading ${period.id}…`,
              periodsDone: i, periodsTotal: periods.length, games, plies,
            });
          }
        }
        await this.flushStaging(db, staging);
        await this.markPeriodDone(db, period);
        await yieldToUi();

        if (Date.now() - started >= BUILD_BUDGET_MS && i < periods.length - 1) {
          remaining = periods.length - 1 - i;
          break;
        }
      }

      // Filters that match nothing are easy to write by accident (a speed the account
      // never plays, a year before they joined). Registering an empty book would put a
      // useless entry in the library and tell the user nothing about why.
      if (games === 0) {
        await db.closeAsync();
        await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
        await BookService.clearPendingBuild();
        throw new FetchError(
          'unsupported',
          'No games matched those filters. Check the time controls, colour and year.'
        );
      }

      onProgress({
        phase: 'Aggregating positions…',
        periodsDone: periods.length, periodsTotal: periods.length, games, plies,
      });
      await this.aggregate(db);

      const positionRow = await db.getFirstAsync('SELECT COUNT(*) AS n FROM book_moves') as any;
      const positions = positionRow?.n ?? 0;
      await this.writeMeta(db, spec, displayName, games);

      onProgress({
        phase: 'Compacting…',
        periodsDone: periods.length, periodsTotal: periods.length, games, plies,
      });
      await db.execAsync('DROP TABLE IF EXISTS staging');
      await db.execAsync('VACUUM');
      await db.closeAsync();

      const record = await BookService.registerBuiltBook(fileName, displayName);
      return {
        record, games, positions, unparsed, remaining,
        seconds: (Date.now() - started) / 1000,
      };
    } catch (error) {
      try { await db.closeAsync(); } catch { /* already closed */ }
      // A cancelled build keeps its file: the resume markers inside it are the whole point.
      // Anything else is a genuine failure and leaves nothing behind.
      if (!(error instanceof FetchCancelled)) {
        await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
        await BookService.clearPendingBuild();
      }
      throw error;
    }
  }

  /**
   * Bring an existing book up to date with the months it does not have yet.
   *
   * Only the missing months are fetched and replayed, which is the whole point: the
   * finished-month markers written during the original build are what make a top-up cost
   * minutes instead of the hour a rebuild would.
   *
   * One deliberate approximation. The original build pruned rare deep pairs and dropped
   * `staging`, so a pair discarded then cannot be resurrected now — the counts that would
   * justify it are gone. New rows therefore survive if they are shallow, or repeat within
   * this batch, or already exist in the book. A pair seen once before and once now is the
   * case that slips through: the rarest thing the book tracks, and already below the
   * threshold on its own.
   */
  async refresh(
    record: BookRecord,
    onProgress: (p: BuildProgress) => void,
    signal: AbortSignal
  ): Promise<RefreshResult> {
    if (Platform.OS === 'web') throw new Error('Refreshing books is not supported on web.');

    const started = Date.now();
    // expo-sqlite caches connections by database name, so opening this book here can hand
    // back the very object BookService holds for board queries — and closing it at the end
    // would leave that cache pointing at a closed connection. Release it first; the board
    // reopens lazily, and by then the file has changed anyway.
    await BookService.closeAll();

    const db = await SQLite.openDatabaseAsync(record.fileName);
    await db.execAsync('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');

    try {
      const meta = await this.readMetaMap(db);
      const spec = meta.spec ? reviveSpec(JSON.parse(meta.spec)) : null;
      if (!spec || !spec.username || !spec.source) {
        throw new FetchError(
          'unsupported',
          'This book predates refresh support and has no record of how it was built. Rebuild it to enable refreshing.'
        );
      }
      // A refresh means "bring up to date", so the original end date no longer applies.
      spec.until = undefined;

      const source = getGameSource(spec.source);
      onProgress({ phase: 'Checking for new months…', periodsDone: 0, periodsTotal: 0, games: 0, plies: 0 });

      const done = await this.completedPeriods(db);
      const periods = (await source.listPeriods(spec, signal))
        .filter(p => !done.has(p.id))
        .reverse();
      let remaining = 0;
      if (periods.length === 0) {
        await db.closeAsync();
        return {
          record, newGames: 0, newPositions: 0, months: 0, remaining: 0,
          seconds: 0, upToDate: true,
        };
      }

      await db.execAsync(`
        DROP TABLE IF EXISTS staging;
        CREATE TABLE staging (
          fen TEXT NOT NULL, move TEXT NOT NULL, ply INTEGER NOT NULL,
          hero INTEGER NOT NULL, result INTEGER NOT NULL, game_id INTEGER NOT NULL
        );
      `);

      const maxRow = await db.getFirstAsync('SELECT COALESCE(MAX(id), 0) AS id FROM book_games') as any;
      let gameId = maxRow?.id ?? 0;
      let games = 0;
      let plies = 0;

      for (let i = 0; i < periods.length; i++) {
        const period = periods[i];
        if (signal.aborted) throw new FetchCancelled();

        onProgress({ phase: `Fetching ${period.id}…`, periodsDone: i, periodsTotal: periods.length, games, plies });
        const pgns = await source.fetchPeriod(spec, period, signal);

        const staging: StagingRow[] = [];
        for (const pgn of pgns) {
          if (signal.aborted) throw new FetchCancelled();
          gameId += 1;
          const outcome = this.ingestGame(pgn, spec, gameId, staging);
          plies += outcome.plies;
          games += 1;
          await this.insertGameRow(db, gameId, outcome);
          if (staging.length >= FLUSH_THRESHOLD) {
            await this.flushStaging(db, staging);
            await yieldToUi();
            onProgress({ phase: `Reading ${period.id}…`, periodsDone: i, periodsTotal: periods.length, games, plies });
          }
        }
        await this.flushStaging(db, staging);
        await this.markPeriodDone(db, period);
        await yieldToUi();

        if (Date.now() - started >= BUILD_BUDGET_MS && i < periods.length - 1) {
          remaining = periods.length - 1 - i;
          break;
        }
      }

      onProgress({ phase: 'Merging positions…', periodsDone: periods.length, periodsTotal: periods.length, games, plies });
      const newPositions = await this.mergeStaging(db, Number(meta.full_ply) || FULL_PLY);

      await db.runAsync(
        'INSERT OR REPLACE INTO book_meta (key, value) VALUES (?, ?)',
        ['game_count', String((Number(meta.game_count) || 0) + games)]
      );
      await db.execAsync('DROP TABLE IF EXISTS staging');
      await db.execAsync('VACUUM');
      await db.closeAsync();

      const updated = await BookService.reregisterBook(record);
      return {
        record: updated, newGames: games, newPositions,
        months: periods.length - remaining, remaining,
        seconds: (Date.now() - started) / 1000, upToDate: false,
      };
    } catch (error) {
      // The book keeps whatever months it finished; staging is scratch and goes.
      try {
        await db.execAsync('DROP TABLE IF EXISTS staging');
        await db.closeAsync();
      } catch { /* already closed */ }
      throw error;
    }
  }

  /** Fold the refresh's staging rows into the existing aggregate. */
  private async mergeStaging(db: any, fullPly: number): Promise<number> {
    const before = await db.getFirstAsync('SELECT COUNT(*) AS n FROM book_moves') as any;

    await db.runAsync(
      `INSERT INTO book_moves (fen, move, n, hero_n, white_n, draw_n, black_n, sample_games)
       SELECT s.fen, s.move, COUNT(*), SUM(s.hero),
              SUM(s.result = 1), SUM(s.result = 0), SUM(s.result = -1), NULL
       FROM staging s
       GROUP BY s.fen, s.move
       HAVING MIN(s.ply) <= ?
           OR COUNT(*) >= ?
           OR EXISTS (SELECT 1 FROM book_moves b WHERE b.fen = s.fen AND b.move = s.move)
       ON CONFLICT (fen, move) DO UPDATE SET
         n       = n       + excluded.n,
         hero_n  = hero_n  + excluded.hero_n,
         white_n = white_n + excluded.white_n,
         draw_n  = draw_n  + excluded.draw_n,
         black_n = black_n + excluded.black_n`,
      [fullPly, MIN_COUNT_DEEP]
    );

    await this.mergeSampleGames(db);

    const after = await db.getFirstAsync('SELECT COUNT(*) AS n FROM book_moves') as any;
    return (after?.n ?? 0) - (before?.n ?? 0);
  }

  /**
   * Put the refresh's games at the front of each touched move's samples.
   *
   * Merged in JS rather than SQL because the list has to be trimmed on id boundaries. The
   * new games go first: they come from later months, and samples are newest-first.
   */
  private async mergeSampleGames(db: any): Promise<void> {
    const rows = await db.getAllAsync(
      `WITH ranked AS (
         SELECT s.fen, s.move, s.game_id,
                ROW_NUMBER() OVER (
                  PARTITION BY s.fen, s.move ORDER BY g.date DESC, g.id DESC
                ) AS rn
         FROM staging s
         JOIN book_games g ON g.id = s.game_id
       )
       SELECT r.fen, r.move, GROUP_CONCAT(r.game_id) AS fresh, b.sample_games AS existing
       FROM ranked r
       JOIN book_moves b ON b.fen = r.fen AND b.move = r.move
       WHERE r.rn <= ?
       GROUP BY r.fen, r.move`,
      [SAMPLE_GAMES]
    ) as Array<{ fen: string; move: string; fresh: string | null; existing: string | null }>;

    for (let i = 0; i < rows.length; i += 200) {
      await db.withTransactionAsync(async () => {
        for (const row of rows.slice(i, i + 200)) {
          const fresh = (row.fresh ?? '').split(',').filter(Boolean);
          const existing = (row.existing ?? '').split(',').filter(Boolean);
          const merged = [...fresh, ...existing.filter(id => !fresh.includes(id))]
            .slice(0, SAMPLE_GAMES)
            .join(',');
          await db.runAsync(
            'UPDATE book_moves SET sample_games = ? WHERE fen = ? AND move = ?',
            [merged, row.fen, row.move]
          );
        }
      });
      await yieldToUi();
    }
  }

  private async readMetaMap(db: any): Promise<Record<string, string>> {
    const rows = await db.getAllAsync('SELECT key, value FROM book_meta') as Array<{ key: string; value: string }>;
    const meta: Record<string, string> = {};
    for (const row of rows) meta[row.key] = row.value;
    return meta;
  }

  /** Replay one game into staging rows, returning what the games table needs. */
  private ingestGame(
    pgn: string,
    spec: FetchSpec,
    gameId: number,
    staging: StagingRow[]
  ): IngestedGame {
    const { headers, moves } = scanGame(pgn);
    const heroIsWhite = heroSide(headers, spec.username);
    const result = RESULT_CODE[headers.Result ?? ''] ?? UNKNOWN_RESULT;

    const chess = new Chess();
    let preFen = normalizeFen(chess.fen());
    const played: string[] = [];
    let broke = false;

    for (let i = 0; i < moves.length; i++) {
      const token = moves[i];

      // Past the indexed depth no board is needed. Those moves are stored only so a game
      // can be replayed on drill-down, and the source PGN's SAN is already standard — so
      // they are copied straight through. Replaying them anyway cost ~3x, because a real
      // game runs ~95 plies where only the first 30 are ever indexed.
      if (i >= MAX_PLY) {
        played.push(token);
        continue;
      }

      let move;
      try {
        move = chess.move(token);
      } catch {
        broke = true;
        break;
      }
      played.push(move.san);
      const ply = i + 1;
      const whiteMoved = ply % 2 === 1;
      const hero = heroIsWhite !== null && whiteMoved === heroIsWhite ? 1 : 0;
      staging.push([preFen, move.san, ply, hero, result, gameId]);
      preFen = normalizeFen(chess.fen());
    }

    return { headers, played, broke, plies: played.length };
  }

  private async insertGameRow(db: any, id: number, game: IngestedGame): Promise<void> {
    const h = game.headers;
    await db.runAsync(
      `INSERT INTO book_games
       (id, white, black, result, date, eco, white_elo, black_elo, time_control, url, moves)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        h.White ?? '', h.Black ?? '', h.Result ?? '',
        h.UTCDate ?? h.Date ?? '', h.ECO ?? '',
        toInt(h.WhiteElo), toInt(h.BlackElo),
        h.TimeControl ?? '', h.Link ?? h.Site ?? '',
        game.played.join(' '),
      ]
    );
  }

  /** Multi-row INSERT: one round-trip per chunk instead of per row (16.6x measured). */
  private async flushStaging(db: any, staging: StagingRow[]): Promise<void> {
    if (staging.length === 0) return;
    await db.withTransactionAsync(async () => {
      for (let start = 0; start < staging.length; start += STAGING_CHUNK) {
        const slice = staging.slice(start, start + STAGING_CHUNK);
        const placeholders = slice.map(() => '(?,?,?,?,?,?)').join(',');
        const params: any[] = [];
        for (const row of slice) params.push(...row);
        await db.runAsync(
          `INSERT INTO staging (fen, move, ply, hero, result, game_id) VALUES ${placeholders}`,
          params
        );
      }
    });
    staging.length = 0;
  }

  private async createSchema(db: any): Promise<void> {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS book_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

      CREATE TABLE IF NOT EXISTS book_games (
        id           INTEGER PRIMARY KEY,
        white        TEXT, black TEXT, result TEXT, date TEXT, eco TEXT,
        white_elo    INTEGER, black_elo INTEGER,
        time_control TEXT, url TEXT,
        moves        TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS staging (
        fen     TEXT NOT NULL,
        move    TEXT NOT NULL,
        ply     INTEGER NOT NULL,
        hero    INTEGER NOT NULL,
        result  INTEGER NOT NULL,
        game_id INTEGER NOT NULL
      );
    `);
  }

  private async completedPeriods(db: any): Promise<Set<string>> {
    try {
      const rows = await db.getAllAsync(
        "SELECT key FROM book_meta WHERE key LIKE 'period:%'"
      ) as Array<{ key: string }>;
      return new Set(rows.map(r => r.key.slice('period:'.length)));
    } catch {
      return new Set();
    }
  }

  private async markPeriodDone(db: any, period: FetchPeriod): Promise<void> {
    await db.runAsync(
      'INSERT OR REPLACE INTO book_meta (key, value) VALUES (?, ?)',
      [`period:${period.id}`, '1']
    );
  }

  /** Collapse staging into one row per surviving (position, move). */
  private async aggregate(db: any): Promise<void> {
    await db.execAsync(`
      DROP TABLE IF EXISTS book_moves;
      CREATE TABLE book_moves (
        fen          TEXT NOT NULL,
        move         TEXT NOT NULL,
        n            INTEGER NOT NULL,
        hero_n       INTEGER NOT NULL,
        white_n      INTEGER NOT NULL,
        draw_n       INTEGER NOT NULL,
        black_n      INTEGER NOT NULL,
        sample_games TEXT,
        PRIMARY KEY (fen, move)
      ) WITHOUT ROWID;
    `);

    // The prune is a HAVING, not a WHERE: whether a pair repeats is only known once every
    // instance has been counted, so it cannot be decided while scanning.
    await db.runAsync(
      `INSERT INTO book_moves (fen, move, n, hero_n, white_n, draw_n, black_n, sample_games)
       SELECT fen, move,
              COUNT(*), SUM(hero),
              SUM(result = 1), SUM(result = 0), SUM(result = -1),
              NULL
       FROM staging
       GROUP BY fen, move
       HAVING MIN(ply) <= ? OR COUNT(*) >= ?`,
      [FULL_PLY, MIN_COUNT_DEEP]
    );

    // Samples ranked by the game's own date, never its id: id order is fetch order, which
    // runs oldest-first here and newest-first in a chess.com file, so ranking on it would
    // silently pick the oldest games from one source and the newest from another.
    await db.runAsync(
      `WITH ranked AS (
         SELECT s.fen, s.move, s.game_id,
                ROW_NUMBER() OVER (
                  PARTITION BY s.fen, s.move ORDER BY g.date DESC, g.id DESC
                ) AS rn
         FROM staging s
         JOIN book_moves b ON b.fen = s.fen AND b.move = s.move
         JOIN book_games g ON g.id = s.game_id
       ),
       picked AS (
         SELECT fen, move, GROUP_CONCAT(game_id) AS ids
         FROM ranked WHERE rn <= ?
         GROUP BY fen, move
       )
       UPDATE book_moves
          SET sample_games = (SELECT ids FROM picked
                               WHERE picked.fen = book_moves.fen
                                 AND picked.move = book_moves.move)`,
      [SAMPLE_GAMES]
    );
  }

  private async writeMeta(
    db: any, spec: FetchSpec, displayName: string, games: number
  ): Promise<void> {
    const entries: Array<[string, string]> = [
      ['schema_version', String(BOOK_SCHEMA_VERSION)],
      ['name', displayName],
      ['player', spec.username.trim()],
      ['source_file', `${spec.source}:${spec.username.trim()}`],
      ['game_count', String(games)],
      ['max_ply', String(MAX_PLY)],
      ['full_ply', String(FULL_PLY)],
      ['min_count_deep', String(MIN_COUNT_DEEP)],
      ['has_games', '1'],
      // The whole spec, so a later refresh fetches on the same terms rather than making
      // the user re-enter filters it would then silently have to match.
      ['spec', JSON.stringify(serialiseSpec(spec))],
      ['created_at', String(Date.now())],
    ];
    for (const [key, value] of entries) {
      await db.runAsync('INSERT OR REPLACE INTO book_meta (key, value) VALUES (?, ?)', [key, value]);
    }
  }
}

interface IngestedGame {
  headers: Record<string, string>;
  played: string[];
  broke: boolean;
  plies: number;
}

/** True/False if the named player is White/Black; null if this isn't their game. */
function heroSide(headers: Record<string, string>, username: string): boolean | null {
  const name = username.trim().toLowerCase();
  if (!name) return null;
  if ((headers.White ?? '').trim().toLowerCase() === name) return true;
  if ((headers.Black ?? '').trim().toLowerCase() === name) return false;
  return null;
}

function toInt(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) && value ? n : null;
}

/** Dates survive the settings round-trip as ISO strings; revive them on resume. */
function serialiseSpec(spec: FetchSpec): any {
  return {
    ...spec,
    since: spec.since ? spec.since.toISOString() : undefined,
    until: spec.until ? spec.until.toISOString() : undefined,
  };
}

export function reviveSpec(raw: any): FetchSpec {
  return {
    ...raw,
    since: raw?.since ? new Date(raw.since) : undefined,
    until: raw?.until ? new Date(raw.until) : undefined,
  };
}

/** Hand the thread back so React can paint and the cancel button can be pressed. */
function yieldToUi(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

export const BookBuilder = new BookBuilderClass();
