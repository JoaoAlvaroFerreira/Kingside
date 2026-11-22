import { splitByOrientation } from '../splitByOrientation';

const game = (id: string, Orientation?: string) => ({ id, headers: (Orientation ? { Orientation } : {}) as Record<string, string> });

describe('splitByOrientation', () => {
  it('sorts chapters by their Orientation header', () => {
    const { white, black } = splitByOrientation(
      [game('a', 'white'), game('b', 'black'), game('c', 'Black')], 'white');
    expect(white.map(g => g.id)).toEqual(['a']);
    expect(black.map(g => g.id)).toEqual(['b', 'c']);
  });

  it('sends untagged games to the fallback colour', () => {
    const { white, black } = splitByOrientation([game('a'), game('b', 'white')], 'black');
    expect(black.map(g => g.id)).toEqual(['a']);
    expect(white.map(g => g.id)).toEqual(['b']);
  });
});
