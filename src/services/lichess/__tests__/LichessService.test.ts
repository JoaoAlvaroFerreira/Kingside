import { LichessService } from '../LichessService';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function ndjsonResponse(games: object[]): Response {
  const body = games.map(g => JSON.stringify(g)).join('\n');
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeLichessGame(id: string, pgn: string) {
  return {
    id,
    rated: true,
    variant: 'standard',
    speed: 'rapid',
    perf: 'rapid',
    createdAt: Date.now(),
    lastMoveAt: Date.now(),
    status: 'mate',
    players: {
      white: { user: { name: 'player1' }, rating: 2000 },
      black: { user: { name: 'player2' }, rating: 1900 },
    },
    pgn,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LichessService', () => {
  describe('URL construction', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(ndjsonResponse([]));
    });

    it('includes max and evals=true in the URL', async () => {
      await LichessService.fetchUserGames('testuser', 25);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('max=25');
      expect(url).toContain('evals=true');
      expect(url).toContain('pgnInJson=true');
      expect(url).toContain('opening=true');
      expect(url).not.toContain('since=');
    });

    it('appends since param when sinceDaysBack > 0', async () => {
      const before = Date.now();
      await LichessService.fetchUserGames('testuser', 50, 7);
      const after = Date.now();

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('evals=true');

      const sinceMatch = url.match(/since=(\d+)/);
      expect(sinceMatch).not.toBeNull();

      const sinceValue = parseInt(sinceMatch![1], 10);
      const expectedMin = before - 7 * 86400 * 1000;
      const expectedMax = after - 7 * 86400 * 1000;
      expect(sinceValue).toBeGreaterThanOrEqual(expectedMin);
      expect(sinceValue).toBeLessThanOrEqual(expectedMax);
    });

    it('does NOT append since param when sinceDaysBack is 0', async () => {
      await LichessService.fetchUserGames('testuser', 50, 0);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).not.toContain('since=');
    });

    it('does NOT append since param when sinceDaysBack is undefined', async () => {
      await LichessService.fetchUserGames('testuser', 50);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).not.toContain('since=');
    });

    it('uses default max of 50 when not specified', async () => {
      await LichessService.fetchUserGames('testuser');
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('max=50');
    });
  });

  describe('evals=true always present', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(ndjsonResponse([]));
    });

    it('includes evals=true with no optional params', async () => {
      await LichessService.fetchUserGames('user1');
      expect(mockFetch.mock.calls[0][0]).toContain('evals=true');
    });

    it('includes evals=true with sinceDaysBack', async () => {
      await LichessService.fetchUserGames('user1', 100, 30);
      expect(mockFetch.mock.calls[0][0]).toContain('evals=true');
    });
  });

  describe('since calculation', () => {
    it('computes since as approximately Date.now() - days * 86400000', async () => {
      mockFetch.mockResolvedValue(ndjsonResponse([]));

      const nowBefore = Date.now();
      await LichessService.fetchUserGames('user1', 50, 7);
      const nowAfter = Date.now();

      const url = mockFetch.mock.calls[0][0] as string;
      const sinceValue = parseInt(url.match(/since=(\d+)/)![1], 10);

      const expectedApprox = (nowBefore + nowAfter) / 2 - 7 * 86400000;
      // Within 5 seconds tolerance
      expect(Math.abs(sinceValue - expectedApprox)).toBeLessThan(5000);
    });
  });

  describe('NDJSON parsing', () => {
    it('parses valid NDJSON with 3 games and returns 3 PGN strings', async () => {
      const games = [
        makeLichessGame('g1', '1. e4 e5 2. Nf3 Nc6 *'),
        makeLichessGame('g2', '1. d4 d5 2. c4 e6 *'),
        makeLichessGame('g3', '1. e4 c5 2. Nf3 d6 *'),
      ];
      mockFetch.mockResolvedValue(ndjsonResponse(games));

      const result = await LichessService.fetchUserGames('testuser');
      expect(result).toHaveLength(3);
      expect(result[0]).toBe('1. e4 e5 2. Nf3 Nc6 *');
      expect(result[1]).toBe('1. d4 d5 2. c4 e6 *');
      expect(result[2]).toBe('1. e4 c5 2. Nf3 d6 *');
    });
  });

  describe('empty response', () => {
    it('returns empty array for empty response body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      } as unknown as Response);

      const result = await LichessService.fetchUserGames('emptyuser');
      expect(result).toEqual([]);
    });

    it('returns empty array for whitespace-only response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('   \n  \n  '),
      } as unknown as Response);

      const result = await LichessService.fetchUserGames('emptyuser');
      expect(result).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('throws error with username for 404 response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as unknown as Response);

      await expect(LichessService.fetchUserGames('nonexistent'))
        .rejects.toThrow('User "nonexistent" not found on Lichess');
    });

    it('throws error with status code for non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as unknown as Response);

      await expect(LichessService.fetchUserGames('ratelimited'))
        .rejects.toThrow('Lichess API error: 429 Too Many Requests');
    });
  });

  describe('malformed JSON line', () => {
    it('skips malformed lines and returns valid ones', async () => {
      const validGame = makeLichessGame('g1', '1. e4 e5 *');
      const body = [
        JSON.stringify(validGame),
        'this is not valid json {{{',
        JSON.stringify(makeLichessGame('g2', '1. d4 d5 *')),
      ].join('\n');

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(body),
      } as unknown as Response);

      const result = await LichessService.fetchUserGames('testuser');
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('1. e4 e5 *');
      expect(result[1]).toBe('1. d4 d5 *');
    });
  });

  describe('fetchMasterGames', () => {
    it('delegates to fetchUserGames with same params', async () => {
      const spy = jest.spyOn(LichessService, 'fetchUserGames');
      mockFetch.mockResolvedValue(ndjsonResponse([]));

      await LichessService.fetchMasterGames('masterplayer', 100, 14);

      expect(spy).toHaveBeenCalledWith('masterplayer', 100, 14);
      spy.mockRestore();
    });
  });

  describe('request headers', () => {
    it('sends Accept: application/x-ndjson header', async () => {
      mockFetch.mockResolvedValue(ndjsonResponse([]));
      await LichessService.fetchUserGames('testuser');

      const options = mockFetch.mock.calls[0][1] as RequestInit;
      expect(options.headers).toEqual({ Accept: 'application/x-ndjson' });
    });
  });
});
