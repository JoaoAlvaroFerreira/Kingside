/**
 * GameReviewService - Orchestrates game analysis and repertoire matching
 *
 * REPERTOIRE MATCHING APPROACH:
 * - Uses FEN-based position matching (not move sequence matching)
 * - Builds position map from MoveTree at review start: Map<FEN, Set<possibleMoves>>
 * - Automatically handles transpositions (different move orders to same position)
 * - Aggregates moves from ALL chapters covering a position
 * - O(1) lookup per move during review
 *
 * MOVE CLASSIFICATION:
 * - Uses Lichess-style win-probability classification instead of centipawn thresholds
 * - Converts centipawn evaluations to win probability using the Lichess formula
 * - Classification based on win% loss from the moving player's perspective
 */

import { Chess } from 'chess.js';
import {
  UserGame,
  MasterGame,
  Repertoire,
  Chapter,
  GameReviewSession,
  GameReviewStatus,
  MoveAnalysis,
  KeyMoveReason,
  RepertoireMatchResult,
  MasterGameReference,
  EngineEvaluation,
} from '@types';
import { EngineAnalyzer, AnalysisOptions } from '@services/engine/EngineAnalyzer';
import { normalizeFen } from '@types';
import { MoveTree } from '@utils/MoveTree';

/**
 * Convert centipawn score to win probability (0-100) from White's perspective.
 * Uses the Lichess formula: 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
 */
