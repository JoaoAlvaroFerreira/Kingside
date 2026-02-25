import { MoveTree } from '@utils/MoveTree';
import { countMoveTreeNodes, formatLastStudied } from '@utils/chapterUtils';

describe('countMoveTreeNodes', () => {
  it('returns 0 for an empty tree', () => {
    const tree = new MoveTree();
    expect(countMoveTreeNodes(tree.toJSON())).toBe(0);
  });

  it('counts a linear sequence of moves', () => {
    const tree = new MoveTree();
    tree.addMove('e4');
    tree.addMove('e5');
    tree.addMove('Nf3');
    expect(countMoveTreeNodes(tree.toJSON())).toBe(3);
  });

  it('counts nodes across variations', () => {
    const tree = new MoveTree();
    tree.addMove('e4');
    tree.addMove('e5');

    tree.goBack();
    tree.addMove('c5');

    // e4, e5, c5 = 3 nodes
    expect(countMoveTreeNodes(tree.toJSON())).toBe(3);
  });

  it('counts deeply nested variations', () => {
    const tree = new MoveTree();
    tree.addMove('e4');
    tree.addMove('e5');
    tree.addMove('Nf3');

    tree.goBack();
    tree.goBack();
    tree.addMove('c5');
    tree.addMove('Nf3');

    // Main: e4 -> e5 -> Nf3, variation from e4: c5 -> Nf3 = 5 nodes
    expect(countMoveTreeNodes(tree.toJSON())).toBe(5);
  });

  it('returns 0 for invalid input', () => {
    expect(countMoveTreeNodes(null)).toBe(0);
    expect(countMoveTreeNodes(undefined)).toBe(0);
    expect(countMoveTreeNodes('invalid')).toBe(0);
  });

  it('counts a single move', () => {
    const tree = new MoveTree();
    tree.addMove('d4');
    expect(countMoveTreeNodes(tree.toJSON())).toBe(1);
  });
});

describe('formatLastStudied', () => {
  it('returns "Never" for undefined', () => {
    expect(formatLastStudied(undefined)).toBe('Never');
  });

  it('returns "Never" for no argument', () => {
    expect(formatLastStudied()).toBe('Never');
  });

  it('formats a date as "Mon DD"', () => {
    const date = new Date(2025, 0, 15); // Jan 15, 2025
    expect(formatLastStudied(date)).toBe('Jan 15');
  });

  it('formats different months correctly', () => {
    expect(formatLastStudied(new Date(2025, 5, 3))).toBe('Jun 3');
    expect(formatLastStudied(new Date(2025, 11, 25))).toBe('Dec 25');
  });

  it('handles date strings from JSON deserialization', () => {
    const dateStr = '2025-03-10T00:00:00.000Z' as unknown as Date;
    const result = formatLastStudied(dateStr);
    expect(result).toMatch(/^Mar 10$/);
  });
});
