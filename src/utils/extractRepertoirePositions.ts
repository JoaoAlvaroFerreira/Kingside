/**
 * extractRepertoirePositions - Shared utility for building position maps from repertoire chapters.
 * Used by DatabaseService (indexing) and GameReviewService (in-memory fallback / tests).
 */

import { Chess } from 'chess.js';
import { Chapter, normalizeFen } from '@types';
import { MoveTree } from '@utils/MoveTree';

/** Map<moveCount, Map<normalizedFen, Set<nextMoveSAN>>> */
export type PositionMap = Map<number, Map<string, Set<string>>>;

/**
 * Walk a chapter's move tree and extract every reachable position along with
 * the moves playable from it. The key insight: we record (preFen → nextMove)
 * so the game-review matcher can check whether the resulting FEN exists.
 */
export function extractChapterPositions(chapter: Chapter): PositionMap {
  const result: PositionMap = new Map();

  const addPosition = (moveCount: number, normalizedFen: string, nextMove: string) => {
    if (!result.has(moveCount)) result.set(moveCount, new Map());
    const atCount = result.get(moveCount)!;
    if (!atCount.has(normalizedFen)) atCount.set(normalizedFen, new Set());
    atCount.get(normalizedFen)!.add(nextMove);
  };

  const moveTree = MoveTree.fromJSON(chapter.moveTree);
  const allLines: string[][] = [];

  const dfs = (node: any, line: string[]) => {
    if (!node) return;
    const next = [...line, node.san];
    if (!node.children || node.children.length === 0) {
      allLines.push(next);
    } else {
      for (const child of node.children) dfs(child, next);
    }
  };
  for (const root of moveTree.getRootMoves()) dfs(root, []);

  for (const line of allLines) {
    const chess = new Chess();
    for (let i = 0; i < line.length; i++) {
      addPosition(i, normalizeFen(chess.fen()), line[i]);
      try { chess.move(line[i]); } catch { break; }
    }
    // Register the terminal position (line end — no next moves to add, but ensure the fen exists)
    const terminalFen = normalizeFen(chess.fen());
    if (!result.has(line.length)) result.set(line.length, new Map());
    if (!result.get(line.length)!.has(terminalFen)) {
      result.get(line.length)!.set(terminalFen, new Set());
    }
  }

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
