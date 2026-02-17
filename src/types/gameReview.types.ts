/**
 * Game Review Module - Type Definitions
 */

export interface EngineEvaluation {
  fen: string;
  depth: number;
  score: number;           // In centipawns (positive = white advantage)
  mate?: number;           // Mate in N (positive = white mates)
  bestMove: string;        // UCI format (e4e5)
  bestMoveSan: string;     // SAN format (e5)
  pv: string[];            // Principal variation (UCI)
  lines?: Array<{ score: number; mate?: number; pv: string[] }>;  // Top multipv lines
  timestamp: Date;
}

export interface MoveAnalysis {
  moveIndex: number;
  san: string;
  fen: string;
  preFen: string;
  evalBefore?: EngineEvaluation | null;
  evalAfter?: EngineEvaluation | null;
  evalDelta?: number;      // Change in centipawns (only present if engine is configured)
  isKeyMove: boolean;
  keyMoveReason?: KeyMoveReason;
  repertoireMatch?: RepertoireMatchResult;
  masterGameRefs?: MasterGameReference[];
}

export type KeyMoveReason =
  | 'blunder'              // Large eval loss (configurable threshold)
  | 'mistake'              // Medium eval loss
  | 'inaccuracy'           // Small eval loss
  | 'brilliant'            // Good move in complex position
  | 'repertoire-deviation' // User deviated from repertoire
  | 'opponent-novelty'     // Opponent played move not in repertoire
  | 'transposition';       // Move transposes back into repertoire after deviation

export interface RepertoireMatchResult {
  matched: boolean;
  repertoireId?: string;
  chapterId?: string;
  expectedMoves?: string[];    // What the repertoire suggests
  isUserMove: boolean;
  deviationType?: 'user-misplay' | 'opponent-novelty' | 'coverage-gap';
}

export interface MasterGameReference {
  gameId: string;
  white: string;
  black: string;
  result: string;
  year: number;
  event?: string;
  movePlayed: string;
  frequency: number;        // How often this move appears in master games
}

export interface GameReviewSession {
  id: string;
  gameId: string;
  userColor: 'white' | 'black';   // Which color user is reviewing as (not stored permanently)
  moves: MoveAnalysis[];
  currentMoveIndex: number;
  keyMoveIndices: number[];
  isComplete: boolean;
  followedRepertoire: boolean;  // True if entire game matched repertoire
  startedAt: Date;
  completedAt?: Date;
}

export interface GameReviewStatus {
  gameId: string;
  reviewed: boolean;
  lastReviewDate?: Date;
  keyMovesCount: number;
  followedRepertoire: boolean;
}

export interface EngineSettings {
  moveTime: number;         // Analysis duration in ms (default: 1000)
  depth: number;            // Search depth limit (default: 16)
  threads: number;          // Number of threads (1-4, default: 1)
  multiPV: number;          // Number of principal variations (1-5, default: 3)
}

export interface EvalThresholds {
  blunder: number;          // e.g., 200 centipawns
  mistake: number;          // e.g., 100 centipawns
  inaccuracy: number;       // e.g., 50 centipawns
}

export interface LichessSettings {
  username: string;
  importDaysBack: number;  // Number of days to look back (default 1 for last 24h)
}

export interface ReviewSettings {
  engine: EngineSettings;
  thresholds: EvalThresholds;
  showEvalBar: boolean;
  showBestMove: boolean;
  autoAdvanceDelay: number; // ms, 0 = manual
  lichess: LichessSettings;
}
