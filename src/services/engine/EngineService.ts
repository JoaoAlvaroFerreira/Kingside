/**
 * EngineService - External engine API integration
 */

import { Chess } from 'chess.js';
import { EngineEvaluation } from '@types';

/**
 * Expected response from external engine API
 *
 * API Contract:
 * - Method: POST
 * - URL: Configured endpoint (used exactly as provided)
 * - Request body: { fen: string, depth: number }
 * - Response body: { score: number, mate?: number, bestMove: string, pv: string[] }
 */
interface EngineApiResponse {
  score: number;      // centipawns
  mate?: number;
  bestMove: string;   // UCI format
  pv: string[];
}

export const EngineService = {
  endpoint: '',

  /**
   * Set the engine API endpoint
   */
  setEndpoint(url: string): void {
    this.endpoint = url;
  },

  /**
   * Check if engine is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.endpoint) return false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(this.endpoint, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  },

  /**
   * Analyze a single position
   */
  async analyze(fen: string, depth: number, timeout: number = 10000): Promise<EngineEvaluation | null> {
    if (!this.endpoint) {
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      console.log(`Engine request: POST ${this.endpoint} with depth ${depth}`);

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, depth }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`Engine API error ${response.status}:`, errorText);
        throw new Error(`Engine API error: ${response.status} - ${errorText}`);
      }

      const data: EngineApiResponse = await response.json();

      // Convert UCI move to SAN
      const chess = new Chess(fen);
      const bestMoveSan = this.uciToSan(chess, data.bestMove);

      return {
        fen,
        depth,
        score: data.score,
        mate: data.mate,
        bestMove: data.bestMove,
        bestMoveSan,
        pv: data.pv,
        timestamp: new Date(),
      };
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Engine analysis timeout');
      }
      throw error;
    }
  },

  /**
   * Analyze multiple positions in batch
   */
  async analyzeBatch(positions: string[], depth: number, timeout: number = 10000): Promise<Array<EngineEvaluation | null>> {
    // If no endpoint configured, return array of nulls
    if (!this.endpoint) {
      console.log('Engine not configured, skipping batch analysis');
      return positions.map(() => null);
    }

    const results: Array<EngineEvaluation | null> = [];

    for (const fen of positions) {
      try {
        const eval_ = await this.analyze(fen, depth, timeout);
        results.push(eval_);
      } catch (error) {
        console.warn(`Failed to analyze position ${fen}:`, error);
        // Push null for failed analysis
        results.push(null);
      }
    }

    return results;
  },

  /**
   * Convert UCI move notation to SAN
   */
  uciToSan(chess: Chess, uci: string): string {
    if (!uci || uci.length < 4) return '';

    try {
      const from = uci.substring(0, 2);
      const to = uci.substring(2, 4);
      const promotion = uci.length > 4 ? uci[4] : undefined;

      const move = chess.move({ from, to, promotion });
      if (move) {
        return move.san;
      }
    } catch {
      // Invalid move
    }

    return uci; // Fallback to UCI if conversion fails
  },
};
