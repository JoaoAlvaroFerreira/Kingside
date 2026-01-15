/**
 * LineExtractor - Extract drilling lines from MoveTree
 *
 * Algorithm:
 * - DFS traversal starting from root moves
 * - First child at each node = main line continuation
 * - Other children = variations (separate lines)
 * - Each complete path from root to leaf/maxDepth = one Line
 * - Result: Main line first, then variations in tree order
 */

import { MoveTree, MoveNode, SerializedMoveTree } from '@/utils/MoveTree';
import { Line, LineMove } from '@types';
import type { RepertoireColor } from '@types';
import { Chess } from 'chess.js';

export const LineExtractor = {
  /**
   * Extract all lines from a MoveTree
   * Returns lines in depth-first order (main line first, then variations)
   */
  extractLines(
    moveTreeData: SerializedMoveTree,
    repertoireId: string,
    chapterId: string,
    color: RepertoireColor,
    maxDepth?: number
  ): Line[] {
    const tree = MoveTree.fromJSON(moveTreeData);
    const lines: Line[] = [];
    const rootFen = tree.getCurrentFen();

    // Start DFS from root
    this.extractLinesRecursive(
      tree.getRootMoves(),
      [],                           // current path
      rootFen,                      // starting FEN
      true,                         // isMainLine
      null,                         // branchPoint
      0,                            // depth
      color,
      repertoireId,
      chapterId,
      maxDepth ?? Infinity,
      lines
    );

    return lines;
  },

  /**
   * Recursive DFS to extract all lines
   */
  extractLinesRecursive(
    nodes: MoveNode[],
    currentPath: LineMove[],
    preFen: string,
    isMainLine: boolean,
    branchPoint: number | null,
    depth: number,
    color: RepertoireColor,
    repertoireId: string,
    chapterId: string,
    maxDepth: number,
    lines: Line[]
  ): void {
    // No more moves or hit depth limit - save current line if non-empty
    if (nodes.length === 0 || depth >= maxDepth) {
      if (currentPath.length > 0) {
        lines.push(
          this.createLine(currentPath, repertoireId, chapterId, isMainLine, branchPoint)
        );
      }
      return;
    }

    // Process first child (main continuation)
    const mainNode = nodes[0];
    const mainMove = this.createLineMove(mainNode, preFen, color);
    const mainPath = [...currentPath, mainMove];

    this.extractLinesRecursive(
      mainNode.children,
      mainPath,
      mainNode.fen,
      isMainLine,
      branchPoint,
      depth + 1,
      color,
      repertoireId,
      chapterId,
      maxDepth,
      lines
    );

    // Process variations (non-first children)
    for (let i = 1; i < nodes.length; i++) {
      const varNode = nodes[i];
      const varMove = this.createLineMove(varNode, preFen, color);
      const varPath = [...currentPath, varMove];
      const varBranchPoint = branchPoint ?? depth; // First branch sets the branch point

      this.extractLinesRecursive(
        varNode.children,
        varPath,
        varNode.fen,
        false,                      // variations are not main line
        varBranchPoint,
        depth + 1,
        color,
        repertoireId,
        chapterId,
        maxDepth,
        lines
      );
    }
  },

  /**
   * Create a LineMove from a MoveNode
   */
  createLineMove(node: MoveNode, preFen: string, color: RepertoireColor): LineMove {
    const isWhiteMove = !node.isBlack;
    const isUserMove = (color === 'white') === isWhiteMove;

    return {
      san: node.san,
      fen: node.fen,
      preFen: preFen,
      isUserMove,
      nodeId: node.id,
      moveNumber: node.moveNumber,
      isBlack: node.isBlack,
      isCritical: node.isCritical,
      comment: node.comment,
    };
  },

  /**
   * Create a Line from a path of moves
   */
  createLine(
    moves: LineMove[],
    repertoireId: string,
    chapterId: string,
    isMainLine: boolean,
    branchPoint: number | null
  ): Line {
    // Generate unique ID from move sequence
    const moveString = moves.map(m => m.san).join('-');
    const id = this.hashString(`${chapterId}-${moveString}`);

    return {
      id,
      repertoireId,
      chapterId,
      moves,
      depth: moves.length,
      isMainLine,
      branchPoint,
    };
  },

  /**
   * Simple string hash for line ID generation
   */
  hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'line_' + Math.abs(hash).toString(36);
  },

  /**
   * Reorder lines for width-first drilling
   * Groups moves by depth level across all lines
   * Returns array of { line, moveIndex } pairs
   */
  orderForWidthFirst(lines: Line[]): Array<{ line: Line; moveIndex: number }> {
    const maxDepth = Math.max(...lines.map(l => l.depth));
    const result: Array<{ line: Line; moveIndex: number }> = [];

    // For each depth level, add all lines that have a move at that depth
    for (let depth = 0; depth < maxDepth; depth++) {
      for (const line of lines) {
        if (depth < line.depth) {
          result.push({ line, moveIndex: depth });
        }
      }
    }

    return result;
  },

  /**
   * Filter lines to only those with user moves (at least one position to test)
   */
  filterLinesWithUserMoves(lines: Line[]): Line[] {
    return lines.filter(line => line.moves.some(move => move.isUserMove));
  },

  /**
   * Get all unique user positions from a line (positions where user needs to find a move)
   */
  getUserPositions(line: Line): LineMove[] {
    return line.moves.filter(move => move.isUserMove);
  },
};
