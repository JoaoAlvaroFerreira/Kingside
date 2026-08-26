import { Chess } from 'chess.js';
import { extractChapterMoves, PositionMove } from '@utils/extractRepertoirePositions';
import { Chapter, normalizeFen } from '@types';

type Node = { id: string; san: string; fen: string; children: Node[] };

/**
 * Build a real move tree from SAN lines. The first line is the main line; each later line
 * shares a prefix with an earlier one and branches off it — which is exactly how PGN
 * variations are stored, and what varDepth measures.
 */
function buildTree(lines: string[][]): Node[] {
  const roots: Node[] = [];
  let idCounter = 0;

  for (const line of lines) {
    const chess = new Chess();
    let siblings = roots;
    let parent: Node | null = null;

    for (const san of line) {
      chess.move(san);
      let node = siblings.find(n => n.san === san);
      if (!node) {
        node = { id: `n${idCounter++}`, san, fen: chess.fen(), children: [] };
        siblings.push(node);
      }
      parent = node;
      siblings = node.children;
    }
    void parent;
  }
  return roots;
}

function makeChapter(roots: Node[]): Chapter {
  return {
    id: 'ch-1',
    name: 'Test',
    pgn: '',
    moveTree: { rootMoves: roots },
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Chapter;
}

function depthOf(rows: PositionMove[], fen: string, move: string): number | undefined {
  return rows.find(r => r.fen === normalizeFen(fen) && r.move === move)?.varDepth;
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function fenAfter(moves: string[]): string {
  const chess = new Chess();
  for (const m of moves) chess.move(m);
  return chess.fen();
}

describe('extractChapterMoves varDepth', () => {
  it('keeps the whole first-child chain at depth 0', () => {
    const rows = extractChapterMoves(makeChapter(buildTree([['e4', 'e5', 'Nf3', 'Nc6']])));

    expect(depthOf(rows, START, 'e4')).toBe(0);
    expect(depthOf(rows, fenAfter(['e4']), 'e5')).toBe(0);
    expect(depthOf(rows, fenAfter(['e4', 'e5']), 'Nf3')).toBe(0);
    expect(depthOf(rows, fenAfter(['e4', 'e5', 'Nf3']), 'Nc6')).toBe(0);
  });

  it('marks a sideline 1 and keeps its own continuation at 1', () => {
    const rows = extractChapterMoves(makeChapter(buildTree([
      ['e4', 'e5', 'Nf3', 'Nc6'],
      ['e4', 'e5', 'Nc3', 'Nf6'],   // sideline at ply 2
    ])));

    expect(depthOf(rows, fenAfter(['e4', 'e5']), 'Nf3')).toBe(0);
    expect(depthOf(rows, fenAfter(['e4', 'e5']), 'Nc3')).toBe(1);
    // The sideline's own main continuation stays at its parent's depth, not 0
    expect(depthOf(rows, fenAfter(['e4', 'e5', 'Nc3']), 'Nf6')).toBe(1);
  });

  it('nests: a sideline of a sideline is 2', () => {
    const rows = extractChapterMoves(makeChapter(buildTree([
      ['e4', 'e5', 'Nf3'],
      ['e4', 'e5', 'Nc3', 'Nf6'],
      ['e4', 'e5', 'Nc3', 'Bc5'],   // second child of a depth-1 node
    ])));

    expect(depthOf(rows, fenAfter(['e4', 'e5', 'Nc3']), 'Nf6')).toBe(1);
    expect(depthOf(rows, fenAfter(['e4', 'e5', 'Nc3']), 'Bc5')).toBe(2);
  });

  it('treats a second root move as a sideline', () => {
    const rows = extractChapterMoves(makeChapter(buildTree([['e4', 'e5'], ['d4', 'd5']])));

    expect(depthOf(rows, START, 'e4')).toBe(0);
    expect(depthOf(rows, START, 'd4')).toBe(1);
  });

  it('emits end-of-line positions with a null move', () => {
    const rows = extractChapterMoves(makeChapter(buildTree([['e4', 'e5']])));

    const leaf = rows.find(r => r.fen === normalizeFen(fenAfter(['e4', 'e5'])));
    expect(leaf).toBeDefined();
    expect(leaf!.move).toBeNull();
  });
});
