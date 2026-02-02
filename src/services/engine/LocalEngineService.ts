/**
 * LocalEngineService - Local Stockfish engine integration
 * Uses WASM on web via Web Worker, inline execution on React Native
 */

import { Platform } from 'react-native';
import { Chess } from 'chess.js';
import { EngineEvaluation } from '@types';
import type { StockfishContextType } from './StockfishContext';

interface CacheEntry {
  evaluation: EngineEvaluation;
  timestamp: number;
}

interface UCIMove {
  from: string;
  to: string;
  promotion?: string;
}

class LRUCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  get(key: string): EngineEvaluation | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.evaluation;
  }

  set(key: string, evaluation: EngineEvaluation): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      evaluation,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Web Worker wrapper for Stockfish
 */
class StockfishWorker {
  private worker: Worker | null = null;
  private ready = false;
  private readyPromise: Promise<void>;
  private messageHandlers = new Map<number, (message: string) => void>();
  private messageId = 0;

  constructor() {
    // Don't initialize in constructor to avoid throwing errors at module load time
    this.readyPromise = Promise.resolve();
    console.log('[StockfishWorker] Local Stockfish not available on web. Use External API mode.');
  }

  private async initialize(): Promise<void> {
    if (Platform.OS !== 'web') {
      throw new Error('StockfishWorker only available on web platform');
    }

    // Local Stockfish integration is currently not supported due to complexity
    // with Expo Web's bundler and WASM/Worker loading.
    //
    // To use engine analysis:
    // 1. Set up an external Stockfish API (see docs)
    // 2. Go to Settings → Engine → Select "External API"
    // 3. Enter your API endpoint URL
    //
    // Or run stockfish locally via command line and expose it via HTTP
    throw new Error(
      'Local Stockfish not available. Please use External API mode. ' +
      'Go to Settings → Engine → External API'
    );
  }

  async analyze(fen: string, depth: number, timeout: number = 10000): Promise<EngineEvaluation> {
    // Initialize on first analysis attempt (lazy initialization)
    await this.initialize();

    if (!this.worker) {
      throw new Error('Stockfish worker not initialized');
    }

    return new Promise((resolve, reject) => {
      let bestMove = '';
      let score = 0;
      let mate: number | undefined;
      let pv: string[] = [];

      const timeoutId = setTimeout(() => {
        this.messageHandlers.delete(handlerId);
        reject(new Error('Engine analysis timeout'));
      }, timeout);

      const handler = (message: string) => {
        // Parse info lines
        if (message.startsWith('info') && message.includes('depth')) {
          const depthMatch = message.match(/depth (\d+)/);
          const currentDepth = depthMatch ? parseInt(depthMatch[1]) : 0;

          if (currentDepth >= depth) {
            // Extract score
            const scoreMatch = message.match(/score cp (-?\d+)/);
            const mateMatch = message.match(/score mate (-?\d+)/);

            if (scoreMatch) {
              score = parseInt(scoreMatch[1]);
              mate = undefined;
            } else if (mateMatch) {
              mate = parseInt(mateMatch[1]);
              score = mate > 0 ? 10000 : -10000;
            }

            // Extract PV
            const pvMatch = message.match(/pv (.+)$/);
            if (pvMatch) {
              pv = pvMatch[1].trim().split(' ');
              bestMove = pv[0] || '';
            }
          }
        }

        // Parse bestmove
        if (message.startsWith('bestmove')) {
          const parts = message.split(' ');
          if (parts[1]) {
            bestMove = parts[1];
          }

          clearTimeout(timeoutId);
          this.messageHandlers.delete(handlerId);

          // Convert UCI to SAN
          const chess = new Chess(fen);
          const bestMoveSan = this.uciToSan(chess, bestMove);

          resolve({
            fen,
            depth,
            score,
            mate,
            bestMove,
            bestMoveSan,
            pv,
            timestamp: new Date(),
          });
        }
      };

      const handlerId = this.messageId++;
      this.messageHandlers.set(handlerId, handler);

      // Send commands
      this.worker!.postMessage('ucinewgame');
      this.worker!.postMessage(`position fen ${fen}`);
      this.worker!.postMessage(`go depth ${depth}`);
    });
  }

  private uciToSan(chess: Chess, uci: string): string {
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

    return uci;
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.messageHandlers.clear();
  }
}

/**
 * React Native native Stockfish execution via @loloof64/react-native-stockfish
 * Uses UCI protocol and bridges to context-based hook implementation
 */
