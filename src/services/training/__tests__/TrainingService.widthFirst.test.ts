/**
 * Width-first drilling, driven end to end.
 *
 * The existing tests check single advance steps; these run a whole session the way the
 * screen does — advance until a line finishes, rate it, repeat — because the behaviour
 * that matters (does every line get drilled and rated exactly once?) only shows up across
 * the whole sweep.
 */

import { TrainingService } from '../TrainingService';
import { LineExtractor } from '../LineExtractor';
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

/**
 * The reported failure, in its own shape: a chapter that reaches one position where the
 * opponent has five replies, one of which is analysed far more deeply than the others.
 */
describe('a position with many replies, one of them deep', () => {
  const REPLIES = ['c6', 'c5', 'a6', 'g6', 'Bf5'];

  /** Trunk d4/Nf3/Bf4, then the answer to one reply, then `extra` further user moves. */
  function branch(reply: string, index: number, extra: number): Line {
    const sans = ['d4', 'Nf3', 'Bf4', `answer-${reply}`];
    for (let i = 0; i < extra; i++) sans.push(`${reply}-deep${i}-${index}`);
    return lineFromUserMoves(`${reply}#${index}`, sans);
  }

  function pool(): Line[] {
    const lines: Line[] = [];
    // Extraction is depth-first, so every continuation of the first reply comes first.
    for (let i = 0; i < 150; i++) lines.push(branch('c6', i, 4));
    for (let i = 0; i < 150; i++) lines.push(branch('c5', i, 4));
    for (const reply of ['a6', 'g6', 'Bf5']) lines.push(branch(reply, 0, 1));
    return lines;
  }

  it('covers every reply in the first batch, not just the first two', () => {
    // The active batch is the head of the pool. In extraction order that head is 100
    // lines of c6 alone, so a6/g6/Bf5 sat in holdback and were never drilled — the
    // branches the session existed to cover.
    const ordered = LineExtractor.orderForWidthFirst(pool());
    const covered = new Set(ordered.slice(0, 100).map(line => line.id.split('#')[0]));
    expect([...covered].sort()).toEqual([...REPLIES].sort());
  });

  it('asks the answer to every reply before drilling any branch deeper', () => {
    const session = makeSession(LineExtractor.orderForWidthFirst(pool()).slice(0, 100));
    const { asked } = runSession(session, 5000);

    const ANSWER_DEPTH = 3;
    const answers = asked.filter(a => a.san.startsWith('answer-'));
    expect(new Set(answers.map(a => a.san)).size).toBe(REPLIES.length);
    expect(answers.every(a => a.depth === ANSWER_DEPTH)).toBe(true);

    // Nothing deeper is touched until all five answers have been asked.
    const lastAnswer = asked.map(a => a.san).lastIndexOf(answers[answers.length - 1].san);
    expect(asked.slice(0, lastAnswer).every(a => a.depth <= ANSWER_DEPTH)).toBe(true);
  });
});

describe('a rating that lands mid-sweep', () => {
  it('does not skip the first move of a line it jumps to', () => {
    // A and B finish on their first move, so the sweep stops for two ratings before the
    // other two lines have been asked anything. The cursor then jumped to a line by array
    // position while the depth carried on rising, and D — still owing its first move —
    // was picked up at depth 1: 'first' was never asked, and the line was rated as if it
    // had been. Choosing the least-drilled line instead is what keeps depth and progress
    // the same number.
    const session = makeSession([
      lineFromUserMoves('A', ['e4']),
      lineFromUserMoves('B', ['e4']),
      lineFromUserMoves('C', ['e4', 'Nc3', 'd4', 'Bb5']),
      lineFromUserMoves('D', ['first', 'second']),
    ]);

    const { asked, rated } = runSession(session);

    expect(asked.map(a => a.san)).toContain('first');
    expect(asked.filter(a => a.line === 'D').map(a => a.depth)).toEqual([0, 1]);
    expect([...rated].sort()).toEqual(['A', 'B', 'C', 'D']);
  });
});
