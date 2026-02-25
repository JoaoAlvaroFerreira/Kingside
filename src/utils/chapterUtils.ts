import { MoveTree, SerializedMoveNode } from '@utils/MoveTree';

function countNodes(nodes: SerializedMoveNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1 + countNodes(node.children);
  }
  return count;
}

export function countMoveTreeNodes(moveTreeJson: unknown): number {
  try {
    const tree = MoveTree.fromJSON(moveTreeJson as any);
    const serialized = tree.toJSON();
    return countNodes(serialized.rootMoves);
  } catch {
    return 0;
  }
}

export function formatLastStudied(date?: Date): string {
  if (!date) return 'Never';
  const d = new Date(date);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}
