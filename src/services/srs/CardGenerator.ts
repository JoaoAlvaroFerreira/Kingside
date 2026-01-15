/**
 * Card Generator - Creates review cards from repertoire chapters
 * Only generates cards for the user's color (unless position is marked critical)
 */

import { MoveTree, MoveNode } from '@utils/MoveTree';
import { ReviewCard, RepertoireColor, Chapter } from '@types';
import { SM2Service } from './SM2Service';
import { Chess } from 'chess.js';

export const CardGenerator = {
  /**
   * Generate review cards from a chapter
   * Only creates cards for user's moves (unless position is marked critical)
   */
  generateFromChapter(
    chapter: Chapter,
    color: RepertoireColor,
    openingId: string,
    subVariationId: string
  ): ReviewCard[] {
    const tree = MoveTree.fromJSON(chapter.moveTree);
    const cards: ReviewCard[] = [];

    // Traverse tree and create cards for user's moves
    this.traverseTree(tree.getRootMoves(), [], color, (node, context, parentFen) => {
      const isUserMove = this.isUserTurn(node, color);

      // Create card if it's user's move OR if position is marked critical
      if (isUserMove || node.isCritical) {
        cards.push(
          SM2Service.createCard(
            color,
            openingId,
            subVariationId,
            chapter.id,
            parentFen, // FEN before the move
            node.san,
            context.slice(-5), // Last 5 moves for context
            isUserMove,
            node.isCritical || false
          )
        );
      }
    });

    return cards;
  },

  /**
   * Check if this move is the user's turn based on repertoire color
   */
  isUserTurn(node: MoveNode, color: RepertoireColor): boolean {
    // If the node is a black move and user plays black, it's user's turn
    // If the node is a white move and user plays white, it's user's turn
    const isWhiteMove = !node.isBlack;
    return (color === 'white') === isWhiteMove;
  },

  /**
   * Recursively traverse the move tree
   */
  traverseTree(
    nodes: MoveNode[],
    context: string[],
    color: RepertoireColor,
    callback: (node: MoveNode, context: string[], parentFen: string) => void,
    parentFen: string = new Chess().fen()
  ) {
    for (const node of nodes) {
      // Call callback with FEN BEFORE this move
      callback(node, context, parentFen);

      // Add current move to context and continue
      const newContext = [...context, node.san];
      this.traverseTree(node.children, newContext, color, callback, node.fen);
    }
  },
};
