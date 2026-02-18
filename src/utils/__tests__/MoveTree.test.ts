import { MoveTree } from '@utils/MoveTree';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('MoveTree', () => {
  describe('construction', () => {
    it('creates tree at starting position', () => {
      const tree = new MoveTree();
      expect(tree.getCurrentFen()).toBe(START_FEN);
      expect(tree.getRootMoves()).toHaveLength(0);
    });

    it('creates tree with custom start FEN', () => {
      const fen = 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
      const tree = new MoveTree(fen);
      expect(tree.getCurrentFen()).toBe(fen);
    });

    it('is at start on creation', () => {
      const tree = new MoveTree();
      expect(tree.isAtStart()).toBe(true);
      expect(tree.isAtEnd()).toBe(true); // empty tree
    });
  });

  describe('addMove', () => {
    it('adds a legal move and updates currentNode', () => {
      const tree = new MoveTree();
      const ok = tree.addMove('e4');
      expect(ok).toBe(true);
      expect(tree.getRootMoves()).toHaveLength(1);
      expect(tree.getRootMoves()[0].san).toBe('e4');
      expect(tree.getCurrentNode()?.san).toBe('e4');
    });

    it('adds sequential moves', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      tree.addMove('e5');
      expect(tree.getRootMoves()[0].children[0].san).toBe('e5');
    });

    it('rejects illegal moves and returns false', () => {
      const tree = new MoveTree();
      expect(tree.addMove('e5')).toBe(false); // black pawn move from white's turn
      expect(tree.addMove('Nf6')).toBe(false); // illegal from start
      expect(tree.getRootMoves()).toHaveLength(0);
    });

    it('navigates to existing child if move already present', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      const firstNode = tree.getCurrentNode();
      tree.goToStart();
      tree.addMove('e4'); // same move again
      expect(tree.getCurrentNode()).toBe(firstNode);
      expect(tree.getRootMoves()).toHaveLength(1);
    });

    it('handles castling (O-O)', () => {
      const fen = 'rnbqk2r/pppp1ppp/4pn2/2b5/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
      const tree = new MoveTree(fen);
      expect(tree.addMove('O-O')).toBe(true);
      expect(tree.getCurrentNode()?.san).toBe('O-O');
    });

    it('correctly sets moveNumber and isBlack', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      const e4Node = tree.getCurrentNode()!;
      expect(e4Node.moveNumber).toBe(1);
      expect(e4Node.isBlack).toBe(false);

      tree.addMove('e5');
      const e5Node = tree.getCurrentNode()!;
      expect(e5Node.moveNumber).toBe(1);
      expect(e5Node.isBlack).toBe(true);

      tree.addMove('Nf3');
      const nf3Node = tree.getCurrentNode()!;
      expect(nf3Node.moveNumber).toBe(2);
      expect(nf3Node.isBlack).toBe(false);
    });
  });

  describe('navigation', () => {
    let tree: MoveTree;
    beforeEach(() => {
      tree = new MoveTree();
      tree.addMove('e4');
      tree.addMove('e5');
      tree.addMove('Nf3');
    });

    it('goBack returns to parent', () => {
      expect(tree.getCurrentNode()?.san).toBe('Nf3');
      tree.goBack();
      expect(tree.getCurrentNode()?.san).toBe('e5');
    });

    it('goBack from root returns to null (start)', () => {
      tree.goToStart();
      const result = tree.goBack();
      expect(result).toBe(false);
      expect(tree.getCurrentNode()).toBeNull();
    });

    it('goForward follows main line', () => {
      tree.goToStart();
      tree.goForward();
      expect(tree.getCurrentNode()?.san).toBe('e4');
      tree.goForward();
      expect(tree.getCurrentNode()?.san).toBe('e5');
    });

    it('goForward at end is no-op', () => {
      const result = tree.goForward();
      expect(result).toBe(false);
      expect(tree.getCurrentNode()?.san).toBe('Nf3');
    });

    it('goToStart resets to null', () => {
      tree.goToStart();
      expect(tree.getCurrentNode()).toBeNull();
      expect(tree.isAtStart()).toBe(true);
    });

    it('goToEnd follows main line to leaf', () => {
      tree.goToStart();
      tree.goToEnd();
      expect(tree.getCurrentNode()?.san).toBe('Nf3');
      expect(tree.isAtEnd()).toBe(true);
    });

    it('isAtStart is false after moves', () => {
      expect(tree.isAtStart()).toBe(false);
    });

    it('isAtEnd is false mid-tree', () => {
      tree.goToStart();
      tree.goForward();
      expect(tree.isAtEnd()).toBe(false);
    });
  });

  describe('navigateToNode', () => {
    it('navigates to a specific node by ID', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      const e4Id = tree.getCurrentNode()!.id;
      tree.addMove('e5');
      tree.navigateToNode(e4Id);
      expect(tree.getCurrentNode()?.san).toBe('e4');
    });

    it('returns false for unknown ID', () => {
      const tree = new MoveTree();
      expect(tree.navigateToNode('nonexistent')).toBe(false);
    });

    it('navigateToNode(null) goes to start', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      tree.navigateToNode(null);
      expect(tree.getCurrentNode()).toBeNull();
    });
  });

  describe('variations', () => {
    it('adding move from non-leaf position creates variation', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      tree.addMove('e5');  // main line
      tree.goBack();
      tree.addMove('c5'); // variation
      expect(tree.getRootMoves()[0].children).toHaveLength(2);
      expect(tree.getRootMoves()[0].children[0].san).toBe('e5');
      expect(tree.getRootMoves()[0].children[1].san).toBe('c5');
    });

    it('variation nodes have correct parent reference', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      const e4Node = tree.getCurrentNode()!;
      tree.addMove('e5');
      tree.goBack();
      tree.addMove('c5');
      const c5Node = tree.getCurrentNode()!;
      expect(c5Node.parent).toBe(e4Node);
    });

    it('isVariation returns true for non-main-line nodes', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      tree.addMove('e5');
      tree.goBack();
      tree.addMove('c5');
      const c5Id = tree.getCurrentNode()!.id;
      expect(tree.isVariation(c5Id)).toBe(true);
    });

    it('isVariation returns false for main line nodes', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      const e4Id = tree.getCurrentNode()!.id;
      expect(tree.isVariation(e4Id)).toBe(false);
    });
  });

  describe('getMainLine', () => {
    it('returns empty for empty tree', () => {
      const tree = new MoveTree();
      expect(tree.getMainLine()).toEqual([]);
    });

    it('returns SANs of main line', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      tree.addMove('e5');
      tree.addMove('Nf3');
      expect(tree.getMainLine()).toEqual(['e4', 'e5', 'Nf3']);
    });

    it('only returns main line (not variations)', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      tree.addMove('e5');
      tree.goBack();
      tree.addMove('c5');  // variation
      expect(tree.getMainLine()).toEqual(['e4', 'e5']); // e5 is first child = main line
    });
  });

  describe('getCurrentPath', () => {
    it('returns path from root to current node', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      tree.addMove('e5');
      const path = tree.getCurrentPath();
      expect(path.map(n => n.san)).toEqual(['e4', 'e5']);
    });

    it('returns empty path at start', () => {
      const tree = new MoveTree();
      expect(tree.getCurrentPath()).toEqual([]);
    });
  });

  describe('getFlatMoves', () => {
    it('returns empty array for empty tree', () => {
      const tree = new MoveTree();
      expect(tree.getFlatMoves()).toEqual([]);
    });

    it('returns main line moves in order', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      tree.addMove('e5');
      tree.addMove('Nf3');
      const flat = tree.getFlatMoves();
      expect(flat.map(m => m.san)).toEqual(['e4', 'e5', 'Nf3']);
    });

    it('includes variation moves', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      tree.addMove('e5');
      tree.goBack();
      tree.addMove('c5');
      const flat = tree.getFlatMoves();
      expect(flat.map(m => m.san)).toContain('c5');
    });

    it('marks variation start correctly', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      tree.addMove('e5');
      tree.goBack();
      tree.addMove('c5');
      const flat = tree.getFlatMoves();
      const c5Move = flat.find(m => m.san === 'c5')!;
      expect(c5Move.isVariationStart).toBe(true);
      expect(c5Move.depth).toBeGreaterThan(0);
    });
  });

  describe('comments', () => {
    it('can set comment on a node', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      const id = tree.getCurrentNode()!.id;
      tree.setComment(id, 'Best move!');
      expect(tree.getCurrentNode()?.comment).toBe('Best move!');
    });

    it('returns false for unknown node', () => {
      const tree = new MoveTree();
      expect(tree.setComment('ghost', 'x')).toBe(false);
    });
  });

  describe('promoteToMainLine', () => {
    it('promotes variation to main line', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      tree.addMove('e5');  // first child = main
      tree.goBack();
      tree.addMove('c5');  // second child = variation
      const c5Id = tree.getCurrentNode()!.id;

      tree.promoteToMainLine(c5Id);
      expect(tree.getRootMoves()[0].children[0].san).toBe('c5');
    });
  });

  describe('markAsCritical', () => {
    it('marks node as critical', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      const id = tree.getCurrentNode()!.id;
      tree.markAsCritical(id, true);
      expect(tree.getCurrentNode()?.isCritical).toBe(true);
    });

    it('unmarks node', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      const id = tree.getCurrentNode()!.id;
      tree.markAsCritical(id, true);
      tree.markAsCritical(id, false);
      expect(tree.getCurrentNode()?.isCritical).toBe(false);
    });
  });

  describe('serialization', () => {
    it('toJSON/fromJSON round-trip preserves moves', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      tree.addMove('e5');
      tree.addMove('Nf3');

      const restored = MoveTree.fromJSON(tree.toJSON());
      expect(restored.getMainLine()).toEqual(['e4', 'e5', 'Nf3']);
    });

    it('round-trip preserves variations', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      tree.addMove('e5');
      tree.goBack();
      tree.addMove('c5');

      const restored = MoveTree.fromJSON(tree.toJSON());
      const root = restored.getRootMoves()[0];
      expect(root.children).toHaveLength(2);
      expect(root.children[0].san).toBe('e5');
      expect(root.children[1].san).toBe('c5');
    });

    it('round-trip preserves comments', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      const id = tree.getCurrentNode()!.id;
      tree.setComment(id, 'Key move');

      const restored = MoveTree.fromJSON(tree.toJSON());
      restored.goForward();
      expect(restored.getCurrentNode()?.comment).toBe('Key move');
    });

    it('round-trip preserves node IDs', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      const originalId = tree.getCurrentNode()!.id;

      const restored = MoveTree.fromJSON(tree.toJSON());
      restored.goForward();
      expect(restored.getCurrentNode()?.id).toBe(originalId);
    });

    it('handles empty tree', () => {
      const tree = new MoveTree();
      const restored = MoveTree.fromJSON(tree.toJSON());
      expect(restored.getRootMoves()).toHaveLength(0);
    });

    it('toJSON returns valid JSON-serializable object', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      expect(() => JSON.stringify(tree.toJSON())).not.toThrow();
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      const tree = new MoveTree();
      tree.addMove('e4');
      tree.reset();
      expect(tree.getRootMoves()).toHaveLength(0);
      expect(tree.getCurrentNode()).toBeNull();
      expect(tree.isAtStart()).toBe(true);
    });
  });
});
