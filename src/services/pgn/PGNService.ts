/**
 * PGN Service - Parse PGN files and convert to internal types
 */

import { parse } from '@mliebelt/pgn-parser';
import { UserGame } from '@types';
import { MoveTree, MoveNode } from '@utils/MoveTree';

interface ParsedGame {
  headers: Record<string, string>;
  moves: any[];
}

export class PGNService {
  /**
   * Parse PGN string into array of games
   * Note: Validation skipped for now, to be implemented properly later
   */
  static parseMultipleGames(pgnString: string): ParsedGame[] {
    try {
      // Clean input: strip BOM and trim
      let cleanPgn = pgnString.replace(/^\uFEFF/, '').trim();

      // Check if input is just moves (no headers)
      const hasHeaders = /^\[/.test(cleanPgn);

      if (!hasHeaders) {
        // Wrap moves in minimal PGN structure
        cleanPgn = `[Event "?"]\n[Site "?"]\n[Date "????.??.??"]\n[Round "?"]\n[White "?"]\n[Black "?"]\n[Result "*"]\n\n${cleanPgn} *`;
      }

      // Try parsing with 'games' startRule which handles multiple games
      let parsed: any;
      try {
        parsed = parse(cleanPgn, { startRule: 'games' });
      } catch (e) {
        // If 'games' fails, try 'pgn' for backwards compatibility
        parsed = parse(cleanPgn, { startRule: 'pgn' });
      }

      // Ensure parsed is an array
      const gamesArray = Array.isArray(parsed) ? parsed : [parsed];

      if (gamesArray.length === 0) {
        throw new Error('No games found in PGN');
      }

      return gamesArray.map(game => {
        // Parser uses 'tags' not 'headers'
        const rawTags = game.tags || game.headers || {};

        // Normalize tags: convert Date object to string if needed
        const normalizedHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(rawTags)) {
          if (key === 'Date' && typeof value === 'object' && value !== null && 'value' in value) {
            // Date is an object like { value: "2025.01.04", year: 2025, month: 1, day: 4 }
            normalizedHeaders[key] = (value as any).value;
          } else if (typeof value === 'string') {
            normalizedHeaders[key] = value;
          } else if (value !== null && value !== undefined) {
            normalizedHeaders[key] = String(value);
          }
        }

        return {
          headers: normalizedHeaders,
          moves: game.moves || [],
        };
      });
    } catch (error) {
      console.error('PGN parsing error:', error);
      throw error;
    }
  }

  /**
   * Convert parsed game to UserGame format
   */
  static toUserGame(parsed: ParsedGame): Omit<UserGame, 'id' | 'pgn' | 'importedAt'> {
    const moves = this.extractMoves(parsed.moves);

    return {
      white: parsed.headers.White || 'Unknown',
      black: parsed.headers.Black || 'Unknown',
      result: parsed.headers.Result || '*',
      date: parsed.headers.Date || new Date().toISOString().split('T')[0],
      event: parsed.headers.Event,
      eco: parsed.headers.ECO,
      moves,
    };
  }

  /**
   * Convert parsed game to MoveTree (with variations)
   */
  static toMoveTree(parsed: ParsedGame): MoveTree {
    const moveTree = new MoveTree();

    // Process the moves with variations
    this.buildMoveTree(parsed.moves, moveTree);

    // Reset to start position
    moveTree.goToStart();

    const flatMoves = moveTree.getFlatMoves();
    const variationCount = flatMoves.filter(m => m.isVariationStart).length;
    console.log('PGNService.toMoveTree: Built tree with', flatMoves.length, 'total moves,', variationCount, 'variations');

    return moveTree;
  }

