/**
 * LineExtractor - opponentBranchingOnly flag tests
 *
 * When opponentBranchingOnly=true, variations at user-move positions are skipped.
 * Variations at opponent-move positions still create separate lines.
 */

import { LineExtractor } from '../LineExtractor';
import { buildMoveTreeWithVariations, buildMoveTreeFromMoves } from '../../gameReview/__tests__/testHelpers';

const REP_ID = 'rep1';
const CH_ID = 'ch1';

function extractLines(
  lines: string[][],
  color: 'white' | 'black',
  flag: boolean
) {
  const tree = buildMoveTreeWithVariations(lines).toJSON();
  return LineExtractor.extractLines(tree, REP_ID, CH_ID, color, undefined, flag);
}

function extractSingle(
  moves: string[],
  color: 'white' | 'black',
  flag: boolean
) {
  const tree = buildMoveTreeFromMoves(moves).toJSON();
  return LineExtractor.extractLines(tree, REP_ID, CH_ID, color, undefined, flag);
}

// ─── White repertoire, flag ON ───────────────────────────────────────────────

describe('opponentBranchingOnly=true, white repertoire', () => {
  it('skips white (user) alternatives: 1.e4 (1.d4) → only 1 line', () => {
    // Tree: 1.e4 e5 2.Nf3  with variation 1.d4
    // White plays 1.e4 (user move) — d4 is a user-move variation → skipped
    const result = extractLines(
      [
        ['e4', 'e5', 'Nf3'],
        ['d4', 'e5', 'Nf3'],
      ],
      'white',
      true
    );
    expect(result).toHaveLength(1);
    expect(result[0].moves[0].san).toBe('e4');
  });

  it('keeps black (opponent) alternatives: 1.e4 e5 (1...c5) → 2 lines', () => {
    // Tree: 1.e4 e5 2.Nf3  with variation 1...c5
    // Black plays e5/c5 (opponent move) → both branches kept
    const result = extractLines(
      [
        ['e4', 'e5', 'Nf3'],
        ['e4', 'c5', 'Nf3'],
      ],
      'white',
      true
    );
    expect(result).toHaveLength(2);
  });

  it('skips white variations mid-line but keeps opponent branches', () => {
    // Tree: 1.e4 e5 2.Nf3 (2.Bc4) Nc6 (Nf6)
    // White variations at move 2 → skipped; black variations at move 2 response → kept
    const result = extractLines(
      [
        ['e4', 'e5', 'Nf3', 'Nc6'],
        ['e4', 'e5', 'Nf3', 'Nf6'],
        ['e4', 'e5', 'Bc4', 'Nc6'],  // white variation at move 2 → skipped
      ],
      'white',
      true
    );
    // Bc4 branch is skipped, Nf3-Nc6 and Nf3-Nf6 are kept
    expect(result).toHaveLength(2);
    const sans = result.map(l => l.moves.map(m => m.san).join(' '));
    expect(sans.some(s => s.includes('Bc4'))).toBe(false);
  });
});

// ─── Black repertoire, flag ON ───────────────────────────────────────────────

describe('opponentBranchingOnly=true, black repertoire', () => {
  it('skips black (user) alternatives, keeps white (opponent) branches', () => {
    // Tree: 1.e4 e5 (1...c5) 2.Nf3
    // Black plays e5/c5 (user moves for black repertoire) — c5 is skipped
    // White 1.e4 is the opponent move — kept
    const result = extractLines(
      [
        ['e4', 'e5', 'Nf3'],
        ['e4', 'c5', 'Nf3'],  // black variation → skipped
      ],
      'black',
      true
    );
    expect(result).toHaveLength(1);
    expect(result[0].moves[1].san).toBe('e5');
  });

  it('creates multiple lines for white (opponent) alternatives', () => {
    // Tree: 1.e4 e5 2.Nf3 (2.Bc4) — white has 2 alternatives
    // Both kept because they are opponent moves for black
    const result = extractLines(
      [
        ['e4', 'e5', 'Nf3'],
        ['e4', 'e5', 'Bc4'],
      ],
      'black',
      true
    );
    expect(result).toHaveLength(2);
  });
});

// ─── Flag OFF (default behavior) ─────────────────────────────────────────────

describe('opponentBranchingOnly=false (default behavior)', () => {
  it('extracts all branches regardless of move color', () => {
    const result = extractLines(
      [
        ['e4', 'e5', 'Nf3'],
        ['d4', 'e5', 'Nf3'],
        ['e4', 'c5', 'Nf3'],
      ],
      'white',
      false
    );
    // 3 lines: e4+e5+Nf3, d4+e5+Nf3, e4+c5+Nf3
    expect(result).toHaveLength(3);
  });

  it('matches extractLines with no flag argument (backward compat)', () => {
    const tree = buildMoveTreeWithVariations([
      ['e4', 'e5', 'Nf3'],
      ['d4', 'e5', 'Nf3'],
    ]).toJSON();
    const withFlag = LineExtractor.extractLines(tree, REP_ID, CH_ID, 'white', undefined, false);
    const noFlag = LineExtractor.extractLines(tree, REP_ID, CH_ID, 'white');
    expect(withFlag).toHaveLength(noFlag.length);
  });
});

// ─── Single-line tree ─────────────────────────────────────────────────────────

describe('single-line tree', () => {
  it('returns 1 line regardless of flag', () => {
    const withFlag = extractSingle(['e4', 'e5', 'Nf3', 'Nc6'], 'white', true);
    const noFlag = extractSingle(['e4', 'e5', 'Nf3', 'Nc6'], 'white', false);
    expect(withFlag).toHaveLength(1);
    expect(noFlag).toHaveLength(1);
  });
});

// ─── 3 opponent alternatives → 3 lines ───────────────────────────────────────

describe('3 opponent alternatives', () => {
  it('creates 3 lines when opponent has 3 responses', () => {
    // White repertoire: 1.e4, black responds with e5, c5, or e6
    const result = extractLines(
      [
        ['e4', 'e5', 'Nf3'],
        ['e4', 'c5', 'Nf3'],
        ['e4', 'e6', 'Nf3'],
      ],
      'white',
      true
    );
    expect(result).toHaveLength(3);
  });
});
