/**
 * Chess Repertoire Type Definitions
 * Fixed 4-Level Hierarchy: Color → Opening Type → Variation → Sub-variation → Chapters
 */

import { Chess } from 'chess.js';

// ============================================
// REPERTOIRE HIERARCHY
// ============================================

export type RepertoireColor = 'white' | 'black';
export type OpeningType = 'e4' | 'd4' | 'irregular';

export interface RepertoireHierarchy {
  white: OpeningCategory[];
  black: OpeningCategory[];
}

export interface OpeningCategory {
  type: OpeningType;              // 'e4', 'd4', or 'irregular'
  variations: Opening[];
}

export interface Opening {
  id: string;
  name: string;                   // e.g., "King's Indian Defense"
  eco: string;                    // ECO code (e.g., "E60-E99")
  subVariations: SubVariation[];
}

export interface SubVariation {
  id: string;
  name: string;                   // e.g., "Saemisch Variation"
  chapters: Chapter[];
}

export interface Chapter {
  id: string;
  name: string;                   // e.g., "Main Line" or game event name
  pgn: string;                    // Full PGN for this chapter
  moveTree: any;                  // Serialized MoveTree (MoveTree.toJSON())
  order: number;                  // Display order within sub-variation
  createdAt: Date;
  updatedAt: Date;
}

export interface Repertoire {
  id: string;
  name: string;
  color: RepertoireColor;         // User-selected during import
  openingType: OpeningType;       // Auto-classified via ECO
  eco: string;
  chapters: Chapter[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// USER GAMES
// ============================================

export interface UserGame {
  id: string;
  pgn: string;
  white: string;
  black: string;
  result: string;                 // '1-0', '0-1', '1/2-1/2', '*'
  date: string;
  event?: string;
  site?: string;
  eco?: string;
  moves: string[];                // SAN moves array
  // NOTE: FENs computed on-demand, not stored (optimize later with hashing)
  importedAt: Date;
}

// Master games stored separately from user games (same structure, different storage)
export type MasterGame = UserGame;

// Helper to compute FENs from moves (used for position matching)
export function computeFensFromMoves(moves: string[]): string[] {
  const chess = new Chess();
  const fens: string[] = [normalizeFen(chess.fen())];
  for (const move of moves) {
    chess.move(move);
    fens.push(normalizeFen(chess.fen()));
  }
  return fens;
}

// Normalize FEN (ignore halfmove and fullmove counters)
export function normalizeFen(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

// ============================================
// SPACED REPETITION
// ============================================

export interface ReviewCard {
  id: string;

  // Location in hierarchy
  color: RepertoireColor;
  openingId: string;
  subVariationId: string;
  chapterId: string;

  // Position data
  fen: string;
  correctMove: string;
  contextMoves: string[];         // Path leading to position (last 5 moves)

  // Training metadata
  isUserMove: boolean;            // Is this testing the user's color?
  isCritical: boolean;            // User-marked important

  // SM-2 fields
  easeFactor: number;             // 2.5 default
  interval: number;               // Days
  repetitions: number;
  nextReviewDate: Date;
  lastReviewDate?: Date;

  // Stats
  totalReviews: number;
  correctCount: number;
}

export interface ReviewAttempt {
  date: Date;
  quality: number; // 0-5 (SM-2 quality rating)
  timeTaken: number; // milliseconds
}

// Legacy types (kept for compatibility with existing screens)
export interface ChessMove {
  san: string;
  from: string;
  to: string;
  promotion?: string;
}

export interface ChessVariation {
  moves: string[];
  comment?: string;
  annotations?: Record<number, string>;
}

export interface ChessChapter {
  id: string;
  name: string;
  whiteRepertoire: boolean;
  variations: ChessVariation[];
}

export interface BoardPosition {
  fen: string;
  moveIndex: number;
  chapterId: string;
  variationIndex: number;
}

export interface RepertoireViewerState {
  currentRepertoire: Repertoire | null;
  currentChapter: ChessChapter | null;
  currentVariation: ChessVariation | null;
  currentPosition: BoardPosition | null;
}