class StockfishNative {
  private contextRef: { current: StockfishContextType | null } = { current: null };
  private analysisCallbacks = new Map<string, {
    resolve: (value: EngineEvaluation) => void;
    reject: (reason: Error) => void;
    timeoutId: NodeJS.Timeout;
    bestMove: string;
    score: number;
    mate: number | undefined;
    pv: string[];
  }>();

  /**
   * Set the Stockfish context reference
   * Must be called after StockfishProvider is mounted
   */
  setContext(context: StockfishContextType): void {
    this.contextRef.current = context;
    console.log('[StockfishNative] Context initialized, ready:', context.isReady);
  }

  async initialize(): Promise<void> {
    // Initialization happens in StockfishProvider
    // Just wait for context to be ready
    if (!this.contextRef.current) {
      throw new Error('StockfishNative context not set. Call setContext() first.');
    }

    console.log('[StockfishNative] Waiting for engine to be ready...');
    console.log('[StockfishNative] Current isReady status:', this.contextRef.current.isReady);

    // Wait for engine to be ready
    let attempts = 0;
    while (!this.contextRef.current.isReady && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;

      if (attempts % 10 === 0) {
        console.log(`[StockfishNative] Still waiting... (${attempts * 100}ms elapsed)`);
      }
    }

    if (!this.contextRef.current.isReady) {
      console.error('[StockfishNative] Engine failed to initialize after 5 seconds');
      throw new Error('Stockfish engine failed to initialize');
    }

    console.log('[StockfishNative] ✓ Engine ready');
  }

  async analyze(fen: string, depth: number, timeout: number = 10000): Promise<EngineEvaluation> {
    if (!this.contextRef.current) {
      throw new Error('StockfishNative context not set');
    }

    if (!this.contextRef.current.isReady) {
      await this.initialize();
    }

    const analysisId = `${fen}:${depth}:${Date.now()}`;
    console.log('[StockfishNative] Starting analysis:', analysisId);

    return new Promise<EngineEvaluation>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        console.log('[StockfishNative] Analysis timeout:', analysisId);
        this.contextRef.current?.unregisterListener(analysisId);
        this.analysisCallbacks.delete(analysisId);

        // Return partial data if we have it
        const partial = this.analysisCallbacks.get(analysisId);
        if (partial && partial.bestMove) {
          const chess = new Chess(fen);
          const bestMoveSan = this.uciToSan(chess, partial.bestMove);

          resolve({
            fen,
            depth,
            score: partial.score,
            mate: partial.mate,
            bestMove: partial.bestMove,
            bestMoveSan,
            pv: partial.pv,
            timestamp: new Date(),
          });
        } else {
          reject(new Error('Engine analysis timeout'));
        }
      }, timeout);

      // Initialize analysis state
      this.analysisCallbacks.set(analysisId, {
        resolve,
        reject,
        timeoutId,
        bestMove: '',
        score: 0,
        mate: undefined,
        pv: [],
      });

      // Register UCI output listener
      this.contextRef.current.registerListener(analysisId, (line: string) => {
        this.parseUCIOutput(line, analysisId, fen, depth);
      });

      // Send UCI commands
      this.contextRef.current.sendCommand('ucinewgame');
      this.contextRef.current.sendCommand(`position fen ${fen}`);
      this.contextRef.current.sendCommand(`go depth ${depth}`);
    });
  }

  private parseUCIOutput(line: string, analysisId: string, fen: string, targetDepth: number): void {
    const state = this.analysisCallbacks.get(analysisId);
    if (!state) return;

    // Parse info lines
    if (line.startsWith('info') && line.includes('depth')) {
      const depthMatch = line.match(/depth (\d+)/);
      const currentDepth = depthMatch ? parseInt(depthMatch[1]) : 0;

      if (currentDepth >= targetDepth) {
        // Extract score
        const scoreMatch = line.match(/score cp (-?\d+)/);
        const mateMatch = line.match(/score mate (-?\d+)/);

        if (scoreMatch) {
          state.score = parseInt(scoreMatch[1]);
          state.mate = undefined;
        } else if (mateMatch) {
          state.mate = parseInt(mateMatch[1]);
          state.score = state.mate > 0 ? 10000 : -10000;
        }

        // Extract PV
        const pvMatch = line.match(/pv (.+)$/);
        if (pvMatch) {
          state.pv = pvMatch[1].trim().split(' ');
          if (state.pv.length > 0) {
            state.bestMove = state.pv[0];
          }
        }
      }
    }

    // Parse bestmove
    if (line.startsWith('bestmove')) {
      const parts = line.split(' ');
      if (parts[1]) {
        state.bestMove = parts[1];
      }

      clearTimeout(state.timeoutId);
      this.contextRef.current?.unregisterListener(analysisId);
      this.analysisCallbacks.delete(analysisId);

      // Convert UCI to SAN
      const chess = new Chess(fen);
      const bestMoveSan = this.uciToSan(chess, state.bestMove);

      console.log('[StockfishNative] Analysis complete:', {
        analysisId,
        bestMove: state.bestMove,
        bestMoveSan,
        score: state.score,
        mate: state.mate,
      });

      state.resolve({
        fen,
        depth: targetDepth,
        score: state.score,
        mate: state.mate,
        bestMove: state.bestMove,
        bestMoveSan,
        pv: state.pv,
        timestamp: new Date(),
      });
    }
  }

  private uciToSan(chess: Chess, uci: string): string {
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

    return uci;
  }

  terminate(): void {
    // Clear all pending analyses
    this.analysisCallbacks.forEach(state => {
      clearTimeout(state.timeoutId);
      state.reject(new Error('Engine terminated'));
    });
    this.analysisCallbacks.clear();
  }
}

