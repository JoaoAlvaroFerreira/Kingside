import { OpeningClassifier } from '../OpeningClassifier';

const makeGame = (moves: string[], eco?: string, fen?: string) => ({
  headers: {
    ...(eco ? { ECO: eco } : {}),
    ...(fen ? { FEN: fen } : {}),
    White: '?',
    Black: '?',
    Result: '*',
  },
  moves: [],
  _testMoves: moves,
});

const extractMoves = (g: any) => g._testMoves as string[];
const getEco = (g: any) => g.headers.ECO as string | undefined;

describe('OpeningClassifier', () => {
  describe('classify', () => {
    it('detects e4 opening', () => {
      expect(OpeningClassifier.classify(['e4', 'e5']).openingType).toBe('e4');
    });

    it('detects d4 opening', () => {
      expect(OpeningClassifier.classify(['d4', 'Nf6']).openingType).toBe('d4');
    });

    it('classifies Nf3 as irregular', () => {
      expect(OpeningClassifier.classify(['Nf3', 'd5']).openingType).toBe('irregular');
    });

    it('classifies empty moves as irregular', () => {
      expect(OpeningClassifier.classify([]).openingType).toBe('irregular');
    });
  });

  describe('classifyRepertoire', () => {
    it('uses majority vote across games', () => {
      const games = [
        makeGame(['d4', 'Nf6']),
        makeGame(['d4', 'd5']),
        makeGame(['d4', 'Nf6']),
        makeGame(['c4', 'e5']), // irregular minority
      ];
      const result = OpeningClassifier.classifyRepertoire(games, extractMoves, getEco);
      expect(result.openingType).toBe('d4');
    });

    it('skips custom-FEN games when standard games exist', () => {
      const games = [
        makeGame(['e4', 'e5']),
        makeGame(['e4', 'c5']),
        // Custom FEN chapter — moves start mid-game, would be "irregular"
        makeGame(['Nf6'], undefined, 'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 2'),
      ];
      const result = OpeningClassifier.classifyRepertoire(games, extractMoves, getEco);
      expect(result.openingType).toBe('e4');
    });

    it('falls back to FEN-based detection when all games have custom FEN', () => {
      const d4Fen = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1';
      const games = [
        makeGame(['Nf6'], undefined, d4Fen),
        makeGame(['d5'], undefined, d4Fen),
      ];
      const result = OpeningClassifier.classifyRepertoire(games, extractMoves, getEco);
      expect(result.openingType).toBe('d4');
    });

    it('detects e4 from FEN with pawn on e4', () => {
      const e4Fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      const games = [
        makeGame(['e5'], undefined, e4Fen),
      ];
      const result = OpeningClassifier.classifyRepertoire(games, extractMoves, getEco);
      expect(result.openingType).toBe('e4');
    });

    it('returns irregular for empty games list', () => {
      const result = OpeningClassifier.classifyRepertoire([], extractMoves, getEco);
      expect(result.openingType).toBe('irregular');
    });

    it('handles KID-style repertoire (mostly d4, some c4/Nf3 chapters)', () => {
      const games = [
        makeGame(['d4', 'Nf6']),
        makeGame(['d4', 'Nf6']),
        makeGame(['d4', 'Nf6']),
        makeGame(['d4', 'Nf6']),
        makeGame(['d4', 'Nf6']),
        makeGame(['c4', 'g6']),  // English transposition
        makeGame(['Nf3', 'Nf6']), // Reti transposition
      ];
      const result = OpeningClassifier.classifyRepertoire(games, extractMoves, getEco);
      expect(result.openingType).toBe('d4');
    });
  });
});
