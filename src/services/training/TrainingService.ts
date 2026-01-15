/**
 * TrainingService - Session management and move processing for line drilling
 */

import { Chess } from 'chess.js';
import {
  TrainingConfig,
  TrainingSession,
  Line,
  LineMove,
  LineStats,
  DrillResult,
  DrillFeedback,
} from '@types';
import { Repertoire } from '@types';
import { LineExtractor } from './LineExtractor';
import { SM2Service } from '@services/srs/SM2Service';

export const TrainingService = {
  /**
   * Start a new training session from config
   */
  startSession(
    config: TrainingConfig,
    repertoire: Repertoire,
    allLineStats: LineStats[]
  ): TrainingSession {
    // Extract lines from all chapters (or specific chapter if specified)
    const chapters = config.chapterId
      ? repertoire.chapters.filter(ch => ch.id === config.chapterId)
      : repertoire.chapters;

    let allLines: Line[] = [];
    for (const chapter of chapters) {
      const lines = LineExtractor.extractLines(
        chapter.moveTree,
        repertoire.id,
        chapter.id,
        repertoire.color,
        config.maxDepth
      );
      allLines = allLines.concat(lines);
    }

    // Filter to only lines with user moves
    allLines = LineExtractor.filterLinesWithUserMoves(allLines);

    // Filter to due lines if requested
    if (config.includeOnlyDueLines) {
      const now = new Date();
      const dueLineIds = new Set(
        allLineStats
          .filter(stat => new Date(stat.nextReviewDate) <= now)
          .map(stat => stat.lineId)
      );
      allLines = allLines.filter(line => dueLineIds.has(line.id));
    }

    // Order lines based on mode
    const orderedLines = config.mode === 'width-first'
      ? allLines // Width-first ordering handled during session progression
      : allLines; // Depth-first is natural order from extraction

    return {
      id: this.generateSessionId(),
      repertoireId: repertoire.id,
      chapterId: config.chapterId ?? null,
      color: repertoire.color,
      mode: config.mode,
      maxDepth: config.maxDepth ?? null,
      lines: orderedLines,
      currentLineIndex: 0,
      currentMoveIndex: 0,
      currentDepth: 0,
      lineProgress: {},
      linesCompleted: 0,
      totalMistakes: 0,
      startedAt: new Date(),
      isComplete: false,
      awaitingRating: false,
    };
  },

  /**
   * Process a user move during training
   */
  processUserMove(session: TrainingSession, from: string, to: string): DrillResult {
    const currentLine = session.lines[session.currentLineIndex];
    if (!currentLine) {
      return {
        isCorrect: false,
        expectedMove: '',
        userMove: '',
        feedback: 'session-complete',
      };
    }

    // Get user positions in the current line
    const userMoves = currentLine.moves.filter(m => m.isUserMove);
    const currentUserMove = userMoves[session.currentMoveIndex];

    if (!currentUserMove) {
      return {
        isCorrect: false,
        expectedMove: '',
        userMove: '',
        feedback: 'line-complete',
      };
    }

    // Validate the move
    const chess = new Chess(currentUserMove.preFen);
    let move;
    try {
      move = chess.move({ from, to, promotion: 'q' });
      if (!move) {
        return {
          isCorrect: false,
          expectedMove: currentUserMove.san,
          userMove: `${from}${to}`,
          feedback: 'incorrect',
        };
      }
    } catch {
      return {
        isCorrect: false,
        expectedMove: currentUserMove.san,
        userMove: `${from}${to}`,
        feedback: 'incorrect',
      };
    }

    // Check if move matches expected move
    const isCorrect = move.san === currentUserMove.san;

    if (!isCorrect) {
      session.totalMistakes++;
      return {
        isCorrect: false,
        expectedMove: currentUserMove.san,
        userMove: move.san,
        feedback: 'incorrect',
      };
    }

    // Move is correct - check what comes next
    const currentMoveIndexInLine = currentLine.moves.findIndex(
      m => m.nodeId === currentUserMove.nodeId
    );

    const nextMoveInLine = currentLine.moves[currentMoveIndexInLine + 1];

    if (!nextMoveInLine) {
      // Line is complete
      return {
        isCorrect: true,
        expectedMove: currentUserMove.san,
        userMove: move.san,
        feedback: 'line-complete',
      };
    }

    if (nextMoveInLine.isUserMove) {
      // Next move is also user's turn (shouldn't happen in normal chess, but handle it)
      return {
        isCorrect: true,
        expectedMove: currentUserMove.san,
        userMove: move.san,
        feedback: 'correct',
        nextPosition: {
          fen: nextMoveInLine.preFen,
          isUserTurn: true,
        },
      };
    } else {
      // Next move is opponent's - return it for auto-play
      return {
        isCorrect: true,
        expectedMove: currentUserMove.san,
        userMove: move.san,
        feedback: 'correct',
        opponentMove: nextMoveInLine.san,
        opponentFen: nextMoveInLine.fen,
        nextPosition: this.getNextUserPosition(session, currentMoveIndexInLine + 2),
      };
    }
  },

  /**
   * Get the next user position after opponent moves
   */
  getNextUserPosition(
    session: TrainingSession,
    startIndex: number
  ): { fen: string; isUserTurn: boolean } | undefined {
    const currentLine = session.lines[session.currentLineIndex];
    if (!currentLine) return undefined;

    for (let i = startIndex; i < currentLine.moves.length; i++) {
      const move = currentLine.moves[i];
      if (move.isUserMove) {
        return {
          fen: move.preFen,
          isUserTurn: true,
        };
      }
    }

    return undefined;
  },

  /**
   * Advance to the next position in the session
   * Returns true if there's more to drill, false if line is complete
   */
  advanceToNextPosition(session: TrainingSession): boolean {
    if (session.mode === 'width-first') {
      return this.advanceWidthFirst(session);
    } else {
      return this.advanceDepthFirst(session);
    }
  },

  /**
   * Advance for depth-first mode (complete one line before moving to next)
   */
  advanceDepthFirst(session: TrainingSession): boolean {
    const currentLine = session.lines[session.currentLineIndex];
    const userMoves = currentLine.moves.filter(m => m.isUserMove);

    // Move to next user move in current line
    if (session.currentMoveIndex < userMoves.length - 1) {
      session.currentMoveIndex++;
      return true;
    }

    // Current line complete - mark it for rating
    session.awaitingRating = true;
    return false;
  },

  /**
   * Advance for width-first mode (test all lines at depth N before depth N+1)
   */
  advanceWidthFirst(session: TrainingSession): boolean {
    // Initialize line progress if not done
    if (Object.keys(session.lineProgress).length === 0) {
      session.lines.forEach(line => {
        session.lineProgress[line.id] = 0;
      });
    }

    // Mark current position as complete
    const currentLine = session.lines[session.currentLineIndex];
    session.lineProgress[currentLine.id] = session.currentMoveIndex + 1;

    // Check if current line is now complete (all user moves tested)
    const currentLineUserMoves = currentLine.moves.filter(m => m.isUserMove);
    if (session.lineProgress[currentLine.id] >= currentLineUserMoves.length) {
      // Line complete - await rating
      session.awaitingRating = true;
      return false;
    }

    // Find next line at current depth that hasn't been tested yet
    const currentDepth = session.currentMoveIndex;
    for (let i = session.currentLineIndex + 1; i < session.lines.length; i++) {
      const line = session.lines[i];
      const userMoves = line.moves.filter(m => m.isUserMove);
      const progress = session.lineProgress[line.id] || 0;

      // Check if this line has a move at current depth that hasn't been tested
      if (userMoves.length > currentDepth && progress <= currentDepth) {
        session.currentLineIndex = i;
        session.currentMoveIndex = currentDepth;
        return true;
      }
    }

    // All lines at current depth tested - move to next depth
    session.currentDepth++;
    session.currentMoveIndex++;

    // Find first line with a move at next depth
    for (let i = 0; i < session.lines.length; i++) {
      const line = session.lines[i];
      const userMoves = line.moves.filter(m => m.isUserMove);
      const progress = session.lineProgress[line.id] || 0;

      if (userMoves.length > session.currentMoveIndex && progress <= session.currentMoveIndex) {
        session.currentLineIndex = i;
        return true;
      }
    }

    // All lines at all depths complete
    session.isComplete = true;
    return false;
  },

  /**
   * Complete current line with rating and advance to next line
   * Returns updated LineStats and whether session continues
   */
  completeLineAndAdvance(
    session: TrainingSession,
    quality: number,
    existingStats: LineStats[]
  ): { updatedStats: LineStats; hasMore: boolean } {
    const currentLine = session.lines[session.currentLineIndex];

    // Find or create stats for this line
    let lineStats = existingStats.find(s => s.lineId === currentLine.id);

    if (!lineStats) {
      // Create new stats with SM-2 defaults
      lineStats = {
        lineId: currentLine.id,
        repertoireId: currentLine.repertoireId,
        chapterId: currentLine.chapterId,
        easeFactor: 2.5,
        interval: 0,
        repetitions: 0,
        nextReviewDate: new Date(),
        totalDrills: 0,
        correctCount: 0,
        mistakeCount: session.totalMistakes,
      };
    }

    // Apply SM-2 algorithm
    const sm2Result = SM2Service.calculateNext(lineStats as any, quality);

    // Update stats
    const updatedStats: LineStats = {
      ...lineStats,
      easeFactor: sm2Result.easeFactor,
      interval: sm2Result.interval,
      repetitions: sm2Result.repetitions,
      nextReviewDate: sm2Result.nextReviewDate,
      lastReviewDate: new Date(),
      totalDrills: lineStats.totalDrills + 1,
      correctCount: lineStats.correctCount + (session.totalMistakes === 0 ? 1 : 0),
      mistakeCount: lineStats.mistakeCount + session.totalMistakes,
    };

    // Reset mistake counter for next line
    session.totalMistakes = 0;
    session.linesCompleted++;
    session.awaitingRating = false;

    if (session.mode === 'depth-first') {
      // Depth-first: move to next line sequentially
      if (session.currentLineIndex < session.lines.length - 1) {
        session.currentLineIndex++;
        session.currentMoveIndex = 0;
        return { updatedStats, hasMore: true };
      } else {
        session.isComplete = true;
        return { updatedStats, hasMore: false };
      }
    } else {
      // Width-first: find next incomplete line
      // Check from current line onwards
      for (let i = session.currentLineIndex + 1; i < session.lines.length; i++) {
        const line = session.lines[i];
        const userMoves = line.moves.filter(m => m.isUserMove);
        const progress = session.lineProgress[line.id] || 0;

        if (progress < userMoves.length) {
          // Found an incomplete line
          session.currentLineIndex = i;
          session.currentMoveIndex = progress;
          return { updatedStats, hasMore: true };
        }
      }

      // Check from beginning if not found
      for (let i = 0; i <= session.currentLineIndex; i++) {
        const line = session.lines[i];
        const userMoves = line.moves.filter(m => m.isUserMove);
        const progress = session.lineProgress[line.id] || 0;

        if (progress < userMoves.length) {
          session.currentLineIndex = i;
          session.currentMoveIndex = progress;
          return { updatedStats, hasMore: true };
        }
      }

      // All lines complete
      session.isComplete = true;
      return { updatedStats, hasMore: false };
    }
  },

  /**
   * Get the current position to display
   */
  getCurrentPosition(session: TrainingSession): { fen: string; expectedMove: string } | null {
    const currentLine = session.lines[session.currentLineIndex];
    if (!currentLine) return null;

    const userMoves = currentLine.moves.filter(m => m.isUserMove);
    const currentUserMove = userMoves[session.currentMoveIndex];

    if (!currentUserMove) return null;

    return {
      fen: currentUserMove.preFen,
      expectedMove: currentUserMove.san,
    };
  },

  /**
   * Get progress info for display
   */
  getProgress(session: TrainingSession): {
    lineNumber: number;
    totalLines: number;
    moveNumber: number;
    totalMovesInLine: number;
  } {
    const currentLine = session.lines[session.currentLineIndex];
    const userMoves = currentLine?.moves.filter(m => m.isUserMove) ?? [];

    return {
      lineNumber: session.currentLineIndex + 1,
      totalLines: session.lines.length,
      moveNumber: session.currentMoveIndex + 1,
      totalMovesInLine: userMoves.length,
    };
  },

  /**
   * Generate unique session ID
   */
  generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },
};
