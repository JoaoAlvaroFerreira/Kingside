// candidateWeight is pure, but its module pulls in DatabaseService (and thus react-native).
jest.mock('@services/database/DatabaseService', () => ({ DatabaseService: {} }));

import { candidateWeight } from '@hooks/useCandidateMoves';

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
