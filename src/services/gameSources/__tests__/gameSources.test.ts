jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { scanGame, splitGames, tokenizeMoves } from '../pgnScan';
import { ChessComSource } from '../ChessComSource';
import { LichessSource, monthsBetween } from '../LichessSource';
import { FetchSpec, SPEEDS } from '@types';

const spec = (over: Partial<FetchSpec> = {}): FetchSpec => ({
  source: 'chesscom',
  username: 'DanielNaroditsky',
  speeds: [...SPEEDS],
  ratedOnly: false,
  standardOnly: true,
  ...over,
});

const never = new AbortController().signal;

function mockFetch(handler: (url: string) => { status?: number; body: string }) {
  (global as any).fetch = jest.fn(async (url: string) => {
    const { status = 200, body } = handler(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    };
  });
}

describe('pgnScan', () => {
  const PGN = [
    '[Event "Live Chess"]',
    '[White "DanielNaroditsky"]',
    '[Black "nihalsarin"]',
    '[Result "0-1"]',
    '',
    '1. e4 { [%clk 0:03:00] } 1... c6 { [%clk 0:03:00] } 2. d4 $1 Nf6!? 0-1',
  ].join('\n');

  it('extracts headers and clean SAN', () => {
    const { headers, moves } = scanGame(PGN);
    expect(headers.White).toBe('DanielNaroditsky');
    expect(headers.Result).toBe('0-1');
    // Clock comments, NAGs, move numbers, suffixes and the result token all go.
    expect(moves).toEqual(['e4', 'c6', 'd4', 'Nf6']);
  });

  it('drops move numbers and result tokens but keeps real moves', () => {
    expect(tokenizeMoves('1. e4 e5 2. Nf3 Nc6 1/2-1/2')).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('splits a multi-game blob on Event lines that follow movetext', () => {
    const blob = `${PGN}\n\n${PGN.replace('nihalsarin', 'other')}`;
    const games = splitGames(blob);
    expect(games).toHaveLength(2);
    expect(games[1]).toContain('other');
  });

  it('does not split on the header block of a single game', () => {
    // Every game starts with [Event; only one that follows movetext begins a new game.
    expect(splitGames(PGN)).toHaveLength(1);
  });
});

describe('ChessComSource', () => {
  it('lists monthly archives and trims them to the spec range', async () => {
    mockFetch(() => ({
      body: JSON.stringify({
        archives: [
          'https://api.chess.com/pub/player/x/games/2024/11',
          'https://api.chess.com/pub/player/x/games/2025/01',
          'https://api.chess.com/pub/player/x/games/2025/06',
        ],
      }),
    }));

    const periods = await ChessComSource.listPeriods(
      spec({ since: new Date(Date.UTC(2025, 0, 1)) }), never
    );
    expect(periods.map(p => p.id)).toEqual(['2025-01', '2025-06']);
  });

  it('applies the filters the API cannot, and keeps the PGN', async () => {
    mockFetch(() => ({
      body: JSON.stringify({
        games: [
          { pgn: 'STANDARD', rules: 'chess', rated: true, time_class: 'blitz',
            white: { username: 'DanielNaroditsky' }, black: { username: 'x' } },
          { pgn: 'VARIANT', rules: 'chess960', rated: true, time_class: 'blitz',
            white: { username: 'DanielNaroditsky' }, black: { username: 'x' } },
          { pgn: 'UNRATED', rules: 'chess', rated: false, time_class: 'blitz',
            white: { username: 'DanielNaroditsky' }, black: { username: 'x' } },
          { pgn: 'WRONGSPEED', rules: 'chess', rated: true, time_class: 'daily',
            white: { username: 'DanielNaroditsky' }, black: { username: 'x' } },
        ],
      }),
    }));

    const pgns = await ChessComSource.fetchPeriod(
      spec({ ratedOnly: true, speeds: ['blitz'] }),
      { id: '2025-01', year: 2025, month: 1 },
      never
    );
    expect(pgns).toEqual(['STANDARD']);
  });

  it('filters by colour using the account name', async () => {
    mockFetch(() => ({
      body: JSON.stringify({
        games: [
          { pgn: 'ASWHITE', rules: 'chess', time_class: 'blitz',
            white: { username: 'DanielNaroditsky' }, black: { username: 'x' } },
          { pgn: 'ASBLACK', rules: 'chess', time_class: 'blitz',
            white: { username: 'x' }, black: { username: 'DanielNaroditsky' } },
        ],
      }),
    }));

    const pgns = await ChessComSource.fetchPeriod(
      spec({ color: 'black' }), { id: '2025-01', year: 2025, month: 1 }, never
    );
    expect(pgns).toEqual(['ASBLACK']);
  });

  it('reports a missing account rather than returning nothing', async () => {
    mockFetch(() => ({ status: 404, body: '' }));
    await expect(ChessComSource.listPeriods(spec(), never))
      .rejects.toMatchObject({ reason: 'user-not-found' });
  });
});

describe('LichessSource', () => {
  it('windows the account into months', () => {
    const periods = monthsBetween(new Date(Date.UTC(2024, 10, 5)), new Date(Date.UTC(2025, 1, 20)));
    expect(periods.map(p => p.id)).toEqual(['2024-11', '2024-12', '2025-01', '2025-02']);
  });

  it('derives the range from the profile creation date', async () => {
    mockFetch(() => ({ body: JSON.stringify({ createdAt: Date.UTC(2025, 0, 10) }) }));
    const periods = await LichessSource.listPeriods(
      spec({ source: 'lichess', until: new Date(Date.UTC(2025, 2, 1)) }), never
    );
    expect(periods.map(p => p.id)).toEqual(['2025-01', '2025-02', '2025-03']);
  });

  it('pushes the spec into the query rather than filtering locally', async () => {
    let requested = '';
    mockFetch((url) => {
      requested = url;
      return { body: '' };
    });

    await LichessSource.fetchPeriod(
      spec({ source: 'lichess', color: 'white', ratedOnly: true, speeds: ['blitz', 'rapid'] }),
      { id: '2025-01', year: 2025, month: 1 },
      never
    );

    expect(requested).toContain('color=white');
    expect(requested).toContain('rated=true');
    expect(requested).toContain('perfType=blitz%2Crapid');
    expect(requested).toContain('variant=standard');
    // The window is what keeps the response bufferable — RN fetch cannot stream one.
    expect(requested).toContain(`since=${Date.UTC(2025, 0, 1)}`);
    expect(requested).toContain(`until=${Date.UTC(2025, 1, 1) - 1}`);
  });

  it('omits perfType when every speed is wanted', async () => {
    let requested = '';
    mockFetch((url) => { requested = url; return { body: '' }; });

    await LichessSource.fetchPeriod(
      spec({ source: 'lichess' }), { id: '2025-01', year: 2025, month: 1 }, never
    );
    expect(requested).not.toContain('perfType');
  });
});