  /**
   * Recursively build MoveTree from parsed moves (including variations)
   */
  private static buildMoveTree(movesArray: any[], moveTree: MoveTree, _startFromCurrent: boolean = false): void {
    if (!movesArray || movesArray.length === 0) return;

    // Track where we started for this sequence
    const _startingNode = moveTree.getCurrentNode();

    const processMoveSequence = (move: any) => {
      if (!move) return;

      // Extract and add the move
      if (move.notation) {
        const san = typeof move.notation === 'string'
          ? move.notation
          : move.notation.notation;

        if (san) {
          moveTree.addMove(san);

          const currentNode = moveTree.getCurrentNode();
          if (currentNode) {
            if (move.commentAfter) {
              const trimmed = move.commentAfter.trim();
              currentNode.comment = trimmed || undefined;
            }
            if (move.commentDiag) {
              this.parseCommentDiag(currentNode, move.commentDiag);
            }
          }
        }
      }

      // Process variations (RAVs) at this point
      if (move.variations && Array.isArray(move.variations)) {
        for (const variation of move.variations) {
          // Save current position
          const currentNode = moveTree.getCurrentNode();

          // Go back to the position before this move to add variation
          if (currentNode?.parent) {
            moveTree.navigateToNode(currentNode.parent.id);
          }

          // Process the variation
          this.buildMoveTree(variation, moveTree, true);

          // Return to the main line position
          if (currentNode) {
            moveTree.navigateToNode(currentNode.id);
          }
        }
      }

      // Continue to next move in main line
      if (move.next) {
        processMoveSequence(move.next);
      }
    };

    // Process all moves in the array
    movesArray.forEach(move => processMoveSequence(move));
  }

  /**
   * Extract SAN moves from parsed game tree (main line only)
   */
  private static extractMoves(movesArray: any[]): string[] {
    const moves: string[] = [];

    const traverse = (move: any) => {
      if (!move) return;

      // Extract SAN notation
      if (move.notation) {
        const san = typeof move.notation === 'string'
          ? move.notation
          : move.notation.notation;
        if (san) {
          moves.push(san);
        }
      }

      // Continue to next move (main line only, skip variations for now)
      if (move.next) {
        traverse(move.next);
      }
    };

    // Start traversal
    if (Array.isArray(movesArray)) {
      movesArray.forEach((move: any) => traverse(move));
    }

    return moves;
  }

  /**
   * Extract Lichess-style annotations from the parser's commentDiag object
   */
  private static parseCommentDiag(node: MoveNode, diag: any): void {
    if (diag.eval !== undefined) {
      if (typeof diag.eval === 'string' && diag.eval.startsWith('#')) {
        node.evalMate = parseInt(diag.eval.substring(1), 10);
      } else {
        node.eval = Math.round(Number(diag.eval) * 100);
      }
    }

    if (diag.clk) {
      const parts = String(diag.clk).split(':');
      if (parts.length === 3) {
        node.clock = parseInt(parts[0], 10) * 3600
          + parseInt(parts[1], 10) * 60
          + parseInt(parts[2], 10);
      }
    }
  }

  /**
   * Extract opening name from headers
   */
  static getOpeningName(parsed: ParsedGame): string | undefined {
    return parsed.headers.Opening || parsed.headers.Event;
  }

  /**
   * Extract ECO code from headers
   */
  static getECO(parsed: ParsedGame): string | undefined {
    return parsed.headers.ECO;
  }

  /**
   * Reconstruct PGN string from parsed game
   */
  static toPGNString(parsed: ParsedGame): string {
    const lines: string[] = [];

    // Add headers
    const headers = parsed.headers || {};
    const headerKeys = Object.keys(headers);

    if (headerKeys.length > 0) {
      for (const key of headerKeys) {
        lines.push(`[${key} "${headers[key]}"]`);
      }
      lines.push(''); // Empty line after headers
    }

    // Add moves
    const moves = this.extractMoves(parsed.moves);
    if (moves.length > 0) {
      const moveText = moves.map((move, index) => {
        const moveNumber = Math.floor(index / 2) + 1;
        const isWhiteMove = index % 2 === 0;
        return isWhiteMove ? `${moveNumber}. ${move}` : move;
      }).join(' ');
      lines.push(moveText);
    }

    // Add result
    const result = headers.Result || '*';
    lines.push(result);

    return lines.join('\n');
  }
}
