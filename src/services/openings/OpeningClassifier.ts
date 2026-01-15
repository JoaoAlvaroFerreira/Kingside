/**
 * Opening Classifier - Classify openings by ECO code and move patterns
 */

import { OpeningType } from '@types';

interface Classification {
  openingType: OpeningType;
  eco: string;
  name: string;
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
