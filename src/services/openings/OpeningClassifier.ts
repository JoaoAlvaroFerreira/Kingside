/**
 * Opening Classifier - Classify openings by ECO code and move patterns
 */

import { OpeningType } from '@types';

interface Classification {
  openingType: OpeningType;
  eco: string;
  name: string;
}

interface ClassifiableGame {
  headers: Record<string, string>;
  moves: any[];
}

export class OpeningClassifier {
  /**
   * Classify an opening based on moves
   * Returns opening type, ECO code (if available), and name
   */
  static classify(moves: string[], eco?: string): Classification {
    if (moves.length === 0) {
      return {
        openingType: 'irregular',
        eco: eco || 'A00',
        name: 'Starting Position',
      };
    }

    const firstMove = moves[0];
    const openingType = this.detectOpeningType(firstMove);
    const name = eco ? this.getNameFromECO(eco) : this.detectName(moves);

    return {
      openingType,
      eco: eco || this.guessECO(moves, openingType),
      name,
    };
  }

  /**
   * Classify a repertoire by majority vote across all games.
   * Skips custom-FEN games first; falls back to FEN-based detection if all are custom.
   */
  static classifyRepertoire(
    games: ClassifiableGame[],
    extractMoves: (game: ClassifiableGame) => string[],
    getEco: (game: ClassifiableGame) => string | undefined,
  ): Classification {
    const standardGames = games.filter(g => !g.headers.FEN);
    const gamesToClassify = standardGames.length > 0 ? standardGames : games;

    const votes: Record<OpeningType, number> = { e4: 0, d4: 0, irregular: 0 };
    let bestClassification: Classification | null = null;

    for (const game of gamesToClassify) {
      const moves = extractMoves(game);
      const eco = getEco(game);
      let openingType: OpeningType;

      if (game.headers.FEN && moves.length > 0) {
        openingType = this.detectOpeningTypeFromFen(game.headers.FEN);
      } else if (moves.length > 0) {
        openingType = this.detectOpeningType(moves[0]);
      } else {
        continue;
      }

      votes[openingType]++;
      if (!bestClassification || votes[openingType] > votes[bestClassification.openingType]) {
        const name = eco ? this.getNameFromECO(eco) : this.detectName(moves);
        bestClassification = {
          openingType,
          eco: eco || this.guessECO(moves, openingType),
          name,
        };
      }
    }

    return bestClassification || {
      openingType: 'irregular',
      eco: 'A00',
      name: 'Starting Position',
    };
  }

  /**
   * Detect opening type from first move
   */
  private static detectOpeningType(firstMove: string): OpeningType {
    // e4 openings
    if (firstMove === 'e4' || firstMove === '1. e4') {
      return 'e4';
    }

    // d4 openings
    if (firstMove === 'd4' || firstMove === '1. d4') {
      return 'd4';
    }

    // Everything else is irregular
    return 'irregular';
  }

  /**
   * Detect opening type from a custom starting FEN by inspecting pawn structure.
   * If the e-pawn has advanced from e2 (white) and d-pawn hasn't, it's an e4 game, etc.
   */
  private static detectOpeningTypeFromFen(fen: string): OpeningType {
    const board = fen.split(' ')[0];
    const ranks = board.split('/');
    // ranks[0] = rank 8, ranks[6] = rank 2, ranks[7] = rank 1

    const pieceAt = (file: number, rank: number): string => {
      const rankStr = ranks[8 - rank];
      let col = 0;
      for (const ch of rankStr) {
        if (col > file) break;
        const skip = parseInt(ch, 10);
        if (!isNaN(skip)) {
          if (file < col + skip) return '';
          col += skip;
        } else {
          if (col === file) return ch;
          col++;
        }
      }
      return '';
    };

    // file indices: e=4, d=3
    const e2 = pieceAt(4, 2); // White e-pawn home square
    const e4 = pieceAt(4, 4); // e4 square
    const d2 = pieceAt(3, 2); // White d-pawn home square
    const d4 = pieceAt(3, 4); // d4 square

    // e-pawn moved to e4 (or beyond) and d-pawn still home → e4 opening
    if (e2 !== 'P' && e4 === 'P') return 'e4';
    // d-pawn moved to d4 (or beyond) and e-pawn still home → d4 opening
    if (d2 !== 'P' && d4 === 'P') return 'd4';
    // Both pawns advanced — use e4 if e-pawn is on e4
    if (e4 === 'P') return 'e4';
    if (d4 === 'P') return 'd4';

    return 'irregular';
  }

  /**
   * Guess ECO code based on moves
   * This is a simplified version - full ECO database integration can come later
   */
  private static guessECO(moves: string[], openingType: OpeningType): string {
    if (openingType === 'e4') {
      // Simplified ECO guessing for e4
      if (moves.length >= 2 && moves[1] === 'e5') {
        return 'C40-C99'; // Open games
      }
      if (moves.length >= 2 && moves[1] === 'c5') {
        return 'B20-B99'; // Sicilian
      }
      return 'B00-C99'; // General e4
    }

    if (openingType === 'd4') {
      // Simplified ECO guessing for d4
      if (moves.length >= 2 && moves[1] === 'd5') {
        return 'D00-D69'; // Closed games
      }
      if (moves.length >= 2 && moves[1] === 'Nf6') {
        return 'D70-E99'; // Indian defenses
      }
      return 'D00-E99'; // General d4
    }

    // Irregular openings
    return 'A00-A39';
  }

  /**
   * Get opening name from ECO code
   * Simplified - full database can be added later using Lichess data
   */
  private static getNameFromECO(eco: string): string {
    // Extract first letter for broad category
    const category = eco.charAt(0);

    switch (category) {
      case 'A':
        return 'Irregular Opening';
      case 'B':
        if (eco >= 'B20') return 'Sicilian Defense';
        return 'Modern Defense';
      case 'C':
        return 'Open Game';
      case 'D':
        return 'Closed Game';
      case 'E':
        return 'Indian Defense';
      default:
        return 'Unknown Opening';
    }
  }

  /**
   * Detect opening name from move patterns
   * Simplified version - can be enhanced with full pattern matching
   */
  private static detectName(moves: string[]): string {
    if (moves.length < 2) {
      return 'Opening';
    }

    const first = moves[0];
    const second = moves[1];

    // e4 openings
    if (first === 'e4') {
      if (second === 'e5') return 'Open Game';
      if (second === 'c5') return 'Sicilian Defense';
      if (second === 'e6') return 'French Defense';
      if (second === 'c6') return 'Caro-Kann Defense';
      if (second === 'd6') return 'Pirc Defense';
      if (second === 'Nf6') return 'Alekhine Defense';
      return 'King\'s Pawn Opening';
    }

    // d4 openings
    if (first === 'd4') {
      if (second === 'd5') return 'Queen\'s Pawn Game';
      if (second === 'Nf6') return 'Indian Defense';
      if (second === 'f5') return 'Dutch Defense';
      if (second === 'e6') return 'Queen\'s Pawn Game';
      return 'Queen\'s Pawn Opening';
    }

    // Irregular
    if (first === 'Nf3') return 'Reti Opening';
    if (first === 'c4') return 'English Opening';
    if (first === 'f4') return 'Bird Opening';
    if (first === 'g3') return 'King\'s Fianchetto Opening';

    return 'Irregular Opening';
  }
}
