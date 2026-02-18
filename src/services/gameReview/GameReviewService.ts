/**
 * GameReviewService - Orchestrates game analysis and repertoire matching
 *
 * REPERTOIRE MATCHING APPROACH:
 * - Uses FEN-based position matching (not move sequence matching)
 * - Builds position map from MoveTree at review start: Map<FEN, Set<possibleMoves>>
 * - Automatically handles transpositions (different move orders to same position)
 * - Aggregates moves from ALL chapters covering a position
 * - O(1) lookup per move during review
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
  EvalThresholds,
} from '@types';
import { EngineAnalyzer, AnalysisOptions } from '@services/engine/EngineAnalyzer';
import { normalizeFen } from '@types';
import { MoveTree } from '@utils/MoveTree';

export const GameReviewService = {
  /**
   * Start a review session for a game
   */
  async startReview(
    game: UserGame,
    userColor: 'white' | 'black',
    repertoires: Repertoire[],
    masterGames: MasterGame[],
    thresholds: EvalThresholds,
    analyzer?: EngineAnalyzer,
    analysisOptions?: AnalysisOptions,
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

      // Valid chess move patterns:
      // - Piece moves: Nf3, Bb5, Qd4, Rf1, Kg1
      // - Pawn moves: e4, d5, a3, h8
      // - Captures: Nxf3, exd5, Bxc6, axb5
      // - Castle: O-O, O-O-O (or 0-0, 0-0-0)
      // - Promotions: e8=Q, a1=N, exd8=Q
      // - With check/mate: Nf3+, Qh7#, e4+, Rxh7#

      const chessMove = /^([NBRQK])?[a-h]?[1-8]?x?[a-h][1-8](=[NBRQ])?[+#]?$|^O-O(-O)?[+#]?$/i;
      return chessMove.test(str);
    };

    // Extract only the moves section from PGN (after headers, before result)
    let pgnMovesText = game.pgn;

    // Remove all header lines (anything in square brackets on its own line)
    pgnMovesText = pgnMovesText.replace(/^\[.*?\]$/gm, '');

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
      // Split by whitespace to get individual moves
      const movesInSection = section.trim().split(/\s+/).filter(m => m.trim());

      for (const move of movesInSection) {
        // Clean up move (remove annotations and extra characters)
        const cleanMove = move
          .replace(/[!?]+$/, '')        // Remove ! and ? annotations
          .replace(/\(.*?\)/g, '')       // Remove parenthetical variations
          .replace(/\[.*?\]/g, '')       // Remove any remaining brackets
          .replace(/[",]/g, '')          // Remove quotes and commas
          .trim();

        // Only include if it looks like a chess move
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
        // Stop processing this game if we hit an invalid move
        break;
      }
    }

    if (positions.length <= 1) {
      throw new Error('Failed to parse game moves');
    }

    // Get engine evaluations for all positions (if analyzer is provided)
    console.log(`Analyzing ${positions.length} positions...`);
    const evaluations: Array<EngineEvaluation | null> = new Array(positions.length).fill(null);
    if (analyzer && analysisOptions) {
      for (let i = 0; i < positions.length; i++) {
        try {
          evaluations[i] = await analyzer.analyze(positions[i], analysisOptions);
        } catch {
          evaluations[i] = null;
        }
      }
    }
    const hasEngineAnalysis = evaluations.some(e => e !== null);
    console.log(`Received ${evaluations.length} evaluations (${hasEngineAnalysis ? 'engine active' : 'engine disabled'})`);

    // Rebuild game and analyze each move
    chess.load(positions[0]);
    let moveIndex = 0;
    let hasEverDeviated = false; // Track if we've ever deviated (for "only mark first deviation" logic)
    let wasInRepertoireLastMove = true; // Track if we were in repertoire on the previous move

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
      // Only calculate evalDelta if both evaluations exist (engine is configured)
      const evalDelta = evalAfter && evalBefore ? this.calculateEvalDelta(evalBefore, evalAfter) : undefined;

      // Determine if this was Black's move (after move(), chess.turn() shows NEXT player)
      const isBlackMove = chess.turn() === 'w'; // If it's now White's turn, Black just moved

      console.log(`\n[GameReview] === Processing move ${moveIndex + 1}/${flatMoves.length}: ${san} ===`);

      // Check repertoire match using FEN-based position matching with move-count filtering (handles transpositions)
      const repertoireMatch = this.checkRepertoireMatchFEN(
        preFen,
        san,
        moveIndex,  // Pass ply count (0-indexed)
        isBlackMove,
        userColor,
        positionMap
      );

      // Determine if we're currently in repertoire
      const isInRepertoireNow = repertoireMatch?.matched ?? false;

      // Find master game references
      const masterGameRefs = this.findMasterGames(preFen, san, masterGames);

      // Determine if this is a key move
      const { isKeyMove, keyMoveReason } = this.identifyKeyMove(
        evalDelta,
        repertoireMatch,
        thresholds,
        hasEverDeviated,
        wasInRepertoireLastMove,
        isInRepertoireNow
      );

      // Update tracking state
      if (repertoireMatch && !repertoireMatch.matched && !hasEverDeviated) {
        hasEverDeviated = true;
      }
      wasInRepertoireLastMove = isInRepertoireNow;

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
      });

      moveIndex++;
    }

    if (moves.length === 0) {
      throw new Error('Failed to analyze game moves. Check engine configuration.');
    }

    // Find key move indices
    const keyMoveIndices = moves
      .map((m, i) => (m.isKeyMove ? i : -1))
      .filter(i => i !== -1);

    // Check if entire game followed repertoire
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
    // If either position is mate, handle specially
    if (before.mate !== undefined) {
      return before.mate > 0 ? -10000 : 10000;
    }
    if (after.mate !== undefined) {
      return after.mate > 0 ? 10000 : -10000;
    }

    // Normal centipawn delta
    return after.score - before.score;
  },

  /**
   * Extract all positions from a chapter by playing through its PGN linearly
   * Returns positions indexed by move count for efficient transposition detection
   *
   * Structure: Map<moveCount, Map<normalizedFEN, Set<possibleMoves>>>
   *
   * This approach:
   * - Plays through ALL variations in the chapter as separate lines
   * - Records each position with its ply count (half-move number)
   * - Enables transposition detection by comparing positions at same move count
   * - More expensive than tree traversal, but catches all transpositions
   */
  extractPositionsFromChapter(chapter: Chapter): Map<number, Map<string, Set<string>>> {
    const positionsByMoveCount = new Map<number, Map<string, Set<string>>>();

    // Helper to add a position at a specific move count
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

    // Reconstruct MoveTree and extract all possible lines
    const moveTree = MoveTree.fromJSON(chapter.moveTree);
    const allLines: string[][] = [];

    // Recursively extract all lines from the tree
    const extractLines = (node: any, currentLine: string[]) => {
      if (!node) return;

      const lineWithThisMove = [...currentLine, node.san];

      if (!node.children || node.children.length === 0) {
        // Leaf node - this is a complete line
        allLines.push(lineWithThisMove);
      } else {
        // Branch node - recurse into all children
        for (const child of node.children) {
          extractLines(child, lineWithThisMove);
        }
      }
    };

    // Start extraction from all root moves
    const rootMoves = moveTree.getRootMoves();
    for (const rootMove of rootMoves) {
      extractLines(rootMove, []);
    }

    console.log(`    [ExtractPositions] Found ${allLines.length} lines in chapter "${chapter.name}"`);

    // Play through each line and record positions
    for (const line of allLines) {
      const chess = new Chess();

      for (let i = 0; i < line.length; i++) {
        const preFen = chess.fen();
        const moveCount = i; // 0-indexed ply count
        const nextMove = line[i];

        // Record this position with the next move
        addPosition(moveCount, preFen, nextMove);

        // Play the move
        try {
          chess.move(nextMove);
        } catch (error) {
          console.warn(`    [ExtractPositions] Invalid move "${nextMove}" at position ${i} in chapter "${chapter.name}"`);
          break;
        }
      }

      // IMPORTANT: Also record the FINAL position (end of line) with no next moves
      // This allows us to detect when we've reached a known end-of-line position
      const finalFen = chess.fen();
      const finalMoveCount = line.length;
      // Add final position with empty move set (explicitly, not through addPosition)
      if (!positionsByMoveCount.has(finalMoveCount)) {
        positionsByMoveCount.set(finalMoveCount, new Map());
      }
      const finalPositions = positionsByMoveCount.get(finalMoveCount)!;
      const normalizedFinalFen = normalizeFen(finalFen);
      if (!finalPositions.has(normalizedFinalFen)) {
        finalPositions.set(normalizedFinalFen, new Set());
      }
      // If this position already has moves from another line, that's fine - keep them
    }

    const totalPositions = Array.from(positionsByMoveCount.values())
      .reduce((sum, map) => sum + map.size, 0);
    console.log(`    [ExtractPositions] Extracted ${totalPositions} positions across ${positionsByMoveCount.size} move counts`);

    return positionsByMoveCount;
  },

  /**
   * Build a comprehensive position map from all repertoire chapters
   * Returns positions indexed by move count for efficient transposition detection
   *
   * Structure: Map<moveCount, Map<normalizedFEN, Set<possibleMoves>>>
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

        // Merge chapter map into combined map
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
   * This handles transpositions correctly: doesn't matter how we got here, only that we reach a known position
   *
   * Key insight: Check if playing the move reaches a position in the repertoire, not if the move
   * is expected from the current position at the current ply
   */
  checkRepertoireMatchFEN(
    preFen: string,  // Position BEFORE the move was played
    movePlayed: string,  // The move that was played (SAN)
    moveCount: number,  // Ply count (0-indexed: 0=first move, 1=second move, etc.)
    isBlackMove: boolean,  // Whether this was Black's move
    userColor: 'white' | 'black',
    positionMap: Map<number, Map<string, Set<string>>>  // Pre-built map from buildRepertoirePositionMap
  ): RepertoireMatchResult {
    const isUserMove = (userColor === 'white' && !isBlackMove) || (userColor === 'black' && isBlackMove);

    console.log(`  [FEN-Match] Move ${moveCount + 1}: ${movePlayed} (${isBlackMove ? 'BLACK' : 'WHITE'})`);
    console.log('  [FEN-Match] Position before move:', normalizeFen(preFen).substring(0, 60) + '...');
    console.log('  [FEN-Match] User is playing as:', userColor.toUpperCase());
    console.log('  [FEN-Match] Is this a user move?', isUserMove);

    // Calculate the RESULTING position after playing the move
    const chess = new Chess(preFen);
    try {
      chess.move(movePlayed);
    } catch (error) {
      console.log(`  [FEN-Match] ✗ Invalid move "${movePlayed}"\n`);
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

    // First, check if resulting position exists at the expected ply (moveCount + 1)
    const positionsAtNextPly = positionMap.get(resultingMoveCount);

    if (positionsAtNextPly && positionsAtNextPly.has(resultingFen)) {
      const expectedMovesFromThisPosition = positionsAtNextPly.get(resultingFen);
      const expectedMoves = expectedMovesFromThisPosition ? Array.from(expectedMovesFromThisPosition) : [];

      console.log(`  [FEN-Match] ✓ MATCH - Resulting position found in repertoire at ply ${resultingMoveCount}`);
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

        console.log(`  [FEN-Match] ✓ MATCH - Resulting position found in repertoire at ply ${ply} (transposition!)`);
        console.log(`  [FEN-Match] Expected next moves from this position: ${expectedMoves.join(', ') || 'none (end of line)'}\n`);

        return {
          matched: true,
          expectedMoves,
          isUserMove,
        };
      }
    }

    // Resulting position not found anywhere in repertoire
    // Need to determine deviation type: was the BEFORE position in repertoire?
    const beforeFen = normalizeFen(preFen);
    let beforePositionInRepertoire = false;
    let expectedMovesFromBeforePosition: string[] = [];

    // Check if the position before this move exists in repertoire
    for (const [, positions] of positionMap) {
      if (positions.has(beforeFen)) {
        beforePositionInRepertoire = true;
        const movesSet = positions.get(beforeFen);
        expectedMovesFromBeforePosition = movesSet ? Array.from(movesSet) : [];
        break;
      }
    }

    if (beforePositionInRepertoire) {
      // We were in a known position but played a move that leads outside the repertoire
      console.log(`  [FEN-Match] ✗ DEVIATION - Before position was in repertoire, but move leads outside`);
      console.log(`  [FEN-Match] Expected moves were: ${expectedMovesFromBeforePosition.join(', ')}\n`);
      return {
        matched: false,
        expectedMoves: expectedMovesFromBeforePosition,
        isUserMove,
        deviationType: isUserMove ? 'user-misplay' : 'opponent-novelty',
      };
    } else {
      // We weren't in a known position (already off-book)
      console.log(`  [FEN-Match] ✗ COVERAGE-GAP - Before position was not in repertoire (already off-book)\n`);
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
          // Position found - record move played
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
              frequency: 0, // Will be calculated below
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

    // Update frequencies
    const total = Object.values(moveFrequency).reduce((sum, count) => sum + count, 0);
    for (const ref of references) {
      ref.frequency = total > 0 ? (moveFrequency[ref.movePlayed] || 0) / total : 0;
    }

    return references;
  },

  /**
   * Identify if a move is a key move and why
   */
  identifyKeyMove(
    evalDelta: number | undefined,
    repertoireMatch: RepertoireMatchResult,
    thresholds: EvalThresholds,
    hasAlreadyDeviated: boolean = false,
    wasInRepertoireLastMove: boolean = true,
    isInRepertoireNow: boolean = false
  ): { isKeyMove: boolean; keyMoveReason?: KeyMoveReason } {
    // Check for transposition back into repertoire
    // If we were OUT of repertoire and are now back IN, mark as transposition
    if (!wasInRepertoireLastMove && isInRepertoireNow) {
      console.log('[identifyKeyMove] Transposition back into repertoire detected!');
      return {
        isKeyMove: true,
        keyMoveReason: 'transposition',
      };
    }

    // Repertoire deviations are key moves ONLY if this is the first deviation
    // After the first deviation, all subsequent moves will naturally not be in the repertoire
    if (repertoireMatch && !repertoireMatch.matched && !hasAlreadyDeviated) {
      return {
        isKeyMove: true,
        keyMoveReason: repertoireMatch.isUserMove ? 'repertoire-deviation' : 'opponent-novelty',
      };
    }

    // Check eval-based key moves (only if engine analysis is available)
    if (evalDelta !== undefined) {
      const absLoss = Math.abs(evalDelta);

      if (evalDelta < -thresholds.blunder) {
        return { isKeyMove: true, keyMoveReason: 'blunder' };
      }

      if (evalDelta < -thresholds.mistake) {
        return { isKeyMove: true, keyMoveReason: 'mistake' };
      }

      if (evalDelta < -thresholds.inaccuracy) {
        return { isKeyMove: true, keyMoveReason: 'inaccuracy' };
      }

      // Check for brilliant moves (significant eval improvement in complex position)
      if (evalDelta > 100 && absLoss > 50) {
        return { isKeyMove: true, keyMoveReason: 'brilliant' };
      }
    }

    // If no engine analysis and no repertoire deviation, not a key move
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
