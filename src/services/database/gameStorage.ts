/**
 * How a stored game is encoded on disk.
 *
 * A raw chess.com PGN is ~2,800 bytes of movetext, of which ~1,862 is `[%clk]` comments
 * that nothing in the app reads, plus ~617 bytes of headers already stored as columns.
 * The SAN itself is ~844. So the PGN column was mostly duplication and dead weight, and
 * the game is stored as its parts instead and the PGN rebuilt on read.
 *
 * The one annotation that is NOT dead weight is `[%eval]`: GameReviewService reads those
 * to skip Stockfish for positions Lichess already analysed. They are kept in their own
 * column and written back into the reconstructed PGN, so that parser keeps working
 * unchanged.
 */

const EVAL_MATE = /^#(-?\d+)$/;

export interface StoredEval {
  eval?: number;
  evalMate?: number;
}

/**
 * SAN moves, space separated.
 *
 * Legacy rows hold a JSON array, which is detectable by its leading bracket — the two
 * formats cannot be confused, since SAN never starts with `[`.
 */
export function encodeMoves(moves: string[]): string {
  return moves.join(' ');
}

export function decodeMoves(stored: string | null | undefined): string[] {
  if (!stored) return [];
  const text = stored.trim();
  if (text.startsWith('[')) {
    try {
      return JSON.parse(text);
    } catch {
      return [];
    }
  }
  return text.split(/\s+/).filter(Boolean);
}

/**
 * Per-ply evaluations, comma separated, empty where a ply had none.
 * A mate score is written as `#N`, matching how it appears in a PGN.
 */
export function encodeEvals(evals: Array<StoredEval | null>): string | null {
  if (!evals.some(e => e && (e.eval !== undefined || e.evalMate !== undefined))) return null;
  return evals
    .map(e => {
      if (!e) return '';
      if (e.evalMate !== undefined) return `#${e.evalMate}`;
      return e.eval !== undefined ? String(e.eval) : '';
    })
    .join(',');
}

export function decodeEvals(stored: string | null | undefined): Array<StoredEval | null> {
  if (!stored) return [];
  return stored.split(',').map(part => {
    if (!part) return null;
    const mate = EVAL_MATE.exec(part);
    if (mate) return { evalMate: parseInt(mate[1], 10) };
    const value = Number(part);
    return Number.isFinite(value) ? { eval: value } : null;
  });
}

/** Extract `[%eval]` annotations from a PGN, one slot per comment block, in order. */
export function extractEvalsFromPgn(pgn: string): Array<StoredEval | null> {
  const blocks = pgn.match(/\{[^}]*\}/g) || [];
  return blocks.map(block => {
    const mate = block.match(/\[%eval\s+#(-?\d+)\]/);
    if (mate) return { evalMate: parseInt(mate[1], 10) };
    const value = block.match(/\[%eval\s+([-\d.]+)\]/);
    return value ? { eval: parseFloat(value[1]) } : null;
  });
}

export interface GameHeaderFields {
  white?: string;
  black?: string;
  result?: string;
  date?: string;
  event?: string;
  site?: string;
  eco?: string;
  startFen?: string;
}

/**
 * Rebuild a PGN from the stored parts.
 *
 * Eval comments are emitted in the same shape they were parsed from, so the existing
 * GameReviewService parser — which walks comment blocks by index — reads them back
 * identically. Clock comments are gone and are not reconstructed.
 */
export function buildPgn(
  fields: GameHeaderFields,
  moves: string[],
  evals: Array<StoredEval | null> = []
): string {
  const headers = [
    `[Event "${fields.event || '?'}"]`,
    `[Site "${fields.site || '?'}"]`,
    `[Date "${fields.date || '????.??.??'}"]`,
    `[White "${fields.white || '?'}"]`,
    `[Black "${fields.black || '?'}"]`,
    `[Result "${fields.result || '*'}"]`,
    ...(fields.eco ? [`[ECO "${fields.eco}"]`] : []),
    ...(fields.startFen ? [`[FEN "${fields.startFen}"]`, '[SetUp "1"]'] : []),
  ];

  const body: string[] = [];
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) body.push(`${i / 2 + 1}.`);
    body.push(moves[i]);
    const evaluation = evals[i];
    if (evaluation) {
      const text = evaluation.evalMate !== undefined
        ? `#${evaluation.evalMate}`
        : String(evaluation.eval);
      body.push(`{ [%eval ${text}] }`);
    }
  }
  if (fields.result) body.push(fields.result);

  return `${headers.join('\n')}\n\n${body.join(' ')}`;
}
