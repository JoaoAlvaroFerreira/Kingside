import { MoveTree, MoveNode } from '@utils/MoveTree';

export interface BFSQueueItem {
  fen: string;           // Board position to show (before user's move)
  expectedMove: string;  // SAN move user must play
  moveNumber: number;    // Display move number (e.g., 2 for "2.Nf3")
  isBlackMove: boolean;  // True if this is a black move
  path: string[];        // Moves played to reach this position (for context)
}

interface TraversalEntry {
  node: MoveNode;
  path: string[];        // SAN moves leading to this node's parent position
  halfMoveIndex: number; // 0-indexed ply count of this node
}

function normalizeFenForDedup(fen: string): string {
  // Strip move counters for transposition detection
  return fen.split(' ').slice(0, 4).join(' ');
}

export const BreadthFirstTrainer = {
  buildQueue(moveTree: MoveTree, userColor: 'white' | 'black'): BFSQueueItem[] {
    const rootMoves = moveTree.getRootMoves();
    if (rootMoves.length === 0) return [];

    const result: BFSQueueItem[] = [];
    const visitedDecisions = new Set<string>();

    // Seed BFS with all root-level moves (half-move index 0)
    const queue: TraversalEntry[] = rootMoves.map(node => ({
      node,
      path: [],
      halfMoveIndex: 0,
    }));

    while (queue.length > 0) {
      const { node, path, halfMoveIndex } = queue.shift()!;

      const isWhiteMove = halfMoveIndex % 2 === 0;
      const isUserMove = userColor === 'white' ? isWhiteMove : !isWhiteMove;

      const newPath = [...path, node.san];

      if (isUserMove) {
        const preFen = node.parent ? node.parent.fen : moveTree.getStartFen();
        const dedupeKey = normalizeFenForDedup(preFen) + '|' + node.san;

        if (!visitedDecisions.has(dedupeKey)) {
          visitedDecisions.add(dedupeKey);

          result.push({
            fen: preFen,
            expectedMove: node.san,
            moveNumber: node.moveNumber,
            isBlackMove: node.isBlack,
            path: [...path],
          });
        }
      }

      // Enqueue all children for BFS traversal
      for (const child of node.children) {
        queue.push({
          node: child,
          path: newPath,
          halfMoveIndex: halfMoveIndex + 1,
        });
      }
    }

    return result;
  },
};
