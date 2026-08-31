/**
 * LichessService - Fetch games from Lichess.org API
 */

export interface LichessGame {
  id: string;
  rated: boolean;
  variant: string;
  speed: string;
  perf: string;
  createdAt: number;
  lastMoveAt: number;
  status: string;
  players: {
    white: { user: { name: string }; rating: number };
    black: { user: { name: string }; rating: number };
  };
  pgn: string;
}

class LichessServiceClass {
  private readonly BASE_URL = 'https://lichess.org/api';

  /**
   * Turn a 404 from the game-export endpoint into an accurate message.
   *
   * Lichess answers unauthenticated bursts there with a 404 and its ordinary HTML page —
   * indistinguishable by status from a genuinely missing account. The profile endpoint is
   * not throttled the same way, so it settles which happened: profile present means the
   * account is fine and we are being rate limited, and telling the user "not found" for
   * that sends them off checking a username that was correct all along.
   */
  private async explain404(username: string): Promise<Error> {
    try {
      const probe = await fetch(`${this.BASE_URL}/user/${encodeURIComponent(username)}`, {
        headers: { Accept: 'application/json' },
      });
      if (probe.ok) {
        return new Error(
          `Lichess is rate limiting this device, so "${username}"'s games could not be ` +
          'fetched right now. Wait a minute and try again.'
        );
      }
    } catch {
      // Probe itself failed — fall through to the plain message rather than guess.
    }
    return new Error(`User "${username}" not found on Lichess`);
  }

  /**
   * Fetch games for a user from Lichess
   * @param username Lichess username
   * @param max Maximum number of games to fetch (default 50)
   * @returns Array of PGN strings
   */
  async fetchUserGames(
    username: string,
    max: number = 50,
    sinceDaysBack?: number,
  ): Promise<string[]> {
    let url = `${this.BASE_URL}/games/user/${username}?max=${max}&pgnInJson=true&opening=true&evals=true`;

    if (sinceDaysBack !== undefined && sinceDaysBack > 0) {
      const since = Date.now() - sinceDaysBack * 86400 * 1000;
      url += `&since=${since}`;
    }

    console.log('[LichessService] Fetching games for:', username);

    const response = await fetch(url, {
      headers: {
        Accept: 'application/x-ndjson',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw await this.explain404(username);
      }
      if (response.status === 429) {
        throw new Error(
          'Lichess is rate limiting this device. Wait a minute and try again.'
        );
      }
      throw new Error(`Lichess API error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();

    if (!text.trim()) {
      console.warn('[LichessService] No games found for user:', username);
      return [];
    }

    // Parse NDJSON (newline-delimited JSON)
    const lines = text.trim().split('\n');
    const games: LichessGame[] = lines
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (error) {
          console.warn('[LichessService] Failed to parse line:', error);
          return null;
        }
      })
      .filter((game): game is LichessGame => game !== null);

    console.log('[LichessService] Fetched', games.length, 'games');

    // Extract PGN strings
    return games.map(game => game.pgn).filter(pgn => pgn && pgn.trim());
  }

  /**
   * Extract study ID from a Lichess study URL or raw ID
   * Accepts: full URL, URL with chapter, or bare 8-char ID
   */
  parseStudyId(input: string): string | null {
    const trimmed = input.trim();

    // Match lichess.org/study/{8-char-id} with optional chapter suffix
    const urlMatch = trimmed.match(/lichess\.org\/study\/([a-zA-Z0-9]{8})/);
    if (urlMatch) return urlMatch[1];

    // Bare 8-char alphanumeric ID
    if (/^[a-zA-Z0-9]{8}$/.test(trimmed)) return trimmed;

    return null;
  }

  /**
   * Fetch all chapters of a Lichess study as PGN
   */
  async fetchStudyPGN(studyId: string): Promise<string> {
    const url = `${this.BASE_URL}/study/${studyId}.pgn?comments=true&variations=true&clocks=true`;

    console.log('[LichessService] Fetching study:', studyId);

    const response = await fetch(url, {
      headers: { Accept: 'application/x-chess-pgn' },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Study "${studyId}" not found. Make sure the study is public.`);
      }
      if (response.status === 429) {
        throw new Error(
          'Lichess is rate limiting this device. Wait a minute and try again.'
        );
      }
      throw new Error(`Lichess API error: ${response.status} ${response.statusText}`);
    }

    const pgn = await response.text();
    if (!pgn.trim()) {
      throw new Error('Study is empty or has no chapters');
    }

    console.log('[LichessService] Fetched study PGN, length:', pgn.length);
    return pgn;
  }

  /**
   * Fetch master games (same as user games - any player can be imported as "master")
   */
  async fetchMasterGames(
    username: string,
    max: number = 50,
    sinceDaysBack?: number,
  ): Promise<string[]> {
    return this.fetchUserGames(username, max, sinceDaysBack);
  }
}

export const LichessService = new LichessServiceClass();
