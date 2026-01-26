/**
 * StockfishService - Unified facade for engine analysis
 * Delegates to LocalEngineService or external EngineService based on configuration
 */

import { EngineEvaluation } from '@types';
import { LocalEngineService } from './LocalEngineService';
import { EngineService } from './EngineService';

export type EngineType = 'local' | 'external';

export const StockfishService = {
  engineType: 'local' as EngineType,

  /**
   * Set which engine to use
   */
  setEngineType(type: EngineType): void {
    this.engineType = type;
    console.log(`[StockfishService] Engine type set to: ${type}`);
  },

  /**
   * Set external engine endpoint (for 'external' type)
   */
  setExternalEndpoint(url: string): void {
    EngineService.setEndpoint(url);
  },

  /**
   * Check if engine is available
   */
  async isAvailable(): Promise<boolean> {
    if (this.engineType === 'local') {
      return await LocalEngineService.isAvailable();
    } else {
      return await EngineService.isAvailable();
    }
  },

  /**
   * Analyze a single position
   */
  async analyze(
    fen: string,
    depth: number,
    timeout: number = 10000
  ): Promise<EngineEvaluation | null> {
    console.log(`[StockfishService] Analyzing with ${this.engineType} engine, depth ${depth}`);

    if (this.engineType === 'local') {
      return await LocalEngineService.analyze(fen, depth, timeout);
    } else {
      return await EngineService.analyze(fen, depth, timeout);
    }
  },

  /**
   * Analyze multiple positions in batch
   */
  async analyzeBatch(
    positions: string[],
    depth: number,
    timeout: number = 10000
  ): Promise<Array<EngineEvaluation | null>> {
    console.log(`[StockfishService] Batch analyzing ${positions.length} positions with ${this.engineType} engine`);

    if (this.engineType === 'local') {
      return await LocalEngineService.analyzeBatch(positions, depth, timeout);
    } else {
      return await EngineService.analyzeBatch(positions, depth, timeout);
    }
  },

  /**
   * Clear local engine cache (no-op for external)
   */
  clearCache(): void {
    if (this.engineType === 'local') {
      LocalEngineService.clearCache();
    }
  },

  /**
   * Terminate engines
   */
  terminate(): void {
    LocalEngineService.terminate();
  },
};