export function centipawnsToWinProbability(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/**
 * Get win probability for an evaluation, handling mate scores.
 * Returns win probability from White's perspective (0-100).
 */
function evalToWinProbability(eval_: EngineEvaluation): number {
  if (eval_.mate !== undefined) {
    return eval_.mate > 0 ? 100 : 0;
  }
  return centipawnsToWinProbability(eval_.score);
}

export const GameReviewService = {
  /**
   * Start a review session for a game
   */
  async startReview(
    game: UserGame,
    userColor: 'white' | 'black',
    repertoires: Repertoire[],
    masterGames: MasterGame[],
    analyzer: EngineAnalyzer,
    analysisOptions: AnalysisOptions,
    onProgress?: (current: number, total: number) => void,
  ): Promise<GameReviewSession> {
    console.log('[GameReview] Starting review with userColor:', userColor);
    console.log('[GameReview] Available repertoires:', repertoires.length);
    repertoires.forEach(rep => {
      console.log(`  - Repertoire "${rep.name}" (${rep.color}): ${rep.chapters.length} chapters`);
    });

    // Build position map from repertoire for efficient FEN-based matching (handles transpositions)
    console.log('[GameReview] Building position map from repertoire...');
    const positionMap = this.buildRepertoirePositionMap(repertoires, userColor);
    console.log(`[GameReview] Position map built with ${positionMap.size} unique positions`);

    const chess = new Chess();
    const moves: MoveAnalysis[] = [];
    const positions: string[] = [chess.fen()];

    // Helper function to check if a string looks like a valid chess move
    const looksLikeChessMove = (str: string): boolean => {
      if (!str || str.length < 2 || str.length > 10) return false;
      const chessMove = /^([NBRQK])?[a-h]?[1-8]?x?[a-h][1-8](=[NBRQ])?[+#]?$|^O-O(-O)?[+#]?$/i;
      return chessMove.test(str);
    };

    // Extract only the moves section from PGN (after headers, before result)
    let pgnMovesText = game.pgn;

    // Remove all header lines (anything in square brackets on its own line)
    pgnMovesText = pgnMovesText.replace(/^\[.*?\]$/gm, '');

    // Extract Lichess eval annotations from comment blocks before stripping
    const lichessEvalsByCommentIndex: Array<{eval?: number, evalMate?: number} | null> = [];
    const commentBlocks = pgnMovesText.match(/\{[^}]*\}/g) || [];
    for (const block of commentBlocks) {
      const entry: {eval?: number, evalMate?: number} = {};
      const mateMatch = block.match(/\[%eval\s+#(-?\d+)\]/);
      if (mateMatch) {
        entry.evalMate = parseInt(mateMatch[1], 10);
      } else {
        const evalMatch = block.match(/\[%eval\s+([-\d.]+)\]/);
        if (evalMatch) {
          entry.eval = Math.round(parseFloat(evalMatch[1]) * 100);
        }
      }
      lichessEvalsByCommentIndex.push(
        (entry.eval !== undefined || entry.evalMate !== undefined) ? entry : null
      );
    }

    // Remove comments (anything in curly braces)
    pgnMovesText = pgnMovesText.replace(/\{[^}]*\}/g, '');

    // Remove semicolon comments (to end of line)
    pgnMovesText = pgnMovesText.replace(/;.*$/gm, '');

    // Remove result markers
    pgnMovesText = pgnMovesText.replace(/\s+(1-0|0-1|1\/2-1\/2|\*)\s*$/g, '');

    // Build move list using chess.js to validate each move
    const flatMoves: string[] = [];

    // Split by move numbers and process each section
    const moveSections = pgnMovesText.split(/\d+\.\s*/).filter(s => s.trim());

    for (const section of moveSections) {
      const movesInSection = section.trim().split(/\s+/).filter(m => m.trim());

      for (const move of movesInSection) {
        const cleanMove = move
          .replace(/[!?]+$/, '')
          .replace(/\(.*?\)/g, '')
          .replace(/\[.*?\]/g, '')
          .replace(/[",]/g, '')
          .trim();

        if (cleanMove && looksLikeChessMove(cleanMove)) {
          flatMoves.push(cleanMove);
        }
      }
    }

    if (flatMoves.length === 0) {
      console.error('Failed to extract moves from PGN:', game.pgn);
      throw new Error('No valid moves found in game PGN');
    }

    console.log(`Extracted ${flatMoves.length} moves from game ${game.id}:`, flatMoves.slice(0, 10));

    // Play through game and record positions
    for (const san of flatMoves) {
      try {
        chess.move(san);
        positions.push(chess.fen());
      } catch (error) {
        console.warn(`Invalid move in game ${game.id}: "${san}" (after ${positions.length - 1} valid moves)`);
        break;
      }
    }

    if (positions.length <= 1) {
      throw new Error('Failed to parse game moves');
    }

    // Get engine evaluations for all positions
    console.log(`Analyzing ${positions.length} positions...`);
    const evaluations: Array<EngineEvaluation | null> = new Array(positions.length).fill(null);
    for (let i = 0; i < positions.length; i++) {
      try {
        evaluations[i] = await analyzer.analyze(positions[i], analysisOptions);
      } catch {
        evaluations[i] = null;
      }
      if (onProgress) {
        onProgress(i + 1, positions.length);
      }
    }
    console.log(`Received ${evaluations.length} evaluations`);

    // Rebuild game and analyze each move
    chess.load(positions[0]);
    let moveIndex = 0;
    let hasEverDeviated = false;
    let wasInRepertoireLastMove = true;

    console.log('[GameReview] Starting move-by-move analysis...');

    for (const san of flatMoves) {
      const preFen = chess.fen();
      const evalBefore = evaluations[moveIndex];

      try {
        chess.move(san);
      } catch {
        break;
      }

      const fen = chess.fen();
      const evalAfter = evaluations[moveIndex + 1];
      const evalDelta = evalAfter && evalBefore ? this.calculateEvalDelta(evalBefore, evalAfter) : undefined;

      // Determine if this was Black's move (after move(), chess.turn() shows NEXT player)
      const isBlackMove = chess.turn() === 'w';

      console.log(`\n[GameReview] === Processing move ${moveIndex + 1}/${flatMoves.length}: ${san} ===`);

      // Check repertoire match using FEN-based position matching
      const repertoireMatch = this.checkRepertoireMatchFEN(
        preFen,
        san,
        moveIndex,
        isBlackMove,
        userColor,
        positionMap
      );

      const isInRepertoireNow = repertoireMatch?.matched ?? false;

      // Find master game references
      const masterGameRefs = this.findMasterGames(preFen, san, masterGames);

      // Determine if this is a key move using win-probability classification
      const { isKeyMove, keyMoveReason } = this.identifyKeyMove(
        evalBefore ?? undefined,
        evalAfter ?? undefined,
        isBlackMove,
        repertoireMatch,
        hasEverDeviated,
        wasInRepertoireLastMove,
        isInRepertoireNow
      );

      // Update tracking state
      if (repertoireMatch && !repertoireMatch.matched && !hasEverDeviated) {
        hasEverDeviated = true;
      }
      wasInRepertoireLastMove = isInRepertoireNow;

      const lichessEntry = lichessEvalsByCommentIndex[moveIndex] ?? null;
      moves.push({
        moveIndex,
        san,
        fen,
        preFen,
        evalBefore,
        evalAfter,
        evalDelta,
        isKeyMove,
        keyMoveReason,
        repertoireMatch,
        masterGameRefs,
        lichessEval: lichessEntry?.eval,
        lichessEvalMate: lichessEntry?.evalMate,
      });

      moveIndex++;
    }

    if (moves.length === 0) {
      throw new Error('Failed to analyze game moves. Check engine configuration.');
    }

    const keyMoveIndices = moves
      .map((m, i) => (m.isKeyMove ? i : -1))
      .filter(i => i !== -1);

    const followedRepertoire = moves.every(m => !m.repertoireMatch || m.repertoireMatch.matched);

    console.log(`Review session created: ${moves.length} moves, ${keyMoveIndices.length} key moves`);

    return {
      id: `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      gameId: game.id,
      userColor,
      moves,
      currentMoveIndex: 0,
      keyMoveIndices,
      isComplete: false,
      followedRepertoire,
      startedAt: new Date(),
    };
  },

  /**
   * Calculate evaluation delta between two positions
   */
  calculateEvalDelta(before: EngineEvaluation, after: EngineEvaluation): number {
    if (before.mate !== undefined) {
      return before.mate > 0 ? -10000 : 10000;
    }
    if (after.mate !== undefined) {
      return after.mate > 0 ? 10000 : -10000;
    }
    return after.score - before.score;
  },

  /**
   * Extract all positions from a chapter by playing through its PGN linearly
   */
  extractPositionsFromChapter(chapter: Chapter): Map<number, Map<string, Set<string>>> {
    const positionsByMoveCount = new Map<number, Map<string, Set<string>>>();

    const addPosition = (moveCount: number, fen: string, nextMove: string) => {
      if (!positionsByMoveCount.has(moveCount)) {
        positionsByMoveCount.set(moveCount, new Map());
      }
      const positionsAtMoveCount = positionsByMoveCount.get(moveCount)!;
      const normalizedFen = normalizeFen(fen);

      if (!positionsAtMoveCount.has(normalizedFen)) {
        positionsAtMoveCount.set(normalizedFen, new Set());
      }
      positionsAtMoveCount.get(normalizedFen)!.add(nextMove);
    };

    const moveTree = MoveTree.fromJSON(chapter.moveTree);
    const allLines: string[][] = [];

    const extractLines = (node: any, currentLine: string[]) => {
      if (!node) return;

      const lineWithThisMove = [...currentLine, node.san];

      if (!node.children || node.children.length === 0) {
        allLines.push(lineWithThisMove);
      } else {
        for (const child of node.children) {
          extractLines(child, lineWithThisMove);
        }
      }
    };

    const rootMoves = moveTree.getRootMoves();
    for (const rootMove of rootMoves) {
      extractLines(rootMove, []);
    }

    console.log(`    [ExtractPositions] Found ${allLines.length} lines in chapter "${chapter.name}"`);

    for (const line of allLines) {
      const chess = new Chess();

      for (let i = 0; i < line.length; i++) {
        const preFen = chess.fen();
        const moveCount = i;
        const nextMove = line[i];

        addPosition(moveCount, preFen, nextMove);

        try {
          chess.move(nextMove);
        } catch (error) {
          console.warn(`    [ExtractPositions] Invalid move "${nextMove}" at position ${i} in chapter "${chapter.name}"`);
          break;
        }
      }

      const finalFen = chess.fen();
      const finalMoveCount = line.length;
      if (!positionsByMoveCount.has(finalMoveCount)) {
        positionsByMoveCount.set(finalMoveCount, new Map());
      }
      const finalPositions = positionsByMoveCount.get(finalMoveCount)!;
      const normalizedFinalFen = normalizeFen(finalFen);
      if (!finalPositions.has(normalizedFinalFen)) {
        finalPositions.set(normalizedFinalFen, new Set());
      }
    }

    const totalPositions = Array.from(positionsByMoveCount.values())
      .reduce((sum, map) => sum + map.size, 0);
    console.log(`    [ExtractPositions] Extracted ${totalPositions} positions across ${positionsByMoveCount.size} move counts`);

    return positionsByMoveCount;
  },

  /**
   * Build a comprehensive position map from all repertoire chapters
   */
  buildRepertoirePositionMap(
    repertoires: Repertoire[],
    userColor: 'white' | 'black'
  ): Map<number, Map<string, Set<string>>> {
    const combinedMap = new Map<number, Map<string, Set<string>>>();
    const relevantRepertoires = repertoires.filter(rep => rep.color === userColor);

    console.log(`  [BuildPositionMap] Building map from ${relevantRepertoires.length} ${userColor} repertoire(s)`);

    for (const repertoire of relevantRepertoires) {
      console.log(`  [BuildPositionMap] Processing repertoire "${repertoire.name}" with ${repertoire.chapters.length} chapters`);

      for (const chapter of repertoire.chapters) {
        const chapterMap = this.extractPositionsFromChapter(chapter);

        for (const [moveCount, positionsAtMoveCount] of chapterMap.entries()) {
          if (!combinedMap.has(moveCount)) {
            combinedMap.set(moveCount, new Map());
          }
          const combinedPositionsAtMoveCount = combinedMap.get(moveCount)!;

          for (const [fen, moves] of positionsAtMoveCount.entries()) {
            if (!combinedPositionsAtMoveCount.has(fen)) {
              combinedPositionsAtMoveCount.set(fen, new Set());
            }
            const combinedMoves = combinedPositionsAtMoveCount.get(fen)!;
            for (const move of moves) {
              combinedMoves.add(move);
            }
          }
        }
      }
    }

    const totalPositions = Array.from(combinedMap.values())
      .reduce((sum, map) => sum + map.size, 0);
    console.log(`  [BuildPositionMap] Total unique positions across all move counts: ${totalPositions}`);
    console.log(`  [BuildPositionMap] Move counts covered: ${Array.from(combinedMap.keys()).sort((a, b) => a - b).join(', ')}`);

    return combinedMap;
  },

  /**
   * Check if move matches repertoire by verifying the RESULTING position exists in repertoire
   */
  checkRepertoireMatchFEN(
    preFen: string,
    movePlayed: string,
    moveCount: number,
    isBlackMove: boolean,
    userColor: 'white' | 'black',
    positionMap: Map<number, Map<string, Set<string>>>
  ): RepertoireMatchResult {
    const isUserMove = (userColor === 'white' && !isBlackMove) || (userColor === 'black' && isBlackMove);

    console.log(`  [FEN-Match] Move ${moveCount + 1}: ${movePlayed} (${isBlackMove ? 'BLACK' : 'WHITE'})`);
    console.log('  [FEN-Match] Position before move:', normalizeFen(preFen).substring(0, 60) + '...');
    console.log('  [FEN-Match] User is playing as:', userColor.toUpperCase());
    console.log('  [FEN-Match] Is this a user move?', isUserMove);

    const chess = new Chess(preFen);
    try {
      chess.move(movePlayed);
    } catch (error) {
      console.log(`  [FEN-Match] Invalid move "${movePlayed}"\n`);
      return {
        matched: false,
        isUserMove,
        deviationType: 'coverage-gap',
      };
    }

    const resultingFen = normalizeFen(chess.fen());
    const resultingMoveCount = moveCount + 1;

    console.log('  [FEN-Match] Resulting position:', resultingFen.substring(0, 60) + '...');
    console.log(`  [FEN-Match] Checking if resulting position exists in repertoire at ply ${resultingMoveCount}...`);

    // First, check if resulting position exists at the expected ply
    const positionsAtNextPly = positionMap.get(resultingMoveCount);

    if (positionsAtNextPly && positionsAtNextPly.has(resultingFen)) {
      const expectedMovesFromThisPosition = positionsAtNextPly.get(resultingFen);
      const expectedMoves = expectedMovesFromThisPosition ? Array.from(expectedMovesFromThisPosition) : [];

      console.log(`  [FEN-Match] MATCH - Resulting position found in repertoire at ply ${resultingMoveCount}`);
      console.log(`  [FEN-Match] Expected next moves from this position: ${expectedMoves.join(', ') || 'none (end of line)'}\n`);

      return {
        matched: true,
        expectedMoves,
        isUserMove,
      };
    }

    // If not found at expected ply, check ALL other plies (for deep transpositions)
    console.log(`  [FEN-Match] Not found at ply ${resultingMoveCount}, checking other plies...`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [ply, positions] of positionMap) {
      if (positions.has(resultingFen)) {
        const expectedMovesFromThisPosition = positions.get(resultingFen);
        const expectedMoves = expectedMovesFromThisPosition ? Array.from(expectedMovesFromThisPosition) : [];

        console.log(`  [FEN-Match] MATCH - Resulting position found in repertoire at ply ${ply} (transposition!)`);
        console.log(`  [FEN-Match] Expected next moves from this position: ${expectedMoves.join(', ') || 'none (end of line)'}\n`);

        return {
          matched: true,
          expectedMoves,
          isUserMove,
        };
      }
    }

    // Resulting position not found anywhere in repertoire
    const beforeFen = normalizeFen(preFen);
    let beforePositionInRepertoire = false;
    let expectedMovesFromBeforePosition: string[] = [];

    for (const [, positions] of positionMap) {
      if (positions.has(beforeFen)) {
        beforePositionInRepertoire = true;
        const movesSet = positions.get(beforeFen);
        expectedMovesFromBeforePosition = movesSet ? Array.from(movesSet) : [];
        break;
      }
    }

    if (beforePositionInRepertoire) {
      console.log(`  [FEN-Match] DEVIATION - Before position was in repertoire, but move leads outside`);
      console.log(`  [FEN-Match] Expected moves were: ${expectedMovesFromBeforePosition.join(', ')}\n`);
      return {
        matched: false,
        expectedMoves: expectedMovesFromBeforePosition,
        isUserMove,
        deviationType: isUserMove ? 'user-misplay' : 'opponent-novelty',
      };
    } else {
      console.log(`  [FEN-Match] COVERAGE-GAP - Before position was not in repertoire (already off-book)\n`);
      return {
        matched: false,
        isUserMove,
        deviationType: 'coverage-gap',
      };
    }
  },


  /**
   * Find master games at a position
   */
  findMasterGames(fen: string, movePlayed: string, masterGames: MasterGame[]): MasterGameReference[] {
    const normalizedFen = normalizeFen(fen);
    const references: MasterGameReference[] = [];
    const moveFrequency: Record<string, number> = {};

    for (const game of masterGames) {
      const chess = new Chess();
      const pgnMoves = game.pgn.match(/\d+\.\s*(\S+)(?:\s+(\S+))?/g) || [];
      const flatMoves: string[] = [];

      for (const movePair of pgnMoves) {
        const matches = movePair.match(/\d+\.\s*(\S+)(?:\s+(\S+))?/);
        if (matches) {
          if (matches[1]) flatMoves.push(matches[1]);
          if (matches[2]) flatMoves.push(matches[2]);
        }
      }

      for (const san of flatMoves) {
        const currentFen = normalizeFen(chess.fen());

        if (currentFen === normalizedFen) {
          moveFrequency[san] = (moveFrequency[san] || 0) + 1;

          if (san === movePlayed) {
            const year = parseInt(game.date.split('.')[0]) || 0;
            references.push({
              gameId: game.id,
              white: game.white,
              black: game.black,
              result: game.result,
              year,
              event: game.event,
              movePlayed: san,
              frequency: 0,
            });
          }
        }

        try {
          chess.move(san);
        } catch {
          break;
        }
      }
    }

    const total = Object.values(moveFrequency).reduce((sum, count) => sum + count, 0);
    for (const ref of references) {
      ref.frequency = total > 0 ? (moveFrequency[ref.movePlayed] || 0) / total : 0;
    }

    return references;
  },

  /**
   * Identify if a move is a key move using win-probability classification.
   *
   * Classification logic:
   * 1. Convert evalBefore/evalAfter to win probability from the moving player's perspective
   * 2. Compute winProbLoss = winProbBefore - winProbAfter
   * 3. Gate: if winProbBefore <= 30, skip blunder/mistake (already losing)
   * 4. Blunder: winProbLoss >= 30, Mistake: >= 20, Inaccuracy: >= 10
   * 5. Missing forced mate: always blunder regardless of gate
   */
  identifyKeyMove(
    evalBefore: EngineEvaluation | undefined,
    evalAfter: EngineEvaluation | undefined,
    isBlackMove: boolean,
    repertoireMatch: RepertoireMatchResult,
    hasAlreadyDeviated: boolean = false,
    wasInRepertoireLastMove: boolean = true,
    isInRepertoireNow: boolean = false
  ): { isKeyMove: boolean; keyMoveReason?: KeyMoveReason } {
    // Check for transposition back into repertoire
    if (!wasInRepertoireLastMove && isInRepertoireNow) {
      console.log('[identifyKeyMove] Transposition back into repertoire detected!');
      return {
        isKeyMove: true,
        keyMoveReason: 'transposition',
      };
    }

    // Repertoire deviations are key moves ONLY if this is the first deviation
    if (repertoireMatch && !repertoireMatch.matched && !hasAlreadyDeviated) {
      return {
        isKeyMove: true,
        keyMoveReason: repertoireMatch.isUserMove ? 'repertoire-deviation' : 'opponent-novelty',
      };
    }

    // Check eval-based key moves (only if both evaluations are available)
    if (evalBefore && evalAfter) {
      // Check for missing forced mate: had mate, lost it or it reversed
      const hadWinningMate = evalBefore.mate !== undefined && (
        (!isBlackMove && evalBefore.mate > 0) ||  // White had mate and White moved
        (isBlackMove && evalBefore.mate < 0)       // Black had mate and Black moved
      );

      if (hadWinningMate) {
        // Check if mate is gone or reversed
        const mateStillExists = evalAfter.mate !== undefined && (
          (!isBlackMove && evalAfter.mate > 0) ||
          (isBlackMove && evalAfter.mate < 0)
        );
        if (!mateStillExists) {
          return { isKeyMove: true, keyMoveReason: 'blunder' };
        }
      }

      // Convert to win probability from the moving player's perspective
      const whiteWinProbBefore = evalToWinProbability(evalBefore);
      const whiteWinProbAfter = evalToWinProbability(evalAfter);

      // If black just moved, invert to get black's win probability
      const winProbBefore = isBlackMove ? (100 - whiteWinProbBefore) : whiteWinProbBefore;
      const winProbAfter = isBlackMove ? (100 - whiteWinProbAfter) : whiteWinProbAfter;

      const winProbLoss = winProbBefore - winProbAfter;

      // Inaccuracy can always apply
      if (winProbLoss >= 10) {
        // Gate: if already losing (winProbBefore <= 30), only inaccuracy applies
        if (winProbBefore <= 30) {
          return { isKeyMove: true, keyMoveReason: 'inaccuracy' };
        }

        if (winProbLoss >= 30) {
          return { isKeyMove: true, keyMoveReason: 'blunder' };
        }
        if (winProbLoss >= 20) {
          return { isKeyMove: true, keyMoveReason: 'mistake' };
        }
        return { isKeyMove: true, keyMoveReason: 'inaccuracy' };
      }
    }

    return { isKeyMove: false };
  },

  /**
   * Get review status for a game
   */
  getReviewStatus(gameId: string, statuses: GameReviewStatus[]): GameReviewStatus | null {
    return statuses.find(s => s.gameId === gameId) || null;
  },

  /**
   * Create review status after completing a review
   */
  createReviewStatus(session: GameReviewSession): GameReviewStatus {
    return {
      gameId: session.gameId,
      reviewed: true,
      lastReviewDate: new Date(),
      keyMovesCount: session.keyMoveIndices.length,
      followedRepertoire: session.followedRepertoire,
    };
  },
};
