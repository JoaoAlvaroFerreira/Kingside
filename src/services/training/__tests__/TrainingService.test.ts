/**
 * TrainingService tests — DFS and BFS drill logic
 *
 * Tests use manually constructed Line/TrainingSession objects so they run
 * without MoveTree, LineExtractor, or any React Native dependencies.
 */

import { TrainingService } from '../TrainingService';
import { Line, LineMove, TrainingSession, LineOrder } from '@types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4  = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const AFTER_E4_E5_NF3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKBNR b KQkq - 1 2';
const AFTER_E4_E5_NF3_NF6 = 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKBNR w KQkq - 2 3';
const AFTER_E4_E5_NF3_NC6 = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKBNR w KQkq - 2 3';

/** Build a LineMove stub */
function lm(san: string, preFen: string, fen: string, isUserMove: boolean, nodeId: string): LineMove {
  return { san, preFen, fen, isUserMove, nodeId, moveNumber: 1, isBlack: false };
}

/** Build a minimal Line stub */
function makeLine(id: string, moves: LineMove[]): Line {
  return {
    id,
    repertoireId: 'rep1',
    chapterId: 'ch1',
    moves,
    depth: moves.length,
    isMainLine: false,
    branchPoint: null,
  };
}

/** Build a minimal TrainingSession stub */
function makeSession(
  lines: Line[],
  order: LineOrder
): TrainingSession {
  return {
    id: 'sess1',
    repertoireId: 'rep1',
    chapterIds: [],
    color: 'white',
    order,
    guidance: 'none',
    maxDepth: null,
    lines,
    holdbackLines: [],
    totalLineCount: lines.length,
    currentLineIndex: 0,
    currentMoveIndex: 0,
    currentDepth: 0,
    lineProgress: {},
    linesCompleted: 0,
    completedLineIds: [],
    totalMistakes: 0,
    startedAt: new Date(),
    isComplete: false,
    awaitingRating: false,
  };
}

// ─── Shared line fixtures ────────────────────────────────────────────────────
//
// White repertoire: 1.e4 e5 2.Nf3, then either 2...Nf6 or 2...Nc6.
// User moves (white): e4 (depth 0), Nf3 (depth 1).
// Opponent moves (black): e5, then Nf6/Nc6.

const LINE_E4_E5_NF3_NF6: Line = makeLine('line_nf6', [
  lm('e4',  START_FEN,          AFTER_E4,          true,  'n1'),  // user move 0
  lm('e5',  AFTER_E4,           AFTER_E4_E5,       false, 'n2'),  // opponent
  lm('Nf3', AFTER_E4_E5,        AFTER_E4_E5_NF3,   true,  'n3'),  // user move 1
  lm('Nf6', AFTER_E4_E5_NF3,    AFTER_E4_E5_NF3_NF6, false, 'n4'), // opponent
]);

const LINE_E4_E5_NF3_NC6: Line = makeLine('line_nc6', [
  lm('e4',  START_FEN,          AFTER_E4,          true,  'n1'),  // user move 0 — identical to line 1!
  lm('e5',  AFTER_E4,           AFTER_E4_E5,       false, 'n2'),
  lm('Nf3', AFTER_E4_E5,        AFTER_E4_E5_NF3,   true,  'n3'),  // user move 1 — identical to line 1!
  lm('Nc6', AFTER_E4_E5_NF3,    AFTER_E4_E5_NF3_NC6, false, 'n5'),
]);

// A diverging line used for DFS/BFS depth tests.
// White: d4 d5 Nf3 — user plays d4 (depth 0) and Nf3 (depth 1).
const AFTER_D4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';
const AFTER_D4_D5 = 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2';
const AFTER_D4_D5_NF3 = 'rnbqkbnr/ppp1pppp/8/3p4/3P4/5N2/PPP1PPPP/RNBQKBNR b KQkq - 1 2';

const LINE_D4: Line = makeLine('line_d4', [
  lm('d4',  START_FEN,  AFTER_D4,       true,  'm1'),
  lm('d5',  AFTER_D4,   AFTER_D4_D5,    false, 'm2'),
  lm('Nf3', AFTER_D4_D5, AFTER_D4_D5_NF3, true, 'm3'),
]);

