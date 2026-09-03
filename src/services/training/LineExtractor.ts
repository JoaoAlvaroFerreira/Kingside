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
    maxDepth?: number,
    opponentBranchingOnly?: boolean
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
      lines,
      opponentBranchingOnly ?? false
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
    lines: Line[],
    opponentBranchingOnly: boolean = false
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
      lines,
      opponentBranchingOnly
    );

    // When opponent-only branching is on, skip user-move alternatives
    if (opponentBranchingOnly && nodes.length > 1) {
      const isWhiteMove = !nodes[0].isBlack;
      const isUserMove = (color === 'white') === isWhiteMove;
      if (isUserMove) {
        return; // Skip variations at user-move positions
      }
    }

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
        lines,
        opponentBranchingOnly
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
   * Reorder lines so the front of the list covers as many distinct branches as possible.
   *
   * Extraction is depth-first, so the first lines of a chapter are every continuation of
   * its first branch. A session only drills ACTIVE_BATCH_SIZE lines at a time and that
   * batch is the head of this list — in DFS order, one or two of the opponent's replies
   * drilled to exhaustion while the rest sit in holdback, which is the opposite of what
   * width-first is for. Round-robin across the branches at each ply instead, so a chapter
   * meeting c6/c5/a6/g6/Bf5 puts one line from each of the five at the front.
   */
  orderForWidthFirst(lines: Line[]): Line[] {
    return interleaveBranches(lines, 0);
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

/**
 * Round-robin the lines across the branches they take at a given depth, recursively.
 * Lines sharing a move at this depth stay grouped and are spread out one ply deeper.
 */
function interleaveBranches(lines: Line[], depth: number): Line[] {
  if (lines.length <= 1) return lines;

  const groups: Line[][] = [];
  const byMove = new Map<string, Line[]>();
  let anyMove = false;

  for (const line of lines) {
    const san = line.moves[depth]?.san;
    if (san !== undefined) anyMove = true;
    // A line that has already ended forms its own group rather than joining a branch.
    const key = san ?? '';
    let bucket = byMove.get(key);
    if (!bucket) {
      bucket = [];
      byMove.set(key, bucket);
      groups.push(bucket);
    }
    bucket.push(line);
  }

  if (!anyMove) return lines;                                           // past every line's end
  if (groups.length === 1) return interleaveBranches(lines, depth + 1); // shared prefix

  const ordered = groups.map(group => interleaveBranches(group, depth + 1));
  const result: Line[] = [];
  for (let i = 0; result.length < lines.length; i++) {
    for (const group of ordered) {
      if (i < group.length) result.push(group[i]);
    }
  }
  return result;
}
