/**
 * Test helpers for GameReviewService tests
 */

import { MoveTree } from '@utils/MoveTree';
import { Repertoire, Chapter } from '@types';

/**
 * Build a MoveTree from a sequence of moves
 * Example: buildMoveTreeFromMoves(['e4', 'e5', 'Nf3', 'Nc6'])
 */
export function buildMoveTreeFromMoves(moves: string[]): MoveTree {
  const moveTree = new MoveTree();

  for (const move of moves) {
    const success = moveTree.addMove(move);
    if (!success) {
      throw new Error(`Failed to add move "${move}" to MoveTree`);
    }
  }

  // Reset to start position after building
  moveTree.goToStart();

  return moveTree;
}

/**
 * Build a MoveTree with variations
 * Example:
 * buildMoveTreeWithVariations([
 *   ['e4', 'e5', 'Nf3'],      // Main line
 *   ['e4', 'e5', 'Bc4'],      // Variation at move 3
 *   ['e4', 'c5', 'Nf3']       // Variation at move 2
 * ])
 */
export function buildMoveTreeWithVariations(lines: string[][]): MoveTree {
  const moveTree = new MoveTree();

  for (const line of lines) {
    // Reset to start for each line
    moveTree.goToStart();

    // Add moves from this line
    for (const move of line) {
      moveTree.addMove(move);
    }
  }

  // Reset to start after building
  moveTree.goToStart();

  return moveTree;
}

/**
 * Create a test repertoire from a list of move sequences
 */
export function createTestRepertoire(
  name: string,
  color: 'white' | 'black',
  lines: string[][]
): Repertoire {
  const chapters: Chapter[] = lines.map((moves, index) => {
    const moveTree = buildMoveTreeFromMoves(moves);

    return {
      id: `chapter_${index}`,
      name: `Line ${index + 1}`,
      pgn: moves.join(' '), // Simplified PGN for tests
      moveTree: moveTree.toJSON(),
      order: index,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  return {
    id: `repertoire_${name}`,
    name,
    color,
    openingType: 'e4',
    eco: 'A00',
    chapters,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Create a test repertoire with variations in a single chapter
 */
export function createTestRepertoireWithVariations(
  name: string,
  color: 'white' | 'black',
  lines: string[][]
): Repertoire {
  const moveTree = buildMoveTreeWithVariations(lines);

  const chapter: Chapter = {
    id: 'chapter_variations',
    name: 'Variations',
    pgn: lines.flat().join(' '), // Simplified PGN for tests
    moveTree: moveTree.toJSON(),
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    id: `repertoire_${name}`,
    name,
    color,
    openingType: 'e4',
    eco: 'A00',
    chapters: [chapter],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
