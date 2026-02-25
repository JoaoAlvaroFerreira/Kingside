import { createLineGenerator } from '../LineGenerator';
import { buildMoveTreeFromMoves, buildMoveTreeWithVariations } from '../../gameReview/__tests__/testHelpers';
import { SerializedMoveTree } from '@utils/MoveTree';

function treeData(moves: string[]): SerializedMoveTree {
  return buildMoveTreeFromMoves(moves).toJSON();
}

function treeDataWithVariations(lines: string[][]): SerializedMoveTree {
  return buildMoveTreeWithVariations(lines).toJSON();
}

const REP_ID = 'rep_1';
const CH_ID = 'ch_1';
const COLOR = 'white' as const;

describe('LineGenerator', () => {
  describe('totalLines counting', () => {
    it('counts 1 line for a single-branch tree', () => {
      const gen = createLineGenerator(
        treeData(['e4', 'e5', 'Nf3']),
        REP_ID, CH_ID, COLOR
      );
      expect(gen.totalLines).toBe(1);
    });

    it('counts 2 lines for a tree with one branch point', () => {
      const gen = createLineGenerator(
        treeDataWithVariations([
          ['e4', 'e5', 'Nf3'],
          ['e4', 'e5', 'Bc4'],
        ]),
        REP_ID, CH_ID, COLOR
      );
      expect(gen.totalLines).toBe(2);
    });

    it('counts correctly before any batch is loaded', () => {
      const gen = createLineGenerator(
        treeDataWithVariations([
          ['e4', 'e5', 'Nf3', 'Nc6'],
          ['e4', 'e5', 'Bc4', 'Nf6'],
          ['e4', 'c5', 'Nf3'],
        ]),
        REP_ID, CH_ID, COLOR
      );
      expect(gen.totalLines).toBe(3);
      expect(gen.loadedLines).toHaveLength(0);
    });

    it('counts 1 line for a tree with a single move', () => {
      const gen = createLineGenerator(
        treeData(['e4']),
        REP_ID, CH_ID, COLOR
      );
      expect(gen.totalLines).toBe(1);
    });

    it('counts 0 lines for an empty tree', () => {
      const gen = createLineGenerator(
        { rootMoves: [], startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', nodeIdCounter: 0 },
        REP_ID, CH_ID, COLOR
      );
      expect(gen.totalLines).toBe(0);
    });
  });

  describe('loadNextBatch', () => {
    it('returns up to batchSize lines', () => {
      // Build a tree with many variations
      const lines = [
        ['e4', 'e5', 'Nf3'],
        ['e4', 'e5', 'Bc4'],
        ['e4', 'c5'],
        ['d4', 'd5'],
      ];
      const gen = createLineGenerator(
        treeDataWithVariations(lines),
        REP_ID, CH_ID, COLOR, 2 // batchSize = 2
      );

      const batch1 = gen.loadNextBatch();
      expect(batch1.length).toBeLessThanOrEqual(2);
      expect(batch1.length).toBeGreaterThan(0);
    });

    it('first batch returns correct lines for a single-branch tree', () => {
      const gen = createLineGenerator(
        treeData(['e4', 'e5', 'Nf3']),
        REP_ID, CH_ID, COLOR
      );

      const batch = gen.loadNextBatch();
      expect(batch).toHaveLength(1);
      expect(batch[0].moves).toHaveLength(3);
      expect(batch[0].moves.map(m => m.san)).toEqual(['e4', 'e5', 'Nf3']);
    });

    it('subsequent batches return next lines without overlap', () => {
      const lines = [
        ['e4', 'e5', 'Nf3'],
        ['e4', 'e5', 'Bc4'],
        ['e4', 'c5'],
        ['d4', 'd5'],
      ];
      const gen = createLineGenerator(
        treeDataWithVariations(lines),
        REP_ID, CH_ID, COLOR, 2
      );

      const batch1 = gen.loadNextBatch();
      const batch2 = gen.loadNextBatch();

      const batch1Ids = new Set(batch1.map(l => l.id));
      const batch2Ids = new Set(batch2.map(l => l.id));

      // No overlap
      for (const id of batch2Ids) {
        expect(batch1Ids.has(id)).toBe(false);
      }

      // Together they cover some lines
      expect(batch1.length + batch2.length).toBeGreaterThan(0);
    });

    it('returns empty array when exhausted', () => {
      const gen = createLineGenerator(
        treeData(['e4']),
        REP_ID, CH_ID, COLOR
      );

      gen.loadNextBatch(); // Gets the single line
      const batch2 = gen.loadNextBatch();
      expect(batch2).toHaveLength(0);
    });
  });

  describe('hasMore', () => {
    it('returns true before all lines are extracted', () => {
      const gen = createLineGenerator(
        treeDataWithVariations([
          ['e4', 'e5', 'Nf3'],
          ['e4', 'e5', 'Bc4'],
        ]),
        REP_ID, CH_ID, COLOR, 1
      );

      expect(gen.hasMore()).toBe(true);
      gen.loadNextBatch();
      expect(gen.hasMore()).toBe(true);
    });

    it('returns false after all lines are extracted', () => {
      const gen = createLineGenerator(
        treeData(['e4', 'e5']),
        REP_ID, CH_ID, COLOR
      );

      gen.loadNextBatch();
      expect(gen.hasMore()).toBe(false);
    });
  });

  describe('deep tree with all moves from root to leaf', () => {
    it('each line contains all moves from root to its leaf', () => {
      const gen = createLineGenerator(
        treeDataWithVariations([
          ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
          ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
          ['e4', 'e5', 'Nf3', 'd6'],
        ]),
        REP_ID, CH_ID, COLOR
      );

      // Load all
      gen.loadNextBatch();
      if (gen.hasMore()) gen.loadNextBatch();

      expect(gen.loadedLines).toHaveLength(3);

      // Every line should start with e4
      for (const line of gen.loadedLines) {
        expect(line.moves[0].san).toBe('e4');
      }

      // Find the line ending with Bb5
      const bb5Line = gen.loadedLines.find(
        l => l.moves[l.moves.length - 1].san === 'Bb5'
      );
      expect(bb5Line).toBeDefined();
      expect(bb5Line!.moves.map(m => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    });
  });

  describe('3 levels of branching', () => {
    it('extracts all paths across batches', () => {
      // Level 1: e4 vs d4
      // Level 2: e4 e5 vs e4 c5
      // Level 3: e4 e5 Nf3 vs e4 e5 Bc4
      const lines = [
        ['e4', 'e5', 'Nf3'],
        ['e4', 'e5', 'Bc4'],
        ['e4', 'c5', 'Nf3'],
        ['d4', 'd5', 'c4'],
      ];
      const gen = createLineGenerator(
        treeDataWithVariations(lines),
        REP_ID, CH_ID, COLOR, 2
      );

      // Load all batches
      while (gen.hasMore()) {
        gen.loadNextBatch();
      }

      expect(gen.loadedLines).toHaveLength(4);

      const movePaths = gen.loadedLines.map(l => l.moves.map(m => m.san));
      expect(movePaths).toContainEqual(['e4', 'e5', 'Nf3']);
      expect(movePaths).toContainEqual(['e4', 'e5', 'Bc4']);
      expect(movePaths).toContainEqual(['e4', 'c5', 'Nf3']);
      expect(movePaths).toContainEqual(['d4', 'd5', 'c4']);
    });
  });

  describe('markCompleted and auto-refill', () => {
    it('auto-loads next batch when uncompleted lines fall below threshold', () => {
      // 4 lines total, batchSize=2 => threshold = ceil(0.4) = 1
      const lines = [
        ['e4', 'e5', 'Nf3'],
        ['e4', 'e5', 'Bc4'],
        ['e4', 'c5'],
        ['d4', 'd5'],
      ];
      const gen = createLineGenerator(
        treeDataWithVariations(lines),
        REP_ID, CH_ID, COLOR, 2
      );

      // Load first batch (2 lines)
      gen.loadNextBatch();
      expect(gen.loadedLines).toHaveLength(2);

      // Mark first as completed -- 1 uncompleted remains, threshold is 1
      // This triggers auto-refill since uncompleted (1) < threshold (1) is false
      // Actually ceil(2*0.2) = ceil(0.4) = 1, so uncompleted must be < 1 = 0
      gen.markCompleted(0);

      // Mark second as completed -- 0 uncompleted, < 1 threshold
      gen.markCompleted(1);

      // Auto-refill should have loaded more
      expect(gen.loadedLines.length).toBeGreaterThan(2);
    });

    it('does not auto-load when enough uncompleted remain', () => {
      const lines = [
        ['e4', 'e5', 'Nf3'],
        ['e4', 'e5', 'Bc4'],
        ['e4', 'c5'],
        ['d4', 'd5'],
      ];
      const gen = createLineGenerator(
        treeDataWithVariations(lines),
        REP_ID, CH_ID, COLOR, 3
      );

      // Load first batch (3 lines)
      gen.loadNextBatch();
      expect(gen.loadedLines).toHaveLength(3);

      // Mark one as completed -- 2 uncompleted remain, threshold = ceil(3*0.2)=1
      gen.markCompleted(0);

      // Should NOT have auto-loaded (2 >= 1)
      expect(gen.loadedLines).toHaveLength(3);
    });
  });

  describe('reset', () => {
    it('clears state and restarts from the beginning', () => {
      const gen = createLineGenerator(
        treeDataWithVariations([
          ['e4', 'e5', 'Nf3'],
          ['e4', 'e5', 'Bc4'],
        ]),
        REP_ID, CH_ID, COLOR
      );

      gen.loadNextBatch();
      expect(gen.loadedLines).toHaveLength(2);
      expect(gen.hasMore()).toBe(false);

      gen.reset();

      expect(gen.loadedLines).toHaveLength(0);
      expect(gen.hasMore()).toBe(true);
      expect(gen.totalLines).toBe(2);

      const batch = gen.loadNextBatch();
      expect(batch).toHaveLength(2);
    });
  });

  describe('single-branch tree (no variations)', () => {
    it('works correctly with a long single line', () => {
      const gen = createLineGenerator(
        treeData(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6']),
        REP_ID, CH_ID, COLOR
      );

      expect(gen.totalLines).toBe(1);

      const batch = gen.loadNextBatch();
      expect(batch).toHaveLength(1);
      expect(batch[0].moves).toHaveLength(8);
      expect(batch[0].isMainLine).toBe(true);

      expect(gen.hasMore()).toBe(false);
    });
  });

  describe('line content correctness', () => {
    it('lines have correct isUserMove flags for white repertoire', () => {
      const gen = createLineGenerator(
        treeData(['e4', 'e5', 'Nf3', 'Nc6']),
        REP_ID, CH_ID, 'white'
      );

      const batch = gen.loadNextBatch();
      const moves = batch[0].moves;

      // White moves should be user moves
      expect(moves[0].isUserMove).toBe(true);  // e4 (white)
      expect(moves[1].isUserMove).toBe(false); // e5 (black)
      expect(moves[2].isUserMove).toBe(true);  // Nf3 (white)
      expect(moves[3].isUserMove).toBe(false); // Nc6 (black)
    });

    it('lines have correct isUserMove flags for black repertoire', () => {
      const gen = createLineGenerator(
        treeData(['e4', 'e5', 'Nf3', 'Nc6']),
        REP_ID, CH_ID, 'black'
      );

      const batch = gen.loadNextBatch();
      const moves = batch[0].moves;

      expect(moves[0].isUserMove).toBe(false); // e4 (white)
      expect(moves[1].isUserMove).toBe(true);  // e5 (black)
      expect(moves[2].isUserMove).toBe(false); // Nf3 (white)
      expect(moves[3].isUserMove).toBe(true);  // Nc6 (black)
    });

    it('lines have correct FEN positions', () => {
      const gen = createLineGenerator(
        treeData(['e4', 'e5']),
        REP_ID, CH_ID, COLOR
      );

      const batch = gen.loadNextBatch();
      const moves = batch[0].moves;

      // preFen of first move should be starting position
      expect(moves[0].preFen).toContain('rnbqkbnr/pppppppp');
      // fen of first move should have e4 played
      expect(moves[0].fen).toContain('4P3'); // e4 pawn... actually let's check differently
      expect(moves[1].preFen).toBe(moves[0].fen);
    });
  });

  describe('maxDepth', () => {
    it('limits line depth when specified', () => {
      const gen = createLineGenerator(
        treeData(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']),
        REP_ID, CH_ID, COLOR, 50, 3 // maxDepth = 3
      );

      expect(gen.totalLines).toBe(1);

      const batch = gen.loadNextBatch();
      expect(batch).toHaveLength(1);
      expect(batch[0].moves).toHaveLength(3);
      expect(batch[0].moves.map(m => m.san)).toEqual(['e4', 'e5', 'Nf3']);
    });
  });
});
