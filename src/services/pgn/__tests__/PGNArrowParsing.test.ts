import { PGNService } from '../PGNService';
import { MoveTree } from '@utils/MoveTree';
import { NAG_SYMBOLS } from '@utils/nagSymbols';
import { CAL_COLORS } from '@/types/annotation.types';

const wrapPgn = (moves: string) =>
  `[Event "?"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n\n${moves} *`;

describe('PGN Arrow and Highlight Parsing', () => {
  describe('parseCommentDiag — cal (arrows)', () => {
    it('parses a single green arrow Gc1e3', () => {
      const pgn = wrapPgn('1. e4 { [%cal Gc1e3] } e5');
      const tree = PGNService.toMoveTree(PGNService.parseMultipleGames(pgn)[0]);
      tree.goForward();
      const node = tree.getCurrentNode();
      expect(node?.arrows).toHaveLength(1);
      expect(node?.arrows?.[0].color).toBe('#15781B');
      expect(node?.arrows?.[0].from).toBe('c1');
      expect(node?.arrows?.[0].to).toBe('e3');
    });

    it('parses multiple arrows with correct colors', () => {
      const pgn = wrapPgn('1. e4 { [%cal Gc1e3,Rd4f5] } e5');
      const tree = PGNService.toMoveTree(PGNService.parseMultipleGames(pgn)[0]);
      tree.goForward();
      const node = tree.getCurrentNode();
      expect(node?.arrows).toHaveLength(2);
      expect(node?.arrows?.[0].color).toBe(CAL_COLORS['G']);
      expect(node?.arrows?.[0].from).toBe('c1');
      expect(node?.arrows?.[0].to).toBe('e3');
      expect(node?.arrows?.[1].color).toBe(CAL_COLORS['R']);
      expect(node?.arrows?.[1].from).toBe('d4');
      expect(node?.arrows?.[1].to).toBe('f5');
    });

    it('falls back to green (#15781B) for unknown color codes', () => {
      // 'Z' is not in CAL_COLORS
      const pgn = wrapPgn('1. e4 { [%cal Zc1e3] } e5');
      const tree = PGNService.toMoveTree(PGNService.parseMultipleGames(pgn)[0]);
      tree.goForward();
      const node = tree.getCurrentNode();
      expect(node?.arrows).toHaveLength(1);
      expect(node?.arrows?.[0].color).toBe('#15781B');
    });

    it('parses mixed: arrow + eval', () => {
      const pgn = wrapPgn('1. e4 { [%cal Gc1e3] [%eval 0.5] } e5');
      const tree = PGNService.toMoveTree(PGNService.parseMultipleGames(pgn)[0]);
      tree.goForward();
      const node = tree.getCurrentNode();
      expect(node?.arrows).toHaveLength(1);
      expect(node?.eval).toBe(50);
    });
  });

  describe('parseCommentDiag — csl (highlights)', () => {
    it('parses square highlights with correct colors', () => {
      const pgn = wrapPgn('1. e4 { [%csl Ge4,Rd5] } e5');
      const tree = PGNService.toMoveTree(PGNService.parseMultipleGames(pgn)[0]);
      tree.goForward();
      const node = tree.getCurrentNode();
      expect(node?.highlights).toHaveLength(2);
      expect(node?.highlights?.[0].color).toBe(CAL_COLORS['G']);
      expect(node?.highlights?.[0].square).toBe('e4');
      expect(node?.highlights?.[1].color).toBe(CAL_COLORS['R']);
      expect(node?.highlights?.[1].square).toBe('d5');
    });

    it('falls back to green for unknown highlight color codes', () => {
      const pgn = wrapPgn('1. e4 { [%csl Xe4] } e5');
      const tree = PGNService.toMoveTree(PGNService.parseMultipleGames(pgn)[0]);
      tree.goForward();
      const node = tree.getCurrentNode();
      expect(node?.highlights).toHaveLength(1);
      expect(node?.highlights?.[0].color).toBe('#15781B');
    });
  });

  describe('MoveTree serialization round-trip', () => {
    it('preserves arrows and highlights through toJSON/fromJSON', () => {
      const pgn = wrapPgn('1. e4 { [%cal Gc1e3] [%csl Rd5] } e5');
      const tree = PGNService.toMoveTree(PGNService.parseMultipleGames(pgn)[0]);

      const restored = MoveTree.fromJSON(tree.toJSON());
      restored.goForward();
      const node = restored.getCurrentNode();

      expect(node?.arrows).toHaveLength(1);
      expect(node?.arrows?.[0].from).toBe('c1');
      expect(node?.arrows?.[0].to).toBe('e3');

      expect(node?.highlights).toHaveLength(1);
      expect(node?.highlights?.[0].square).toBe('d5');
      expect(node?.highlights?.[0].color).toBe(CAL_COLORS['R']);
    });
  });

  describe('NAG_SYMBOLS mapping', () => {
    it('maps standard NAG codes to symbols', () => {
      expect(NAG_SYMBOLS[1]).toBe('!');
      expect(NAG_SYMBOLS[2]).toBe('?');
      expect(NAG_SYMBOLS[3]).toBe('!!');
      expect(NAG_SYMBOLS[4]).toBe('??');
      expect(NAG_SYMBOLS[5]).toBe('!?');
      expect(NAG_SYMBOLS[6]).toBe('?!');
    });

    it('maps positional assessment NAGs', () => {
      expect(NAG_SYMBOLS[10]).toBe('=');
      expect(NAG_SYMBOLS[14]).toBe('+=');
      expect(NAG_SYMBOLS[15]).toBe('=+');
      expect(NAG_SYMBOLS[18]).toBe('+-');
      expect(NAG_SYMBOLS[19]).toBe('-+');
    });

    it('returns undefined for unknown NAG codes', () => {
      expect(NAG_SYMBOLS[999]).toBeUndefined();
    });
  });

  describe('CAL_COLORS', () => {
    it('maps color codes to expected hex values', () => {
      expect(CAL_COLORS['G']).toBe('#15781B');
      expect(CAL_COLORS['R']).toBe('#882020');
      expect(CAL_COLORS['Y']).toBe('#E6A817');
      expect(CAL_COLORS['B']).toBe('#003088');
    });
  });
});
