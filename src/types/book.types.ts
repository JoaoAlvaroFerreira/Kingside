/**
 * Opening books: a position -> move frequency index built from a large game corpus.
 *
 * A book is a separate SQLite file, not rows in kingside.db. A corpus big enough to be
 * worth indexing (100k+ games) is far too large to carry inside every backup, and unlike
 * repertoires or training progress it is fully regenerable from its source PGN — so the
 * main database stores only a BookRecord saying one is installed.
 */

/** An installed book, as tracked in the main database's `master_books` table. */
export interface BookRecord {
  id: string;
  /** Display name, from the book's own metadata. */
  name: string;
  /** Whose games these are; blank for a mixed corpus. Drives the "their moves" split. */
  player: string;
  /** Filename of the PGN the book was generated from, for provenance. */
  sourceFile: string;
  /** Name of the book file inside the SQLite directory. */
  fileName: string;
  gameCount: number;
  positionCount: number;
  sizeBytes: number;
  /** Deepest ply the book indexes; past this it has nothing to say. */
  maxPly: number;
  /** False for a counts-only book, where drill-down is unavailable. */
  hasGames: boolean;
  importedAt: Date;
}

/** A move playable from some position, with everything the book knows about it. */
export interface BookMoveCandidate {
  move: string;
  /** Times this move was played from this position across the corpus. */
  count: number;
  /** Of those, how many were played by the book's own player. */
  heroCount: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  /** Game ids in the book this move can be drilled into. Bounded, not exhaustive. */
  sampleGameIds: number[];
  bookId: string;
}

/** A game stored inside a book file. */
export interface BookGame {
  id: number;
  bookId: string;
  white: string;
  black: string;
  result: string;
  date: string;
  eco: string;
  whiteElo: number | null;
  blackElo: number | null;
  timeControl: string;
  url: string;
  /** Space-separated SAN, clocks stripped. */
  moves: string;
}

/** Rejected import reasons, kept distinct so the UI can explain what to do about it. */
export type BookImportFailure =
  | 'not-a-database'
  | 'not-a-book'
  | 'unsupported-version'
  | 'copy-failed';

export class BookImportError extends Error {
  constructor(public readonly reason: BookImportFailure, message: string) {
    super(message);
    this.name = 'BookImportError';
  }
}

/** Book schema this build understands. Bump only alongside the generator in MyLands. */
export const BOOK_SCHEMA_VERSION = 1;
