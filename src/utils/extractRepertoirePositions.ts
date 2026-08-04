/**
 * extractRepertoirePositions - Shared utility for building position maps from repertoire chapters.
 * Used by DatabaseService (indexing) and GameReviewService (in-memory fallback / tests).
 */

import { Chess } from 'chess.js';
import { Chapter, Repertoire, normalizeFen } from '@types';
import { MoveTree, MoveNode } from '@utils/MoveTree';

/** Map<moveCount, Map<normalizedFen, Set<nextMoveSAN>>> */
export type PositionMap = Map<number, Map<string, Set<string>>>;

/**
 * Walk a chapter's move tree and extract every reachable position along with
 * the moves playable from it. The key insight: we record (preFen → nextMove)
 * so the game-review matcher can check whether the resulting FEN exists.
 *
 * Single DFS over the tree reusing one Chess instance (move/undo) — O(nodes).
 * The previous implementation enumerated every root-to-leaf line separately
 * and replayed each from scratch, which is combinatorial in branching factor
 * and made this take a very long time on deep, branchy repertoires.
 */
export function extractChapterPositions(chapter: Chapter): PositionMap {
  const result: PositionMap = new Map();

  const addPosition = (moveCount: number, normalizedFen: string, nextMove?: string) => {
    if (!result.has(moveCount)) result.set(moveCount, new Map());
    const atCount = result.get(moveCount)!;
    if (!atCount.has(normalizedFen)) atCount.set(normalizedFen, new Set());
    if (nextMove) atCount.get(normalizedFen)!.add(nextMove);
  };

  const moveTree = MoveTree.fromJSON(chapter.moveTree);
  const chess = new Chess();

  const visit = (node: MoveNode, moveCount: number) => {
    addPosition(moveCount, normalizeFen(chess.fen()), node.san);

    try {
      chess.move(node.san);
    } catch {
      // Malformed move — matches prior behavior of stopping this branch early
      return;
    }

    if (!node.children || node.children.length === 0) {
      // Leaf: register the resulting position with no outgoing moves yet
      addPosition(moveCount + 1, normalizeFen(chess.fen()));
    } else {
      for (const child of node.children) visit(child, moveCount + 1);
    }

    chess.undo();
  };

  for (const root of moveTree.getRootMoves()) visit(root, 0);

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

/**
 * Build a chapter-level FEN index across all repertoires: for any normalized
 * FEN, which chapters contain that position anywhere in their move tree.
 */
export function buildChapterFenIndex(repertoires: Repertoire[]): Map<string, ChapterFenMatch[]> {
  const index = new Map<string, ChapterFenMatch[]>();

  for (const repertoire of repertoires) {
    for (const chapter of repertoire.chapters) {
      const positionMap = extractChapterPositions(chapter);
      const chapterFens = new Set<string>();
      for (const posAtCount of positionMap.values()) {
        for (const fen of posAtCount.keys()) chapterFens.add(fen);
      }

      const match: ChapterFenMatch = {
        repertoireId: repertoire.id,
        repertoireName: repertoire.name,
        chapterId: chapter.id,
        chapterName: chapter.name,
      };

      for (const fen of chapterFens) {
        if (!index.has(fen)) index.set(fen, []);
        index.get(fen)!.push(match);
      }
    }
  }

  return index;
}
