/**
 * Chess Service - Wrapper around chess.js for position management
 */

import { Chess } from 'chess.js';

export class ChessService {
  private game: Chess;

  constructor(fen?: string) {
    this.game = new Chess(fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  }

  /**
   * Load a FEN position
   */
  public loadFEN(fen: string): boolean {
    try {
      this.game.load(fen);
      return true;
    } catch (error) {
      console.error('Invalid FEN:', error);
      return false;
    }
  }

  /**
   * Get current FEN
   */
  public getFEN(): string {
    return this.game.fen();
  }

  /**
   * Make a move from SAN notation (e.g., "e4", "Nf3")
   */
  public makeMove(move: string): boolean {
    try {
      const result = this.game.move(move);
      return result !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Undo last move
   */
  public undo(): boolean {
    const result = this.game.undo();
    return result !== null;
  }

  /**
   * Reset to starting position
   */
  public reset(): void {
    this.game.reset();
  }

  /**
   * Get move history as SAN array
   */
  public getHistory(): string[] {
    return this.game.history();
  }

  /**
   * Get current turn ('w' or 'b')
   */
  public getTurn(): 'w' | 'b' {
    return this.game.turn();
  }

  /**
   * Check if game is over
   */
  public isGameOver(): boolean {
    return this.game.isGameOver();
  }

  /**
   * Check if current position is check
   */
  public isCheck(): boolean {
    return this.game.isCheck();
  }

  /**
   * Check if current position is checkmate
   */
  public isCheckmate(): boolean {
    return this.game.isCheckmate();
  }

  /**
   * Check if current position is draw
   */
  public isDraw(): boolean {
    return this.game.isDraw();
  }

  /**
   * Get the board representation
   */
  public getBoard() {
    return this.game.board();
  }

  /**
   * Load moves from SAN array (e.g., ["e4", "c5", "Nf3"])
   */
  public loadMoves(moves: string[]): boolean {
    this.reset();
    for (const move of moves) {
      if (!this.makeMove(move)) {
        console.error('Invalid move in sequence:', move);
        return false;
      }
    }
    return true;
  }

  /**
   * Get FEN at each move in history
   */
  public getPositionHistory(): string[] {
    const history = this.getHistory();
    const positions: string[] = ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'];

    const tempGame = new Chess();
    for (const move of history) {
      tempGame.move(move);
      positions.push(tempGame.fen());
    }

    return positions;
  }
}