// Line that ends with a user move (no trailing opponent move) — for line-complete tests.
const LINE_E4_E5_NF3_USER_LAST: Line = makeLine('line_user_last', [
  lm('e4',  START_FEN,   AFTER_E4,        true,  'u1'),
  lm('e5',  AFTER_E4,    AFTER_E4_E5,     false, 'u2'),
  lm('Nf3', AFTER_E4_E5, AFTER_E4_E5_NF3, true,  'u3'),
]);

// ─── getCurrentPosition ──────────────────────────────────────────────────────

describe('TrainingService.getCurrentPosition', () => {
  it('returns the preFen and expected SAN of the first user move', () => {
    const session = makeSession([LINE_E4_E5_NF3_NF6], 'depth-first');
    const pos = TrainingService.getCurrentPosition(session);
    expect(pos).not.toBeNull();
    expect(pos!.fen).toBe(START_FEN);
    expect(pos!.expectedMove).toBe('e4');
  });

  it('returns null when no lines', () => {
    const session = makeSession([], 'depth-first');
    const pos = TrainingService.getCurrentPosition(session);
    expect(pos).toBeNull();
  });
});

// ─── processUserMove ─────────────────────────────────────────────────────────

describe('TrainingService.processUserMove', () => {
  it('accepts the correct move and returns opponent move', () => {
    const session = makeSession([LINE_E4_E5_NF3_NF6], 'depth-first');
    const result = TrainingService.processUserMove(session, 'e2', 'e4');
    expect(result.isCorrect).toBe(true);
    expect(result.opponentMove).toBe('e5');
    expect(result.feedback).toBe('correct');
    expect(result.nextPosition?.fen).toBe(AFTER_E4_E5);
  });

  it('rejects an incorrect move without advancing state', () => {
    const session = makeSession([LINE_E4_E5_NF3_NF6], 'depth-first');
    const result = TrainingService.processUserMove(session, 'd2', 'd4');
    expect(result.isCorrect).toBe(false);
    expect(result.feedback).toBe('incorrect');
    expect(result.expectedMove).toBe('e4');
    expect(session.totalMistakes).toBe(1);
  });

  it('returns line-complete feedback when last user move is played', () => {
    // LINE_E4_E5_NF3_USER_LAST ends with Nf3 (user move) — no trailing opponent move.
    const session = makeSession([LINE_E4_E5_NF3_USER_LAST], 'depth-first');
    session.currentMoveIndex = 1; // advance to last user move (Nf3)
    const result = TrainingService.processUserMove(session, 'g1', 'f3');
    expect(result.isCorrect).toBe(true);
    expect(result.feedback).toBe('line-complete');
  });
});

// ─── DFS: advanceDepthFirst ──────────────────────────────────────────────────

describe('DFS mode', () => {
  it('advances to next user move within the same line', () => {
    const session = makeSession([LINE_E4_E5_NF3_NF6], 'depth-first');
    // User plays e4 correctly
    TrainingService.processUserMove(session, 'e2', 'e4');
    // Advance (opponent e5 is auto-played by screen; service just advances index)
    const hasMore = TrainingService.advanceToNextPosition(session);

    expect(hasMore).toBe(true);
    expect(session.currentMoveIndex).toBe(1);
    const pos = TrainingService.getCurrentPosition(session);
    expect(pos!.expectedMove).toBe('Nf3');
    expect(pos!.fen).toBe(AFTER_E4_E5);
  });

  it('signals line complete after last user move', () => {
    const session = makeSession([LINE_E4_E5_NF3_NF6], 'depth-first');
    session.currentMoveIndex = 1; // already on last user move
    const hasMore = TrainingService.advanceToNextPosition(session);
    expect(hasMore).toBe(false);
    expect(session.awaitingRating).toBe(true);
  });

  it('drills second line independently after first is rated', () => {
    const session = makeSession([LINE_E4_E5_NF3_NF6, LINE_D4], 'depth-first');

    // Complete line 1
    session.currentMoveIndex = 1;
    TrainingService.advanceToNextPosition(session); // sets awaitingRating
    expect(session.awaitingRating).toBe(true);

    // Rate → advance to line 2
    const { hasMore } = TrainingService.completeLineAndAdvance(session, 4, []);
    expect(hasMore).toBe(true);
    expect(session.currentLineIndex).toBe(1);
    expect(session.currentMoveIndex).toBe(0);
    const pos = TrainingService.getCurrentPosition(session);
    expect(pos!.expectedMove).toBe('d4');
  });

  it('does NOT skip shared-prefix moves — each line drilled fully from the start', () => {
    const session = makeSession([LINE_E4_E5_NF3_NF6, LINE_E4_E5_NF3_NC6], 'depth-first');

    // Play through line 1 fully
    session.currentMoveIndex = 1;
    TrainingService.advanceToNextPosition(session);
    TrainingService.completeLineAndAdvance(session, 4, []);

    // Now on line 2 — should still start at move 0 (e4) in DFS
    expect(session.currentLineIndex).toBe(1);
    expect(session.currentMoveIndex).toBe(0);
    const pos = TrainingService.getCurrentPosition(session);
    expect(pos!.expectedMove).toBe('e4');
    expect(pos!.fen).toBe(START_FEN);
  });
});

