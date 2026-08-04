import { Chess } from 'chess.js';
import { extractChapterPositions } from '@utils/extractRepertoirePositions';
import { Chapter } from '@types';

// Build a real (all-legal) branchy tree by asking chess.js for legal moves at each
// node and branching into a few of them, so traversal actually reaches full depth
// instead of dying early on illegal synthetic SAN strings. Nodes carry their FEN,
// exactly as MoveTree writes them when a chapter is built from PGN.
type BenchNode = { id: string; san: string; fen: string; children: BenchNode[] };

function buildLegalTree(chess: Chess, ply: number, depth: number, branching: number, idRef: { n: number }): BenchNode[] {
  if (ply >= depth) return [];
  const legalMoves = chess.moves().slice(0, branching);
  const nodes: BenchNode[] = [];
  for (const san of legalMoves) {
    chess.move(san);
    nodes.push({
      id: `n${idRef.n++}`,
      san,
      fen: chess.fen(),
      children: buildLegalTree(chess, ply + 1, depth, branching, idRef),
    });
    chess.undo();
  }
  return nodes;
}

function makeChapter(roots: BenchNode[]): Chapter {
  return {
    id: 'bench-chapter',
    name: 'Bench',
    pgn: '',
    moveTree: { rootMoves: roots },
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Strip stored FENs so extraction has to fall back to replaying moves. */
function stripFens(nodes: BenchNode[]): any[] {
  return nodes.map(({ id, san, children }) => ({ id, san, children: stripFens(children) }));
}

describe('extractChapterPositions', () => {
  const DEPTH = 7;
  const BRANCHING = 3;

  it('stays fast on a deep, branchy chapter', () => {
    // Regression guard for two prior implementations: one enumerated every root-to-leaf
    // line separately (combinatorial in branching factor), and the next replayed every
    // move through chess.js to recompute FENs the nodes already stored. Both made
    // indexing slow enough to be felt on import.
    const idRef = { n: 0 };
    const roots = buildLegalTree(new Chess(), 0, DEPTH, BRANCHING, idRef);

    const start = Date.now();
    const result = extractChapterPositions(makeChapter(roots));
    const elapsedMs = Date.now() - start;

    console.log(`[bench] depth=${DEPTH} branching=${BRANCHING} nodes=${idRef.n} elapsedMs=${elapsedMs}`);

    expect(result.size).toBe(DEPTH + 1);
    expect(elapsedMs).toBeLessThan(250);
  });

  it('produces the same positions from stored FENs as from replayed moves', () => {
    const idRef = { n: 0 };
    const roots = buildLegalTree(new Chess(), 0, 4, 3, idRef);

    const fromStored = extractChapterPositions(makeChapter(roots));
    const fromReplay = extractChapterPositions(makeChapter(stripFens(roots)));

    expect(fromStored.size).toBe(fromReplay.size);
    for (const [moveCount, expected] of fromReplay) {
      const actual = fromStored.get(moveCount)!;
      expect(actual).toBeDefined();
      expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
      for (const [fen, moves] of expected) {
        expect([...actual.get(fen)!].sort()).toEqual([...moves].sort());
      }
    }
  });

  it('honours a custom starting position', () => {
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';
    const chess = new Chess(startFen);
    chess.move('e5');

    const chapter = makeChapter([]);
    chapter.moveTree = { startFen, rootMoves: [{ id: 'n0', san: 'e5', fen: chess.fen(), children: [] }] };

    const result = extractChapterPositions(chapter);

    expect([...result.get(0)!.keys()]).toEqual(['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq -']);
  });
});
