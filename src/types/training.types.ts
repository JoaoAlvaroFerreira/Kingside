/**
 * Training Module Type Definitions
 * Line-based drilling with SM-2 scheduling per line
 */

import { RepertoireColor } from './repertoire.types';

// ============================================
// LINE STRUCTURES
// ============================================

/**
 * A single move within a drilling line
 */
export interface LineMove {
  san: string;
  fen: string;                    // Position AFTER this move
  preFen: string;                 // Position BEFORE this move (for testing)
  isUserMove: boolean;            // Does user need to find this move?
  nodeId: string;                 // Reference to MoveTree node
  moveNumber: number;
  isBlack: boolean;
  isCritical?: boolean;
  comment?: string;
}

/**
 * A complete drilling line - path from root to leaf/terminal
 */
export interface Line {
  id: string;                     // Unique hash of move sequence
  repertoireId: string;
  chapterId: string;
  moves: LineMove[];
  depth: number;                  // Total ply count
  isMainLine: boolean;            // True if all first children
  branchPoint: number | null;     // Ply where this branches from main line
}

// ============================================
// SM-2 PER-LINE TRACKING
// ============================================

/**
 * SM-2 statistics tracked per line
 */
export interface LineStats {
  lineId: string;
  repertoireId: string;
  chapterId: string;

  // SM-2 fields
  easeFactor: number;             // Default 2.5
  interval: number;               // Days until next review
  repetitions: number;            // Successful consecutive reviews
  nextReviewDate: Date;
  lastReviewDate?: Date;

  // Performance stats
  totalDrills: number;
  correctCount: number;           // Positions answered correctly first try
  mistakeCount: number;           // Positions where user made errors
}

// ============================================
// TRAINING SESSION
// ============================================

export type TrainingMode = 'depth-first' | 'width-first';

/**
 * Configuration for starting a training session
 */
export interface TrainingConfig {
  repertoireId: string;
  chapterId?: string;             // Optional: drill specific chapter only
  mode: TrainingMode;
  maxDepth?: number;              // Optional: limit drilling depth
  includeOnlyDueLines?: boolean;  // Filter to lines due for review
}

/**
 * Current training session state
 */
export interface TrainingSession {
  id: string;
  repertoireId: string;
  chapterId: string | null;       // null = all chapters
  color: RepertoireColor;         // Which side user plays
  mode: TrainingMode;
  maxDepth: number | null;        // null = no limit

  // Lines to drill
  lines: Line[];
  currentLineIndex: number;
  currentMoveIndex: number;       // Index within current line's user moves

  // Width-first specific
  currentDepth: number;           // Current depth being drilled
  lineProgress: Record<string, number>;  // lineId -> last completed move index

  // Session stats
  linesCompleted: number;
  totalMistakes: number;
  startedAt: Date;

  // State flags
  isComplete: boolean;
  awaitingRating: boolean;        // Waiting for user to rate completed line
}

// ============================================
// DRILL RESULTS
// ============================================

export type DrillFeedback =
  | 'correct'
  | 'incorrect'
  | 'line-complete'
  | 'session-complete';

/**
 * Result of processing a user move during training
 */
export interface DrillResult {
  isCorrect: boolean;
  expectedMove: string;
  userMove: string;
  feedback: DrillFeedback;
  nextPosition?: {
    fen: string;
    isUserTurn: boolean;
  };
  opponentMove?: string;          // Move to auto-play
  opponentFen?: string;           // FEN after opponent move
}

// ============================================
// DASHBOARD STATS
// ============================================

/**
 * Aggregate stats for training dashboard
 */
export interface TrainingDashboardStats {
  repertoireId: string;
  totalLines: number;
  linesDue: number;
  linesLearned: number;           // Lines with at least 1 successful review
  averageEaseFactor: number;
  completionPercent: number;      // linesLearned / totalLines * 100
}
