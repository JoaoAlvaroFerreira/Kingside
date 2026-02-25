import { BreadthFirstTrainer, BFSQueueItem } from '@services/training/BreadthFirstTrainer';
import { MoveTree } from '@utils/MoveTree';

function buildTree(lines: string[][]): MoveTree {
  const tree = new MoveTree();
  for (const line of lines) {
    tree.goToStart();
    for (const move of line) {
      const ok = tree.addMove(move);
      if (!ok) throw new Error(`Failed to add move "${move}"`);
    }
  }
  tree.goToStart();
  return tree;
}

describe('BreadthFirstTrainer', () => {
  describe('simple tree, user plays White', () => {
    // 1.e4 e5 2.Nf3 Nc6
    // 1.e4 c5 2.Nf3 d6
    let queue: BFSQueueItem[];

    beforeAll(() => {
      const tree = buildTree([
        ['e4', 'e5', 'Nf3', 'Nc6'],
        ['e4', 'c5', 'Nf3', 'd6'],
      ]);
      queue = BreadthFirstTrainer.buildQueue(tree, 'white');
    });

    it('should test 1.e4 first (only once despite two branches)', () => {
      expect(queue[0].expectedMove).toBe('e4');
      expect(queue[0].path).toEqual([]);
      expect(queue[0].moveNumber).toBe(1);
      expect(queue[0].isBlackMove).toBe(false);
    });

    it('should test level-2 user moves before any level-3 items', () => {
      // After 1.e4 e5 -> test 2.Nf3
      // After 1.e4 c5 -> test 2.Nf3
      const level2 = queue.filter((_, i) => i > 0 && i <= 2);
      expect(level2).toHaveLength(2);
      expect(level2[0].expectedMove).toBe('Nf3');
      expect(level2[0].path).toEqual(['e4', 'e5']);
      expect(level2[1].expectedMove).toBe('Nf3');
      expect(level2[1].path).toEqual(['e4', 'c5']);
    });

    it('should not include opponent moves in queue', () => {
      const opponentMoves = ['e5', 'c5', 'Nc6', 'd6'];
      for (const item of queue) {
        expect(opponentMoves).not.toContain(item.expectedMove);
      }
    });

    it('should only contain user (White) moves', () => {
      for (const item of queue) {
        expect(item.isBlackMove).toBe(false);
      }
    });
  });

  describe('deep tree with BFS level ordering', () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6
    // 1.e4 e5 2.Nf3 d6 3.d4 exd4
    // 1.e4 c5 2.Nf3 d6 3.d4 cxd4
    let queue: BFSQueueItem[];

    beforeAll(() => {
      const tree = buildTree([
        ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'],
        ['e4', 'e5', 'Nf3', 'd6', 'd4', 'exd4'],
        ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4'],
      ]);
      queue = BreadthFirstTrainer.buildQueue(tree, 'white');
    });

    it('should process all depth-1 before depth-2 before depth-3', () => {
      // Depth 1: 1.e4
      // Depth 2: 2.Nf3 (after e5), 2.Nf3 (after c5)
      // Depth 3: 3.Bb5 (after Nc6), 3.d4 (after d6 via e5), 3.d4 (after d6 via c5)
      expect(queue[0].expectedMove).toBe('e4');

      const depth2Items = queue.slice(1, 3);
      for (const item of depth2Items) {
        expect(item.expectedMove).toBe('Nf3');
        expect(item.moveNumber).toBe(2);
      }

      const depth3Items = queue.slice(3);
      for (const item of depth3Items) {
        expect(item.moveNumber).toBe(3);
      }
    });

    it('should have correct total count of user move items', () => {
      // 1 (e4) + 2 (Nf3 after e5, Nf3 after c5) + 3 (Bb5, d4 after e5/d6, d4 after c5/d6)
      expect(queue.length).toBe(6);
    });
  });

  describe('transposition detection', () => {
    it('should deduplicate when two paths reach the same FEN with the same user move', () => {
      // 1.e4 e5 2.Nf3 Nc6 3.Bc4
      // 1.e4 Nc6 2.Nf3 e5 3.Bc4
      // After 1.e4 e5 2.Nf3 Nc6 and 1.e4 Nc6 2.Nf3 e5
      // both reach the same FEN -> 3.Bc4 should only appear once
      const tree = buildTree([
        ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
        ['e4', 'Nc6', 'Nf3', 'e5', 'Bc4'],
      ]);
      const queue = BreadthFirstTrainer.buildQueue(tree, 'white');

      // Depth 1: e4 (once)
      // Depth 2: Nf3 after e5, Nf3 after Nc6 (different positions -> both tested)
      // Depth 3: Bc4 - same resulting position from both paths -> tested once
      const bc4Items = queue.filter(q => q.expectedMove === 'Bc4');
      expect(bc4Items).toHaveLength(1);
    });
  });

  describe('user plays Black', () => {
    // 1.e4 e5 2.Nf3 Nc6
    // 1.d4 d5
    let queue: BFSQueueItem[];

    beforeAll(() => {
      const tree = buildTree([
        ['e4', 'e5', 'Nf3', 'Nc6'],
        ['d4', 'd5'],
      ]);
      queue = BreadthFirstTrainer.buildQueue(tree, 'black');
    });

    it('should not include White moves (e4, d4, Nf3) as test items', () => {
      const whiteMoves = ['e4', 'd4', 'Nf3'];
      for (const item of queue) {
        expect(whiteMoves).not.toContain(item.expectedMove);
      }
    });

    it('should test Black responses in BFS order', () => {
      // Depth 1 (Black's): e5 (after 1.e4), d5 (after 1.d4)
      // Depth 2 (Black's): Nc6 (after 1.e4 e5 2.Nf3)
      expect(queue[0].expectedMove).toBe('e5');
      expect(queue[0].isBlackMove).toBe(true);
      expect(queue[1].expectedMove).toBe('d5');
      expect(queue[1].isBlackMove).toBe(true);
      expect(queue[2].expectedMove).toBe('Nc6');
      expect(queue[2].isBlackMove).toBe(true);
    });

    it('should show correct pre-FEN for Black moves', () => {
      // First item: position after 1.e4 (White moved, now it's Black's turn)
      expect(queue[0].fen).toContain(' b '); // FEN has 'b' for Black to move
    });
  });

  describe('single line, no branching', () => {
    it('should return items in sequential order', () => {
      const tree = buildTree([['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']]);
      const queue = BreadthFirstTrainer.buildQueue(tree, 'white');

      expect(queue).toHaveLength(3); // e4, Nf3, Bb5
      expect(queue[0].expectedMove).toBe('e4');
      expect(queue[1].expectedMove).toBe('Nf3');
      expect(queue[2].expectedMove).toBe('Bb5');
    });

    it('should return items for Black in a single line', () => {
      const tree = buildTree([['e4', 'e5', 'Nf3', 'Nc6']]);
      const queue = BreadthFirstTrainer.buildQueue(tree, 'black');

      expect(queue).toHaveLength(2); // e5, Nc6
      expect(queue[0].expectedMove).toBe('e5');
      expect(queue[1].expectedMove).toBe('Nc6');
    });
  });

  describe('empty and minimal trees', () => {
    it('should return empty array for an empty tree', () => {
      const tree = new MoveTree();
      const queue = BreadthFirstTrainer.buildQueue(tree, 'white');
      expect(queue).toEqual([]);
    });

    it('should return single item for a one-move tree (user plays White)', () => {
      const tree = buildTree([['e4']]);
      const queue = BreadthFirstTrainer.buildQueue(tree, 'white');

      expect(queue).toHaveLength(1);
      expect(queue[0].expectedMove).toBe('e4');
      expect(queue[0].path).toEqual([]);
    });

    it('should return empty array for a one-move tree when user plays Black', () => {
      const tree = buildTree([['e4']]);
      const queue = BreadthFirstTrainer.buildQueue(tree, 'black');

      // 1.e4 is White's move, user plays Black -> nothing to test
      expect(queue).toEqual([]);
    });
  });

  describe('opponent moves are never included', () => {
    it('should exclude all opponent moves from queue', () => {
      const tree = buildTree([
        ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4'],
      ]);
      const queue = BreadthFirstTrainer.buildQueue(tree, 'white');

      const expectedMoves = queue.map(q => q.expectedMove);
      expect(expectedMoves).toEqual(['e4', 'Nf3', 'Bb5', 'Ba4']);
      expect(expectedMoves).not.toContain('e5');
      expect(expectedMoves).not.toContain('Nc6');
      expect(expectedMoves).not.toContain('a6');
    });
  });

  describe('path context', () => {
    it('should include moves leading to the tested position', () => {
      const tree = buildTree([['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']]);
      const queue = BreadthFirstTrainer.buildQueue(tree, 'white');

      expect(queue[0].path).toEqual([]);
      expect(queue[1].path).toEqual(['e4', 'e5']);
      expect(queue[2].path).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    });
  });

  describe('multiple user responses from same position', () => {
    it('should include all user alternatives from a branching position', () => {
      // After 1.e4 e5, user can play 2.Nf3 or 2.Bc4
      const tree = buildTree([
        ['e4', 'e5', 'Nf3'],
        ['e4', 'e5', 'Bc4'],
      ]);
      const queue = BreadthFirstTrainer.buildQueue(tree, 'white');

      expect(queue).toHaveLength(3); // e4, Nf3, Bc4
      expect(queue[0].expectedMove).toBe('e4');
      const depth2 = queue.slice(1);
      const depth2Moves = depth2.map(q => q.expectedMove).sort();
      expect(depth2Moves).toEqual(['Bc4', 'Nf3']);
    });
  });
});
