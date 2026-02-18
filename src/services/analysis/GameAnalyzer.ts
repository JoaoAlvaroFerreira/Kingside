/**
 * Game Analyzer - Compare games against repertoire to find deviations
 */

import { Chess } from 'chess.js';
import { UserGame, Repertoire, normalizeFen } from '@types';
import { MoveTree } from '@utils/MoveTree';

export interface Deviation {
  moveNumber: number;
  fen: string;
  played: string;
  expected: string;
  isUserMove: boolean;
  position: 'opening' | 'middlegame' | 'endgame';
}

export const GameAnalyzer = {
  /**
   * Compare a user's game against their repertoire to find deviations
   * A deviation is when the player made a move different from their repertoire
   */
  findDeviations(
    game: UserGame,
    repertoire: Repertoire
  ): Deviation[] {
    const deviations: Deviation[] = [];
    const chess = new Chess();

    // Determine if user was playing white or black
    const isUserWhite = repertoire.color === 'white';

    for (let i = 0; i < game.moves.length; i++) {
      const fen = chess.fen();
      const normalizedFen = normalizeFen(fen);
      const played = game.moves[i];
      const isWhiteMove = i % 2 === 0;
      const isUserMove = isWhiteMove === isUserWhite;

      // Only check user's moves (skip opponent's moves)
      if (!isUserMove) {
        chess.move(played);
        continue;
      }

      // Find the expected move from repertoire at this position
      const expectedMove = this.findRepertoireMove(repertoire, normalizedFen);

      // If there's an expected move and it's different from what was played
      if (expectedMove && expectedMove !== played) {
        deviations.push({
          moveNumber: Math.floor(i / 2) + 1,
          fen: normalizedFen,
          played,
          expected: expectedMove,
          isUserMove,
          position: this.classifyPosition(i),
        });
      }

      chess.move(played);
    }

    return deviations;
  },

  /**
   * Find the repertoire move for a given position
   * Searches through all chapters in the repertoire
   */
  findRepertoireMove(repertoire: Repertoire, fen: string): string | null {
    for (const chapter of repertoire.chapters) {
      const moveTree = MoveTree.fromJSON(chapter.moveTree);
      const move = this.findMoveInTree(moveTree, fen);
      if (move) return move;
    }
    return null;
  },

  /**
   * Recursively search the move tree for a position and return the next move
   */
  findMoveInTree(moveTree: MoveTree, targetFen: string): string | null {
    const startFen = normalizeFen(new Chess().fen());

    // Check if we're looking for the starting position
    if (normalizeFen(targetFen) === startFen) {
      const rootMoves = moveTree.getRootMoves();
      return rootMoves.length > 0 ? rootMoves[0].san : null;
    }

    // Otherwise, search through the tree
    return this.searchNode(moveTree.getRootMoves(), targetFen);
  },

  /**
   * Search through move nodes to find a matching position
   */
  searchNode(nodes: any[], targetFen: string): string | null {
    for (const node of nodes) {
      // Check if parent position matches (we want the move that LEADS FROM this position)
      if (node.parent && normalizeFen(node.parent.fen) === normalizeFen(targetFen)) {
        return node.san;
      }

      // If this node's FEN matches, return the first child move (main line)
      if (normalizeFen(node.fen) === normalizeFen(targetFen)) {
        return node.children.length > 0 ? node.children[0].san : null;
      }

      // Recursively search children
      const result = this.searchNode(node.children, targetFen);
      if (result) return result;
    }

    return null;
  },

  /**
   * Classify position as opening, middlegame, or endgame based on move number
   */
  classifyPosition(moveIndex: number): 'opening' | 'middlegame' | 'endgame' {
    if (moveIndex < 20) return 'opening';
    if (moveIndex < 40) return 'middlegame';
    return 'endgame';
  },

  /**
   * Get a summary of all deviations in a game
   */
  getDeviationSummary(deviations: Deviation[]): string {
    if (deviations.length === 0) {
      return 'Perfect! All moves matched your repertoire.';
    }

    const opening = deviations.filter(d => d.position === 'opening').length;
    const middlegame = deviations.filter(d => d.position === 'middlegame').length;
    const endgame = deviations.filter(d => d.position === 'endgame').length;

    let summary = `Found ${deviations.length} deviation${deviations.length !== 1 ? 's' : ''}`;

    if (opening > 0) summary += `\nOpening: ${opening}`;
    if (middlegame > 0) summary += `\nMiddlegame: ${middlegame}`;
    if (endgame > 0) summary += `\nEndgame: ${endgame}`;

    return summary;
  },
};
