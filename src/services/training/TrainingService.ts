/**
 * TrainingService - Session management and move processing for line drilling
 */

import { Chess } from 'chess.js';
import {
  TrainingConfig,
  TrainingSession,
  Line,
  LineStats,
  DrillResult,
} from '@types';
import { Repertoire, normalizeFen } from '@types';
import { LineExtractor } from './LineExtractor';
import { SM2Service } from '@services/srs/SM2Service';

const ACTIVE_BATCH_SIZE = 100;
/**
 * Where a never-drilled line sits on the recommendation scale (a mistake rate in [0,1]).
 * Above a line you get right two thirds of the time, below one you actively keep failing.
 */
const UNSEEN_LINE_SCORE = 0.5;

export const TrainingService = {
  /**
   * Start a new training session from config
   */
  startSession(
    config: TrainingConfig,
    repertoire: Repertoire,
    allLineStats: LineStats[]
  ): TrainingSession {
    // Extract lines from all chapters (or specific chapters if specified)
    const chapters = config.chapterIds?.length
      ? repertoire.chapters.filter(ch => config.chapterIds!.includes(ch.id))
      : repertoire.chapters;

    let allLines: Line[] = [];
    for (const chapter of chapters) {
      const lines = LineExtractor.extractLines(
        chapter.moveTree,
        repertoire.id,
        chapter.id,
        repertoire.color,
        config.maxDepth,
        config.opponentBranchingOnly
      );
      allLines = allLines.concat(lines);
    }

    // Filter to only lines with user moves
    allLines = LineExtractor.filterLinesWithUserMoves(allLines);

    // Narrow the pool to the requested selection
    if (config.selection.kind === 'due') {
      const now = new Date();
      const dueLineIds = new Set(
        allLineStats
          .filter(stat => new Date(stat.nextReviewDate) <= now)
          .map(stat => stat.lineId)
      );
      allLines = allLines.filter(line => dueLineIds.has(line.id));
    }

    if (config.selection.kind === 'from-position') {
      const target = normalizeFen(config.selection.fen);
      allLines = allLines
        .map(line => this.trimLineToPosition(line, target))
        .filter((line): line is Line => line !== null);
      // Trimming can leave a tail with nothing for the user to play
      allLines = LineExtractor.filterLinesWithUserMoves(allLines);
    }

    if (config.selection.kind === 'recommended') {
      allLines = this.sortByRecommendation(allLines, allLineStats);
    }

    // Shuffle before the batch split, not after — shuffling only the active batch would
    // just reorder the same first 50 lines and never surface the rest of a big repertoire.
    // Except under 'recommended', where the priority order is the whole point: there the
    // batch is still the highest-priority lines, and random only shuffles within it.
    const shuffleWholePool = config.order === 'random' && config.selection.kind !== 'recommended';
    if (shuffleWholePool) {
      allLines = this.shuffle(allLines);
    }

    // Split into active batch and holdback when over the limit
    let activeLines = allLines.slice(0, ACTIVE_BATCH_SIZE);
    const holdbackLines = allLines.slice(ACTIVE_BATCH_SIZE);
    if (config.order === 'random' && !shuffleWholePool) {
      activeLines = this.shuffle(activeLines);
    }

    return {
      id: this.generateSessionId(),
      repertoireId: repertoire.id,
      chapterIds: config.chapterIds ?? [],
      color: repertoire.color,
      order: config.order,
      guidance: config.guidance,
      maxDepth: config.maxDepth ?? null,
      lines: activeLines,
      holdbackLines,
      totalLineCount: allLines.length,
      currentLineIndex: 0,
      currentMoveIndex: 0,
      currentDepth: 0,
      lineProgress: {},
      linesCompleted: 0,
      completedLineIds: [],
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
      // Check if the played move is a valid alternative in another line at this position
      const isAlternative = session.lines.some(line => {
        if (line.id === currentLine.id) return false;
        return line.moves.some(m => m.isUserMove && m.preFen === currentUserMove.preFen && m.san === move.san);
      });
      return {
        isCorrect: false,
        expectedMove: currentUserMove.san,
        userMove: move.san,
        feedback: isAlternative ? 'alternative' : 'incorrect',
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
        resultFen: currentUserMove.fen,
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
    if (session.order === 'width-first') {
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
    const currentDepth = session.currentMoveIndex;
    session.lineProgress[currentLine.id] = currentDepth + 1;

    // Auto-advance all other lines that share the identical move at this depth
    // (same pre-position + same SAN). No point re-testing shared prefix moves.
    const currentLineUserMoves = currentLine.moves.filter(m => m.isUserMove);
    const completedMove = currentLineUserMoves[currentDepth];
    if (completedMove) {
      for (const line of session.lines) {
        if (line.id === currentLine.id) continue;
        const progress = session.lineProgress[line.id] || 0;
        if (progress > currentDepth) continue;
        const lineUserMoves = line.moves.filter(m => m.isUserMove);
        const moveAtDepth = lineUserMoves[currentDepth];
        if (moveAtDepth && moveAtDepth.preFen === completedMove.preFen && moveAtDepth.san === completedMove.san) {
          session.lineProgress[line.id] = currentDepth + 1;
        }
      }
    }

    // Check if current line is now complete (all user moves tested)
    if (session.lineProgress[currentLine.id] >= currentLineUserMoves.length) {
      // Line complete - await rating
      session.awaitingRating = true;
      return false;
    }

    // Find next line at current depth that hasn't been tested yet
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
    const sm2Result = SM2Service.calculateNext(lineStats, quality);

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
    if (!session.completedLineIds.includes(currentLine.id)) {
      session.completedLineIds.push(currentLine.id);
    }
    session.linesCompleted = session.completedLineIds.length;
    session.awaitingRating = false;

    if (session.order !== 'width-first') {
      // Depth-first and random both walk the pool sequentially; random just shuffled it
      if (session.currentLineIndex < session.lines.length - 1) {
        session.currentLineIndex++;
        session.currentMoveIndex = 0;
        return { updatedStats, hasMore: true };
      } else if (session.holdbackLines.length > 0) {
        // Promote next batch from holdback
        this.promoteFromHoldback(session);
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

      // All active lines complete — check holdback
      if (session.holdbackLines.length > 0) {
        this.promoteFromHoldback(session);
        return { updatedStats, hasMore: true };
      }

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
   * Replace completed active lines with the next batch from holdback.
   * Removes all completed lines, appends up to ACTIVE_BATCH_SIZE new ones.
   */
  promoteFromHoldback(session: TrainingSession): void {
    // Remove completed lines from active set
    const incompleteLines = session.lines.filter(line => {
      const userMoves = line.moves.filter(m => m.isUserMove);
      const progress = session.lineProgress[line.id] || 0;
      return progress < userMoves.length;
    });

    // How many slots are free
    const slotsAvailable = ACTIVE_BATCH_SIZE - incompleteLines.length;
    const promoted = session.holdbackLines.splice(0, slotsAvailable);

    session.lines = [...incompleteLines, ...promoted];
    session.currentLineIndex = 0;
    session.currentMoveIndex = 0;
  },

  /**
   * Get progress info for display
   */
  getProgress(session: TrainingSession): {
    lineNumber: number;
    totalLines: number;
    moveNumber: number;
    totalMovesInLine: number;
    linesCompleted: number;
    holdbackCount: number;
  } {
    const currentLine = session.lines[session.currentLineIndex];
    const userMoves = currentLine?.moves.filter(m => m.isUserMove) ?? [];

    return {
      lineNumber: session.linesCompleted + 1,
      totalLines: session.totalLineCount,
      moveNumber: session.currentMoveIndex + 1,
      totalMovesInLine: userMoves.length,
      linesCompleted: session.linesCompleted,
      holdbackCount: session.holdbackLines.length,
    };
  },

  /**
   * Generate unique session ID
   */
  /**
   * Cut a line down to the part that starts at `normalizedTargetFen`.
   *
   * Drilling "from here" should begin at the position, not replay the line from move one.
   * Returns null when the line never reaches the position. The line keeps its id, so the
   * scheduler still treats this as evidence about the same line.
   */
  trimLineToPosition(line: Line, normalizedTargetFen: string): Line | null {
    const index = line.moves.findIndex(m => normalizeFen(m.preFen) === normalizedTargetFen);
    if (index === -1) return null;
    if (index === 0) return line;

    const moves = line.moves.slice(index);
    return { ...line, moves, depth: moves.length };
  },

  /**
   * How badly a line needs drilling. Higher comes first.
   *
   * A line you keep getting wrong outranks everything. A line you have never seen sits
   * above lines you mostly get right, so "recommended" still feeds you new material
   * instead of only ever re-showing old wounds.
   */
  recommendationScore(stats: LineStats | undefined): number {
    if (!stats || stats.totalDrills === 0) return UNSEEN_LINE_SCORE;
    return stats.mistakeCount / stats.totalDrills;
  },

  /** Weakest first, then how overdue, so equally-shaky lines surface oldest-first. */
  sortByRecommendation(lines: Line[], allLineStats: LineStats[]): Line[] {
    const statsById = new Map(allLineStats.map(s => [s.lineId, s]));
    const now = Date.now();

    return [...lines].sort((a, b) => {
      const statsA = statsById.get(a.id);
      const statsB = statsById.get(b.id);

      const scoreDiff = this.recommendationScore(statsB) - this.recommendationScore(statsA);
      if (scoreDiff !== 0) return scoreDiff;

      const overdueA = statsA ? now - new Date(statsA.nextReviewDate).getTime() : 0;
      const overdueB = statsB ? now - new Date(statsB.nextReviewDate).getTime() : 0;
      return overdueB - overdueA;
    });
  },

  /** Fisher-Yates, on a copy. */
  shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  },

  generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },
};
