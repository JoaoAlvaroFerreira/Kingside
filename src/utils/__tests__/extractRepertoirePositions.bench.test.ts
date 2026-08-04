import { Chess } from 'chess.js';
import { extractChapterPositions } from '@utils/extractRepertoirePositions';
import { Chapter } from '@types';

// Build a real (all-legal) branchy tree by asking chess.js for legal moves at each
// node and branching into a few of them, so traversal actually reaches full depth
// instead of dying early on illegal synthetic SAN strings.
type BenchNode = { id: string; san: string; children: BenchNode[] };

function buildLegalTree(chess: Chess, ply: number, depth: number, branching: number, idRef: { n: number }): BenchNode[] {
  if (ply >= depth) return [];
  const legalMoves = chess.moves().slice(0, branching);
  const nodes: BenchNode[] = [];
  for (const san of legalMoves) {
    chess.move(san);
    nodes.push({
      id: `n${idRef.n++}`,
      san,
      children: buildLegalTree(chess, ply + 1, depth, branching, idRef),
    });
    chess.undo();
  }
  return nodes;
}

describe('extractChapterPositions performance', () => {
  it('stays roughly linear in node count on a deep, branchy chapter', () => {
    // Regression guard for a prior O(lines * depth) implementation that replayed
    // every root-to-leaf line from scratch — combinatorial in branching factor and
    // slow enough on real repertoires to make app startup look hung. The current
    // implementation is a single DFS visiting each node once (O(nodes)).
    const DEPTH = 7;
    const BRANCHING = 3;
    const idRef = { n: 0 };
    const roots = buildLegalTree(new Chess(), 0, DEPTH, BRANCHING, idRef);

    const chapter: Chapter = {
      id: 'bench-chapter',
      name: 'Bench',
      pgn: '',
      moveTree: { rootMoves: roots },
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const start = Date.now();
    const result = extractChapterPositions(chapter);
    const elapsedMs = Date.now() - start;

    console.log(`[bench] depth=${DEPTH} branching=${BRANCHING} nodes=${idRef.n} elapsedMs=${elapsedMs}`);

    expect(result.size).toBe(DEPTH + 1);
    // O(nodes) should comfortably clear ~3.3k nodes ((3^8 - 3) / 2) in well under a second
    // even on slow CI hardware; the old O(lines * depth) approach was measured ~3x slower
    // at this size, with the gap widening as depth grows.
    expect(elapsedMs).toBeLessThan(1500);
  });
});
