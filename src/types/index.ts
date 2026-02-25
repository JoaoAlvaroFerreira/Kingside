/**
 * Type Exports
 */

export type {
  // New hierarchy types
  RepertoireColor,
  OpeningType,
  RepertoireHierarchy,
  OpeningCategory,
  Opening,
  SubVariation,
  Chapter,
  Repertoire,

  // Game types
  UserGame,
  MasterGame,

  // Review types
  ReviewCard,
  ReviewAttempt,

  // Legacy types (for existing screens)
  ChessMove,
  ChessVariation,
  ChessChapter,
  BoardPosition,
  RepertoireViewerState,
} from './repertoire.types';

export { computeFensFromMoves, normalizeFen } from './repertoire.types';

export type {
  // Training types
  Line,
  LineMove,
  LineStats,
  TrainingMode,
  TrainingConfig,
  TrainingSession,
  DrillResult,
  DrillFeedback,
  TrainingDashboardStats,
} from './training.types';

export type {
  // Game Review types
  EngineEvaluation,
  MoveAnalysis,
  KeyMoveReason,
  RepertoireMatchResult,
  MasterGameReference,
  GameReviewSession,
  GameReviewStatus,
  EngineSettings,
  ReviewSettings,
  AnalysisProgress,
} from './gameReview.types';

export type {
  // Screen Settings types
  ScreenSettings,
  AllScreenSettings,
  ScreenKey,
} from './settings.types';
