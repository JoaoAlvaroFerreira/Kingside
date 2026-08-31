/**
 * Minimal PGN scanning for the book pipeline.
 *
 * Deliberately not PGNService / @mliebelt/pgn-parser: those build a full move tree with
 * comments and variations, which is right for a repertoire and far too much for 139k games
 * whose movetext is read once and reduced to counts. This does the two things the book
 * needs — headers, and SAN tokens — with regexes, mirroring the generator in MyLands so
 * both produce the same book from the same PGN.
 */

const HEADER = /^\[(\w+)\s+"(.*)"\s*\]\s*$/;
const COMMENT = /\{[^}]*\}/g;
const NAG = /\$\d+/g;
const MOVE_NUMBER = /^\d+\.*$/;
const SUFFIX = /[!?]+$/;
const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

export interface ScannedGame {
  headers: Record<string, string>;
  /** SAN tokens in order, comments and move numbers stripped. */
  moves: string[];
}

/** Headers and SAN tokens for one game's PGN text. */
export function scanGame(pgn: string): ScannedGame {
  const headers: Record<string, string> = {};
  const moveLines: string[] = [];

  for (const rawLine of pgn.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = HEADER.exec(line);
    if (match) {
      headers[match[1]] = match[2];
    } else {
      moveLines.push(line);
    }
  }

  return { headers, moves: tokenizeMoves(moveLines.join(' ')) };
}

export function tokenizeMoves(movetext: string): string[] {
  const cleaned = movetext.replace(COMMENT, ' ').replace(NAG, ' ');
  const tokens: string[] = [];
  for (const raw of cleaned.split(/\s+/)) {
    if (!raw || MOVE_NUMBER.test(raw) || RESULTS.has(raw)) continue;
    const san = raw.replace(SUFFIX, '');
    if (san) tokens.push(san);
  }
  return tokens;
}

/**
 * Split a multi-game PGN blob into one string per game.
 *
 * Lichess answers with every game concatenated; a new game starts at an `[Event ` line that
 * follows movetext. Splitting on `[Event ` alone would break games whose movetext is empty.
 */
export function splitGames(blob: string): string[] {
  const games: string[] = [];
  let current: string[] = [];
  let sawMoves = false;

  for (const rawLine of blob.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('[Event ') && sawMoves) {
      games.push(current.join('\n'));
      current = [];
      sawMoves = false;
    }
    if (line && !line.startsWith('[')) sawMoves = true;
    if (line || current.length) current.push(rawLine);
  }

  const last = current.join('\n');
  if (last.trim()) games.push(last);
  return games;
}