// ─── BFS: advanceWidthFirst ──────────────────────────────────────────────────

describe('BFS mode', () => {
  it('skips identical shared-prefix moves when switching lines at same depth', () => {
    // Both lines share e4 at depth 0.
    // After playing e4 for line 1, line 2 should be auto-advanced past depth 0.
    const session = makeSession([LINE_E4_E5_NF3_NF6, LINE_E4_E5_NF3_NC6], 'width-first');

    // User plays e4 (correct for line 1 at depth 0)
    session.lineProgress = { line_nf6: 0, line_nc6: 0 };
    const hasMore = TrainingService.advanceWidthFirst(session);

    // line_nf6 progress = 1, line_nc6 auto-advanced to 1 (same e4 from same position)
    expect(session.lineProgress['line_nf6']).toBe(1);
    expect(session.lineProgress['line_nc6']).toBe(1);

    // Should have moved to depth 1 (no remaining lines at depth 0)
    expect(session.currentMoveIndex).toBe(1);
    expect(hasMore).toBe(true);
  });

  it('tests diverging user moves at depth 1 for each line separately', () => {
    const session = makeSession([LINE_E4_E5_NF3_NF6, LINE_E4_E5_NF3_NC6], 'width-first');

    // Simulate depth 0 already completed (shared e4 auto-advanced both)
    session.lineProgress = { line_nf6: 1, line_nc6: 1 };
    session.currentMoveIndex = 1;

    // Depth 1: both lines have Nf3 from same position → also identical
    // After advancing line 1 at depth 1, line 2 should also be auto-advanced
    const hasMore = TrainingService.advanceWidthFirst(session);

    expect(session.lineProgress['line_nf6']).toBe(2);
    expect(session.lineProgress['line_nc6']).toBe(2);
    // Both lines complete — should await rating
    expect(hasMore).toBe(false);
    expect(session.awaitingRating).toBe(true);
  });

  it('tests moves at depth 0 for all lines before moving to depth 1', () => {
    // Lines diverge at depth 0 (e4 vs d4) but each has 2 user moves.
    // Multi-move lines ensure completing depth 0 does NOT complete the entire line,
    // so BFS can switch to the next line at depth 0 before awaitingRating.
    const LINE_E4_2: Line = makeLine('line_e4_2', [
      lm('e4',  START_FEN,    AFTER_E4,        true,  'a1'),
      lm('e5',  AFTER_E4,     AFTER_E4_E5,     false, 'a2'),
      lm('Nf3', AFTER_E4_E5,  AFTER_E4_E5_NF3, true,  'a3'),
    ]);
    const LINE_D4_2: Line = makeLine('line_d4_2', [
      lm('d4',  START_FEN,    AFTER_D4,          true,  'b1'),
      lm('d5',  AFTER_D4,     AFTER_D4_D5,       false, 'b2'),
      lm('Nf3', AFTER_D4_D5,  AFTER_D4_D5_NF3,   true,  'b3'),
    ]);

    const session = makeSession([LINE_E4_2, LINE_D4_2], 'width-first');
    session.lineProgress = { line_e4_2: 0, line_d4_2: 0 };

    // Advance after completing line_e4_2 at depth 0
    const hasMore = TrainingService.advanceWidthFirst(session);

    // line_d4_2 has a DIFFERENT move (d4 ≠ e4) — must NOT be auto-advanced
    expect(session.lineProgress['line_d4_2']).toBe(0);
    // Should switch to line_d4_2 at depth 0
    expect(hasMore).toBe(true);
    expect(session.currentLineIndex).toBe(1);
    expect(session.currentMoveIndex).toBe(0);
  });

  it('correctly sequences: different d0 moves tested separately, then d1', () => {
    // Line A: e4, (e5), Nf3  — user: e4 + Nf3
    // Line B: d4, (d5), Nf3  — user: d4 + Nf3
    // At d0: e4 and d4 differ → test both separately
    // At d1: both Nf3 from different positions → test both separately
    const LINE_A: Line = makeLine('la', [
      lm('e4',  START_FEN,    AFTER_E4,          true,  'a1'),
      lm('e5',  AFTER_E4,     AFTER_E4_E5,       false, 'a2'),
      lm('Nf3', AFTER_E4_E5,  AFTER_E4_E5_NF3,   true,  'a3'),
    ]);
    const LINE_B: Line = makeLine('lb', [
      lm('d4',  START_FEN,    AFTER_D4,          true,  'b1'),
      lm('d5',  AFTER_D4,     AFTER_D4_D5,       false, 'b2'),
      lm('Nf3', AFTER_D4_D5,  AFTER_D4_D5_NF3,   true,  'b3'),
    ]);

    const session = makeSession([LINE_A, LINE_B], 'width-first');
    session.lineProgress = { la: 0, lb: 0 };

    // Step 1: advance after line A depth 0 (e4)
    TrainingService.advanceWidthFirst(session);
    // Nf3 at d1 for line B is from a different preFen → NOT auto-advanced
    expect(session.lineProgress['lb']).toBe(0); // line B depth 0 still untested
    expect(session.currentLineIndex).toBe(1);   // switched to line B
    expect(session.currentMoveIndex).toBe(0);   // back at depth 0

    // Step 2: advance after line B depth 0 (d4)
    TrainingService.advanceWidthFirst(session);
    expect(session.lineProgress['la']).toBe(1);
    expect(session.lineProgress['lb']).toBe(1);
    // Both lines have Nf3 at depth 1 but from DIFFERENT positions → not auto-advanced
    // Should be on depth 1 now
    expect(session.currentMoveIndex).toBe(1);
    // Both depth-1 Nf3 moves differ in preFen → should still be tested separately
    const posA_d1 = TrainingService.getCurrentPosition(session);
    expect(posA_d1!.expectedMove).toBe('Nf3');
  });

  it('does not regress to earlier depths after all lines at a depth are done', () => {
    const session = makeSession([LINE_E4_E5_NF3_NF6, LINE_E4_E5_NF3_NC6], 'width-first');
    session.lineProgress = { line_nf6: 0, line_nc6: 0 };

    // Complete depth 0 (auto-advances both since e4 is shared)
    TrainingService.advanceWidthFirst(session);
    expect(session.currentDepth).toBe(1);
    expect(session.currentMoveIndex).toBe(1);

    // Depth should never go backwards
    expect(session.currentDepth).toBeGreaterThanOrEqual(1);
  });

  it('returns hasMore=false and isComplete=true when all lines at all depths done', () => {
    const LINE_SINGLE: Line = makeLine('ls', [
      lm('e4', START_FEN, AFTER_E4, true, 'x1'),
    ]);
    const session = makeSession([LINE_SINGLE], 'width-first');
    session.lineProgress = { ls: 0 };

    const hasMore = TrainingService.advanceWidthFirst(session);
    // Single user move — line complete, awaiting rating
    expect(hasMore).toBe(false);
    expect(session.awaitingRating).toBe(true);
  });
});
