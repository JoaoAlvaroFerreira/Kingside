// candidateWeight is pure, but its module pulls in DatabaseService and BookService (and
// thus react-native).
jest.mock('@services/database/DatabaseService', () => ({ DatabaseService: {} }));
jest.mock('@services/books/BookService', () => ({ BookService: {} }));
jest.mock('@store', () => ({ useStore: () => false }));

import { candidateWeight, opponentMovesHere } from '@hooks/useCandidateMoves';

const c = (count: number, varDepth?: number) => ({ move: 'Nf3', count, varDepth });

describe('candidateWeight', () => {
  it('gives the most frequent main-line move full weight', () => {
    expect(candidateWeight(c(10, 0), 10)).toBe(1);
  });

  it('scales with frequency relative to the top candidate', () => {
    expect(candidateWeight(c(5, 0), 10)).toBe(0.5);
    expect(candidateWeight(c(1, 0), 4)).toBe(0.25);
  });

  it('dims sidelines so equal counts still read as ranked', () => {
    // The case the device run exposed: inside one chapter a main line and its sideline both
    // have count 1, and without dimming they rendered as identical arrows.
    const mainLine = candidateWeight(c(1, 0), 1);
    const sideline = candidateWeight(c(1, 1), 1);
    const deeper = candidateWeight(c(1, 2), 1);

    expect(mainLine).toBe(1);
    expect(sideline).toBeLessThan(mainLine);
    expect(deeper).toBeLessThan(sideline);
  });

  it('treats depth beyond 2 the same as 2 rather than fading to nothing', () => {
    expect(candidateWeight(c(1, 5), 1)).toBe(candidateWeight(c(1, 2), 1));
  });

  it('leaves game candidates undimmed — they have no main line', () => {
    expect(candidateWeight(c(7, undefined), 7)).toBe(1);
  });

  it('stays within [0,1] and survives a zero max count', () => {
    expect(candidateWeight(c(0, 0), 0)).toBe(1);
    expect(candidateWeight(c(99, 0), 1)).toBe(1);
  });
});

const WHITE_TO_MOVE = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BLACK_TO_MOVE = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

describe('opponentMovesHere', () => {
  it('has them to move only on their own plies', () => {
    expect(opponentMovesHere(BLACK_TO_MOVE, 'b')).toBe(true);
    expect(opponentMovesHere(WHITE_TO_MOVE, 'b')).toBe(false);
    expect(opponentMovesHere(WHITE_TO_MOVE, 'w')).toBe(true);
    expect(opponentMovesHere(BLACK_TO_MOVE, 'w')).toBe(false);
  });

  it('treats every ply as theirs when no colour was chosen', () => {
    // The alternating arrows this exists to stop: with both colours in one book, every
    // other ply showed their play as the colour you are not preparing against.
    expect(opponentMovesHere(WHITE_TO_MOVE)).toBe(true);
    expect(opponentMovesHere(BLACK_TO_MOVE)).toBe(true);
  });
});
