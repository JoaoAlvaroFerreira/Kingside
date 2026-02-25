import { MoveTree, MoveNode } from '@utils/MoveTree';
import { SerializedMoveTree } from '@utils/MoveTree';
import { Line, LineMove } from '@types';
import type { RepertoireColor } from '@types';
import { LineExtractor } from './LineExtractor';

export interface LineGeneratorState {
  totalLines: number;
  loadedLines: Line[];
  hasMore(): boolean;
  loadNextBatch(): Line[];
  markCompleted(lineIndex: number): void;
  reset(): void;
}

interface DFSFrame {
  nodes: MoveNode[];
  nodeIndex: number;
  path: LineMove[];
  preFen: string;
  isMainLine: boolean;
  branchPoint: number | null;
  depth: number;
}

export function createLineGenerator(
  moveTreeData: SerializedMoveTree,
  repertoireId: string,
  chapterId: string,
  color: RepertoireColor,
  batchSize: number = 50,
  maxDepth?: number
): LineGeneratorState {
  const depthLimit = maxDepth ?? Infinity;

  let loadedLines: Line[] = [];
  let completedSet = new Set<number>();
  let totalLines = -1;
  let stack: DFSFrame[] = [];
  let exhausted = false;

  // Count total lines with a fast DFS (no line storage)
  function countLeaves(nodes: MoveNode[], depth: number): number {
    if (nodes.length === 0 || depth >= depthLimit) return depth > 0 ? 1 : 0;

    let count = 0;
    for (const node of nodes) {
      if (node.children.length === 0 || depth + 1 >= depthLimit) {
        count += 1;
      } else {
        count += countLeaves(node.children, depth + 1);
      }
    }
    return count;
  }

  function initialize() {
    const tree = MoveTree.fromJSON(moveTreeData);
    const rootMoves = tree.getRootMoves();
    const rootFen = tree.getCurrentFen();

    totalLines = countLeaves(rootMoves, 0);

    // Seed the DFS stack
    if (rootMoves.length > 0) {
      stack = [{
        nodes: rootMoves,
        nodeIndex: 0,
        path: [],
        preFen: rootFen,
        isMainLine: true,
        branchPoint: null,
        depth: 0,
      }];
      exhausted = false;
    } else {
      stack = [];
      exhausted = true;
    }
  }

  // Extract next batch of lines by resuming iterative DFS
  function loadNextBatch(): Line[] {
    if (exhausted) return [];

    const batch: Line[] = [];

    while (stack.length > 0 && batch.length < batchSize) {
      const frame = stack[stack.length - 1];

      if (frame.nodeIndex >= frame.nodes.length) {
        stack.pop();
        continue;
      }

      const node = frame.nodes[frame.nodeIndex];
      const isVariation = frame.nodeIndex > 0;
      const move = LineExtractor.createLineMove(node, frame.preFen, color);
      const currentPath = [...frame.path, move];
      const currentIsMainLine = frame.isMainLine && !isVariation;
      const currentBranchPoint = isVariation
        ? (frame.branchPoint ?? frame.depth)
        : frame.branchPoint;

      frame.nodeIndex++;

      // Leaf or depth limit reached -- emit line
      if (node.children.length === 0 || frame.depth + 1 >= depthLimit) {
        const line = LineExtractor.createLine(
          currentPath,
          repertoireId,
          chapterId,
          currentIsMainLine,
          currentBranchPoint
        );
        batch.push(line);
        loadedLines.push(line);
      } else {
        // Push children frame to continue DFS deeper
        stack.push({
          nodes: node.children,
          nodeIndex: 0,
          path: currentPath,
          preFen: node.fen,
          isMainLine: currentIsMainLine,
          branchPoint: currentBranchPoint,
          depth: frame.depth + 1,
        });
      }
    }

    if (stack.length === 0) {
      exhausted = true;
    }

    return batch;
  }

  function hasMore(): boolean {
    return !exhausted;
  }

  function markCompleted(lineIndex: number): void {
    completedSet.add(lineIndex);

    const uncompleted = loadedLines.filter((_, i) => !completedSet.has(i));
    const threshold = Math.ceil(batchSize * 0.2);

    if (uncompleted.length < threshold && hasMore()) {
      loadNextBatch();
    }
  }

  function reset(): void {
    loadedLines = [];
    completedSet = new Set();
    exhausted = false;
    stack = [];
    initialize();
  }

  initialize();

  return {
    get totalLines() { return totalLines; },
    get loadedLines() { return loadedLines; },
    hasMore,
    loadNextBatch,
    markCompleted,
    reset,
  };
}
