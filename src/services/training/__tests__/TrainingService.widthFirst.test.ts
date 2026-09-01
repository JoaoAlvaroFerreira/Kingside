/**
 * Width-first drilling, driven end to end.
 *
 * The existing tests check single advance steps; these run a whole session the way the
 * screen does — advance until a line finishes, rate it, repeat — because the behaviour
 * that matters (does every line get drilled and rated exactly once?) only shows up across
 * the whole sweep.
 */

import { TrainingService } from '../TrainingService';
import { Line, LineMove, TrainingSession, LineStats } from '@types';

function lm(san: string, preFen: string, isUserMove: boolean): LineMove {
  return { san, preFen, fen: `${preFen}>${san}`, isUserMove, nodeId: `${preFen}:${san}`, moveNumber: 1, isBlack: false };
}

/**
 * A line from a list of user moves, where moves sharing a prefix share their pre-position —
 * which is what real repertoire lines look like and what width-first exists to exploit.
 */
function lineFromUserMoves(id: string, sans: string[]): Line {
  const moves: LineMove[] = [];
  let prefix = 'root';
  for (const san of sans) {
    moves.push(lm(san, prefix, true));
    prefix = `${prefix}>${san}`;
  }
  return {
    id, repertoireId: 'rep1', chapterId: 'ch1', moves,
    depth: moves.length, isMainLine: false, branchPoint: null,
  };
}

function makeSession(lines: Line[]): TrainingSession {
  return {
    id: 'sess1', repertoireId: 'rep1', chapterIds: [], color: 'white',
    order: 'width-first', guidance: 'none', maxDepth: null,
    lines, holdbackLines: [], totalLineCount: lines.length,
    currentLineIndex: 0, currentMoveIndex: 0, currentDepth: 0,
    lineProgress: {}, linesCompleted: 0, completedLineIds: [],
    totalMistakes: 0, awaitingRating: false, isComplete: false,
    startedAt: new Date(),
  } as TrainingSession;
}

/** Drive the session the way the screen does, recording what was asked and in what order. */
function runSession(session: TrainingSession, maxSteps = 500) {
  const asked: Array<{ line: string; depth: number; san: string }> = [];
  /** Every line that received an SM2 update — presented for rating, or credited because a
   *  longer line drilled all of its moves. Both count as "drilled". */
  const rated: string[] = [];
  const stats: LineStats[] = [];
  let steps = 0;

  while (!session.isComplete && steps++ < maxSteps) {
    const line = session.lines[session.currentLineIndex];
    const userMoves = line.moves.filter(m => m.isUserMove);
    const move = userMoves[session.currentMoveIndex];
    if (move) {
      asked.push({ line: line.id, depth: session.currentMoveIndex, san: move.san });
    }

    const more = TrainingService.advanceToNextPosition(session);
    if (!more) {
      if (session.awaitingRating) {
        rated.push(session.lines[session.currentLineIndex].id);
        const result = TrainingService.completeLineAndAdvance(session, 5, stats);
        stats.push(result.updatedStats);
        for (const covered of result.alsoCompleted) {
          rated.push(covered.lineId);
          stats.push(covered);
        }
        if (!result.hasMore) break;
      } else {
        break;
      }
    }
  }
  return { asked, rated, steps };
}

