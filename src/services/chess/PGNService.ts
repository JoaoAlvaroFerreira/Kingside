/**
 * PGN Service - Parse and manage PGN files with multi-chapter support
 */

import { parse } from '@mliebelt/pgn-parser';
import type { Repertoire, ChessChapter, ChessVariation } from '@types';

export class PGNService {
  /**
   * Parse PGN string into Repertoire with chapters
   */
  public static parseRepertoire(pgnString: string, fileName: string): Repertoire {
    try {
      // Parse PGN - returns array of games
      const parsed = parse(pgnString, { startRule: 'pgn' }) as any[];

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('No games found in PGN');
      }

      const chapters: ChessChapter[] = parsed.map((game, index) => {
        const moves = this.extractMoves(game);
        const headers = game.headers || {};

        return {
          id: `chapter-${index}`,
          name: headers.Opening || headers.Event || `Game ${index + 1}`,
          whiteRepertoire: true, // Default, can be configured later
          variations: [
            {
              moves,
              comment: headers.Annotator,
            },
          ],
        };
      });

      return {
        id: `rep-${Date.now()}`,
        name: fileName.replace('.pgn', ''),
        fileName,
        chapters,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          playerName: parsed[0]?.headers?.White || '',
          event: parsed[0]?.headers?.Event || '',
          date: parsed[0]?.headers?.Date || '',
        },
      };
    } catch (error) {
      console.error('PGN parsing error:', error);
      throw error;
    }
  }

  /**
   * Extract moves from parsed game
   */
  private static extractMoves(game: any): string[] {
    const moves: string[] = [];

    const traverse = (move: any) => {
      if (!move) return;

      // Extract SAN notation from move
      if (move.notation) {
        const san = typeof move.notation === 'string'
          ? move.notation
          : move.notation.notation;
        if (san) {
          moves.push(san);
        }
      }

      // Traverse variations recursively
      if (move.variations && Array.isArray(move.variations)) {
        // For now, skip variations - focus on main line
        // Could enhance later to handle variations
      }

      // Continue to next move
      if (move.next) {
        traverse(move.next);
      }
    };

    // Start traversal from moves array
    if (game.moves && Array.isArray(game.moves)) {
      game.moves.forEach((move: any) => traverse(move));
    }

    return moves;
  }

  /**
   * Export repertoire to PGN
   */
  public static exportToPGN(repertoire: Repertoire): string {
    let pgnString = '';

    repertoire.chapters.forEach((chapter) => {
      pgnString += `[Event "${chapter.name}"]\n`;
      pgnString += `[White "${repertoire.metadata.playerName || ''}"]\n`;
      pgnString += `[Black "Opponent"]\n`;
      pgnString += `[Date "${repertoire.metadata.date || new Date().toISOString().split('T')[0]}"]\n\n`;

      const variation = chapter.variations[0];
      if (variation && variation.moves.length > 0) {
        const formattedMoves = variation.moves.map((move, index) => {
          const moveNumber = Math.floor(index / 2) + 1;
          const isWhiteMove = index % 2 === 0;

          if (isWhiteMove) {
            return `${moveNumber}. ${move}`;
          } else {
            return move;
          }
        }).join(' ');

        pgnString += formattedMoves + '\n\n';
      }
    });

    return pgnString;
  }
}
