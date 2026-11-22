/**
 * A repertoire bigger than the 100-line active batch, driven through startSession.
 *
 * The batch is the head of the pool, so ordering must happen before the split or a big
 * repertoire is only ever drilled from its first hundred lines.
 */

import { Chess } from 'chess.js';
import { TrainingService } from '../TrainingService';
import { MoveTree } from '@utils/MoveTree';
import { Repertoire, TrainingConfig, TrainingSession, LineStats } from '@types';

const LINE_COUNT = 350;

/** Deterministic three-ply lines (white, black, white) with distinct endings. */
function threePlyLines(count: number): string[][] {
  const lines: string[][] = [];
  const root = new Chess();
  for (const a of root.moves()) {
    const c1 = new Chess(); c1.move(a);
    for (const b of c1.moves()) {
      const c2 = new Chess(c1.fen()); c2.move(b);
      for (const c of c2.moves()) {
        lines.push([a, b, c]);
        if (lines.length === count) return lines;
      }
    }
  }
  return lines;
}

function bigRepertoire(): Repertoire {
  const tree = new MoveTree();
  for (const line of threePlyLines(LINE_COUNT)) {
    tree.goToStart();
    for (const san of line) {
      const existing = (tree.getCurrentNode()?.children ?? tree.getRootMoves()).find(n => n.san === san);
      if (existing) tree.navigateToNode(existing.id);
      else tree.addMove(san);
    }
  }
  return {
    id: 'rep1', name: 'Big', color: 'white', openingType: 'Other' as any, eco: '',
    chapters: [{
      id: 'ch1', name: 'ch1', pgn: '', moveTree: tree.toJSON(), order: 0,
      createdAt: new Date(0), updatedAt: new Date(0),
    }],
    createdAt: new Date(0), updatedAt: new Date(0),
  };
}

function start(over: Partial<TrainingConfig>): TrainingSession {
  return TrainingService.startSession(
    { repertoireId: 'rep1', selection: { kind: 'all' }, order: 'depth-first', guidance: 'none', ...over },
    bigRepertoire(),
    []
  );
}

const extractionOrder = () => start({}).lines.concat(start({}).holdbackLines).map(l => l.id);

/** Drill a whole session the way the screen does and return every line that got rated. */
function drillAll(session: TrainingSession): Set<string> {
  const rated = new Set<string>();
  const stats: LineStats[] = [];
  for (let steps = 0; !session.isComplete && steps < 20000; steps++) {
    const line = session.lines[session.currentLineIndex];
    if (TrainingService.advanceToNextPosition(session)) continue;
    if (!session.awaitingRating) break;
    const result = TrainingService.completeLineAndAdvance(session, 5, stats);
    rated.add(line.id);
    stats.push(result.updatedStats);
    result.alsoCompleted.forEach(s => { rated.add(s.lineId); stats.push(s); });
    if (!result.hasMore) break;
  }
  return rated;
}

describe.each(['depth-first', 'random', 'width-first'] as const)('large pool, %s', order => {
  it('keeps every line in the session, split between batch and holdback', () => {
    const s = start({ order });
    expect(s.totalLineCount).toBe(LINE_COUNT);
    expect(s.lines.length + s.holdbackLines.length).toBe(LINE_COUNT);
  });

  it('drills every line, not just the first batch', () => {
    const rated = drillAll(start({ order }));
    expect(rated.size).toBe(LINE_COUNT);
  });
});

describe('large pool batch composition', () => {
  it('random draws its first batch from across the whole pool', () => {
    const firstHundred = new Set(extractionOrder().slice(0, 100));
    const batch = start({ order: 'random' }).lines;
    const outside = batch.filter(l => !firstHundred.has(l.id)).length;
    // A batch of 100 from 350 shares ~29 lines with the first hundred by chance
    expect(outside).toBeGreaterThan(40);
  });

  it('width-first reaches beyond the first extracted lines in its first batch', () => {
    const firstHundred = new Set(extractionOrder().slice(0, 100));
    const batch = start({ order: 'width-first' }).lines;
    expect(batch.some(l => !firstHundred.has(l.id))).toBe(true);
  });

  it('random with a depth cap still sees the whole capped pool', () => {
    const s = start({ order: 'random', maxDepth: 2 });
    expect(s.lines.length + s.holdbackLines.length).toBe(s.totalLineCount);
  });
});

describe('large pool under "recommended" with nothing drilled yet', () => {
  // Every line scores the same, so the sort's tie order decides the batch. If that is
  // extraction order the batch is the first hundred lines, whatever the drill order.
  it('random picks its batch from across the pool', () => {
    const firstHundred = new Set(extractionOrder().slice(0, 100));
    const batch = start({ order: 'random', selection: { kind: 'recommended' } }).lines;
    expect(batch.filter(l => !firstHundred.has(l.id)).length).toBeGreaterThan(40);
  });

  it('width-first interleaves branches before taking its batch', () => {
    const firstHundred = new Set(extractionOrder().slice(0, 100));
    const batch = start({ order: 'width-first', selection: { kind: 'recommended' } }).lines;
    expect(batch.some(l => !firstHundred.has(l.id))).toBe(true);
  });
});

describe('loadMoreFromHoldback', () => {
  it('appends the next batch without moving the cursor or losing lines', () => {
    const s = start({ order: 'depth-first' });
    const before = s.lines.map(l => l.id);
    s.currentLineIndex = 5;
    const added = TrainingService.loadMoreFromHoldback(s);
    expect(added).toBe(100);
    expect(s.lines.slice(0, 100).map(l => l.id)).toEqual(before);
    expect(s.currentLineIndex).toBe(5);
    expect(s.lines.length + s.holdbackLines.length).toBe(LINE_COUNT);
  });

  it('does nothing once holdback is empty', () => {
    const s = start({});
    while (s.holdbackLines.length) TrainingService.loadMoreFromHoldback(s);
    expect(TrainingService.loadMoreFromHoldback(s)).toBe(0);
  });
});