export const LocalEngineService = {
  cache: new LRUCache(1000),
  engine: Platform.OS === 'web' ? new StockfishWorker() : new StockfishNative(),
  initialized: false,

  /**
   * Initialize the StockfishNative with context reference
   * Must be called from App.tsx after StockfishProvider is mounted
   */
  initializeWithContext(context: StockfishContextType): void {
    if (this.engine instanceof StockfishNative) {
      this.engine.setContext(context);
      console.log('[LocalEngineService] Context initialized');
    }
  },

  /**
   * Initialize the local engine
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      if (Platform.OS === 'web') {
        // Already initialized in constructor
        this.initialized = true;
      } else {
        await this.engine.initialize();
        this.initialized = true;
      }
    } catch (error) {
      console.error('Failed to initialize local engine:', error);
      throw error;
    }
  },

  /**
   * Check if engine is available
   */
  async isAvailable(): Promise<boolean> {
    if (Platform.OS === 'web') {
      // Web still not supported (WASM complexity)
      return false;
    }

    // Native platforms supported via @loloof64/react-native-stockfish
    try {
      await this.initialize();
      return this.initialized;
    } catch {
      return false;
    }
  },

  /**
   * Analyze a single position
   */
  async analyze(fen: string, depth: number, timeout: number = 10000): Promise<EngineEvaluation | null> {
    // Check cache first
    const cacheKey = `${fen}:${depth}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log('[LocalEngine] Cache hit:', cacheKey);
      return cached;
    }

    try {
      await this.initialize();
      const evaluation = await this.engine.analyze(fen, depth, timeout);

      // Cache result
      this.cache.set(cacheKey, evaluation);

      return evaluation;
    } catch (error) {
      console.error('[LocalEngine] Analysis failed:', error);
      return null;
    }
  },

  /**
   * Analyze multiple positions in batch with concurrency
   * On mobile, analyzes 2 positions concurrently to avoid overwhelming CPU
   */
  async analyzeBatch(
    positions: string[],
    depth: number,
    timeout: number = 10000
  ): Promise<Array<EngineEvaluation | null>> {
    const concurrency = Platform.OS === 'web' ? 1 : 2; // Mobile can handle 2 concurrent
    const results = new Array<EngineEvaluation | null>(positions.length).fill(null);
    const queue = [...positions.entries()];
    const inProgress = new Set<Promise<void>>();

    while (queue.length > 0 || inProgress.size > 0) {
      // Start new analyses up to concurrency limit
      while (queue.length > 0 && inProgress.size < concurrency) {
        const [index, fen] = queue.shift()!;
        const promise = this.analyze(fen, depth, timeout)
          .then(eval_ => {
            results[index] = eval_;
          })
          .catch(error => {
            console.warn(`[LocalEngine] Failed to analyze position ${fen}:`, error);
            results[index] = null;
          })
          .finally(() => {
            inProgress.delete(promise);
          });
        inProgress.add(promise);
      }

      // Wait for at least one to complete
      if (inProgress.size > 0) {
        await Promise.race(inProgress);
      }
    }

    return results;
  },

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  },

  /**
   * Terminate the engine
   */
  terminate(): void {
    if (this.engine) {
      this.engine.terminate();
    }
    this.initialized = false;
  },
};