describe('width-first drilling', () => {
  /**
   * Three lines over a shared trunk:
   *   A: e4 Nf3 Bc4
   *   B: e4 Nf3 Bb5
   *   C: e4 d4
   * A and B share two moves; C diverges immediately.
   */
  const lines = () => [
    lineFromUserMoves('A', ['e4', 'Nf3', 'Bc4']),
    lineFromUserMoves('B', ['e4', 'Nf3', 'Bb5']),
    lineFromUserMoves('C', ['e4', 'd4']),
  ];

  it('asks each shared prefix move once rather than re-asking it per line', () => {
    const session = makeSession(lines());
    const { asked } = runSession(session);

    // 'e4' is the same move from the same position in all three lines. Width-first exists
    // so it is drilled once, not three times.
    const e4Asks = asked.filter(a => a.san === 'e4');
    expect(e4Asks).toHaveLength(1);

    const nf3Asks = asked.filter(a => a.san === 'Nf3');
    expect(nf3Asks).toHaveLength(1);
  });

  it('drills shallower moves before deeper ones', () => {
    const session = makeSession(lines());
    const { asked } = runSession(session);

    // The defining property of the mode: no depth-N move is asked after a depth-N+1 move.
    const depths = asked.map(a => a.depth);
    const maxSeen: number[] = [];
    depths.forEach(d => maxSeen.push(Math.max(d, maxSeen[maxSeen.length - 1] ?? 0)));
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
  });

  it('rates every line exactly once and finishes', () => {
    const session = makeSession(lines());
    const { rated } = runSession(session);

    // A line finished purely by shared-prefix auto-advance still has to be rated: its SM2
    // stats are the whole point of the drill.
    expect([...rated].sort()).toEqual(['A', 'B', 'C']);
    expect(session.isComplete).toBe(true);
    expect(session.linesCompleted).toBe(3);
  });

  it('rates a line that finishes only because a longer line drilled its moves', () => {
    // D is a strict prefix of A. Drilling A's moves auto-advances D straight to complete
    // without D ever being the current line, so nothing ever asks the user to rate it.
    const session = makeSession([
      lineFromUserMoves('A', ['e4', 'Nf3', 'Bc4']),
      lineFromUserMoves('D', ['e4', 'Nf3']),
    ]);
    const { rated } = runSession(session);

    expect([...rated].sort()).toEqual(['A', 'D']);
    expect(session.isComplete).toBe(true);
  });

  it('drills lines promoted from holdback', () => {
    // Large repertoires hold most lines back and promote them in batches; a width-first
    // sweep has to keep working after a promotion, not stop at the first batch.
    const session = makeSession([lineFromUserMoves('A', ['e4', 'Nf3'])]);
    session.holdbackLines = [
      lineFromUserMoves('H1', ['d4', 'c4']),
      lineFromUserMoves('H2', ['d4', 'Nf3']),
    ];
    session.totalLineCount = 3;

    const { rated } = runSession(session);
    expect([...rated].sort()).toEqual(['A', 'H1', 'H2']);
    expect(session.isComplete).toBe(true);
  });

  it('handles lines of very different lengths without stalling', () => {
    const session = makeSession([
      lineFromUserMoves('short', ['e4']),
      lineFromUserMoves('long', ['e4', 'Nf3', 'Bc4', 'd3', 'O-O', 'Re1']),
      lineFromUserMoves('mid', ['e4', 'Nf3', 'Bb5']),
    ]);
    const { rated, steps } = runSession(session);

    expect([...rated].sort()).toEqual(['long', 'mid', 'short']);
    expect(session.isComplete).toBe(true);
    expect(steps).toBeLessThan(400); // no spinning
  });

  it('asks every distinct user move at least once', () => {
    const session = makeSession(lines());
    const { asked } = runSession(session);

    const askedSans = new Set(asked.map(a => `${a.san}`));
    // Bc4 and Bb5 are the only things distinguishing A from B — skipping either means the
    // drill never tested the branch it exists to teach.
    for (const san of ['e4', 'Nf3', 'Bc4', 'Bb5', 'd4']) {
      expect(askedSans.has(san)).toBe(true);
    }
  });
});

describe('a line that finished on its last move', () => {
  it('is not asked again, and the session ends', () => {
    // The screen's path, not the harness's: processUserMove answers the final move of a
    // line with 'line-complete' and never calls advanceWidthFirst, so nothing had written
    // that line's progress. The search then found it unfinished and re-asked its last
    // move — with one-move lines, in a loop that never ends.
    const session = makeSession([
      lineFromUserMoves('a', ['e4']),
      lineFromUserMoves('b', ['d4']),
    ]);

    const first = TrainingService.completeLineAndAdvance(session, 4, []);
    expect(first.hasMore).toBe(true);
    expect(session.lines[session.currentLineIndex].id).toBe('b');

    const second = TrainingService.completeLineAndAdvance(session, 4, []);
    expect(second.hasMore).toBe(false);
    expect(session.isComplete).toBe(true);
  });
});
