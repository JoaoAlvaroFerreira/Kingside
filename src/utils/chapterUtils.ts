import { SerializedMoveNode, SerializedMoveTree } from '@utils/MoveTree';

function countNodes(nodes: SerializedMoveNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1 + countNodes(node.children);
  }
  return count;
}

function countLeaves(nodes: SerializedMoveNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.children.length === 0) {
      count++;
    } else {
      count += countLeaves(node.children);
    }
  }
  return count;
}

function maxDepth(nodes: SerializedMoveNode[]): number {
  let max = 0;
  for (const node of nodes) {
    const childDepth = 1 + maxDepth(node.children);
    if (childDepth > max) max = childDepth;
  }
  return max;
}

export interface ChapterStats {
  moves: number;
  lines: number;
  depth: number;
}

export function getChapterStats(moveTreeJson: unknown): ChapterStats {
  try {
    const data = moveTreeJson as SerializedMoveTree;
    const roots = data?.rootMoves || [];
    return {
      moves: countNodes(roots),
      lines: Math.max(countLeaves(roots), roots.length > 0 ? 1 : 0),
      depth: maxDepth(roots),
    };
  } catch {
    return { moves: 0, lines: 0, depth: 0 };
  }
}

export function countMoveTreeNodes(moveTreeJson: unknown): number {
  return getChapterStats(moveTreeJson).moves;
}

export function formatLastStudied(date?: Date): string {
  if (!date) return 'Never';
  const d = new Date(date);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}
