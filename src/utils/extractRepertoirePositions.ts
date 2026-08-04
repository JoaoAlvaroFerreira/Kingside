/**
 * extractRepertoirePositions - Shared utility for building position maps from repertoire chapters.
 * Used by DatabaseService (indexing) and GameReviewService (in-memory fallback / tests).
 */

import { Chess } from 'chess.js';
import { Chapter, normalizeFen } from '@types';
import { MoveNode } from '@utils/MoveTree';

const DEFAULT_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Map<moveCount, Map<normalizedFen, Set<nextMoveSAN>>> */
export type PositionMap = Map<number, Map<string, Set<string>>>;

/**
 * Walk a chapter's move tree and extract every reachable position along with
 * the moves playable from it. The key insight: we record (preFen → nextMove)
 * so the game-review matcher can check whether the resulting FEN exists.
 *
 * Every MoveNode already stores the FEN it leads to (written when the tree was
 * built from PGN), so a node's pre-move position is simply its parent's FEN.
 * This walk therefore needs no chess.js replay at all — earlier versions
 * regenerated and re-validated every move to recompute FENs that were already
 * on disk, which dominated indexing time on large repertoires.
 *
 * chess.js is used only as a fallback for nodes with no stored FEN.
 */
export function extractChapterPositions(chapter: Chapter): PositionMap {
  const result: PositionMap = new Map();

  const addPosition = (moveCount: number, normalizedFen: string, nextMove?: string) => {
    if (!result.has(moveCount)) result.set(moveCount, new Map());
    const atCount = result.get(moveCount)!;
    if (!atCount.has(normalizedFen)) atCount.set(normalizedFen, new Set());
    if (nextMove) atCount.get(normalizedFen)!.add(nextMove);
  };

  const visit = (node: MoveNode, parentFen: string, moveCount: number) => {
    addPosition(moveCount, normalizeFen(parentFen), node.san);

    let fen = node.fen;
    if (!fen) {
      // Legacy or hand-built node without a stored FEN — derive just this one
      try {
        const chess = new Chess(parentFen);
        chess.move(node.san);
        fen = chess.fen();
      } catch {
        // Malformed move — matches prior behavior of stopping this branch early
        return;
      }
    }

    if (!node.children || node.children.length === 0) {
      // Leaf: register the resulting position with no outgoing moves yet
      addPosition(moveCount + 1, normalizeFen(fen));
    } else {
      for (const child of node.children) visit(child, fen, moveCount + 1);
    }
  };

  const rootMoves: MoveNode[] = chapter.moveTree?.rootMoves ?? [];
  const startFen: string = chapter.moveTree?.startFen || DEFAULT_START_FEN;
  for (const root of rootMoves) visit(root, startFen, 0);

  return result;
}

/** Merge `from` into `into` in-place. */
export function mergePositionMaps(into: PositionMap, from: PositionMap): void {
  for (const [moveCount, posAtCount] of from) {
    if (!into.has(moveCount)) into.set(moveCount, new Map());
    const target = into.get(moveCount)!;
    for (const [fen, moves] of posAtCount) {
      if (!target.has(fen)) target.set(fen, new Set());
      for (const move of moves) target.get(fen)!.add(move);
    }
  }
}

export interface ChapterFenMatch {
  repertoireId: string;
  repertoireName: string;
  chapterId: string;
  chapterName: string;
}

// Note: Find Position resolves chapters through the SQLite FEN index
// (DatabaseService.findChaptersByFen), not by building an in-memory index here.
