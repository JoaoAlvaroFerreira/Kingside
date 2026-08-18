import { Chess } from 'chess.js';
import { PIECE_SVGS } from '../pieceAssets';

const getPieceKey = (color: string, type: string): string => `${color}${type.toUpperCase()}`;

describe('PIECE_SVGS', () => {
  it('covers every piece chess.js can put on a board', () => {
    const seen = new Set<string>();
    // Promotions aside, the starting position contains all six types in both colors.
    for (const row of new Chess().board()) {
      for (const square of row) {
        if (square) seen.add(getPieceKey(square.color, square.type));
      }
    }

    expect(seen.size).toBe(12);
    for (const key of seen) {
      expect(PIECE_SVGS[key]).toBeTruthy();
    }
  });

  // The board used to load pieces from lichess's CDN via <SvgUri>, which left a
  // blank square until each request resolved and rendered nothing at all offline.
  it('references no remote assets', () => {
    for (const [key, xml] of Object.entries(PIECE_SVGS)) {
      expect(xml).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
      expect(xml).not.toMatch(/xlink:href|<image/);
      expect(key).toBeTruthy();
    }
  });

  it('holds self-contained, uniformly scaled SVG markup', () => {
    for (const xml of Object.values(PIECE_SVGS)) {
      expect(xml.startsWith('<svg')).toBe(true);
      expect(xml.endsWith('</svg>')).toBe(true);
      // A shared viewBox is what lets one `size` prop scale every piece alike.
      expect(xml).toContain('viewBox="0 0 45 45"');
      expect(xml).not.toMatch(/<style|<script/);
    }
  });
});
