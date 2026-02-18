/**
 * Tests for FEN-based repertoire matching with transposition detection
 */

import { Chess } from 'chess.js';
import { GameReviewService } from '../GameReviewService';
import { normalizeFen } from '@types';
import {
  buildMoveTreeFromMoves,
  createTestRepertoire,
} from './testHelpers';

describe('GameReviewService - Transposition Detection', () => {
  describe('extractPositionsFromChapter', () => {
    it('should extract starting position with root moves', () => {
      const moveTree = buildMoveTreeFromMoves(['e4', 'e5', 'Nf3']);
      const chapter = {
        id: 'test',
        name: 'Test',
        pgn: 'e4 e5 Nf3',
        moveTree: moveTree.toJSON(),
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const positionsByMoveCount = GameReviewService.extractPositionsFromChapter(chapter);

      // Check starting position (move 0)
      const startingFen = normalizeFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      const positionsAtMove0 = positionsByMoveCount.get(0);
      expect(positionsAtMove0).toBeDefined();

      const startingMoves = positionsAtMove0?.get(startingFen);
      expect(startingMoves).toBeDefined();
      expect(startingMoves?.has('e4')).toBe(true);
    });

    it('should extract positions indexed by move count', () => {
      const moveTree = buildMoveTreeFromMoves(['e4', 'e5', 'Nf3']);
      const chapter = {
        id: 'test',
        name: 'Test',
        pgn: 'e4 e5 Nf3',
        moveTree: moveTree.toJSON(),
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const positionsByMoveCount = GameReviewService.extractPositionsFromChapter(chapter);

      // Should have positions at move 0, 1, and 2
      expect(positionsByMoveCount.has(0)).toBe(true); // Starting position
      expect(positionsByMoveCount.has(1)).toBe(true); // After e4
      expect(positionsByMoveCount.has(2)).toBe(true); // After e4 e5
    });

    it('should extract positions with multiple variations', () => {
      const moveTree = buildMoveTreeFromMoves(['e4', 'e5', 'Nf3']);
      // Add variation: after e4 e5, play Bc4 instead of Nf3
      moveTree.goToStart();
      moveTree.addMove('e4');
      moveTree.addMove('e5');
      moveTree.addMove('Bc4');

      const chapter = {
        id: 'test',
        name: 'Test',
        pgn: 'e4 e5 (Nf3 | Bc4)',
        moveTree: moveTree.toJSON(),
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const positionsByMoveCount = GameReviewService.extractPositionsFromChapter(chapter);

      // After 1. e4 e5 (move count 2), there should be a position that includes both Nf3 and Bc4
      const chess = new Chess();
      chess.move('e4');
      chess.move('e5');
      const afterE4E5Fen = normalizeFen(chess.fen());

      const positionsAtMove2 = positionsByMoveCount.get(2);
      expect(positionsAtMove2).toBeDefined();

      const movesAtPosition = positionsAtMove2?.get(afterE4E5Fen);
      expect(movesAtPosition).toBeDefined();
      expect(movesAtPosition?.has('Nf3')).toBe(true);
      expect(movesAtPosition?.has('Bc4')).toBe(true);
    });
  });

  describe('buildRepertoirePositionMap', () => {
    it('should only include repertoires matching userColor', () => {
      const whiteRepertoire = createTestRepertoire('White Rep', 'white', [['e4', 'e5', 'Nf3']]);
      const blackRepertoire = createTestRepertoire('Black Rep', 'black', [['e4', 'e5', 'Nf3', 'Nc6']]);

      const positionMap = GameReviewService.buildRepertoirePositionMap(
        [whiteRepertoire, blackRepertoire],
        'white'
      );

      // Should include white's move (e4) at starting position (move count 0)
      const startingFen = normalizeFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      const positionsAtMove0 = positionMap.get(0);
      expect(positionsAtMove0).toBeDefined();

      const startingMoves = positionsAtMove0?.get(startingFen);
      expect(startingMoves?.has('e4')).toBe(true);
    });

    it('should merge moves from multiple chapters', () => {
      const repertoire = createTestRepertoire('Multi-chapter', 'white', [
        ['e4', 'e5', 'Nf3'],
        ['e4', 'e5', 'Bc4'],
      ]);

      const positionMap = GameReviewService.buildRepertoirePositionMap([repertoire], 'white');

      // After 1. e4 e5 (move count 2), should have both Nf3 and Bc4
      const chess = new Chess();
      chess.move('e4');
      chess.move('e5');
      const afterE4E5Fen = normalizeFen(chess.fen());

      const positionsAtMove2 = positionMap.get(2);
      expect(positionsAtMove2).toBeDefined();

      const movesAtPosition = positionsAtMove2?.get(afterE4E5Fen);
      expect(movesAtPosition).toBeDefined();
      expect(movesAtPosition?.has('Nf3')).toBe(true);
      expect(movesAtPosition?.has('Bc4')).toBe(true);
    });
  });

  describe('checkRepertoireMatchFEN - Basic Matching', () => {
    it('should match when move is in repertoire', () => {
      const repertoire = createTestRepertoire('Test', 'white', [['e4', 'e5', 'Nf3']]);
      const positionMap = GameReviewService.buildRepertoirePositionMap([repertoire], 'white');

      const chess = new Chess();
      const preFen = chess.fen();
      const moveCount = 0; // First move
      chess.move('e4');
      const isBlackMove = chess.turn() === 'w'; // false - white just moved

      const result = GameReviewService.checkRepertoireMatchFEN(
        preFen,
        'e4',
        moveCount,
        isBlackMove,
        'white',
        positionMap
      );

      expect(result.matched).toBe(true);
      expect(result.isUserMove).toBe(true);
      // expectedMoves now contains moves FROM the resulting position (after e4), so it should be e5
      expect(result.expectedMoves).toContain('e5');
    });

    it('should detect deviation when move not in repertoire', () => {
      const repertoire = createTestRepertoire('Test', 'white', [['e4', 'e5', 'Nf3']]);
      const positionMap = GameReviewService.buildRepertoirePositionMap([repertoire], 'white');

      const chess = new Chess();
      const preFen = chess.fen();
      const moveCount = 0;
      chess.move('d4'); // Not in repertoire
      const isBlackMove = chess.turn() === 'w';

      const result = GameReviewService.checkRepertoireMatchFEN(
        preFen,
        'd4',
        moveCount,
        isBlackMove,
        'white',
        positionMap
      );

      expect(result.matched).toBe(false);
      expect(result.isUserMove).toBe(true);
      expect(result.deviationType).toBe('user-misplay');
      expect(result.expectedMoves).toContain('e4');
    });

    it('should detect coverage gap when position not in repertoire', () => {
      const repertoire = createTestRepertoire('Test', 'white', [['e4', 'e5', 'Nf3']]);
      const positionMap = GameReviewService.buildRepertoirePositionMap([repertoire], 'white');

      // Play moves that reach a position not in repertoire
      const chess = new Chess();
      let moveCount = 0;
      chess.move('e4'); moveCount++;
      chess.move('e5'); moveCount++;
      chess.move('Nf3'); moveCount++;
      chess.move('Nc6'); moveCount++;
      chess.move('Bb5'); moveCount++; // This position not in repertoire

      const preFen = chess.fen();
      chess.move('a6');
      const isBlackMove = chess.turn() === 'w';

      const result = GameReviewService.checkRepertoireMatchFEN(
        preFen,
        'a6',
        moveCount,
        isBlackMove,
        'white',
        positionMap
      );

      expect(result.matched).toBe(false);
      expect(result.deviationType).toBe('coverage-gap');
    });
  });

  describe('checkRepertoireMatchFEN - Transposition Detection', () => {
    /**
     * Test Case 1: Simple transposition (2 moves deep)
     * Line A: 1. d4 Nf6 2. Nc3 d5
     * Line B: 1. d4 d5 2. Nc3 Nf6
     * Both reach same position after move 4, should match equally
     *
     * To test transposition: repertoire should include BOTH move orders
     * Then when we play either order, it should recognize the moves
     */
    it('should match transposed position (2-move transposition)', () => {
      // Repertoire has BOTH lines (line A and line B)
      const repertoire = createTestRepertoire('Test', 'white', [
        ['d4', 'Nf6', 'Nc3', 'd5'],
        ['d4', 'd5', 'Nc3', 'Nf6'],
      ]);
      const positionMap = GameReviewService.buildRepertoirePositionMap([repertoire], 'white');

      // Play line B and verify Nc3 is recognized after 1. d4 d5
      const chess = new Chess();
      chess.move('d4'); // moveCount 0
      chess.move('d5'); // moveCount 1
      const preFenBeforeNc3 = chess.fen();
      const moveCount = 2; // About to play move 3 (Nc3), which is moveCount 2
      chess.move('Nc3');
      const isBlackMove = chess.turn() === 'w';

      // Should match because we included line B in the repertoire
      const result = GameReviewService.checkRepertoireMatchFEN(
        preFenBeforeNc3,
        'Nc3',
        moveCount,
        isBlackMove,
        'white',
        positionMap
      );

      expect(result.matched).toBe(true);
      // After playing Nc3, the resulting position expects Nf6 next (from line B: d4 d5 Nc3 Nf6)
      expect(result.expectedMoves).toContain('Nf6');

      // Now verify the transposition: after 1. d4 Nf6 2. Nc3 d5 and 1. d4 d5 2. Nc3 Nf6
      // both reach the SAME position - test that this position is in the map
      const chessLineA = new Chess();
      chessLineA.move('d4');
      chessLineA.move('Nf6');
      chessLineA.move('Nc3');
      chessLineA.move('d5');
      const positionAFen = normalizeFen(chessLineA.fen());

      const chessLineB = new Chess();
      chessLineB.move('d4');
      chessLineB.move('d5');
      chessLineB.move('Nc3');
      chessLineB.move('Nf6');
      const positionBFen = normalizeFen(chessLineB.fen());

      // The FENs should be identical (transposition)
      expect(positionAFen).toBe(positionBFen);
    });

    /**
     * Test Case 2: Black repertoire transposition
     * As Black against 1. e4
     * Line A: 1. e4 c5 2. Nf3 d6
     * Line B: 1. e4 c5 2. Nf3 Nc6
     * Then from position after 2. Nf3 c5, play d6 or Nc6
     */
    it('should match black repertoire transposition', () => {
      // Black's repertoire with two separate chapters (easier than variations)
      const repertoire = createTestRepertoire('Sicilian', 'black', [
        ['e4', 'c5', 'Nf3', 'd6'],
        ['e4', 'c5', 'Nf3', 'Nc6'],
      ]);
      const positionMap = GameReviewService.buildRepertoirePositionMap([repertoire], 'black');

      // Play the position and check both moves are recognized
      const chess = new Chess();
      chess.move('e4'); // moveCount 0
      chess.move('c5'); // moveCount 1
      chess.move('Nf3'); // moveCount 2

      const preFen = chess.fen();
      const moveCount = 3; // About to play move 4

      // Test d6
      const chessCopy1 = new Chess(preFen);
      chessCopy1.move('d6');
      const isBlackMove1 = chessCopy1.turn() === 'w'; // true - black just moved

      const result1 = GameReviewService.checkRepertoireMatchFEN(
        preFen,
        'd6',
        moveCount,
        isBlackMove1,
        'black',
        positionMap
      );

      expect(result1.matched).toBe(true);
      expect(result1.isUserMove).toBe(true);

      // Test Nc6
      const chessCopy2 = new Chess(preFen);
      chessCopy2.move('Nc6');
      const isBlackMove2 = chessCopy2.turn() === 'w';

      const result2 = GameReviewService.checkRepertoireMatchFEN(
        preFen,
        'Nc6',
        moveCount,
        isBlackMove2,
        'black',
        positionMap
      );

      expect(result2.matched).toBe(true);
      expect(result2.isUserMove).toBe(true);
    });

    /**
     * Test Case 3: Complex transposition (King's Indian setup)
     * Can be reached via many move orders:
     * - 1. d4 Nf6 2. c4 g6 3. Nc3 Bg7
     * - 1. d4 Nf6 2. c4 g6 3. Nc3 d6 (different 3rd move for Black)
     * After 3. Nc3, position should recognize both Bg7 and d6
     */
    it('should match complex transposition with multiple options', () => {
      // Use separate chapters instead of variations for simplicity
      const repertoire = createTestRepertoire('KID', 'black', [
        ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7'],
        ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd6'],
      ]);
      const positionMap = GameReviewService.buildRepertoirePositionMap([repertoire], 'black');

      const chess = new Chess();
      chess.move('d4'); // moveCount 0
      chess.move('Nf6'); // moveCount 1
      chess.move('c4'); // moveCount 2
      chess.move('g6'); // moveCount 3
      chess.move('Nc3'); // moveCount 4

      const preFen = chess.fen();
      const moveCount = 5; // About to play move 6

      // Both Bg7 and d6 should be recognized
      const chessCopy1 = new Chess(preFen);
      chessCopy1.move('Bg7');
      const isBlackMove1 = chessCopy1.turn() === 'w';

      const result1 = GameReviewService.checkRepertoireMatchFEN(
        preFen,
        'Bg7',
        moveCount,
        isBlackMove1,
        'black',
        positionMap
      );

      expect(result1.matched).toBe(true);
      // After playing Bg7, we're at the end of line 1, so expectedMoves is empty
      expect(result1.expectedMoves).toEqual([]);

      const chessCopy2 = new Chess(preFen);
      chessCopy2.move('d6');
      const isBlackMove2 = chessCopy2.turn() === 'w';

      const result2 = GameReviewService.checkRepertoireMatchFEN(
        preFen,
        'd6',
        moveCount,
        isBlackMove2,
        'black',
        positionMap
      );

      expect(result2.matched).toBe(true);
      // After playing d6, we're at the end of line 2, so expectedMoves is empty
      expect(result2.expectedMoves).toEqual([]);
    });

    /**
     * Test Case 4: Starting position matching
     * Ensure root moves are properly detected
     */
    it('should match starting position moves', () => {
      const repertoire = createTestRepertoire('e4 repertoire', 'white', [
        ['e4', 'e5', 'Nf3'],
      ]);
      const positionMap = GameReviewService.buildRepertoirePositionMap([repertoire], 'white');

      const chess = new Chess();
      const preFen = chess.fen();
      const moveCount = 0; // First move
      chess.move('e4');
      const isBlackMove = chess.turn() === 'w';

      const result = GameReviewService.checkRepertoireMatchFEN(
        preFen,
        'e4',
        moveCount,
        isBlackMove,
        'white',
        positionMap
      );

      expect(result.matched).toBe(true);
      // After playing e4, the next move in repertoire is e5
      expect(result.expectedMoves).toContain('e5');
    });

    /**
     * Test Case 5: Multiple repertoires with transpositions
     * Two separate repertoires that can transpose into each other
     */
    it('should handle transpositions across multiple repertoires', () => {
      const repertoire1 = createTestRepertoire('London', 'white', [
        ['d4', 'Nf6', 'Bf4', 'd5'],
      ]);
      const repertoire2 = createTestRepertoire('London Alt', 'white', [
        ['d4', 'd5', 'Bf4', 'Nf6'],
      ]);

      const positionMap = GameReviewService.buildRepertoirePositionMap(
        [repertoire1, repertoire2],
        'white'
      );

      // After 1. d4 d5, Bf4 should be recognized from repertoire2
      const chess = new Chess();
      chess.move('d4'); // moveCount 0
      chess.move('d5'); // moveCount 1
      const preFen = chess.fen();
      const moveCount = 2;
      chess.move('Bf4');
      const isBlackMove = chess.turn() === 'w';

      const result = GameReviewService.checkRepertoireMatchFEN(
        preFen,
        'Bf4',
        moveCount,
        isBlackMove,
        'white',
        positionMap
      );

      expect(result.matched).toBe(true);
      // After playing Bf4, the next move in repertoire is Nf6 (from line B: d4 d5 Bf4 Nf6)
      expect(result.expectedMoves).toContain('Nf6');
    });
  });

  describe('checkRepertoireMatchFEN - User vs Opponent Moves', () => {
    it('should correctly identify user moves vs opponent moves (white)', () => {
      const repertoire = createTestRepertoire('Test', 'white', [['e4', 'e5', 'Nf3']]);
      const positionMap = GameReviewService.buildRepertoirePositionMap([repertoire], 'white');

      const chess = new Chess();

      // Move 1: e4 by white (user move)
      const preFen1 = chess.fen();
      let moveCount = 0;
      chess.move('e4');
      const isBlackMove1 = chess.turn() === 'w'; // false

      const result1 = GameReviewService.checkRepertoireMatchFEN(
        preFen1,
        'e4',
        moveCount,
        isBlackMove1,
        'white',
        positionMap
      );
      expect(result1.isUserMove).toBe(true);

      // Move 2: e5 by black (opponent move)
      const preFen2 = chess.fen();
      moveCount++;
      chess.move('e5');
      const isBlackMove2 = chess.turn() === 'w'; // true

      const result2 = GameReviewService.checkRepertoireMatchFEN(
        preFen2,
        'e5',
        moveCount,
        isBlackMove2,
        'white',
        positionMap
      );
      expect(result2.isUserMove).toBe(false);
    });

    it('should correctly identify user moves vs opponent moves (black)', () => {
      const repertoire = createTestRepertoire('Test', 'black', [['e4', 'c5', 'Nf3', 'd6']]);
      const positionMap = GameReviewService.buildRepertoirePositionMap([repertoire], 'black');

      const chess = new Chess();

      // Move 1: e4 by white (opponent move)
      const preFen1 = chess.fen();
      let moveCount = 0;
      chess.move('e4');
      const isBlackMove1 = chess.turn() === 'w'; // false

      const result1 = GameReviewService.checkRepertoireMatchFEN(
        preFen1,
        'e4',
        moveCount,
        isBlackMove1,
        'black',
        positionMap
      );
      expect(result1.isUserMove).toBe(false);

      // Move 2: c5 by black (user move)
      const preFen2 = chess.fen();
      moveCount++;
      chess.move('c5');
      const isBlackMove2 = chess.turn() === 'w'; // true

      const result2 = GameReviewService.checkRepertoireMatchFEN(
        preFen2,
        'c5',
        moveCount,
        isBlackMove2,
        'black',
        positionMap
      );
      expect(result2.isUserMove).toBe(true);
    });

    it('should mark opponent deviation as opponent-novelty', () => {
      const repertoire = createTestRepertoire('Test', 'white', [['e4', 'e5', 'Nf3', 'Nc6']]);
      const positionMap = GameReviewService.buildRepertoirePositionMap([repertoire], 'white');

      const chess = new Chess();
      chess.move('e4'); // moveCount 0
      const preFen = chess.fen();
      const moveCount = 1; // About to play Black's first move
      chess.move('c5'); // Opponent plays Sicilian instead of e5
      const isBlackMove = chess.turn() === 'w';

      const result = GameReviewService.checkRepertoireMatchFEN(
        preFen,
        'c5',
        moveCount,
        isBlackMove,
        'white',
        positionMap
      );

      expect(result.matched).toBe(false);
      expect(result.isUserMove).toBe(false);
      expect(result.deviationType).toBe('opponent-novelty');
    });

    it('should mark user deviation as user-misplay', () => {
      const repertoire = createTestRepertoire('Test', 'white', [['e4', 'e5', 'Nf3']]);
      const positionMap = GameReviewService.buildRepertoirePositionMap([repertoire], 'white');

      const chess = new Chess();
      chess.move('e4'); // moveCount 0
      chess.move('e5'); // moveCount 1
      const preFen = chess.fen();
      const moveCount = 2;
      chess.move('d4'); // User plays d4 instead of Nf3
      const isBlackMove = chess.turn() === 'w';

      const result = GameReviewService.checkRepertoireMatchFEN(
        preFen,
        'd4',
        moveCount,
        isBlackMove,
        'white',
        positionMap
      );

      expect(result.matched).toBe(false);
      expect(result.isUserMove).toBe(true);
      expect(result.deviationType).toBe('user-misplay');
    });
  });

  describe('Transposition Back Detection', () => {
    /**
     * Test Case: Game deviates from repertoire then transposes back
     * Repertoire: 1. d4 d5 2. c4 e6 3. Nc3 Nf6
     * Game plays: 1. d4 d5 2. c4 c6 (DEVIATION) 3. Nc3 e6 4. Nf3 Nf6 (TRANSPOSITION BACK)
     *
     * After 4. Nf3 Nf6, we reach the same position as after 1. d4 d5 2. c4 e6 3. Nc3 Nf6
     */
    it('should detect transposition back into repertoire as a key move', () => {
      const repertoire = createTestRepertoire('Test', 'white', [
        ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'],
      ]);
      GameReviewService.buildRepertoirePositionMap([repertoire], 'white');

      // Simulate the game flow
      let wasInRepertoireLastMove = true;
      let hasAlreadyDeviated = false;

      // Move 1: d4 (in repertoire)
      let isInRepertoireNow = true;
      let result = GameReviewService.identifyKeyMove(
        undefined,
        { matched: true, isUserMove: true, expectedMoves: ['d5'] },
        { blunder: 300, mistake: 150, inaccuracy: 50 },
        hasAlreadyDeviated,
        wasInRepertoireLastMove,
        isInRepertoireNow
      );
      expect(result.isKeyMove).toBe(false);
      wasInRepertoireLastMove = isInRepertoireNow;

      // Move 2: d5 (in repertoire)
      isInRepertoireNow = true;
      result = GameReviewService.identifyKeyMove(
        undefined,
        { matched: true, isUserMove: false, expectedMoves: ['c4'] },
        { blunder: 300, mistake: 150, inaccuracy: 50 },
        hasAlreadyDeviated,
        wasInRepertoireLastMove,
        isInRepertoireNow
      );
      expect(result.isKeyMove).toBe(false);
      wasInRepertoireLastMove = isInRepertoireNow;

      // Move 3: c4 (in repertoire)
      isInRepertoireNow = true;
      result = GameReviewService.identifyKeyMove(
        undefined,
        { matched: true, isUserMove: true, expectedMoves: ['e6'] },
        { blunder: 300, mistake: 150, inaccuracy: 50 },
        hasAlreadyDeviated,
        wasInRepertoireLastMove,
        isInRepertoireNow
      );
      expect(result.isKeyMove).toBe(false);
      wasInRepertoireLastMove = isInRepertoireNow;

      // Move 4: c6 (DEVIATION - not in repertoire)
      isInRepertoireNow = false;
      result = GameReviewService.identifyKeyMove(
        undefined,
        { matched: false, isUserMove: false, deviationType: 'opponent-novelty', expectedMoves: ['e6'] },
        { blunder: 300, mistake: 150, inaccuracy: 50 },
        hasAlreadyDeviated,
        wasInRepertoireLastMove,
        isInRepertoireNow
      );
      expect(result.isKeyMove).toBe(true);
      expect(result.keyMoveReason).toBe('opponent-novelty');
      hasAlreadyDeviated = true;
      wasInRepertoireLastMove = isInRepertoireNow;

      // Move 5: Nc3 (still out of repertoire)
      isInRepertoireNow = false;
      result = GameReviewService.identifyKeyMove(
        undefined,
        { matched: false, isUserMove: true, deviationType: 'coverage-gap' },
        { blunder: 300, mistake: 150, inaccuracy: 50 },
        hasAlreadyDeviated,
        wasInRepertoireLastMove,
        isInRepertoireNow
      );
      expect(result.isKeyMove).toBe(false); // Not a key move (already deviated)
      wasInRepertoireLastMove = isInRepertoireNow;

      // Move 6: e6 (still out of repertoire)
      isInRepertoireNow = false;
      result = GameReviewService.identifyKeyMove(
        undefined,
        { matched: false, isUserMove: false, deviationType: 'coverage-gap' },
        { blunder: 300, mistake: 150, inaccuracy: 50 },
        hasAlreadyDeviated,
        wasInRepertoireLastMove,
        isInRepertoireNow
      );
      expect(result.isKeyMove).toBe(false);
      wasInRepertoireLastMove = isInRepertoireNow;

      // Move 7: Nf3 (still out of repertoire)
      isInRepertoireNow = false;
      result = GameReviewService.identifyKeyMove(
        undefined,
        { matched: false, isUserMove: true, deviationType: 'coverage-gap' },
        { blunder: 300, mistake: 150, inaccuracy: 50 },
        hasAlreadyDeviated,
        wasInRepertoireLastMove,
        isInRepertoireNow
      );
      expect(result.isKeyMove).toBe(false);
      wasInRepertoireLastMove = isInRepertoireNow;

      // Move 8: Nf6 (TRANSPOSITION BACK - now in repertoire!)
      isInRepertoireNow = true;
      result = GameReviewService.identifyKeyMove(
        undefined,
        { matched: true, isUserMove: false, expectedMoves: [] }, // End of line
        { blunder: 300, mistake: 150, inaccuracy: 50 },
        hasAlreadyDeviated,
        wasInRepertoireLastMove,
        isInRepertoireNow
      );
      expect(result.isKeyMove).toBe(true);
      expect(result.keyMoveReason).toBe('transposition');
    });
  });
});
