import {
  encodeMoves, decodeMoves, encodeEvals, decodeEvals, extractEvalsFromPgn, buildPgn,
} from '../gameStorage';

describe('move encoding', () => {
  it('round-trips SAN through the space-separated form', () => {
    const moves = ['e4', 'c5', 'Nf3', 'd6', 'O-O', 'exd5', 'Qxd8+', 'a8=Q#'];
    expect(decodeMoves(encodeMoves(moves))).toEqual(moves);
  });

  it('still reads the legacy JSON array', () => {
    // Rows written before v8 hold a JSON array. SAN never starts with '[', so the two
    // formats cannot be confused and old rows need no rewrite.
    expect(decodeMoves('["e4","e5","Nf3"]')).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('treats missing or unparseable moves as an empty game rather than throwing', () => {
    expect(decodeMoves(null)).toEqual([]);
    expect(decodeMoves('')).toEqual([]);
    expect(decodeMoves('[not json')).toEqual([]);
  });
});

describe('eval encoding', () => {
  it('round-trips centipawn and mate scores, keeping empty slots', () => {
    const evals = [{ eval: 0.24 }, null, { evalMate: -3 }, { eval: -1.5 }];
    expect(decodeEvals(encodeEvals(evals))).toEqual(evals);
  });

  it('stores nothing when a game has no evals at all', () => {
    // Most games (all of chess.com) have none, and an empty column beats a row of commas.
    expect(encodeEvals([null, null, null])).toBeNull();
    expect(encodeEvals([])).toBeNull();
  });

  it('pulls evals out of a PGN and ignores the clock comments beside them', () => {
    const pgn = '1. e4 { [%eval 0.24] [%clk 0:03:00] } e5 { [%clk 0:02:58] } 2. Nf3 { [%eval #-3] } *';
    expect(extractEvalsFromPgn(pgn)).toEqual([{ eval: 0.24 }, null, { evalMate: -3 }]);
  });
});

describe('buildPgn', () => {
  const fields = {
    white: 'Alice', black: 'Bob', result: '1-0', date: '2025.01.04',
    event: 'Test', site: 'Somewhere', eco: 'B20',
  };

  it('rebuilds a PGN the app can read back', () => {
    const pgn = buildPgn(fields, ['e4', 'c5', 'Nf3']);
    expect(pgn).toContain('[White "Alice"]');
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn).toContain('1. e4 c5 2. Nf3');
    expect(pgn.trim().endsWith('1-0')).toBe(true);
  });

  it('writes evals back in the shape GameReviewService parses', () => {
    // That parser walks comment blocks by index, so the reconstructed comments have to
    // line up with the plies exactly as they did in the original file.
    const pgn = buildPgn(fields, ['e4', 'c5'], [{ eval: 0.24 }, { evalMate: -3 }]);
    expect(extractEvalsFromPgn(pgn)).toEqual([{ eval: 0.24 }, { evalMate: -3 }]);
  });

  it('carries a custom starting position through', () => {
    const fen = '8/8/8/8/8/8/8/K6k w - - 0 1';
    const pgn = buildPgn({ ...fields, startFen: fen }, ['Kb1']);
    expect(pgn).toContain(`[FEN "${fen}"]`);
    expect(pgn).toContain('[SetUp "1"]');
  });
});
